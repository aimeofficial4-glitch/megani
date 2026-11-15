import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { eq, desc, and, or, ilike, count, sql, inArray } from 'drizzle-orm';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';

import { db } from './src/db/index.ts';
import {
  users,
  sessions,
  plans,
  subscriptions,
  payments,
  paymentEvents,
  categories,
  indexedDocuments,
  searchHistory,
  searchSources,
  researchProjects,
  researchSources,
  researchNotes,
  aiConversations,
  aiMessages,
  videos,
  videoCategories,
  videoTranscripts,
  videoSummaries,
  savedVideos,
  knowledgeMaps,
  knowledgeNodes,
  knowledgeEdges,
  collections,
  savedItems,
  adCampaigns,
  adEvents,
  advertisements,
  advertisementCampaigns,
  advertisementEvents,
  notifications,
  feedbackSubmissions,
  supportMessages,
  auditLogs,
  userPrivacyPreferences,
} from './src/db/schema.ts';
import { ensureSeeded } from './src/db/seed.ts';
import {
  attachUser,
  AuthRequest,
  requireAuth,
  requireAdmin,
  hashPassword,
  verifyPassword,
  hashToken,
  mapUserRow,
  SESSION_COOKIE_NAME,
  rateLimit,
  parseCookies,
} from './src/middleware/auth.ts';
import { runLiveMultiSourceSearch } from './src/services/searchProvider.ts';
import { discoverVerifiedSourcesWithMetrics } from './src/services/sourceDiscovery.ts';
import { orchestrateUnifiedAI, orchestrateUnifiedAIStream } from './src/services/aiOrchestrator.ts';
import { getOrSetPublicCache, getPublicCache, setPublicCache } from './src/services/cache.ts';
import { enqueueBackgroundJob } from './src/services/backgroundQueue.ts';
import { ResearchDepth } from './src/services/aiRouter.ts';
import {
  GeminiConfigError,
  ThinkingLevel,
  Type,
  generateGeminiJson,
  isGeminiConfigured,
  sanitizeGeminiError,
} from './src/services/geminiService.ts';
import {
  buildBrandSystemContext,
  buildGroundedBrandFallback,
  classifyBrandIdentityQuery,
  getOfficialBrandKnowledge,
} from './src/services/brandKnowledgeService.ts';
import { aiRoutes } from './src/routes/aiRoutes.ts';
import { videoAndSocialRoutes } from './src/routes/videoAndSocialRoutes.ts';
import { userVideoRoutes } from './src/routes/userVideoRoutes.ts';
import { getOrDefaultVideoAdSettings } from './src/services/videoAdEngine.ts';
import { notesRoutes } from './src/routes/notesRoutes.ts';
import { adminExtendedRoutes } from './src/routes/adminExtendedRoutes.ts';
import { privacyRoutes, parseConsentCookie } from './src/routes/privacyRoutes.ts';
import { sendFeedbackNotificationEmail, sendAdminReplyEmail, isSmtpConfigured } from './src/services/email.ts';
import { getMomoConfigStatus } from './src/services/momo.ts';
import {
  PaymentServiceError,
  handleMomoCallback,
  initiateMomoSubscriptionPayment,
  reconcilePendingMomoPayments,
  verifyAndSyncMomoPayment,
} from './src/services/paymentService.ts';
import {
  MomoApiError,
  getAdminMomoIntegrationOverview,
  momoAccountBalanceService,
  momoAccountHolderService,
  momoConfig,
  momoTokenService,
} from './src/services/momoThreeApis.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// Origin CSRF protection for browser-originated mutating requests (excluding provider callbacks)
app.use('/api', (req: Request, res: Response, next) => {
  if (
    req.method === 'GET' ||
    req.method === 'HEAD' ||
    req.method === 'OPTIONS' ||
    req.path === '/payments/momo/callback' ||
    req.path === '/webhooks/momo'
  ) {
    return next();
  }
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host;
    const appUrl = (process.env.APP_URL || '').trim();
    const isAllowed =
      (host && (origin === `https://${host}` || origin === `http://${host}`)) ||
      (appUrl && origin.startsWith(appUrl.replace(/\/+$/, ''))) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:');
    if (!isAllowed) {
      return res.status(403).json({ error: 'Cross-origin request blocked by CSRF policy.' });
    }
  }
  return next();
});

async function loadConversationHistory(
  conversationId: string | null | undefined,
  userId: string | null | undefined
): Promise<{ role: string; content: string }[]> {
  if (!conversationId || !userId) return [];
  try {
    const [conv] = await db
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
      .limit(1);
    if (!conv) return [];
    const recent = await db
      .select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conv.id))
      .orderBy(desc(aiMessages.createdAt))
      .limit(6);
    return recent.reverse();
  } catch {
    return [];
  }
}

// Attach authenticated user on all /api routes
app.use('/api', attachUser);
app.use('/api/ai', aiRoutes);
app.use('/api', videoAndSocialRoutes);
app.use('/api', userVideoRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/admin', adminExtendedRoutes);
app.use('/api/privacy', privacyRoutes);

function setSessionCookie(res: Response, rawToken: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

async function createSessionForUser(req: Request, res: Response, userId: string) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    userId,
    tokenHash,
    userAgent: req.headers['user-agent']?.slice(0, 250) || 'Web Browser',
    ipAddress: req.ip || 'unknown',
    expiresAt,
  });
  setSessionCookie(res, rawToken);
}

async function logAudit(
  actor: { id?: string | null; email?: string | null } | undefined,
  action: string,
  resource: string,
  details?: Record<string, unknown>
) {
  try {
    await db.insert(auditLogs).values({
      actorUserId: actor?.id || null,
      actorEmail: actor?.email || null,
      action,
      resource,
      details: details || {},
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// Subscription activation is executed atomically inside paymentService.verifyAndSyncMomoPayment

// =========================================================================
// 1. AUTHENTICATION & ACCOUNT SESSION ROUTES
// =========================================================================

app.post('/api/auth/register', rateLimit(60_000, 10), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const { fullName, email, password, organization, acceptTerms } = req.body || {};

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Full name is required (at least 2 characters).' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    if (!acceptTerms) {
      return res.status(400).json({ error: 'You must agree to the Terms of Service and Privacy Policy.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail === '2mr@proton.me') {
      return res.status(403).json({
        error: 'This email is reserved for official platform administration.',
      });
    }

    const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const [created] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        fullName: fullName.trim(),
        organization: organization?.trim() || null,
        passwordHash: hashPassword(password),
        role: 'free', // Strictly enforced server-side
        status: 'active',
        emailVerified: true,
        aiQueriesLimit: 50,
        storageLimitMb: 1024,
      })
      .returning();

    await db.insert(notifications).values({
      userId: created.id,
      category: 'system',
      title: 'Welcome to 2MR – To Master Research',
      message: 'Your Free Explorer account is active. Start searching, comparing sources, and saving knowledge.',
    });

    await createSessionForUser(req, res, created.id);
    await logAudit({ id: created.id, email: created.email }, 'USER_REGISTER', 'users', { role: 'free' });

    return res.status(201).json({ user: mapUserRow(created) });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Unable to create account right now.' });
  }
});

app.post('/api/auth/login', rateLimit(60_000, 15), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const [found] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (!found) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (found.isSynthetic || found.accountType === 'DEMO') {
      return res.status(403).json({ error: 'Synthetic demo accounts cannot sign in.' });
    }
    if (found.status !== 'active') {
      return res.status(403).json({ error: 'Your account is suspended. Contact 2mr@proton.me for assistance.' });
    }

    // Check passwordHash; for initial official admin without password set yet, check ADMIN_INITIAL_PASSWORD env var
    let valid = false;
    if (found.passwordHash) {
      valid = verifyPassword(String(password), found.passwordHash);
    } else if (
      normalizedEmail === '2mr@proton.me' &&
      process.env.ADMIN_INITIAL_PASSWORD &&
      password === process.env.ADMIN_INITIAL_PASSWORD
    ) {
      valid = true;
      await db
        .update(users)
        .set({ passwordHash: hashPassword(String(password)), updatedAt: new Date() })
        .where(eq(users.id, found.id));
    } else if (!found.passwordHash) {
      return res.status(401).json({
        error: 'This account uses Google Sign-In or needs password initialization via Forgot Password.',
      });
    }

    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await createSessionForUser(req, res, found.id);
    await logAudit({ id: found.id, email: found.email }, 'USER_LOGIN', 'sessions', { method: 'password' });

    return res.json({ user: mapUserRow(found) });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/auth/google', async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    if (!req.currentUser) {
      return res.status(401).json({ error: 'Invalid or missing Google Firebase ID token.' });
    }
    await createSessionForUser(req, res, req.currentUser.id);
    await logAudit({ id: req.currentUser.id, email: req.currentUser.email }, 'USER_LOGIN', 'sessions', {
      method: 'google_oauth',
    });
    return res.json({ user: req.currentUser });
  } catch (err) {
    console.error('Google sync error:', err);
    return res.status(500).json({ error: 'Unable to complete Google sign-in.' });
  }
});

app.post('/api/auth/logout', async (req: AuthRequest, res: Response) => {
  try {
    const cookies = parseCookies(req);
    const rawSession = cookies[SESSION_COOKIE_NAME];
    if (rawSession) {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(rawSession)));
    }
  } catch (err) {
    console.error('Logout error:', err);
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  return res.json({ success: true });
});

app.get('/api/auth/me', async (req: AuthRequest, res: Response) => {
  await ensureSeeded();
  return res.json({ user: req.currentUser || null });
});

app.post('/api/auth/forgot-password', rateLimit(60_000, 5), async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email address is required.' });
    }
    const normalized = email.toLowerCase().trim();
    const [found] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);

    if (!found || found.isSynthetic || found.accountType === 'DEMO') {
      return res.json({
        success: true,
        message: 'If an account matches this email, password reset instructions have been prepared.',
      });
    }

    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db
      .update(users)
      .set({ resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(users.id, found.id));

    await logAudit({ id: found.id, email: found.email }, 'PASSWORD_RESET_REQUESTED', 'users');

    return res.json({
      success: true,
      smtpConfigured: isSmtpConfigured(),
      message: isSmtpConfigured()
        ? 'Password reset verification token generated. Check your inbox.'
        : 'SMTP email transport is not configured yet. Use your reset verification token below to complete the reset securely.',
      resetToken: isSmtpConfigured() ? undefined : rawToken,
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Unable to process reset request.' });
  }
});

app.post('/api/auth/reset-password', rateLimit(60_000, 10), async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Valid reset token and a password of at least 8 characters are required.' });
    }
    const tokenHash = hashToken(String(token).trim());
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.resetTokenHash, tokenHash))
      .limit(1);

    if (!found || !found.resetTokenExpiresAt || found.resetTokenExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Reset token is invalid or expired.' });
    }

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(String(newPassword)),
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, found.id));

    await logAudit({ id: found.id, email: found.email }, 'PASSWORD_RESET_COMPLETED', 'users');
    return res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Unable to reset password.' });
  }
});

// =========================================================================
// 2. PUBLIC HOME, EXPLORE, CATEGORIES & LIVE SEARCH
// =========================================================================

app.get('/api/home', async (_req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const { data: payload } = await getOrSetPublicCache('home', 'home_v1', 300, async () => {
      const [allCategories, featuredDocs, featuredVideos, allPlans] = await Promise.all([
        db.select().from(categories).orderBy(categories.name),
        db
          .select({
            id: indexedDocuments.id,
            title: indexedDocuments.title,
            url: indexedDocuments.url,
            domain: indexedDocuments.domain,
            snippet: indexedDocuments.snippet,
            categorySlug: indexedDocuments.categorySlug,
            modality: indexedDocuments.modality,
            sourceName: indexedDocuments.sourceName,
            authors: indexedDocuments.authors,
            publishedDate: indexedDocuments.publishedDate,
            keywords: indexedDocuments.keywords,
          })
          .from(indexedDocuments)
          .where(and(eq(indexedDocuments.isPublished, true), eq(indexedDocuments.isFeatured, true)))
          .orderBy(desc(indexedDocuments.createdAt))
          .limit(6),
        db
          .select({
            id: videos.id,
            title: videos.title,
            description: videos.description,
            categorySlug: videos.categorySlug,
            channel: videos.channel,
            duration: videos.duration,
            videoUrl: videos.videoUrl,
            thumbnailUrl: videos.thumbnailUrl,
            externalVideoId: videos.externalVideoId,
            sourcePlatform: videos.sourcePlatform,
            publishedAt: videos.publishedAt,
            embedAllowed: videos.embedAllowed,
          })
          .from(videos)
          .where(and(eq(videos.isPublished, true), eq(videos.isFeatured, true)))
          .orderBy(desc(videos.createdAt))
          .limit(3),
        db.select().from(plans),
      ]);

      return {
        categories: allCategories,
        featuredDocuments: featuredDocs,
        featuredVideos,
        plans: allPlans,
        trendingQueries: [
          'Post-Quantum Cryptography NIST FIPS 203',
          'Retrieval-Augmented Generation Citations',
          'CRISPR dCas9 Epigenetic Regulation',
          'Climate Mitigation IPCC Pathways',
          'Zero-Trust Network Architecture',
          'Climate-Resilient Agronomy',
        ],
      };
    });

    return res.json(payload);
  } catch (err) {
    console.error('GET /api/home error:', err);
    return res.status(500).json({ error: 'Failed to load homepage data.' });
  }
});

