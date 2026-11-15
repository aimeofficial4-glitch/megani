import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  users,
  cookieConsents,
  cookieConsentEvents,
  userPrivacyPreferences,
  aiProviders,
  aiProviderSettings,
  researchProjects,
  researchSources,
  researchNotes,
  savedItems,
  knowledgeNotes,
  aiConversations,
  aiMessages,
  searchHistory,
  feedbackSubmissions,
  notifications,
  auditLogs,
} from '../db/schema.ts';
import { AuthRequest, parseCookies, requireAuth } from '../middleware/auth.ts';

export const privacyRoutes = Router();

export const CURRENT_POLICY_VERSION = '2026.1';
export const VISITOR_COOKIE_NAME = '2mr_visitor_id';
export const CONSENT_COOKIE_NAME = '2mr_consent';

export interface ParsedConsentCookie {
  consentId?: string;
  necessary: boolean;
  analytics: boolean;
  personalization: boolean;
  advertising: boolean;
  action: 'accept_all' | 'reject_optional' | 'customized' | 'withdrawn';
  policyVersion: string;
}

export function parseConsentCookie(req: Request): ParsedConsentCookie | null {
  const cookies = parseCookies(req);
  const raw = cookies[CONSENT_COOKIE_NAME];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      consentId: parsed.consentId ? String(parsed.consentId) : undefined,
      necessary: true,
      analytics: Boolean(parsed.analytics),
      personalization: Boolean(parsed.personalization),
      advertising: Boolean(parsed.advertising),
      action:
        parsed.action === 'accept_all' ||
        parsed.action === 'reject_optional' ||
        parsed.action === 'customized' ||
        parsed.action === 'withdrawn'
          ? parsed.action
          : 'reject_optional',
      policyVersion: String(parsed.policyVersion || CURRENT_POLICY_VERSION),
    };
  } catch {
    return null;
  }
}

function setConsentCookies(
  res: Response,
  visitorId: string,
  payload: ParsedConsentCookie
) {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = 180 * 24 * 60 * 60 * 1000; // 180 days

  res.cookie(VISITOR_COOKIE_NAME, visitorId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge,
    path: '/',
  });

  res.cookie(CONSENT_COOKIE_NAME, JSON.stringify(payload), {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProd,
    maxAge,
    path: '/',
  });
}

async function resolveCurrentConsent(req: AuthRequest) {
  const cookies = parseCookies(req);
  const visitorId = cookies[VISITOR_COOKIE_NAME] || null;
  const userId = req.currentUser?.id || null;

  if (!userId && !visitorId) {
    return { visitorId: null, record: null };
  }

  let record: typeof cookieConsents.$inferSelect | null = null;

  if (userId && visitorId) {
    const rows = await db
      .select()
      .from(cookieConsents)
      .where(or(eq(cookieConsents.userId, userId), eq(cookieConsents.visitorId, visitorId)))
      .orderBy(desc(cookieConsents.updatedAt))
      .limit(2);
    // Prefer user-bound record if present, else link visitor record to user
    const userRec = rows.find((r) => r.userId === userId);
    const visitorRec = rows.find((r) => r.visitorId === visitorId);
    if (userRec) {
      record = userRec;
    } else if (visitorRec) {
      const [linked] = await db
        .update(cookieConsents)
        .set({ userId, updatedAt: new Date() })
        .where(eq(cookieConsents.id, visitorRec.id))
        .returning();
      record = linked || visitorRec;
    }
  } else if (userId) {
    const [row] = await db
      .select()
      .from(cookieConsents)
      .where(eq(cookieConsents.userId, userId))
      .orderBy(desc(cookieConsents.updatedAt))
      .limit(1);
    record = row || null;
  } else if (visitorId) {
    const [row] = await db
      .select()
      .from(cookieConsents)
      .where(eq(cookieConsents.visitorId, visitorId))
      .orderBy(desc(cookieConsents.updatedAt))
      .limit(1);
    record = row || null;
  }

  return { visitorId, record };
}

