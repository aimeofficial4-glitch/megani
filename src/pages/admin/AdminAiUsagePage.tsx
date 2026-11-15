import React, { useEffect, useState } from 'react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';

export const AdminAiUsagePage: React.FC = () => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiFetch('/api/admin/ai-usage')
      .then(setData)
      .catch(() => {});
  }, []);

  const statsEntries = Object.entries(data?.providerStats || {}) as Array<[string, any]>;

  return (
    <AdminLayout
      title="AI Usage & Cost Telemetry"
      subtitle="Monitor provider call volume, token consumption, estimated USD cost, verification records, and failure logs."
    >
      <div className="space-y-6">
        {/* Provider Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsEntries.length === 0 ? (
            <div className="col-span-full p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center text-xs text-[#8793A5]">
              No AI provider requests recorded yet. Run a query in 2MR Ask or Research Intelligence.
            </div>
          ) : (
            statsEntries.map(([slug, st]) => (
              <div
                key={slug}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2"
              >
                <div className="text-xs font-bold uppercase text-[#258BFF] dark:text-[#B7F34A]">{slug}</div>
                <div className="text-2xl font-extrabold text-[#071426] dark:text-white tabular-nums">
                  {st.calls} calls
                </div>
                <div className="text-xs text-[#8793A5] tabular-nums space-y-0.5">
                  <div>Tokens: {(st.inputTokens + st.outputTokens).toLocaleString()}</div>
                  <div>Failures: {st.failures}</div>
                  <div>Est. Cost: ${Number(st.costUsd || 0).toFixed(4)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cross-Verification Log */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
          <h2 className="font-bold text-sm text-[#071426] dark:text-white">Recent Multi-Source Verification Logs</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[#8793A5] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-3">Topic</th>
                  <th className="py-2 pr-3">Models</th>
                  <th className="py-2 pr-3">External URLs</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.verifications || []).map((v: any) => (
                  <tr key={v.id}>
                    <td className="py-2.5 pr-3 font-medium max-w-xs truncate">{v.topic}</td>
                    <td className="py-2.5 pr-3 font-mono text-[11px]">{(v.modelsCompared || []).join(', ') || 'Fallback'}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{(v.externalSourcesChecked || []).length}</td>
                    <td className="py-2.5 font-semibold capitalize">{v.verificationStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Call Logs */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
          <h2 className="font-bold text-sm text-[#071426] dark:text-white">Recent AI Usage Events</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[#8793A5] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-3">Provider / Model</th>
                  <th className="py-2 pr-3">Mode</th>
                  <th className="py-2 pr-3">Tokens (In / Out)</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.logs || []).map((l: any) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-3 font-mono">
                      {l.providerSlug}:{l.modelKey}
                    </td>
                    <td className="py-2 pr-3">{l.mode}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {l.inputTokens} / {l.outputTokens}
                    </td>
                    <td className={`py-2 font-semibold ${l.status === 'success' ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {l.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
