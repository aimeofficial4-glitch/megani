import crypto from 'crypto';

export type MomoEnvironment = 'sandbox' | 'production';

export type NormalizedMomoStatus =
  | 'pending'
  | 'successful'
  | 'failed'
  | 'rejected'
  | 'expired'
  | 'requires_reconciliation';

export interface MomoConfigStatus {
  configured: boolean;
  productionReady: boolean;
  environment: MomoEnvironment;
  targetEnvironment: string;
  callbackUrl: string | null;
  ipAllowlistConfigured: boolean;
  missingVars: string[];
  warnings: string[];
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
  credentialFingerprint: string;
}

let cachedToken: CachedToken | null = null;
let inFlightTokenPromise: Promise<string> | null = null;

export function getMomoEnvironment(): MomoEnvironment {
  const raw = (process.env.MTN_MOMO_ENVIRONMENT || process.env.MTN_MOMO_ENV || 'sandbox')
    .trim()
    .toLowerCase();
  return raw === 'production' ? 'production' : 'sandbox';
}

export function getMomoTargetEnvironment(env = getMomoEnvironment()): string {
  const explicit = (process.env.MTN_MOMO_TARGET_ENVIRONMENT || '').trim();
  if (explicit) return explicit;
  return env === 'production' ? '' : 'sandbox';
}

export function getMomoCallbackUrl(env = getMomoEnvironment()): string | null {
  const explicitFull = (process.env.MTN_MOMO_CALLBACK_URL || '').trim();
  if (explicitFull) return explicitFull;

  const base = (process.env.MTN_MOMO_CALLBACK_BASE_URL || '').trim().replace(/\/+$/, '');
  if (base) {
    return `${base}/api/payments/momo/callback`;
  }

  // In sandbox only, fallback to APP_URL if present and not placeholder
  if (env === 'sandbox') {
    const appUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (appUrl && appUrl.startsWith('http') && !appUrl.includes('MY_APP_URL')) {
      return `${appUrl}/api/payments/momo/callback`;
    }
  }

  return null;
}

export function getMomoBaseUrl(env = getMomoEnvironment()): string {
  if (env === 'production') {
    // Official MTN Rwanda MoMo Production Collections gateway
    // Never falls back to sandbox endpoint in production
    const prodOverride = (process.env.MTN_MOMO_PRODUCTION_BASE_URL || '').trim().replace(/\/+$/, '');
    if (prodOverride && prodOverride.startsWith('https://') && !prodOverride.includes('sandbox')) {
      return prodOverride;
    }
    return 'https://proxy.momoapi.mtn.com';
  }

  const sandboxOverride = (process.env.MTN_MOMO_SANDBOX_BASE_URL || '').trim().replace(/\/+$/, '');
  if (sandboxOverride) return sandboxOverride;
  return 'https://sandbox.momodeveloper.mtn.co.rw';
}

export function getMomoCurrency(env = getMomoEnvironment()): string {
  if (env === 'production') return 'RWF';
  return (process.env.MTN_MOMO_SANDBOX_CURRENCY || 'EUR').trim().toUpperCase();
}

export function getMomoConfigStatus(): MomoConfigStatus {
  const environment = getMomoEnvironment();
  const targetEnvironment = getMomoTargetEnvironment(environment);
  const callbackUrl = getMomoCallbackUrl(environment);
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!process.env.MTN_MOMO_SUBSCRIPTION_KEY) missing.push('MTN_MOMO_SUBSCRIPTION_KEY');
  if (!process.env.MTN_MOMO_API_USER) missing.push('MTN_MOMO_API_USER');
  if (!process.env.MTN_MOMO_API_KEY) missing.push('MTN_MOMO_API_KEY');

  if (environment === 'production') {
    if (!process.env.MTN_MOMO_TARGET_ENVIRONMENT) {
      missing.push('MTN_MOMO_TARGET_ENVIRONMENT');
    } else if (targetEnvironment.toLowerCase() === 'sandbox') {
      warnings.push('MTN_MOMO_TARGET_ENVIRONMENT cannot be "sandbox" when MTN_MOMO_ENVIRONMENT=production.');
    }

    if (!callbackUrl) {
      missing.push('MTN_MOMO_CALLBACK_BASE_URL');
    } else if (!callbackUrl.startsWith('https://')) {
      warnings.push('Production MTN_MOMO_CALLBACK_BASE_URL must use HTTPS.');
    }
  }

  const configured =
    Boolean(process.env.MTN_MOMO_SUBSCRIPTION_KEY) &&
    Boolean(process.env.MTN_MOMO_API_USER) &&
    Boolean(process.env.MTN_MOMO_API_KEY);

  const productionReady =
    environment === 'production' &&
    configured &&
    missing.length === 0 &&
    warnings.length === 0 &&
    Boolean(callbackUrl && callbackUrl.startsWith('https://')) &&
    targetEnvironment.toLowerCase() !== 'sandbox';

  return {
    configured,
    productionReady,
    environment,
    targetEnvironment: targetEnvironment || (environment === 'production' ? 'unconfigured' : 'sandbox'),
    callbackUrl,
    ipAllowlistConfigured: Boolean((process.env.MTN_MOMO_ALLOWED_IPS || '').trim()),
    missingVars: missing,
    warnings,
  };
}

