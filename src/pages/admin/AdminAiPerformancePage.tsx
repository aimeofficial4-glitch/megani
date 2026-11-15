import React, { useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  Database,
  RefreshCw,
  Save,
  Trash2,
  Zap,
  AlertTriangle,
  Clock,
  Layers,
} from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

interface PerformanceResponse {
  summary: {
    totalRequests: number;
    avgResponseTimeMs: number;
    avgTtftMs: number;
    p95ResponseTimeMs: number;
    avgSearchLatencyMs: number;
    avgAiLatencyMs: number;
    failedRequests: number;
    timeoutRequests: number;
    timeoutFrequencyPercent: number;
    requestCacheHitPercent: number;
    totalTokens: number;
    totalCostUsd: number;
    modeDistribution: { fast: number; balanced: number; deep: number };
  };
  dbLatencyMs: number;
  dbPoolStats: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  cacheStats: {
    backend: string;
    redisConfigured: boolean;
    hits: number;
    misses: number;
    hitRatePercent: number;
    entriesCount: number;
    byNamespace: Record<string, number>;
  };
  workerStats: {
    pending: number;
    active: number;
    completed: number;
    failed: number;
  };
  providerBreakdown: Record<
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
  >;
  recentRequests: Array<{
    id: string;
    mode: string;
    researchDepth: string;
    intentCategory: string;
    promptSummary: string;
    providersSelected: string[];
    status: string;
    latencyMs: number;
    ttftMs: number;
    searchLatencyMs: number;
    aiLatencyMs: number;
    cacheHit: boolean;
    routingReason: string;
    createdAt: string;
  }>;
  settings: {
    defaultResearchDepth: string;
    defaultFastModel: string;
    defaultResearchModel: string;
    fastTimeoutMs: number;
    balancedTimeoutMs: number;
    deepTimeoutMs: number;
    cacheTtlSearchSeconds: number;
    cacheTtlMetadataSeconds: number;
    cacheTtlDocumentSeconds: number;
    maxProvidersPerDeepQuery: number;
    multiModelVerificationEnabled: boolean;
    autoFallbackEnabled: boolean;
  } | null;
  providers: Array<{
    id: string;
    slug: string;
    name: string;
    isEnabled: boolean;
    isDefault: boolean;
    priority: number;
    rateLimitPerMin: number;
    healthStatus: string;
  }>;
}