app.get('/api/brand-knowledge', async (_req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const data = await getOfficialBrandKnowledge({ includeDrafts: false });
    return res.json(data);
  } catch (err) {
    console.error('GET /api/brand-knowledge error:', err);
    return res.status(500).json({ error: 'Failed to load official 2MR brand knowledge.' });
  }
});

app.get('/api/categories', async (_req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const { data: allCategories } = await getOrSetPublicCache('categories', 'all_v1', 600, async () =>
      db.select().from(categories).orderBy(categories.name)
    );
    return res.json({ categories: allCategories });
  } catch (err) {
    console.error('GET /api/categories error:', err);
    return res.status(500).json({ error: 'Failed to load categories.' });
  }
});

app.get('/api/categories/:slug', async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const { slug } = req.params;
    const [cat] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    if (!cat) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    const [docs, catVideos, liveMatches] = await Promise.all([
      db
        .select()
        .from(indexedDocuments)
        .where(and(eq(indexedDocuments.categorySlug, slug), eq(indexedDocuments.isPublished, true)))
        .orderBy(desc(indexedDocuments.isFeatured), desc(indexedDocuments.createdAt)),
      db
        .select()
        .from(videos)
        .where(and(eq(videos.categorySlug, slug), eq(videos.isPublished, true))),
      runLiveMultiSourceSearch(cat.name, 'academic'),
    ]);

    return res.json({
      category: cat,
      documents: docs,
      videos: catVideos,
      liveResources: liveMatches.slice(0, 6),
    });
  } catch (err) {
    console.error('GET /api/categories/:slug error:', err);
    return res.status(500).json({ error: 'Failed to load category.' });
  }
});

app.get('/api/search', async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const q = String(req.query.q || '').trim();
    const tab = String(req.query.tab || 'all').toLowerCase();
    const dateFilter = String(req.query.date || 'any');
    const sourceTypeFilter = String(req.query.sourceType || 'all');
    const sortBy = String(req.query.sort || 'relevance');
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 20)));

    if (!q) {
      const { data: recentDocs } = await getOrSetPublicCache('search', 'default_recent_docs', 180, async () =>
        db
          .select({
            id: indexedDocuments.id,
            title: indexedDocuments.title,
            url: indexedDocuments.url,
            domain: indexedDocuments.domain,
            snippet: indexedDocuments.snippet,
            categorySlug: indexedDocuments.categorySlug,
            modality: indexedDocuments.modality,
            sourceName: indexedDocuments.sourceName,
            authors: indexedDocuments.authors,
            publishedDate: indexedDocuments.publishedDate,
            keywords: indexedDocuments.keywords,
          })
          .from(indexedDocuments)
          .where(eq(indexedDocuments.isPublished, true))
          .limit(8)
      );
      return res.json({
        query: '',
        tab,
        results: recentDocs,
        videos: [],
        aiOverview: null,
        relatedTopics: ['Artificial Intelligence', 'Quantum Computing', 'Cybersecurity', 'Climate Science'],
        relatedQuestions: [
          'How does Post-Quantum Cryptography protect communications?',
          'What is Retrieval-Augmented Generation?',
        ],
        sponsoredAd: null,
      });
    }

    const fullSearchKey = `full:${tab}:${dateFilter}:${sourceTypeFilter}:${sortBy}:${page}:${limit}:${q}`;
    const { data: publicSearchPayload, cacheHit: searchPayloadCacheHit } = await getOrSetPublicCache(
      'search',
      fullSearchKey,
      600,
      async () => {
        const pattern = `%${q}%`;
        const [discovery, matchedVideos] = await Promise.all([
          discoverVerifiedSourcesWithMetrics(q, tab, undefined, {
            budgetMs: 2200,
            includeAcademic: tab === 'all' || tab === 'academic' || tab === 'research',
            maxResults: 24,
            cacheTtlSeconds: 600,
          }),
          db
            .select({
              id: videos.id,
              title: videos.title,
              description: videos.description,
              categorySlug: videos.categorySlug,
              channel: videos.channel,
              duration: videos.duration,
              videoUrl: videos.videoUrl,
              thumbnailUrl: videos.thumbnailUrl,
              externalVideoId: videos.externalVideoId,
              sourcePlatform: videos.sourcePlatform,
              publishedAt: videos.publishedAt,
              embedAllowed: videos.embedAllowed,
            })
            .from(videos)
            .where(
              and(
                eq(videos.isPublished, true),
                or(ilike(videos.title, pattern), ilike(videos.description, pattern), ilike(videos.categorySlug, pattern))
              )
            )
            .limit(6),
        ]);

        let filtered = discovery.sources;
        if (sourceTypeFilter !== 'all') {
          filtered = filtered.filter((r) => r.provider === sourceTypeFilter || r.modality === sourceTypeFilter);
        }
        if (dateFilter === '2024+' || dateFilter === 'recent') {
          filtered = filtered.filter((r) => !r.publishedDate || r.publishedDate >= '2024-01-01');
        }
        if (sortBy === 'date') {
          filtered = [...filtered].sort((a, b) => (b.publishedDate || '').localeCompare(a.publishedDate || ''));
        }

        const offset = (page - 1) * limit;
        const pagedResults = filtered.slice(offset, offset + limit);

        let aiOverview: {
          summary: string;
          keyTakeaways: string[];
          verificationNote: string;
          grounded: boolean;
        } | null = null;

        if (tab === 'all' || tab === 'research' || tab === 'academic') {
          const brandCheck = classifyBrandIdentityQuery(q);
          if (brandCheck.isBrandQuery) {
            const { brand, announcements } = await getOfficialBrandKnowledge();
            const grounded = buildGroundedBrandFallback({
              query: q,
              classification: brandCheck,
              brand,
              announcements,
            });
            aiOverview = {
              summary: grounded.directAnswer,
              keyTakeaways: [
                `Official Name: ${brand.officialName} ("${brand.slogan}")`,
                `Founder & Creator: ${brand.founderName}`,
                `Main Features: ${brand.coreFeatures.map((f) => f.name).join(', ')}`,
              ],
              verificationNote: 'Grounded directly in the verified 2MR Official Knowledge Base.',
              grounded: true,
            };
          } else if (filtered.length === 0) {
            aiOverview = {
              summary: `No verified records were returned by our permitted open-access search providers for "${q}". Try broader academic keywords or check spelling.`,
              keyTakeaways: ['No matching external or indexed sources retrieved for this exact query.'],
              verificationNote: '2MR never fabricates search summaries or citations when retrieval yields zero matches.',
              grounded: false,
            };
          } else {
            const overviewKey = `search_overview:${tab}:${q}`;
            const cachedOverview = await getPublicCache<typeof aiOverview>('public_ai', overviewKey);
            if (cachedOverview) {
              aiOverview = cachedOverview;
            } else if (await isGeminiConfigured()) {
              try {
                const sourceContext = filtered
                  .slice(0, 5)
                  .map((r, i) => `[${i + 1}] ${r.title} (${r.sourceName}, ${r.publishedDate || 'n.d.'}) — ${r.snippet} [URL: ${r.url}]`)
                  .join('\n');

                const prompt = `Summarize the search query "${q}" concisely using ONLY these retrieved sources:\n${sourceContext}\n\nReturn JSON:\n{\n  "summary": "2 sentence objective overview grounded strictly in the retrieved sources",\n  "keyTakeaways": ["bullet 1", "bullet 2", "bullet 3"],\n  "verificationNote": "1 sentence explaining evidence coverage or gaps across these sources"\n}`;

                const gemRes = await generateGeminiJson<{
                  summary?: string;
                  keyTakeaways?: string[];
                  verificationNote?: string;
                }>({
                  feature: 'search_overview',
                  prompt,
                  thinkingLevel: ThinkingLevel.LOW,
                  timeoutMs: 8000,
                });
                const parsed = gemRes.data || {};
                aiOverview = {
                  summary: parsed.summary || `Synthesized from ${filtered.length} retrieved open-access records.`,
                  keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
                  verificationNote:
                    parsed.verificationNote || 'Grounded strictly in retrieved CrossRef, arXiv, Wikipedia, and 2MR Index records.',
                  grounded: true,
                };
                await setPublicCache('public_ai', overviewKey, aiOverview, 600);
              } catch {
                aiOverview = {
                  summary: `Retrieved ${filtered.length} verified records across CrossRef, arXiv, Wikipedia, and 2MR's permitted index for "${q}". Top source: ${filtered[0].title} (${filtered[0].sourceName}).`,
                  keyTakeaways: filtered.slice(0, 3).map((r) => `${r.title} — ${r.sourceName}`),
                  verificationNote: 'Direct retrieval digest from verified open-access metadata.',
                  grounded: true,
                };
              }
            } else {
              aiOverview = {
                summary: `Retrieved ${filtered.length} verified records for "${q}" across scholarly and encyclopedic indexes. Primary record: "${filtered[0].title}" published by ${filtered[0].sourceName}.`,
                keyTakeaways: filtered.slice(0, 3).map((r) => `${r.title} (${r.sourceName})`),
                verificationNote: 'Summary built directly from live CrossRef, arXiv, Wikipedia, and 2MR Index results.',
                grounded: true,
              };
            }
          }
        }

        const relatedTopics = Array.from(
          new Set(filtered.flatMap((r) => r.keywords || []).filter(Boolean))
        ).slice(0, 6);

        return {
          query: q,
          tab,
          results: pagedResults,
          totalMatched: filtered.length,
          snapshotSources: filtered.slice(0, 5),
          pagination: {
            page,
            limit,
            total: filtered.length,
            totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
          },
          searchMetrics: {
            searchLatencyMs: discovery.searchLatencyMs,
            cacheHit: discovery.cacheHit,
          },
          videos: matchedVideos,
          aiOverview,
          relatedTopics:
            relatedTopics.length > 0 ? relatedTopics : [q, 'Systematic Review', 'Empirical Evidence', 'Standards'],
          relatedQuestions: [
            `What do peer-reviewed studies confirm about ${q}?`,
            `Where do researchers disagree regarding ${q}?`,
            `What methodologies are most effective for studying ${q}?`,
          ],
        };
      }
    );

    // Non-blocking background persistence of search history & source pointers (respecting consent & privacy preferences)
    const uid = req.currentUser?.id || null;
    const consentCookie = parseConsentCookie(req);
    enqueueBackgroundJob('persist-search-history', async () => {
      if (!uid && !consentCookie?.analytics) {
        return;
      }
      if (uid) {
        const [prefs] = await db
          .select({ searchHistoryTracking: userPrivacyPreferences.searchHistoryTracking })
          .from(userPrivacyPreferences)
          .where(eq(userPrivacyPreferences.userId, uid))
          .limit(1);
        if (prefs && !prefs.searchHistoryTracking) return;
      }

      const [hist] = await db
        .insert(searchHistory)
        .values({
          userId: uid,
          query: q,
          modality: tab,
          resultsCount: publicSearchPayload.totalMatched,
        })
        .returning();

      if (hist && publicSearchPayload.snapshotSources.length > 0) {
        await db.insert(searchSources).values(
          publicSearchPayload.snapshotSources.map((r) => ({
            searchHistoryId: hist.id,
            title: r.title,
            url: r.url,
            domain: r.domain,
            publishedDate: r.publishedDate || null,
          }))
        );
      }
    });

    // Sponsored ad ONLY for guests or free users (never stored in shared public cache)
    let sponsoredAd = null;
    if (!req.currentUser || req.currentUser.role === 'free') {
      const [ad] = await db
        .select()
        .from(adCampaigns)
        .where(and(eq(adCampaigns.status, 'active'), eq(adCampaigns.adType, 'sponsored-result')))
        .limit(1);
      if (ad) sponsoredAd = ad;
    }

    const { totalMatched: _tm, snapshotSources: _ss, ...cleanPayload } = publicSearchPayload;
    return res.json({
      ...cleanPayload,
      searchMetrics: {
        ...cleanPayload.searchMetrics,
        cacheHit: searchPayloadCacheHit || cleanPayload.searchMetrics.cacheHit,
      },
      sponsoredAd,
    });
  } catch (err) {
    console.error('GET /api/search error:', err);
    return res.status(500).json({ error: 'Search request failed.' });
  }
});

// =========================================================================
// 3. 2MR RESEARCH INTELLIGENCE (11-SECTION GROUNDED SYNTHESIS)
// =========================================================================