// 1. GET current consent status (anonymous visitor or authenticated user)
privacyRoutes.get('/consent', async (req: AuthRequest, res: Response) => {
  try {
    const { record } = await resolveCurrentConsent(req);
    const cookieFallback = parseConsentCookie(req);

    if (record) {
      return res.json({
        hasConsent: record.consentAction !== 'withdrawn',
        policyVersion: CURRENT_POLICY_VERSION,
        consent: {
          id: record.id,
          visitorId: record.visitorId,
          policyVersion: record.policyVersion,
          action: record.consentAction,
          necessary: true,
          analytics: record.analytics,
          personalization: record.personalization,
          advertising: record.advertising,
          consentedAt: record.consentedAt,
          updatedAt: record.updatedAt,
        },
      });
    }

    if (cookieFallback) {
      return res.json({
        hasConsent: cookieFallback.action !== 'withdrawn',
        policyVersion: CURRENT_POLICY_VERSION,
        consent: {
          id: cookieFallback.consentId || null,
          policyVersion: cookieFallback.policyVersion,
          action: cookieFallback.action,
          necessary: true,
          analytics: cookieFallback.analytics,
          personalization: cookieFallback.personalization,
          advertising: cookieFallback.advertising,
        },
      });
    }

    return res.json({
      hasConsent: false,
      policyVersion: CURRENT_POLICY_VERSION,
      consent: null,
    });
  } catch (err) {
    console.error('GET /api/privacy/consent error:', err);
    return res.status(500).json({ error: 'Failed to load consent preferences.' });
  }
});

// 2. POST save or update consent choice
privacyRoutes.post('/consent', async (req: AuthRequest, res: Response) => {
  try {
    const cookies = parseCookies(req);
    const visitorId = cookies[VISITOR_COOKIE_NAME] || crypto.randomUUID();
    const userId = req.currentUser?.id || null;

    const { action, analytics, personalization, advertising } = req.body || {};

    let resolvedAction: 'accept_all' | 'reject_optional' | 'customized' = 'reject_optional';
    let nextAnalytics = false;
    let nextPersonalization = false;
    let nextAdvertising = false;

    if (action === 'accept_all') {
      resolvedAction = 'accept_all';
      nextAnalytics = true;
      nextPersonalization = true;
      nextAdvertising = true;
    } else if (action === 'reject_optional') {
      resolvedAction = 'reject_optional';
      nextAnalytics = false;
      nextPersonalization = false;
      nextAdvertising = false;
    } else {
      resolvedAction = 'customized';
      nextAnalytics = Boolean(analytics);
      nextPersonalization = Boolean(personalization);
      nextAdvertising = Boolean(advertising);
    }

    const { record: existing } = await resolveCurrentConsent(req);
    const now = new Date();
    let savedRecord: typeof cookieConsents.$inferSelect;
    let eventType: 'initial_consent' | 'preference_updated' = 'initial_consent';

    if (existing) {
      eventType = 'preference_updated';
      const [updated] = await db
        .update(cookieConsents)
        .set({
          userId: userId || existing.userId,
          policyVersion: CURRENT_POLICY_VERSION,
          consentAction: resolvedAction,
          necessary: true,
          analytics: nextAnalytics,
          personalization: nextPersonalization,
          advertising: nextAdvertising,
          updatedAt: now,
        })
        .where(eq(cookieConsents.id, existing.id))
        .returning();
      savedRecord = updated;
    } else {
      const [inserted] = await db
        .insert(cookieConsents)
        .values({
          userId,
          visitorId,
          policyVersion: CURRENT_POLICY_VERSION,
          consentAction: resolvedAction,
          necessary: true,
          analytics: nextAnalytics,
          personalization: nextPersonalization,
          advertising: nextAdvertising,
          consentedAt: now,
          updatedAt: now,
        })
        .returning();
      savedRecord = inserted;
    }

    await db.insert(cookieConsentEvents).values({
      consentId: savedRecord.id,
      eventType,
      consentAction: resolvedAction,
      policyVersion: CURRENT_POLICY_VERSION,
      analytics: nextAnalytics,
      personalization: nextPersonalization,
      advertising: nextAdvertising,
    });

    setConsentCookies(res, savedRecord.visitorId, {
      consentId: savedRecord.id,
      necessary: true,
      analytics: nextAnalytics,
      personalization: nextPersonalization,
      advertising: nextAdvertising,
      action: resolvedAction,
      policyVersion: CURRENT_POLICY_VERSION,
    });

    return res.json({
      hasConsent: true,
      policyVersion: CURRENT_POLICY_VERSION,
      consent: {
        id: savedRecord.id,
        visitorId: savedRecord.visitorId,
        policyVersion: savedRecord.policyVersion,
        action: savedRecord.consentAction,
        necessary: true,
        analytics: savedRecord.analytics,
        personalization: savedRecord.personalization,
        advertising: savedRecord.advertising,
        consentedAt: savedRecord.consentedAt,
        updatedAt: savedRecord.updatedAt,
      },
    });
  } catch (err) {
    console.error('POST /api/privacy/consent error:', err);
    return res.status(500).json({ error: 'Failed to save cookie consent preferences.' });
  }
});

