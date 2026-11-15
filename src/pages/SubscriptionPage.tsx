import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, Sparkles, RefreshCw, Eye, X, Mail, Phone, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';

export const SubscriptionPage: React.FC = () => {
  const { user, refreshUser, addToast } = useApp();
  const [payments, setPayments] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<{ payment: any; events: any[] } | null>(null);

  const loadBilling = () => {
    apiFetch<{ payments: any[]; subscriptions: any[] }>('/api/user/payments')
      .then((res) => {
        setPayments(res.payments || []);
        setSubscriptions(res.subscriptions || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadBilling();
  }, []);

  if (!user) return null;

  const handleCancel = async () => {
    try {
      await apiFetch('/api/subscriptions/cancel', { method: 'POST' });
      await refreshUser();
      setConfirmCancel(false);
      loadBilling();
      addToast('Subscription cancelled.', 'info');
    } catch (err: any) {
      addToast(err.message || 'Unable to cancel.', 'error');
    }
  };

  const checkPending = async (ref: string) => {
    try {
      const res = await apiFetch<any>(`/api/payments/momo/status/${ref}`);
      if (res.verified) {
        await refreshUser();
        addToast('Payment verified! 2MR Premium activated.', 'success');
      } else {
        addToast(res.message || `Status: ${res.payment.status}`, 'info');
      }
      loadBilling();
    } catch (err: any) {
      addToast(err.message || 'Verification failed.', 'error');
    }
  };

  const openDetail = async (ref: string) => {
    try {
      const res = await apiFetch<{ payment: any; events: any[] }>(`/api/user/payments/${ref}`);
      setSelectedDetail(res);
    } catch (err: any) {
      addToast(err.message || 'Unable to load transaction details.', 'error');
    }
  };

  const statusTone = (status: string) => {
    if (status === 'successful') return 'bg-emerald-500/15 text-emerald-700 dark:text-[#B7F34A]';
    if (status === 'pending') return 'bg-blue-500/15 text-[#258BFF]';
    if (status === 'requires_reconciliation') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
    return 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#258BFF] hover:underline">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
      </Link>
      <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">Subscription &amp; Billing</h1>

      {/* Current Tier Card */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
            Current Plan Tier
          </span>
          <h2 className="text-2xl font-extrabold uppercase text-[#071426] dark:text-white">{user.role}</h2>
          <p className="text-xs text-[#8793A5]">
            AI Monthly Quota: {user.aiQueriesUsed} / {user.aiQueriesLimit} · Storage Limit: {user.storageLimitMb} MB
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.role === 'free' ? (
            <Link
              to="/checkout"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
            >
              <Sparkles className="w-4 h-4" /> Upgrade to Premium
            </Link>
          ) : (
            user.role === 'premium' &&
            (confirmCancel ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
                >
                  Confirm Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-semibold"
                >
                  Keep Plan
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="px-4 py-2 rounded-xl border border-rose-500/40 text-rose-500 text-xs font-semibold"
              >
                Cancel Subscription
              </button>
            ))
          )}
        </div>
      </div>

      {/* Payment History Table */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-lg text-[#071426] dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#258BFF]" /> Payment History
          </h2>
          <span className="text-[11px] text-[#8793A5] inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#258BFF]" /> Verified Server Settlement Ledger
          </span>
        </div>

        {payments.length === 0 ? (
          <p className="text-xs text-[#8793A5]">No payment transactions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[#8793A5]">
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">Provider &amp; Phone</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 pr-3 font-mono">{p.transactionRef.slice(0, 12)}...</td>
                    <td className="py-3 pr-3">
                      {p.provider} ({p.phoneMasked || 'N/A'})
                    </td>
                    <td className="py-3 pr-3 tabular-nums font-semibold">
                      {Number(p.amount).toLocaleString()} {p.currency}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`px-2 py-0.5 rounded uppercase text-[10px] font-bold ${statusTone(p.status)}`}>
                        {p.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-[#8793A5] tabular-nums">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openDetail(p.transactionRef)}
                        className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-[#258BFF]"
                      >
                        <Eye className="w-3.5 h-3.5" /> Details
                      </button>
                      {(p.status === 'pending' || p.status === 'requires_reconciliation') && (
                        <button
                          type="button"
                          onClick={() => checkPending(p.transactionRef)}
                          className="inline-flex items-center gap-1 text-[#258BFF] hover:underline font-semibold"
                        >
                          <RefreshCw className="w-3 h-3" /> Verify Status
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {subscriptions.length > 0 && (
          <p className="text-[11px] text-[#8793A5]">
            Latest subscription: <strong>{subscriptions[0].status}</strong> · Expires{' '}
            {new Date(subscriptions[0].expiresAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Contact Support Card */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        <div>
          <h3 className="font-bold text-sm text-[#071426] dark:text-white">Billing &amp; Payment Support</h3>
          <p className="text-[#8793A5]">Include your transaction reference when contacting support.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-semibold">
          <a href="mailto:2mr@proton.me" className="inline-flex items-center gap-1.5 text-[#258BFF] hover:underline">
            <Mail className="w-4 h-4" /> 2mr@proton.me
          </a>
          <span className="inline-flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-[#258BFF]" /> 0780558358
          </span>
          <Link to="/contact" className="text-[#258BFF] hover:underline">
            Contact Form →
          </Link>
        </div>
      </div>

      {/* Transaction Detail Modal */}
      {selectedDetail && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#071426] dark:text-white">Transaction Details</h3>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="p-1.5 rounded-lg text-[#8793A5] hover:text-[#071426] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-[#8793A5]">Reference ID</span>
                <span className="font-mono break-all">{selectedDetail.payment.transactionRef}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8793A5]">MTN Financial ID</span>
                <span className="font-mono">{selectedDetail.payment.providerRef || 'Pending'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8793A5]">Amount</span>
                <span className="font-bold">
                  {Number(selectedDetail.payment.amount).toLocaleString()} {selectedDetail.payment.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8793A5]">Masked Phone</span>
                <span className="font-mono">{selectedDetail.payment.phoneMasked || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8793A5]">Status</span>
                <span className="uppercase font-bold text-[#258BFF]">
                  {selectedDetail.payment.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8793A5]">Environment</span>
                <span className="uppercase">{selectedDetail.payment.environment}</span>
              </div>
              {selectedDetail.payment.verifiedAt && (
                <div className="flex justify-between">
                  <span className="text-[#8793A5]">Verified Timestamp</span>
                  <span>{new Date(selectedDetail.payment.verifiedAt).toLocaleString()}</span>
                </div>
              )}
              {selectedDetail.payment.failureReason && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-rose-500">
                  Reason: {selectedDetail.payment.failureReason}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#8793A5]">Verification Timeline</h4>
              {(selectedDetail.events || []).length === 0 ? (
                <p className="text-xs text-[#8793A5]">No verification events logged.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDetail.events.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-[11px] flex justify-between gap-2"
                    >
                      <span>
                        <strong className="uppercase">{ev.eventType.replace('_', ' ')}</strong> · {ev.source}
                        {ev.newStatus ? ` → ${ev.newStatus}` : ''}
                      </span>
                      <span className="text-[#8793A5] tabular-nums">
                        {new Date(ev.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
