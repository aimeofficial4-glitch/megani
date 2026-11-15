import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { and, desc, eq, gte, ne } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  aiProviderSettings,
  aiProviders,
  aiUsageLogs,
  auditLogs,
} from '../db/schema.ts';
import { decryptSecret } from './secrets.ts';
import { enqueueBackgroundJob } from './backgroundQueue.ts';

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

const ALLOWED_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-3.1-pro-preview',
  'gemini-2.5-flash',
]);

export { Type, ThinkingLevel };

export class GeminiConfigError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 503) {
    super(message);
    this.name = 'GeminiConfigError';
    this.statusCode = statusCode;
  }
}

export function sanitizeGeminiError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : String(raw || 'Gemini API request failed.');
  const redacted = text
    .replace(/\bAIza[0-9A-Za-z\-_]{20,}\b/g, '[REDACTED_KEY]')
    .replace(/\bAQ\.[0-9A-Za-z\-_.]{16,}\b/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[0-9A-Za-z\-_.]{12,}/gi, 'Bearer [REDACTED]');

  if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(redacted)) {
    return 'Gemini API authentication failed. Verify GEMINI_API_KEY in server Secrets or environment configuration.';
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(redacted)) {
    return 'Gemini API quota or rate limit reached. Wait briefly before retrying or review tier limits in Settings > Secrets.';
  }
  if (/NOT_FOUND|404/i.test(redacted)) {
    return `Selected Gemini model is unavailable. Verify GEMINI_MODEL is set to an active model such as ${DEFAULT_GEMINI_MODEL}.`;
  }
  if (/timeout|timed out/i.test(redacted)) {
    return 'Gemini request timed out. Please retry with a concise prompt.';
  }
  return redacted.slice(0, 260);
}

async function resolveGeminiKey(): Promise<string | null> {
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  if (envKey && envKey !== 'MY_GEMINI_API_KEY') {
    return envKey;
  }
  try {
    const [row] = await db
      .select({ apiKeyEncrypted: aiProviders.apiKeyEncrypted, isEnabled: aiProviders.isEnabled })
      .from(aiProviders)
      .where(eq(aiProviders.slug, 'gemini'))
      .limit(1);
    if (row?.isEnabled && row.apiKeyEncrypted) {
      const dec = decryptSecret(row.apiKeyEncrypted);
      if (dec) return dec;
    }
  } catch {
    // ignore DB lookup failure cleanly
  }
  return null;
}

export async function isGeminiConfigured(): Promise<boolean> {
  const key = await resolveGeminiKey();
  return Boolean(key);
}

export async function getSelectedGeminiModel(): Promise<string> {
  const envModel = (process.env.GEMINI_MODEL || '').trim();
  if (envModel && ALLOWED_MODELS.has(envModel)) {
    return envModel;
  }
  try {
    const [settings] = await db
      .select({ defaultFastModel: aiProviderSettings.defaultFastModel })
      .from(aiProviderSettings)
      .limit(1);
    if (settings?.defaultFastModel && ALLOWED_MODELS.has(settings.defaultFastModel)) {
      return settings.defaultFastModel;
    }
  } catch {
    // fallback to default model
  }
  return DEFAULT_GEMINI_MODEL;
}

async function createGeminiClient(): Promise<{ client: GoogleGenAI; model: string }> {
  const apiKey = await resolveGeminiKey();
  if (!apiKey) {
    throw new GeminiConfigError(
      'GEMINI_API_KEY is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets or server environment.',
      503
    );
  }
  const model = await getSelectedGeminiModel();
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return { client, model };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms)),
  ]);
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 4));
}

function recordGeminiUsageLog(params: {
  feature: string;
  model: string;
  status: 'success' | 'error' | 'timeout';
  inputTokens: number;
  outputTokens: number;
  errorMessage?: string | null;
}) {
  enqueueBackgroundJob('log-gemini-usage', async () => {
    await db.insert(aiUsageLogs).values({
      providerSlug: 'gemini',
      modelKey: params.model,
      mode: params.feature,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      status: params.status,
      errorMessage: params.errorMessage ? `${params.feature}: ${params.errorMessage}` : null,
      isSynthetic: false,
    });
  });
}

function tryExtractJson<T>(rawText: string): T {
  const trimmed = (rawText || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
    throw new Error('Gemini returned malformed JSON response.');
  }
}