// 3. DELETE withdraw optional cookie consent
privacyRoutes.delete('/consent', async (req: AuthRequest, res: Response) => {
  try {
    const cookies = parseCookies(req);
    const visitorId = cookies[VISITOR_COOKIE_NAME] || crypto.randomUUID();
    const { record: existing } = await resolveCurrentConsent(req);
    const now = new Date();
    let savedRecord: typeof cookieConsents.$inferSelect;

    if (existing) {
      const [updated] = await db
        .update(cookieConsents)
        .set({
          consentAction: 'withdrawn',
          necessary: true,
          analytics: false,
          personalization: false,
          advertising: false,
          policyVersion: CURRENT_POLICY_VERSION,
          updatedAt: now,
        })
        .where(eq(cookieConsents.id, existing.id))
        .returning();
      savedRecord = updated;
    } else {
      const [inserted] = await db
        .insert(cookieConsents)
        .values({
          userId: req.currentUser?.id || null,
          visitorId,
          policyVersion: CURRENT_POLICY_VERSION,
          consentAction: 'withdrawn',
          necessary: true,
          analytics: false,
          personalization: false,
          advertising: false,
          consentedAt: now,
          updatedAt: now,
        })
        .returning();
      savedRecord = inserted;
    }

    await db.insert(cookieConsentEvents).values({
      consentId: savedRecord.id,
      eventType: 'consent_withdrawn',
      consentAction: 'withdrawn',
      policyVersion: CURRENT_POLICY_VERSION,
      analytics: false,
      personalization: false,
      advertising: false,
    });

    setConsentCookies(res, savedRecord.visitorId, {
      consentId: savedRecord.id,
      necessary: true,
      analytics: false,
      personalization: false,
      advertising: false,
      action: 'withdrawn',
      policyVersion: CURRENT_POLICY_VERSION,
    });

    return res.json({
      hasConsent: false,
      policyVersion: CURRENT_POLICY_VERSION,
      consent: {
        id: savedRecord.id,
        visitorId: savedRecord.visitorId,
        policyVersion: savedRecord.policyVersion,
        action: savedRecord.consentAction,
        necessary: true,
        analytics: false,
        personalization: false,
        advertising: false,
        consentedAt: savedRecord.consentedAt,
        updatedAt: savedRecord.updatedAt,
      },
    });
  } catch (err) {
    console.error('DELETE /api/privacy/consent error:', err);
    return res.status(500).json({ error: 'Failed to withdraw consent.' });
  }
});