export function invalidateMomoTokenCache(): void {
  cachedToken = null;
  inFlightTokenPromise = null;
}

export function maskPhone(phone: string): string {
  const clean = phone.replace(/\s+/g, '');
  if (clean.length <= 6) return '***';
  return `${clean.slice(0, 5)}***${clean.slice(-3)}`;
}

export function normalizeRwandaMsisdn(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('250') && digits.length === 12) return digits;
  if (digits.startsWith('07') && digits.length === 10) return `250${digits.slice(1)}`;
  return digits;
}

export function isValidMtnRwandaMsisdn(msisdn: string, env = getMomoEnvironment()): boolean {
  // Production MTN Rwanda MSISDNs use 25078xxxxxxx or 25079xxxxxxx
  if (env === 'production') {
    return /^2507[89]\d{7}$/.test(msisdn);
  }
  // In sandbox allow Rwanda 072/073/078/079 as well as MTN Sandbox test MSISDNs (e.g. 46733123453)
  return /^2507[2389]\d{7}$/.test(msisdn) || /^467331234\d{2}$/.test(msisdn);
}

export function hashMsisdn(msisdn: string): string {
  const normalized = normalizeRwandaMsisdn(msisdn);
  const secret = process.env.SESSION_SECRET || '2mr-default-session-secret-change-me';
  return crypto.createHmac('sha256', secret).update(normalized).digest('hex');
}

