import crypto from 'crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  aiProviders,
  aiProviderModels,
  aiProviderSettings,
  aiRequests,
  aiResponses,
  aiUsageLogs,
  aiCostRecords,
  aiVerificationRecords,
} from '../db/schema.ts';
import { decryptSecret } from './secrets.ts';
import {
  ProvenanceSource,
  discoverVerifiedSourcesWithMetrics,
} from './sourceDiscovery.ts';
import { getPublicCache, setPublicCache } from './cache.ts';
import { enqueueBackgroundJob } from './backgroundQueue.ts';
import {
  ResearchDepth,
  buildRoutePlan,
  isProviderHealthy,
  recordProviderOutcome,
} from './aiRouter.ts';
import {
  BrandQueryClassification,
  OfficialBrandAnnouncement,
  OfficialBrandKnowledge,
  buildBrandReferenceSources,
  buildBrandSystemContext,
  buildGroundedBrandFallback,
  classifyBrandIdentityQuery,
  getOfficialBrandKnowledge,
} from './brandKnowledgeService.ts';

export type UnifiedAiMode =
  | 'ask'
  | 'research_intelligence'
  | 'deep_research'
  | 'smart_answer'
  | 'comparison';

export interface ResolvedProvider {
  id: string;
  slug: string;
  name: string;
  providerType: string;
  baseUrl: string | null;
  apiKey: string | null;
  modelKey: string;
  isDefault: boolean;
  priority: number;
  rateLimitPerMin: number;
  costInMicroUsd: number;
  costOutMicroUsd: number;
}

interface ProviderCallResult {
  providerSlug: string;
  modelKey: string;
  rawText: string;
  parsedJson: any | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  ttftMs: number;
  status: 'success' | 'error' | 'timeout';
  errorMessage?: string;
  estimatedCostMicroUsd: number;
}

export interface OrchestratorMetrics {
  researchDepth: ResearchDepth;
  intentCategory: string;
  routingReason: string;
  totalLatencyMs: number;
  ttftMs: number;
  searchLatencyMs: number;
  aiLatencyMs: number;
  dbLatencyMs: number;
  cacheHit: boolean;
  providerUsed: string;
  modelUsed: string;
}

// Short-lived config cache (15s) to eliminate 2 sequential DB round-trips per AI request
let cachedConfig: {
  expiresAt: number;
  providers: ResolvedProvider[];
  settings: typeof aiProviderSettings.$inferSelect | null;
  dbLatencyMs: number;
} | null = null;

export function invalidateAiConfigCache() {
  cachedConfig = null;
}

function resolveEnvKey(slug: string): string | null {
  if (slug === 'gemini') {
    const k = (process.env.GEMINI_API_KEY || '').trim();
    return k && k !== 'MY_GEMINI_API_KEY' ? k : null;
  }
  if (slug === 'openai') return process.env.OPENAI_API_KEY || null;
  if (slug === 'anthropic') return process.env.ANTHROPIC_API_KEY || null;
  if (slug === 'custom') return process.env.CUSTOM_AI_API_KEY || null;
  return null;
}

function getDefaultModelForSlug(slug: string): string {
  if (slug === 'gemini') return (process.env.GEMINI_MODEL || '').trim() || 'gemini-4-hydrogen';
  if (slug === 'openai') return 'gpt-4o-mini';
  if (slug === 'anthropic') return 'claude-3-5-sonnet-latest';
  return 'gpt-4o-mini';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Provider request timed out')), ms)),
  ]);
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 4));
}

function mapThinkingLevel(level: 'LOW' | 'MEDIUM' | 'HIGH'): ThinkingLevel {
  if (level === 'LOW') return ThinkingLevel.LOW;
  if (level === 'HIGH') return ThinkingLevel.HIGH;
  return ThinkingLevel.MEDIUM;
}

export async function getRuntimeAiConfig(): Promise<{
  providers: ResolvedProvider[];
  settings: typeof aiProviderSettings.$inferSelect | null;
  dbLatencyMs: number;
}> {
  const now = Date.now();
  if (cachedConfig && cachedConfig.expiresAt > now) {
    return {
      providers: cachedConfig.providers,
      settings: cachedConfig.settings,
      dbLatencyMs: 0,
    };
  }

  const t0 = performance.now();
  const [providers, models, [settingsRow]] = await Promise.all([
    db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.isEnabled, true))
      .orderBy(asc(aiProviders.priority)),
    db.select().from(aiProviderModels).where(eq(aiProviderModels.isEnabled, true)),
    db.select().from(aiProviderSettings).limit(1),
  ]);
  const dbLatencyMs = Math.round(performance.now() - t0);

  const resolved: ResolvedProvider[] = [];
  for (const p of providers) {
    const dbKey = decryptSecret(p.apiKeyEncrypted);
    const apiKey = dbKey || resolveEnvKey(p.slug);
    if (!apiKey) continue;

    const pModels = models.filter((m) => m.providerId === p.id);
    const chosenModel = pModels.find((m) => m.isDefault) || pModels[0];

    let modelKey = chosenModel?.modelKey || getDefaultModelForSlug(p.slug);
    if (p.slug === 'gemini') {
      const envModel = (process.env.GEMINI_MODEL || '').trim();
      if (envModel) {
        modelKey = envModel;
      } else if (settingsRow?.defaultFastModel) {
        modelKey = settingsRow.defaultFastModel;
      }
    }

    resolved.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      providerType: p.providerType,
      baseUrl: p.baseUrl || (p.slug === 'custom' ? process.env.CUSTOM_AI_BASE_URL || null : null),
      apiKey,
      modelKey,
      isDefault: p.isDefault,
      priority: p.priority,
      rateLimitPerMin: p.rateLimitPerMin,
      costInMicroUsd: chosenModel?.costPer1kInputMicroUsd || 150,
      costOutMicroUsd: chosenModel?.costPer1kOutputMicroUsd || 600,
    });
  }

  const sorted = resolved.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.priority - b.priority;
  });

  cachedConfig = {
    expiresAt: now + 15_000,
    providers: sorted,
    settings: settingsRow || null,
    dbLatencyMs,
  };

  return { providers: sorted, settings: settingsRow || null, dbLatencyMs };
}

export async function getConfiguredProviders(): Promise<ResolvedProvider[]> {
  const cfg = await getRuntimeAiConfig();
  return cfg.providers;
}

function orderHealthyProviders(providers: ResolvedProvider[]): ResolvedProvider[] {
  const healthy = providers.filter((p) => isProviderHealthy(p.slug));
  const degraded = providers.filter((p) => !isProviderHealthy(p.slug));
  return [...healthy, ...degraded];
}

