import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Cookie, RefreshCw, Loader2, CheckCircle2, XCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

interface AdminConsentAnalytics {
  activePolicyVersion: string;
  summary: {
    totalConsents: number;
    acceptAllCount: number;
    rejectOptionalCount: number;
    customizedCount: number;
    withdrawnCount: number;
    analyticsAccepted: number;
    personalizationAccepted: number;
    advertisingAccepted: number;
    consentChangesTotal: number;
    totalConsentEvents: number;
    initialConsentEvents: number;
    updatedConsentEvents: number;
    withdrawnEvents: number;
    pendingDeletionRequests: number;
  };
  policyVersions: Array<{
    policyVersion: string;
    count: number;
    acceptAll: number;
    rejectOptional: number;
    customized: number;
    withdrawn: number;
  }>;
  recentConsents: Array<{
    id: string;
    visitorType: string;
    policyVersion: string;
    consentAction: string;
    necessary: boolean;
    analytics: boolean;
    personalization: boolean;
    advertising: boolean;
    consentedAt: string;
    updatedAt: string;
  }>;
  recentEvents: Array<{
    id: string;
    consentId: string;
    eventType: string;
    consentAction: string;
    policyVersion: string;
    analytics: boolean;
    personalization: boolean;
    advertising: boolean;
    createdAt: string;
  }>;
}