app.post('/api/research/analyze', rateLimit(60_000, 12), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const { topic, question, sourceFocus, depth, researchDepth, language, compareModels } = req.body || {};
    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'Research topic is required.' });
    }

    if (req.currentUser && req.currentUser.role === 'free' && req.currentUser.aiQueriesUsed >= req.currentUser.aiQueriesLimit) {
      return res.status(403).json({
        error: 'Monthly AI query limit reached on Free plan. Upgrade to 2MR Premium for expanded limits.',
      });
    }

    if (req.currentUser) {
      const uid = req.currentUser.id;
      enqueueBackgroundJob('increment-ai-quota', async () => {
        await db
          .update(users)
          .set({ aiQueriesUsed: sql`${users.aiQueriesUsed} + 1` })
          .where(eq(users.id, uid));
      });
    }

    const validDepths: ResearchDepth[] = ['fast', 'balanced', 'deep'];
    const resolvedDepth: ResearchDepth = validDepths.includes(researchDepth)
      ? researchDepth
      : depth === 'Deep Comparative Analysis'
        ? 'deep'
        : depth === 'Standard'
          ? 'balanced'
          : 'fast';

    const mode =
      resolvedDepth === 'deep' || depth === 'Deep Comparative Analysis'
        ? 'deep_research'
        : 'research_intelligence';

    const orchestrated = await orchestrateUnifiedAI({
      userId: req.currentUser?.id || null,
      mode,
      researchDepth: resolvedDepth,
      query: question ? `${topic.trim()} — ${String(question).trim()}` : topic.trim(),
      sourceFocus,
      depth,
      language,
      compareMultipleModels: Boolean(compareModels) && resolvedDepth !== 'fast',
    });

    return res.json({
      ...(orchestrated.data || {}),
      topic: orchestrated.data?.topic || topic.trim(),
      retrievedSources: orchestrated.data?.retrievedSources || [],
      verificationSummary: orchestrated.verificationSummary,
      usedMultiModelCheck: orchestrated.usedMultiModelCheck,
      modelsEvaluatedCount: orchestrated.modelsEvaluatedCount,
      externalSourcesCheckedCount: orchestrated.externalSourcesCheckedCount,
      researchDepth: orchestrated.researchDepth,
      metrics: orchestrated.metrics,
      requestId: orchestrated.requestId,
    });
  } catch (err) {
    console.error('POST /api/research/analyze error:', err);
    return res.status(500).json({ error: 'Research analysis failed.' });
  }
});

// =========================================================================
// 4. 2MR ASK & PERSISTENT CONVERSATIONS
// =========================================================================

app.get('/api/conversations', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, req.currentUser!.id))
      .orderBy(desc(aiConversations.updatedAt));
    return res.json({ conversations: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

app.post('/api/conversations', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const title = String(req.body?.title || 'New Research Inquiry').trim().slice(0, 120);
    const [created] = await db
      .insert(aiConversations)
      .values({ userId: req.currentUser!.id, title })
      .returning();
    return res.status(201).json({ conversation: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create conversation.' });
  }
});

app.patch('/api/conversations/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    const [updated] = await db
      .update(aiConversations)
      .set({ title: title.slice(0, 120), updatedAt: new Date() })
      .where(and(eq(aiConversations.id, req.params.id), eq(aiConversations.userId, req.currentUser!.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Conversation not found.' });
    return res.json({ conversation: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to rename conversation.' });
  }
});

app.delete('/api/conversations/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .delete(aiConversations)
      .where(and(eq(aiConversations.id, req.params.id), eq(aiConversations.userId, req.currentUser!.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

app.get('/api/conversations/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [conv] = await db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, req.params.id), eq(aiConversations.userId, req.currentUser!.id)))
      .limit(1);
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

    const msgs = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conv.id))
      .orderBy(aiMessages.createdAt);
    return res.json({ conversation: conv, messages: msgs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load messages.' });
  }
});

app.post('/api/ask/stream', rateLimit(60_000, 20), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const {
      question,
      conversationId,
      attachmentContext,
      mode = 'ask',
      researchDepth = 'fast',
      compareModels = false,
      language = 'English',
    } = req.body || {};

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Question is required.' });
    }

    if (
      req.currentUser &&
      req.currentUser.role === 'free' &&
      req.currentUser.aiQueriesUsed >= req.currentUser.aiQueriesLimit
    ) {
      return res.status(403).json({
        error: 'Monthly AI query limit reached on Free plan. Upgrade to 2MR Premium for higher limits.',
      });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const controller = new AbortController();
    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
      controller.abort();
    });

    const emit = (eventName: string, payload: unknown) => {
      if (clientClosed || res.writableEnded) return;
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const q = question.trim();
    const validDepths: ResearchDepth[] = ['fast', 'balanced', 'deep'];
    const resolvedDepth: ResearchDepth = validDepths.includes(researchDepth) ? researchDepth : 'fast';

    let activeConversationId: string | null = conversationId || null;
    let retainAiHistory = true;
    if (req.currentUser) {
      const uid = req.currentUser.id;
      const [prefs] = await db
        .select({ aiHistoryRetention: userPrivacyPreferences.aiHistoryRetention })
        .from(userPrivacyPreferences)
        .where(eq(userPrivacyPreferences.userId, uid))
        .limit(1);
      if (prefs && !prefs.aiHistoryRetention) {
        retainAiHistory = false;
      }

      enqueueBackgroundJob('increment-ai-quota', async () => {
        await db
          .update(users)
          .set({ aiQueriesUsed: sql`${users.aiQueriesUsed} + 1` })
          .where(eq(users.id, uid));
      });

      if (retainAiHistory) {
        if (!activeConversationId) {
          const [conv] = await db
            .insert(aiConversations)
            .values({ userId: uid, title: q.slice(0, 80) })
            .returning();
          activeConversationId = conv.id;
        } else {
          enqueueBackgroundJob('touch-conversation', async () => {
            await db
              .update(aiConversations)
              .set({ updatedAt: new Date() })
              .where(and(eq(aiConversations.id, activeConversationId!), eq(aiConversations.userId, uid)));
          });
        }
        emit('conversation', { conversationId: activeConversationId });
      }
    }

    const conversationHistory =
      activeConversationId && req.currentUser
        ? await loadConversationHistory(activeConversationId, req.currentUser.id)
        : [];

    const result = await orchestrateUnifiedAIStream({
      userId: req.currentUser?.id || null,
      mode: mode === 'smart_answer' || mode === 'comparison' || mode === 'deep_research' ? mode : 'ask',
      researchDepth: resolvedDepth,
      query: q,
      conversationId: activeConversationId,
      conversationHistory,
      attachmentContext: attachmentContext ? String(attachmentContext).slice(0, 2000) : undefined,
      language,
      compareMultipleModels: Boolean(compareModels),
      signal: controller.signal,
      onEvent: emit,
    });

    if (req.currentUser && activeConversationId && result.directAnswer) {
      const convId = activeConversationId;
      enqueueBackgroundJob('persist-ask-stream-messages', async () => {
        await db.insert(aiMessages).values([
          {
            conversationId: convId,
            role: 'user',
            content: q,
          },
          {
            conversationId: convId,
            role: 'assistant',
            content: result.directAnswer,
            structuredData: result.structuredAnswer,
          },
        ]);
      });
    }

    emit('done', {
      requestId: result.requestId,
      conversationId: activeConversationId,
      metrics: result.metrics,
    });
    if (!res.writableEnded) res.end();
  } catch (err: any) {
    console.error('POST /api/ask/stream error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Unable to process streaming question.' });
    }
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err?.message || 'Streaming error' })}\n\n`);
      res.end();
    }
  }
});

app.post('/api/ask', rateLimit(60_000, 15), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const {
      question,
      conversationId,
      attachmentContext,
      mode = 'ask',
      researchDepth = 'fast',
      compareModels = false,
    } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Question is required.' });
    }

    if (req.currentUser && req.currentUser.role === 'free' && req.currentUser.aiQueriesUsed >= req.currentUser.aiQueriesLimit) {
      return res.status(403).json({
        error: 'Monthly AI query limit reached on Free plan. Upgrade to 2MR Premium for higher limits.',
      });
    }

    const q = question.trim();
    const validDepths: ResearchDepth[] = ['fast', 'balanced', 'deep'];
    const resolvedDepth: ResearchDepth = validDepths.includes(researchDepth) ? researchDepth : 'fast';

    if (req.currentUser) {
      const uid = req.currentUser.id;
      enqueueBackgroundJob('increment-ai-quota', async () => {
        await db
          .update(users)
          .set({ aiQueriesUsed: sql`${users.aiQueriesUsed} + 1` })
          .where(eq(users.id, uid));
      });
    }

    const conversationHistory =
      conversationId && req.currentUser
        ? await loadConversationHistory(String(conversationId), req.currentUser.id)
        : [];

    const orchestrated = await orchestrateUnifiedAI({
      userId: req.currentUser?.id || null,
      mode: mode === 'smart_answer' || mode === 'comparison' || mode === 'deep_research' ? mode : 'ask',
      researchDepth: resolvedDepth,
      query: q,
      conversationId: conversationId || null,
      conversationHistory,
      attachmentContext: attachmentContext ? String(attachmentContext).slice(0, 2000) : undefined,
      compareMultipleModels: Boolean(compareModels) || mode === 'comparison' || mode === 'deep_research',
    });

    const structuredAnswer = {
      ...(orchestrated.data || {}),
      verificationSummary: orchestrated.verificationSummary,
      usedMultiModelCheck: orchestrated.usedMultiModelCheck,
      modelsEvaluatedCount: orchestrated.modelsEvaluatedCount,
      externalSourcesCheckedCount: orchestrated.externalSourcesCheckedCount,
      retrievedSources: orchestrated.data?.retrievedSources || [],
      researchDepth: orchestrated.researchDepth,
      metrics: orchestrated.metrics,
    };

    // Persist conversation & messages if authenticated and AI history retention is enabled
    let activeConversationId: string | undefined = conversationId;
    if (req.currentUser) {
      const uid = req.currentUser.id;
      const [privacyPref] = await db
        .select({ aiHistoryRetention: userPrivacyPreferences.aiHistoryRetention })
        .from(userPrivacyPreferences)
        .where(eq(userPrivacyPreferences.userId, uid))
        .limit(1);
      const retainAiHistory = privacyPref ? Boolean(privacyPref.aiHistoryRetention) : true;

      if (retainAiHistory) {
        if (!activeConversationId) {
          const [conv] = await db
            .insert(aiConversations)
            .values({ userId: uid, title: q.slice(0, 80) })
            .returning();
          activeConversationId = conv.id;
        } else {
          const cid = activeConversationId;
          enqueueBackgroundJob('touch-conversation', async () => {
            await db
              .update(aiConversations)
              .set({ updatedAt: new Date() })
              .where(and(eq(aiConversations.id, cid), eq(aiConversations.userId, uid)));
          });
        }

        const cid = activeConversationId;
        enqueueBackgroundJob('persist-ask-messages', async () => {
          await db.insert(aiMessages).values([
            {
              conversationId: cid,
              role: 'user',
              content: q,
            },
            {
              conversationId: cid,
              role: 'assistant',
              content: structuredAnswer.directAnswer || '',
              structuredData: structuredAnswer,
            },
          ]);
        });
      }
    }

    return res.json({
      conversationId: activeConversationId || null,
      ...structuredAnswer,
    });
  } catch (err) {
    console.error('POST /api/ask error:', err);
    return res.status(500).json({ error: 'Unable to process question.' });
  }
});

// =========================================================================
// 5. RESEARCH BUILDER (PROJECTS, SOURCES, NOTES & REAL .DOCX EXPORT)
// =========================================================================

app.get('/api/projects', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const list = await db
      .select()
      .from(researchProjects)
      .where(eq(researchProjects.userId, req.currentUser!.id))
      .orderBy(desc(researchProjects.updatedAt));
    return res.json({ projects: list });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load research projects.' });
  }
});

app.post('/api/projects', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, topic, objectives, question, researchType, description } = req.body || {};
    if (!title || !topic) {
      return res.status(400).json({ error: 'Project title and research topic are required.' });
    }
    const [created] = await db
      .insert(researchProjects)
      .values({
        userId: req.currentUser!.id,
        title: String(title).trim(),
        topic: String(topic).trim(),
        objectives: String(objectives || ''),
        question: String(question || ''),
        researchType: String(researchType || 'Systematic Review'),
        description: String(description || ''),
        outline: [
          '1. Introduction & Research Context',
          '2. Research Questions & Objectives',
          '3. Literature Review & Source Synthesis',
          '4. Methodology & Evaluation Criteria',
          '5. Findings & Evidence Comparison',
          '6. Conclusions & Recommendations',
        ],
      })
      .returning();

    return res.status(201).json({ project: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create project.' });
  }
});

app.get('/api/projects/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [project] = await db
      .select()
      .from(researchProjects)
      .where(and(eq(researchProjects.id, req.params.id), eq(researchProjects.userId, req.currentUser!.id)))
      .limit(1);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const [sources, notes] = await Promise.all([
      db.select().from(researchSources).where(eq(researchSources.projectId, project.id)),
      db.select().from(researchNotes).where(eq(researchNotes.projectId, project.id)).orderBy(desc(researchNotes.createdAt)),
    ]);

    return res.json({ project, sources, notes });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load project.' });
  }
});

app.patch('/api/projects/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const allowedFields = [
      'title',
      'topic',
      'objectives',
      'question',
      'researchType',
      'description',
      'hypothesis',
      'methodology',
      'literatureReview',
      'outline',
      'findings',
      'conclusion',
      'status',
    ];
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db
      .update(researchProjects)
      .set(updates)
      .where(and(eq(researchProjects.id, req.params.id), eq(researchProjects.userId, req.currentUser!.id)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Project not found.' });
    return res.json({ project: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update project.' });
  }
});

app.delete('/api/projects/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .delete(researchProjects)
      .where(and(eq(researchProjects.id, req.params.id), eq(researchProjects.userId, req.currentUser!.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete project.' });
  }
});

app.post('/api/projects/:id/sources', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [project] = await db
      .select()
      .from(researchProjects)
      .where(and(eq(researchProjects.id, req.params.id), eq(researchProjects.userId, req.currentUser!.id)))
      .limit(1);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const { title, url, authors, publishedDate, stance, notes } = req.body || {};
    if (!title || !url) return res.status(400).json({ error: 'Source title and URL are required.' });

    const [created] = await db
      .insert(researchSources)
      .values({
        projectId: project.id,
        title: String(title).trim(),
        url: String(url).trim(),
        authors: authors || null,
        publishedDate: publishedDate || null,
        stance: stance || 'support',
        notes: notes || null,
      })
      .returning();

    return res.status(201).json({ source: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add source.' });
  }
});

app.delete('/api/projects/:id/sources/:sourceId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [project] = await db
      .select()
      .from(researchProjects)
      .where(and(eq(researchProjects.id, req.params.id), eq(researchProjects.userId, req.currentUser!.id)))
      .limit(1);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    await db
      .delete(researchSources)
      .where(and(eq(researchSources.id, req.params.sourceId), eq(researchSources.projectId, project.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove source.' });
  }
});

app.post('/api/projects/:id/notes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [project] = await db
      .select()
      .from(researchProjects)
      .where(and(eq(researchProjects.id, req.params.id), eq(researchProjects.userId, req.currentUser!.id)))
      .limit(1);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const { content, tags } = req.body || {};
    if (!content) return res.status(400).json({ error: 'Note content is required.' });

    const [created] = await db
      .insert(researchNotes)
      .values({
        projectId: project.id,
        content: String(content),
        tags: Array.isArray(tags) ? tags : [],
      })
      .returning();
    return res.status(201).json({ note: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add note.' });
  }
});

app.delete('/api/projects/:id/notes/:noteId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [project] = await db
      .select()
      .from(researchProjects)
      .where(and(eq(researchProjects.id, req.params.id), eq(researchProjects.userId, req.currentUser!.id)))
      .limit(1);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    await db
      .delete(researchNotes)
      .where(and(eq(researchNotes.id, req.params.noteId), eq(researchNotes.projectId, project.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete note.' });
  }
});

app.post('/api/projects/:id/assist', requireAuth, rateLimit(60_000, 12), async (req: AuthRequest, res: Response) => {
  try {
    if (
      req.currentUser!.role === 'free' &&
      req.currentUser!.aiQueriesUsed >= req.currentUser!.aiQueriesLimit
    ) {
      return res.status(403).json({
        error: 'Monthly AI query limit reached on Free plan. Upgrade to 2MR Premium for expanded limits.',
      });
    }

    const [project] = await db
      .select()
      .from(researchProjects)
      .where(and(eq(researchProjects.id, req.params.id), eq(researchProjects.userId, req.currentUser!.id)))
      .limit(1);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const uid = req.currentUser!.id;
    enqueueBackgroundJob('increment-ai-quota', async () => {
      await db
        .update(users)
        .set({ aiQueriesUsed: sql`${users.aiQueriesUsed} + 1` })
        .where(eq(users.id, uid));
    });

    const [projectSources, retrieved] = await Promise.all([
      db.select().from(researchSources).where(eq(researchSources.projectId, project.id)),
      runLiveMultiSourceSearch(project.topic, 'academic'),
    ]);

    const sourceList = [
      ...projectSources.map((s) => `${s.title} (${s.url})`),
      ...retrieved.slice(0, 5).map((r) => `${r.title} (${r.url})`),
    ].slice(0, 8);

    try {
      const gemRes = await generateGeminiJson<{
        titleSuggestions?: string[];
        objectives?: string;
        question?: string;
        hypothesis?: string;
        methodology?: string;
        literatureReview?: string;
        outline?: string[];
        findings?: string;
        conclusion?: string;
      }>({
        feature: 'research_builder_assist',
        thinkingLevel: ThinkingLevel.LOW,
        timeoutMs: 15000,
        systemInstruction:
          'You are 2MR Research Builder AI. Draft scholarly, structured research sections grounded in the project topic and listed sources. Never invent fake DOIs or URLs.',
        prompt: `Project Title: "${project.title}"
Topic: "${project.topic}"
Research Type: "${project.researchType}"
Existing Objectives: "${project.objectives || 'None specified yet'}"
Existing Findings Notes: "${project.findings || 'None'}"
Sources: ${sourceList.join('; ') || 'General scholarly context'}

Generate clear academic draft suggestions for all builder fields including 3 alternative research titles, objectives, primary research question, hypothesis, methodology, 2-paragraph literature synthesis, structured outline, draft findings framework, and conclusion draft.`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            titleSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            objectives: { type: Type.STRING },
            question: { type: Type.STRING },
            hypothesis: { type: Type.STRING },
            methodology: { type: Type.STRING },
            literatureReview: { type: Type.STRING },
            outline: { type: Type.ARRAY, items: { type: Type.STRING } },
            findings: { type: Type.STRING },
            conclusion: { type: Type.STRING },
          },
          required: ['question', 'hypothesis', 'methodology', 'literatureReview', 'outline'],
        },
      });

      return res.json({
        suggestions: gemRes.data || {},
        retrievedSources: retrieved.slice(0, 5),
        usedAi: true,
        aiGenerated: true,
        modelUsed: gemRes.model,
      });
    } catch (err) {
      console.error('Project AI assist error:', err);
      return res.json({
        suggestions: {
          titleSuggestions: [
            `${project.topic}: A ${project.researchType}`,
            `Comparative Evidence on ${project.topic}`,
          ],
          objectives:
            project.objectives ||
            `1. Map peer-reviewed findings on ${project.topic}.\n2. Evaluate methodology strengths and limitations.`,
          question:
            project.question ||
            `What empirical evidence and comparative methodologies explain recent advances in ${project.topic}?`,
          hypothesis:
            project.hypothesis ||
            `Cross-source synthesis of ${project.topic} demonstrates measurable progress while exposing methodological gaps.`,
          methodology:
            project.methodology ||
            `${project.researchType} combining live CrossRef/arXiv literature screening, source agreement triangulation, and structured evaluation.`,
          literatureReview:
            retrieved.length > 0
              ? `Initial screening identified ${retrieved.length} open-access records including "${retrieved[0].title}" (${retrieved[0].sourceName}). Further primary source reading will refine empirical synthesis.`
              : `Systematic literature review of ${project.topic} across permitted scholarly indexes.`,
          outline: [
            '1. Introduction & Scope',
            '2. Research Question & Hypothesis',
            '3. Literature Review & Comparative Matrix',
            '4. Methodology',
            '5. Key Findings & Evidence Limitations',
            '6. Conclusion & Future Work',
          ],
          findings:
            project.findings ||
            `Preliminary retrieval surfaced ${retrieved.length} sources requiring full-text synthesis.`,
          conclusion:
            project.conclusion ||
            `Further primary empirical comparison will finalize conclusions on ${project.topic}.`,
        },
        retrievedSources: retrieved.slice(0, 5),
        usedAi: false,
        aiGenerated: false,
        warning: sanitizeGeminiError(err),
      });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Unable to generate research suggestions.' });
  }
});

app.post('/api/projects/:id/export/docx', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [project] = await db
      .select()
      .from(researchProjects)
      .where(and(eq(researchProjects.id, req.params.id), eq(researchProjects.userId, req.currentUser!.id)))
      .limit(1);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const [sources, notes] = await Promise.all([
      db.select().from(researchSources).where(eq(researchSources.projectId, project.id)),
      db.select().from(researchNotes).where(eq(researchNotes.projectId, project.id)),
    ]);

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: project.title, heading: HeadingLevel.TITLE }),
            new Paragraph({
              children: [
                new TextRun({ text: `2MR – To Master Research | ${project.researchType} | Topic: ${project.topic}`, italics: true }),
              ],
            }),
            new Paragraph({ text: '1. Overview & Objectives', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: project.description || 'No overview entered yet.' }),
            new Paragraph({ text: `Objectives: ${project.objectives || 'N/A'}` }),
            new Paragraph({ text: '2. Research Question & Hypothesis', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: `Question: ${project.question || 'N/A'}` }),
            new Paragraph({ text: `Hypothesis: ${project.hypothesis || 'N/A'}` }),
            new Paragraph({ text: '3. Literature Review', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: project.literatureReview || 'No literature review drafted yet.' }),
            new Paragraph({ text: '4. Methodology', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: project.methodology || 'No methodology drafted yet.' }),
            new Paragraph({ text: '5. Findings & Conclusion', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: project.findings || 'No findings drafted yet.' }),
            new Paragraph({ text: project.conclusion || '' }),
            new Paragraph({ text: '6. Notes', heading: HeadingLevel.HEADING_1 }),
            ...(notes.length > 0
              ? notes.map((n) => new Paragraph({ text: `• ${n.content}` }))
              : [new Paragraph({ text: 'No notes recorded.' })]),
            new Paragraph({ text: '7. References', heading: HeadingLevel.HEADING_1 }),
            ...(sources.length > 0
              ? sources.map((s) => new Paragraph({ text: `${s.authors || 'Author'} (${s.publishedDate || 'n.d.'}). ${s.title}. ${s.url}` }))
              : [new Paragraph({ text: 'No references added yet.' })]),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const safeFile = project.title.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40) || '2mr-research';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFile}.docx"`);
    return res.send(buffer);
  } catch (err) {
    console.error('DOCX export error:', err);
    return res.status(500).json({ error: 'Failed to export DOCX report.' });
  }
});

