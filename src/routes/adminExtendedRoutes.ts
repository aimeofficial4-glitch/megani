import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { eq, desc, sql } from 'drizzle-orm';
import { createPool, db, getPoolMetrics, measureDbLatencyMs } from '../db/index.ts';
import {
  users,
  sessions,
  roles,
  permissions,
  rolePermissions,
  categories,
  videos,
  videoCategories,
  videoTags,
  videoReviews,
  videoViews,
  videoReports,
  videoAdSettings,
  videoSources,
  subscriptions,
  plans,
  payments,
  notifications,
  feedbackSubmissions,
  searchHistory,
  advertisers,
  advertisements,
  advertisementCampaigns,
  advertisementPlacements,
  adCampaigns,
  adImpressions,
  adClicks,
  aiProviders,
  aiProviderModels,
  aiProviderSettings,
  aiRequests,
  aiResponses,
  aiUsageLogs,
  aiCostRecords,
  aiVerificationRecords,
  adminAccounts,
  adminSessions,
  adminLoginLogs,
  adminSecurityEvents,
  adminAuditLogs,
  socialMediaSettings,
  platformSettings,
  auditLogs,
  brandKnowledge,
  brandAnnouncements,
} from '../db/schema.ts';
import {
  AuthRequest,
  requireAdmin,
  mapUserRow,
  hashToken,
  SESSION_COOKIE_NAME,
  rateLimit,
} from '../middleware/auth.ts';
import { ensureSeeded } from '../db/seed.ts';
import { encryptSecret, maskSecretLast4 } from '../services/secrets.ts';
import { testProviderConnection, invalidateAiConfigCache } from '../services/aiOrchestrator.ts';
import { getGeminiIntegrationStatus, testGeminiConnection } from '../services/geminiService.ts';
import { deleteStoredObject, ensureVideoCategoriesSeeded } from '../services/videoStorage.ts';
import {
  getGlobalVideoAdConfig,
  getOrDefaultVideoAdSettings,
  updateGlobalVideoAdConfig,
} from '../services/videoAdEngine.ts';
import { getCacheStats, clearPublicCache, PublicCacheNamespace } from '../services/cache.ts';
import { getBackgroundWorkerStats } from '../services/backgroundQueue.ts';
import {
  DEFAULT_GENERATOR_CONFIG,
  cancelRunningJob,
  deleteAllSyntheticData,
  generateAdditionalActivityJob,
  getDemoGeneratorStatus,
  querySyntheticUsersPaginated,
  start500kGenerationJob,
} from '../services/demoDataGenerator.ts';
import {
  ensureAdminAccountRecord,
  hashPasswordArgon2id,
  verifyPasswordArgon2id,
  handleAdminPasswordFailure,
  createAdminSessionRecord,
  recordAdminLoginAttempt,
  recordSecurityEvent,
  recordAdminAudit,
  setupAdminTotp,
  verifyAndEnableAdminTotp,
  verifyAdminTotpChallenge,
  isAuthorizedBootstrapAdminEmail,
} from '../services/adminAuth.ts';
import {
  DEFAULT_CORE_FEATURES,
  ensureBrandKnowledgeSeeded,
  getOfficialBrandKnowledge,
  invalidateBrandKnowledgeCache,
} from '../services/brandKnowledgeService.ts';

export const adminExtendedRoutes = Router();

function setAdminSessionCookie(res: Response, rawToken: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

async function issueDualSession(req: Request, res: Response, userId: string, adminAccountId: string) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    userId,
    tokenHash,
    userAgent: req.headers['user-agent']?.slice(0, 250) || 'Admin Browser',
    ipAddress: req.ip || 'unknown',
    expiresAt,
  });
  await createAdminSessionRecord({
    adminAccountId,
    userId,
    rawToken,
    ipAddress: req.ip || 'unknown',
    userAgent: req.headers['user-agent']?.slice(0, 250) || 'Admin Browser',
  });
  setAdminSessionCookie(res, rawToken);
}

// =========================================================================
// A. ADMIN AUTHENTICATION (Argon2id Password + 2FA + Google OAuth)
// =========================================================================

adminExtendedRoutes.post('/auth/login', rateLimit(60_000, 10), async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const { email, password, totpCode } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Administrator email and password are required.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const [userRow] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (!userRow || userRow.role !== 'admin' || userRow.status !== 'active') {
      await recordAdminLoginAttempt({
        email: normalizedEmail,
        authMethod: 'argon2_password',
        success: false,
        failureReason: 'Not an active administrator account',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({ error: 'Invalid administrator credentials.' });
    }

    const adminAcc = await ensureAdminAccountRecord(userRow.id, normalizedEmail);

    if (adminAcc.lockedUntil && adminAcc.lockedUntil > new Date()) {
      await recordAdminLoginAttempt({
        adminAccountId: adminAcc.id,
        email: normalizedEmail,
        authMethod: 'argon2_password',
        success: false,
        failureReason: 'Account temporarily locked',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(423).json({
        error: `Account temporarily locked due to repeated failed attempts. Try again after ${adminAcc.lockedUntil.toISOString()}.`,
      });
    }

    let valid = false;
    let initialBootstrapUsed = false;
    if (adminAcc.passwordHashArgon2) {
      valid = await verifyPasswordArgon2id(adminAcc.passwordHashArgon2, String(password));
    } else if (
      isAuthorizedBootstrapAdminEmail(normalizedEmail) &&
      process.env.ADMIN_INITIAL_PASSWORD &&
      String(password) === process.env.ADMIN_INITIAL_PASSWORD
    ) {
      valid = true;
      initialBootstrapUsed = true;
      const hash = await hashPasswordArgon2id(String(password));
      await db
        .update(adminAccounts)
        .set({ passwordHashArgon2: hash, mustChangePassword: true, updatedAt: new Date() })
        .where(eq(adminAccounts.id, adminAcc.id));
    } else {
      return res.status(401).json({
        error:
          'Password login is not initialized for this admin account. Sign in with authorized Google OAuth or set ADMIN_INITIAL_PASSWORD on the server.',
      });
    }

    if (!valid) {
      await handleAdminPasswordFailure(adminAcc, req.ip);
      await recordAdminLoginAttempt({
        adminAccountId: adminAcc.id,
        email: normalizedEmail,
        authMethod: 'argon2_password',
        success: false,
        failureReason: 'Invalid password',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({ error: 'Invalid administrator credentials.' });
    }

    if (adminAcc.totpEnabled) {
      if (!totpCode) {
        return res.json({ requires2fa: true, message: 'Enter your 6-digit authenticator code.' });
      }
      const totpOk = await verifyAdminTotpChallenge(adminAcc, String(totpCode));
      if (!totpOk) {
        await recordAdminLoginAttempt({
          adminAccountId: adminAcc.id,
          email: normalizedEmail,
          authMethod: '2fa_totp',
          success: false,
          failureReason: 'Invalid 2FA TOTP code',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
        return res.status(401).json({ error: 'Invalid two-factor authentication code.' });
      }
    }

    await issueDualSession(req, res, userRow.id, adminAcc.id);
    await recordAdminLoginAttempt({
      adminAccountId: adminAcc.id,
      email: normalizedEmail,
      authMethod: 'argon2_password',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    await recordAdminAudit({
      adminAccountId: adminAcc.id,
      actorEmail: normalizedEmail,
      action: 'ADMIN_LOGIN_PASSWORD',
      targetResource: 'admin_sessions',
      ipAddress: req.ip,
    });

    return res.json({
      user: mapUserRow(userRow),
      mustChangePassword: initialBootstrapUsed || adminAcc.mustChangePassword,
    });
  } catch (err) {
    console.error('POST /api/admin/auth/login error:', err);
    return res.status(500).json({ error: 'Administrator authentication failed.' });
  }
});

adminExtendedRoutes.post('/auth/google', async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    if (!req.currentUser) {
      return res.status(401).json({ error: 'Valid Google sign-in token is required.' });
    }
    if (req.currentUser.role !== 'admin') {
      await recordAdminLoginAttempt({
        email: req.currentUser.email,
        authMethod: 'google_oauth',
        success: false,
        failureReason: 'Unauthorized email attempted admin portal login',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      await recordSecurityEvent({
        eventType: 'UNAUTHORIZED_ADMIN_PORTAL_ATTEMPT',
        severity: 'warning',
        description: `Non-admin account ${req.currentUser.email} attempted to access /admin/login.`,
        ipAddress: req.ip,
      });
      return res.status(403).json({
        error: 'Access denied. Only authorized 2MR administrators may enter the Admin Console.',
      });
    }

    const adminAcc = await ensureAdminAccountRecord(req.currentUser.id, req.currentUser.email);
    await issueDualSession(req, res, req.currentUser.id, adminAcc.id);
    await recordAdminLoginAttempt({
      adminAccountId: adminAcc.id,
      email: req.currentUser.email,
      authMethod: 'google_oauth',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    await recordAdminAudit({
      adminAccountId: adminAcc.id,
      actorEmail: req.currentUser.email,
      action: 'ADMIN_LOGIN_GOOGLE',
      targetResource: 'admin_sessions',
      ipAddress: req.ip,
    });

    return res.json({
      user: req.currentUser,
      mustChangePassword: false,
    });
  } catch (err) {
    console.error('POST /api/admin/auth/google error:', err);
    return res.status(500).json({ error: 'Unable to authenticate administrator via Google.' });
  }
});

// =========================================================================
// ALL ROUTES BELOW STRICTLY REQUIRE ADMIN PRIVILEGE
// =========================================================================
adminExtendedRoutes.use(requireAdmin);

adminExtendedRoutes.post('/auth/change-password', async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 10) {
      return res.status(400).json({ error: 'Administrator password must be at least 10 characters.' });
    }

    const adminAcc = await ensureAdminAccountRecord(req.currentUser!.id, req.currentUser!.email);
    if (adminAcc.passwordHashArgon2 && !adminAcc.mustChangePassword) {
      const ok = currentPassword
        ? await verifyPasswordArgon2id(adminAcc.passwordHashArgon2, String(currentPassword))
        : false;
      if (!ok) return res.status(401).json({ error: 'Current administrator password is incorrect.' });
    }

    const newHash = await hashPasswordArgon2id(String(newPassword));
    await db
      .update(adminAccounts)
      .set({ passwordHashArgon2: newHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(adminAccounts.id, adminAcc.id));

    await recordSecurityEvent({
      adminAccountId: adminAcc.id,
      eventType: 'ADMIN_PASSWORD_ROTATED',
      severity: 'info',
      description: `Administrator ${req.currentUser!.email} updated Argon2id credentials.`,
      ipAddress: req.ip,
      notifyUserId: req.currentUser!.id,
    });
    await recordAdminAudit({
      adminAccountId: adminAcc.id,
      actorEmail: req.currentUser!.email,
      action: 'ADMIN_PASSWORD_CHANGED',
      targetResource: 'admin_accounts',
      ipAddress: req.ip,
    });

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to update administrator password.' });
  }
});

// =========================================================================
// B. ADMIN SECURITY CENTER (/admin/settings/security & /admin/audit-logs)
// =========================================================================

adminExtendedRoutes.get('/security/overview', async (req: AuthRequest, res: Response) => {
  try {
    const adminAcc = await ensureAdminAccountRecord(req.currentUser!.id, req.currentUser!.email);
    const [activeSessions, loginLogs, secEvents, audits, adminList] = await Promise.all([
      db
        .select()
        .from(adminSessions)
        .where(eq(adminSessions.adminAccountId, adminAcc.id))
        .orderBy(desc(adminSessions.createdAt))
        .limit(15),
      db.select().from(adminLoginLogs).orderBy(desc(adminLoginLogs.createdAt)).limit(30),
      db.select().from(adminSecurityEvents).orderBy(desc(adminSecurityEvents.createdAt)).limit(30),
      db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(40),
      db.select().from(adminAccounts).orderBy(desc(adminAccounts.createdAt)),
    ]);

    return res.json({
      account: {
        id: adminAcc.id,
        email: adminAcc.email,
        hasPassword: Boolean(adminAcc.passwordHashArgon2),
        mustChangePassword: adminAcc.mustChangePassword,
        totpEnabled: adminAcc.totpEnabled,
        lastLoginAt: adminAcc.lastLoginAt,
      },
      activeSessions,
      loginLogs,
      securityEvents: secEvents,
      adminAuditLogs: audits,
      administrators: adminList.map((a) => ({
        id: a.id,
        email: a.email,
        totpEnabled: a.totpEnabled,
        lastLoginAt: a.lastLoginAt,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load security overview.' });
  }
});

adminExtendedRoutes.post('/security/2fa/setup', async (req: AuthRequest, res: Response) => {
  try {
    const adminAcc = await ensureAdminAccountRecord(req.currentUser!.id, req.currentUser!.email);
    const data = await setupAdminTotp(adminAcc.id, req.currentUser!.email);
    return res.json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to initialize 2FA setup.' });
  }
});

adminExtendedRoutes.post('/security/2fa/verify', async (req: AuthRequest, res: Response) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: '6-digit verification code required.' });
    const adminAcc = await ensureAdminAccountRecord(req.currentUser!.id, req.currentUser!.email);
    const ok = await verifyAndEnableAdminTotp(adminAcc, String(code));
    if (!ok) return res.status(400).json({ error: 'Invalid verification code.' });

    await recordSecurityEvent({
      adminAccountId: adminAcc.id,
      eventType: 'ADMIN_2FA_ENABLED',
      severity: 'info',
      description: `TOTP 2FA enabled for ${req.currentUser!.email}.`,
      ipAddress: req.ip,
      notifyUserId: req.currentUser!.id,
    });
    return res.json({ success: true, totpEnabled: true });
  } catch {
    return res.status(500).json({ error: 'Failed to verify 2FA.' });
  }
});

adminExtendedRoutes.post('/security/2fa/disable', async (req: AuthRequest, res: Response) => {
  try {
    const adminAcc = await ensureAdminAccountRecord(req.currentUser!.id, req.currentUser!.email);
    await db
      .update(adminAccounts)
      .set({ totpEnabled: false, totpSecretEncrypted: null, updatedAt: new Date() })
      .where(eq(adminAccounts.id, adminAcc.id));
    await db.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, req.currentUser!.id));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to disable 2FA.' });
  }
});

adminExtendedRoutes.post('/security/logout-all', async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(sessions).where(eq(sessions.userId, req.currentUser!.id));
    await db
      .update(adminSessions)
      .set({ isActive: false })
      .where(eq(adminSessions.userId, req.currentUser!.id));
    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'ADMIN_LOGOUT_ALL_DEVICES',
      targetResource: 'admin_sessions',
      ipAddress: req.ip,
    });
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to revoke all devices.' });
  }
});

adminExtendedRoutes.post('/security/promote', async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Existing user email is required.' });
    const normalized = String(email).toLowerCase().trim();
    const [target] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
    if (!target) {
      return res.status(404).json({ error: 'User must register an account first before promotion.' });
    }

    await db
      .update(users)
      .set({ role: 'admin', aiQueriesLimit: 10000, storageLimitMb: 102400, updatedAt: new Date() })
      .where(eq(users.id, target.id));
    const acc = await ensureAdminAccountRecord(target.id, target.email);

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'ADMIN_PROMOTED_USER',
      targetResource: 'admin_accounts',
      targetId: acc.id,
      details: { promotedEmail: target.email },
      ipAddress: req.ip,
    });

    return res.json({ success: true, email: target.email });
  } catch {
    return res.status(500).json({ error: 'Failed to promote user to administrator.' });
  }
});

