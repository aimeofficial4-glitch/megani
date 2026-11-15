import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wallet,
  UserCheck,
  Loader2,
  ArrowRight,
  ScrollText,
} from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { AdminLayout } from './AdminLayout';

interface IntegrationOverview {
  config: {
    configured: boolean;
    sandboxMode: boolean;
    environment: string;
    targetEnvironment: string;
    baseUrl: string;
    missingVars: string[];
    varsStatus: Record<string, boolean>;
  };
  tokenStatus: {
    status: string;
    cached: boolean;
    expiresAt: string | null;
    expiresInSeconds: number | null;
    ttlRemainingSeconds: number;
    lastCheckedAt: string | null;
    lastError: string | null;
  };
  balance: {
    snapshot: {
      availableBalance: string;
      currency: string;
      targetEnvironment: string;
      environment: string;
      lastUpdatedAt: string;
    } | null;
    lastError: string | null;
  };
  recentAccountHolderChecks: Array<{
    state: 'active' | 'inactive' | 'unverified';
    active: boolean | null;
    accountHolderIdType: string;
    maskedAccountHolderId: string;
    checkedAt: string;
    message: string;
  }>;
  recentAuditEvents: Array<{
    id: string;
    action: string;
    actorEmail: string | null;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export const AdminMomoIntegrationPage: React.FC = () => {
  const { addToast } = useApp();
  const [overview, setOverview] = useState<IntegrationOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [testingToken, setTestingToken] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);

  // Sandbox Account Holder tester state
  const [idType, setIdType] = useState<'msisdn' | 'email' | 'party_code'>('msisdn');
  const [holderId, setHolderId] = useState('');
  const [holderConsent, setHolderConsent] = useState(false);
  const [validatingHolder, setValidatingHolder] = useState(false);
  const [holderResult, setHolderResult] = useState<{
    state: 'active' | 'inactive' | 'unverified';
    message: string;
    maskedAccountHolderId: string;
    checkedAt: string;
  } | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await apiFetch<IntegrationOverview>('/api/admin/momo/integration');
      setOverview(res);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to load MTN MoMo integration overview.');
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleRequestToken = async (forceRefresh: boolean) => {
    setTestingToken(true);
    setActionError(null);
    try {
      const res = await apiFetch<any>('/api/momo/auth/token', {
        method: 'POST',
        body: JSON.stringify({ forceRefresh }),
      });
      await loadOverview();
      addToast(
        res.cached
          ? `Valid cached Sandbox token active (${res.ttlRemainingSeconds}s remaining).`
          : 'New Sandbox OAuth access token generated and cached server-side.',
        'success'
      );
    } catch (err: any) {
      const msg = err?.message || 'Unable to acquire Sandbox OAuth token.';
      setActionError(msg);
      await loadOverview();
      addToast(msg, 'error');
    } finally {
      setTestingToken(false);
    }
  };

  const handleQuickBalanceCheck = async () => {
    setCheckingBalance(true);
    setActionError(null);
    try {
      const res = await apiFetch<any>('/api/momo/account/balance');
      await loadOverview();
      addToast(`Collections balance: ${res.availableBalance} ${res.currency}`, 'success');
    } catch (err: any) {
      const msg = err?.message || 'Balance check failed.';
      setActionError(msg);
      await loadOverview();
      addToast(msg, 'error');
    } finally {
      setCheckingBalance(false);
    }
  };

  const handleValidateHolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holderConsent) {
      addToast('Confirm validation consent before testing Account Holder Active API.', 'warning');
      return;
    }
    setValidatingHolder(true);
    setActionError(null);
    try {
      const res = await apiFetch<any>(
        `/api/momo/accountholder/${encodeURIComponent(idType)}/${encodeURIComponent(holderId.trim())}/active?consent=true`
      );
      setHolderResult(res);
      await loadOverview();
    } catch (err: any) {
      const msg = err?.message || 'Could not verify account';
      setActionError(msg);
      setHolderResult({
        state: 'unverified',
        message: msg,
        maskedAccountHolderId: holderId,
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setValidatingHolder(false);
    }
  };

  const cfg = overview?.config;
  const tok = overview?.tokenStatus;
  const bal = overview?.balance;

  return (
    <AdminLayout
      title="MTN MoMo Sandbox Integration"
      subtitle="Manage and verify the three Sandbox Collections APIs: OAuth Token, Collections Account Balance, and Account Holder Active check."
    >
      {actionError && (
        <div className="p-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 text-xs flex items-start gap-2.5 text-rose-600 dark:text-rose-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">MTN MoMo Sandbox Notice</p>
            <p className="text-slate-700 dark:text-slate-200 mt-0.5">{actionError}</p>
          </div>
        </div>
      )}

      {/* Environment & Secret Readiness Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-[#071426] dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#258BFF]" />
              Sandbox Environment &amp; Secrets
            </h2>
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase ${
                cfg?.configured
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#B7F34A]'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
              }`}
            >
              {cfg?.configured ? 'Configured' : 'Missing Secrets'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#8793A5]">Environment Mode</span>
              <span className="font-mono font-bold uppercase">{cfg?.environment || 'sandbox'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8793A5]">Target Environment</span>
              <span className="font-mono font-bold">{cfg?.targetEnvironment || 'sandbox'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[#8793A5]">MTN Sandbox Gateway</span>
              <span className="font-mono text-[11px] truncate">{cfg?.baseUrl || 'https://sandbox.momodeveloper.mtn.co.rw'}</span>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">
              Server Environment Variables (Values Never Exposed)
            </p>
            {cfg &&
              Object.entries(cfg.varsStatus).map(([envName, present]) => (
                <div
                  key={envName}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800"
                >
                  <span className="font-mono text-[11px]">{envName}</span>
                  {present ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-[#B7F34A]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Configured
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500">
                      <XCircle className="w-3.5 h-3.5" /> Missing
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>

        {/* API 1 & API 2: Token Status + Balance Snapshot */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-[#071426] dark:text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#258BFF]" />
                API 1: Collections OAuth Token Service
              </h2>
              <span className="text-[11px] font-bold uppercase px-2.5 py-0.5 rounded bg-slate-100 dark:bg-[#071426] text-[#258BFF]">
                {tok?.status?.replace('_', ' ') || (loadingOverview ? 'Loading' : 'Unknown')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-[#8793A5]">Cache State</p>
                <p className="font-bold mt-0.5">
                  {tok?.cached ? `Cached (${tok.ttlRemainingSeconds}s TTL)` : 'Not cached'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-[#8793A5]">Last API Check</p>
                <p className="font-bold mt-0.5 tabular-nums">
                  {tok?.lastCheckedAt ? new Date(tok.lastCheckedAt).toLocaleTimeString() : 'Never'}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-[#8793A5]">
              Tokens are stored exclusively in server memory and reused until 60s before expiry. Raw access tokens are never sent to the browser.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleRequestToken(false)}
                disabled={testingToken}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-bold disabled:opacity-60"
              >
                {testingToken && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Verify / Use Cached Token
              </button>
              <button
                type="button"
                onClick={() => handleRequestToken(true)}
                disabled={testingToken}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold disabled:opacity-60"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Force Refresh Token
              </button>
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-[#071426] dark:text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#258BFF]" />
                API 2: Collections Account Balance
              </h2>
              <Link to="/admin/momo/balance" className="text-xs font-bold text-[#258BFF] hover:underline inline-flex items-center gap-1">
                Full Balance View <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {bal?.snapshot ? (
              <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-lg font-extrabold text-[#071426] dark:text-[#B7F34A] tabular-nums">
                    {bal.snapshot.availableBalance} {bal.snapshot.currency}
                  </p>
                  <p className="text-[11px] text-[#8793A5]">
                    Updated {new Date(bal.snapshot.lastUpdatedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleQuickBalanceCheck}
                  disabled={checkingBalance}
                  className="px-3 py-1.5 rounded-lg bg-[#258BFF] text-white text-xs font-bold disabled:opacity-60"
                >
                  {checkingBalance ? 'Checking...' : 'Refresh'}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs">
                <span className="text-[#8793A5]">
                  {bal?.lastError || 'No Sandbox balance check executed yet.'}
                </span>
                <button
                  type="button"
                  onClick={handleQuickBalanceCheck}
                  disabled={checkingBalance}
                  className="px-3 py-1.5 rounded-lg bg-[#258BFF] text-white text-xs font-bold disabled:opacity-60"
                >
                  {checkingBalance ? 'Checking...' : 'Check Balance'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* API 3: Account Holder Validation Test & Recent Checks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
          <h2 className="text-sm font-extrabold text-[#071426] dark:text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#258BFF]" />
            API 3: Validate Account Holder (Sandbox Test)
          </h2>

          <form onSubmit={handleValidateHolder} className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value as any)}
                className="px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              >
                <option value="msisdn">MSISDN</option>
                <option value="email">EMAIL</option>
                <option value="party_code">PARTY_CODE</option>
              </select>
              <input
                type="text"
                required
                value={holderId}
                onChange={(e) => setHolderId(e.target.value)}
                placeholder={idType === 'msisdn' ? 'e.g. 46733123453 or 078...' : 'Enter account holder ID'}
                className="col-span-2 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              />
            </div>

            <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={holderConsent}
                onChange={(e) => setHolderConsent(e.target.checked)}
                className="mt-0.5 accent-[#258BFF]"
              />
              <span>
                Confirm sandbox test request to MTN Account Holder Active endpoint (does not initiate payments or check wallet balance).
              </span>
            </label>

            <button
              type="submit"
              disabled={validatingHolder}
              className="px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] font-extrabold text-xs disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {validatingHolder && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Validate Account Holder
            </button>
          </form>

          {holderResult && (
            <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div className="flex items-center justify-between font-bold">
                <span>Result: {holderResult.message}</span>
                <span className="font-mono text-[11px] text-[#8793A5]">{holderResult.maskedAccountHolderId}</span>
              </div>
              <p className="text-[11px] text-[#8793A5]">
                Checked at {new Date(holderResult.checkedAt).toLocaleTimeString()}
              </p>
            </div>
          )}

          {(overview?.recentAccountHolderChecks?.length || 0) > 0 && (
            <div className="space-y-1.5 pt-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">
                Recent Account Holder Checks (Masked)
              </p>
              {overview!.recentAccountHolderChecks.slice(0, 5).map((chk, idx) => (
                <div
                  key={`${chk.maskedAccountHolderId}-${idx}`}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#F5F7FA] dark:bg-[#071426] text-[11px]"
                >
                  <span className="font-mono">
                    {chk.accountHolderIdType}: {chk.maskedAccountHolderId}
                  </span>
                  <span
                    className={`font-bold uppercase ${
                      chk.state === 'active'
                        ? 'text-emerald-600 dark:text-[#B7F34A]'
                        : chk.state === 'inactive'
                          ? 'text-amber-500'
                          : 'text-rose-500'
                    }`}
                  >
                    {chk.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Safe Audit Log Trail */}
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
          <h2 className="text-sm font-extrabold text-[#071426] dark:text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-[#258BFF]" />
            Safe MTN MoMo Audit Trail
          </h2>
          <p className="text-[11px] text-[#8793A5]">
            Records operational API metadata without storing subscription keys, API secrets, access tokens, or unmasked phone numbers.
          </p>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {(overview?.recentAuditEvents || []).length === 0 ? (
              <p className="text-xs text-[#8793A5] py-6 text-center">
                No Sandbox API events recorded yet.
              </p>
            ) : (
              overview!.recentAuditEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#258BFF]">{ev.action}</span>
                    <span className="text-[#8793A5] tabular-nums">
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[#8793A5]">Actor: {ev.actorEmail || 'system'}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
