import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { AdminLayout } from './AdminLayout';

interface GeminiStatus {
  configured: boolean;
  configurationStatus: 'Configured' | 'Missing';
  connectionTestStatus: string;
  lastCheckedAt: string | null;
  lastSuccessfulTestAt: string | null;
  selectedModel: string;
  lastError: string | null;
  requestUsage: {
    totalCalls: number;
    calls24h: number;
    successCalls: number;
    failedCalls: number;
    inputTokens: number;
    outputTokens: number;
  };
  recentErrors: Array<{
    id: string;
    model: string;
    status: string;
    message: string;
    createdAt: string;
  }>;
  remediationNote: string | null;
}

export const AdminDashboardPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [geminiStatus, setGeminiStatus] = useState<GeminiStatus | null>(null);
  const [testingGemini, setTestingGemini] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const loadGeminiStatus = () => {
    apiFetch<GeminiStatus>('/api/admin/gemini/status')
      .then((res) => setGeminiStatus(res))
      .catch(() => {});
  };

  useEffect(() => {
    apiFetch('/api/admin/overview')
      .then((res) => setData(res))
      .catch(() => {});
    loadGeminiStatus();
  }, []);

  const handleTestGemini = async () => {
    setTestingGemini(true);
    setTestFeedback(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        message: string;
      }>('/api/admin/gemini/test', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setTestFeedback({ ok: Boolean(res.ok), message: res.message });
      loadGeminiStatus();
    } catch (err: any) {
      setTestFeedback({ ok: false, message: err?.message || 'Unable to run Gemini connection test.' });
    } finally {
      setTestingGemini(false);
    }
  };

  const s = data?.stats || {};

  return (
    <AdminLayout
      title="Platform Operations Overview"
      subtitle="Live metrics from PostgreSQL across users, searches, content, feedback, payments, and 2MR Ads."
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: s.totalUsers ?? 0, to: '/admin/users' },
          { label: 'Premium Subscribers', value: s.premiumUsers ?? 0, to: '/admin/payments' },
          { label: 'Total Searches Logged', value: s.totalSearches ?? 0, to: '/admin/content' },
          { label: 'New Feedback Tickets', value: s.newFeedback ?? 0, to: '/admin/feedback' },
          { label: 'Indexed Documents', value: s.totalDocs ?? 0, to: '/admin/content' },
          { label: 'Educational Videos', value: s.totalVideos ?? 0, to: '/admin/content' },
          { label: 'Active Ad Campaigns', value: s.activeAds ?? 0, to: '/admin/advertisements' },
          { label: 'Total Ad Impressions', value: s.totalImpressions ?? 0, to: '/admin/advertisements' },
        ].map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition space-y-1.5"
          >
            <span className="text-xs font-semibold text-[#8793A5]">{card.label}</span>
            <div className="text-3xl font-extrabold text-[#071426] dark:text-white tabular-nums">
              {Number(card.value).toLocaleString()}
            </div>
          </Link>
        ))}
      </div>

      {/* Gemini Integration Status Section */}
      <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
              <Sparkles className="w-3.5 h-3.5" /> Server-Side AI Engine
            </div>
            <h2 className="text-lg font-bold text-[#071426] dark:text-white">Gemini Integration Status</h2>
            <p className="text-xs text-[#8793A5]">
              Monitors server-side GEMINI_API_KEY configuration, model health, usage telemetry, and live connectivity.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTestGemini}
              disabled={testingGemini}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold hover:brightness-110 disabled:opacity-60"
            >
              {testingGemini ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {testingGemini ? 'Testing Connection...' : 'Test Gemini Connection'}
            </button>
            <Link
              to="/admin/ai-providers"
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
            >
              AI Providers
            </Link>
          </div>
        </div>

        {geminiStatus && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[#8793A5] block">API Configuration</span>
                <span
                  className={`font-bold text-sm ${
                    geminiStatus.configured
                      ? 'text-emerald-600 dark:text-[#B7F34A]'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {geminiStatus.configurationStatus}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[#8793A5] block">Connection Test Status</span>
                <span className="font-bold text-sm uppercase text-[#071426] dark:text-white">
                  {geminiStatus.connectionTestStatus}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[#8793A5] block">Selected Model</span>
                <span className="font-mono font-bold text-[#258BFF] dark:text-[#B7F34A]">
                  {geminiStatus.selectedModel}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[#8793A5] block">Last Successful Test</span>
                <span className="font-semibold text-[#071426] dark:text-white tabular-nums">
                  {geminiStatus.lastSuccessfulTestAt
                    ? new Date(geminiStatus.lastSuccessfulTestAt).toLocaleString()
                    : 'Not tested yet'}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[#8793A5] block">Request Usage (24h / Total)</span>
                <span className="font-bold text-sm text-[#071426] dark:text-white tabular-nums">
                  {geminiStatus.requestUsage.calls24h} / {geminiStatus.requestUsage.totalCalls}
                </span>
                <span className="block text-[11px] text-[#8793A5] tabular-nums">
                  {geminiStatus.requestUsage.successCalls} ok · {geminiStatus.requestUsage.failedCalls} err ·{' '}
                  {(geminiStatus.requestUsage.inputTokens + geminiStatus.requestUsage.outputTokens).toLocaleString()} tok
                </span>
              </div>
            </div>

            {testFeedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-start gap-2 ${
                  testFeedback.ok
                    ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-[#B7F34A]'
                    : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                }`}
              >
                {testFeedback.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{testFeedback.message}</span>
              </div>
            )}

            {geminiStatus.remediationNote && (
              <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{geminiStatus.remediationNote}</span>
              </div>
            )}

            {geminiStatus.recentErrors.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-[#071426] dark:text-white">Recent Sanitized API Errors</p>
                <div className="space-y-1.5">
                  {geminiStatus.recentErrors.map((err) => (
                    <div
                      key={err.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-rose-600 dark:text-rose-400 truncate">{err.message}</span>
                      <span className="text-[11px] text-[#8793A5] shrink-0 tabular-nums">
                        {err.model} · {new Date(err.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-[#071426] dark:text-white">Recent Payment Transactions</h2>
            <Link to="/admin/payments" className="text-xs text-[#258BFF] font-semibold hover:underline">
              Inspect All
            </Link>
          </div>
          {(data?.recentPayments || []).length === 0 ? (
            <p className="text-xs text-[#8793A5]">No transactions recorded yet.</p>
          ) : (
            data.recentPayments.map((p: any) => (
              <div key={p.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <div className="font-mono font-semibold">{p.transactionRef.slice(0, 14)}...</div>
                  <div className="text-[#8793A5]">{p.provider} · {p.phoneMasked || 'N/A'}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold tabular-nums">{Number(p.amount).toLocaleString()} {p.currency}</div>
                  <div className="uppercase text-[11px] text-[#258BFF]">{p.status}</div>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
          <h2 className="font-bold text-[#071426] dark:text-white">Recent Audit Trail</h2>
          {(data?.recentAudits || []).length === 0 ? (
            <p className="text-xs text-[#8793A5]">No audit events yet.</p>
          ) : (
            data.recentAudits.map((log: any) => (
              <div key={log.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-bold text-[#258BFF] dark:text-[#B7F34A]">{log.action}</span>
                  <div className="text-[#8793A5]">{log.actorEmail || 'Visitor'} · {log.resource}</div>
                </div>
                <span className="text-[11px] text-[#8793A5]">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </AdminLayout>
  );
};