// =========================================================================
// C. ROLES & PERMISSIONS (/admin/roles)
// =========================================================================

adminExtendedRoutes.get('/roles', async (_req: AuthRequest, res: Response) => {
  try {
    const [allRoles, allPerms, mappings] = await Promise.all([
      db.select().from(roles).orderBy(roles.name),
      db.select().from(permissions).orderBy(permissions.code),
      db.select().from(rolePermissions),
    ]);
    return res.json({ roles: allRoles, permissions: allPerms, rolePermissions: mappings });
  } catch {
    return res.status(500).json({ error: 'Failed to load roles & permissions.' });
  }
});

adminExtendedRoutes.post('/roles', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Role name is required.' });
    const [created] = await db
      .insert(roles)
      .values({ name: String(name).trim().toLowerCase(), description: description || '' })
      .returning();
    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'ROLE_CREATED',
      targetResource: 'roles',
      targetId: created.id,
    });
    return res.status(201).json({ role: created });
  } catch {
    return res.status(500).json({ error: 'Failed to create role.' });
  }
});

adminExtendedRoutes.put('/roles/:id/permissions', async (req: AuthRequest, res: Response) => {
  try {
    const { permissionIds } = req.body || {};
    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({ error: 'permissionIds array required.' });
    }
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, req.params.id));
    if (permissionIds.length > 0) {
      await db.insert(rolePermissions).values(
        permissionIds.map((pid: string) => ({ roleId: req.params.id, permissionId: pid }))
      );
    }
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to update role permissions.' });
  }
});

// =========================================================================
// D. AI PROVIDERS & AI USAGE (/admin/ai-providers & /admin/ai-usage)
// =========================================================================

adminExtendedRoutes.get('/ai-providers', async (_req: AuthRequest, res: Response) => {
  try {
    const [provs, models, [settings]] = await Promise.all([
      db.select().from(aiProviders).orderBy(aiProviders.priority),
      db.select().from(aiProviderModels),
      db.select().from(aiProviderSettings).limit(1),
    ]);

    const safeProviders = provs.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      providerType: p.providerType,
      baseUrl: p.baseUrl,
      hasDbKey: Boolean(p.apiKeyEncrypted),
      hasEnvKey:
        (p.slug === 'gemini' && Boolean(process.env.GEMINI_API_KEY)) ||
        (p.slug === 'openai' && Boolean(process.env.OPENAI_API_KEY)) ||
        (p.slug === 'anthropic' && Boolean(process.env.ANTHROPIC_API_KEY)) ||
        (p.slug === 'custom' && Boolean(process.env.CUSTOM_AI_API_KEY)),
      apiKeyLast4: p.apiKeyLast4,
      isEnabled: p.isEnabled,
      isDefault: p.isDefault,
      priority: p.priority,
      rateLimitPerMin: p.rateLimitPerMin,
      healthStatus: p.healthStatus,
      lastCheckedAt: p.lastCheckedAt,
      lastError: p.lastError,
      models: models.filter((m) => m.providerId === p.id),
    }));

    return res.json({ providers: safeProviders, settings: settings || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load AI providers.' });
  }
});

adminExtendedRoutes.patch('/ai-providers/:slug', async (req: AuthRequest, res: Response) => {
  try {
    const [existing] = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.slug, req.params.slug))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'AI provider not found.' });

    const { isEnabled, isDefault, priority, rateLimitPerMin, baseUrl, apiKey, defaultModelId } = req.body || {};

    if (isDefault === true) {
      await db.update(aiProviders).set({ isDefault: false });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (typeof isEnabled === 'boolean') updates.isEnabled = isEnabled;
    if (typeof isDefault === 'boolean') updates.isDefault = isDefault;
    if (priority !== undefined) updates.priority = Number(priority);
    if (rateLimitPerMin !== undefined) updates.rateLimitPerMin = Number(rateLimitPerMin);
    if (baseUrl !== undefined) updates.baseUrl = baseUrl ? String(baseUrl).trim() : null;
    if (apiKey && String(apiKey).trim()) {
      updates.apiKeyEncrypted = encryptSecret(String(apiKey).trim());
      updates.apiKeyLast4 = maskSecretLast4(String(apiKey).trim());
      updates.healthStatus = 'configured';
      updates.lastError = null;
    }

    const [updated] = await db
      .update(aiProviders)
      .set(updates)
      .where(eq(aiProviders.id, existing.id))
      .returning();

    if (defaultModelId) {
      await db
        .update(aiProviderModels)
        .set({ isDefault: false })
        .where(eq(aiProviderModels.providerId, existing.id));
      await db
        .update(aiProviderModels)
        .set({ isDefault: true })
        .where(eq(aiProviderModels.id, String(defaultModelId)));
    }

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'AI_PROVIDER_UPDATED',
      targetResource: 'ai_providers',
      targetId: existing.slug,
      details: { isEnabled: updated.isEnabled, isDefault: updated.isDefault, priority: updated.priority },
      ipAddress: req.ip,
    });

    invalidateAiConfigCache();

    return res.json({ success: true, slug: updated.slug });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update AI provider.' });
  }
});

adminExtendedRoutes.post('/ai-providers/:slug/test', async (req: AuthRequest, res: Response) => {
  try {
    const result = await testProviderConnection(req.params.slug);
    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'AI_PROVIDER_TESTED',
      targetResource: 'ai_providers',
      targetId: req.params.slug,
      details: result,
      ipAddress: req.ip,
    });
    return res.json(result);
  } catch {
    return res.status(500).json({ error: 'Connection test failed.' });
  }
});

adminExtendedRoutes.patch('/ai-settings', async (req: AuthRequest, res: Response) => {
  try {
    const [existing] = await db.select().from(aiProviderSettings).limit(1);
    const {
      multiModelVerificationEnabled,
      autoFallbackEnabled,
      maxProvidersPerDeepQuery,
      timeoutMs,
      privacyDisclosureText,
    } = req.body || {};

    const payload = {
      multiModelVerificationEnabled: Boolean(multiModelVerificationEnabled),
      autoFallbackEnabled: Boolean(autoFallbackEnabled),
      maxProvidersPerDeepQuery: Math.max(1, Math.min(4, Number(maxProvidersPerDeepQuery || 3))),
      timeoutMs: Math.max(4000, Math.min(45000, Number(timeoutMs || 15000))),
      privacyDisclosureText: privacyDisclosureText
        ? String(privacyDisclosureText)
        : existing?.privacyDisclosureText,
      updatedBy: req.currentUser!.email,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(aiProviderSettings).set(payload).where(eq(aiProviderSettings.id, existing.id));
    } else {
      await db.insert(aiProviderSettings).values(payload);
    }

    invalidateAiConfigCache();
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to save AI orchestrator settings.' });
  }
});

adminExtendedRoutes.get('/ai-usage', async (_req: AuthRequest, res: Response) => {
  try {
    const [logs, costs, verifications, requests] = await Promise.all([
      db.select().from(aiUsageLogs).where(eq(aiUsageLogs.isSynthetic, false)).orderBy(desc(aiUsageLogs.createdAt)).limit(50),
      db.select().from(aiCostRecords).orderBy(desc(aiCostRecords.recordedAt)).limit(100),
      db.select().from(aiVerificationRecords).orderBy(desc(aiVerificationRecords.createdAt)).limit(25),
      db.select().from(aiRequests).where(eq(aiRequests.isSynthetic, false)).orderBy(desc(aiRequests.createdAt)).limit(25),
    ]);

    const providerStats: Record<
      string,
      { calls: number; failures: number; inputTokens: number; outputTokens: number; costUsd: number }
    > = {};

    for (const l of logs) {
      if (!providerStats[l.providerSlug]) {
        providerStats[l.providerSlug] = { calls: 0, failures: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      }
      providerStats[l.providerSlug].calls += 1;
      if (l.status !== 'success') providerStats[l.providerSlug].failures += 1;
      providerStats[l.providerSlug].inputTokens += l.inputTokens;
      providerStats[l.providerSlug].outputTokens += l.outputTokens;
    }

    for (const c of costs) {
      if (!providerStats[c.providerSlug]) {
        providerStats[c.providerSlug] = { calls: 0, failures: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      }
      providerStats[c.providerSlug].costUsd += c.estimatedCostMicroUsd / 1_000_000;
    }

    return res.json({ logs, costs, verifications, requests, providerStats });
  } catch {
    return res.status(500).json({ error: 'Failed to load AI usage analytics.' });
  }
});

adminExtendedRoutes.get('/gemini/status', async (_req: AuthRequest, res: Response) => {
  try {
    const status = await getGeminiIntegrationStatus();
    return res.json(status);
  } catch (err) {
    console.error('GET /api/admin/gemini/status error:', err);
    return res.status(500).json({ error: 'Failed to inspect Gemini integration status.' });
  }
});

adminExtendedRoutes.post('/gemini/test', rateLimit(60_000, 10), async (req: AuthRequest, res: Response) => {
  try {
    const result = await testGeminiConnection(req.currentUser?.email);
    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'GEMINI_INTEGRATION_TESTED',
      targetResource: 'gemini_integration',
      targetId: result.model,
      details: {
        ok: result.ok,
        configured: result.configured,
        status: result.connectionTestStatus,
        latencyMs: result.latencyMs,
      },
      ipAddress: req.ip,
    });
    return res.json(result);
  } catch (err) {
    console.error('POST /api/admin/gemini/test error:', err);
    return res.status(500).json({ error: 'Gemini connection test failed.' });
  }
});

