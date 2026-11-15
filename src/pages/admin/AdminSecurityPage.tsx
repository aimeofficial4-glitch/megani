import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminSecurityPage: React.FC = () => {
  const { addToast, refreshUser } = useApp();
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);

  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoting, setPromoting] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any>('/api/admin/security/overview');
      setOverview(res);
    } catch (err: any) {
      addToast(err.message || 'Failed to load security overview.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 10) {
      addToast('New administrator password must be at least 10 characters.', 'warning');
      return;
    }
    setSavingPassword(true);
    try {
      await apiFetch('/api/admin/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      addToast('Administrator Argon2id password updated.', 'success');
      await loadOverview();
    } catch (err: any) {
      addToast(err.message || 'Failed to update password.', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleStart2fa = async () => {
    setTotpLoading(true);
    try {
      const res = await apiFetch<{ secret: string; otpauthUri: string }>('/api/admin/security/2fa/setup', {
        method: 'POST',
      });
      setTotpSetup(res);
    } catch (err: any) {
      addToast(err.message || 'Failed to initialize 2FA setup.', 'error');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode.trim()) return;
    setTotpLoading(true);
    try {
      await apiFetch('/api/admin/security/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code: totpCode.trim() }),
      });
      setTotpSetup(null);
      setTotpCode('');
      addToast('Two-factor authentication enabled.', 'success');
      await loadOverview();
    } catch (err: any) {
      addToast(err.message || 'Invalid authenticator code.', 'error');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleDisable2fa = async () => {
    setTotpLoading(true);
    try {
      await apiFetch('/api/admin/security/2fa/disable', { method: 'POST' });
      addToast('Two-factor authentication disabled.', 'info');
      await loadOverview();
    } catch (err: any) {
      addToast(err.message || 'Failed to disable 2FA.', 'error');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleLogoutAll = async () => {
    try {
      await apiFetch('/api/admin/security/logout-all', { method: 'POST' });
      addToast('All active sessions revoked.', 'success');
      await refreshUser();
    } catch (err: any) {
      addToast(err.message || 'Failed to revoke devices.', 'error');
    }
  };

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoteEmail.trim()) return;
    setPromoting(true);
    try {
      const res = await apiFetch<{ email: string }>('/api/admin/security/promote', {
        method: 'POST',
        body: JSON.stringify({ email: promoteEmail.trim() }),
      });
      setPromoteEmail('');
      addToast(`${res.email} promoted to 2MR Administrator.`, 'success');
      await loadOverview();
    } catch (err: any) {
      addToast(err.message || 'Failed to promote user.', 'error');
    } finally {
      setPromoting(false);
    }
  };

  const copySecret = () => {
    if (!totpSetup?.secret) return;
    navigator.clipboard?.writeText(totpSetup.secret);
    addToast('TOTP secret copied to clipboard.', 'success');
  };

  return (
    <AdminLayout
      title="Administrator Security Center"
      subtitle="Manage Argon2id password rotation, TOTP 2FA verification, active device sessions, and administrator privileges."
    >
      {loading || !overview ? (
        <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center text-xs text-[#8793A5]">
          Loading security posture...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Security Summary Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8793A5]">Argon2id Password</p>
              <p className="text-sm font-bold text-[#071426] dark:text-white mt-1 flex items-center gap-1.5">
                {overview.account?.hasPassword ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Configured
                    {overview.account?.mustChangePassword && (
                      <span className="text-amber-500 text-xs">(Rotation Required)</span>
                    )}
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4 text-amber-500" /> Not Set Yet
                  </>
                )}
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8793A5]">Authenticator 2FA</p>
              <p className="text-sm font-bold text-[#071426] dark:text-white mt-1 flex items-center gap-1.5">
                {overview.account?.totpEnabled ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> Active &amp; Enforced
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-amber-500" /> Disabled
                  </>
                )}
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8793A5]">Active Sessions</p>
                <p className="text-xl font-extrabold text-[#071426] dark:text-white mt-0.5 tabular-nums">
                  {(overview.activeSessions || []).filter((s: any) => s.isActive).length}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogoutAll}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                <LogOut className="w-3.5 h-3.5" /> Logout All
              </button>
            </div>
          </div>

          {/* Password Rotation + 2FA Management */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={handlePasswordChange}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4 text-xs"
            >
              <h2 className="font-bold text-sm text-[#071426] dark:text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#258BFF]" /> Rotate Administrator Password
              </h2>
              {overview.account?.hasPassword && !overview.account?.mustChangePassword && (
                <div>
                  <label className="block text-[#8793A5] mb-1">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                  />
                </div>
              )}
              <div>
                <label className="block text-[#8793A5] mb-1">New Password (min 10 characters)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={10}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
              <button
                type="submit"
                disabled={savingPassword}
                className="px-4 py-2 rounded-xl bg-[#258BFF] text-white font-bold disabled:opacity-50"
              >
                {savingPassword ? 'Updating...' : 'Save Argon2id Password'}
              </button>
            </form>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4 text-xs">
              <h2 className="font-bold text-sm text-[#071426] dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#B7F34A]" /> Two-Factor Authentication (TOTP)
              </h2>

              {overview.account?.totpEnabled ? (
                <div className="space-y-3">
                  <p className="text-slate-600 dark:text-slate-300">
                    TOTP 2FA is active for <span className="font-semibold">{overview.account.email}</span>. Password
                    sign-ins require a valid 6-digit authenticator code.
                  </p>
                  <button
                    type="button"
                    disabled={totpLoading}
                    onClick={handleDisable2fa}
                    className="px-4 py-2 rounded-xl border border-rose-400 text-rose-600 dark:text-rose-400 font-bold"
                  >
                    Disable 2FA
                  </button>
                </div>
              ) : totpSetup ? (
                <form onSubmit={handleVerify2fa} className="space-y-3">
                  <p className="text-slate-600 dark:text-slate-300">
                    Add this secret key to Google Authenticator, 1Password, or Authy, then enter the 6-digit code:
                  </p>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800">
                    <code className="flex-1 font-mono text-[11px] break-all">{totpSetup.secret}</code>
                    <button
                      type="button"
                      onClick={copySecret}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
                      title="Copy TOTP secret"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-[#8793A5] break-all font-mono">{totpSetup.otpauthUri}</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="123456"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] font-mono tabular-nums"
                    />
                    <button
                      type="submit"
                      disabled={totpLoading}
                      className="px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] font-bold"
                    >
                      Verify &amp; Enable
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <p className="text-slate-600 dark:text-slate-300">
                    Protect password sign-in with an RFC 6238 6-digit authenticator app code.
                  </p>
                  <button
                    type="button"
                    disabled={totpLoading}
                    onClick={handleStart2fa}
                    className="px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] font-bold"
                  >
                    Configure TOTP 2FA
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Promote Registered User to Admin */}
          <form
            onSubmit={handlePromote}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3 text-xs"
          >
            <h2 className="font-bold text-sm text-[#071426] dark:text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#258BFF]" /> Authorized Administrators ({(overview.administrators || []).length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {(overview.administrators || []).map((a: any) => (
                <div
                  key={a.id}
                  className="px-3 py-1.5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800"
                >
                  <span className="font-semibold text-[#071426] dark:text-white">{a.email}</span>
                  <span className="text-[#8793A5] ml-2">2FA: {a.totpEnabled ? 'On' : 'Off'}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <input
                type="email"
                value={promoteEmail}
                onChange={(e) => setPromoteEmail(e.target.value)}
                placeholder="Existing registered user email to promote..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              />
              <button
                type="submit"
                disabled={promoting}
                className="px-4 py-2 rounded-xl bg-[#258BFF] text-white font-bold disabled:opacity-50"
              >
                {promoting ? 'Promoting...' : 'Promote to Admin'}
              </button>
            </div>
          </form>

          {/* Recent Admin Login Attempts & Security Events */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
              <h2 className="font-bold text-sm text-[#071426] dark:text-white">Recent Admin Login Attempts</h2>
              <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
                {(overview.loginLogs || []).map((log: any) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate text-[#071426] dark:text-white">{log.email}</p>
                      <p className="text-[11px] text-[#8793A5]">
                        {log.authMethod} · {log.ipAddress || 'unknown'}
                        {log.failureReason ? ` · ${log.failureReason}` : ''}
                      </p>
                    </div>
                    <span className={`font-bold shrink-0 ${log.success ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {log.success ? 'SUCCESS' : 'DENIED'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
              <h2 className="font-bold text-sm text-[#071426] dark:text-white">Security Events</h2>
              <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
                {(overview.securityEvents || []).length === 0 ? (
                  <p className="text-[#8793A5]">No security alerts recorded.</p>
                ) : (
                  (overview.securityEvents || []).map((ev: any) => (
                    <div key={ev.id} className="p-2.5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#071426] dark:text-white">{ev.eventType}</span>
                        <span className="text-[10px] uppercase font-bold text-amber-500">{ev.severity}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">{ev.description}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