function tryParseJson(rawText: string): any | null {
  if (!rawText) return null;
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callSingleProvider(
  provider: ResolvedProvider,
  prompt: string,
  expectJson: boolean,
  timeoutMs: number,
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'
): Promise<ProviderCallResult> {
  const start = Date.now();
  const inputTokensEst = estimateTokens(prompt);

  try {
    let rawText = '';
    let inputTokens = inputTokensEst;
    let outputTokens = 0;

    if (provider.providerType === 'gemini') {
      const client = new GoogleGenAI({
        apiKey: provider.apiKey!,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const modelName = provider.modelKey || 'gemini-4-hydrogen';
      const isGemini4 = modelName.startsWith('gemini-4') || modelName.startsWith('gemini-3');
      const config: Record<string, any> = {};
      if (expectJson) config.responseMimeType = 'application/json';
      if (isGemini4) {
        config.thinkingConfig = { thinkingLevel: mapThinkingLevel(thinkingLevel) };
      }

      const resp = await withTimeout(
        client.models.generateContent({
          model: modelName,
          contents: prompt,
          config: Object.keys(config).length > 0 ? config : undefined,
        }),
        timeoutMs
      );
      rawText = resp.text || '';
      outputTokens = estimateTokens(rawText);
    } else if (provider.providerType === 'openai' || provider.providerType === 'openai_compatible') {
      const client = new OpenAI({
        apiKey: provider.apiKey!,
        baseURL: provider.baseUrl || undefined,
      });
      const completion = await withTimeout(
        client.chat.completions.create({
          model: provider.modelKey || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are the synthesis engine of 2MR – To Master Research. Never fabricate URLs, DOIs, or statistics. Separate verified facts from uncertain claims.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          ...(expectJson && provider.providerType === 'openai'
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
        timeoutMs
      );
      rawText = completion.choices?.[0]?.message?.content || '';
      inputTokens = completion.usage?.prompt_tokens || inputTokensEst;
      outputTokens = completion.usage?.completion_tokens || estimateTokens(rawText);
    } else if (provider.providerType === 'anthropic') {
      const client = new Anthropic({ apiKey: provider.apiKey! });
      const msg = await withTimeout(
        client.messages.create({
          model: provider.modelKey || 'claude-3-5-sonnet-latest',
          max_tokens: 1800,
          stream: false,
          messages: [{ role: 'user', content: prompt }],
        }),
        timeoutMs
      );
      const firstBlock = msg.content.find((b: { type: string }) => b.type === 'text') as { text?: string } | undefined;
      rawText = firstBlock?.text || '';
      inputTokens = msg.usage?.input_tokens || inputTokensEst;
      outputTokens = msg.usage?.output_tokens || estimateTokens(rawText);
    }

    const parsedJson = expectJson ? tryParseJson(rawText) : null;
    const latencyMs = Date.now() - start;
    const costMicro = Math.round(
      (inputTokens / 1000) * provider.costInMicroUsd +
        (outputTokens / 1000) * provider.costOutMicroUsd
    );

    recordProviderOutcome(provider.slug, true, latencyMs);

    return {
      providerSlug: provider.slug,
      modelKey: provider.modelKey,
      rawText,
      parsedJson,
      inputTokens,
      outputTokens,
      latencyMs,
      ttftMs: latencyMs,
      status: 'success',
      estimatedCostMicroUsd: costMicro,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const msg = err?.message || 'Unknown provider error';
    const isTimeout = /timeout|timed out|abort/i.test(msg);
    recordProviderOutcome(provider.slug, false, latencyMs, msg);
    return {
      providerSlug: provider.slug,
      modelKey: provider.modelKey,
      rawText: '',
      parsedJson: null,
      inputTokens: inputTokensEst,
      outputTokens: 0,
      latencyMs,
      ttftMs: latencyMs,
      status: isTimeout ? 'timeout' : 'error',
      errorMessage: msg,
      estimatedCostMicroUsd: 0,
    };
  }
}

async function streamSingleProvider(
  provider: ResolvedProvider,
  prompt: string,
  timeoutMs: number,
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH',
  onChunk: (delta: string) => void,
  signal?: AbortSignal
): Promise<ProviderCallResult> {
  const start = Date.now();
  const inputTokensEst = estimateTokens(prompt);
  let rawText = '';
  let ttftMs = 0;
  let inputTokens = inputTokensEst;
  let outputTokens = 0;

  const abortErr = new Error('Provider request timed out');
  const timeoutId = setTimeout(() => {
    // Soft timeout tracking handled inside loop & Promise.race
  }, timeoutMs);

  try {
    const streamTask = async () => {
      if (provider.providerType === 'gemini') {
        const client = new GoogleGenAI({
          apiKey: provider.apiKey!,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const modelName = provider.modelKey || 'gemini-4-hydrogen';
        const isGemini4 = modelName.startsWith('gemini-4') || modelName.startsWith('gemini-3');
        const stream = await client.models.generateContentStream({
          model: modelName,
          contents: prompt,
          config: isGemini4
            ? { thinkingConfig: { thinkingLevel: mapThinkingLevel(thinkingLevel) } }
            : undefined,
        });

        for await (const chunk of stream) {
          if (signal?.aborted) break;
          if (Date.now() - start > timeoutMs) throw abortErr;
          const delta = chunk.text || '';
          if (delta) {
            if (ttftMs === 0) ttftMs = Date.now() - start;
            rawText += delta;
            onChunk(delta);
          }
        }
        outputTokens = estimateTokens(rawText);
      } else if (provider.providerType === 'openai' || provider.providerType === 'openai_compatible') {
        const client = new OpenAI({
          apiKey: provider.apiKey!,
          baseURL: provider.baseUrl || undefined,
        });
        const stream = await client.chat.completions.create({
          model: provider.modelKey || 'gpt-4o-mini',
          stream: true,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'You are 2MR – To Master Research. Stream clear, accurate research answers without fabricating URLs or citations.',
            },
            { role: 'user', content: prompt },
          ],
        });
        for await (const part of stream) {
          if (signal?.aborted) break;
          if (Date.now() - start > timeoutMs) throw abortErr;
          const delta = part.choices?.[0]?.delta?.content || '';
          if (delta) {
            if (ttftMs === 0) ttftMs = Date.now() - start;
            rawText += delta;
            onChunk(delta);
          }
        }
        outputTokens = estimateTokens(rawText);
      } else if (provider.providerType === 'anthropic') {
        const client = new Anthropic({ apiKey: provider.apiKey! });
        const stream = await client.messages.create({
          model: provider.modelKey || 'claude-3-5-sonnet-latest',
          max_tokens: 1800,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        });
        for await (const event of stream as AsyncIterable<any>) {
          if (signal?.aborted) break;
          if (Date.now() - start > timeoutMs) throw abortErr;
          if (event?.type === 'content_block_delta' && event?.delta?.text) {
            const delta = String(event.delta.text);
            if (ttftMs === 0) ttftMs = Date.now() - start;
            rawText += delta;
            onChunk(delta);
          }
        }
        outputTokens = estimateTokens(rawText);
      }
    };

    await withTimeout(streamTask(), timeoutMs);

    const latencyMs = Date.now() - start;
    if (ttftMs === 0) ttftMs = latencyMs;
    const costMicro = Math.round(
      (inputTokens / 1000) * provider.costInMicroUsd +
        (outputTokens / 1000) * provider.costOutMicroUsd
    );
    recordProviderOutcome(provider.slug, true, latencyMs);

    return {
      providerSlug: provider.slug,
      modelKey: provider.modelKey,
      rawText,
      parsedJson: null,
      inputTokens,
      outputTokens,
      latencyMs,
      ttftMs,
      status: 'success',
      estimatedCostMicroUsd: costMicro,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const msg = err?.message || 'Streaming provider error';
    const isTimeout = /timeout|timed out|abort/i.test(msg);
    recordProviderOutcome(provider.slug, false, latencyMs, msg);
    return {
      providerSlug: provider.slug,
      modelKey: provider.modelKey,
      rawText,
      parsedJson: null,
      inputTokens: inputTokensEst,
      outputTokens: estimateTokens(rawText),
      latencyMs,
      ttftMs: ttftMs || latencyMs,
      status: isTimeout ? 'timeout' : 'error',
      errorMessage: msg,
      estimatedCostMicroUsd: 0,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function testProviderConnection(providerSlug: string): Promise<{
  ok: boolean;
  healthStatus: string;
  latencyMs: number;
  message: string;
}> {
  const [providerRow] = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.slug, providerSlug))
    .limit(1);

  if (!providerRow) {
    return { ok: false, healthStatus: 'error', latencyMs: 0, message: 'Provider not found.' };
  }

  const dbKey = decryptSecret(providerRow.apiKeyEncrypted);
  const apiKey = dbKey || resolveEnvKey(providerRow.slug);
  if (!apiKey) {
    await db
      .update(aiProviders)
      .set({
        healthStatus: 'unconfigured',
        lastCheckedAt: new Date(),
        lastError: 'No API key saved in database or environment variable.',
      })
      .where(eq(aiProviders.id, providerRow.id));
    return {
      ok: false,
      healthStatus: 'unconfigured',
      latencyMs: 0,
      message: 'API key is not configured yet in Admin Settings or server environment.',
    };
  }

  const models = await db
    .select()
    .from(aiProviderModels)
    .where(eq(aiProviderModels.providerId, providerRow.id));
  const chosenModel = models.find((m) => m.isDefault) || models[0];

  const resolved: ResolvedProvider = {
    id: providerRow.id,
    slug: providerRow.slug,
    name: providerRow.name,
    providerType: providerRow.providerType,
    baseUrl: providerRow.baseUrl || (providerRow.slug === 'custom' ? process.env.CUSTOM_AI_BASE_URL || null : null),
    apiKey,
    modelKey: chosenModel?.modelKey || getDefaultModelForSlug(providerRow.slug),
    isDefault: providerRow.isDefault,
    priority: providerRow.priority,
    rateLimitPerMin: providerRow.rateLimitPerMin,
    costInMicroUsd: 0,
    costOutMicroUsd: 0,
  };

  const result = await callSingleProvider(
    resolved,
    'Respond with exactly the JSON {"status":"ok"}',
    true,
    9000,
    'LOW'
  );

  const healthStatus = result.status === 'success' ? 'healthy' : 'error';
  await db
    .update(aiProviders)
    .set({
      healthStatus,
      lastCheckedAt: new Date(),
      lastError: result.errorMessage || null,
      updatedAt: new Date(),
    })
    .where(eq(aiProviders.id, providerRow.id));

  invalidateAiConfigCache();

  return {
    ok: result.status === 'success',
    healthStatus,
    latencyMs: result.latencyMs,
    message:
      result.status === 'success'
        ? `Verified connection using ${resolved.modelKey} (${result.latencyMs}ms).`
        : result.errorMessage || 'Connection failed.',
  };
}

function buildVerificationSummary(sources: ProvenanceSource[], primary: any, disagreements: string[]) {
  return {
    verifiedFacts: sources
      .filter((s) => s.evidenceClassification === 'Verified Primary / Standard')
      .slice(0, 3)
      .map((s) => `${s.title} (${s.publisher})`),
    reportedClaims: sources
      .filter((s) => s.evidenceClassification !== 'Verified Primary / Standard')
      .slice(0, 3)
      .map((s) => `${s.title} — ${s.sourceType}`),
    interpretations: Array.isArray(primary?.interpretations)
      ? primary.interpretations
      : ['Synthesized overview should be read alongside cited primary documents.'],
    uncertainPoints:
      disagreements.length > 0
        ? disagreements
        : sources.length === 0
          ? ['No external open-access sources were returned for this query.']
          : ['Full statistical methodology requires inspecting the linked source documents.'],
    disagreements,
    note: '2MR checks claims against retrieved external sources. Model agreement alone never establishes factual proof.',
  };
}

function buildFallbackPayload(params: {
  isAnalysisMode: boolean;
  query: string;
  retrievedSources: ProvenanceSource[];
  hasConfiguredProvider: boolean;
  providerFailureReason?: string;
  brandContext?: {
    classification: BrandQueryClassification;
    brand: OfficialBrandKnowledge;
    announcements: OfficialBrandAnnouncement[];
    language?: string;
  } | null;
}) {
  const { isAnalysisMode, query, retrievedSources, hasConfiguredProvider, providerFailureReason, brandContext } = params;

  if (brandContext && brandContext.classification.isBrandQuery) {
    const grounded = buildGroundedBrandFallback({
      query,
      classification: brandContext.classification,
      brand: brandContext.brand,
      announcements: brandContext.announcements,
      requestedLanguage: brandContext.language,
    });
    const fallbackSources = retrievedSources.slice(0, 6).map((r) => ({
      title: r.title,
      url: r.url,
      publisher: r.publisher,
      date: r.publishedDate || 'Official Record',
    }));

    if (isAnalysisMode) {
      return {
        topic: query,
        insufficientEvidence: false,
        consensusScore: 98,
        researchOverview: grounded.directAnswer,
        executiveSummary: grounded.directAnswer,
        keyFindings: [
          `Official Name: ${brandContext.brand.officialName}`,
          `Founder & Creator: ${brandContext.brand.founderName} (${brandContext.brand.founderTitle})`,
          `Official Slogan: "${brandContext.brand.slogan}"`,
        ],
        importantFacts: [
          {
            fact: grounded.directAnswer,
            source: '2MR Official Knowledge Base',
            confidence: 'Verified Primary',
          },
        ],
        detailedExplanation: grounded.detailedExplanation,
        differentPerspectives: [],
        sourceComparison: {
          agreements: [
            {
              point: 'Verified directly against the official 2MR Knowledge Base.',
              supportingSources: ['2MR Official Knowledge Base'],
              evidenceSnippet: grounded.directAnswer,
            },
          ],
          disagreements: [],
        },
        needsFurtherVerification: [],
        researchLimitations: brandContext.brand.publicLaunchDate
          ? 'Grounded in verified official 2MR brand knowledge.'
          : 'Public launch date remains unconfirmed until updated in official 2MR announcements.',
        citations: {
          apa: `2MR – To Master Research (${new Date().getFullYear()}). Official Platform Documentation. /about`,
          mla: `"Official Platform Documentation." 2MR – To Master Research, /about.`,
          chicago: `2MR – To Master Research. "Official Platform Documentation." /about.`,
          bibtex: `@misc{2mr_official,\n  title={2MR Official Identity & Knowledge Base},\n  author={${brandContext.brand.founderName}}\n}`,
        },
        retrievedSources: retrievedSources.slice(0, 6),
        relatedQuestions: [
          'What does 2MR stand for?',
          'What are the main features of 2MR?',
          'When was 2MR founded?',
        ],
      };
    }

    return {
      directAnswer: grounded.directAnswer,
      detailedExplanation: grounded.detailedExplanation,
      simpleExplanation: grounded.simpleExplanation,
      verifiedFacts: [
        {
          fact: grounded.directAnswer,
          source: '2MR Official Knowledge Base',
          confidence: 'Verified Primary',
        },
      ],
      uncertainInformation: [],
      sources: fallbackSources,
      retrievedSources: retrievedSources.slice(0, 6),
      relatedTopics: ['2MR – To Master Research', brandContext.brand.founderName, 'Global Research Platform'],
      followUpQuestions: [
        'What are the six main features of 2MR?',
        'What is the official vision and slogan of 2MR?',
      ],
      insufficientEvidence: false,
    };
  }

  const top = retrievedSources[0];
  const second = retrievedSources[1] || top;
  const cleanSlug = query.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) || 'topic';
  const fallbackSources = retrievedSources.slice(0, 6).map((r) => ({
    title: r.title,
    url: r.url,
    publisher: r.publisher,
    date: r.publishedDate || 'Open Access',
  }));

  if (isAnalysisMode) {
    return {
      topic: query,
      insufficientEvidence: retrievedSources.length === 0,
      consensusScore: retrievedSources.length >= 4 ? 82 : retrievedSources.length > 0 ? 66 : 0,
      researchOverview: top
        ? `"${query}" was evaluated across ${retrievedSources.length} retrieved external records led by ${top.publisher}.`
        : `No matching external records were found for "${query}".`,
      executiveSummary: top
        ? `Primary source "${top.title}" (${top.publisher}) highlights: ${top.snippet}`
        : 'Insufficient retrieved evidence to synthesize conclusions.',
      keyFindings: retrievedSources
        .slice(0, 4)
        .map((r) => `${r.title} (${r.publisher}, ${r.publishedDate || 'Open Access'})`),
      importantFacts: retrievedSources.slice(0, 3).map((r) => ({
        fact: r.snippet,
        source: `${r.publisher} (${r.url})`,
        confidence: r.reliabilityTier,
      })),
      detailedExplanation: retrievedSources
        .slice(0, 4)
        .map((r) => `### ${r.title}\n**Publisher:** ${r.publisher} (${r.publishedDate || 'n.d.'})\n${r.snippet}\n${r.url}`)
        .join('\n\n'),
      differentPerspectives: top
        ? [
            { viewpoint: top.sourceType, proponents: top.publisher, summary: top.snippet },
            { viewpoint: second.sourceType, proponents: second.publisher, summary: second.snippet },
          ]
        : [],
      sourceComparison: {
        agreements: top
          ? [
              {
                point: `Retrieved sources align on primary definitions for ${query}.`,
                supportingSources: retrievedSources.slice(0, 3).map((r) => r.publisher),
                evidenceSnippet: top.snippet,
              },
            ]
          : [],
        disagreements: [],
      },
      needsFurtherVerification: [
        {
          claim: 'Verify full-text tables and datasets directly on the linked primary publications.',
          reason: 'Automated retrieval summarizes public abstracts and metadata.',
          suggestedAction: 'Open cited primary links below.',
        },
      ],
      researchLimitations: !hasConfiguredProvider
        ? 'No AI model API key is currently enabled; showing direct retrieval-grounded synthesis from verified sources.'
        : `Retrieval-grounded digest returned because AI providers did not return complete output (${providerFailureReason || 'timeout'}).`,
      citations: top
        ? {
            apa: `${top.authors[0] || top.publisher} (${(top.publishedDate || '2026').slice(0, 4)}). ${top.title}. ${top.publisher}. ${top.url}`,
            mla: `${top.authors[0] || top.publisher}. "${top.title}." ${top.publisher}, ${top.url}.`,
            chicago: `${top.authors[0] || top.publisher}. "${top.title}." ${top.publisher}. ${top.url}.`,
            bibtex: `@misc{2mr_${cleanSlug},\n  title={${top.title}},\n  howpublished={\\url{${top.url}}}\n}`,
          }
        : { apa: '', mla: '', chicago: '', bibtex: '' },
      retrievedSources: retrievedSources.slice(0, 8),
      relatedQuestions: [
        `What peer-reviewed evidence exists on ${query}?`,
        `What methodologies are compared in ${query}?`,
      ],
    };
  }

  return {
    directAnswer: top
      ? `Based on ${retrievedSources.length} retrieved sources, ${top.title} (${top.publisher}) states: ${top.snippet}`
      : `No verified records were returned from CrossRef, arXiv, OpenAlex, Wikipedia, or 2MR's index for "${query}".`,
    detailedExplanation:
      retrievedSources.length > 0
        ? retrievedSources
            .slice(0, 4)
            .map((r) => `### ${r.title}\n${r.snippet}\n- **Publisher:** ${r.publisher}\n- **URL:** ${r.url}`)
            .join('\n\n')
        : '2MR does not invent citations when live retrieval yields no matching sources.',
    simpleExplanation: top
      ? `${query} is documented in ${retrievedSources.length} retrieved sources led by ${top.publisher}.`
      : `No matching open-access records were retrieved for "${query}".`,
    verifiedFacts: retrievedSources.slice(0, 3).map((r) => ({
      fact: r.snippet,
      source: r.publisher,
      confidence: r.reliabilityTier,
    })),
    uncertainInformation: [
      {
        claim: top
          ? 'Granular full-text details require reading the linked primary source.'
          : `No sources matched "${query}".`,
        notes: '2MR separates retrieved metadata from full-text analysis.',
        uncertaintyReason: top ? 'Abstract-level metadata' : 'Empty retrieval result',
      },
    ],
    sources: fallbackSources,
    relatedTopics: Array.from(new Set(retrievedSources.flatMap((r) => r.keywords || []))).slice(0, 4),
    followUpQuestions: [
      `What are the key standards related to ${query}?`,
      `Where do researchers identify open questions in ${query}?`,
    ],
    insufficientEvidence: retrievedSources.length === 0,
  };
}

function enqueueTelemetryPersistence(params: {
  requestId: string;
  userId?: string | null;
  mode: UnifiedAiMode;
  researchDepth: ResearchDepth;
  intentCategory: string;
  routingReason: string;
  query: string;
  providersSelected: string[];
  status: string;
  totalLatencyMs: number;
  ttftMs: number;
  searchLatencyMs: number;
  dbLatencyMs: number;
  aiLatencyMs: number;
  cacheHit: boolean;
  callResults: ProviderCallResult[];
  successful: ProviderCallResult[];
  externalUrls: string[];
  disagreements: string[];
}) {
  enqueueBackgroundJob('persist-ai-telemetry', async () => {
    await db
      .insert(aiRequests)
      .values({
        id: params.requestId,
        userId: params.userId || null,
        mode: params.mode,
        researchDepth: params.researchDepth,
        intentCategory: params.intentCategory,
        promptSummary: params.query.slice(0, 180),
        providersSelected: params.providersSelected,
        status: params.status,
        latencyMs: params.totalLatencyMs,
        ttftMs: params.ttftMs,
        searchLatencyMs: params.searchLatencyMs,
        dbLatencyMs: params.dbLatencyMs,
        aiLatencyMs: params.aiLatencyMs,
        cacheHit: params.cacheHit,
        routingReason: params.routingReason,
      })
      .onConflictDoNothing();

    for (const r of params.callResults) {
      await Promise.all([
        db.insert(aiResponses).values({
          requestId: params.requestId,
          providerSlug: r.providerSlug,
          modelKey: r.modelKey,
          responseExcerpt: (r.rawText || r.errorMessage || '').slice(0, 1500),
          latencyMs: r.latencyMs,
          status: r.status,
          errorMessage: r.errorMessage || null,
        }),
        db.insert(aiUsageLogs).values({
          userId: params.userId || null,
          providerSlug: r.providerSlug,
          modelKey: r.modelKey,
          mode: `${params.mode}:${params.researchDepth}`,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          status: r.status,
          errorMessage: r.errorMessage || null,
        }),
        db.insert(aiCostRecords).values({
          providerSlug: r.providerSlug,
          modelKey: r.modelKey,
          requestId: params.requestId,
          estimatedCostMicroUsd: r.estimatedCostMicroUsd,
          currency: 'USD',
        }),
      ]);
    }

    await db.insert(aiVerificationRecords).values({
      requestId: params.requestId,
      topic: params.query.slice(0, 180),
      modelsCompared: params.successful.map((s) => `${s.providerSlug}:${s.modelKey}`),
      agreementSummary:
        params.successful.length > 1
          ? `Cross-checked ${params.successful.length} analytical passes against ${params.externalUrls.length} retrieved external sources.`
          : `Grounded response against ${params.externalUrls.length} retrieved external sources.`,
      disagreementsFound: params.disagreements,
      externalSourcesChecked: params.externalUrls,
      verificationStatus:
        params.externalUrls.length >= 2
          ? params.disagreements.length > 0
            ? 'mixed'
            : 'supported'
          : 'insufficient',
    });
  });
}

export async function orchestrateUnifiedAI(params: {
  userId?: string | null;
  mode: UnifiedAiMode;
  researchDepth?: ResearchDepth;
  query: string;
  conversationId?: string | null;
  conversationHistory?: { role: string; content: string }[];
  attachmentContext?: string;
  language?: string;
  sourceFocus?: string;
  depth?: string;
  compareMultipleModels?: boolean;
  retrievedSources?: ProvenanceSource[];
}): Promise<{
  requestId: string;
  mode: UnifiedAiMode;
  researchDepth: ResearchDepth;
  usedMultiModelCheck: boolean;
  modelsEvaluatedCount: number;
  externalSourcesCheckedCount: number;
  metrics: OrchestratorMetrics;
  verificationSummary: {
    verifiedFacts: string[];
    reportedClaims: string[];
    interpretations: string[];
    uncertainPoints: string[];
    disagreements: string[];
    note: string;
  };
  data: any;
}> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const { providers: configuredRaw, settings: settingsRow, dbLatencyMs } = await getRuntimeAiConfig();
  const configured = orderHealthyProviders(configuredRaw);

  const route = buildRoutePlan({
    query: params.query,
    requestedDepth: params.researchDepth || (params.depth === 'Deep Comparative Analysis' ? 'deep' : undefined),
    mode: params.mode,
    attachmentContext: params.attachmentContext,
    compareModels: params.compareMultipleModels,
    settings: settingsRow,
  });

  // Strict privacy guard: NEVER serve or store public cache for private conversations or user attachments
  const isCacheablePublicQuery = !params.conversationId && !params.attachmentContext?.trim();
  const publicCacheKey = `${params.mode}:${route.depth}:${params.language || 'English'}:${params.sourceFocus || 'default'}:${params.query}`;

  if (isCacheablePublicQuery) {
    const cachedResult = await getPublicCache<any>('public_ai', publicCacheKey);
    if (cachedResult) {
      const totalLatencyMs = Date.now() - startedAt;
      const metrics: OrchestratorMetrics = {
        researchDepth: route.depth,
        intentCategory: route.intent,
        routingReason: `${route.routingReason} (Served from cache)`,
        totalLatencyMs,
        ttftMs: totalLatencyMs,
        searchLatencyMs: 0,
        aiLatencyMs: 0,
        dbLatencyMs,
        cacheHit: true,
        providerUsed: 'cache',
        modelUsed: 'cached-synthesis',
      };

      enqueueTelemetryPersistence({
        requestId,
        userId: params.userId,
        mode: params.mode,
        researchDepth: route.depth,
        intentCategory: route.intent,
        routingReason: metrics.routingReason,
        query: params.query,
        providersSelected: ['cache'],
        status: 'completed',
        totalLatencyMs,
        ttftMs: totalLatencyMs,
        searchLatencyMs: 0,
        dbLatencyMs,
        aiLatencyMs: 0,
        cacheHit: true,
        callResults: [],
        successful: [],
        externalUrls: (cachedResult.data?.retrievedSources || []).map((s: any) => s.url).slice(0, 6),
        disagreements: cachedResult.verificationSummary?.disagreements || [],
      });

      return {
        ...cachedResult,
        requestId,
        metrics,
      };
    }
  }

  const historyHas2mr = Boolean(
    params.conversationHistory?.some((m) => /\b2mr\b|to master research|gihozo/i.test(m.content || ''))
  );
  const brandClassification = classifyBrandIdentityQuery(params.query, params.language);
  const needsBrandGrounding = brandClassification.isBrandQuery || historyHas2mr;
  const brandBundle = needsBrandGrounding ? await getOfficialBrandKnowledge() : null;

  // Immediate deterministic security refusal if probing for keys, passwords, tokens, or internal admin details
  if (brandClassification.isSecurityProbe && brandBundle) {
    const isAnalysisMode =
      params.mode === 'research_intelligence' ||
      params.mode === 'deep_research' ||
      params.mode === 'comparison';
    const secSources = buildBrandReferenceSources(brandBundle.brand, brandBundle.announcements) as ProvenanceSource[];
    const secPayload = buildFallbackPayload({
      isAnalysisMode,
      query: params.query,
      retrievedSources: secSources,
      hasConfiguredProvider: configured.length > 0,
      brandContext: {
        classification: brandClassification,
        brand: brandBundle.brand,
        announcements: brandBundle.announcements,
        language: params.language,
      },
    });
    const totalLatencyMs = Date.now() - startedAt;
    return {
      requestId,
      mode: params.mode,
      researchDepth: route.depth,
      usedMultiModelCheck: false,
      modelsEvaluatedCount: 0,
      externalSourcesCheckedCount: secSources.length,
      metrics: {
        researchDepth: route.depth,
        intentCategory: 'security_guard',
        routingReason: 'Protected credentials and internal security configuration are never disclosed.',
        totalLatencyMs,
        ttftMs: totalLatencyMs,
        searchLatencyMs: 0,
        aiLatencyMs: 0,
        dbLatencyMs,
        cacheHit: false,
        providerUsed: '2mr-security-guard',
        modelUsed: 'policy-guard',
      },
      verificationSummary: {
        verifiedFacts: ['2MR protects confidential keys, credentials, and private admin records.'],
        reportedClaims: [],
        interpretations: [],
        uncertainPoints: [],
        disagreements: [],
        note: 'Verified privacy & security policy.',
      },
      data: secPayload,
    };
  }

  // Retrieve sources if not already supplied by caller (with route-tuned budget & cache)
  let retrievedSources = params.retrievedSources || [];
  let searchLatencyMs = 0;
  let searchCacheHit = false;
  if (brandClassification.isBrandQuery && brandBundle && !params.retrievedSources) {
    retrievedSources = buildBrandReferenceSources(
      brandBundle.brand,
      brandBundle.announcements
    ) as ProvenanceSource[];
  } else if (!params.retrievedSources) {
    const disc = await discoverVerifiedSourcesWithMetrics(
      params.query,
      route.includeAcademicApis ? 'academic' : 'all',
      undefined,
      {
        budgetMs: route.searchBudgetMs,
        includeAcademic: route.includeAcademicApis,
        maxResults: route.searchLimit,
        cacheTtlSeconds: settingsRow?.cacheTtlSearchSeconds ?? 600,
      }
    );
    retrievedSources = disc.sources;
    searchLatencyMs = disc.searchLatencyMs;
    searchCacheHit = disc.cacheHit;
  }

  const maxProviders = settingsRow?.maxProvidersPerDeepQuery || 3;
  const selectedProviders = route.useMultiProvider
    ? configured.slice(0, maxProviders)
    : configured.slice(0, 1);

  const sourceContext = retrievedSources
    .slice(0, route.depth === 'fast' ? 4 : 7)
    .map(
      (s, i) =>
        `[${i + 1}] Title: ${s.title}\nPublisher: ${s.publisher} (${s.publishedDate || 'n.d.'})\nType: ${s.sourceType} | Reliability: ${s.reliabilityTier}\nURL: ${s.url}\nExcerpt: ${s.snippet}`
    )
    .join('\n\n');

  const isAnalysisMode =
    params.mode === 'research_intelligence' ||
    params.mode === 'deep_research' ||
    params.mode === 'comparison';

  const historyBlock =
    params.conversationHistory && params.conversationHistory.length > 0
      ? `RECENT CONVERSATION CONTEXT:\n${params.conversationHistory
          .slice(-6)
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').slice(0, 400)}`)
          .join('\n')}\n`
      : '';

  const brandContextBlock = brandBundle
    ? `\n${buildBrandSystemContext(brandBundle.brand, brandBundle.announcements)}\n${
        brandClassification.subIntent
          ? `Detected 2MR Question Focus: ${brandClassification.subIntent.toUpperCase()} (Detected Question Language: ${brandClassification.detectedLang}). Respond directly in the user's question language.\n`
          : ''
      }`
    : '';

  const prompt = isAnalysisMode
    ? `You are 2MR Unified AI Intelligence (${params.mode.replace('_', ' ')}, ${route.depth.toUpperCase()} mode).${brandContextBlock}
Topic / Question: "${params.query}"
Language: ${params.language || 'English'}
Source Focus: ${params.sourceFocus || 'Peer-Reviewed, Institutional & Official Sources'}
Depth: ${route.depth}
${historyBlock}
RETRIEVED VERIFIED SOURCES:
${sourceContext || 'No matching sources retrieved from CrossRef, arXiv, OpenAlex, Wikipedia, or 2MR Index.'}

STRICT ACCURACY & CITATION RULES:
1. NEVER invent URLs, DOIs, authors, statistics, or quotations.
2. Distinguish Verified facts, Reported claims, Interpretations, and Uncertain points.
3. Agreement across models NEVER counts as factual verification without primary sources.
${route.depth === 'fast' ? '4. FAST MODE BREVITY: Keep each string field to 1-2 crisp sentences and arrays to 2-3 high-signal items for rapid delivery.' : ''}

Return ONLY valid JSON:
{
  "topic": "${params.query}",
  "consensusScore": number (0-100),
  "researchOverview": "string",
  "executiveSummary": "string",
  "keyFindings": ["string"],
  "importantFacts": [{ "fact": "string", "source": "string", "confidence": "Verified Primary" | "Reported Claim" | "Moderate" }],
  "detailedExplanation": "string",
  "differentPerspectives": [{ "viewpoint": "string", "proponents": "string", "summary": "string" }],
  "sourceComparison": {
    "agreements": [{ "point": "string", "supportingSources": ["string"], "evidenceSnippet": "string" }],
    "disagreements": [{ "point": "string", "perspectiveA": { "claim": "string", "source": "string" }, "perspectiveB": { "claim": "string", "source": "string" }, "analysis": "string" }]
  },
  "needsFurtherVerification": [{ "claim": "string", "reason": "string", "suggestedAction": "string" }],
  "researchLimitations": "string",
  "citations": { "apa": "string", "mla": "string", "chicago": "string", "bibtex": "string" },
  "relatedQuestions": ["string"]
}`
    : `You are 2MR Unified AI Intelligence (${route.depth.toUpperCase()} mode).${brandContextBlock}
Question: "${params.query}"
${historyBlock}${params.attachmentContext ? `User Context: "${params.attachmentContext.slice(0, 1800)}"` : ''}
Language: ${params.language || 'English'}

RETRIEVED SOURCES:
${sourceContext || 'No matching sources retrieved.'}

STRICT ACCURACY RULES:
1. Distinguish VERIFIED FACTS (supported by retrieved sources) from REPORTED CLAIMS, INTERPRETATIONS, and UNCERTAIN INFORMATION.
2. Be concise in FAST mode and thorough in BALANCED/DEEP modes. NEVER fabricate URLs, DOIs, or statistics.

Return ONLY valid JSON:
{
  "directAnswer": "1-3 crisp sentences",
  "detailedExplanation": "Structured markdown explanation",
  "simpleExplanation": "Plain language 1-2 sentence summary",
  "verifiedFacts": [{ "fact": "string", "source": "string", "confidence": "Verified Consensus" | "High" }],
  "reportedClaims": ["string"],
  "interpretations": ["string"],
  "uncertainInformation": [{ "claim": "string", "notes": "string", "uncertaintyReason": "string" }],
  "sources": [{ "title": "string", "url": "string", "publisher": "string", "date": "string" }],
  "relatedTopics": ["string"],
  "followUpQuestions": ["string"],
  "insufficientEvidence": boolean
}`;

  const aiStart = Date.now();
  const callResults: ProviderCallResult[] = [];

  if (route.useMultiProvider && selectedProviders.length > 1) {
    const settled = await Promise.all(
      selectedProviders.map((prov) =>
        callSingleProvider(prov, prompt, true, route.timeoutMs, route.thinkingLevel)
      )
    );
    callResults.push(...settled);
  } else if (configured.length > 0) {
    // Try primary healthy provider, fall back at most once if autoFallbackEnabled
    const maxAttempts = (settingsRow?.autoFallbackEnabled ?? true) ? Math.min(2, configured.length) : 1;
    for (let i = 0; i < maxAttempts; i++) {
      const res = await callSingleProvider(configured[i], prompt, true, route.timeoutMs, route.thinkingLevel);
      callResults.push(res);
      if (res.status === 'success' && res.parsedJson) break;
    }
  }
  const aiLatencyMs = Date.now() - aiStart;

  const successful = callResults.filter((r) => r.status === 'success' && r.parsedJson);
  const disagreements: string[] = [];
  if (successful.length > 1) {
    const summaries = successful.map((s) =>
      String(s.parsedJson?.directAnswer || s.parsedJson?.executiveSummary || '').trim()
    );
    const lengths = summaries.map((s) => s.length);
    if (Math.max(...lengths) - Math.min(...lengths) > 120) {
      disagreements.push('Models varied in emphasis or scope; inspect primary retrieved sources for authoritative detail.');
    }
    if (isAnalysisMode) {
      const scores = successful
        .map((s) => Number(s.parsedJson?.consensusScore))
        .filter((n) => !Number.isNaN(n));
      if (scores.length > 1 && Math.max(...scores) - Math.min(...scores) >= 15) {
        disagreements.push(
          `Confidence estimates differed across analytical passes (${Math.min(...scores)}% vs ${Math.max(...scores)}%).`
        );
      }
    }
  }

  const primary = successful[0]?.parsedJson || null;
  const externalUrls = retrievedSources.slice(0, 6).map((s) => s.url);
  const verificationSummary = buildVerificationSummary(retrievedSources, primary, disagreements);
  const totalLatencyMs = Date.now() - startedAt;
  const providerUsed = successful[0]?.providerSlug || callResults[0]?.providerSlug || 'retrieval_fallback';
  const modelUsed = successful[0]?.modelKey || callResults[0]?.modelKey || 'retrieval_digest';
  const ttftMs = successful[0]?.ttftMs || totalLatencyMs;

  const metrics: OrchestratorMetrics = {
    researchDepth: route.depth,
    intentCategory: route.intent,
    routingReason: route.routingReason,
    totalLatencyMs,
    ttftMs,
    searchLatencyMs,
    aiLatencyMs,
    dbLatencyMs,
    cacheHit: searchCacheHit,
    providerUsed,
    modelUsed,
  };

  enqueueTelemetryPersistence({
    requestId,
    userId: params.userId,
    mode: params.mode,
    researchDepth: route.depth,
    intentCategory: route.intent,
    routingReason: route.routingReason,
    query: params.query,
    providersSelected: selectedProviders.map((p) => p.slug),
    status: successful.length > 0 ? 'completed' : 'fallback',
    totalLatencyMs,
    ttftMs,
    searchLatencyMs,
    dbLatencyMs,
    aiLatencyMs,
    cacheHit: searchCacheHit,
    callResults,
    successful,
    externalUrls,
    disagreements,
  });

  const fallbackSources = retrievedSources.slice(0, 6).map((r) => ({
    title: r.title,
    url: r.url,
    publisher: r.publisher,
    date: r.publishedDate || 'Open Access',
  }));

  const finalData = !primary
    ? buildFallbackPayload({
        isAnalysisMode,
        query: params.query,
        retrievedSources,
        hasConfiguredProvider: configured.length > 0,
        providerFailureReason: callResults[0]?.errorMessage,
        brandContext: brandBundle
          ? {
              classification: brandClassification,
              brand: brandBundle.brand,
              announcements: brandBundle.announcements,
              language: params.language,
            }
          : null,
      })
    : {
        ...primary,
        retrievedSources: retrievedSources.slice(0, 8),
        sources: primary.sources?.length ? primary.sources : fallbackSources,
        insufficientEvidence: primary.insufficientEvidence ?? false,
      };

  const resultPayload = {
    requestId,
    mode: params.mode,
    researchDepth: route.depth,
    usedMultiModelCheck: successful.length > 1,
    modelsEvaluatedCount: successful.length,
    externalSourcesCheckedCount: retrievedSources.length,
    metrics,
    verificationSummary,
    data: finalData,
  };

  if (isCacheablePublicQuery && successful.length > 0) {
    const ttl = settingsRow?.cacheTtlMetadataSeconds ?? 1800;
    await setPublicCache('public_ai', publicCacheKey, resultPayload, ttl);
  }

  return resultPayload;
}

export async function orchestrateUnifiedAIStream(params: {
  userId?: string | null;
  mode: UnifiedAiMode;
  researchDepth?: ResearchDepth;
  query: string;
  conversationId?: string | null;
  conversationHistory?: { role: string; content: string }[];
  attachmentContext?: string;
  language?: string;
  compareMultipleModels?: boolean;
  signal?: AbortSignal;
  onEvent: (eventName: string, payload: any) => void;
}): Promise<{
  requestId: string;
  directAnswer: string;
  structuredAnswer: any;
  metrics: OrchestratorMetrics;
}> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const { providers: configuredRaw, settings: settingsRow, dbLatencyMs } = await getRuntimeAiConfig();
  const configured = orderHealthyProviders(configuredRaw);

  const route = buildRoutePlan({
    query: params.query,
    requestedDepth: params.researchDepth,
    mode: params.mode,
    attachmentContext: params.attachmentContext,
    compareModels: params.compareMultipleModels,
    settings: settingsRow,
  });

  // 1. Check public cache first if non-private
  const isCacheablePublicQuery = !params.conversationId && !params.attachmentContext?.trim();
  const publicCacheKey = `${params.mode}:${route.depth}:${params.language || 'English'}:default:${params.query}`;

  if (isCacheablePublicQuery) {
    const cached = await getPublicCache<any>('public_ai', publicCacheKey);
    if (cached && cached.data) {
      const answerText = cached.data.detailedExplanation || cached.data.directAnswer || '';
      params.onEvent('routing', {
        mode: params.mode,
        researchDepth: route.depth,
        intent: route.intent,
        provider: '2mr-cache',
        model: 'cached-synthesis',
        routingReason: `${route.routingReason} (Instant cache hit)`,
        cacheHit: true,
      });
      if (cached.data.retrievedSources?.length) {
        params.onEvent('sources', {
          sources: cached.data.retrievedSources,
          searchLatencyMs: 0,
          cacheHit: true,
        });
      }
      // Stream cached words smoothly in fast bursts for consistent UX
      const words = answerText.split(/(\s+)/);
      let acc = '';
      for (let i = 0; i < words.length; i += 6) {
        if (params.signal?.aborted) break;
        const piece = words.slice(i, i + 6).join('');
        acc += piece;
        params.onEvent('token', { delta: piece, accumulated: acc });
      }
      const totalLatencyMs = Date.now() - startedAt;
      const metrics: OrchestratorMetrics = {
        researchDepth: route.depth,
        intentCategory: route.intent,
        routingReason: `${route.routingReason} (Cache hit)`,
        totalLatencyMs,
        ttftMs: Math.min(totalLatencyMs, 25),
        searchLatencyMs: 0,
        aiLatencyMs: 0,
        dbLatencyMs,
        cacheHit: true,
        providerUsed: 'cache',
        modelUsed: 'cached-synthesis',
      };
      const structuredAnswer = {
        ...cached.data,
        verificationSummary: cached.verificationSummary,
        usedMultiModelCheck: cached.usedMultiModelCheck,
        modelsEvaluatedCount: cached.modelsEvaluatedCount,
        externalSourcesCheckedCount: cached.externalSourcesCheckedCount,
        metrics,
      };
      params.onEvent('structured', structuredAnswer);
      return {
        requestId,
        directAnswer: structuredAnswer.directAnswer || acc.slice(0, 240),
        structuredAnswer,
        metrics,
      };
    }
  }

  const historyHas2mrStream = Boolean(
    params.conversationHistory?.some((m) => /\b2mr\b|to master research|gihozo/i.test(m.content || ''))
  );
  const brandClassification = classifyBrandIdentityQuery(params.query, params.language);
  const needsBrandGrounding = brandClassification.isBrandQuery || historyHas2mrStream;
  const brandBundle = needsBrandGrounding ? await getOfficialBrandKnowledge() : null;

  // Guard security probes immediately in streaming endpoint too
  if (brandClassification.isSecurityProbe && brandBundle) {
    const secSources = buildBrandReferenceSources(brandBundle.brand, brandBundle.announcements) as ProvenanceSource[];
    const groundedSec = buildGroundedBrandFallback({
      query: params.query,
      classification: brandClassification,
      brand: brandBundle.brand,
      announcements: brandBundle.announcements,
      requestedLanguage: params.language,
    });
    params.onEvent('routing', {
      mode: params.mode,
      researchDepth: route.depth,
      intent: 'security_guard',
      provider: '2mr-security-guard',
      model: 'policy-guard',
      routingReason: 'Protected credentials and internal security details cannot be disclosed.',
      cacheHit: false,
    });
    params.onEvent('sources', { sources: secSources, searchLatencyMs: 0, cacheHit: false });
    params.onEvent('token', { delta: groundedSec.directAnswer, accumulated: groundedSec.directAnswer });
    const totalLatencyMs = Date.now() - startedAt;
    const metrics: OrchestratorMetrics = {
      researchDepth: route.depth,
      intentCategory: 'security_guard',
      routingReason: 'Security and privacy policy protection',
      totalLatencyMs,
      ttftMs: totalLatencyMs,
      searchLatencyMs: 0,
      aiLatencyMs: 0,
      dbLatencyMs,
      cacheHit: false,
      providerUsed: '2mr-security-guard',
      modelUsed: 'policy-guard',
    };
    const structuredAnswer = {
      requestId,
      directAnswer: groundedSec.directAnswer,
      detailedExplanation: groundedSec.detailedExplanation,
      verifiedFacts: [
        {
          fact: '2MR protects all credentials, API keys, and private admin records.',
          source: '2MR Official Security Policy',
          confidence: 'high',
        },
      ],
      uncertainInformation: [],
      sources: secSources.map((r) => ({
        title: r.title,
        url: r.url,
        publisher: r.publisher,
        date: r.publishedDate || 'Official Record',
      })),
      retrievedSources: secSources,
      followUpQuestions: ['Who created 2MR?', 'What is the purpose of 2MR?'],
      insufficientEvidence: false,
      usedMultiModelCheck: false,
      modelsEvaluatedCount: 0,
      externalSourcesCheckedCount: secSources.length,
      verificationSummary: {
        verifiedFacts: ['Security policy protection enforced.'],
        reportedClaims: [],
        interpretations: [],
        uncertainPoints: [],
        disagreements: [],
        note: 'Verified security protection.',
      },
      researchDepth: route.depth,
      metrics,
    };
    params.onEvent('structured', structuredAnswer);
    return {
      requestId,
      directAnswer: groundedSec.directAnswer,
      structuredAnswer,
      metrics,
    };
  }

  const chosenProvider = configured[0] || null;
  params.onEvent('routing', {
    mode: params.mode,
    researchDepth: route.depth,
    intent: route.intent,
    provider: chosenProvider?.slug || 'retrieval_fallback',
    model: chosenProvider?.modelKey || '2mr-index',
    routingReason: brandClassification.isBrandQuery
      ? `${route.routingReason} (Official 2MR Knowledge Base grounded)`
      : route.routingReason,
    cacheHit: false,
  });

  // 2. Start source discovery CONCURRENTLY (or return verified official 2MR sources directly on brand identity queries)
  const sourcePromise = brandClassification.isBrandQuery && brandBundle
    ? Promise.resolve({
        sources: buildBrandReferenceSources(brandBundle.brand, brandBundle.announcements) as ProvenanceSource[],
        searchLatencyMs: 1,
        cacheHit: false,
      }).then((res) => {
        if (!params.signal?.aborted) {
          params.onEvent('sources', {
            sources: res.sources.slice(0, 8),
            searchLatencyMs: res.searchLatencyMs,
            cacheHit: res.cacheHit,
          });
        }
        return res;
      })
    : discoverVerifiedSourcesWithMetrics(
        params.query,
        route.includeAcademicApis ? 'academic' : 'all',
        undefined,
        {
          budgetMs: route.searchBudgetMs,
          includeAcademic: route.includeAcademicApis,
          maxResults: route.searchLimit,
          cacheTtlSeconds: settingsRow?.cacheTtlSearchSeconds ?? 600,
        }
      ).then((res) => {
        if (!params.signal?.aborted) {
          params.onEvent('sources', {
            sources: res.sources.slice(0, 8),
            searchLatencyMs: res.searchLatencyMs,
            cacheHit: res.cacheHit,
          });
        }
        return res;
      });

  // Check if search cache already had an instant hit (<10ms) so we can inject sources into the streaming prompt immediately
  const quickSources = await Promise.race([
    sourcePromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), route.depth === 'fast' ? 350 : 900)),
  ]);

  const promptSourceContext = quickSources
    ? quickSources.sources
        .slice(0, 5)
        .map(
          (s, i) =>
            `[${i + 1}] ${s.title} — ${s.publisher} (${s.publishedDate || 'n.d.'}): ${s.snippet}`
        )
        .join('\n')
    : 'Live external retrieval running concurrently.';

  const streamHistoryBlock =
    params.conversationHistory && params.conversationHistory.length > 0
      ? `Recent Conversation History:\n${params.conversationHistory
          .slice(-6)
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content || '').slice(0, 400)}`)
          .join('\n')}\n\n`
      : '';

  const streamBrandContextBlock = brandBundle
    ? `\n${buildBrandSystemContext(brandBundle.brand, brandBundle.announcements)}\n${
        brandClassification.subIntent
          ? `Detected 2MR Question Focus: ${brandClassification.subIntent.toUpperCase()} (Question Language: ${brandClassification.detectedLang}). Respond fluently in the user's question language.\n`
          : ''
      }`
    : '';

  const streamPrompt = `You are 2MR – To Master Research (${route.depth.toUpperCase()} mode).${streamBrandContextBlock}
Answer the question clearly and accurately in ${brandClassification.detectedLang !== 'en' ? brandClassification.detectedLang.toUpperCase() + ' (matching the user question language)' : params.language || 'English'}.
${streamHistoryBlock}Question: "${params.query}"
${params.attachmentContext ? `Provided Excerpt:\n"${params.attachmentContext.slice(0, 1800)}"\n` : ''}
Context from 2MR Retrieval:
${promptSourceContext}

Guidelines:
- Lead with a crisp 1-2 sentence Direct Answer, then give structured key points and explanation.
- Separate confirmed facts from interpretations or uncertainties.
- NEVER fabricate URLs, DOIs, statistics, dates, or citations.
- Format cleanly in Markdown.`;

  const aiStart = Date.now();
  let accumulatedText = '';
  const callResults: ProviderCallResult[] = [];

  if (configured.length > 0) {
    const maxAttempts = (settingsRow?.autoFallbackEnabled ?? true) ? Math.min(2, configured.length) : 1;
    for (let i = 0; i < maxAttempts; i++) {
      if (params.signal?.aborted) break;
      const prov = configured[i];
      const streamRes = await streamSingleProvider(
        prov,
        streamPrompt,
        route.timeoutMs,
        route.thinkingLevel,
        (delta) => {
          accumulatedText += delta;
          params.onEvent('token', { delta, accumulated: accumulatedText });
        },
        params.signal
      );
      callResults.push(streamRes);
      if (streamRes.status === 'success' && streamRes.rawText.trim().length > 0) break;
    }
  }

  const aiLatencyMs = Date.now() - aiStart;
  const searchResult = quickSources || (await sourcePromise);
  const retrievedSources = searchResult.sources;

  // Optional parallel multi-model disagreement pass ONLY in Deep/Comparison modes when 2+ providers are available
  const disagreements: string[] = [];
  if (route.useMultiProvider && configured.length > 1 && !params.signal?.aborted) {
    const secondary = configured[1];
    const checkPrompt = `Review this question "${params.query}" against these sources:\n${retrievedSources
      .slice(0, 4)
      .map((s) => `- ${s.title} (${s.publisher}): ${s.snippet}`)
      .join('\n')}\nList any caveats, limitations, or disagreements in 2 short bullet points.`;
    const verifyRes = await callSingleProvider(secondary, checkPrompt, false, Math.min(route.timeoutMs, 10000), 'LOW');
    callResults.push(verifyRes);
    if (verifyRes.status === 'success' && verifyRes.rawText.trim()) {
      disagreements.push(verifyRes.rawText.trim().slice(0, 320));
    }
  }

  const successful = callResults.filter((r) => r.status === 'success' && r.rawText.trim().length > 0);
  const firstOk = successful[0];

  if (!accumulatedText.trim()) {
    // Honest fallback from retrieved sources (or Official Brand Knowledge Base for 2MR queries)
    const fallback = buildFallbackPayload({
      isAnalysisMode: false,
      query: params.query,
      retrievedSources,
      hasConfiguredProvider: configured.length > 0,
      providerFailureReason: callResults[0]?.errorMessage,
      brandContext: brandBundle
        ? {
            classification: brandClassification,
            brand: brandBundle.brand,
            announcements: brandBundle.announcements,
            language: params.language,
          }
        : null,
    });
    accumulatedText = fallback.detailedExplanation || fallback.directAnswer || '';
    params.onEvent('token', { delta: accumulatedText, accumulated: accumulatedText });
  }

  const firstParagraph = accumulatedText.split(/\n\n+/)[0]?.replace(/^#+\s*/, '').trim() || accumulatedText.slice(0, 260);
  const fallbackSources = retrievedSources.slice(0, 6).map((r) => ({
    title: r.title,
    url: r.url,
    publisher: r.publisher,
    date: r.publishedDate || 'Open Access',
  }));
  const verificationSummary = buildVerificationSummary(retrievedSources, null, disagreements);
  const totalLatencyMs = Date.now() - startedAt;
  const ttftMs = firstOk?.ttftMs || totalLatencyMs;

  const metrics: OrchestratorMetrics = {
    researchDepth: route.depth,
    intentCategory: route.intent,
    routingReason: route.routingReason,
    totalLatencyMs,
    ttftMs,
    searchLatencyMs: searchResult.searchLatencyMs,
    aiLatencyMs,
    dbLatencyMs,
    cacheHit: searchResult.cacheHit,
    providerUsed: firstOk?.providerSlug || callResults[0]?.providerSlug || 'retrieval_fallback',
    modelUsed: firstOk?.modelKey || callResults[0]?.modelKey || 'retrieval_digest',
  };

  const structuredAnswer = {
    requestId,
    directAnswer: firstParagraph,
    detailedExplanation: accumulatedText,
    verifiedFacts: retrievedSources
      .filter((s) => s.evidenceClassification === 'Verified Primary / Standard')
      .slice(0, 3)
      .map((s) => ({
        fact: s.snippet,
        source: s.publisher,
        confidence: s.reliabilityTier,
      })),
    uncertainInformation:
      disagreements.length > 0
        ? disagreements.map((d) => ({
            claim: 'Multi-model cross-check caveat',
            notes: d,
            uncertaintyReason: 'Cross-provider verification note',
          }))
        : retrievedSources.length === 0
          ? [
              {
                claim: `No matching external records retrieved for "${params.query}".`,
                notes: 'Verify key facts with primary references.',
                uncertaintyReason: 'Zero external matches',
              },
            ]
          : [],
    sources: fallbackSources,
    retrievedSources: retrievedSources.slice(0, 8),
    followUpQuestions: [
      `What peer-reviewed evidence exists on ${params.query}?`,
      `What are the practical limitations of ${params.query}?`,
    ],
    insufficientEvidence: retrievedSources.length === 0,
    usedMultiModelCheck: successful.length > 1,
    modelsEvaluatedCount: successful.length,
    externalSourcesCheckedCount: retrievedSources.length,
    verificationSummary,
    researchDepth: route.depth,
    metrics,
  };

  params.onEvent('structured', structuredAnswer);

  enqueueTelemetryPersistence({
    requestId,
    userId: params.userId,
    mode: params.mode,
    researchDepth: route.depth,
    intentCategory: route.intent,
    routingReason: route.routingReason,
    query: params.query,
    providersSelected: configured.slice(0, route.useMultiProvider ? 2 : 1).map((p) => p.slug),
    status: params.signal?.aborted ? 'cancelled' : successful.length > 0 ? 'completed' : 'fallback',
    totalLatencyMs,
    ttftMs,
    searchLatencyMs: searchResult.searchLatencyMs,
    dbLatencyMs,
    aiLatencyMs,
    cacheHit: searchResult.cacheHit,
    callResults,
    successful,
    externalUrls: retrievedSources.slice(0, 6).map((s) => s.url),
    disagreements,
  });

  if (isCacheablePublicQuery && successful.length > 0 && !params.signal?.aborted) {
    const ttl = settingsRow?.cacheTtlMetadataSeconds ?? 1800;
    await setPublicCache(
      'public_ai',
      publicCacheKey,
      {
        requestId,
        mode: params.mode,
        researchDepth: route.depth,
        usedMultiModelCheck: successful.length > 1,
        modelsEvaluatedCount: successful.length,
        externalSourcesCheckedCount: retrievedSources.length,
        verificationSummary,
        data: structuredAnswer,
      },
      ttl
    );
  }

  return {
    requestId,
    directAnswer: firstParagraph,
    structuredAnswer,
    metrics,
  };
}