// =========================================================================
// 6. VIDEOS & KNOWLEDGE MAPS
// =========================================================================

app.get('/api/videos', async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const q = String(req.query.q || '').trim();
    const cat = String(req.query.category || 'all').toLowerCase();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 24)));
    const offset = (page - 1) * limit;

    const conditions: any[] = [
      eq(videos.isPublished, true),
      inArray(videos.status, ['published', 'approved']),
    ];
    if (cat !== 'all') {
      conditions.push(eq(videos.categorySlug, cat));
    }
    if (q) {
      const p = `%${q}%`;
      conditions.push(or(ilike(videos.title, p), ilike(videos.description, p), ilike(videos.channel, p)));
    }

    const rows = await db
      .select()
      .from(videos)
      .where(and(...conditions))
      .orderBy(desc(videos.isFeatured), desc(videos.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json({ videos: rows, pagination: { page, limit } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load videos.' });
  }
});

app.get('/api/videos/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const [video] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
    if (!video) return res.status(404).json({ error: 'Video not found.' });

    const isPubliclyVisible =
      Boolean(video.isPublished) && (video.status === 'published' || video.status === 'approved');
    const isOwner = Boolean(req.currentUser && video.uploaderUserId && video.uploaderUserId === req.currentUser.id);
    const isAdmin = req.currentUser?.role === 'admin';

    if (!isPubliclyVisible && !isOwner && !isAdmin) {
      return res.status(403).json({
        error: 'This video is not publicly available yet. Only approved and published videos are public.',
      });
    }

    const [transcripts, related, summaries, catRow, uploaderRow, adSettings] = await Promise.all([
      db
        .select()
        .from(videoTranscripts)
        .where(eq(videoTranscripts.videoId, video.id))
        .orderBy(videoTranscripts.startSeconds),
      db
        .select()
        .from(videos)
        .where(and(eq(videos.isPublished, true), inArray(videos.status, ['published', 'approved'])))
        .limit(8),
      db.select().from(videoSummaries).where(eq(videoSummaries.videoId, video.id)).limit(1),
      db
        .select({ name: videoCategories.name })
        .from(videoCategories)
        .where(eq(videoCategories.slug, video.categorySlug))
        .limit(1),
      video.uploaderUserId
        ? db
            .select({ fullName: users.fullName })
            .from(users)
            .where(eq(users.id, video.uploaderUserId))
            .limit(1)
        : Promise.resolve([]),
      getOrDefaultVideoAdSettings(video.id),
    ]);

    let isSaved = false;
    if (req.currentUser) {
      const savedRow = await db
        .select()
        .from(savedVideos)
        .where(and(eq(savedVideos.videoId, video.id), eq(savedVideos.userId, req.currentUser.id)))
        .limit(1);
      isSaved = savedRow.length > 0;
    }

    return res.json({
      video: {
        ...video,
        categoryName: catRow[0]?.name || video.categorySlug,
        uploaderName: uploaderRow[0]?.fullName || video.channel,
      },
      adSettings,
      transcripts,
      summary: summaries[0] || null,
      isSaved,
      relatedVideos: related.filter((v) => v.id !== video.id).slice(0, 4),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load video.' });
  }
});

app.get('/api/knowledge-maps', async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const cond = req.currentUser
      ? or(eq(knowledgeMaps.isPublic, true), eq(knowledgeMaps.userId, req.currentUser.id))
      : eq(knowledgeMaps.isPublic, true);
    const maps = await db.select().from(knowledgeMaps).where(cond).orderBy(desc(knowledgeMaps.updatedAt));
    return res.json({ maps });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load knowledge maps.' });
  }
});

