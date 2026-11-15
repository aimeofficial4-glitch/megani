import crypto from 'crypto';
import { desc, inArray } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';

export class MomoApiError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, statusCode = 500, code = 'MOMO_API_ERROR', details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface MomoPublicConfigStatus {
  configured: boolean;
  sandboxMode: boolean;
  environment: string;
  targetEnvironment: string;
  baseUrl: string;
  missingVars: string[];
  varsStatus: {
    MTN_MOMO_SUBSCRIPTION_KEY: boolean;
    MTN_MOMO_API_USER: boolean;
    MTN_MOMO_API_KEY: boolean;
    MTN_MOMO_TARGET_ENVIRONMENT: boolean;
    MTN_MOMO_ENVIRONMENT: boolean;
  };
}

export interface SafeTokenStatus {
  status: 'active' | 'expired' | 'not_cached' | 'unconfigured' | 'error';
  cached: boolean;
  expiresAt: string | null;
  expiresInSeconds: number | null;
  ttlRemainingSeconds: number;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export interface AccountBalanceResult {
  availableBalance: string;
  currency: string;
  targetEnvironment: string;
  environment: string;
  lastUpdatedAt: string;
  note: string;
}

export interface AccountHolderValidationResult {
  state: 'active' | 'inactive' | 'unverified';
  active: boolean | null;
  accountHolderIdType: 'msisdn' | 'email' | 'party_code';
  maskedAccountHolderId: string;
  checkedAt: string;
  message: string;
  disclaimer: string;
}

const REQUEST_TIMEOUT_MS = 12_000;
const ALLOWED_ID_TYPES = new Set(['msisdn', 'email', 'party_code']);

function maskIdentifier(idType: string, rawId: string): string {
  const clean = rawId.trim();
  if (idType === 'email') {
    const [local, domain] = clean.split('@');
    if (!domain) return '***';
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if (clean.length <= 6) return '***';
  return `${clean.slice(0, 5)}***${clean.slice(-3)}`;
}

export function normalizeAccountHolderId(
  rawType: string,
  rawId: string
): { type: 'msisdn' | 'email' | 'party_code'; id: string } {
  const type = String(rawType || '').trim().toLowerCase();
  if (!ALLOWED_ID_TYPES.has(type)) {
    throw new MomoApiError(
      'Invalid accountHolderIdType. Allowed values: msisdn, email, party_code.',
      400,
      'INVALID_ID_TYPE'
    );
  }

  const trimmedId = String(rawId || '').trim();
  if (!trimmedId) {
    throw new MomoApiError('accountHolderId is required.', 400, 'MISSING_ACCOUNT_HOLDER_ID');
  }

  if (type === 'msisdn') {
    const digits = trimmedId.replace(/\D/g, '');
    let normalized = digits;
    if (digits.startsWith('07') && digits.length === 10) {
      normalized = `250${digits.slice(1)}`;
    }
    if (!/^\d{10,15}$/.test(normalized)) {
      throw new MomoApiError(
        'Enter a valid MTN MoMo phone number (e.g. 078XXXXXXX, 25078XXXXXXX, or MTN Sandbox test MSISDN).',
        400,
        'INVALID_MSISDN'
      );
    }
    return { type: 'msisdn', id: normalized };
  }

  if (type === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedId)) {
      throw new MomoApiError('Enter a valid email address.', 400, 'INVALID_EMAIL');
    }
    return { type: 'email', id: trimmedId.toLowerCase() };
  }

  if (!/^[A-Za-z0-9_-]{3,64}$/.test(trimmedId)) {
    throw new MomoApiError('Invalid party_code format.', 400, 'INVALID_PARTY_CODE');
  }
  return { type: 'party_code', id: trimmedId };
}

async function recordSafeAudit(
  actor: { id?: string | null; email: string },
  action: string,
  details: Record<string, unknown>
) {
  try {
    await db.insert(auditLogs).values({
      actorUserId: actor.id || null,
      actorEmail: actor.email,
      action,
      resource: 'mtn_momo_sandbox',
      details,
    });
  } catch (err) {
    console.error('Failed to record safe MoMo audit event:', (err as Error)?.message || 'unknown');
  }
}

