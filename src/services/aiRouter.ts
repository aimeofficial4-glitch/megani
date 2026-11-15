export type ResearchDepth = 'fast' | 'balanced' | 'deep';
export type QueryIntent =
  | 'simple_qa'
  | 'general_explanation'
  | 'academic_research'
  | 'complex_research'
  | 'fact_check'
  | 'long_document';

export interface ProviderHealthState {
  consecutiveFailures: number;
  cooldownUntil: number;
  lastError: string | null;
  avgLatencyMs: number;
  samples: number;
}

const providerCircuit = new Map<string, ProviderHealthState>();

export function recordProviderOutcome(
  slug: string,
  success: boolean,
  latencyMs: number,
  errorMessage?: string
): void {
  const current = providerCircuit.get(slug) || {
    consecutiveFailures: 0,
    cooldownUntil: 0,
    lastError: null,
    avgLatencyMs: 0,
    samples: 0,
  };

  if (success) {
    const samples = Math.min(current.samples + 1, 50);
    const avgLatencyMs =
      current.samples === 0
        ? latencyMs
        : Math.round((current.avgLatencyMs * (samples - 1) + latencyMs) / samples);
    providerCircuit.set(slug, {
      consecutiveFailures: 0,
      cooldownUntil: 0,
      lastError: null,
      avgLatencyMs,
      samples,
    });
  } else {
    const failures = current.consecutiveFailures + 1;
    providerCircuit.set(slug, {
      consecutiveFailures: failures,
      // Cool down for 45 seconds after 2+ consecutive failures so requests don't stall on dead endpoints
      cooldownUntil: failures >= 2 ? Date.now() + 45_000 : current.cooldownUntil,
      lastError: errorMessage || 'Provider error',
      avgLatencyMs: current.avgLatencyMs,
      samples: current.samples,
    });
  }
}

export function isProviderHealthy(slug: string): boolean {
  const st = providerCircuit.get(slug);
  if (!st) return true;
  if (st.cooldownUntil > Date.now()) return false;
  return true;
}

export function classifyQueryIntent(query: string, attachmentContext?: string, mode?: string): QueryIntent {
  const q = (query || '').toLowerCase();
  if (attachmentContext && attachmentContext.trim().length > 1200) {
    return 'long_document';
  }
  if (
    mode === 'comparison' ||
    /\b(fact[- ]?check|verify|true or false|myth|evidence for|dispute|controversy|debunk)\b/i.test(q)
  ) {
    return 'fact_check';
  }
  if (
    /\b(peer[- ]?reviewed|doi|arxiv|meta-analysis|systematic review|literature|clinical trial|citation|study|journal|paper)\b/i.test(
      q
    )
  ) {
    return 'academic_research';
  }
  if (
    mode === 'deep_research' ||
    /\b(compare|contrast|trade-?offs|architecture|comprehensive|in-depth|analyze|implications)\b/i.test(q) ||
    q.split(/\s+/).length > 22
  ) {
    return 'complex_research';
  }
  if (/\b(explain|how does|why does|overview|mechanism|difference between)\b/i.test(q) || q.split(/\s+/).length > 9) {
    return 'general_explanation';
  }
  return 'simple_qa';
}

export interface RoutePlan {
  depth: ResearchDepth;
  intent: QueryIntent;
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  searchBudgetMs: number;
  searchLimit: number;
  includeAcademicApis: boolean;
  useMultiProvider: boolean;
  timeoutMs: number;
  routingReason: string;
}

export function buildRoutePlan(params: {
  query: string;
  requestedDepth?: string;
  mode: string;
  attachmentContext?: string;
  compareModels?: boolean;
  settings?: {
    defaultResearchDepth?: string | null;
    multiModelVerificationEnabled?: boolean;
    fastTimeoutMs?: number | null;
    balancedTimeoutMs?: number | null;
    deepTimeoutMs?: number | null;
    timeoutMs?: number | null;
  } | null;
}): RoutePlan {
  const intent = classifyQueryIntent(params.query, params.attachmentContext, params.mode);

  // Normalize depth: explicit requestedDepth always takes priority over mode defaults
  let depth: ResearchDepth = 'fast';
  const reqDepth = (params.requestedDepth || '').toLowerCase().trim();
  if (reqDepth === 'deep' || reqDepth === 'deep_research') {
    depth = 'deep';
  } else if (reqDepth === 'balanced') {
    depth = 'balanced';
  } else if (reqDepth === 'fast') {
    depth = 'fast';
  } else if (params.mode === 'deep_research') {
    depth = 'deep';
  } else if (params.mode === 'research_intelligence' || params.mode === 'comparison') {
    depth = 'balanced';
  } else if (params.settings?.defaultResearchDepth === 'balanced') {
    depth = 'balanced';
  } else if (params.settings?.defaultResearchDepth === 'deep') {
    depth = 'deep';
  }

  // Escalate if user explicitly enabled model comparison
  const multiModelAllowed = params.settings?.multiModelVerificationEnabled ?? true;
  const useMultiProvider =
    multiModelAllowed &&
    (depth === 'deep' ||
      params.mode === 'comparison' ||
      (Boolean(params.compareModels) && (intent === 'fact_check' || intent === 'complex_research')));

  if (depth === 'fast') {
    return {
      depth,
      intent,
      thinkingLevel: 'LOW',
      searchBudgetMs: intent === 'academic_research' ? 2400 : 1800,
      searchLimit: 4,
      includeAcademicApis: intent === 'academic_research' || intent === 'fact_check',
      useMultiProvider: false,
      timeoutMs: Math.max(params.settings?.fastTimeoutMs || 10000, 10000),
      routingReason:
        intent === 'simple_qa'
          ? 'Fast Mode: single low-latency model with targeted retrieval.'
          : intent === 'long_document'
          ? 'Fast Mode: single-pass optimized document synthesis.'
          : 'Fast Mode: single fast model + bounded external source lookup.',
    };
  }

  if (depth === 'balanced') {
    return {
      depth,
      intent,
      thinkingLevel: 'MEDIUM',
      searchBudgetMs: 3200,
      searchLimit: 6,
      includeAcademicApis: true,
      useMultiProvider,
      timeoutMs: Math.max(params.settings?.balancedTimeoutMs || 18000, 18000),
      routingReason: useMultiProvider
        ? 'Balanced Mode + Comparison: parallel source retrieval and cross-model verification.'
        : 'Balanced Mode: parallel multi-source grounding with balanced reasoning depth.',
    };
  }

  return {
    depth: 'deep',
    intent,
    thinkingLevel: 'HIGH',
    searchBudgetMs: 4500,
    searchLimit: 8,
    includeAcademicApis: true,
    useMultiProvider,
    timeoutMs: params.settings?.deepTimeoutMs || Math.max(params.settings?.timeoutMs || 18000, 18000),
    routingReason: useMultiProvider
      ? 'Deep Research Mode: concurrent academic retrieval + multi-model verification & disagreement analysis.'
      : 'Deep Research Mode: extended academic retrieval + deep structured synthesis.',
  };
}