app.get('/api/knowledge-maps/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const [map] = await db.select().from(knowledgeMaps).where(eq(knowledgeMaps.id, req.params.id)).limit(1);
    if (!map) return res.status(404).json({ error: 'Knowledge map not found.' });
    if (!map.isPublic && map.userId !== req.currentUser?.id && req.currentUser?.role !== 'admin') {
      return res.status(403).json({ error: 'Private knowledge map.' });
    }
    const [nodes, edges] = await Promise.all([
      db.select().from(knowledgeNodes).where(eq(knowledgeNodes.mapId, map.id)),
      db.select().from(knowledgeEdges).where(eq(knowledgeEdges.mapId, map.id)),
    ]);
    return res.json({ map, nodes, edges });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load knowledge map.' });
  }
});

app.post('/api/knowledge-maps', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { title, rootTopic, isPublic, nodes, edges } = req.body || {};
    if (!title || !rootTopic) return res.status(400).json({ error: 'Map title and root topic are required.' });

    const [created] = await db
      .insert(knowledgeMaps)
      .values({
        userId: req.currentUser!.id,
        title: String(title).trim(),
        rootTopic: String(rootTopic).trim(),
        isPublic: Boolean(isPublic),
      })
      .returning();

    if (Array.isArray(nodes) && nodes.length > 0) {
      await db.insert(knowledgeNodes).values(
        nodes.map((n: any) => ({
          mapId: created.id,
          nodeKey: String(n.nodeKey || n.id),
          label: String(n.label),
          category: String(n.category || 'General'),
          definition: String(n.definition || n.summary || ''),
          explanation: n.explanation || null,
          depth: Number(n.depth || 0),
          x: Number(n.x || 400),
          y: Number(n.y || 260),
          keyConcepts: Array.isArray(n.keyConcepts) ? n.keyConcepts : [],
        }))
      );
    }
    if (Array.isArray(edges) && edges.length > 0) {
      await db.insert(knowledgeEdges).values(
        edges.map((e: any) => ({
          mapId: created.id,
          sourceKey: String(e.sourceKey || e.source),
          targetKey: String(e.targetKey || e.target),
          relation: String(e.relation || 'relates to'),
        }))
      );
    }

    return res.status(201).json({ map: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save knowledge map.' });
  }
});

app.patch('/api/knowledge-maps/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [existing] = await db
      .select()
      .from(knowledgeMaps)
      .where(and(eq(knowledgeMaps.id, req.params.id), eq(knowledgeMaps.userId, req.currentUser!.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Knowledge map not found or read-only.' });

    const { title, isPublic, nodes, edges } = req.body || {};
    const [updated] = await db
      .update(knowledgeMaps)
      .set({
        title: title ? String(title) : existing.title,
        isPublic: isPublic !== undefined ? Boolean(isPublic) : existing.isPublic,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeMaps.id, existing.id))
      .returning();

    if (Array.isArray(nodes)) {
      await db.delete(knowledgeNodes).where(eq(knowledgeNodes.mapId, existing.id));
      if (nodes.length > 0) {
        await db.insert(knowledgeNodes).values(
          nodes.map((n: any) => ({
            mapId: existing.id,
            nodeKey: String(n.nodeKey || n.id),
            label: String(n.label),
            category: String(n.category || 'General'),
            definition: String(n.definition || ''),
            explanation: n.explanation || null,
            depth: Number(n.depth || 0),
            x: Number(n.x || 400),
            y: Number(n.y || 260),
            keyConcepts: Array.isArray(n.keyConcepts) ? n.keyConcepts : [],
          }))
        );
      }
    }
    if (Array.isArray(edges)) {
      await db.delete(knowledgeEdges).where(eq(knowledgeEdges.mapId, existing.id));
      if (edges.length > 0) {
        await db.insert(knowledgeEdges).values(
          edges.map((e: any) => ({
            mapId: existing.id,
            sourceKey: String(e.sourceKey || e.source),
            targetKey: String(e.targetKey || e.target),
            relation: String(e.relation || 'relates to'),
          }))
        );
      }
    }

    return res.json({ map: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update knowledge map.' });
  }
});

app.delete('/api/knowledge-maps/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .delete(knowledgeMaps)
      .where(and(eq(knowledgeMaps.id, req.params.id), eq(knowledgeMaps.userId, req.currentUser!.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete knowledge map.' });
  }
});

app.post('/api/knowledge-maps/expand', rateLimit(60_000, 15), async (req: Request, res: Response) => {
  try {
    const rawConcept = typeof req.body?.concept === 'string' ? req.body.concept.trim() : '';
    if (!rawConcept) {
      return res.status(400).json({ error: 'Concept topic is required to generate a knowledge map.' });
    }
    const topic = rawConcept.slice(0, 160);

    try {
      const gemRes = await generateGeminiJson<{
        nodes?: Array<{
          nodeKey?: string;
          label?: string;
          category?: string;
          definition?: string;
          explanation?: string;
          depth?: number;
          x?: number;
          y?: number;
          keyConcepts?: string[];
        }>;
        edges?: Array<{ sourceKey?: string; targetKey?: string; relation?: string }>;
      }>({
        feature: 'knowledge_map_expand',
        thinkingLevel: ThinkingLevel.LOW,
        timeoutMs: 13000,
        systemInstruction:
          'You are 2MR Knowledge Map Generator. Build clean, accurate concept graphs within an 860x520 SVG coordinate canvas (x between 120 and 740, y between 90 and 430) with well-spaced non-overlapping nodes.',
        prompt: `Create a structured concept map for "${topic}" with 6 connected concepts (1 root node at center x:430, y:260 plus 5 well-spaced surrounding nodes).`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  nodeKey: { type: Type.STRING },
                  label: { type: Type.STRING },
                  category: { type: Type.STRING },
                  definition: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  depth: { type: Type.INTEGER },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  keyConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['nodeKey', 'label', 'category', 'definition', 'x', 'y'],
              },
            },
            edges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sourceKey: { type: Type.STRING },
                  targetKey: { type: Type.STRING },
                  relation: { type: Type.STRING },
                },
                required: ['sourceKey', 'targetKey', 'relation'],
              },
            },
          },
          required: ['nodes', 'edges'],
        },
      });

      const nodes = Array.isArray(gemRes.data?.nodes)
        ? gemRes.data.nodes.slice(0, 10).map((n, idx) => ({
            nodeKey: String(n.nodeKey || (idx === 0 ? 'root' : `n${idx}`)),
            label: String(n.label || topic).slice(0, 60),
            category: String(n.category || 'Concept').slice(0, 30),
            definition: String(n.definition || `Core element of ${topic}.`),
            explanation: n.explanation ? String(n.explanation) : '',
            depth: Number.isFinite(Number(n.depth)) ? Number(n.depth) : idx === 0 ? 0 : 1,
            x: Math.max(100, Math.min(760, Number(n.x) || 420)),
            y: Math.max(70, Math.min(450, Number(n.y) || 260)),
            keyConcepts: Array.isArray(n.keyConcepts) ? n.keyConcepts.slice(0, 4).map(String) : [],
          }))
        : [];

      const validKeys = new Set(nodes.map((n) => n.nodeKey));
      const edges = Array.isArray(gemRes.data?.edges)
        ? gemRes.data.edges
            .filter((e) => validKeys.has(String(e.sourceKey)) && validKeys.has(String(e.targetKey)))
            .map((e) => ({
              sourceKey: String(e.sourceKey),
              targetKey: String(e.targetKey),
              relation: String(e.relation || 'relates to').slice(0, 40),
            }))
        : [];

      if (nodes.length >= 2) {
        return res.json({
          nodes,
          edges,
          aiGenerated: true,
          generatedBy: 'gemini',
          modelUsed: gemRes.model,
        });
      }
    } catch (err) {
      console.error('Knowledge map expand error:', err);
      return res.json({
        nodes: [
          { nodeKey: 'root', label: topic, category: 'Core Domain', definition: `Foundational principles and scope of ${topic}.`, explanation: 'Central hub node connecting theory, systems, and real-world research.', depth: 0, x: 420, y: 250, keyConcepts: ['Foundations', 'Core Models'] },
          { nodeKey: 'n1', label: 'Theoretical Framework', category: 'Science', definition: `Mathematical and conceptual foundations underlying ${topic}.`, explanation: 'Defines formal axioms, models, and hypotheses.', depth: 1, x: 200, y: 150, keyConcepts: ['Models', 'Axioms'] },
          { nodeKey: 'n2', label: 'Applied Systems', category: 'Engineering', definition: `Practical architectures implementing ${topic}.`, explanation: 'Translates research principles into reliable tools.', depth: 1, x: 640, y: 150, keyConcepts: ['Architecture', 'Deployment'] },
          { nodeKey: 'n3', label: 'Empirical Verification', category: 'Methodology', definition: `Benchmarks, trials, and peer-reviewed validation for ${topic}.`, explanation: 'Measures accuracy, safety, and reproducibility.', depth: 2, x: 240, y: 390, keyConcepts: ['Replication', 'Metrics'] },
          { nodeKey: 'n4', label: 'Governance & Standards', category: 'Policy', definition: `Global standards and ethical guidelines governing ${topic}.`, explanation: 'Ensures transparency and long-term reliability.', depth: 2, x: 600, y: 390, keyConcepts: ['Compliance', 'Ethics'] },
        ],
        edges: [
          { sourceKey: 'root', targetKey: 'n1', relation: 'grounded in' },
          { sourceKey: 'root', targetKey: 'n2', relation: 'implemented via' },
          { sourceKey: 'root', targetKey: 'n3', relation: 'validated by' },
          { sourceKey: 'root', targetKey: 'n4', relation: 'governed by' },
        ],
        aiGenerated: false,
        generatedBy: 'fallback',
        warning: sanitizeGeminiError(err),
      });
    }

    return res.status(502).json({ error: 'Knowledge map generation returned insufficient concepts.' });
  } catch (err) {
    return res.status(500).json({ error: 'Unable to expand concept map.' });
  }
});

// =========================================================================
// 7. MY KNOWLEDGE (LIBRARY & COLLECTIONS)
// =========================================================================

app.get('/api/library', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [items, cols] = await Promise.all([
      db
        .select()
        .from(savedItems)
        .where(eq(savedItems.userId, req.currentUser!.id))
        .orderBy(desc(savedItems.createdAt)),
      db
        .select()
        .from(collections)
        .where(eq(collections.userId, req.currentUser!.id))
        .orderBy(collections.name),
    ]);
    return res.json({ items, collections: cols });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load library.' });
  }
});

app.post('/api/library/items', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { type, title, url, snippet, notes, category, tags, collectionId } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Title is required.' });

    const [created] = await db
      .insert(savedItems)
      .values({
        userId: req.currentUser!.id,
        collectionId: collectionId || null,
        type: String(type || 'research'),
        title: String(title).trim(),
        url: url ? String(url) : null,
        snippet: snippet ? String(snippet) : null,
        notes: notes ? String(notes) : null,
        category: category ? String(category) : 'General',
        tags: Array.isArray(tags) ? tags : [],
      })
      .returning();

    return res.status(201).json({ item: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save item.' });
  }
});