export const AdminPrivacyConsentPage: React.FC = () => {
  const { addToast } = useApp();
  const [data, setData] = useState<AdminConsentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<AdminConsentAnalytics>('/api/admin/privacy/consents');
      setData(res);
    } catch (err: any) {
      addToast(err.message || 'Failed to load consent governance analytics.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

  return (
    <AdminLayout
      title="Cookie Consent & Privacy Governance"
      subtitle="Monitor platform-wide consent decisions, policy versions, and anonymized audit trails without exposing private user identities."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#258BFF]/10 text-[#258BFF] dark:text-[#B7F34A] text-xs font-bold">
          <ShieldCheck className="w-4 h-4" /> Active Privacy Policy Version: {data?.activePolicyVersion || '2026.1'}
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs font-semibold hover:border-[#258BFF]"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh Governance Metrics
        </button>
      </div>

      {loading && !data ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-[#258BFF]" />
        </div>
      ) : (
        data && (
          <div className="space-y-6">
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Consents', value: data.summary.totalConsents, tone: 'text-[#071426] dark:text-white' },
                { label: 'Accept All', value: data.summary.acceptAllCount, tone: 'text-emerald-600 dark:text-[#B7F34A]' },
                { label: 'Reject Optional', value: data.summary.rejectOptionalCount, tone: 'text-slate-600 dark:text-slate-300' },
                { label: 'Customized', value: data.summary.customizedCount, tone: 'text-[#258BFF]' },
                { label: 'Consent Changes', value: data.summary.consentChangesTotal, tone: 'text-amber-600 dark:text-amber-400' },
                { label: 'Deletion Requests', value: data.summary.pendingDeletionRequests, tone: 'text-rose-600 dark:text-rose-400' },
              ].map((card) => (
                <div
                  key={card.label}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1"
                >
                  <p className="text-[11px] font-semibold text-[#8793A5]">{card.label}</p>
                  <p className={`text-2xl font-extrabold tabular-nums ${card.tone}`}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* Category Opt-In Rates & Policy Versions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
                <h2 className="text-sm font-bold text-[#071426] dark:text-white flex items-center gap-2">
                  <Cookie className="w-4 h-4 text-[#258BFF]" /> Optional Category Acceptance Rates
                </h2>
                <div className="space-y-3 text-xs">
                  {[
                    { label: 'Analytics Cookies', count: data.summary.analyticsAccepted },
                    { label: 'Personalization Cookies', count: data.summary.personalizationAccepted },
                    { label: 'Advertising Cookies', count: data.summary.advertisingAccepted },
                  ].map((row) => {
                    const rate = pct(row.count, data.summary.totalConsents);
                    return (
                      <div key={row.label} className="space-y-1">
                        <div className="flex justify-between font-semibold">
                          <span>{row.label}</span>
                          <span className="tabular-nums text-[#8793A5]">
                            {row.count} / {data.summary.totalConsents} ({rate}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-[#071426] overflow-hidden">
                          <div className="h-full bg-[#258BFF] dark:bg-[#B7F34A]" style={{ width: `${rate}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-[#8793A5] flex flex-wrap gap-4">
                  <span>Initial Consents: {data.summary.initialConsentEvents}</span>
                  <span>Preference Updates: {data.summary.updatedConsentEvents}</span>
                  <span>Withdrawals: {data.summary.withdrawnEvents}</span>
                </div>
              </section>

              <section className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
                <h2 className="text-sm font-bold text-[#071426] dark:text-white">Consent Policy Versions</h2>
                {data.policyVersions.length === 0 ? (
                  <p className="text-xs text-[#8793A5]">No consent records logged yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[#8793A5]">
                          <th className="py-2 pr-3">Version</th>
                          <th className="py-2 pr-3">Total</th>
                          <th className="py-2 pr-3">Accept All</th>
                          <th className="py-2 pr-3">Reject Opt.</th>
                          <th className="py-2 pr-3">Custom</th>
                          <th className="py-2">Withdrawn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.policyVersions.map((pv) => (
                          <tr key={pv.policyVersion} className="border-b border-slate-100 dark:border-slate-800/60">
                            <td className="py-2.5 pr-3 font-mono font-bold text-[#258BFF] dark:text-[#B7F34A]">
                              {pv.policyVersion}
                            </td>
                            <td className="py-2.5 pr-3 tabular-nums font-semibold">{pv.count}</td>
                            <td className="py-2.5 pr-3 tabular-nums">{pv.acceptAll}</td>
                            <td className="py-2.5 pr-3 tabular-nums">{pv.rejectOptional}</td>
                            <td className="py-2.5 pr-3 tabular-nums">{pv.customized}</td>
                            <td className="py-2.5 tabular-nums">{pv.withdrawn}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            {/* Privacy Safeguard Note */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071426] flex items-center gap-3 text-xs text-[#8793A5]">
              <AlertTriangle className="w-4 h-4 text-[#258BFF] shrink-0" />
              <span>
                PII Protection Active: Consent records shown below omit emails, names, IP addresses, and personal identifiers while preserving verifiable Consent IDs, timestamps, and policy versions.
              </span>
            </div>

            {/* Anonymized Recent Consent Records */}
            <section className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
              <h2 className="text-sm font-bold text-[#071426] dark:text-white">Recent Consent Records (Anonymized)</h2>
              {data.recentConsents.length === 0 ? (
                <p className="text-xs text-[#8793A5]">No consent choices recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[#8793A5]">
                        <th className="py-2 pr-3">Consent ID</th>
                        <th className="py-2 pr-3">Actor Type</th>
                        <th className="py-2 pr-3">Choice</th>
                        <th className="py-2 pr-3">Analytics</th>
                        <th className="py-2 pr-3">Personalization</th>
                        <th className="py-2 pr-3">Advertising</th>
                        <th className="py-2 pr-3">Policy</th>
                        <th className="py-2">Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentConsents.map((rec) => (
                        <tr key={rec.id} className="border-b border-slate-100 dark:border-slate-800/60">
                          <td className="py-2.5 pr-3 font-mono text-[11px]">{rec.id.slice(0, 8)}...</td>
                          <td className="py-2.5 pr-3">{rec.visitorType}</td>
                          <td className="py-2.5 pr-3">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#071426] font-semibold uppercase text-[10px]">
                              {rec.consentAction.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3">
                            {rec.analytics ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-slate-400" />
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            {rec.personalization ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-slate-400" />
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            {rec.advertising ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-slate-400" />
                            )}
                          </td>
                          <td className="py-2.5 pr-3 font-mono">{rec.policyVersion}</td>
                          <td className="py-2.5 tabular-nums text-[#8793A5]">
                            {new Date(rec.updatedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Recent Consent Change Events */}
            <section className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
              <h2 className="text-sm font-bold text-[#071426] dark:text-white flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-[#258BFF]" /> Recent Consent Change Log
              </h2>
              {data.recentEvents.length === 0 ? (
                <p className="text-xs text-[#8793A5]">No consent events logged yet.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {data.recentEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-[#258BFF]">{ev.consentId.slice(0, 8)}</span>
                        <span className="font-bold uppercase text-[11px]">{ev.eventType.replace('_', ' ')}</span>
                        <span className="text-[#8793A5]">
                          ({ev.consentAction.replace('_', ' ')}) · v{ev.policyVersion}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#8793A5] tabular-nums">
                        {new Date(ev.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )
      )}
    </AdminLayout>
  );
};