adminExtendedRoutes.get('/ai-performance', async (_req: AuthRequest, res: Response) => {
  try {
    const [dbLatencyMs, recentReqs, recentResps, usageRows, costRows, provs, models, [settings]] = await Promise.all([
      measureDbLatencyMs(),
      db.select().from(aiRequests).where(eq(aiRequests.isSynthetic, false)).orderBy(desc(aiRequests.createdAt)).limit(150),
      db.select().from(aiResponses).orderBy(desc(aiResponses.createdAt)).limit(200),
      db.select().from(aiUsageLogs).where(eq(aiUsageLogs.isSynthetic, false)).orderBy(desc(aiUsageLogs.createdAt)).limit(200),
      db.select().from(aiCostRecords).orderBy(desc(aiCostRecords.recordedAt)).limit(200),
      db.select().from(aiProviders).orderBy(aiProviders.priority),
      db.select().from(aiProviderModels),
      db.select().from(aiProviderSettings).limit(1),
    ]);

    const latencies = recentReqs.map((r) => r.latencyMs || 0).filter((n) => n > 0).sort((a, b) => a - b);
    const ttfts = recentReqs.map((r) => r.ttftMs || r.latencyMs || 0).filter((n) => n > 0);
    const searchLatencies = recentReqs.map((r) => r.searchLatencyMs || 0).filter((n) => n > 0);
    const aiLatencies = recentReqs.map((r) => r.aiLatencyMs || 0).filter((n) => n > 0);

    const avg = (arr: number[]) =>
      arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const p95 =
      latencies.length > 0 ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : 0;

    const modeDistribution = { fast: 0, balanced: 0, deep: 0 };
    let cacheHitsInReqs = 0;
    let failedRequests = 0;
    for (const r of recentReqs) {
      const d = (r.researchDepth || 'fast').toLowerCase();
      if (d === 'deep') modeDistribution.deep += 1;
      else if (d === 'balanced') modeDistribution.balanced += 1;
      else modeDistribution.fast += 1;
      if (r.cacheHit) cacheHitsInReqs += 1;
      if (r.status !== 'completed') failedRequests += 1;
    }

    const timeoutResponses = recentResps.filter((r) => r.status === 'timeout').length;
    const providerBreakdown: Record<
      string,
      {
        calls: number;
        failures: number;
        timeouts: number;
        avgLatencyMs: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
      }
    > = {};

    const provLatencyAcc: Record<string, { sum: number; count: number }> = {};
    for (const resp of recentResps) {
      if (!providerBreakdown[resp.providerSlug]) {
        providerBreakdown[resp.providerSlug] = {
          calls: 0,
          failures: 0,
          timeouts: 0,
          avgLatencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        };
      }
      providerBreakdown[resp.providerSlug].calls += 1;
      if (resp.status === 'timeout') providerBreakdown[resp.providerSlug].timeouts += 1;
      if (resp.status !== 'success') providerBreakdown[resp.providerSlug].failures += 1;
      if (resp.latencyMs > 0) {
        provLatencyAcc[resp.providerSlug] = provLatencyAcc[resp.providerSlug] || { sum: 0, count: 0 };
        provLatencyAcc[resp.providerSlug].sum += resp.latencyMs;
        provLatencyAcc[resp.providerSlug].count += 1;
      }
    }

    for (const [slug, acc] of Object.entries(provLatencyAcc)) {
      if (providerBreakdown[slug] && acc.count > 0) {
        providerBreakdown[slug].avgLatencyMs = Math.round(acc.sum / acc.count);
      }
    }

    let totalTokens = 0;
    for (const u of usageRows) {
      if (!providerBreakdown[u.providerSlug]) {
        providerBreakdown[u.providerSlug] = {
          calls: 0,
          failures: 0,
          timeouts: 0,
          avgLatencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        };
      }
      providerBreakdown[u.providerSlug].inputTokens += u.inputTokens;
      providerBreakdown[u.providerSlug].outputTokens += u.outputTokens;
      totalTokens += u.inputTokens + u.outputTokens;
    }

    let totalCostUsd = 0;
    for (const c of costRows) {
      const usd = c.estimatedCostMicroUsd / 1_000_000;
      totalCostUsd += usd;
      if (providerBreakdown[c.providerSlug]) {
        providerBreakdown[c.providerSlug].costUsd += usd;
      }
    }

    const cacheStats = getCacheStats();

    return res.json({
      summary: {
        totalRequests: recentReqs.length,
        avgResponseTimeMs: avg(latencies),
        avgTtftMs: avg(ttfts),
        p95ResponseTimeMs: p95,
        avgSearchLatencyMs: avg(searchLatencies),
        avgAiLatencyMs: avg(aiLatencies),
        failedRequests,
        timeoutRequests: timeoutResponses,
        timeoutFrequencyPercent:
          recentResps.length > 0 ? Number(((timeoutResponses / recentResps.length) * 100).toFixed(1)) : 0,
        requestCacheHitPercent:
          recentReqs.length > 0 ? Number(((cacheHitsInReqs / recentReqs.length) * 100).toFixed(1)) : 0,
        totalTokens,
        totalCostUsd: Number(totalCostUsd.toFixed(4)),
        modeDistribution,
      },
      dbLatencyMs,
      dbPoolStats: getPoolMetrics(),
      cacheStats,
      workerStats: getBackgroundWorkerStats(),
      providerBreakdown,
      recentRequests: recentReqs.slice(0, 30),
      settings: settings || null,
      providers: provs.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        isEnabled: p.isEnabled,
        isDefault: p.isDefault,
        priority: p.priority,
        rateLimitPerMin: p.rateLimitPerMin,
        healthStatus: p.healthStatus,
        models: models.filter((m) => m.providerId === p.id),
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/ai-performance error:', err);
    return res.status(500).json({ error: 'Failed to load AI performance metrics.' });
  }
});

adminExtendedRoutes.patch('/ai-performance/config', async (req: AuthRequest, res: Response) => {
  try {
    const [existing] = await db.select().from(aiProviderSettings).limit(1);
    const body = req.body || {};

    const validDepths = ['fast', 'balanced', 'deep'];
    const defaultResearchDepth = validDepths.includes(String(body.defaultResearchDepth))
      ? String(body.defaultResearchDepth)
      : existing?.defaultResearchDepth || 'fast';

    const payload = {
      defaultResearchDepth,
      defaultFastModel: String(body.defaultFastModel || existing?.defaultFastModel || 'gemini-4-hydrogen').trim(),
      defaultResearchModel: String(
        body.defaultResearchModel || existing?.defaultResearchModel || 'gemini-4-hydrogen'
      ).trim(),
      fastTimeoutMs: Math.max(2500, Math.min(30000, Number(body.fastTimeoutMs || existing?.fastTimeoutMs || 7000))),
      balancedTimeoutMs: Math.max(
        4000,
        Math.min(45000, Number(body.balancedTimeoutMs || existing?.balancedTimeoutMs || 12000))
      ),
      deepTimeoutMs: Math.max(6000, Math.min(60000, Number(body.deepTimeoutMs || existing?.deepTimeoutMs || 22000))),
      cacheTtlSearchSeconds: Math.max(
        0,
        Math.min(86400, Number(body.cacheTtlSearchSeconds ?? existing?.cacheTtlSearchSeconds ?? 600))
      ),
      cacheTtlMetadataSeconds: Math.max(
        0,
        Math.min(86400, Number(body.cacheTtlMetadataSeconds ?? existing?.cacheTtlMetadataSeconds ?? 1800))
      ),
      cacheTtlDocumentSeconds: Math.max(
        0,
        Math.min(86400, Number(body.cacheTtlDocumentSeconds ?? existing?.cacheTtlDocumentSeconds ?? 3600))
      ),
      maxProvidersPerDeepQuery: Math.max(
        1,
        Math.min(4, Number(body.maxProvidersPerDeepQuery ?? existing?.maxProvidersPerDeepQuery ?? 3))
      ),
      multiModelVerificationEnabled:
        body.multiModelVerificationEnabled !== undefined
          ? Boolean(body.multiModelVerificationEnabled)
          : existing?.multiModelVerificationEnabled ?? true,
      autoFallbackEnabled:
        body.autoFallbackEnabled !== undefined
          ? Boolean(body.autoFallbackEnabled)
          : existing?.autoFallbackEnabled ?? true,
      updatedBy: req.currentUser!.email,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(aiProviderSettings).set(payload).where(eq(aiProviderSettings.id, existing.id));
    } else {
      await db.insert(aiProviderSettings).values(payload);
    }

    if (Array.isArray(body.providers)) {
      for (const p of body.providers) {
        if (!p?.slug) continue;
        const pUpdates: Record<string, any> = { updatedAt: new Date() };
        if (p.priority !== undefined) pUpdates.priority = Number(p.priority);
        if (p.rateLimitPerMin !== undefined) pUpdates.rateLimitPerMin = Number(p.rateLimitPerMin);
        if (typeof p.isEnabled === 'boolean') pUpdates.isEnabled = p.isEnabled;
        await db.update(aiProviders).set(pUpdates).where(eq(aiProviders.slug, String(p.slug)));
      }
    }

    invalidateAiConfigCache();

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'AI_PERFORMANCE_CONFIG_UPDATED',
      targetResource: 'ai_provider_settings',
      details: {
        defaultResearchDepth: payload.defaultResearchDepth,
        defaultFastModel: payload.defaultFastModel,
        fastTimeoutMs: payload.fastTimeoutMs,
      },
      ipAddress: req.ip,
    });

    return res.json({ success: true, settings: payload });
  } catch (err) {
    console.error('PATCH /api/admin/ai-performance/config error:', err);
    return res.status(500).json({ error: 'Failed to update AI performance settings.' });
  }
});

adminExtendedRoutes.post('/ai-performance/cache/clear', async (req: AuthRequest, res: Response) => {
  try {
    const ns = req.body?.namespace as PublicCacheNamespace | undefined;
    const cleared = clearPublicCache(ns);
    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'PUBLIC_CACHE_CLEARED',
      targetResource: 'public_cache',
      details: { namespace: ns || 'all', clearedEntries: cleared },
      ipAddress: req.ip,
    });
    return res.json({ success: true, clearedEntries: cleared });
  } catch {
    return res.status(500).json({ error: 'Failed to clear public cache.' });
  }
});

// =========================================================================
// E. CATEGORIES & VIDEO MANAGEMENT (/admin/categories & /admin/videos)
// =========================================================================

adminExtendedRoutes.get('/categories', async (_req: AuthRequest, res: Response) => {
  const rows = await db.select().from(categories).orderBy(categories.name);
  return res.json({ categories: rows });
});

adminExtendedRoutes.post('/categories', async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, description, icon = 'BookOpen', subtopics = [] } = req.body || {};
    if (!name || !slug || !description) {
      return res.status(400).json({ error: 'Name, slug, and description are required.' });
    }
    const [created] = await db
      .insert(categories)
      .values({
        name: String(name).trim(),
        slug: String(slug).trim().toLowerCase(),
        description: String(description).trim(),
        icon,
        subtopics: Array.isArray(subtopics) ? subtopics : [],
      })
      .returning();
    return res.status(201).json({ category: created });
  } catch {
    return res.status(500).json({ error: 'Failed to create category.' });
  }
});

adminExtendedRoutes.delete('/categories/:id', async (req: AuthRequest, res: Response) => {
  await db.delete(categories).where(eq(categories.id, req.params.id));
  return res.json({ success: true });
});

adminExtendedRoutes.get('/videos', async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    await ensureVideoCategoriesSeeded();
    const statusFilter = String(req.query.status || 'all').toLowerCase();

    const [allVideos, sources, videoCats, adSettingsRows, openReports, allUsers, viewTotals] = await Promise.all([
      db.select().from(videos).orderBy(desc(videos.createdAt)),
      db.select().from(videoSources),
      db.select().from(videoCategories).orderBy(videoCategories.sortOrder, videoCategories.name),
      db.select().from(videoAdSettings),
      db.select().from(videoReports).orderBy(desc(videoReports.createdAt)).limit(50),
      db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).limit(500),
      db
        .select({
          videoId: videoViews.videoId,
          totalViews: sql<number>`count(*)::int`,
          avgWatchSeconds: sql<number>`coalesce(round(avg(${videoViews.watchSeconds})), 0)::int`,
          completions: sql<number>`coalesce(sum(case when ${videoViews.completed} then 1 else 0 end), 0)::int`,
        })
        .from(videoViews)
        .groupBy(videoViews.videoId),
    ]);

    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const adMap = new Map(adSettingsRows.map((a) => [a.videoId, a]));
    const viewMap = new Map(viewTotals.map((vw) => [vw.videoId, vw]));
    const catMap = new Map(videoCats.map((c) => [c.slug, c.name]));

    const enriched = allVideos.map((v) => {
      const uploader = v.uploaderUserId ? userMap.get(v.uploaderUserId) : null;
      const vw = viewMap.get(v.id);
      const adCfg = adMap.get(v.id);
      return {
        ...v,
        categoryName: catMap.get(v.categorySlug) || v.categorySlug,
        uploaderName: uploader?.fullName || v.channel,
        uploaderEmail: uploader?.email || null,
        adSettings: adCfg || {
          videoId: v.id,
          adMode: 'use_global',
          allowPreRoll: true,
          allowMidRoll: true,
          allowPostRoll: true,
          allowBanner: true,
          allowSponsoredRec: true,
          midRollIntervalSeconds: 300,
          maxAdsPerView: 3,
        },
        engagement: {
          views: Math.max(v.viewsCount || 0, Number(vw?.totalViews || 0)),
          avgWatchSeconds: Number(vw?.avgWatchSeconds || 0),
          completions: Number(vw?.completions || 0),
        },
      };
    });

    const filtered =
      statusFilter === 'all'
        ? enriched
        : enriched.filter((v) => (v.status || (v.isPublished ? 'published' : 'draft')) === statusFilter);

    const analytics = {
      totalVideos: allVideos.length,
      pendingReview: allVideos.filter((v) => v.status === 'pending_review').length,
      processing: allVideos.filter((v) => v.status === 'processing').length,
      approved: allVideos.filter((v) => v.status === 'approved').length,
      published: allVideos.filter((v) => v.isPublished && (v.status === 'published' || v.status === 'approved')).length,
      rejected: allVideos.filter((v) => v.status === 'rejected').length,
      archived: allVideos.filter((v) => v.status === 'archived').length,
      userUploaded: allVideos.filter((v) => Boolean(v.uploaderUserId)).length,
      totalViews: enriched.reduce((acc, v) => acc + (v.engagement?.views || 0), 0),
      openReports: openReports.filter((r) => r.status === 'open').length,
    };

    const videoTitleMap = new Map(allVideos.map((v) => [v.id, v.title]));

    return res.json({
      videos: filtered,
      allVideoCount: allVideos.length,
      sources,
      categories: videoCats,
      reports: openReports.map((r) => ({
        ...r,
        videoTitle: videoTitleMap.get(r.videoId) || 'Video Record',
      })),
      analytics,
    });
  } catch (err) {
    console.error('GET /api/admin/videos error:', err);
    return res.status(500).json({ error: 'Failed to load admin video management workspace.' });
  }
});