app.patch('/api/library/items/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { notes, tags, collectionId, title, category } = req.body || {};
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (notes !== undefined) updates.notes = notes;
    if (tags !== undefined) updates.tags = tags;
    if (collectionId !== undefined) updates.collectionId = collectionId || null;
    if (title !== undefined) updates.title = title;
    if (category !== undefined) updates.category = category;

    const [updated] = await db
      .update(savedItems)
      .set(updates)
      .where(and(eq(savedItems.id, req.params.id), eq(savedItems.userId, req.currentUser!.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Saved item not found.' });
    return res.json({ item: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update saved item.' });
  }
});

app.delete('/api/library/items/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .delete(savedItems)
      .where(and(eq(savedItems.id, req.params.id), eq(savedItems.userId, req.currentUser!.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete saved item.' });
  }
});

app.post('/api/library/collections', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Collection name required.' });
    const [created] = await db
      .insert(collections)
      .values({
        userId: req.currentUser!.id,
        name: String(name).trim(),
        description: description ? String(description) : null,
      })
      .returning();
    return res.status(201).json({ collection: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create collection.' });
  }
});

app.delete('/api/library/collections/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .delete(collections)
      .where(and(eq(collections.id, req.params.id), eq(collections.userId, req.currentUser!.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete collection.' });
  }
});

app.post('/api/library/ai-assist', requireAuth, rateLimit(60_000, 15), async (req: AuthRequest, res: Response) => {
  try {
    if (
      req.currentUser!.role === 'free' &&
      req.currentUser!.aiQueriesUsed >= req.currentUser!.aiQueriesLimit
    ) {
      return res.status(403).json({
        error: 'Monthly AI query limit reached on Free plan. Upgrade to 2MR Premium for expanded limits.',
      });
    }

    const { action = 'summarize', collectionId, focus } = req.body || {};
    const safeAction = action === 'organize' ? 'organize' : 'summarize';
    const uid = req.currentUser!.id;

    const [userItemsRaw, userCols] = await Promise.all([
      db
        .select()
        .from(savedItems)
        .where(
          collectionId && collectionId !== 'all'
            ? and(eq(savedItems.userId, uid), eq(savedItems.collectionId, String(collectionId)))
            : eq(savedItems.userId, uid)
        )
        .orderBy(desc(savedItems.createdAt))
        .limit(35),
      db.select().from(collections).where(eq(collections.userId, uid)).orderBy(collections.name),
    ]);

    if (userItemsRaw.length === 0) {
      return res.status(400).json({
        error: 'Save at least one research item, note, or video in this view before running AI analysis.',
      });
    }

    enqueueBackgroundJob('increment-ai-quota', async () => {
      await db
        .update(users)
        .set({ aiQueriesUsed: sql`${users.aiQueriesUsed} + 1` })
        .where(eq(users.id, uid));
    });

    const compactItems = userItemsRaw.map((item, idx) => {
      let noteSummary = item.notes || '';
      if (item.type === 'visual' && noteSummary.startsWith('{')) {
        noteSummary = 'Saved visual diagram/chart artifact.';
      }
      return `[${idx + 1}] (${item.type}) ${item.title} | Category: ${item.category || 'General'}${
        item.snippet ? ` | Summary: ${item.snippet.slice(0, 220)}` : ''
      }${noteSummary ? ` | Notes: ${noteSummary.slice(0, 260)}` : ''}`;
    });

    const existingFolderNames = userCols.map((c) => c.name).join(', ') || 'None yet';

    const gemRes = await generateGeminiJson<{
      summary: string;
      keyThemes: string[];
      organizationSuggestions: Array<{
        folderName: string;
        rationale: string;
        itemTitles: string[];
      }>;
      nextSteps: string[];
    }>({
      feature: 'my_knowledge_assist',
      thinkingLevel: ThinkingLevel.LOW,
      timeoutMs: 15000,
      systemInstruction:
        'You are 2MR My Knowledge Assistant. Analyze ONLY the signed-in user’s own saved research items and notes provided below. Never invent external citations or private items not listed.',
      prompt: `Action Requested: ${safeAction === 'organize' ? 'Organize into logical collections & summarize' : 'Synthesize and summarize saved knowledge'}
Existing Folders: ${existingFolderNames}
${focus ? `User Focus: ${String(focus).slice(0, 200)}\n` : ''}
USER SAVED ITEMS (${compactItems.length}):
${compactItems.join('\n')}

Return clear synthesis, 3-5 core themes, concrete folder organization groupings mapping exact item titles from the list above, and 2-3 recommended next research steps.`,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          keyThemes: { type: Type.ARRAY, items: { type: Type.STRING } },
          organizationSuggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                folderName: { type: Type.STRING },
                rationale: { type: Type.STRING },
                itemTitles: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['folderName', 'rationale', 'itemTitles'],
            },
          },
          nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['summary', 'keyThemes', 'organizationSuggestions', 'nextSteps'],
      },
    });

    return res.json({
      aiGenerated: true,
      modelUsed: gemRes.model,
      action: safeAction,
      itemCount: userItemsRaw.length,
      summary: gemRes.data?.summary || '',
      keyThemes: Array.isArray(gemRes.data?.keyThemes) ? gemRes.data.keyThemes : [],
      organizationSuggestions: Array.isArray(gemRes.data?.organizationSuggestions)
        ? gemRes.data.organizationSuggestions
        : [],
      nextSteps: Array.isArray(gemRes.data?.nextSteps) ? gemRes.data.nextSteps : [],
    });
  } catch (err) {
    console.error('POST /api/library/ai-assist error:', err);
    const status = err instanceof GeminiConfigError ? err.statusCode : 500;
    return res.status(status).json({ error: sanitizeGeminiError(err) });
  }
});

// =========================================================================
// 8. USER DASHBOARD, PROFILE, SETTINGS & NOTIFICATIONS
// =========================================================================

app.get('/api/user/dashboard', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.currentUser!.id;
    const [historyRows, savedRows, projRows, convRows, notifRows, subRows] = await Promise.all([
      db.select().from(searchHistory).where(eq(searchHistory.userId, uid)).orderBy(desc(searchHistory.createdAt)).limit(10),
      db.select().from(savedItems).where(eq(savedItems.userId, uid)).orderBy(desc(savedItems.createdAt)).limit(6),
      db.select().from(researchProjects).where(eq(researchProjects.userId, uid)).orderBy(desc(researchProjects.updatedAt)).limit(5),
      db.select().from(aiConversations).where(eq(aiConversations.userId, uid)).orderBy(desc(aiConversations.updatedAt)).limit(5),
      db.select().from(notifications).where(eq(notifications.userId, uid)).orderBy(desc(notifications.createdAt)).limit(10),
      db
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.userId, uid), eq(subscriptions.status, 'active')))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1),
    ]);

    return res.json({
      stats: {
        savedCount: savedRows.length,
        projectsCount: projRows.length,
        searchesCount: historyRows.length,
        conversationsCount: convRows.length,
      },
      recentSearches: historyRows,
      recentSaved: savedRows,
      recentProjects: projRows,
      recentConversations: convRows,
      notifications: notifRows,
      activeSubscription: subRows[0] || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load dashboard.' });
  }
});

app.patch('/api/user/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { fullName, organization, avatarUrl } = req.body || {};
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (fullName && String(fullName).trim().length >= 2) updates.fullName = String(fullName).trim();
    if (organization !== undefined) updates.organization = organization ? String(organization).trim() : null;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl ? String(avatarUrl).trim() : null;

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, req.currentUser!.id))
      .returning();
    return res.json({ user: mapUserRow(updated) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

app.patch('/api/user/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { preferredLanguage, preferredTheme, twoFactorEnabled } = req.body || {};
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (preferredLanguage) updates.preferredLanguage = String(preferredLanguage);
    if (preferredTheme === 'dark' || preferredTheme === 'light') updates.preferredTheme = preferredTheme;
    if (typeof twoFactorEnabled === 'boolean') updates.twoFactorEnabled = twoFactorEnabled;

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, req.currentUser!.id))
      .returning();
    return res.json({ user: mapUserRow(updated) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
});

app.post('/api/user/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    const [u] = await db.select().from(users).where(eq(users.id, req.currentUser!.id)).limit(1);
    if (!u) return res.status(404).json({ error: 'User not found.' });

    if (u.passwordHash && (!currentPassword || !verifyPassword(String(currentPassword), u.passwordHash))) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    await db
      .update(users)
      .set({ passwordHash: hashPassword(String(newPassword)), updatedAt: new Date() })
      .where(eq(users.id, u.id));
    await logAudit({ id: u.id, email: u.email }, 'PASSWORD_CHANGED', 'users');
    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update password.' });
  }
});

app.get('/api/user/sessions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const list = await db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, req.currentUser!.id))
      .orderBy(desc(sessions.createdAt));
    return res.json({ sessions: list });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load sessions.' });
  }
});

app.delete('/api/user/sessions/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .delete(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.currentUser!.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to revoke session.' });
  }
});

app.delete('/api/user/account', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.currentUser!.email === '2mr@proton.me' || req.currentUser!.role === 'admin') {
      return res.status(403).json({ error: 'Official administrator account cannot be self-deleted.' });
    }
    await db.delete(users).where(eq(users.id, req.currentUser!.id));
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete account.' });
  }
});

app.get('/api/notifications', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.currentUser!.id))
      .orderBy(desc(notifications.createdAt));
    return res.json({ notifications: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

app.patch('/api/notifications/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, req.currentUser!.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark notification read.' });
  }
});

app.post('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, req.currentUser!.id));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update notifications.' });
  }
});

app.delete('/api/notifications/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .delete(notifications)
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, req.currentUser!.id)));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete notification.' });
  }
});

// =========================================================================
// 9. FEEDBACK & SUPPORT CONTACT SUBMISSIONS
// =========================================================================

app.post('/api/feedback', rateLimit(60_000, 6), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const { fullName, email, category, subject, message, attachmentName } = req.body || {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Valid sender email is required.' });
    }
    if (!category || !subject || !message) {
      return res.status(400).json({ error: 'Category, subject, and message are required.' });
    }
    if (String(message).trim().length < 10) {
      return res.status(400).json({ error: 'Please include at least 10 characters in your feedback message.' });
    }

    const randomCode = crypto.randomInt(1000, 9999);
    const referenceNumber = `2MR-FB-${new Date().getFullYear()}-${randomCode}`;
    const submittedAt = new Date().toISOString();

    const dispatch = await sendFeedbackNotificationEmail({
      referenceNumber,
      senderName: fullName ? String(fullName).trim() : '2MR Visitor',
      senderEmail: String(email).trim(),
      category: String(category).trim(),
      subject: String(subject).trim(),
      message: String(message).trim(),
      submittedAt,
    });

    const [created] = await db
      .insert(feedbackSubmissions)
      .values({
        referenceNumber,
        userId: req.currentUser?.id || null,
        fullName: fullName ? String(fullName).trim() : null,
        email: String(email).trim(),
        category: String(category).trim(),
        subject: String(subject).trim(),
        message: String(message).trim(),
        attachmentName: attachmentName ? String(attachmentName).trim() : null,
        status: 'new',
        emailDispatchStatus: dispatch.status,
      })
      .returning();

    // Notify official admin in DB inbox
    const [adminUser] = await db.select().from(users).where(eq(users.email, '2mr@proton.me')).limit(1);
    if (adminUser) {
      await db.insert(notifications).values({
        userId: adminUser.id,
        category: 'system',
        title: `New Feedback ${referenceNumber}`,
        message: `${category}: ${subject} (from ${email})`,
      });
    }

    await logAudit(
      req.currentUser ? { id: req.currentUser.id, email: req.currentUser.email } : { email: String(email) },
      'FEEDBACK_SUBMITTED',
      'feedback_submissions',
      { referenceNumber, emailDispatchStatus: dispatch.status }
    );

    return res.status(201).json({
      success: true,
      referenceNumber: created.referenceNumber,
      emailDispatchStatus: created.emailDispatchStatus,
      submittedAt: created.createdAt,
    });
  } catch (err) {
    console.error('POST /api/feedback error:', err);
    return res.status(500).json({ error: 'Failed to submit feedback.' });
  }
});

app.post('/api/contact', rateLimit(60_000, 6), async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All contact fields are required.' });
    }
    const [created] = await db
      .insert(supportMessages)
      .values({
        name: String(name).trim(),
        email: String(email).trim(),
        subject: String(subject).trim(),
        message: String(message).trim(),
      })
      .returning();
    await logAudit({ email: String(email) }, 'SUPPORT_CONTACT_SUBMITTED', 'support_messages', { id: created.id });
    return res.status(201).json({ success: true, id: created.id });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send support message.' });
  }
});

// =========================================================================
// 10. PLANS, SUBSCRIPTIONS & MTN RWANDA MOBILE MONEY PAYMENTS
// =========================================================================

app.get('/api/plans', async (_req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const allPlans = await db.select().from(plans);
    return res.json({
      plans: allPlans,
      momoConfig: getMomoConfigStatus(),
      momoSandboxConfig: momoConfig.getStatus(),
      cardGatewayConfigured: Boolean(process.env.CARD_GATEWAY_SECRET_KEY),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load plans.' });
  }
});

// =========================================================================
// 10B. MTN MOMO SANDBOX THREE-API INTEGRATION (Token, Balance, AccountHolder)
// =========================================================================

app.post('/api/momo/auth/token', requireAdmin, rateLimit(60_000, 20), async (req: AuthRequest, res: Response) => {
  try {
    const forceRefresh = Boolean(req.body?.forceRefresh);
    const meta = await momoTokenService.acquireTokenMetadataOnly(forceRefresh, {
      id: req.currentUser!.id,
      email: req.currentUser!.email,
    });
    return res.json({
      ok: true,
      ...meta,
    });
  } catch (err: any) {
    if (err instanceof MomoApiError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code, ...(err.details || {}) });
    }
    return res.status(500).json({ error: 'Unable to acquire MTN MoMo Sandbox token.' });
  }
});

app.get('/api/momo/account/balance', requireAdmin, rateLimit(60_000, 30), async (req: AuthRequest, res: Response) => {
  try {
    const balance = await momoAccountBalanceService.getCollectionsBalance({
      id: req.currentUser!.id,
      email: req.currentUser!.email,
    });
    return res.json(balance);
  } catch (err: any) {
    if (err instanceof MomoApiError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code, ...(err.details || {}) });
    }
    return res.status(500).json({ error: 'Unable to retrieve MTN MoMo Collections account balance.' });
  }
});

app.get(
  '/api/momo/accountholder/:accountHolderIdType/:accountHolderId/active',
  requireAuth,
  rateLimit(60_000, 20),
  async (req: AuthRequest, res: Response) => {
    try {
      if (req.query.pin !== undefined || req.query.otp !== undefined) {
        return res.status(400).json({
          error: 'Security policy violation: never send an MTN MoMo PIN or OTP to 2MR.',
        });
      }

      const consent =
        req.query.consent === 'true' || req.headers['x-momo-validation-consent'] === 'true';

      const validation = await momoAccountHolderService.validateAccountHolder({
        accountHolderIdType: req.params.accountHolderIdType,
        accountHolderId: req.params.accountHolderId,
        consent,
        actor: {
          id: req.currentUser!.id,
          email: req.currentUser!.email,
        },
      });

      return res.json(validation);
    } catch (err: any) {
      if (err instanceof MomoApiError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code, ...(err.details || {}) });
      }
      return res.status(500).json({
        state: 'unverified',
        active: null,
        message: 'Could not verify account',
      });
    }
  }
);

