import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminSubscriptionsPage: React.FC = () => {
  const { addToast } = useApp();
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ subscriptions: any[]; plans: any[] }>('/api/admin/subscriptions');
      setSubscriptions(res.subscriptions || []);
      setPlans(res.plans || []);
    } catch (err: any) {
      addToast(err.message || 'Failed to load subscriptions.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const updateStatus = async (id: string, status: 'active' | 'cancelled' | 'expired') => {
    setUpdatingId(id);
    try {
      await apiFetch(`/api/admin/subscriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      addToast(`Subscription marked as ${status}.`, 'success');
      await loadSubscriptions();
    } catch (err: any) {
      addToast(err.message || 'Failed to update subscription status.', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const planLookup = new Map(plans.map((p) => [p.id, p]));
  const activeCount = subscriptions.filter((s) => s.status === 'active').length;

  return (
    <AdminLayout
      title="Subscriptions & Plans"
      subtitle="Inspect 2MR Free and Premium subscriber lifecycles, billing intervals, and plan entitlements."
    >
      <div className="space-y-6">
        {/* Plans Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8793A5]">Active Subscriptions</p>
            <p className="text-2xl font-extrabold text-[#071426] dark:text-white mt-1 tabular-nums">{activeCount}</p>
          </div>
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#071426] dark:text-white flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#258BFF] dark:text-[#B7F34A]" /> {plan.name}
                </p>
                <span className="text-[11px] font-mono text-[#8793A5]">{plan.slug}</span>
              </div>
              <p className="text-lg font-extrabold text-[#258BFF] dark:text-[#B7F34A] mt-1 tabular-nums">
                {Number(plan.priceRwf || 0).toLocaleString()} RWF / {plan.billingPeriod || 'month'}
              </p>
            </div>
          ))}
        </div>

        {/* Subscriber Table */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-bold text-sm text-[#071426] dark:text-white">
              Subscriber Records ({subscriptions.length})
            </h2>
            <button
              type="button"
              onClick={loadSubscriptions}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-[#8793A5]">Loading subscription records...</div>
          ) : subscriptions.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#8793A5]">No subscription records found yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F7FA] dark:bg-[#071426] text-[#8793A5] uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Period End</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {subscriptions.map((sub) => {
                    const plan = planLookup.get(sub.planId);
                    return (
                      <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-[#071426]/60">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#071426] dark:text-white">
                            {sub.userName || '2MR User'}
                          </div>
                          <div className="text-[11px] text-[#8793A5]">{sub.userEmail || sub.userId}</div>
                        </td>
                        <td className="px-4 py-3 font-medium text-[#071426] dark:text-slate-200">
                          {plan?.name || sub.planId}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold uppercase text-[10px] ${
                              sub.status === 'active'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#B7F34A]'
                                : sub.status === 'cancelled'
                                ? 'bg-rose-500/15 text-rose-500'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            {sub.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#8793A5] tabular-nums">
                          {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                          {sub.status !== 'active' && (
                            <button
                              type="button"
                              disabled={updatingId === sub.id}
                              onClick={() => updateStatus(sub.id, 'active')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Activate
                            </button>
                          )}
                          {sub.status === 'active' && (
                            <button
                              type="button"
                              disabled={updatingId === sub.id}
                              onClick={() => updateStatus(sub.id, 'cancelled')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-semibold disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3" /> Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};