adminExtendedRoutes.post('/videos/:id/review', async (req: AuthRequest, res: Response) => {
  try {
    const { action, reason, notes, publishImmediately = true } = req.body || {};
    const validActions = ['approve', 'reject', 'publish', 'unpublish', 'archive'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid review action.' });
    }

    const [video] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
    if (!video) return res.status(404).json({ error: 'Video not found.' });

    if (action === 'reject' && (!reason || String(reason).trim().length < 5)) {
      return res.status(400).json({ error: 'A clear rejection reason (minimum 5 characters) is required.' });
    }

    const now = new Date();
    const updates: Record<string, any> = { updatedAt: now };
    let reviewActionLabel = action;
    let notifyTitle = '';
    let notifyMessage = '';

    if (action === 'approve') {
      const shouldPublish = Boolean(publishImmediately);
      updates.status = shouldPublish ? 'published' : 'approved';
      updates.isPublished = shouldPublish;
      updates.rejectionReason = null;
      updates.approvedAt = now;
      updates.approvedByAdminId = req.currentUser!.id;
      if (shouldPublish && !video.publishedAt) {
        updates.publishedAt = now.toISOString().slice(0, 10);
      }
      reviewActionLabel = shouldPublish ? 'published' : 'approved';
      notifyTitle = shouldPublish ? 'Your Video Is Published on 2MR' : 'Your Video Was Approved';
      notifyMessage = shouldPublish
        ? `"${video.title}" passed review and is now live on 2MR Videos.`
        : `"${video.title}" was approved by an administrator.`;
    } else if (action === 'reject') {
      updates.status = 'rejected';
      updates.isPublished = false;
      updates.rejectionReason = String(reason).trim();
      reviewActionLabel = 'rejected';
      notifyTitle = 'Video Submission Needs Revision';
      notifyMessage = `"${video.title}" was not approved. Reason: ${updates.rejectionReason}`;
    } else if (action === 'publish') {
      updates.status = 'published';
      updates.isPublished = true;
      updates.approvedAt = video.approvedAt || now;
      updates.approvedByAdminId = video.approvedByAdminId || req.currentUser!.id;
      if (!video.publishedAt) updates.publishedAt = now.toISOString().slice(0, 10);
      reviewActionLabel = 'published';
    } else if (action === 'unpublish') {
      updates.status = 'approved';
      updates.isPublished = false;
      reviewActionLabel = 'unpublished';
    } else if (action === 'archive') {
      updates.status = 'archived';
      updates.isPublished = false;
      reviewActionLabel = 'archived';
    }

    const [updated] = await db
      .update(videos)
      .set(updates)
      .where(eq(videos.id, video.id))
      .returning();

    await db.insert(videoReviews).values({
      videoId: video.id,
      reviewerAdminId: req.currentUser!.id,
      reviewerEmail: req.currentUser!.email,
      action: reviewActionLabel,
      reason: reason ? String(reason).trim() : null,
      notes: notes ? String(notes).trim() : null,
    });

    if (video.uploaderUserId && notifyTitle) {
      await db.insert(notifications).values({
        userId: video.uploaderUserId,
        category: 'research',
        title: notifyTitle,
        message: notifyMessage,
      });
    }

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: `VIDEO_${reviewActionLabel.toUpperCase()}`,
      targetResource: 'videos',
      targetId: video.id,
      details: { title: video.title, reason: updates.rejectionReason || null, isPublished: updated.isPublished },
      ipAddress: req.ip,
    });

    return res.json({ video: updated });
  } catch (err) {
    console.error('POST /api/admin/videos/:id/review error:', err);
    return res.status(500).json({ error: 'Failed to process video review action.' });
  }
});

adminExtendedRoutes.patch('/videos/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
    if (!video) return res.status(404).json({ error: 'Video not found.' });

    const { title, description, categorySlug, language, tags, isFeatured, isPublished, status } = req.body || {};
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (categorySlug !== undefined) updates.categorySlug = String(categorySlug).trim().toLowerCase();
    if (language !== undefined) updates.language = String(language).trim().toLowerCase();
    if (isFeatured !== undefined) updates.isFeatured = Boolean(isFeatured);
    if (isPublished !== undefined) updates.isPublished = Boolean(isPublished);
    if (status !== undefined) updates.status = String(status);

    if (Array.isArray(tags)) {
      const cleanTags = tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 12);
      updates.tags = cleanTags;
      await db.delete(videoTags).where(eq(videoTags.videoId, video.id));
      if (cleanTags.length > 0) {
        await db.insert(videoTags).values(cleanTags.map((tag) => ({ videoId: video.id, tag })));
      }
    }

    const [updated] = await db.update(videos).set(updates).where(eq(videos.id, video.id)).returning();

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'VIDEO_METADATA_UPDATED',
      targetResource: 'videos',
      targetId: video.id,
      details: { title: updated.title, status: updated.status, isPublished: updated.isPublished },
      ipAddress: req.ip,
    });

    return res.json({ video: updated });
  } catch (err) {
    console.error('PATCH /api/admin/videos/:id error:', err);
    return res.status(500).json({ error: 'Failed to update video metadata.' });
  }
});

adminExtendedRoutes.delete('/videos/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
    if (!video) return res.status(404).json({ error: 'Video not found.' });

    await deleteStoredObject('video', video.storageObjectKey);
    await deleteStoredObject('thumbnail', video.thumbnailObjectKey);
    await db.delete(videos).where(eq(videos.id, video.id));

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'VIDEO_DELETED_BY_ADMIN',
      targetResource: 'videos',
      targetId: video.id,
      details: { title: video.title, uploaderUserId: video.uploaderUserId },
      ipAddress: req.ip,
    });

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to delete video.' });
  }
});

adminExtendedRoutes.get('/videos/:id/ad-settings', async (req: AuthRequest, res: Response) => {
  const settings = await getOrDefaultVideoAdSettings(req.params.id);
  return res.json({ settings });
});

adminExtendedRoutes.put('/videos/:id/ad-settings', async (req: AuthRequest, res: Response) => {
  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
    if (!video) return res.status(404).json({ error: 'Video not found.' });

    const {
      adMode = 'use_global',
      allowPreRoll = true,
      allowMidRoll = true,
      allowPostRoll = true,
      allowBanner = true,
      allowSponsoredRec = true,
      midRollIntervalSeconds = 300,
      maxAdsPerView = 3,
    } = req.body || {};

    const validMode = ['use_global', 'ads_enabled', 'ads_disabled'].includes(adMode)
      ? adMode
      : 'use_global';

    const payload = {
      videoId: video.id,
      adMode: validMode,
      allowPreRoll: Boolean(allowPreRoll),
      allowMidRoll: Boolean(allowMidRoll),
      allowPostRoll: Boolean(allowPostRoll),
      allowBanner: Boolean(allowBanner),
      allowSponsoredRec: Boolean(allowSponsoredRec),
      midRollIntervalSeconds: Math.max(30, Number(midRollIntervalSeconds || 300)),
      maxAdsPerView: Math.max(1, Math.min(10, Number(maxAdsPerView || 3))),
      updatedByAdminEmail: req.currentUser!.email,
      updatedAt: new Date(),
    };

    const [saved] = await db
      .insert(videoAdSettings)
      .values(payload)
      .onConflictDoUpdate({
        target: videoAdSettings.videoId,
        set: payload,
      })
      .returning();

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'VIDEO_AD_SETTINGS_UPDATED',
      targetResource: 'video_ad_settings',
      targetId: video.id,
      details: { title: video.title, adMode: validMode, allowPreRoll, allowMidRoll, allowPostRoll, allowBanner },
      ipAddress: req.ip,
    });

    return res.json({ settings: saved });
  } catch (err) {
    console.error('PUT /api/admin/videos/:id/ad-settings error:', err);
    return res.status(500).json({ error: 'Failed to update video advertisement settings.' });
  }
});

adminExtendedRoutes.get('/video-categories', async (_req: AuthRequest, res: Response) => {
  await ensureVideoCategoriesSeeded();
  const rows = await db.select().from(videoCategories).orderBy(videoCategories.sortOrder, videoCategories.name);
  return res.json({ categories: rows });
});

adminExtendedRoutes.post('/video-categories', async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, description = '', sortOrder = 0 } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Category name is required.' });
    }
    const cleanSlug = (slug ? String(slug) : String(name))
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');

    const [created] = await db
      .insert(videoCategories)
      .values({
        slug: cleanSlug,
        name: String(name).trim(),
        description: String(description || ''),
        sortOrder: Number(sortOrder || 0),
        isActive: true,
      })
      .returning();

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'VIDEO_CATEGORY_CREATED',
      targetResource: 'video_categories',
      targetId: created.id,
      details: { slug: created.slug, name: created.name },
      ipAddress: req.ip,
    });

    return res.status(201).json({ category: created });
  } catch {
    return res.status(500).json({ error: 'Failed to create video category (slug may already exist).' });
  }
});

adminExtendedRoutes.patch('/video-categories/:id', async (req: AuthRequest, res: Response) => {
  const { name, description, isActive, sortOrder } = req.body || {};
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = String(name).trim();
  if (description !== undefined) updates.description = String(description);
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
  const [updated] = await db
    .update(videoCategories)
    .set(updates)
    .where(eq(videoCategories.id, req.params.id))
    .returning();
  return res.json({ category: updated });
});

adminExtendedRoutes.delete('/video-categories/:id', async (req: AuthRequest, res: Response) => {
  await db.delete(videoCategories).where(eq(videoCategories.id, req.params.id));
  await recordAdminAudit({
    actorEmail: req.currentUser!.email,
    action: 'VIDEO_CATEGORY_DELETED',
    targetResource: 'video_categories',
    targetId: req.params.id,
    ipAddress: req.ip,
  });
  return res.json({ success: true });
});

adminExtendedRoutes.patch('/video-reports/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { status = 'resolved', adminNotes, unpublishVideo = false } = req.body || {};
    const [report] = await db.select().from(videoReports).where(eq(videoReports.id, req.params.id)).limit(1);
    if (!report) return res.status(404).json({ error: 'Report not found.' });

    const [updated] = await db
      .update(videoReports)
      .set({
        status: String(status),
        adminNotes: adminNotes ? String(adminNotes) : report.adminNotes,
        resolvedByAdminId: req.currentUser!.id,
        updatedAt: new Date(),
      })
      .where(eq(videoReports.id, report.id))
      .returning();

    if (unpublishVideo) {
      await db
        .update(videos)
        .set({ isPublished: false, status: 'archived', updatedAt: new Date() })
        .where(eq(videos.id, report.videoId));
    }

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'VIDEO_REPORT_UPDATED',
      targetResource: 'video_reports',
      targetId: report.id,
      details: { status, videoId: report.videoId, unpublishVideo },
      ipAddress: req.ip,
    });

    return res.json({ report: updated });
  } catch {
    return res.status(500).json({ error: 'Failed to update report.' });
  }
});