// 4. GET authenticated user's privacy settings & transparency summary
privacyRoutes.get('/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.currentUser!.id;
    let [prefs] = await db
      .select()
      .from(userPrivacyPreferences)
      .where(eq(userPrivacyPreferences.userId, userId))
      .limit(1);

    if (!prefs) {
      const [created] = await db
        .insert(userPrivacyPreferences)
        .values({
          userId,
          aiPersonalizationOptIn: false,
          aiHistoryRetention: true,
          searchHistoryTracking: true,
          researchDefaultVisibility: 'private',
          deletionStatus: 'none',
        })
        .onConflictDoNothing({ target: userPrivacyPreferences.userId })
        .returning();
      if (created) {
        prefs = created;
      } else {
        [prefs] = await db
          .select()
          .from(userPrivacyPreferences)
          .where(eq(userPrivacyPreferences.userId, userId))
          .limit(1);
      }
    }

    const [
      { record: consentRecord },
      providers,
      aiSettingsRows,
      countsRes,
    ] = await Promise.all([
      resolveCurrentConsent(req),
      db
        .select({
          slug: aiProviders.slug,
          name: aiProviders.name,
          isEnabled: aiProviders.isEnabled,
          healthStatus: aiProviders.healthStatus,
        })
        .from(aiProviders),
      db.select().from(aiProviderSettings).limit(1),
      db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM research_projects WHERE user_id = ${userId}) AS projects,
          (SELECT COUNT(*)::int FROM saved_items WHERE user_id = ${userId}) AS saved_items,
          (SELECT COUNT(*)::int FROM knowledge_notes WHERE user_id = ${userId}) AS notes,
          (SELECT COUNT(*)::int FROM ai_conversations WHERE user_id = ${userId}) AS ai_threads,
          (SELECT COUNT(*)::int FROM search_history WHERE user_id = ${userId}) AS searches
      `),
    ]);

    const counts = (countsRes as any).rows?.[0] || {};
    const aiSettings = aiSettingsRows[0] || null;

    return res.json({
      preferences: prefs,
      consent: consentRecord
        ? {
            id: consentRecord.id,
            policyVersion: consentRecord.policyVersion,
            action: consentRecord.consentAction,
            necessary: true,
            analytics: consentRecord.analytics,
            personalization: consentRecord.personalization,
            advertising: consentRecord.advertising,
            consentedAt: consentRecord.consentedAt,
            updatedAt: consentRecord.updatedAt,
          }
        : null,
      aiPrivacy: {
        disclosure:
          aiSettings?.privacyDisclosureText ||
          '2MR processes submitted research questions and uploaded documents through authorized server-side AI provider APIs and external scholarly indexes solely to generate and verify your requested responses.',
        essentialProcessingNote:
          'Disabling optional cookies or optional AI personalization does not disable core server-side processing strictly necessary to answer a question or document analysis you explicitly submit.',
        providers: providers.map((p) => ({
          slug: p.slug,
          name: p.name,
          enabled: p.isEnabled,
          configured:
            (p.slug === 'gemini' && Boolean(process.env.GEMINI_API_KEY)) ||
            (p.slug === 'openai' && Boolean(process.env.OPENAI_API_KEY)) ||
            (p.slug === 'anthropic' && Boolean(process.env.ANTHROPIC_API_KEY)) ||
            (p.slug === 'custom' && Boolean(process.env.CUSTOM_AI_ENDPOINT)),
        })),
      },
      connectedServices: [
        {
          name: 'Google Authentication (Firebase Auth)',
          status: req.currentUser?.uid ? 'Connected' : 'Available (Email/Password active)',
          purpose: 'Optional sign-in identity verification using OAuth tokens.',
        },
        {
          name: 'YouTube Educational Video Embeds',
          status: 'Active for educational discovery',
          purpose: 'Third-party video embeds operate under YouTube policies; 2MR never injects ads into external players.',
        },
        {
          name: 'MTN Mobile Money Rwanda & Card Checkout',
          status: 'On-demand checkout only',
          purpose: 'Used strictly when initiating a subscription payment; PINs and CVVs are never collected or stored by 2MR.',
        },
        {
          name: 'External Academic Indexes (CrossRef, OpenAlex, arXiv, Wikipedia)',
          status: 'Server-side retrieval',
          purpose: 'Queried server-side by topic keywords to cite verifiable sources without sharing your personal email.',
        },
      ],
      researchSummary: {
        projects: Number(counts.projects || 0),
        savedItems: Number(counts.saved_items || 0),
        notes: Number(counts.notes || 0),
        aiThreads: Number(counts.ai_threads || 0),
        searches: Number(counts.searches || 0),
      },
      privacyContact: {
        email: '2mr@proton.me',
        phone: '0780558358',
        organization: '2MR – To Master Research',
      },
    });
  } catch (err) {
    console.error('GET /api/privacy/settings error:', err);
    return res.status(500).json({ error: 'Failed to load privacy settings.' });
  }
});

// 5. PATCH update user's AI & research privacy preferences
privacyRoutes.patch('/settings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.currentUser!.id;
    const {
      aiPersonalizationOptIn,
      aiHistoryRetention,
      searchHistoryTracking,
      researchDefaultVisibility,
    } = req.body || {};

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (typeof aiPersonalizationOptIn === 'boolean') updates.aiPersonalizationOptIn = aiPersonalizationOptIn;
    if (typeof aiHistoryRetention === 'boolean') updates.aiHistoryRetention = aiHistoryRetention;
    if (typeof searchHistoryTracking === 'boolean') updates.searchHistoryTracking = searchHistoryTracking;
    if (researchDefaultVisibility === 'private' || researchDefaultVisibility === 'workspace_only') {
      updates.researchDefaultVisibility = researchDefaultVisibility;
    }

    const [existing] = await db
      .select()
      .from(userPrivacyPreferences)
      .where(eq(userPrivacyPreferences.userId, userId))
      .limit(1);

    let saved;
    if (existing) {
      [saved] = await db
        .update(userPrivacyPreferences)
        .set(updates)
        .where(eq(userPrivacyPreferences.userId, userId))
        .returning();
    } else {
      [saved] = await db
        .insert(userPrivacyPreferences)
        .values({
          userId,
          aiPersonalizationOptIn: Boolean(aiPersonalizationOptIn),
          aiHistoryRetention: aiHistoryRetention !== undefined ? Boolean(aiHistoryRetention) : true,
          searchHistoryTracking: searchHistoryTracking !== undefined ? Boolean(searchHistoryTracking) : true,
          researchDefaultVisibility:
            researchDefaultVisibility === 'workspace_only' ? 'workspace_only' : 'private',
          deletionStatus: 'none',
        })
        .returning();
    }

    await db.insert(auditLogs).values({
      actorUserId: userId,
      actorEmail: req.currentUser!.email,
      action: 'USER_PRIVACY_SETTINGS_UPDATED',
      resource: 'user_privacy_preferences',
      details: updates,
    });

    return res.json({ preferences: saved });
  } catch (err) {
    console.error('PATCH /api/privacy/settings error:', err);
    return res.status(500).json({ error: 'Failed to update privacy settings.' });
  }
});

// 6. GET Download My Data (complete personal JSON archive, zero secrets)
privacyRoutes.get('/export', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.currentUser!.id;
    const [userRow] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        organization: users.organization,
        role: users.role,
        preferredLanguage: users.preferredLanguage,
        preferredTheme: users.preferredTheme,
        country: users.country,
        city: users.city,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [
      prefs,
      consents,
      projects,
      items,
      notes,
      conversations,
      searches,
      feedback,
    ] = await Promise.all([
      db.select().from(userPrivacyPreferences).where(eq(userPrivacyPreferences.userId, userId)).limit(1),
      db
        .select({
          id: cookieConsents.id,
          policyVersion: cookieConsents.policyVersion,
          consentAction: cookieConsents.consentAction,
          necessary: cookieConsents.necessary,
          analytics: cookieConsents.analytics,
          personalization: cookieConsents.personalization,
          advertising: cookieConsents.advertising,
          consentedAt: cookieConsents.consentedAt,
          updatedAt: cookieConsents.updatedAt,
        })
        .from(cookieConsents)
        .where(eq(cookieConsents.userId, userId)),
      db.select().from(researchProjects).where(eq(researchProjects.userId, userId)),
      db.select().from(savedItems).where(eq(savedItems.userId, userId)),
      db.select().from(knowledgeNotes).where(eq(knowledgeNotes.userId, userId)),
      db.select().from(aiConversations).where(eq(aiConversations.userId, userId)),
      db.select().from(searchHistory).where(eq(searchHistory.userId, userId)).orderBy(desc(searchHistory.createdAt)).limit(500),
      db
        .select({
          referenceNumber: feedbackSubmissions.referenceNumber,
          category: feedbackSubmissions.category,
          subject: feedbackSubmissions.subject,
          message: feedbackSubmissions.message,
          status: feedbackSubmissions.status,
          createdAt: feedbackSubmissions.createdAt,
        })
        .from(feedbackSubmissions)
        .where(eq(feedbackSubmissions.userId, userId)),
    ]);

    const projectDetails = await Promise.all(
      projects.map(async (proj) => {
        const [sources, pNotes] = await Promise.all([
          db.select().from(researchSources).where(eq(researchSources.projectId, proj.id)),
          db.select().from(researchNotes).where(eq(researchNotes.projectId, proj.id)),
        ]);
        return { ...proj, sources, notes: pNotes };
      })
    );

    const conversationDetails = await Promise.all(
      conversations.map(async (conv) => {
        const msgs = await db
          .select({ role: aiMessages.role, content: aiMessages.content, createdAt: aiMessages.createdAt })
          .from(aiMessages)
          .where(eq(aiMessages.conversationId, conv.id));
        return { ...conv, messages: msgs };
      })
    );

    const exportBundle = {
      exportedAt: new Date().toISOString(),
      platform: '2MR – To Master Research',
      account: userRow,
      privacyPreferences: prefs[0] || null,
      cookieConsentRecords: consents,
      researchProjects: projectDetails,
      savedLibraryItems: items,
      knowledgeNotes: notes,
      aiConversations: conversationDetails,
      recentSearchHistory: searches,
      feedbackSubmissions: feedback,
    };

    await db.insert(auditLogs).values({
      actorUserId: userId,
      actorEmail: req.currentUser!.email,
      action: 'USER_DATA_EXPORTED',
      resource: 'users',
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="2mr-my-data-export.json"');
    return res.send(JSON.stringify(exportBundle, null, 2));
  } catch (err) {
    console.error('GET /api/privacy/export error:', err);
    return res.status(500).json({ error: 'Failed to export personal data.' });
  }
});

// 7. POST Request Account Deletion
privacyRoutes.post('/deletion-request', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.currentUser!.id;
    if (req.currentUser!.email === '2mr@proton.me' || req.currentUser!.role === 'admin') {
      return res.status(403).json({
        error: 'Protected official administrator accounts cannot request self-deletion.',
      });
    }

    const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 500) : null;
    const now = new Date();

    const [existing] = await db
      .select()
      .from(userPrivacyPreferences)
      .where(eq(userPrivacyPreferences.userId, userId))
      .limit(1);

    let saved;
    if (existing) {
      [saved] = await db
        .update(userPrivacyPreferences)
        .set({
          deletionRequestedAt: now,
          deletionStatus: 'requested',
          deletionReason: reason,
          updatedAt: now,
        })
        .where(eq(userPrivacyPreferences.userId, userId))
        .returning();
    } else {
      [saved] = await db
        .insert(userPrivacyPreferences)
        .values({
          userId,
          deletionRequestedAt: now,
          deletionStatus: 'requested',
          deletionReason: reason,
          updatedAt: now,
        })
        .returning();
    }

    const [adminUser] = await db.select().from(users).where(eq(users.email, '2mr@proton.me')).limit(1);
    if (adminUser) {
      await db.insert(notifications).values({
        userId: adminUser.id,
        category: 'security',
        title: 'Account Deletion Request Submitted',
        message: `User ${req.currentUser!.email} submitted an account deletion request.${reason ? ` Reason: ${reason}` : ''}`,
      });
    }

    await db.insert(auditLogs).values({
      actorUserId: userId,
      actorEmail: req.currentUser!.email,
      action: 'ACCOUNT_DELETION_REQUESTED',
      resource: 'user_privacy_preferences',
      details: { reason },
    });

    return res.json({ preferences: saved, message: 'Account deletion request recorded.' });
  } catch (err) {
    console.error('POST /api/privacy/deletion-request error:', err);
    return res.status(500).json({ error: 'Failed to submit account deletion request.' });
  }
});

// 8. DELETE Cancel Account Deletion Request
privacyRoutes.delete('/deletion-request', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.currentUser!.id;
    const [saved] = await db
      .update(userPrivacyPreferences)
      .set({
        deletionStatus: 'cancelled',
        deletionRequestedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userPrivacyPreferences.userId, userId))
      .returning();

    return res.json({ preferences: saved || null, message: 'Account deletion request cancelled.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to cancel deletion request.' });
  }
});