// ============================================================================
// 1. momoConfig
// ============================================================================
export const momoConfig = {
  getEnvironment(): string {
    return (process.env.MTN_MOMO_ENVIRONMENT || 'sandbox').trim().toLowerCase();
  },

  getTargetEnvironment(): string {
    return (process.env.MTN_MOMO_TARGET_ENVIRONMENT || 'sandbox').trim();
  },

  getSandboxBaseUrl(): string {
    // Allow internal sandbox simulator override only in non-production runtime if explicitly configured
    const testOverride =
      process.env.NODE_ENV !== 'production'
        ? (process.env.MTN_MOMO_SANDBOX_BASE_URL || '').trim().replace(/\/+$/, '')
        : '';
    if (testOverride) return testOverride;
    return 'https://sandbox.momodeveloper.mtn.co.rw';
  },

  getStatus(): MomoPublicConfigStatus {
    const environment = this.getEnvironment();
    const targetEnvironment = this.getTargetEnvironment();
    const hasSubKey = Boolean((process.env.MTN_MOMO_SUBSCRIPTION_KEY || '').trim());
    const hasApiUser = Boolean((process.env.MTN_MOMO_API_USER || '').trim());
    const hasApiKey = Boolean((process.env.MTN_MOMO_API_KEY || '').trim());
    const hasTargetEnv = Boolean((process.env.MTN_MOMO_TARGET_ENVIRONMENT || '').trim());
    const hasMomoEnv = Boolean((process.env.MTN_MOMO_ENVIRONMENT || '').trim());

    const missingVars: string[] = [];
    if (!hasSubKey) missingVars.push('MTN_MOMO_SUBSCRIPTION_KEY');
    if (!hasApiUser) missingVars.push('MTN_MOMO_API_USER');
    if (!hasApiKey) missingVars.push('MTN_MOMO_API_KEY');
    if (!hasTargetEnv) missingVars.push('MTN_MOMO_TARGET_ENVIRONMENT');

    const sandboxMode = environment === 'sandbox';
    const configured = hasSubKey && hasApiUser && hasApiKey && sandboxMode;

    return {
      configured,
      sandboxMode,
      environment,
      targetEnvironment: targetEnvironment || 'sandbox',
      baseUrl: 'https://sandbox.momodeveloper.mtn.co.rw',
      missingVars,
      varsStatus: {
        MTN_MOMO_SUBSCRIPTION_KEY: hasSubKey,
        MTN_MOMO_API_USER: hasApiUser,
        MTN_MOMO_API_KEY: hasApiKey,
        MTN_MOMO_TARGET_ENVIRONMENT: hasTargetEnv,
        MTN_MOMO_ENVIRONMENT: hasMomoEnv,
      },
    };
  },

  getPrivateCredentials(): {
    subscriptionKey: string;
    apiUser: string;
    apiKey: string;
    targetEnvironment: string;
    baseUrl: string;
    credentialFingerprint: string;
  } {
    const status = this.getStatus();
    if (!status.sandboxMode) {
      throw new MomoApiError(
        'This phase is restricted to MTN MoMo Sandbox mode (MTN_MOMO_ENVIRONMENT=sandbox).',
        503,
        'SANDBOX_MODE_REQUIRED'
      );
    }

    const subscriptionKey = (process.env.MTN_MOMO_SUBSCRIPTION_KEY || '').trim();
    const apiUser = (process.env.MTN_MOMO_API_USER || '').trim();
    const apiKey = (process.env.MTN_MOMO_API_KEY || '').trim();
    const targetEnvironment = this.getTargetEnvironment() || 'sandbox';

    const missing: string[] = [];
    if (!subscriptionKey) missing.push('MTN_MOMO_SUBSCRIPTION_KEY');
    if (!apiUser) missing.push('MTN_MOMO_API_USER');
    if (!apiKey) missing.push('MTN_MOMO_API_KEY');

    if (missing.length > 0) {
      throw new MomoApiError(
        `MTN MoMo Sandbox credentials are missing on the server: ${missing.join(', ')}.`,
        503,
        'MOMO_CONFIG_MISSING',
        { missingVars: missing }
      );
    }

    const baseUrl = this.getSandboxBaseUrl();
    const credentialFingerprint = crypto
      .createHash('sha256')
      .update(`${baseUrl}|${subscriptionKey}|${apiUser}|${apiKey}|${targetEnvironment}`)
      .digest('hex');

    return {
      subscriptionKey,
      apiUser,
      apiKey,
      targetEnvironment,
      baseUrl,
      credentialFingerprint,
    };
  },
};

