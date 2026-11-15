import argon2 from 'argon2';
import crypto from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  users,
  adminAccounts,
  adminSessions,
  adminLoginLogs,
  adminSecurityEvents,
  adminAuditLogs,
  notifications,
} from '../db/schema.ts';
import { encryptSecret, decryptSecret } from './secrets.ts';
import { hashToken } from '../middleware/auth.ts';

export const AUTHORIZED_ADMIN_EMAILS = ['2mr@proton.me', 'aimeofficial4@gmail.com'];
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function isAuthorizedBootstrapAdminEmail(email: string): boolean {
  const normalized = email.toLowerCase().trim();
  const extraBootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase().trim();
  return AUTHORIZED_ADMIN_EMAILS.includes(normalized) || (Boolean(extraBootstrap) && normalized === extraBootstrap);
}

export async function hashPasswordArgon2id(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPasswordArgon2id(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// RFC 4648 Base32 & RFC 6238 TOTP for 2FA (no external dependency needed)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  let output = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateTotpAtCounter(secret: string, counter: number): string {
  const key = decodeBase32(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret: string, token: string): boolean {
  const normalized = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const currentStep = Math.floor(Date.now() / 30000);
  for (let offset = -1; offset <= 1; offset++) {
    if (generateTotpAtCounter(secret, currentStep + offset) === normalized) {
      return true;
    }
  }
  return false;
}

export async function ensureAdminAccountRecord(userId: string, email: string) {
  const normalized = email.toLowerCase().trim();
  const [existing] = await db
    .select()
    .from(adminAccounts)
    .where(eq(adminAccounts.email, normalized))
    .limit(1);

  if (existing) return existing;

  const envPwd = process.env.ADMIN_INITIAL_PASSWORD;
  const passwordHashArgon2 = envPwd ? await hashPasswordArgon2id(envPwd) : null;

  const [created] = await db
    .insert(adminAccounts)
    .values({
      userId,
      email: normalized,
      passwordHashArgon2,
      mustChangePassword: Boolean(envPwd),
      totpEnabled: false,
    })
    .returning();

  return created;
}

export async function recordAdminLoginAttempt(params: {
  adminAccountId?: string | null;
  email: string;
  authMethod: 'google_oauth' | 'argon2_password' | '2fa_totp';
  success: boolean;
  failureReason?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  await db.insert(adminLoginLogs).values({
    adminAccountId: params.adminAccountId || null,
    email: params.email,
    authMethod: params.authMethod,
    success: params.success,
    failureReason: params.failureReason || null,
    ipAddress: params.ipAddress || 'unknown',
    userAgent: params.userAgent?.slice(0, 240) || 'Browser',
  });
}

export async function recordSecurityEvent(params: {
  adminAccountId?: string | null;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  ipAddress?: string;
  notifyUserId?: string;
}) {
  await db.insert(adminSecurityEvents).values({
    adminAccountId: params.adminAccountId || null,
    eventType: params.eventType,
    severity: params.severity,
    description: params.description,
    ipAddress: params.ipAddress || 'unknown',
  });

  if (params.notifyUserId) {
    await db.insert(notifications).values({
      userId: params.notifyUserId,
      category: 'security',
      title: `Security Alert: ${params.eventType}`,
      message: params.description,
    });
  }
}

export async function recordAdminAudit(params: {
  adminAccountId?: string | null;
  actorEmail: string;
  action: string;
  targetResource: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  await db.insert(adminAuditLogs).values({
    adminAccountId: params.adminAccountId || null,
    actorEmail: params.actorEmail,
    action: params.action,
    targetResource: params.targetResource,
    targetId: params.targetId || null,
    details: params.details || {},
    ipAddress: params.ipAddress || 'unknown',
  });
}

export async function handleAdminPasswordFailure(adminAcc: typeof adminAccounts.$inferSelect, ipAddress?: string) {
  const nextAttempts = adminAcc.failedAttempts + 1;
  const shouldLock = nextAttempts >= MAX_FAILED_ATTEMPTS;
  const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;

  await db
    .update(adminAccounts)
    .set({
      failedAttempts: nextAttempts,
      lockedUntil,
      updatedAt: new Date(),
    })
    .where(eq(adminAccounts.id, adminAcc.id));

  if (shouldLock) {
    await recordSecurityEvent({
      adminAccountId: adminAcc.id,
      eventType: 'ADMIN_ACCOUNT_LOCKED',
      severity: 'critical',
      description: `Admin account ${adminAcc.email} temporarily locked for ${LOCKOUT_MINUTES} minutes after ${nextAttempts} failed login attempts.`,
      ipAddress,
      notifyUserId: adminAcc.userId,
    });
  }
}

export async function createAdminSessionRecord(params: {
  adminAccountId: string;
  userId: string;
  rawToken: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8-hour admin session expiry
  await db.insert(adminSessions).values({
    adminAccountId: params.adminAccountId,
    userId: params.userId,
    tokenHash: hashToken(params.rawToken),
    ipAddress: params.ipAddress || 'unknown',
    userAgent: params.userAgent?.slice(0, 240) || 'Browser',
    isActive: true,
    expiresAt,
  });

  await db
    .update(adminAccounts)
    .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(adminAccounts.id, params.adminAccountId));
}

export async function setupAdminTotp(adminAccountId: string, email: string) {
  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);
  await db
    .update(adminAccounts)
    .set({ totpSecretEncrypted: encrypted, updatedAt: new Date() })
    .where(eq(adminAccounts.id, adminAccountId));

  const issuer = encodeURIComponent('2MR To Master Research');
  const label = encodeURIComponent(`2MR:${email}`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
  return { secret, otpauthUrl };
}

export async function verifyAndEnableAdminTotp(adminAcc: typeof adminAccounts.$inferSelect, code: string) {
  const secret = decryptSecret(adminAcc.totpSecretEncrypted);
  if (!secret) return false;
  if (!verifyTotpCode(secret, code)) return false;

  await db
    .update(adminAccounts)
    .set({ totpEnabled: true, updatedAt: new Date() })
    .where(eq(adminAccounts.id, adminAcc.id));
  await db
    .update(users)
    .set({ twoFactorEnabled: true, updatedAt: new Date() })
    .where(eq(users.id, adminAcc.userId));
  return true;
}

export async function verifyAdminTotpChallenge(adminAcc: typeof adminAccounts.$inferSelect, code: string) {
  const secret = decryptSecret(adminAcc.totpSecretEncrypted);
  if (!secret) return false;
  return verifyTotpCode(secret, code);
}

export async function validateActiveAdminSession(rawToken: string): Promise<boolean> {
  const [sess] = await db
    .select()
    .from(adminSessions)
    .where(
      and(
        eq(adminSessions.tokenHash, hashToken(rawToken)),
        eq(adminSessions.isActive, true),
        gt(adminSessions.expiresAt, new Date())
      )
    )
    .limit(1);
  return Boolean(sess);
}