function getCredentialFingerprint(env: MomoEnvironment, baseUrl: string): string {
  const raw = [
    env,
    baseUrl,
    process.env.MTN_MOMO_SUBSCRIPTION_KEY || '',
    process.env.MTN_MOMO_API_USER || '',
    process.env.MTN_MOMO_API_KEY || '',
    getMomoTargetEnvironment(env),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function fetchMomoAccessToken(forceRefresh = false): Promise<string> {
  const env = getMomoEnvironment();
  const baseUrl = getMomoBaseUrl(env);
  const fingerprint = getCredentialFingerprint(env, baseUrl);
  const now = Date.now();

  if (
    !forceRefresh &&
    cachedToken &&
    cachedToken.credentialFingerprint === fingerprint &&
    cachedToken.expiresAtMs - 60_000 > now
  ) {
    return cachedToken.accessToken;
  }

  if (inFlightTokenPromise && !forceRefresh) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = (async () => {
    const apiUser = process.env.MTN_MOMO_API_USER!;
    const apiKey = process.env.MTN_MOMO_API_KEY!;
    const subKey = process.env.MTN_MOMO_SUBSCRIPTION_KEY!;
    const basicAuth = Buffer.from(`${apiUser}:${apiKey}`).toString('base64');

    const res = await fetch(`${baseUrl}/collection/token/`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Ocp-Apim-Subscription-Key': subKey,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`MTN MoMo token authentication failed (HTTP ${res.status}).`);
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new Error('MTN MoMo token response did not contain an access_token.');
    }

    const ttlSeconds = Math.max(120, Number(data.expires_in || 3600));
    cachedToken = {
      accessToken: data.access_token,
      expiresAtMs: Date.now() + ttlSeconds * 1000,
      credentialFingerprint: fingerprint,
    };

    return cachedToken.accessToken;
  })();

  try {
    return await inFlightTokenPromise;
  } finally {
    inFlightTokenPromise = null;
  }
}

export async function requestMomoPayment(params: {
  referenceId: string;
  externalId: string;
  amount: number;
  currency: string;
  msisdn: string;
  payerMessage: string;
  payeeNote: string;
}): Promise<{
  initiated: boolean;
  integrationConfigured: boolean;
  httpStatus: number | null;
  providerStatus: 'PENDING' | 'SETUP_REQUIRED' | 'FAILED' | 'UNKNOWN';
  providerCurrency: string;
  message: string;
}> {
  const cfg = getMomoConfigStatus();
  const providerCurrency = cfg.environment === 'production' ? params.currency : getMomoCurrency(cfg.environment);

  if (!cfg.configured || (cfg.environment === 'production' && !cfg.productionReady)) {
    return {
      initiated: false,
      integrationConfigured: false,
      httpStatus: null,
      providerStatus: 'SETUP_REQUIRED',
      providerCurrency,
      message:
        cfg.environment === 'production'
          ? `Live MTN MoMo production activation is blocked pending merchant credentials/configuration (${cfg.missingVars.concat(cfg.warnings).join('; ')}).`
          : 'MTN MoMo Collection API credentials are not configured on the server yet.',
    };
  }

  const baseUrl = getMomoBaseUrl(cfg.environment);
  const subKey = process.env.MTN_MOMO_SUBSCRIPTION_KEY!;
  const targetEnv = cfg.targetEnvironment;

  const attemptRequest = async (token: string) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': params.referenceId,
      'X-Target-Environment': targetEnv,
      'Ocp-Apim-Subscription-Key': subKey,
      'Content-Type': 'application/json',
    };

    if (cfg.callbackUrl) {
      headers['X-Callback-Url'] = cfg.callbackUrl;
    }

    return fetch(`${baseUrl}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amount: String(params.amount),
        currency: providerCurrency,
        externalId: params.externalId,
        payer: {
          partyIdType: 'MSISDN',
          partyId: params.msisdn,
        },
        payerMessage: params.payerMessage.slice(0, 160),
        payeeNote: params.payeeNote.slice(0, 160),
      }),
      signal: AbortSignal.timeout(20_000),
    });
  };

  try {
    let token = await fetchMomoAccessToken(false);
    let res = await attemptRequest(token);

    // Retry once if token was invalidated/rotated externally
    if (res.status === 401) {
      invalidateMomoTokenCache();
      token = await fetchMomoAccessToken(true);
      res = await attemptRequest(token);
    }

    // HTTP 202 Accepted means MTN queued RequestToPay; settlement is still PENDING
    if (res.status === 202 || res.ok) {
      return {
        initiated: true,
        integrationConfigured: true,
        httpStatus: res.status,
        providerStatus: 'PENDING',
        providerCurrency,
        message: 'MTN Mobile Money payment request accepted. Please authorize the prompt on your phone.',
      };
    }

    const errBody = await res.text().catch(() => '');
    let safeReason = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(errBody);
      if (parsed?.message) safeReason = `${safeReason}: ${String(parsed.message).slice(0, 160)}`;
      else if (parsed?.code) safeReason = `${safeReason}: ${String(parsed.code).slice(0, 80)}`;
    } catch {
      if (errBody) safeReason = `${safeReason}: ${errBody.slice(0, 140)}`;
    }

    // 5xx responses leave transaction state ambiguous and must be reconciled
    const isServerError = res.status >= 500;
    return {
      initiated: false,
      integrationConfigured: true,
      httpStatus: res.status,
      providerStatus: isServerError ? 'UNKNOWN' : 'FAILED',
      providerCurrency,
      message: `MTN MoMo Request-to-Pay ${isServerError ? 'returned an unresolved server error' : 'was declined'} (${safeReason}).`,
    };
  } catch (err: any) {
    // Timeout or network error after sending RequestToPay: flag UNKNOWN for safe reconciliation
    console.error('MTN MoMo RequestToPay transport error:', err?.message || 'Unknown error');
    return {
      initiated: false,
      integrationConfigured: true,
      httpStatus: null,
      providerStatus: 'UNKNOWN',
      providerCurrency,
      message: 'Communication timeout with MTN MoMo gateway; transaction queued for status reconciliation.',
    };
  }
}

export interface MomoStatusVerificationResult {
  integrationConfigured: boolean;
  reachable: boolean;
  httpStatus: number | null;
  status: NormalizedMomoStatus;
  rawProviderStatus?: string;
  providerRef?: string;
  externalId?: string;
  amount?: number;
  currency?: string;
  payerPartyId?: string;
  payerPartyIdType?: string;
  reason?: string;
}

export async function checkMomoPaymentStatus(referenceId: string): Promise<MomoStatusVerificationResult> {
  const cfg = getMomoConfigStatus();
  if (!cfg.configured || (cfg.environment === 'production' && !cfg.productionReady)) {
    return {
      integrationConfigured: false,
      reachable: false,
      httpStatus: null,
      status: 'pending',
      reason:
        cfg.environment === 'production'
          ? 'MTN MoMo production credentials are not fully configured.'
          : 'MTN MoMo API credentials are not configured.',
    };
  }

  const baseUrl = getMomoBaseUrl(cfg.environment);
  const subKey = process.env.MTN_MOMO_SUBSCRIPTION_KEY!;
  const targetEnv = cfg.targetEnvironment;

  const attemptGet = async (token: string) =>
    fetch(`${baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Target-Environment': targetEnv,
        'Ocp-Apim-Subscription-Key': subKey,
      },
      signal: AbortSignal.timeout(15_000),
    });

  try {
    let token = await fetchMomoAccessToken(false);
    let res = await attemptGet(token);

    if (res.status === 401) {
      invalidateMomoTokenCache();
      token = await fetchMomoAccessToken(true);
      res = await attemptGet(token);
    }

    if (!res.ok) {
      return {
        integrationConfigured: true,
        reachable: false,
        httpStatus: res.status,
        status: res.status === 404 ? 'requires_reconciliation' : 'requires_reconciliation',
        reason: `MTN status verification returned HTTP ${res.status}`,
      };
    }

    const body = (await res.json()) as {
      status?: string;
      financialTransactionId?: string;
      externalId?: string;
      amount?: string | number;
      currency?: string;
      payer?: { partyIdType?: string; partyId?: string };
      reason?: string;
    };

    const rawStatus = String(body.status || 'PENDING').toUpperCase();
    let normalized: NormalizedMomoStatus = 'requires_reconciliation';
    if (rawStatus === 'SUCCESSFUL') normalized = 'successful';
    else if (rawStatus === 'PENDING') normalized = 'pending';
    else if (rawStatus === 'FAILED') normalized = 'failed';
    else if (rawStatus === 'REJECTED') normalized = 'rejected';
    else if (rawStatus === 'TIMEOUT' || rawStatus === 'EXPIRED') normalized = 'expired';

    const parsedAmount = body.amount !== undefined && body.amount !== null ? Number(body.amount) : undefined;

    return {
      integrationConfigured: true,
      reachable: true,
      httpStatus: res.status,
      status: normalized,
      rawProviderStatus: rawStatus,
      providerRef: body.financialTransactionId || undefined,
      externalId: body.externalId ? String(body.externalId) : undefined,
      amount: parsedAmount !== undefined && !Number.isNaN(parsedAmount) ? parsedAmount : undefined,
      currency: body.currency ? String(body.currency).toUpperCase() : undefined,
      payerPartyId: body.payer?.partyId ? String(body.payer.partyId) : undefined,
      payerPartyIdType: body.payer?.partyIdType ? String(body.payer.partyIdType) : undefined,
      reason: body.reason ? String(body.reason) : undefined,
    };
  } catch (err: any) {
    console.error('MTN MoMo GetStatus transport error:', err?.message || 'Unknown error');
    return {
      integrationConfigured: true,
      reachable: false,
      httpStatus: null,
      status: 'requires_reconciliation',
      reason: 'Unable to reach MTN status verification endpoint; requires reconciliation.',
    };
  }
}

export function generateTransactionReference(): string {
  return crypto.randomUUID();
}
