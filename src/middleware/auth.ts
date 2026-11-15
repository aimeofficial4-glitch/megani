import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users, sessions } from '../db/schema.ts';

export interface AppUser {
  id: string;
  uid: string | null;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  organization: string | null;
  role: 'free' | 'premium' | 'admin';
  status: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  preferredLanguage: string;
  preferredTheme: string;
  aiQueriesUsed: number;
  aiQueriesLimit: number;
  storageUsedMb: number;
  storageLimitMb: number;
}

export interface AuthRequest extends Request {
  currentUser?: AppUser;
}

export const SESSION_COOKIE_NAME = '2mr_session';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET || '2mr-default-session-secret-change-me';
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

export async function getOrCreateFirebaseUser(uid: string, email: string, fullName?: string, avatarUrl?: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const bootstrapEnv = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase().trim();
  const isOfficialAdmin =
    normalizedEmail === '2mr@proton.me' ||
    normalizedEmail === 'aimeofficial4@gmail.com' ||
    (Boolean(bootstrapEnv) && normalizedEmail === bootstrapEnv);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) {
    const userRow = existing[0];
    const shouldPromoteOfficial = isOfficialAdmin && userRow.role !== 'admin';
    if (!userRow.uid || shouldPromoteOfficial) {
      const updated = await db
        .update(users)
        .set({
          uid: userRow.uid || uid,
          emailVerified: true,
          role: shouldPromoteOfficial ? 'admin' : userRow.role,
          aiQueriesLimit: shouldPromoteOfficial ? 10000 : userRow.aiQueriesLimit,
          storageLimitMb: shouldPromoteOfficial ? 102400 : userRow.storageLimitMb,
          avatarUrl: userRow.avatarUrl || avatarUrl || null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userRow.id))
        .returning();
      return updated[0];
    }
    return userRow;
  }

  const inserted = await db
    .insert(users)
    .values({
      uid,
      email: normalizedEmail,
      fullName: fullName || normalizedEmail.split('@')[0],
      avatarUrl: avatarUrl || null,
      role: isOfficialAdmin ? 'admin' : 'free',
      emailVerified: true,
      aiQueriesLimit: isOfficialAdmin ? 10000 : 50,
      storageLimitMb: isOfficialAdmin ? 102400 : 1024,
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: { email: normalizedEmail, updatedAt: new Date() },
    })
    .returning();

  return inserted[0];
}

export const attachUser = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    // 1. Check Bearer Firebase ID Token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token) {
        try {
          const decoded = await adminAuth.verifyIdToken(token);
          if (decoded.email) {
            const dbUser = await getOrCreateFirebaseUser(
              decoded.uid,
              decoded.email,
              decoded.name,
              decoded.picture
            );
            if (dbUser && dbUser.status === 'active') {
              req.currentUser = mapUserRow(dbUser);
              return next();
            }
          }
        } catch {
          // Invalid bearer token; fall through to session cookie
        }
      }
    }

    // 2. Check HttpOnly session cookie
    const cookies = parseCookies(req);
    const rawSession = cookies[SESSION_COOKIE_NAME];
    if (rawSession) {
      const tokenHash = hashToken(rawSession);
      const found = await db
        .select({
          user: users,
          session: sessions,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
        .limit(1);

      if (found.length > 0 && found[0].user.status === 'active') {
        req.currentUser = mapUserRow(found[0].user);
      }
    }
  } catch (err) {
    console.error('Auth attach error:', err);
  }
  return next();
};

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
  }
  return next();
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: 'Administrator authentication required.' });
  }
  if (req.currentUser.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
  }
  return next();
};

export function mapUserRow(row: typeof users.$inferSelect): AppUser {
  return {
    id: row.id,
    uid: row.uid,
    email: row.email,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl,
    organization: row.organization,
    role: (row.role as 'free' | 'premium' | 'admin') || 'free',
    status: row.status,
    emailVerified: row.emailVerified,
    twoFactorEnabled: row.twoFactorEnabled,
    preferredLanguage: row.preferredLanguage,
    preferredTheme: row.preferredTheme,
    aiQueriesUsed: row.aiQueriesUsed,
    aiQueriesLimit: row.aiQueriesLimit,
    storageUsedMb: row.storageUsedMb,
    storageLimitMb: row.storageLimitMb,
  };
}

// Lightweight in-memory rate limiter for feedback, auth, and AI routes
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'local'}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
    }
    bucket.count += 1;
    return next();
  };
}