adminExtendedRoutes.patch('/video-sources/:slug', async (req: AuthRequest, res: Response) => {
  const { isEnabled } = req.body || {};
  const [updated] = await db
    .update(videoSources)
    .set({ isEnabled: Boolean(isEnabled) })
    .where(eq(videoSources.slug, req.params.slug))
    .returning();
  return res.json({ source: updated });
});

// =========================================================================
// F. ADVERTISERS, CAMPAIGNS, VIDEO ADVERTISEMENTS & GLOBAL AD POLICY
// =========================================================================

adminExtendedRoutes.get('/ads/global-settings', async (_req: AuthRequest, res: Response) => {
  const config = await getGlobalVideoAdConfig();
  return res.json({ config });
});

adminExtendedRoutes.put('/ads/global-settings', async (req: AuthRequest, res: Response) => {
  try {
    const updated = await updateGlobalVideoAdConfig(req.body || {}, req.currentUser!.email);
    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'GLOBAL_VIDEO_AD_SETTINGS_UPDATED',
      targetResource: 'platform_settings',
      targetId: 'global_video_ads',
      details: updated as unknown as Record<string, unknown>,
      ipAddress: req.ip,
    });
    return res.json({ config: updated });
  } catch {
    return res.status(500).json({ error: 'Failed to update global advertisement settings.' });
  }
});

adminExtendedRoutes.get('/ads', async (_req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    await ensureVideoCategoriesSeeded();
    const [adsList, videoCats, approvedVids, globalConfig, impressionStats, clickStats] = await Promise.all([
      db.select().from(advertisements).orderBy(desc(advertisements.createdAt)),
      db.select().from(videoCategories).orderBy(videoCategories.sortOrder, videoCategories.name),
      db
        .select({ id: videos.id, title: videos.title, categorySlug: videos.categorySlug, status: videos.status })
        .from(videos)
        .orderBy(desc(videos.createdAt))
        .limit(100),
      getGlobalVideoAdConfig(),
      db
        .select({
          advertisementId: adImpressions.advertisementId,
          cnt: sql<number>`count(*)::int`,
        })
        .from(adImpressions)
        .groupBy(adImpressions.advertisementId),
      db
        .select({
          advertisementId: adClicks.advertisementId,
          cnt: sql<number>`count(*)::int`,
        })
        .from(adClicks)
        .groupBy(adClicks.advertisementId),
    ]);

    const impMap = new Map(impressionStats.map((i) => [i.advertisementId, Number(i.cnt)]));
    const clkMap = new Map(clickStats.map((c) => [c.advertisementId, Number(c.cnt)]));

    const enrichedAds = adsList.map((ad) => ({
      ...ad,
      impressionsCount: Math.max(ad.impressionsCount || 0, impMap.get(ad.id) || 0),
      clicksCount: Math.max(ad.clicksCount || 0, clkMap.get(ad.id) || 0),
    }));

    return res.json({
      advertisements: enrichedAds,
      categories: videoCats,
      videos: approvedVids,
      globalConfig,
      analytics: {
        totalAds: enrichedAds.length,
        activeAds: enrichedAds.filter((a) => a.isActive).length,
        totalImpressions: enrichedAds.reduce((sum, a) => sum + a.impressionsCount, 0),
        totalClicks: enrichedAds.reduce((sum, a) => sum + a.clicksCount, 0),
      },
    });
  } catch (err) {
    console.error('GET /api/admin/ads error:', err);
    return res.status(500).json({ error: 'Failed to load video advertisements.' });
  }
});

adminExtendedRoutes.post('/ads', async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      sponsorName = '2MR Partner',
      placement = 'banner',
      headline,
      description,
      mediaUrl,
      ctaText = 'Learn More',
      ctaUrl,
      targetCategories = ['All'],
      targetVideoIds = [],
      startDate,
      endDate,
      budgetUsd = 0,
      impressionLimit = 0,
      clickLimit = 0,
      frequencyCapPerUser = 3,
      minSpacingSeconds = 180,
      isActive = true,
      campaignId,
      advertiserId,
    } = req.body || {};

    if (!title || !headline || !ctaUrl) {
      return res.status(400).json({ error: 'Title, headline, and destination CTA URL are required.' });
    }

    const validPlacement = ['pre_roll', 'mid_roll', 'post_roll', 'sponsored_recommendation', 'banner'].includes(placement)
      ? placement
      : 'banner';

    const formatForPlacement: Record<string, string> = {
      pre_roll: 'video_ad',
      mid_roll: 'video_ad',
      post_roll: 'video_ad',
      sponsored_recommendation: 'sponsored_card',
      banner: 'banner',
    };

    const [created] = await db
      .insert(advertisements)
      .values({
        advertiserId: advertiserId || null,
        campaignId: campaignId || null,
        title: String(title).trim(),
        sponsorName: String(sponsorName || '2MR Partner').trim(),
        adFormat: formatForPlacement[validPlacement] || 'banner',
        placement: validPlacement,
        headline: String(headline).trim(),
        description: String(description || headline).trim(),
        mediaUrl: mediaUrl ? String(mediaUrl).trim() : null,
        ctaText: String(ctaText || 'Learn More').trim(),
        ctaUrl: String(ctaUrl).trim(),
        targetCategories: Array.isArray(targetCategories) && targetCategories.length > 0 ? targetCategories : ['All'],
        targetVideoIds: Array.isArray(targetVideoIds) ? targetVideoIds : [],
        startDate: startDate ? String(startDate).trim() : null,
        endDate: endDate ? String(endDate).trim() : null,
        budgetUsd: Math.max(0, Number(budgetUsd || 0)),
        impressionLimit: Math.max(0, Number(impressionLimit || 0)),
        clickLimit: Math.max(0, Number(clickLimit || 0)),
        frequencyCapPerUser: Math.max(1, Number(frequencyCapPerUser || 3)),
        minSpacingSeconds: Math.max(15, Number(minSpacingSeconds || 180)),
        isActive: Boolean(isActive),
      })
      .returning();

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'VIDEO_AD_CREATED',
      targetResource: 'advertisements',
      targetId: created.id,
      details: { title: created.title, placement: created.placement, targetCategories: created.targetCategories },
      ipAddress: req.ip,
    });

    return res.status(201).json({ advertisement: created });
  } catch (err) {
    console.error('POST /api/admin/ads error:', err);
    return res.status(500).json({ error: 'Failed to create advertisement.' });
  }
});

adminExtendedRoutes.patch('/ads/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [existing] = await db.select().from(advertisements).where(eq(advertisements.id, req.params.id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Advertisement not found.' });

    const {
      title,
      sponsorName,
      placement,
      headline,
      description,
      mediaUrl,
      ctaText,
      ctaUrl,
      targetCategories,
      targetVideoIds,
      startDate,
      endDate,
      budgetUsd,
      impressionLimit,
      clickLimit,
      frequencyCapPerUser,
      minSpacingSeconds,
      isActive,
    } = req.body || {};

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = String(title).trim();
    if (sponsorName !== undefined) updates.sponsorName = String(sponsorName).trim();
    if (placement !== undefined && ['pre_roll', 'mid_roll', 'post_roll', 'sponsored_recommendation', 'banner'].includes(placement)) {
      updates.placement = placement;
    }
    if (headline !== undefined) updates.headline = String(headline).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (mediaUrl !== undefined) updates.mediaUrl = mediaUrl ? String(mediaUrl).trim() : null;
    if (ctaText !== undefined) updates.ctaText = String(ctaText).trim();
    if (ctaUrl !== undefined) updates.ctaUrl = String(ctaUrl).trim();
    if (Array.isArray(targetCategories)) updates.targetCategories = targetCategories.length > 0 ? targetCategories : ['All'];
    if (Array.isArray(targetVideoIds)) updates.targetVideoIds = targetVideoIds;
    if (startDate !== undefined) updates.startDate = startDate || null;
    if (endDate !== undefined) updates.endDate = endDate || null;
    if (budgetUsd !== undefined) updates.budgetUsd = Math.max(0, Number(budgetUsd));
    if (impressionLimit !== undefined) updates.impressionLimit = Math.max(0, Number(impressionLimit));
    if (clickLimit !== undefined) updates.clickLimit = Math.max(0, Number(clickLimit));
    if (frequencyCapPerUser !== undefined) updates.frequencyCapPerUser = Math.max(1, Number(frequencyCapPerUser));
    if (minSpacingSeconds !== undefined) updates.minSpacingSeconds = Math.max(15, Number(minSpacingSeconds));
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const [updated] = await db
      .update(advertisements)
      .set(updates)
      .where(eq(advertisements.id, existing.id))
      .returning();

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'VIDEO_AD_UPDATED',
      targetResource: 'advertisements',
      targetId: existing.id,
      details: { title: updated.title, isActive: updated.isActive, placement: updated.placement },
      ipAddress: req.ip,
    });

    return res.json({ advertisement: updated });
  } catch (err) {
    console.error('PATCH /api/admin/ads/:id error:', err);
    return res.status(500).json({ error: 'Failed to update advertisement.' });
  }
});

adminExtendedRoutes.delete('/ads/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [existing] = await db.select().from(advertisements).where(eq(advertisements.id, req.params.id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Advertisement not found.' });
    await db.delete(advertisements).where(eq(advertisements.id, existing.id));

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'VIDEO_AD_DELETED',
      targetResource: 'advertisements',
      targetId: existing.id,
      details: { title: existing.title },
      ipAddress: req.ip,
    });

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to delete advertisement.' });
  }
});

adminExtendedRoutes.get('/advertisers', async (_req: AuthRequest, res: Response) => {
  const rows = await db.select().from(advertisers).orderBy(desc(advertisers.createdAt));
  return res.json({ advertisers: rows });
});

adminExtendedRoutes.post('/advertisers', async (req: AuthRequest, res: Response) => {
  try {
    const { name, contactEmail, website, industry, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Advertiser name required.' });
    const [created] = await db
      .insert(advertisers)
      .values({
        name: String(name).trim(),
        contactEmail: contactEmail || null,
        website: website || null,
        industry: industry || 'Education & Research',
        notes: notes || null,
      })
      .returning();
    return res.status(201).json({ advertiser: created });
  } catch {
    return res.status(500).json({ error: 'Failed to create advertiser.' });
  }
});

adminExtendedRoutes.delete('/advertisers/:id', async (req: AuthRequest, res: Response) => {
  await db.delete(advertisers).where(eq(advertisers.id, req.params.id));
  return res.json({ success: true });
});

adminExtendedRoutes.get('/campaigns', async (_req: AuthRequest, res: Response) => {
  const [camps, ads, placements, legacyCamps] = await Promise.all([
    db.select().from(advertisementCampaigns).orderBy(desc(advertisementCampaigns.createdAt)),
    db.select().from(advertisements).orderBy(desc(advertisements.createdAt)),
    db.select().from(advertisementPlacements),
    db.select().from(adCampaigns).orderBy(desc(adCampaigns.createdAt)),
  ]);
  return res.json({ campaigns: camps, advertisements: ads, placements, legacyCampaigns: legacyCamps });
});

adminExtendedRoutes.post('/campaigns', async (req: AuthRequest, res: Response) => {
  try {
    const {
      advertiserId,
      name,
      budgetUsd = 0,
      dailyCap = 1000,
      impressionCap = 50000,
      clickCap = 5000,
      frequencyCapPerUser = 5,
      targetCategories = ['All'],
      startDate,
      endDate,
    } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Campaign name required.' });

    const [created] = await db
      .insert(advertisementCampaigns)
      .values({
        advertiserId: advertiserId || null,
        name: String(name).trim(),
        budgetUsd: Number(budgetUsd),
        dailyCap: Number(dailyCap),
        impressionCap: Number(impressionCap),
        clickCap: Number(clickCap),
        frequencyCapPerUser: Number(frequencyCapPerUser),
        targetCategories: Array.isArray(targetCategories) ? targetCategories : ['All'],
        startDate: startDate || null,
        endDate: endDate || null,
        status: 'active',
      })
      .returning();
    return res.status(201).json({ campaign: created });
  } catch {
    return res.status(500).json({ error: 'Failed to create campaign.' });
  }
});

adminExtendedRoutes.patch('/campaigns/:id', async (req: AuthRequest, res: Response) => {
  const { status, budgetUsd, dailyCap } = req.body || {};
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (status) updates.status = status;
  if (budgetUsd !== undefined) updates.budgetUsd = Number(budgetUsd);
  if (dailyCap !== undefined) updates.dailyCap = Number(dailyCap);
  const [updated] = await db
    .update(advertisementCampaigns)
    .set(updates)
    .where(eq(advertisementCampaigns.id, req.params.id))
    .returning();
  return res.json({ campaign: updated });
});

adminExtendedRoutes.patch('/placements/:id', async (req: AuthRequest, res: Response) => {
  const { isEnabled } = req.body || {};
  const [updated] = await db
    .update(advertisementPlacements)
    .set({ isEnabled: Boolean(isEnabled) })
    .where(eq(advertisementPlacements.id, req.params.id))
    .returning();
  return res.json({ placement: updated });
});

// =========================================================================
// G. SUBSCRIPTIONS, NOTIFICATIONS, REPORTS & SETTINGS
// =========================================================================

adminExtendedRoutes.get('/subscriptions', async (_req: AuthRequest, res: Response) => {
  const [subs, allPlans] = await Promise.all([
    db
      .select({
        subscription: subscriptions,
        userEmail: users.email,
        userName: users.fullName,
      })
      .from(subscriptions)
      .leftJoin(users, eq(subscriptions.userId, users.id))
      .where(eq(subscriptions.isSynthetic, false))
      .orderBy(desc(subscriptions.createdAt))
      .limit(100),
    db.select().from(plans),
  ]);
  return res.json({
    subscriptions: subs.map((s) => ({ ...s.subscription, userEmail: s.userEmail, userName: s.userName })),
    plans: allPlans,
  });
});

adminExtendedRoutes.patch('/subscriptions/:id', async (req: AuthRequest, res: Response) => {
  const { status } = req.body || {};
  if (!['active', 'cancelled', 'expired'].includes(status)) {
    return res.status(400).json({ error: 'Invalid subscription status.' });
  }
  const [updated] = await db
    .update(subscriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(subscriptions.id, req.params.id))
    .returning();
  return res.json({ subscription: updated });
});

adminExtendedRoutes.get('/notifications', async (_req: AuthRequest, res: Response) => {
  const rows = await db
    .select({
      notification: notifications,
      userEmail: users.email,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.userId, users.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  return res.json({
    notifications: rows.map((r) => ({ ...r.notification, userEmail: r.userEmail })),
  });
});

adminExtendedRoutes.post('/notifications/broadcast', async (req: AuthRequest, res: Response) => {
  try {
    const { title, message, category = 'system', targetRole = 'all' } = req.body || {};
    if (!title || !message) return res.status(400).json({ error: 'Title and message required.' });

    // Strictly target REAL users only — synthetic accounts never receive notifications
    const allUsers = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.isSynthetic, false));
    const recipients =
      targetRole === 'all' ? allUsers : allUsers.filter((u) => u.role === targetRole);

    if (recipients.length > 0) {
      await db.insert(notifications).values(
        recipients.map((u) => ({
          userId: u.id,
          category: String(category),
          title: String(title).trim(),
          message: String(message).trim(),
        }))
      );
    }

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'ADMIN_NOTIFICATION_BROADCAST',
      targetResource: 'notifications',
      details: { count: recipients.length, targetRole },
    });

    return res.json({ success: true, sentCount: recipients.length });
  } catch {
    return res.status(500).json({ error: 'Failed to broadcast notification.' });
  }
});