// ============================================================================
// 2. momoAuthenticationService
// ============================================================================
export const momoAuthenticationService = {
  async authenticateWithMtn(): Promise<{
    accessToken: string;
    expiresInSeconds: number;
    credentialFingerprint: string;
  }> {
    const creds = momoConfig.getPrivateCredentials();
    const basicAuth = Buffer.from(`${creds.apiUser}:${creds.apiKey}`).toString('base64');

    let res: Response;
    try {
      res = await fetch(`${creds.baseUrl}/collection/token/`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Ocp-Apim-Subscription-Key': creds.subscriptionKey,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      throw new MomoApiError(
        isTimeout
          ? 'MTN MoMo Sandbox authentication request timed out.'
          : 'Unable to reach MTN MoMo Sandbox authentication service.',
        504,
        isTimeout ? 'MOMO_AUTH_TIMEOUT' : 'MOMO_AUTH_NETWORK_ERROR'
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new MomoApiError(
        'MTN MoMo Sandbox rejected the configured API credentials or subscription key.',
        401,
        'MOMO_INVALID_CREDENTIALS'
      );
    }

    if (!res.ok) {
      throw new MomoApiError(
        `MTN MoMo Sandbox authentication failed (HTTP ${res.status}).`,
        502,
        'MOMO_AUTH_HTTP_ERROR'
      );
    }

    let payload: { access_token?: string; expires_in?: number; token_type?: string };
    try {
      payload = (await res.json()) as { access_token?: string; expires_in?: number; token_type?: string };
    } catch {
      throw new MomoApiError(
        'MTN MoMo Sandbox returned an invalid token payload.',
        502,
        'MOMO_AUTH_INVALID_PAYLOAD'
      );
    }

    if (!payload?.access_token || typeof payload.access_token !== 'string') {
      throw new MomoApiError(
        'MTN MoMo Sandbox response did not contain an access token.',
        502,
        'MOMO_AUTH_MISSING_TOKEN'
      );
    }

    const expiresInSeconds = Math.max(60, Number(payload.expires_in || 3600));
    return {
      accessToken: payload.access_token,
      expiresInSeconds,
      credentialFingerprint: creds.credentialFingerprint,
    };
  },
};

// ============================================================================
// 3. momoTokenService
// ============================================================================
interface TokenCacheRecord {
  accessToken: string;
  expiresAtMs: number;
  expiresInSeconds: number;
  lastCheckedAt: string;
  credentialFingerprint: string;
}

let cachedTokenRecord: TokenCacheRecord | null = null;
let inFlightTokenPromise: Promise<TokenCacheRecord> | null = null;
let lastTokenError: string | null = null;
let lastTokenCheckedAt: string | null = null;

export const momoTokenService = {
  invalidateCache(): void {
    cachedTokenRecord = null;
    inFlightTokenPromise = null;
  },

  getSafeTokenStatus(): SafeTokenStatus {
    const cfgStatus = momoConfig.getStatus();
    if (!cfgStatus.configured) {
      return {
        status: 'unconfigured',
        cached: false,
        expiresAt: null,
        expiresInSeconds: null,
        ttlRemainingSeconds: 0,
        lastCheckedAt: lastTokenCheckedAt,
        lastError: lastTokenError,
      };
    }

    if (!cachedTokenRecord) {
      return {
        status: lastTokenError ? 'error' : 'not_cached',
        cached: false,
        expiresAt: null,
        expiresInSeconds: null,
        ttlRemainingSeconds: 0,
        lastCheckedAt: lastTokenCheckedAt,
        lastError: lastTokenError,
      };
    }

    const remainingMs = cachedTokenRecord.expiresAtMs - Date.now();
    const expired = remainingMs <= 60_000;

    return {
      status: expired ? 'expired' : 'active',
      cached: !expired,
      expiresAt: new Date(cachedTokenRecord.expiresAtMs).toISOString(),
      expiresInSeconds: cachedTokenRecord.expiresInSeconds,
      ttlRemainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
      lastCheckedAt: cachedTokenRecord.lastCheckedAt,
      lastError: lastTokenError,
    };
  },

  async getAccessToken(
    forceRefresh = false,
    actor?: { id?: string | null; email: string }
  ): Promise<{ accessToken: string; fromCache: boolean; record: TokenCacheRecord }> {
    const creds = momoConfig.getPrivateCredentials();
    const now = Date.now();

    if (
      !forceRefresh &&
      cachedTokenRecord &&
      cachedTokenRecord.credentialFingerprint === creds.credentialFingerprint &&
      cachedTokenRecord.expiresAtMs - 60_000 > now
    ) {
      return {
        accessToken: cachedTokenRecord.accessToken,
        fromCache: true,
        record: cachedTokenRecord,
      };
    }

    if (inFlightTokenPromise && !forceRefresh) {
      const rec = await inFlightTokenPromise;
      return { accessToken: rec.accessToken, fromCache: false, record: rec };
    }

    inFlightTokenPromise = (async () => {
      try {
        const authResult = await momoAuthenticationService.authenticateWithMtn();
        const checkedAt = new Date().toISOString();
        const record: TokenCacheRecord = {
          accessToken: authResult.accessToken,
          expiresAtMs: Date.now() + authResult.expiresInSeconds * 1000,
          expiresInSeconds: authResult.expiresInSeconds,
          lastCheckedAt: checkedAt,
          credentialFingerprint: authResult.credentialFingerprint,
        };
        cachedTokenRecord = record;
        lastTokenError = null;
        lastTokenCheckedAt = checkedAt;

        if (actor) {
          await recordSafeAudit(actor, 'MOMO_SANDBOX_TOKEN_ACQUIRED', {
            environment: momoConfig.getEnvironment(),
            targetEnvironment: creds.targetEnvironment,
            expiresInSeconds: authResult.expiresInSeconds,
          });
        }
        return record;
      } catch (err: any) {
        lastTokenError = err?.message || 'Token acquisition failed.';
        lastTokenCheckedAt = new Date().toISOString();
        if (actor) {
          await recordSafeAudit(actor, 'MOMO_SANDBOX_TOKEN_FAILED', {
            code: err?.code || 'ERROR',
            statusCode: err?.statusCode || 500,
          });
        }
        throw err;
      } finally {
        inFlightTokenPromise = null;
      }
    })();

    const record = await inFlightTokenPromise;
    return { accessToken: record.accessToken, fromCache: false, record };
  },

  async acquireTokenMetadataOnly(
    forceRefresh = false,
    actor: { id?: string | null; email: string }
  ): Promise<SafeTokenStatus & { environment: string; targetEnvironment: string }> {
    const { fromCache, record } = await this.getAccessToken(forceRefresh, actor);
    const remainingSeconds = Math.max(0, Math.floor((record.expiresAtMs - Date.now()) / 1000));
    return {
      status: 'active',
      cached: fromCache,
      expiresAt: new Date(record.expiresAtMs).toISOString(),
      expiresInSeconds: record.expiresInSeconds,
      ttlRemainingSeconds: remainingSeconds,
      lastCheckedAt: record.lastCheckedAt,
      lastError: null,
      environment: momoConfig.getEnvironment(),
      targetEnvironment: momoConfig.getTargetEnvironment() || 'sandbox',
    };
  },
};

// ============================================================================
// 4. momoAccountBalanceService
// ============================================================================
let lastBalanceSnapshot: AccountBalanceResult | null = null;
let lastBalanceError: string | null = null;

export const momoAccountBalanceService = {
  getLastSnapshot(): { snapshot: AccountBalanceResult | null; lastError: string | null } {
    return { snapshot: lastBalanceSnapshot, lastError: lastBalanceError };
  },

  async getCollectionsBalance(actor: { id?: string | null; email: string }): Promise<AccountBalanceResult> {
    const creds = momoConfig.getPrivateCredentials();

    const executeRequest = async (token: string) =>
      fetch(`${creds.baseUrl}/collection/v1_0/account/balance`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Target-Environment': creds.targetEnvironment,
          'Ocp-Apim-Subscription-Key': creds.subscriptionKey,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

    let tokenData = await momoTokenService.getAccessToken(false, actor);
    let res: Response;
    try {
      res = await executeRequest(tokenData.accessToken);
      if (res.status === 401) {
        momoTokenService.invalidateCache();
        tokenData = await momoTokenService.getAccessToken(true, actor);
        res = await executeRequest(tokenData.accessToken);
      }
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      lastBalanceError = isTimeout
        ? 'MTN MoMo Sandbox balance request timed out.'
        : 'Unable to reach MTN MoMo Sandbox balance service.';
      throw new MomoApiError(lastBalanceError, 504, isTimeout ? 'MOMO_BALANCE_TIMEOUT' : 'MOMO_BALANCE_NETWORK_ERROR');
    }

    if (!res.ok) {
      lastBalanceError = `MTN MoMo Sandbox balance endpoint returned HTTP ${res.status}.`;
      await recordSafeAudit(actor, 'MOMO_BALANCE_CHECK_FAILED', { httpStatus: res.status });
      throw new MomoApiError(
        res.status === 401 || res.status === 403
          ? 'MTN MoMo Sandbox rejected authorization for account balance check.'
          : 'Collections account balance is currently unavailable from MTN MoMo Sandbox.',
        res.status === 401 || res.status === 403 ? 502 : 502,
        'MOMO_BALANCE_HTTP_ERROR'
      );
    }

    let body: { availableBalance?: string | number; currency?: string };
    try {
      body = (await res.json()) as { availableBalance?: string | number; currency?: string };
    } catch {
      lastBalanceError = 'Invalid JSON received from MTN MoMo balance endpoint.';
      throw new MomoApiError('Invalid balance response from MTN MoMo Sandbox.', 502, 'MOMO_BALANCE_INVALID_JSON');
    }

    if (body.availableBalance === undefined || body.availableBalance === null || !body.currency) {
      lastBalanceError = 'MTN MoMo balance response omitted availableBalance or currency.';
      throw new MomoApiError(
        'MTN MoMo Sandbox balance response was incomplete.',
        502,
        'MOMO_BALANCE_INCOMPLETE'
      );
    }

    const result: AccountBalanceResult = {
      availableBalance: String(body.availableBalance),
      currency: String(body.currency).toUpperCase(),
      targetEnvironment: creds.targetEnvironment,
      environment: momoConfig.getEnvironment(),
      lastUpdatedAt: new Date().toISOString(),
      note: 'Business Collections account balance returned by MTN MoMo Sandbox (not an individual customer wallet).',
    };

    lastBalanceSnapshot = result;
    lastBalanceError = null;

    await recordSafeAudit(actor, 'MOMO_COLLECTIONS_BALANCE_RETRIEVED', {
      currency: result.currency,
      targetEnvironment: result.targetEnvironment,
      retrievedAt: result.lastUpdatedAt,
    });

    return result;
  },
};

// ============================================================================
// 5. momoAccountHolderService
// ============================================================================
const recentChecks: AccountHolderValidationResult[] = [];

export const momoAccountHolderService = {
  getRecentChecks(): AccountHolderValidationResult[] {
    return [...recentChecks];
  },

  async validateAccountHolder(params: {
    accountHolderIdType: string;
    accountHolderId: string;
    consent: boolean;
    actor: { id?: string | null; email: string };
  }): Promise<AccountHolderValidationResult> {
    if (!params.consent) {
      throw new MomoApiError(
        'Explicit customer consent is required before sending an MTN account-holder validation request.',
        400,
        'CONSENT_REQUIRED'
      );
    }

    const { type, id } = normalizeAccountHolderId(params.accountHolderIdType, params.accountHolderId);
    const maskedId = maskIdentifier(type, id);
    const creds = momoConfig.getPrivateCredentials();
    const checkedAt = new Date().toISOString();
    const disclaimer =
      'Account-holder validation only checks whether the MoMo account is active. It does not guarantee sufficient funds, confirm payment, or activate Premium.';

    const executeRequest = async (token: string) =>
      fetch(
        `${creds.baseUrl}/collection/v1_0/accountholder/${encodeURIComponent(type)}/${encodeURIComponent(id)}/active`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Target-Environment': creds.targetEnvironment,
            'Ocp-Apim-Subscription-Key': creds.subscriptionKey,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );

    let res: Response;
    try {
      let tokenData = await momoTokenService.getAccessToken(false, params.actor);
      res = await executeRequest(tokenData.accessToken);
      if (res.status === 401) {
        momoTokenService.invalidateCache();
        tokenData = await momoTokenService.getAccessToken(true, params.actor);
        res = await executeRequest(tokenData.accessToken);
      }
    } catch (err: any) {
      if (err instanceof MomoApiError) throw err;
      const result: AccountHolderValidationResult = {
        state: 'unverified',
        active: null,
        accountHolderIdType: type,
        maskedAccountHolderId: maskedId,
        checkedAt,
        message: 'Could not verify account',
        disclaimer,
      };
      recentChecks.unshift(result);
      if (recentChecks.length > 15) recentChecks.length = 15;
      await recordSafeAudit(params.actor, 'MOMO_ACCOUNT_HOLDER_UNVERIFIED', {
        accountHolderIdType: type,
        maskedAccountHolderId: maskedId,
        reason: err?.name === 'TimeoutError' ? 'timeout' : 'network_error',
      });
      return result;
    }

    if (res.status === 200) {
      let body: { result?: boolean } = {};
      try {
        body = (await res.json()) as { result?: boolean };
      } catch {
        body = {};
      }
      const isActive = body.result === true;
      const result: AccountHolderValidationResult = {
        state: isActive ? 'active' : 'inactive',
        active: isActive,
        accountHolderIdType: type,
        maskedAccountHolderId: maskedId,
        checkedAt,
        message: isActive ? 'Account active' : 'Account inactive',
        disclaimer,
      };
      recentChecks.unshift(result);
      if (recentChecks.length > 15) recentChecks.length = 15;
      await recordSafeAudit(params.actor, 'MOMO_ACCOUNT_HOLDER_VALIDATED', {
        accountHolderIdType: type,
        maskedAccountHolderId: maskedId,
        state: result.state,
      });
      return result;
    }

    if (res.status === 404) {
      const result: AccountHolderValidationResult = {
        state: 'inactive',
        active: false,
        accountHolderIdType: type,
        maskedAccountHolderId: maskedId,
        checkedAt,
        message: 'Account inactive',
        disclaimer,
      };
      recentChecks.unshift(result);
      if (recentChecks.length > 15) recentChecks.length = 15;
      await recordSafeAudit(params.actor, 'MOMO_ACCOUNT_HOLDER_VALIDATED', {
        accountHolderIdType: type,
        maskedAccountHolderId: maskedId,
        state: 'inactive',
      });
      return result;
    }

    const result: AccountHolderValidationResult = {
      state: 'unverified',
      active: null,
      accountHolderIdType: type,
      maskedAccountHolderId: maskedId,
      checkedAt,
      message: 'Could not verify account',
      disclaimer,
    };
    recentChecks.unshift(result);
    if (recentChecks.length > 15) recentChecks.length = 15;
    await recordSafeAudit(params.actor, 'MOMO_ACCOUNT_HOLDER_UNVERIFIED', {
      accountHolderIdType: type,
      maskedAccountHolderId: maskedId,
      httpStatus: res.status,
    });
    return result;
  },
};

export async function getAdminMomoIntegrationOverview() {
  const recentAuditEvents = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorEmail: auditLogs.actorEmail,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(
      inArray(auditLogs.action, [
        'MOMO_SANDBOX_TOKEN_ACQUIRED',
        'MOMO_SANDBOX_TOKEN_FAILED',
        'MOMO_COLLECTIONS_BALANCE_RETRIEVED',
        'MOMO_BALANCE_CHECK_FAILED',
        'MOMO_ACCOUNT_HOLDER_VALIDATED',
        'MOMO_ACCOUNT_HOLDER_UNVERIFIED',
      ])
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(12);

  return {
    config: momoConfig.getStatus(),
    tokenStatus: momoTokenService.getSafeTokenStatus(),
    balance: momoAccountBalanceService.getLastSnapshot(),
    recentAccountHolderChecks: momoAccountHolderService.getRecentChecks(),
    recentAuditEvents,
  };
}
