import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Wallet, AlertCircle, Clock, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { AdminLayout } from './AdminLayout';

interface BalanceResponse {
  availableBalance: string;
  currency: string;
  targetEnvironment: string;
  environment: string;
  lastUpdatedAt: string;
  note: string;
}

export const AdminMomoBalancePage: React.FC = () => {
  const { addToast } = useApp();
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchBalance = useCallback(
    async (notifySuccess = false) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const res = await apiFetch<BalanceResponse>('/api/momo/account/balance');
        setBalance(res);
        if (notifySuccess) {
          addToast('Collections account balance refreshed from MTN MoMo Sandbox.', 'success');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Unable to retrieve MTN MoMo Collections account balance.');
      } finally {
        setLoading(false);
      }
    },
    [addToast]
  );

  useEffect(() => {
    fetchBalance(false);
  }, [fetchBalance]);

  return (
    <AdminLayout
      title="MTN MoMo Collections Balance"
      subtitle="Live 2MR business Collections wallet balance retrieved via MTN MoMo Sandbox API (GET /collection/v1_0/account/balance)."
    >
      {/* Important Clarification Banner */}
      <div className="p-4 rounded-2xl border border-blue-500/30 bg-blue-500/10 text-xs flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#258BFF] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-[#071426] dark:text-white">
              2MR Business Collections Account (Sandbox Only)
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              This screen displays the 2MR merchant Collections account balance returned by MTN MoMo Sandbox. It does not display any individual customer&apos;s MoMo balance, and never invents fallback balance numbers.
            </p>
          </div>
        </div>
        <Link
          to="/admin/momo/integration"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#258BFF] hover:underline shrink-0"
        >
          Integration Status <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Main Balance Card */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#258BFF]/15 flex items-center justify-center text-[#258BFF]">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#071426] dark:text-white">
                Available Collections Balance
              </h2>
              <p className="text-xs text-[#8793A5]">
                Source: MTN MoMo Collections Sandbox Gateway
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchBalance(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#258BFF] text-white text-xs font-bold hover:brightness-110 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh Balance
          </button>
        </div>

        {loading && !balance && !errorMessage ? (
          <div className="py-10 flex items-center justify-center gap-2.5 text-xs text-[#8793A5]">
            <Loader2 className="w-5 h-5 animate-spin text-[#258BFF]" />
            Querying MTN MoMo Sandbox Collections balance...
          </div>
        ) : errorMessage ? (
          <div className="p-5 rounded-xl border border-rose-500/40 bg-rose-500/10 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Unable to Retrieve Balance
            </div>
            <p className="text-slate-700 dark:text-slate-200">{errorMessage}</p>
            <p className="text-[11px] text-[#8793A5]">
              Verify that <span className="font-mono">MTN_MOMO_SUBSCRIPTION_KEY</span>,{' '}
              <span className="font-mono">MTN_MOMO_API_USER</span>,{' '}
              <span className="font-mono">MTN_MOMO_API_KEY</span>, and{' '}
              <span className="font-mono">MTN_MOMO_TARGET_ENVIRONMENT</span> are configured on the server.
            </p>
          </div>
        ) : balance ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8793A5]">
                Collections Balance
              </p>
              <p className="text-3xl font-extrabold text-[#071426] dark:text-[#B7F34A] tabular-nums">
                {balance.availableBalance}
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8793A5]">
                Currency
              </p>
              <p className="text-3xl font-extrabold text-[#258BFF] tabular-nums">
                {balance.currency}
              </p>
            </div>

            <div className="p-5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8793A5]">
                Last Updated
              </p>
              <p className="text-sm font-bold text-[#071426] dark:text-white flex items-center gap-1.5 pt-1 tabular-nums">
                <Clock className="w-4 h-4 text-[#258BFF] shrink-0" />
                {new Date(balance.lastUpdatedAt).toLocaleString()}
              </p>
              <p className="text-[11px] text-[#8793A5] font-mono">
                Env: {balance.environment} ({balance.targetEnvironment})
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
};