app.get('/api/admin/momo/integration', requireAdmin, rateLimit(60_000, 60), async (_req: AuthRequest, res: Response) => {
  try {
    const overview = await getAdminMomoIntegrationOverview();
    return res.json(overview);
  } catch {
    return res.status(500).json({ error: 'Failed to load MTN MoMo integration status.' });
  }
});

app.get('/api/user/payments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [txns, subs] = await Promise.all([
      db.select().from(payments).where(eq(payments.userId, req.currentUser!.id)).orderBy(desc(payments.createdAt)),
      db.select().from(subscriptions).where(eq(subscriptions.userId, req.currentUser!.id)).orderBy(desc(subscriptions.createdAt)),
    ]);
    return res.json({
      payments: txns.map(({ payerMsisdnHash: _omit, ...rest }) => rest),
      subscriptions: subs,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load payment history.' });
  }
});

app.get('/api/user/payments/:ref', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.transactionRef, req.params.ref), eq(payments.userId, req.currentUser!.id)))
      .limit(1);
    if (!payment) return res.status(404).json({ error: 'Transaction not found.' });

    const events = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.paymentId, payment.id))
      .orderBy(desc(paymentEvents.createdAt));

    const { payerMsisdnHash: _omit, ...safePayment } = payment;
    return res.json({ payment: safePayment, events });
  } catch {
    return res.status(500).json({ error: 'Failed to load transaction details.' });
  }
});

app.post('/api/payments/momo/initiate', requireAuth, rateLimit(60_000, 10), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const { planSlug = 'premium', billingCycle = 'monthly', phone, paymentConsent, idempotencyKey, pin, otp } =
      req.body || {};

    const result = await initiateMomoSubscriptionPayment({
      user: {
        id: req.currentUser!.id,
        email: req.currentUser!.email,
        role: req.currentUser!.role,
      },
      planSlug,
      billingCycle,
      phone,
      paymentConsent: Boolean(paymentConsent),
      idempotencyKey: req.headers['idempotency-key'] ? String(req.headers['idempotency-key']) : idempotencyKey,
      pin,
      otp,
      ipAddress: req.ip,
    });

    return res.status(result.deduplicated ? 200 : 202).json(result);
  } catch (err: any) {
    if (err instanceof PaymentServiceError) {
      return res.status(err.statusCode).json({ error: err.message, ...(err.details || {}) });
    }
    console.error('MoMo initiate error:', err?.message || err);
    return res.status(500).json({ error: 'Unable to initiate MTN Mobile Money request.' });
  }
});

app.get('/api/payments/momo/status/:ref', requireAuth, rateLimit(60_000, 30), async (req: AuthRequest, res: Response) => {
  try {
    const result = await verifyAndSyncMomoPayment({
      transactionRef: req.params.ref,
      source: 'status_poll',
      expectedUserId: req.currentUser!.id,
      actorEmail: req.currentUser!.email,
    });
    return res.json(result);
  } catch (err: any) {
    if (err instanceof PaymentServiceError) {
      return res.status(err.statusCode).json({ error: err.message, ...(err.details || {}) });
    }
    console.error('MoMo status error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to check transaction status.' });
  }
});

const momoCallbackHandler = async (req: Request, res: Response) => {
  try {
    const result = await handleMomoCallback({
      body: req.body || {},
      headers: req.headers,
      clientIp: req.ip,
    });
    return res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof PaymentServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('MoMo callback processing error:', err?.message || err);
    return res.status(500).json({ error: 'Callback processing failed.' });
  }
};

// Official production & sandbox RequestToPay callback endpoint (supports POST and PUT per MTN API spec)
app.post('/api/payments/momo/callback', rateLimit(60_000, 120), momoCallbackHandler);
app.put('/api/payments/momo/callback', rateLimit(60_000, 120), momoCallbackHandler);
// Backwards-compatible webhook alias
app.post('/api/webhooks/momo', rateLimit(60_000, 120), momoCallbackHandler);

app.post('/api/payments/card/initiate', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!process.env.CARD_GATEWAY_SECRET_KEY) {
    return res.status(501).json({
      integrationConfigured: false,
      error:
        'Card payment gateway credentials (CARD_GATEWAY_SECRET_KEY) are not configured on the server yet. Please use MTN Mobile Money or configure your card gateway keys.',
    });
  }
  return res.status(501).json({
    integrationConfigured: true,
    error: 'Configure live Stripe/Flutterwave webhook handler before enabling card charges.',
  });
});

app.post('/api/subscriptions/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .update(subscriptions)
      .set({ status: 'cancelled', autoRenew: false, updatedAt: new Date() })
      .where(and(eq(subscriptions.userId, req.currentUser!.id), eq(subscriptions.status, 'active')));

    if (req.currentUser!.role === 'premium') {
      await db
        .update(users)
        .set({ role: 'free', aiQueriesLimit: 50, storageLimitMb: 1024, updatedAt: new Date() })
        .where(eq(users.id, req.currentUser!.id));
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Unable to cancel subscription.' });
  }
});

// =========================================================================
// 11. 2MR ADS ENGINE (FREE / GUEST ONLY — ZERO ADS FOR PREMIUM)
// =========================================================================

app.get('/api/ads/serve', async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    if (req.currentUser && (req.currentUser.role === 'premium' || req.currentUser.role === 'admin')) {
      return res.json({ ad: null, adFree: true });
    }
    const consentCookie = parseConsentCookie(req);
    if (!consentCookie?.advertising) {
      return res.json({ ad: null, adFree: false, consentRequired: true });
    }

    const adType = String(req.query.type || 'banner');
    const sourcePlatform = String(req.query.sourcePlatform || '');
    // Strictly never inject or serve video ads alongside third-party/YouTube video players
    if (adType === 'video-preroll' && sourcePlatform && sourcePlatform !== '2mr_hosted') {
      return res.json({ ad: null, adFree: false, blockedThirdPartyVideoAd: true });
    }

    const [ad] = await db
      .select()
      .from(adCampaigns)
      .where(and(eq(adCampaigns.status, 'active'), eq(adCampaigns.adType, adType)))
      .limit(1);

    if (!ad) {
      // Check new advertisements table before falling back
      const formatMap: Record<string, string> = {
        banner: 'banner',
        'sponsored-result': 'search_sponsored',
        sidebar: 'sidebar_ad',
        'sponsored-card': 'sponsored_card',
      };
      const targetFormat = formatMap[adType] || 'banner';
      const [newAd] = await db
        .select()
        .from(advertisements)
        .where(and(eq(advertisements.isActive, true), eq(advertisements.adFormat, targetFormat)))
        .limit(1);
      if (newAd) {
        return res.json({
          ad: {
            id: newAd.id,
            title: newAd.headline || newAd.title,
            description: newAd.description,
            ctaText: newAd.ctaText,
            ctaUrl: newAd.ctaUrl,
            adType,
            sourceTable: 'advertisements',
          },
          adFree: false,
        });
      }

      const [fallbackAd] = await db
        .select()
        .from(adCampaigns)
        .where(eq(adCampaigns.status, 'active'))
        .limit(1);
      return res.json({ ad: fallbackAd || null, adFree: false });
    }

    return res.json({ ad, adFree: false });
  } catch (err) {
    return res.json({ ad: null, adFree: false });
  }
});

app.post('/api/ads/event', async (req: AuthRequest, res: Response) => {
  try {
    const consentCookie = parseConsentCookie(req);
    if (!consentCookie?.advertising) {
      return res.json({ success: true, trackingSkipped: true });
    }
    const { campaignId, eventType, sourceTable } = req.body || {};
    if (!campaignId || !['impression', 'click', 'completion'].includes(eventType)) {
      return res.status(400).json({ error: 'Invalid ad event payload.' });
    }
    if (sourceTable === 'advertisements') {
      await db.insert(advertisementEvents).values({
        advertisementId: campaignId,
        eventType,
        userId: req.currentUser?.id || null,
      });
      return res.json({ success: true });
    }
    await db.insert(adEvents).values({
      campaignId,
      eventType,
      userId: req.currentUser?.id || null,
    });
    if (eventType === 'impression') {
      await db
        .update(adCampaigns)
        .set({ impressions: sql`${adCampaigns.impressions} + 1` })
        .where(eq(adCampaigns.id, campaignId));
    } else if (eventType === 'click') {
      await db
        .update(adCampaigns)
        .set({ clicks: sql`${adCampaigns.clicks} + 1` })
        .where(eq(adCampaigns.id, campaignId));
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to record ad event.' });
  }
});

// =========================================================================
// 12. ADMIN CONSOLE ROUTES (STRICTLY PROTECTED BY requireAdmin)
// =========================================================================

app.get('/api/admin/overview', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const [
      [{ value: totalUsers }],
      [{ value: premiumUsers }],
      [{ value: totalSearches }],
      [{ value: totalDocs }],
      [{ value: totalVideos }],
      [{ value: newFeedback }],
      [{ value: activeAds }],
      recentPayments,
      recentAudits,
      allCampaigns,
    ] = await Promise.all([
      db.select({ value: count() }).from(users).where(eq(users.isSynthetic, false)),
      db.select({ value: count() }).from(users).where(and(eq(users.isSynthetic, false), eq(users.role, 'premium'))),
      db.select({ value: count() }).from(searchHistory).where(eq(searchHistory.isSynthetic, false)),
      db.select({ value: count() }).from(indexedDocuments),
      db.select({ value: count() }).from(videos),
      db
        .select({ value: count() })
        .from(feedbackSubmissions)
        .where(and(eq(feedbackSubmissions.isSynthetic, false), eq(feedbackSubmissions.status, 'new'))),
      db.select({ value: count() }).from(adCampaigns).where(eq(adCampaigns.status, 'active')),
      db.select().from(payments).where(eq(payments.isSynthetic, false)).orderBy(desc(payments.createdAt)).limit(5),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(8),
      db.select().from(adCampaigns),
    ]);

    const totalImpressions = allCampaigns.reduce((acc, c) => acc + c.impressions, 0);
    const totalClicks = allCampaigns.reduce((acc, c) => acc + c.clicks, 0);

    return res.json({
      stats: {
        totalUsers,
        premiumUsers,
        totalSearches,
        totalDocs,
        totalVideos,
        newFeedback,
        activeAds,
        totalImpressions,
        totalClicks,
      },
      recentPayments,
      recentAudits,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load admin overview.' });
  }
});

app.get('/api/admin/users', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(10, Number(req.query.limit || 50)));
    const offset = (page - 1) * limit;
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.isSynthetic, false))
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);
    return res.json({ users: rows.map(mapUserRow), page, limit });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load users.' });
  }
});

app.patch('/api/admin/users/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { role, status } = req.body || {};
    const [target] = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    if (target.email === '2mr@proton.me' && ((role && role !== 'admin') || status === 'suspended')) {
      return res.status(400).json({ error: 'Cannot downgrade or suspend the primary official administrator.' });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (role && ['free', 'premium', 'admin'].includes(role)) {
      updates.role = role;
      updates.aiQueriesLimit = role === 'free' ? 50 : 5000;
      updates.storageLimitMb = role === 'free' ? 1024 : 51200;
    }
    if (status && ['active', 'suspended'].includes(status)) {
      updates.status = status;
    }

    const [updated] = await db.update(users).set(updates).where(eq(users.id, target.id)).returning();
    await logAudit({ id: req.currentUser!.id, email: req.currentUser!.email }, 'ADMIN_USER_UPDATE', 'users', {
      targetUser: target.email,
      updates,
    });
    return res.json({ user: mapUserRow(updated) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update user.' });
  }
});

app.get('/api/admin/advertisements', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db.select().from(adCampaigns).orderBy(desc(adCampaigns.createdAt));
    return res.json({ campaigns: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load campaigns.' });
  }
});

app.post('/api/admin/advertisements', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { advertiserName, campaignName, adType, headline, description, ctaText, ctaUrl, targetCategory, budget, startDate, endDate } =
      req.body || {};
    if (!advertiserName || !campaignName || !headline || !ctaUrl) {
      return res.status(400).json({ error: 'Advertiser, campaign name, headline, and CTA URL are required.' });
    }
    const [created] = await db
      .insert(adCampaigns)
      .values({
        advertiserName: String(advertiserName).trim(),
        campaignName: String(campaignName).trim(),
        adType: adType || 'banner',
        headline: String(headline).trim(),
        description: String(description || ''),
        ctaText: String(ctaText || 'Learn More'),
        ctaUrl: String(ctaUrl).trim(),
        targetCategory: String(targetCategory || 'All'),
        budget: Number(budget || 0),
        startDate: startDate || null,
        endDate: endDate || null,
        status: 'active',
      })
      .returning();

    await logAudit({ id: req.currentUser!.id, email: req.currentUser!.email }, 'AD_CAMPAIGN_CREATED', 'ad_campaigns', {
      campaignId: created.id,
    });
    return res.status(201).json({ campaign: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create campaign.' });
  }
});

app.patch('/api/admin/advertisements/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const allowed = ['status', 'headline', 'description', 'ctaText', 'ctaUrl', 'targetCategory', 'budget'];
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    const [updated] = await db.update(adCampaigns).set(updates).where(eq(adCampaigns.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ error: 'Campaign not found.' });
    return res.json({ campaign: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update campaign.' });
  }
});

app.delete('/api/admin/advertisements/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(adCampaigns).where(eq(adCampaigns.id, req.params.id));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete campaign.' });
  }
});