adminExtendedRoutes.get('/reports', async (req: AuthRequest, res: Response) => {
  try {
    const rawScope = String(req.query.scope || 'real').toLowerCase();
    const scope: 'real' | 'demo' | 'combined' =
      rawScope === 'demo' ? 'demo' : rawScope === 'combined' ? 'combined' : 'real';

    const pool = createPool();
    const synthWhere =
      scope === 'real'
        ? 'is_synthetic = false'
        : scope === 'demo'
          ? 'is_synthetic = true'
          : '1 = 1';

    const [
      userAgg,
      activityAgg,
      paymentAgg,
      adAgg,
      topQueriesRes,
      timelineRes,
      countryRes,
      languageRes,
      subMonthlyRes,
      payMonthlyRes,
      aiMonthlyRes,
      searchMonthlyRes,
      projectMonthlyRes,
      engagementMonthlyRes,
      aiModeBreakdownRes,
      categoryBreakdownRes,
      errorSummaryRes,
    ] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE role = 'free')::int AS free_users,
          COUNT(*) FILTER (WHERE role = 'premium')::int AS premium_users,
          COUNT(*) FILTER (WHERE activity_status = 'active')::int AS active_users,
          COUNT(*) FILTER (WHERE activity_status = 'inactive')::int AS inactive_users,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_registrations_30d,
          COUNT(*) FILTER (WHERE is_synthetic = true)::int AS demo_users,
          COUNT(*) FILTER (WHERE is_synthetic = false)::int AS real_users
        FROM users
        WHERE ${synthWhere}
      `),
      pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM search_history WHERE ${synthWhere}) AS total_searches,
          (SELECT COUNT(*)::int FROM ai_requests WHERE ${synthWhere}) AS total_ai_requests,
          (SELECT COUNT(*)::int FROM ai_usage_logs WHERE ${synthWhere}) AS total_ai_usage_logs,
          (SELECT COUNT(*)::int FROM research_projects WHERE ${synthWhere}) AS total_research_projects,
          (SELECT COUNT(*)::int FROM saved_items WHERE ${synthWhere}) AS total_saved_resources,
          (SELECT COUNT(*)::int FROM saved_videos WHERE ${synthWhere}) +
          (SELECT COUNT(*)::int FROM video_notes WHERE ${synthWhere}) AS total_video_interactions,
          (SELECT COUNT(*)::int FROM knowledge_notes WHERE ${synthWhere}) AS total_notes,
          (SELECT COUNT(*)::int FROM feedback_submissions WHERE ${synthWhere} AND status = 'new') AS open_feedback,
          (SELECT COUNT(*)::int FROM subscriptions WHERE ${synthWhere} AND status = 'active') AS active_subscriptions,
          (SELECT COUNT(*)::int FROM knowledge_maps) AS total_knowledge_maps,
          (SELECT COUNT(*)::int FROM video_summaries) AS total_video_summaries
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_synthetic = false AND is_demo_transaction = false AND status = 'successful')::int AS real_successful_payments,
          COALESCE(SUM(amount) FILTER (WHERE is_synthetic = false AND is_demo_transaction = false AND status = 'successful' AND currency = 'RWF'), 0)::bigint AS real_revenue_rwf,
          COUNT(*) FILTER (WHERE is_synthetic = false AND is_demo_transaction = false AND status IN ('failed', 'rejected', 'expired', 'requires_reconciliation'))::int AS real_payment_errors,
          COUNT(*) FILTER (WHERE is_synthetic = true OR is_demo_transaction = true)::int AS demo_simulated_payments,
          COALESCE(SUM(amount) FILTER (WHERE (is_synthetic = true OR is_demo_transaction = true) AND currency = 'RWF'), 0)::bigint AS demo_simulated_rwf
        FROM payments
      `),
      pool.query(`
        SELECT
          (SELECT COALESCE(SUM(impressions), 0)::bigint FROM ad_campaigns) AS campaign_impressions,
          (SELECT COALESCE(SUM(clicks), 0)::bigint FROM ad_campaigns) AS campaign_clicks,
          (SELECT COUNT(*)::int FROM ad_events WHERE ${synthWhere} AND event_type = 'impression') +
          (SELECT COUNT(*)::int FROM advertisement_events WHERE ${synthWhere} AND event_type = 'impression') AS event_impressions,
          (SELECT COUNT(*)::int FROM ad_events WHERE ${synthWhere} AND event_type = 'click') +
          (SELECT COUNT(*)::int FROM advertisement_events WHERE ${synthWhere} AND event_type = 'click') AS event_clicks
      `),
      pool.query(`
        SELECT LOWER(TRIM(query)) AS query, COUNT(*)::int AS count
        FROM search_history
        WHERE ${synthWhere}
        GROUP BY LOWER(TRIM(query))
        ORDER BY count DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period,
               COUNT(*)::int AS registrations,
               COUNT(*) FILTER (WHERE role = 'free')::int AS free_count,
               COUNT(*) FILTER (WHERE role = 'premium')::int AS premium_count,
               COUNT(*) FILTER (WHERE activity_status = 'active')::int AS active_count
        FROM users
        WHERE ${synthWhere}
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY period ASC
        LIMIT 18
      `),
      pool.query(`
        SELECT COALESCE(country, 'Unspecified') AS country, COUNT(*)::int AS count
        FROM users
        WHERE ${synthWhere}
        GROUP BY COALESCE(country, 'Unspecified')
        ORDER BY count DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT preferred_language AS language, COUNT(*)::int AS count
        FROM users
        WHERE ${synthWhere}
        GROUP BY preferred_language
        ORDER BY count DESC
        LIMIT 8
      `),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period,
               COUNT(*)::int AS count
        FROM subscriptions
        WHERE ${synthWhere}
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY period ASC
        LIMIT 18
      `),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period,
               COALESCE(SUM(amount) FILTER (WHERE is_synthetic = false AND is_demo_transaction = false AND status = 'successful' AND currency = 'RWF'), 0)::bigint AS revenue_rwf,
               COUNT(*) FILTER (WHERE is_synthetic = false AND is_demo_transaction = false AND status IN ('failed', 'rejected', 'expired', 'requires_reconciliation'))::int AS payment_errors
        FROM payments
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY period ASC
        LIMIT 18
      `),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period,
               COUNT(*)::int AS ai_calls,
               COUNT(*) FILTER (WHERE status IN ('error', 'timeout', 'fallback'))::int AS ai_errors
        FROM ai_requests
        WHERE ${synthWhere}
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY period ASC
        LIMIT 18
      `),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period,
               COUNT(*)::int AS count
        FROM search_history
        WHERE ${synthWhere}
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY period ASC
        LIMIT 18
      `),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period,
               COUNT(*)::int AS count
        FROM research_projects
        WHERE ${synthWhere}
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY period ASC
        LIMIT 18
      `),
      pool.query(`
        SELECT period, SUM(cnt)::int AS count FROM (
          SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period, COUNT(*)::int AS cnt FROM saved_items WHERE ${synthWhere} GROUP BY 1
          UNION ALL
          SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period, COUNT(*)::int AS cnt FROM saved_videos WHERE ${synthWhere} GROUP BY 1
          UNION ALL
          SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS period, COUNT(*)::int AS cnt FROM knowledge_notes WHERE ${synthWhere} GROUP BY 1
        ) t
        GROUP BY period
        ORDER BY period ASC
        LIMIT 18
      `),
      pool.query(`
        SELECT mode, COUNT(*)::int AS count,
               COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms
        FROM ai_requests
        WHERE ${synthWhere}
        GROUP BY mode
        ORDER BY count DESC
      `),
      pool.query(`
        SELECT COALESCE(c.name, INITCAP(REPLACE(r.category_slug, '-', ' ')), 'General') AS category, COUNT(*)::int AS count
        FROM (
          SELECT category_slug FROM indexed_documents
          UNION ALL
          SELECT category_slug FROM videos
        ) r
        LEFT JOIN categories c ON c.slug = r.category_slug
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 8
      `),
      pool.query(`
        SELECT COUNT(*) FILTER (WHERE status IN ('error', 'timeout', 'fallback'))::int AS ai_errors
        FROM ai_requests
        WHERE ${synthWhere}
      `),
    ]);

    const u = userAgg.rows[0] || {};
    const act = activityAgg.rows[0] || {};
    const pay = paymentAgg.rows[0] || {};
    const ad = adAgg.rows[0] || {};
    const errRow = errorSummaryRes.rows[0] || {};

    // Real ad impressions only appear in Real or Combined scope; Demo scope displays strictly demo ad events
    const adImpressions =
      scope === 'demo'
        ? Number(ad.event_impressions || 0)
        : Number(ad.campaign_impressions || 0) + Number(ad.event_impressions || 0);
    const adClicks =
      scope === 'demo'
        ? Number(ad.event_clicks || 0)
        : Number(ad.campaign_clicks || 0) + Number(ad.event_clicks || 0);

    // Real confirmed revenue is NEVER mixed with demo payment simulations
    const successfulPayments = scope === 'demo' ? 0 : Number(pay.real_successful_payments || 0);
    const totalRevenueRwf = scope === 'demo' ? 0 : Number(pay.real_revenue_rwf || 0);
    const totalErrors =
      Number(errRow.ai_errors || 0) + (scope === 'demo' ? 0 : Number(pay.real_payment_errors || 0));

    // Merge monthly series cleanly across all dimensions
    const periodSet = new Set<string>();
    for (const row of timelineRes.rows) if (row.period) periodSet.add(row.period);
    for (const row of subMonthlyRes.rows) if (row.period) periodSet.add(row.period);
    if (scope !== 'demo') {
      for (const row of payMonthlyRes.rows) if (row.period) periodSet.add(row.period);
    }
    for (const row of aiMonthlyRes.rows) if (row.period) periodSet.add(row.period);
    for (const row of searchMonthlyRes.rows) if (row.period) periodSet.add(row.period);
    for (const row of projectMonthlyRes.rows) if (row.period) periodSet.add(row.period);
    for (const row of engagementMonthlyRes.rows) if (row.period) periodSet.add(row.period);

    const sortedPeriods = Array.from(periodSet).sort().slice(-12);
    const userMap = new Map(timelineRes.rows.map((r: any) => [r.period, r]));
    const subMap = new Map(subMonthlyRes.rows.map((r: any) => [r.period, Number(r.count || 0)]));
    const payMap = new Map(payMonthlyRes.rows.map((r: any) => [r.period, r]));
    const aiMap = new Map(aiMonthlyRes.rows.map((r: any) => [r.period, r]));
    const searchMap = new Map(searchMonthlyRes.rows.map((r: any) => [r.period, Number(r.count || 0)]));
    const projMap = new Map(projectMonthlyRes.rows.map((r: any) => [r.period, Number(r.count || 0)]));
    const engMap = new Map(engagementMonthlyRes.rows.map((r: any) => [r.period, Number(r.count || 0)]));

    let runningUsers = 0;
    let runningFree = 0;
    let runningPremium = 0;
    let runningSubs = 0;

    // Seed baseline if earlier months were trimmed beyond the 12-month display window
    const trimmedPeriods = Array.from(periodSet).sort().slice(0, Math.max(0, periodSet.size - 12));
    for (const p of trimmedPeriods) {
      const ur: any = userMap.get(p);
      if (ur) {
        runningUsers += Number(ur.registrations || 0);
        runningFree += Number(ur.free_count || 0);
        runningPremium += Number(ur.premium_count || 0);
      }
      runningSubs += Number(subMap.get(p) || 0);
    }

    const monthlyGrowthTimeline = sortedPeriods.map((period) => {
      const ur: any = userMap.get(period);
      const newUsers = Number(ur?.registrations || 0);
      const freeNew = Number(ur?.free_count || 0);
      const premiumNew = Number(ur?.premium_count || 0);
      const activeUsers = Number(ur?.active_count || 0);
      runningUsers += newUsers;
      runningFree += freeNew;
      runningPremium += premiumNew;

      const newSubs = Number(subMap.get(period) || 0);
      runningSubs += newSubs;

      const payRow: any = payMap.get(period);
      const verifiedRevenueRwf = scope === 'demo' ? 0 : Number(payRow?.revenue_rwf || 0);
      const paymentErrors = scope === 'demo' ? 0 : Number(payRow?.payment_errors || 0);

      const aiRow: any = aiMap.get(period);
      const aiUsage = Number(aiRow?.ai_calls || 0);
      const aiErrors = Number(aiRow?.ai_errors || 0);
      const researchActivity = Number(searchMap.get(period) || 0) + Number(projMap.get(period) || 0);
      const engagementCount = Number(engMap.get(period) || 0);

      const [yr, mo] = period.split('-');
      const dt = new Date(Number(yr), Math.max(0, Number(mo) - 1), 1);
      const monthLabel = dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      return {
        period,
        label: monthLabel,
        newUsers,
        cumulativeUsers: runningUsers,
        freeUsers: runningFree,
        premiumUsers: runningPremium,
        activeUsers,
        subscriptions: newSubs,
        cumulativeSubscriptions: runningSubs,
        verifiedRevenueRwf,
        aiUsage,
        researchActivity,
        engagementCount,
        errorCount: aiErrors + paymentErrors,
      };
    });

    const aiFeatureBreakdown = [
      ...aiModeBreakdownRes.rows.map((r: any) => ({
        feature: String(r.mode || 'ask'),
        count: Number(r.count || 0),
        avgLatencyMs: Number(r.avg_latency_ms || 0),
      })),
      { feature: 'research_builder', count: Number(act.total_research_projects || 0), avgLatencyMs: 0 },
      { feature: 'knowledge_maps', count: Number(act.total_knowledge_maps || 0), avgLatencyMs: 0 },
      { feature: 'video_intelligence', count: Number(act.total_video_summaries || 0), avgLatencyMs: 0 },
    ].sort((a, b) => b.count - a.count);

    return res.json({
      scope,
      includesSyntheticData: scope !== 'real',
      bannerWarning:
        scope !== 'real' ? 'DEMO DATA – NOT REAL USERS OR TRANSACTIONS' : null,
      summary: {
        totalUsers: Number(u.total_users || 0),
        realUsers: Number(u.real_users || 0),
        demoUsers: Number(u.demo_users || 0),
        freeUsers: Number(u.free_users || 0),
        premiumUsers: Number(u.premium_users || 0),
        activeUsers: Number(u.active_users || 0),
        inactiveUsers: Number(u.inactive_users || 0),
        newRegistrations30d: Number(u.new_registrations_30d || 0),
        totalSearches: Number(act.total_searches || 0),
        totalAiCalls: Math.max(Number(act.total_ai_requests || 0), Number(act.total_ai_usage_logs || 0)),
        totalResearchProjects: Number(act.total_research_projects || 0),
        totalSavedResources: Number(act.total_saved_resources || 0),
        totalVideoInteractions: Number(act.total_video_interactions || 0),
        totalNotes: Number(act.total_notes || 0),
        activeSubscriptions: Number(act.active_subscriptions || 0),
        successfulPayments,
        totalRevenueRwf,
        totalErrors,
        demoSimulatedPayments: scope === 'real' ? 0 : Number(pay.demo_simulated_payments || 0),
        demoSimulatedRwf: scope === 'real' ? 0 : Number(pay.demo_simulated_rwf || 0),
        openFeedback: Number(act.open_feedback || 0),
        adImpressions,
        adClicks,
      },
      topQueries: topQueriesRes.rows,
      registrationsTimeline: timelineRes.rows,
      monthlyGrowthTimeline,
      aiFeatureBreakdown,
      categoryBreakdown: categoryBreakdownRes.rows,
      countryBreakdown: countryRes.rows,
      languageBreakdown: languageRes.rows,
    });
  } catch (err) {
    console.error('GET /api/admin/reports error:', err);
    return res.status(500).json({ error: 'Failed to compile reports.' });
  }
});

// =========================================================================
// H. SYNTHETIC 500,000 DEMO DATA GENERATOR (/admin/demo-data)
// =========================================================================

adminExtendedRoutes.get('/demo-data/status', async (_req: AuthRequest, res: Response) => {
  try {
    const status = await getDemoGeneratorStatus();
    return res.json({
      ...status,
      defaultConfig: DEFAULT_GENERATOR_CONFIG,
    });
  } catch (err) {
    console.error('GET /api/admin/demo-data/status error:', err);
    return res.status(500).json({ error: 'Failed to load synthetic data status.' });
  }
});

adminExtendedRoutes.post('/demo-data/generate-users', async (req: AuthRequest, res: Response) => {
  try {
    const result = await start500kGenerationJob(req.currentUser!.id, req.body || {});
    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'DEMO_DATA_500K_STARTED',
      targetResource: 'demo_generation_jobs',
      targetId: result.job.id,
    });
    return res.status(202).json({
      message: 'Started 500,000 synthetic user generation job.',
      job: result.job,
    });
  } catch (err: any) {
    return res.status(409).json({ error: err?.message || 'Unable to start synthetic data job.' });
  }
});

adminExtendedRoutes.post('/demo-data/generate-activity', async (req: AuthRequest, res: Response) => {
  try {
    const { scale = 'standard', dateRangeStart, dateRangeEnd } = req.body || {};
    const result = await generateAdditionalActivityJob(
      req.currentUser!.id,
      scale,
      dateRangeStart,
      dateRangeEnd
    );
    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'DEMO_ACTIVITY_GENERATED',
      targetResource: 'demo_generation_jobs',
      targetId: result.job.id,
      details: { totalActivity: result.totalActivity },
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to generate synthetic activity.' });
  }
});

adminExtendedRoutes.post('/demo-data/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const cancelled = await cancelRunningJob(req.body?.jobId);
    if (cancelled) {
      await recordAdminAudit({
        actorEmail: req.currentUser!.email,
        action: 'DEMO_DATA_JOB_CANCELLED',
        targetResource: 'demo_generation_jobs',
      });
    }
    return res.json({ cancelled });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to cancel generation job.' });
  }
});

adminExtendedRoutes.delete('/demo-data', async (req: AuthRequest, res: Response) => {
  try {
    const resetHistory = req.query.reset === 'true' || Boolean(req.body?.resetHistory);
    const result = await deleteAllSyntheticData(req.currentUser!.id, resetHistory);
    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: resetHistory ? 'DEMO_ENV_RESET' : 'DEMO_DATA_DELETED',
      targetResource: 'users',
      details: result,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to delete synthetic data.' });
  }
});

adminExtendedRoutes.get('/demo-data/users', async (req: AuthRequest, res: Response) => {
  try {
    const data = await querySyntheticUsersPaginated({
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 25),
      search: req.query.search ? String(req.query.search) : undefined,
      role: req.query.role ? String(req.query.role) : undefined,
      activityStatus: req.query.activityStatus ? String(req.query.activityStatus) : undefined,
      country: req.query.country ? String(req.query.country) : undefined,
      language: req.query.language ? String(req.query.language) : undefined,
    });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to query synthetic users.' });
  }
});

adminExtendedRoutes.get('/demo-data/export', async (req: AuthRequest, res: Response) => {
  try {
    const data = await querySyntheticUsersPaginated({
      page: 1,
      limit: 5000,
      search: req.query.search ? String(req.query.search) : undefined,
      role: req.query.role ? String(req.query.role) : undefined,
      activityStatus: req.query.activityStatus ? String(req.query.activityStatus) : undefined,
      country: req.query.country ? String(req.query.country) : undefined,
      language: req.query.language ? String(req.query.language) : undefined,
    });
    const header = [
      'id',
      'full_name',
      'email',
      'account_type',
      'is_synthetic',
      'role',
      'activity_status',
      'country',
      'city',
      'preferred_language',
      'registration_source',
      'created_at',
    ].join(',');
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = data.users.map((u: any) =>
      [
        u.id,
        u.full_name,
        u.email,
        u.account_type,
        true,
        u.role,
        u.activity_status,
        u.country,
        u.city,
        u.preferred_language,
        u.registration_source,
        new Date(u.created_at).toISOString(),
      ]
        .map(esc)
        .join(',')
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="2mr-synthetic-demo-users.csv"');
    return res.send([header, ...lines].join('\n'));
  } catch {
    return res.status(500).json({ error: 'Failed to export synthetic users.' });
  }
});

adminExtendedRoutes.get('/settings/system', async (_req: AuthRequest, res: Response) => {
  const rows = await db.select().from(platformSettings);
  return res.json({ settings: rows });
});

adminExtendedRoutes.patch('/settings/system', async (req: AuthRequest, res: Response) => {
  try {
    const { settingKey, settingValue, category = 'general' } = req.body || {};
    if (!settingKey || !settingValue) return res.status(400).json({ error: 'settingKey and settingValue required.' });

    const [existing] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.settingKey, String(settingKey)))
      .limit(1);

    if (existing) {
      await db
        .update(platformSettings)
        .set({ settingValue, updatedBy: req.currentUser!.email, updatedAt: new Date() })
        .where(eq(platformSettings.id, existing.id));
    } else {
      await db.insert(platformSettings).values({
        settingKey: String(settingKey),
        settingValue,
        category,
        updatedBy: req.currentUser!.email,
      });
    }

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'SYSTEM_SETTING_UPDATED',
      targetResource: 'platform_settings',
      targetId: String(settingKey),
    });

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to update system setting.' });
  }
});

adminExtendedRoutes.get('/settings/social-media', async (_req: AuthRequest, res: Response) => {
  const rows = await db.select().from(socialMediaSettings);
  return res.json({
    socialSettings: rows,
    youtubeApiKeyConfigured: Boolean(process.env.YOUTUBE_API_KEY),
  });
});

adminExtendedRoutes.patch('/settings/social-media', async (req: AuthRequest, res: Response) => {
  try {
    const { channelName, handle, channelUrl, profileImageUrl, isEnabled, autoFetchVideos } = req.body || {};
    const [existing] = await db
      .select()
      .from(socialMediaSettings)
      .where(eq(socialMediaSettings.platformKey, 'youtube'))
      .limit(1);

    const payload = {
      platformKey: 'youtube',
      channelName: String(channelName || '2MR – To Master Research'),
      handle: String(handle || '@2mr-z5'),
      channelUrl: String(channelUrl || 'https://www.youtube.com/@2mr-z5'),
      profileImageUrl: String(
        profileImageUrl || '/assets/aistudio/2MR_Global_Research_Badge_bf1478c8.png'
      ),
      isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : true,
      autoFetchVideos: autoFetchVideos !== undefined ? Boolean(autoFetchVideos) : true,
      updatedBy: req.currentUser!.email,
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(socialMediaSettings)
        .set(payload)
        .where(eq(socialMediaSettings.id, existing.id));
    } else {
      await db.insert(socialMediaSettings).values(payload);
    }

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'SOCIAL_MEDIA_SETTINGS_UPDATED',
      targetResource: 'social_media_settings',
      targetId: 'youtube',
      details: { handle: payload.handle, channelUrl: payload.channelUrl },
    });

    return res.json({ success: true, youtube: payload });
  } catch {
    return res.status(500).json({ error: 'Failed to update social media settings.' });
  }
});

// =========================================================================
// I. COOKIE CONSENT & PRIVACY GOVERNANCE (/admin/privacy/consent)
// =========================================================================

adminExtendedRoutes.get('/privacy/consents', async (_req: AuthRequest, res: Response) => {
  try {
    const pool = createPool();
    const [summaryRes, policyRes, changesSummaryRes, recentConsentsRes, recentEventsRes, deletionRequestsRes] =
      await Promise.all([
        pool.query(`
          SELECT
            COUNT(*)::int AS total_consents,
            COUNT(*) FILTER (WHERE consent_action = 'accept_all')::int AS accept_all_count,
            COUNT(*) FILTER (WHERE consent_action = 'reject_optional')::int AS reject_optional_count,
            COUNT(*) FILTER (WHERE consent_action = 'customized')::int AS customized_count,
            COUNT(*) FILTER (WHERE consent_action = 'withdrawn')::int AS withdrawn_count,
            COUNT(*) FILTER (WHERE analytics = true)::int AS analytics_accepted,
            COUNT(*) FILTER (WHERE personalization = true)::int AS personalization_accepted,
            COUNT(*) FILTER (WHERE advertising = true)::int AS advertising_accepted
          FROM cookie_consents
        `),
        pool.query(`
          SELECT
            policy_version AS "policyVersion",
            COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE consent_action = 'accept_all')::int AS "acceptAll",
            COUNT(*) FILTER (WHERE consent_action = 'reject_optional')::int AS "rejectOptional",
            COUNT(*) FILTER (WHERE consent_action = 'customized')::int AS "customized",
            COUNT(*) FILTER (WHERE consent_action = 'withdrawn')::int AS "withdrawn"
          FROM cookie_consents
          GROUP BY policy_version
          ORDER BY policy_version DESC
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total_events,
            COUNT(*) FILTER (WHERE event_type = 'initial_consent')::int AS initial_count,
            COUNT(*) FILTER (WHERE event_type = 'preference_updated')::int AS updated_count,
            COUNT(*) FILTER (WHERE event_type = 'consent_withdrawn')::int AS withdrawn_events_count
          FROM cookie_consent_events
        `),
        pool.query(`
          SELECT
            id,
            CASE WHEN user_id IS NOT NULL THEN 'Authenticated User' ELSE 'Anonymous Visitor' END AS "visitorType",
            policy_version AS "policyVersion",
            consent_action AS "consentAction",
            necessary,
            analytics,
            personalization,
            advertising,
            consented_at AS "consentedAt",
            updated_at AS "updatedAt"
          FROM cookie_consents
          ORDER BY updated_at DESC
          LIMIT 50
        `),
        pool.query(`
          SELECT
            id,
            consent_id AS "consentId",
            event_type AS "eventType",
            consent_action AS "consentAction",
            policy_version AS "policyVersion",
            analytics,
            personalization,
            advertising,
            created_at AS "createdAt"
          FROM cookie_consent_events
          ORDER BY created_at DESC
          LIMIT 50
        `),
        pool.query(`
          SELECT COUNT(*)::int AS pending_deletions
          FROM user_privacy_preferences
          WHERE deletion_status = 'requested'
        `),
      ]);

    const s = summaryRes.rows[0] || {};
    const c = changesSummaryRes.rows[0] || {};
    const d = deletionRequestsRes.rows[0] || {};

    return res.json({
      activePolicyVersion: '2026.1',
      summary: {
        totalConsents: Number(s.total_consents || 0),
        acceptAllCount: Number(s.accept_all_count || 0),
        rejectOptionalCount: Number(s.reject_optional_count || 0),
        customizedCount: Number(s.customized_count || 0),
        withdrawnCount: Number(s.withdrawn_count || 0),
        analyticsAccepted: Number(s.analytics_accepted || 0),
        personalizationAccepted: Number(s.personalization_accepted || 0),
        advertisingAccepted: Number(s.advertising_accepted || 0),
        consentChangesTotal: Number(c.updated_count || 0) + Number(c.withdrawn_events_count || 0),
        totalConsentEvents: Number(c.total_events || 0),
        initialConsentEvents: Number(c.initial_count || 0),
        updatedConsentEvents: Number(c.updated_count || 0),
        withdrawnEvents: Number(c.withdrawn_events_count || 0),
        pendingDeletionRequests: Number(d.pending_deletions || 0),
      },
      policyVersions: policyRes.rows,
      recentConsents: recentConsentsRes.rows,
      recentEvents: recentEventsRes.rows,
    });
  } catch (err) {
    console.error('GET /api/admin/privacy/consents error:', err);
    return res.status(500).json({ error: 'Failed to load consent governance analytics.' });
  }
});

// =========================================================================
// J. OFFICIAL BRAND KNOWLEDGE & AI IDENTITY (/admin/brand-knowledge)
// =========================================================================

adminExtendedRoutes.get('/brand-knowledge', async (_req: AuthRequest, res: Response) => {
  try {
    const data = await getOfficialBrandKnowledge({ includeDrafts: true, bypassCache: true });
    const history = await db
      .select()
      .from(adminAuditLogs)
      .where(eq(adminAuditLogs.targetResource, 'brand_knowledge'))
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(20);
    return res.json({
      ...data,
      auditHistory: history,
    });
  } catch (err) {
    console.error('GET /api/admin/brand-knowledge error:', err);
    return res.status(500).json({ error: 'Failed to load brand knowledge.' });
  }
});

adminExtendedRoutes.put('/brand-knowledge', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await ensureBrandKnowledgeSeeded();
    const b = req.body || {};

    const cleanDate = (val: unknown): string | null => {
      if (val === null || val === undefined) return null;
      const s = String(val).trim();
      return s.length > 0 ? s.slice(0, 60) : null;
    };

    const parsedFeatures = Array.isArray(b.coreFeatures)
      ? b.coreFeatures
          .filter((f: any) => f && String(f.name || '').trim())
          .map((f: any) => ({
            name: String(f.name).trim().slice(0, 120),
            description: String(f.description || '').trim().slice(0, 500),
          }))
      : existing.coreFeatures || DEFAULT_CORE_FEATURES;

    const parsedLanguages: string[] = Array.isArray(b.supportedLanguages)
      ? Array.from(
          new Set<string>(
            b.supportedLanguages
              .map((l: unknown) => String(l || '').trim())
              .filter((l: string) => l.length > 0)
          )
        ).slice(0, 30)
      : existing.supportedLanguages;

    const updates = {
      officialName: String(b.officialName || existing.officialName).trim().slice(0, 160),
      shortName: String(b.shortName || existing.shortName).trim().slice(0, 40),
      acronymMeaning: String(b.acronymMeaning || existing.acronymMeaning).trim().slice(0, 160),
      founderName: String(b.founderName || existing.founderName).trim().slice(0, 120),
      founderTitle: String(b.founderTitle || existing.founderTitle).trim().slice(0, 160),
      founderBio: String(b.founderBio || existing.founderBio).trim().slice(0, 2000),
      slogan: String(b.slogan || existing.slogan).trim().slice(0, 240),
      vision: String(b.vision || existing.vision).trim().slice(0, 500),
      mission: String(b.mission || existing.mission).trim().slice(0, 1200),
      purpose: String(b.purpose || existing.purpose).trim().slice(0, 1200),
      originStory: String(b.originStory || existing.originStory).trim().slice(0, 2500),
      coreFeatures: parsedFeatures.length > 0 ? parsedFeatures : DEFAULT_CORE_FEATURES,
      supportedLanguages: parsedLanguages.length > 0 ? parsedLanguages : ['English'],
      officialFoundingDate:
        b.officialFoundingDate !== undefined
          ? cleanDate(b.officialFoundingDate)
          : existing.officialFoundingDate,
      publicLaunchDate:
        b.publicLaunchDate !== undefined
          ? cleanDate(b.publicLaunchDate)
          : existing.publicLaunchDate,
      developmentStartDate:
        b.developmentStartDate !== undefined
          ? cleanDate(b.developmentStartDate)
          : existing.developmentStartDate,
      contactEmail: String(b.contactEmail || existing.contactEmail).trim().slice(0, 160),
      contactPhone: String(b.contactPhone || existing.contactPhone).trim().slice(0, 60),
      isPublished: b.isPublished !== undefined ? Boolean(b.isPublished) : existing.isPublished,
      updatedByAdminEmail: req.currentUser!.email,
      updatedAt: new Date(),
    };

    await db
      .update(brandKnowledge)
      .set(updates)
      .where(eq(brandKnowledge.slug, 'official'));

    invalidateBrandKnowledgeCache();

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'BRAND_KNOWLEDGE_UPDATED',
      targetResource: 'brand_knowledge',
      targetId: 'official',
      details: {
        officialFoundingDate: updates.officialFoundingDate,
        publicLaunchDate: updates.publicLaunchDate,
        developmentStartDate: updates.developmentStartDate,
        founderName: updates.founderName,
        languagesCount: updates.supportedLanguages.length,
      },
    });

    const refreshed = await getOfficialBrandKnowledge({ includeDrafts: true, bypassCache: true });
    return res.json(refreshed);
  } catch (err) {
    console.error('PUT /api/admin/brand-knowledge error:', err);
    return res.status(500).json({ error: 'Failed to update official brand knowledge.' });
  }
});

adminExtendedRoutes.post('/brand-knowledge/announcements', async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      summary,
      body,
      category = 'official_update',
      announcementDate,
      isPublished = true,
    } = req.body || {};

    if (!title || !String(title).trim() || !summary || !String(summary).trim()) {
      return res.status(400).json({ error: 'Announcement title and summary are required.' });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const [created] = await db
      .insert(brandAnnouncements)
      .values({
        title: String(title).trim().slice(0, 200),
        summary: String(summary).trim().slice(0, 500),
        body: String(body || summary).trim().slice(0, 4000),
        category: String(category || 'official_update').trim().slice(0, 60),
        announcementDate: String(announcementDate || todayIso).trim().slice(0, 40),
        isPublished: Boolean(isPublished),
        createdByEmail: req.currentUser!.email,
      })
      .returning();

    invalidateBrandKnowledgeCache();

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'BRAND_ANNOUNCEMENT_CREATED',
      targetResource: 'brand_knowledge',
      targetId: created.id,
      details: { title: created.title, isPublished: created.isPublished },
    });

    return res.status(201).json({ announcement: created });
  } catch (err) {
    console.error('POST /api/admin/brand-knowledge/announcements error:', err);
    return res.status(500).json({ error: 'Failed to create official announcement.' });
  }
});

adminExtendedRoutes.patch('/brand-knowledge/announcements/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [existing] = await db
      .select()
      .from(brandAnnouncements)
      .where(eq(brandAnnouncements.id, req.params.id))
      .limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    const b = req.body || {};
    const [updated] = await db
      .update(brandAnnouncements)
      .set({
        title: b.title !== undefined ? String(b.title).trim().slice(0, 200) : existing.title,
        summary: b.summary !== undefined ? String(b.summary).trim().slice(0, 500) : existing.summary,
        body: b.body !== undefined ? String(b.body).trim().slice(0, 4000) : existing.body,
        category: b.category !== undefined ? String(b.category).trim().slice(0, 60) : existing.category,
        announcementDate:
          b.announcementDate !== undefined
            ? String(b.announcementDate).trim().slice(0, 40)
            : existing.announcementDate,
        isPublished: b.isPublished !== undefined ? Boolean(b.isPublished) : existing.isPublished,
        updatedAt: new Date(),
      })
      .where(eq(brandAnnouncements.id, existing.id))
      .returning();

    invalidateBrandKnowledgeCache();

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'BRAND_ANNOUNCEMENT_UPDATED',
      targetResource: 'brand_knowledge',
      targetId: updated.id,
      details: { title: updated.title, isPublished: updated.isPublished },
    });

    return res.json({ announcement: updated });
  } catch (err) {
    console.error('PATCH /api/admin/brand-knowledge/announcements/:id error:', err);
    return res.status(500).json({ error: 'Failed to update official announcement.' });
  }
});

adminExtendedRoutes.delete('/brand-knowledge/announcements/:id', async (req: AuthRequest, res: Response) => {
  try {
    const [deleted] = await db
      .delete(brandAnnouncements)
      .where(eq(brandAnnouncements.id, req.params.id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    invalidateBrandKnowledgeCache();

    await recordAdminAudit({
      actorEmail: req.currentUser!.email,
      action: 'BRAND_ANNOUNCEMENT_DELETED',
      targetResource: 'brand_knowledge',
      targetId: deleted.id,
      details: { title: deleted.title },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/brand-knowledge/announcements/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete official announcement.' });
  }
});