export async function generateGeminiText(params: {
  prompt: string;
  systemInstruction?: string;
  thinkingLevel?: ThinkingLevel;
  timeoutMs?: number;
  feature?: string;
}): Promise<{ text: string; model: string; latencyMs: number }> {
  const cleanPrompt = String(params.prompt || '').trim();
  if (!cleanPrompt) {
    throw new GeminiConfigError('Prompt cannot be empty.', 400);
  }
  const { client, model } = await createGeminiClient();
  const timeoutMs = Math.max(3000, Math.min(30000, params.timeoutMs || 14000));
  const started = Date.now();
  const inputTokens = estimateTokens(cleanPrompt + (params.systemInstruction || ''));

  const execute = () => {
    const config: Record<string, any> = {};
    if (params.systemInstruction) config.systemInstruction = params.systemInstruction;
    if (model.startsWith('gemini-4') || model.startsWith('gemini-3')) {
      config.thinkingConfig = { thinkingLevel: params.thinkingLevel || ThinkingLevel.LOW };
    }
    return withTimeout(
      client.models.generateContent({
        model,
        contents: cleanPrompt,
        config: Object.keys(config).length > 0 ? config : undefined,
      }),
      timeoutMs
    );
  };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await execute();
      const text = (response.text || '').trim();
      const latencyMs = Date.now() - started;
      recordGeminiUsageLog({
        feature: params.feature || 'gemini_text',
        model,
        status: 'success',
        inputTokens,
        outputTokens: estimateTokens(text),
      });
      return { text, model, latencyMs };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 0 && /429|503|unavailable|ECONNRESET/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 450));
        continue;
      }
      break;
    }
  }

  const safeMsg = sanitizeGeminiError(lastErr);
  recordGeminiUsageLog({
    feature: params.feature || 'gemini_text',
    model,
    status: /timed out/i.test(safeMsg) ? 'timeout' : 'error',
    inputTokens,
    outputTokens: 0,
    errorMessage: safeMsg,
  });
  throw new Error(safeMsg);
}

export async function generateGeminiJson<T = any>(params: {
  prompt: string;
  systemInstruction?: string;
  responseSchema?: Record<string, any>;
  thinkingLevel?: ThinkingLevel;
  timeoutMs?: number;
  feature?: string;
}): Promise<{ data: T; model: string; latencyMs: number }> {
  const cleanPrompt = String(params.prompt || '').trim();
  if (!cleanPrompt) {
    throw new GeminiConfigError('Prompt cannot be empty.', 400);
  }
  const { client, model } = await createGeminiClient();
  const timeoutMs = Math.max(3000, Math.min(30000, params.timeoutMs || 15000));
  const started = Date.now();
  const inputTokens = estimateTokens(cleanPrompt + (params.systemInstruction || ''));

  const execute = () => {
    const config: Record<string, any> = {
      responseMimeType: 'application/json',
    };
    if (params.systemInstruction) config.systemInstruction = params.systemInstruction;
    if (params.responseSchema) config.responseSchema = params.responseSchema;
    if (model.startsWith('gemini-4') || model.startsWith('gemini-3')) {
      config.thinkingConfig = { thinkingLevel: params.thinkingLevel || ThinkingLevel.LOW };
    }
    return withTimeout(
      client.models.generateContent({
        model,
        contents: cleanPrompt,
        config,
      }),
      timeoutMs
    );
  };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await execute();
      const rawText = response.text || '';
      const parsed = tryExtractJson<T>(rawText);
      const latencyMs = Date.now() - started;
      recordGeminiUsageLog({
        feature: params.feature || 'gemini_json',
        model,
        status: 'success',
        inputTokens,
        outputTokens: estimateTokens(rawText),
      });
      return { data: parsed, model, latencyMs };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 0 && /429|503|unavailable|ECONNRESET/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 450));
        continue;
      }
      break;
    }
  }

  const safeMsg = sanitizeGeminiError(lastErr);
  recordGeminiUsageLog({
    feature: params.feature || 'gemini_json',
    model,
    status: /timed out/i.test(safeMsg) ? 'timeout' : 'error',
    inputTokens,
    outputTokens: 0,
    errorMessage: safeMsg,
  });
  throw new Error(safeMsg);
}

