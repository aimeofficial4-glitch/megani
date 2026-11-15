import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Download, Search, Eye, X, ShieldCheck, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { AdminLayout } from './AdminLayout';

interface AdminPaymentSummary {
  totalCount: number;
  successfulCount: number;
  pendingCount: number;
  failedCount: number;
  expiredCount: number;
  requiresReconciliationCount: number;
  verifiedRevenueRwf: number;
}

interface MomoConfigInfo {
  configured: boolean;
  productionReady: boolean;
  environment: 'sandbox' | 'production';
  targetEnvironment: string;
  callbackUrl: string | null;
  ipAllowlistConfigured: boolean;
  missingVars: string[];
  warnings: string[];
}

export const AdminPaymentsPage: React.FC = () => {
  const { addToast } = useApp();
  const [payments, setPayments] = useState<any[]>([]);
  const [summary, setSummary] = useState<AdminPaymentSummary | null>(null);
  const [momoConfig, setMomoConfig] = useState<MomoConfigInfo | null>(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [envFilter, setEnvFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reconcilingBatch, setReconcilingBatch] = useState(false);

  const [detailModal, setDetailModal] = useState<{ payment: any; events: any[] } | null>(null);

  const loadPayments = useCallback(() => {
    const qs = new URLSearchParams();
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    if (envFilter !== 'all') qs.set('environment', envFilter);
    if (search.trim()) qs.set('search', search.trim());
    if (dateFrom) qs.set('from', dateFrom);
    if (dateTo) qs.set('to', dateTo);

    apiFetch<{ summary: AdminPaymentSummary; payments: any[]; momoConfig: MomoConfigInfo }>(
      `/api/admin/payments?${qs.toString()}`
    )
      .then((res) => {
        setPayments(res.payments || []);
        setSummary(res.summary || null);
        setMomoConfig(res.momoConfig || null);
      })
      .catch(() => {});
  }, [statusFilter, envFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const handleReconcile = async (ref: string) => {
    try {
      const res = await apiFetch<any>(`/api/admin/payments/${ref}/reconcile`, { method: 'POST' });
      loadPayments();
      addToast(res.message || 'Transaction reconciled against MTN MoMo API.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Reconciliation failed.', 'warning');
    }
  };

  const handleBatchReconcile = async () => {
    setReconcilingBatch(true);
    try {
      const res = await apiFetch<{ checkedCount: number }>('/api/admin/payments/reconcile-pending', {
        method: 'POST',
      });
      loadPayments();
      addToast(`Reconciled ${res.checkedCount} pending/unresolved transaction(s) against MTN.`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Batch reconciliation failed.', 'error');
    } finally {
      setReconcilingBatch(false);
    }
  };

  const handleInspectDetail = async (ref: string) => {
    try {
      const res = await apiFetch<{ payment: any; events: any[] }>(`/api/admin/payments/${ref}`);
      setDetailModal(res);
    } catch (err: any) {
      addToast(err.message || 'Unable to load transaction detail.', 'error');
    }
  };

  const handleAuthorizedCsvExport = async () => {
    try {
      const response = await fetch('/api/admin/payments/export', { credentials: 'include' });
      if (!response.ok) throw new Error('Export unauthorized or failed.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `2mr-verified-payments-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addToast('Authorized payment report exported.', 'success');
    } catch (err: any) {
      addToast(err.message || 'CSV export failed.', 'error');
    }
  };

  return (
    <AdminLayout
      title="Payments & MTN MoMo Ledger"
      subtitle="Monitor real MTN Mobile Money Rwanda transactions, verify provider settlement, reconcile pending items, and export authorized reports."
    >
      {/* MTN MoMo Environment & Security Banner */}
      {momoConfig && (
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#258BFF]" />
              <span className="font-bold">MTN MoMo Environment:</span>
              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#071426] font-mono uppercase font-bold">
                {momoConfig.environment}
              </span>
              <span
                className={`font-bold ${
                  momoConfig.environment === 'production'
                    ? momoConfig.productionReady
                      ? 'text-emerald-600 dark:text-[#B7F34A]'
                      : 'text-amber-500'
                    : momoConfig.configured
                      ? 'text-[#258BFF]'
                      : 'text-amber-500'
                }`}
              >
                {momoConfig.environment === 'production'
                  ? momoConfig.productionReady
                    ? 'Production Ready'
                    : 'Production Blocked (Credentials/Callback Required)'
                  : momoConfig.configured
                    ? 'Sandbox Ready'
                    : 'Credentials Not Configured'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleBatchReconcile}
                disabled={reconcilingBatch}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#258BFF] text-white font-semibold disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reconcilingBatch ? 'animate-spin' : ''}`} />
                Reconcile Pending
              </button>
              <button
                type="button"
                onClick={handleAuthorizedCsvExport}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
              >
                <Download className="w-3.5 h-3.5" /> Export Authorized CSV
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-[11px] text-[#8793A5]">
            <span>Target Env: <strong className="font-mono">{momoConfig.targetEnvironment}</strong></span>
            <span>Callback URL: <strong className="font-mono">{momoConfig.callbackUrl || 'Not configured'}</strong></span>
            <span>IP Allowlist: <strong>{momoConfig.ipAllowlistConfigured ? 'Enforced' : 'Optional / Not set'}</strong></span>
          </div>

          {(momoConfig.missingVars.length > 0 || momoConfig.warnings.length > 0) && (
            <div className="pt-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                Action required: {[...momoConfig.missingVars, ...momoConfig.warnings].join(' · ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Transactions', value: summary.totalCount, tone: 'text-[#071426] dark:text-white' },
            { label: 'Verified Revenue', value: `${summary.verifiedRevenueRwf.toLocaleString()} RWF`, tone: 'text-emerald-600 dark:text-[#B7F34A]' },
            { label: 'Successful', value: summary.successfulCount, tone: 'text-emerald-600 dark:text-[#B7F34A]' },
            { label: 'Pending', value: summary.pendingCount, tone: 'text-[#258BFF]' },
            { label: 'Failed / Expired', value: summary.failedCount + summary.expiredCount, tone: 'text-rose-500' },
            { label: 'Needs Reconcile', value: summary.requiresReconciliationCount, tone: 'text-amber-500' },
          ].map((card) => (
            <div
              key={card.label}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1"
            >
              <p className="text-[11px] font-semibold text-[#8793A5]">{card.label}</p>
              <p className={`text-xl font-extrabold tabular-nums ${card.tone}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search & Filters */}
      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-[#8793A5] absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference ID, customer email, name, or masked phone..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
            />
          </div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Filter from date"
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Filter to date"
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {['all', 'pending', 'successful', 'failed', 'expired', 'requires_reconciliation'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg font-semibold capitalize ${
                  statusFilter === st
                    ? 'bg-[#258BFF] text-white'
                    : 'bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            {['all', 'production', 'sandbox'].map((env) => (
              <button
                key={env}
                type="button"
                onClick={() => setEnvFilter(env)}
                className={`px-3 py-1.5 rounded-lg font-semibold capitalize ${
                  envFilter === env
                    ? 'bg-[#B7F34A] text-[#071426]'
                    : 'bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800'
                }`}
              >
                {env}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[#8793A5]">
              <th className="p-4">Reference</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Env / Masked Phone</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Status / Reconcile</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {payments.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[#8793A5]">
                  No real transactions match these filters.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id}>
                  <td className="p-4 font-mono">
                    <div>{p.transactionRef.slice(0, 14)}...</div>
                    <div className="text-[10px] text-[#8793A5]">{new Date(p.createdAt).toLocaleString()}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold">{p.userName || '—'}</div>
                    <div className="text-[11px] text-[#8793A5]">{p.userEmail || '—'}</div>
                  </td>
                  <td className="p-4">
                    <span className="uppercase font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#071426] mr-1.5">
                      {p.environment || 'sandbox'}
                    </span>
                    <span>{p.phoneMasked || 'N/A'}</span>
                  </td>
                  <td className="p-4 font-bold tabular-nums">
                    {Number(p.amount).toLocaleString()} {p.currency}
                  </td>
                  <td className="p-4">
                    <div className="uppercase font-bold text-[#258BFF]">{p.status.replace('_', ' ')}</div>
                    <div className="text-[10px] text-[#8793A5]">Reconcile: {p.reconciliationStatus || 'pending'}</div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleInspectDetail(p.transactionRef)}
                        className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-[#258BFF]"
                      >
                        <Eye className="w-3.5 h-3.5" /> Detail
                      </button>
                      {p.status !== 'successful' && (
                        <button
                          type="button"
                          onClick={() => handleReconcile(p.transactionRef)}
                          className="inline-flex items-center gap-1 text-[#258BFF] hover:underline font-semibold"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Check MTN
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Transaction Detail Modal */}
      {detailModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#071426] dark:text-white">
                Admin Payment Inspection
              </h3>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="p-1.5 rounded-lg text-[#8793A5] hover:text-[#071426] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-[#8793A5]">Transaction UUID</span>
                <span className="font-mono break-all">{detailModal.payment.transactionRef}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8793A5]">External ID</span>
                <span className="font-mono">{detailModal.payment.externalId || '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8793A5]">MTN Financial ID</span>
                <span className="font-mono">{detailModal.payment.providerRef || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8793A5]">Customer</span>
                <span>{detailModal.payment.userEmail || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8793A5]">Masked Phone</span>
                <span className="font-mono">{detailModal.payment.phoneMasked || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8793A5]">Amount / Currency</span>
                <span className="font-bold">
                  {Number(detailModal.payment.amount).toLocaleString()} {detailModal.payment.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8793A5]">Status / Reconciliation</span>
                <span className="uppercase font-bold text-[#258BFF]">
                  {detailModal.payment.status} ({detailModal.payment.reconciliationStatus})
                </span>
              </div>
              {detailModal.payment.verifiedAt && (
                <div className="flex justify-between">
                  <span className="text-[#8793A5]">Verified Timestamp</span>
                  <span>{new Date(detailModal.payment.verifiedAt).toLocaleString()}</span>
                </div>
              )}
              {detailModal.payment.failureReason && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-rose-500">
                  Reason: {detailModal.payment.failureReason}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#8793A5]">Audit &amp; Callback Events</h4>
              {(detailModal.events || []).map((ev) => (
                <div
                  key={ev.id}
                  className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-[11px] flex justify-between gap-2"
                >
                  <span>
                    <strong className="uppercase">{ev.eventType.replace('_', ' ')}</strong> · {ev.source} (
                    {ev.previousStatus || 'none'} → {ev.newStatus || 'none'})
                  </span>
                  <span className="text-[#8793A5] tabular-nums">{new Date(ev.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