app.get('/api/admin/content', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const [docs, vids, cats] = await Promise.all([
      db.select().from(indexedDocuments).orderBy(desc(indexedDocuments.createdAt)),
      db.select().from(videos).orderBy(desc(videos.createdAt)),
      db.select().from(categories).orderBy(categories.name),
    ]);
    return res.json({ documents: docs, videos: vids, categories: cats });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load content.' });
  }
});

app.post('/api/admin/content/documents', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, url, snippet, modality, sourceName, publishedDate, categorySlug, doi, isFeatured } = req.body || {};
    if (!title || !url || !snippet || !sourceName) {
      return res.status(400).json({ error: 'Title, URL, snippet, and source name are required.' });
    }
    let domain = '2mr.org';
    try {
      domain = new URL(String(url)).hostname.replace(/^www\./, '');
    } catch {
      // keep default
    }

    const [created] = await db
      .insert(indexedDocuments)
      .values({
        title: String(title).trim(),
        url: String(url).trim(),
        domain,
        snippet: String(snippet).trim(),
        modality: modality || 'research',
        sourceName: String(sourceName).trim(),
        publishedDate: publishedDate || new Date().toISOString().slice(0, 10),
        categorySlug: categorySlug || 'technology',
        doi: doi || null,
        isFeatured: Boolean(isFeatured),
        isPublished: true,
      })
      .returning();

    return res.status(201).json({ document: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create document.' });
  }
});

app.patch('/api/admin/content/documents/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { isFeatured, isPublished } = req.body || {};
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (typeof isFeatured === 'boolean') updates.isFeatured = isFeatured;
    if (typeof isPublished === 'boolean') updates.isPublished = isPublished;
    const [updated] = await db
      .update(indexedDocuments)
      .set(updates)
      .where(eq(indexedDocuments.id, req.params.id))
      .returning();
    return res.json({ document: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update document.' });
  }
});

app.delete('/api/admin/content/documents/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(indexedDocuments).where(eq(indexedDocuments.id, req.params.id));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete document.' });
  }
});

app.post('/api/admin/content/videos', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, channel, description, categorySlug, duration, videoUrl, aiSummary, isFeatured } = req.body || {};
    if (!title || !channel || !videoUrl) {
      return res.status(400).json({ error: 'Title, channel, and video URL are required.' });
    }
    const [created] = await db
      .insert(videos)
      .values({
        title: String(title).trim(),
        channel: String(channel).trim(),
        description: String(description || ''),
        categorySlug: String(categorySlug || 'technology'),
        duration: String(duration || '15:00'),
        videoUrl: String(videoUrl).trim(),
        thumbnailUrl: '/src/assets/images/video_ai_systems_1794549072309.jpg',
        aiSummary: aiSummary || null,
        isFeatured: Boolean(isFeatured),
        isPublished: true,
        publishedAt: new Date().toISOString().slice(0, 10),
      })
      .returning();
    return res.status(201).json({ video: created });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create video.' });
  }
});

app.patch('/api/admin/content/videos/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { isFeatured, isPublished } = req.body || {};
    const updates: Record<string, any> = {};
    if (typeof isFeatured === 'boolean') updates.isFeatured = isFeatured;
    if (typeof isPublished === 'boolean') updates.isPublished = isPublished;
    const [updated] = await db.update(videos).set(updates).where(eq(videos.id, req.params.id)).returning();
    return res.json({ video: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update video.' });
  }
});

app.delete('/api/admin/content/videos/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(videos).where(eq(videos.id, req.params.id));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete video.' });
  }
});

app.get('/api/admin/feedback', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status ? String(req.query.status) : 'all';
    const rows =
      status !== 'all'
        ? await db
            .select()
            .from(feedbackSubmissions)
            .where(and(eq(feedbackSubmissions.isSynthetic, false), eq(feedbackSubmissions.status, status)))
            .orderBy(desc(feedbackSubmissions.createdAt))
            .limit(100)
        : await db
            .select()
            .from(feedbackSubmissions)
            .where(eq(feedbackSubmissions.isSynthetic, false))
            .orderBy(desc(feedbackSubmissions.createdAt))
            .limit(100);

    return res.json({ feedback: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load feedback submissions.' });
  }
});

app.patch('/api/admin/feedback/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, internalNotes } = req.body || {};
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status && ['new', 'in_review', 'replied', 'resolved', 'archived'].includes(status)) {
      updates.status = status;
    }
    if (internalNotes !== undefined) updates.internalNotes = internalNotes;

    const [updated] = await db
      .update(feedbackSubmissions)
      .set(updates)
      .where(eq(feedbackSubmissions.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Feedback not found.' });
    await logAudit({ id: req.currentUser!.id, email: req.currentUser!.email }, 'ADMIN_FEEDBACK_UPDATE', 'feedback_submissions', {
      id: updated.id,
      status: updated.status,
    });
    return res.json({ feedback: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update feedback.' });
  }
});

app.post('/api/admin/feedback/:id/reply', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { replyMessage } = req.body || {};
    if (!replyMessage || !String(replyMessage).trim()) {
      return res.status(400).json({ error: 'Reply message is required.' });
    }

    const [fb] = await db
      .select()
      .from(feedbackSubmissions)
      .where(eq(feedbackSubmissions.id, req.params.id))
      .limit(1);
    if (!fb) return res.status(404).json({ error: 'Feedback submission not found.' });

    const emailRes = await sendAdminReplyEmail({
      recipientEmail: fb.email,
      recipientName: fb.fullName || 'Researcher',
      referenceNumber: fb.referenceNumber,
      originalSubject: fb.subject,
      replyMessage: String(replyMessage).trim(),
    });

    const [updated] = await db
      .update(feedbackSubmissions)
      .set({
        adminReply: String(replyMessage).trim(),
        repliedAt: new Date(),
        status: 'replied',
        updatedAt: new Date(),
      })
      .where(eq(feedbackSubmissions.id, fb.id))
      .returning();

    if (fb.userId) {
      await db.insert(notifications).values({
        userId: fb.userId,
        category: 'system',
        title: `Reply to ${fb.referenceNumber}`,
        message: String(replyMessage).trim().slice(0, 240),
      });
    }

    await logAudit({ id: req.currentUser!.id, email: req.currentUser!.email }, 'ADMIN_FEEDBACK_REPLY', 'feedback_submissions', {
      referenceNumber: fb.referenceNumber,
      emailDispatch: emailRes.status,
    });

    return res.json({ feedback: updated, emailStatus: emailRes.status });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send admin reply.' });
  }
});

app.get('/api/admin/payments', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const statusFilter = req.query.status ? String(req.query.status).toLowerCase() : 'all';
    const envFilter = req.query.environment ? String(req.query.environment).toLowerCase() : 'all';
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
    const dateFrom = req.query.from ? new Date(String(req.query.from)) : null;
    const dateTo = req.query.to ? new Date(String(req.query.to)) : null;

    const rows = await db
      .select({
        payment: payments,
        userEmail: users.email,
        userName: users.fullName,
      })
      .from(payments)
      .leftJoin(users, eq(payments.userId, users.id))
      .where(and(eq(payments.isSynthetic, false), eq(payments.isDemoTransaction, false)))
      .orderBy(desc(payments.createdAt))
      .limit(500);

    // Overall verified summary strictly from real non-demo transactions
    let totalCount = 0;
    let successfulCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let expiredCount = 0;
    let requiresReconciliationCount = 0;
    let verifiedRevenueRwf = 0;

    const formatted = rows.map((r) => {
      const { payerMsisdnHash: _omit, ...safePayment } = r.payment;
      totalCount += 1;
      if (safePayment.status === 'successful') {
        successfulCount += 1;
        if (safePayment.currency === 'RWF' && safePayment.verifiedAt) {
          verifiedRevenueRwf += Number(safePayment.amount || 0);
        }
      } else if (safePayment.status === 'pending') {
        pendingCount += 1;
      } else if (safePayment.status === 'expired') {
        expiredCount += 1;
      } else if (safePayment.status === 'requires_reconciliation') {
        requiresReconciliationCount += 1;
      } else if (safePayment.status === 'failed' || safePayment.status === 'rejected') {
        failedCount += 1;
      }
      return {
        ...safePayment,
        userEmail: r.userEmail,
        userName: r.userName,
      };
    });

    const filtered = formatted.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (envFilter !== 'all' && p.environment !== envFilter) return false;
      if (dateFrom && !Number.isNaN(dateFrom.getTime()) && new Date(p.createdAt) < dateFrom) return false;
      if (dateTo && !Number.isNaN(dateTo.getTime())) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (new Date(p.createdAt) > endOfDay) return false;
      }
      if (search) {
        const hay = `${p.transactionRef} ${p.externalId || ''} ${p.providerRef || ''} ${p.userEmail || ''} ${p.userName || ''} ${p.phoneMasked || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    await logAudit({ id: req.currentUser!.id, email: req.currentUser!.email }, 'ADMIN_PAYMENTS_ACCESSED', 'payments', {
      statusFilter,
      envFilter,
      returnedCount: filtered.length,
    });

    return res.json({
      summary: {
        totalCount,
        successfulCount,
        pendingCount,
        failedCount,
        expiredCount,
        requiresReconciliationCount,
        verifiedRevenueRwf,
      },
      payments: filtered.slice(0, 200),
      momoConfig: getMomoConfigStatus(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load payments.' });
  }
});

app.get('/api/admin/payments/export', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select({
        payment: payments,
        userEmail: users.email,
      })
      .from(payments)
      .leftJoin(users, eq(payments.userId, users.id))
      .where(and(eq(payments.isSynthetic, false), eq(payments.isDemoTransaction, false)))
      .orderBy(desc(payments.createdAt))
      .limit(1000);

    await logAudit({ id: req.currentUser!.id, email: req.currentUser!.email }, 'ADMIN_PAYMENTS_EXPORTED', 'payments', {
      recordCount: rows.length,
    });

    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'TransactionRef',
      'ExternalId',
      'ProviderRef',
      'UserEmail',
      'MaskedPhone',
      'Amount',
      'Currency',
      'Environment',
      'Status',
      'ReconciliationStatus',
      'CreatedAt',
      'VerifiedAt',
    ].join(',');
    const lines = rows.map(({ payment: p, userEmail }) =>
      [
        p.transactionRef,
        p.externalId,
        p.providerRef,
        userEmail,
        p.phoneMasked,
        p.amount,
        p.currency,
        p.environment,
        p.status,
        p.reconciliationStatus,
        new Date(p.createdAt).toISOString(),
        p.verifiedAt ? new Date(p.verifiedAt).toISOString() : '',
      ]
        .map(esc)
        .join(',')
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="2mr-verified-payments.csv"');
    return res.send([header, ...lines].join('\n'));
  } catch {
    return res.status(500).json({ error: 'Failed to export payment report.' });
  }
});

app.get('/api/admin/payments/:ref', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const [row] = await db
      .select({
        payment: payments,
        userEmail: users.email,
        userName: users.fullName,
      })
      .from(payments)
      .leftJoin(users, eq(payments.userId, users.id))
      .where(eq(payments.transactionRef, req.params.ref))
      .limit(1);

    if (!row) return res.status(404).json({ error: 'Transaction not found.' });

    const events = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.paymentId, row.payment.id))
      .orderBy(desc(paymentEvents.createdAt));

    await logAudit({ id: req.currentUser!.id, email: req.currentUser!.email }, 'ADMIN_PAYMENT_DETAIL_VIEWED', 'payments', {
      transactionRef: row.payment.transactionRef,
    });

    const { payerMsisdnHash: _omit, ...safePayment } = row.payment;
    return res.json({
      payment: { ...safePayment, userEmail: row.userEmail, userName: row.userName },
      events,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to load transaction detail.' });
  }
});

app.post('/api/admin/payments/reconcile-pending', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const results = await reconcilePendingMomoPayments({
      id: req.currentUser!.id,
      email: req.currentUser!.email,
    });
    return res.json({ checkedCount: results.length, results });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Batch reconciliation failed.' });
  }
});

app.post('/api/admin/payments/:ref/reconcile', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await verifyAndSyncMomoPayment({
      transactionRef: req.params.ref,
      source: 'admin_reconcile',
      actorEmail: req.currentUser!.email,
    });

    await logAudit({ id: req.currentUser!.id, email: req.currentUser!.email }, 'ADMIN_PAYMENT_RECONCILE', 'payments', {
      transactionRef: req.params.ref,
      status: result.payment.status,
      verified: result.verified,
    });

    return res.json(result);
  } catch (err: any) {
    if (err instanceof PaymentServiceError) {
      return res.status(err.statusCode).json({ error: err.message, ...(err.details || {}) });
    }
    return res.status(500).json({ error: 'Reconciliation failed.' });
  }
});

app.get('/api/admin/audit-logs', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(50);
    const support = await db.select().from(supportMessages).orderBy(desc(supportMessages.createdAt)).limit(25);
    return res.json({ auditLogs: logs, supportMessages: support });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

// =========================================================================
// VITE MIDDLEWARE INTEGRATION (DEV VS PROD)
// =========================================================================

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`2MR Platform server online at http://0.0.0.0:${PORT}`);
  });
}

startServer();