export const AdminAiPerformancePage: React.FC = () => {
  const { addToast } = useApp();
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  const [form, setForm] = useState({
    defaultResearchDepth: 'fast',
    defaultFastModel: 'gemini-4-hydrogen',
    defaultResearchModel: 'gemini-4-hydrogen',
    fastTimeoutMs: 7000,
    balancedTimeoutMs: 12000,
    deepTimeoutMs: 22000,
    cacheTtlSearchSeconds: 600,
    cacheTtlMetadataSeconds: 1800,
    cacheTtlDocumentSeconds: 3600,
    maxProvidersPerDeepQuery: 3,
    multiModelVerificationEnabled: true,
    autoFallbackEnabled: true,
  });

  const [providerConfigs, setProviderConfigs] = useState<
    Array<{ slug: string; name: string; priority: number; rateLimitPerMin: number; isEnabled: boolean }>
  >([]);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<PerformanceResponse>('/api/admin/ai-performance');
      setData(res);
      if (res.settings) {
        setForm({
          defaultResearchDepth: res.settings.defaultResearchDepth || 'fast',
          defaultFastModel: res.settings.defaultFastModel || 'gemini-4-hydrogen',
          defaultResearchModel: res.settings.defaultResearchModel || 'gemini-4-hydrogen',
          fastTimeoutMs: res.settings.fastTimeoutMs || 7000,
          balancedTimeoutMs: res.settings.balancedTimeoutMs || 12000,
          deepTimeoutMs: res.settings.deepTimeoutMs || 22000,
          cacheTtlSearchSeconds: res.settings.cacheTtlSearchSeconds ?? 600,
          cacheTtlMetadataSeconds: res.settings.cacheTtlMetadataSeconds ?? 1800,
          cacheTtlDocumentSeconds: res.settings.cacheTtlDocumentSeconds ?? 3600,
          maxProvidersPerDeepQuery: res.settings.maxProvidersPerDeepQuery || 3,
          multiModelVerificationEnabled: res.settings.multiModelVerificationEnabled ?? true,
          autoFallbackEnabled: res.settings.autoFallbackEnabled ?? true,
        });
      }
      setProviderConfigs(
        (res.providers || []).map((p) => ({
          slug: p.slug,
          name: p.name,
          priority: p.priority,
          rateLimitPerMin: p.rateLimitPerMin,
          isEnabled: p.isEnabled,
        }))
      );
    } catch (err: any) {
      addToast(err.message || 'Unable to load performance metrics.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/admin/ai-performance/config', {
        method: 'PATCH',
        body: JSON.stringify({
          ...form,
          providers: providerConfigs.map((p) => ({
            slug: p.slug,
            priority: p.priority,
            rateLimitPerMin: p.rateLimitPerMin,
            isEnabled: p.isEnabled,
          })),
        }),
      });
      addToast('AI routing, timeouts, and cache configuration updated.', 'success');
      loadMetrics();
    } catch (err: any) {
      addToast(err.message || 'Failed to save configuration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async (namespace?: string) => {
    setClearingCache(true);
    try {
      const res = await apiFetch<{ clearedEntries: number }>('/api/admin/ai-performance/cache/clear', {
        method: 'POST',
        body: JSON.stringify(namespace ? { namespace } : {}),
      });
      addToast(`Cleared ${res.clearedEntries} public cache entries.`, 'success');
      loadMetrics();
    } catch (err: any) {
      addToast(err.message || 'Failed to clear cache.', 'error');
    } finally {
      setClearingCache(false);
    }
  };

  const s = data?.summary;
  const totalModeReqs = Math.max(
    1,
    (s?.modeDistribution.fast || 0) + (s?.modeDistribution.balanced || 0) + (s?.modeDistribution.deep || 0)
  );

  return (
    <AdminLayout
      title="AI Performance & Routing"
      subtitle="Monitor live response latency, TTFT streaming speed, cache hit ratios, provider health, and configure routing timeouts."
    >
      <div className="space-y-6">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#8793A5] tabular-nums">
            Live Telemetry Window: {s?.totalRequests || 0} recent AI requests · DB Ping:{' '}
            <strong className="text-[#071426] dark:text-white">{data?.dbLatencyMs ?? '--'} ms</strong>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleClearCache()}
              disabled={clearingCache}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-amber-500 text-slate-700 dark:text-slate-200 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Flush Public Cache
            </button>
            <button
              type="button"
              onClick={loadMetrics}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#258BFF] text-white text-xs font-semibold hover:brightness-110 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {/* 6 Core Telemetry KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#8793A5]">
              <span>Avg Response Latency</span>
              <Clock className="w-4 h-4 text-[#258BFF]" />
            </div>
            <div className="text-2xl font-extrabold text-[#071426] dark:text-white tabular-nums">
              {s ? `${s.avgResponseTimeMs.toLocaleString()} ms` : '--'}
            </div>
            <div className="text-xs text-[#8793A5] tabular-nums">
              P95: {s ? `${s.p95ResponseTimeMs.toLocaleString()} ms` : '--'}
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#8793A5]">
              <span>Time To First Token (TTFT)</span>
              <Zap className="w-4 h-4 text-[#B7F34A]" />
            </div>
            <div className="text-2xl font-extrabold text-[#071426] dark:text-white tabular-nums">
              {s ? `${s.avgTtftMs.toLocaleString()} ms` : '--'}
            </div>
            <div className="text-xs text-[#8793A5] tabular-nums">
              Search: {s?.avgSearchLatencyMs || 0} ms · AI: {s?.avgAiLatencyMs || 0} ms
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#8793A5]">
              <span>Public Cache Hit Rate</span>
              <Layers className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-extrabold text-[#071426] dark:text-white tabular-nums">
              {data ? `${data.cacheStats.hitRatePercent}%` : '--'}
            </div>
            <div className="text-xs text-[#8793A5] tabular-nums">
              {data?.cacheStats.hits || 0} hits / {data?.cacheStats.misses || 0} misses ·{' '}
              {data?.cacheStats.entriesCount || 0} keys ({data?.cacheStats.backend || 'memory_lru'})
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#8793A5]">
              <span>Failures &amp; Timeouts</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-extrabold text-[#071426] dark:text-white tabular-nums">
              {s ? `${s.timeoutFrequencyPercent}% timeouts` : '--'}
            </div>
            <div className="text-xs text-[#8793A5] tabular-nums">
              Failed/Fallback reqs: {s?.failedRequests || 0} · Provider timeouts: {s?.timeoutRequests || 0}
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#8793A5]">
              <span>Token Volume &amp; API Cost</span>
              <Activity className="w-4 h-4 text-[#258BFF]" />
            </div>
            <div className="text-2xl font-extrabold text-[#071426] dark:text-white tabular-nums">
              ${s ? s.totalCostUsd.toFixed(4) : '0.0000'}
            </div>
            <div className="text-xs text-[#8793A5] tabular-nums">
              {(s?.totalTokens || 0).toLocaleString()} total tokens processed
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#8793A5]">
              <span>DB Pool &amp; Background Workers</span>
              <Database className="w-4 h-4 text-[#258BFF]" />
            </div>
            <div className="text-2xl font-extrabold text-[#071426] dark:text-white tabular-nums">
              {data ? `${data.dbPoolStats.idleCount}/${data.dbPoolStats.totalCount} idle` : '--'}
            </div>
            <div className="text-xs text-[#8793A5] tabular-nums">
              Queue: {data?.workerStats.active || 0} active · {data?.workerStats.pending || 0} pending ·{' '}
              {data?.workerStats.completed || 0} done
            </div>
          </div>
        </div>

        {/* Mode Distribution + Provider Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
            <h2 className="font-bold text-sm text-[#071426] dark:text-white">Research Mode Usage Breakdown</h2>
            {[
              { key: 'fast', label: 'Fast Mode (Default)', count: s?.modeDistribution.fast || 0, bar: 'bg-[#B7F34A]' },
              { key: 'balanced', label: 'Balanced Mode', count: s?.modeDistribution.balanced || 0, bar: 'bg-[#258BFF]' },
              { key: 'deep', label: 'Deep Research Mode', count: s?.modeDistribution.deep || 0, bar: 'bg-amber-500' },
            ].map((item) => {
              const pct = Math.round((item.count / totalModeReqs) * 100);
              return (
                <div key={item.key} className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between tabular-nums">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
                    <span className="text-[#8793A5]">
                      {item.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-[#071426] overflow-hidden">
                    <div className={`h-full rounded-full ${item.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-[#8793A5] pt-2">
              Fast mode restricts external calls to low-latency budgets and invokes a single model unless cross-checking is required.
            </p>
          </div>

          <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
            <h2 className="font-bold text-sm text-[#071426] dark:text-white">Provider Latency &amp; Reliability</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[#8793A5] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3">Calls</th>
                    <th className="py-2 pr-3">Avg Latency</th>
                    <th className="py-2 pr-3">Timeouts / Fail</th>
                    <th className="py-2 pr-3">Tokens</th>
                    <th className="py-2">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                  {Object.keys(data?.providerBreakdown || {}).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[#8793A5]">
                        No provider calls recorded in current window.
                      </td>
                    </tr>
                  ) : (
                    Object.entries(data?.providerBreakdown || {}).map(([slug, p]) => (
                      <tr key={slug}>
                        <td className="py-2.5 pr-3 font-mono font-semibold text-[#258BFF] dark:text-[#B7F34A]">
                          {slug}
                        </td>
                        <td className="py-2.5 pr-3">{p.calls}</td>
                        <td className="py-2.5 pr-3">{p.avgLatencyMs} ms</td>
                        <td className="py-2.5 pr-3">
                          {p.timeouts} / {p.failures}
                        </td>
                        <td className="py-2.5 pr-3">{(p.inputTokens + p.outputTokens).toLocaleString()}</td>
                        <td className="py-2.5">${p.costUsd.toFixed(4)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Admin Performance & Routing Configuration Form */}
        <form
          onSubmit={handleSaveConfig}
          className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#258BFF] dark:text-[#B7F34A]" />
              <h2 className="font-bold text-sm text-[#071426] dark:text-white">
                Routing, Timeouts &amp; Cache Policy Configuration
              </h2>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold hover:brightness-95 disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Default Research Mode
              </label>
              <select
                value={form.defaultResearchDepth}
                onChange={(e) => setForm({ ...form, defaultResearchDepth: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426]"
              >
                <option value="fast">Fast Mode (Recommended Default)</option>
                <option value="balanced">Balanced Mode</option>
                <option value="deep">Deep Research Mode</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Default Fast Model (Gemini)
              </label>
              <input
                type="text"
                value={form.defaultFastModel}
                onChange={(e) => setForm({ ...form, defaultFastModel: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Default Deep Research Model
              </label>
              <input
                type="text"
                value={form.defaultResearchModel}
                onChange={(e) => setForm({ ...form, defaultResearchModel: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Fast Mode Timeout (ms)
              </label>
              <input
                type="number"
                min={2500}
                max={30000}
                value={form.fastTimeoutMs}
                onChange={(e) => setForm({ ...form, fastTimeoutMs: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Balanced Mode Timeout (ms)
              </label>
              <input
                type="number"
                min={4000}
                max={45000}
                value={form.balancedTimeoutMs}
                onChange={(e) => setForm({ ...form, balancedTimeoutMs: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Deep Research Timeout (ms)
              </label>
              <input
                type="number"
                min={6000}
                max={60000}
                value={form.deepTimeoutMs}
                onChange={(e) => setForm({ ...form, deepTimeoutMs: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] tabular-nums"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Public Search Cache TTL (sec)
              </label>
              <input
                type="number"
                min={0}
                max={86400}
                value={form.cacheTtlSearchSeconds}
                onChange={(e) => setForm({ ...form, cacheTtlSearchSeconds: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Public Metadata / Overview TTL (sec)
              </label>
              <input
                type="number"
                min={0}
                max={86400}
                value={form.cacheTtlMetadataSeconds}
                onChange={(e) => setForm({ ...form, cacheTtlMetadataSeconds: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Max Providers (Deep Mode)
              </label>
              <input
                type="number"
                min={1}
                max={4}
                value={form.maxProvidersPerDeepQuery}
                onChange={(e) => setForm({ ...form, maxProvidersPerDeepQuery: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 text-xs pt-1">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.multiModelVerificationEnabled}
                onChange={(e) => setForm({ ...form, multiModelVerificationEnabled: e.target.checked })}
              />
              <span>Allow Multi-Model Verification in Comparison / Deep Mode</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoFallbackEnabled}
                onChange={(e) => setForm({ ...form, autoFallbackEnabled: e.target.checked })}
              />
              <span>Single Clean Provider Fallback on Error/Timeout</span>
            </label>
          </div>

          {/* Provider Priority & Rate Limits */}
          {providerConfigs.length > 0 && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8793A5]">
                Provider Priority &amp; Rate Limits
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {providerConfigs.map((prov, idx) => (
                  <div
                    key={prov.slug}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <label className="inline-flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={prov.isEnabled}
                        onChange={(e) => {
                          const next = [...providerConfigs];
                          next[idx] = { ...prov, isEnabled: e.target.checked };
                          setProviderConfigs(next);
                        }}
                      />
                      <span>{prov.name}</span>
                    </label>
                    <div className="flex items-center gap-2 tabular-nums">
                      <label className="text-[11px] text-[#8793A5]">
                        Pri:
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={prov.priority}
                          onChange={(e) => {
                            const next = [...providerConfigs];
                            next[idx] = { ...prov, priority: Number(e.target.value) };
                            setProviderConfigs(next);
                          }}
                          className="ml-1 w-12 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D]"
                        />
                      </label>
                      <label className="text-[11px] text-[#8793A5]">
                        RPM:
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={prov.rateLimitPerMin}
                          onChange={(e) => {
                            const next = [...providerConfigs];
                            next[idx] = { ...prov, rateLimitPerMin: Number(e.target.value) };
                            setProviderConfigs(next);
                          }}
                          className="ml-1 w-16 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D]"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Recent AI Request Latency Trace */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
          <h2 className="font-bold text-sm text-[#071426] dark:text-white">Recent Request Routing &amp; Latency Trace</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[#8793A5] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-3">Query Summary</th>
                  <th className="py-2 pr-3">Mode / Intent</th>
                  <th className="py-2 pr-3">TTFT</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Search</th>
                  <th className="py-2 pr-3">Cache</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {(data?.recentRequests || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-[#8793A5]">
                      No routed AI requests recorded yet.
                    </td>
                  </tr>
                ) : (
                  (data?.recentRequests || []).map((reqItem) => (
                    <tr key={reqItem.id}>
                      <td className="py-2.5 pr-3 max-w-xs truncate font-medium">{reqItem.promptSummary}</td>
                      <td className="py-2.5 pr-3 font-mono text-[11px]">
                        {reqItem.researchDepth} · {reqItem.intentCategory}
                      </td>
                      <td className="py-2.5 pr-3">{reqItem.ttftMs || reqItem.latencyMs} ms</td>
                      <td className="py-2.5 pr-3 font-semibold">{reqItem.latencyMs} ms</td>
                      <td className="py-2.5 pr-3">{reqItem.searchLatencyMs} ms</td>
                      <td className="py-2.5 pr-3">{reqItem.cacheHit ? 'HIT' : 'MISS'}</td>
                      <td
                        className={`py-2.5 font-semibold ${
                          reqItem.status === 'completed'
                            ? 'text-emerald-600 dark:text-[#B7F34A]'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {reqItem.status}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