export async function testGeminiConnection(actorEmail?: string): Promise<{
  ok: boolean;
  configured: boolean;
  connectionTestStatus: 'healthy' | 'error' | 'missing';
  model: string;
  latencyMs: number;
  message: string;
  checkedAt: string;
}> {
  const checkedAt = new Date();
  const configured = await isGeminiConfigured();
  const model = await getSelectedGeminiModel();

  if (!configured) {
    await db
      .update(aiProviders)
      .set({
        healthStatus: 'unconfigured',
        lastCheckedAt: checkedAt,
        lastError: 'GEMINI_API_KEY is missing from server environment.',
        updatedAt: checkedAt,
      })
      .where(eq(aiProviders.slug, 'gemini'));

    return {
      ok: false,
      configured: false,
      connectionTestStatus: 'missing',
      model,
      latencyMs: 0,
      message:
        'GEMINI_API_KEY is not configured. Add it via Settings > Secrets or server .env without exposing credentials.',
      checkedAt: checkedAt.toISOString(),
    };
  }

  try {
    const res = await generateGeminiText({
      prompt: 'Respond with exactly: "2MR Gemini operational."',
      thinkingLevel: ThinkingLevel.LOW,
      timeoutMs: 10000,
      feature: 'admin_connection_test',
    });

    await db
      .update(aiProviders)
      .set({
        healthStatus: 'healthy',
        lastCheckedAt: checkedAt,
        lastError: null,
        updatedAt: checkedAt,
      })
      .where(eq(aiProviders.slug, 'gemini'));

    if (actorEmail) {
      await db.insert(auditLogs).values({
        actorEmail,
        action: 'GEMINI_CONNECTION_TEST_SUCCESS',
        resource: 'gemini_integration',
        details: { model, latencyMs: res.latencyMs },
      });
    }

    return {
      ok: true,
      configured: true,
      connectionTestStatus: 'healthy',
      model,
      latencyMs: res.latencyMs,
      message: `Connected to ${model} successfully (${res.latencyMs} ms): ${res.text.slice(0, 80)}`,
      checkedAt: checkedAt.toISOString(),
    };
  } catch (err) {
    const safeMsg = sanitizeGeminiError(err);
    await db
      .update(aiProviders)
      .set({
        healthStatus: 'error',
        lastCheckedAt: checkedAt,
        lastError: safeMsg,
        updatedAt: checkedAt,
      })
      .where(eq(aiProviders.slug, 'gemini'));

    return {
      ok: false,
      configured: true,
      connectionTestStatus: 'error',
      model,
      latencyMs: 0,
      message: safeMsg,
      checkedAt: checkedAt.toISOString(),
    };
  }
}

export async function getGeminiIntegrationStatus() {
  const configured = await isGeminiConfigured();
  const selectedModel = await getSelectedGeminiModel();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [[providerRow], recentUsage, lastSuccessAudit, recentErrorLogs] = await Promise.all([
    db.select().from(aiProviders).where(eq(aiProviders.slug, 'gemini')).limit(1),
    db
      .select({
        status: aiUsageLogs.status,
        inputTokens: aiUsageLogs.inputTokens,
        outputTokens: aiUsageLogs.outputTokens,
        createdAt: aiUsageLogs.createdAt,
      })
      .from(aiUsageLogs)
      .where(and(eq(aiUsageLogs.providerSlug, 'gemini'), eq(aiUsageLogs.isSynthetic, false)))
      .orderBy(desc(aiUsageLogs.createdAt))
      .limit(500),
    db
      .select({ createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(eq(auditLogs.action, 'GEMINI_CONNECTION_TEST_SUCCESS'))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1),
    db
      .select({
        id: aiUsageLogs.id,
        modelKey: aiUsageLogs.modelKey,
        status: aiUsageLogs.status,
        errorMessage: aiUsageLogs.errorMessage,
        createdAt: aiUsageLogs.createdAt,
      })
      .from(aiUsageLogs)
      .where(
        and(
          eq(aiUsageLogs.providerSlug, 'gemini'),
          eq(aiUsageLogs.isSynthetic, false),
          ne(aiUsageLogs.status, 'success')
        )
      )
      .orderBy(desc(aiUsageLogs.createdAt))
      .limit(5),
  ]);

  let totalCalls = 0;
  let calls24h = 0;
  let successCalls = 0;
  let failedCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const row of recentUsage) {
    totalCalls += 1;
    if (row.createdAt >= since24h) calls24h += 1;
    if (row.status === 'success') successCalls += 1;
    else failedCalls += 1;
    inputTokens += Number(row.inputTokens || 0);
    outputTokens += Number(row.outputTokens || 0);
  }

  const lastSuccessfulTestAt =
    lastSuccessAudit[0]?.createdAt?.toISOString() ||
    (providerRow?.healthStatus === 'healthy' && providerRow?.lastCheckedAt
      ? providerRow.lastCheckedAt.toISOString()
      : null);

  return {
    configured,
    configurationStatus: configured ? 'Configured' : 'Missing',
    connectionTestStatus: !configured
      ? 'missing'
      : providerRow?.healthStatus || 'untested',
    lastCheckedAt: providerRow?.lastCheckedAt ? providerRow.lastCheckedAt.toISOString() : null,
    lastSuccessfulTestAt,
    selectedModel,
    lastError: providerRow?.lastError ? sanitizeGeminiError(providerRow.lastError) : null,
    requestUsage: {
      totalCalls,
      calls24h,
      successCalls,
      failedCalls,
      inputTokens,
      outputTokens,
    },
    recentErrors: recentErrorLogs.map((e) => ({
      id: e.id,
      model: e.modelKey,
      status: e.status,
      message: sanitizeGeminiError(e.errorMessage || 'API error'),
      createdAt: e.createdAt.toISOString(),
    })),
    remediationNote: configured
      ? null
      : 'GEMINI_API_KEY is missing. Set GEMINI_API_KEY in Settings > Secrets or server .env to enable Gemini AI across all 6 2MR features.',
  };
}
