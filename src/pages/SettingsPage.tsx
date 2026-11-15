import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Shield, KeyRound, Cookie } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';

export const SettingsPage: React.FC = () => {
  const { user, theme, setTheme, refreshUser, logout, addToast } = useApp();
  const navigate = useNavigate();

  const [language, setLanguage] = useState(user?.preferredLanguage || 'en');
  const [twoFa, setTwoFa] = useState(user?.twoFactorEnabled || false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [aiDisclosure, setAiDisclosure] = useState<{
    disclosure: string;
    providers: Array<{ name: string; enabled: boolean; configured: boolean }>;
  } | null>(null);

  const loadSessions = () => {
    apiFetch<{ sessions: any[] }>('/api/user/sessions')
      .then((res) => setSessions(res.sessions || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadSessions();
    apiFetch<{ disclosure: string; providers: Array<{ name: string; enabled: boolean; configured: boolean }> }>(
      '/api/ai/disclosure'
    )
      .then(setAiDisclosure)
      .catch(() => {});
  }, []);

  if (!user) return null;

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/user/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          preferredLanguage: language,
          preferredTheme: theme,
          twoFactorEnabled: twoFa,
        }),
      });
      await refreshUser();
      addToast('Preferences saved.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Unable to save settings.', 'error');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/user/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      addToast('Password changed successfully.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Password change failed.', 'error');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await apiFetch('/api/user/account', { method: 'DELETE' });
      await logout();
      navigate('/');
    } catch (err: any) {
      addToast(err.message || 'Cannot delete account.', 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#258BFF] hover:underline">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
      </Link>
      <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">Account Settings</h1>

      {/* Theme & Language Preferences */}
      <form
        onSubmit={handleSavePreferences}
        className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4"
      >
        <h2 className="font-bold text-lg text-[#071426] dark:text-white">Appearance & Language</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Theme Mode
            </label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'dark' | 'light')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
            >
              <option value="dark">Dark Navy (#071426)</option>
              <option value="light">Light Workspace (#F5F7FA)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Preferred Research Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="rw">Kinyarwanda</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={twoFa} onChange={(e) => setTwoFa(e.target.checked)} />
          <span>Require enhanced session verification</span>
        </label>
        <button type="submit" className="px-5 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold">
          Save Preferences
        </button>
      </form>

      {/* Password Update */}
      <form
        onSubmit={handlePasswordChange}
        className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4"
      >
        <h2 className="font-bold text-lg text-[#071426] dark:text-white flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-[#258BFF]" /> Change Password
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password (if set)"
            className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 8 chars)"
            className="px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
          />
        </div>
        <button type="submit" className="px-5 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold">
          Update Password
        </button>
      </form>

      {/* Active Sessions */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
        <h2 className="font-bold text-lg text-[#071426] dark:text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#258BFF]" /> Active Sessions
        </h2>
        {sessions.map((s) => (
          <div
            key={s.id}
            className="p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
          >
            <div>
              <p className="font-semibold truncate max-w-md">{s.userAgent}</p>
              <p className="text-[#8793A5]">
                IP: {s.ipAddress} · Expires: {new Date(s.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await apiFetch(`/api/user/sessions/${s.id}`, { method: 'DELETE' });
                loadSessions();
              }}
              className="text-rose-500 hover:underline"
            >
              Revoke
            </button>
          </div>
        ))}
      </div>

      {/* AI Processing Transparency */}
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2">
        <h2 className="font-bold text-lg text-[#071426] dark:text-white">
          AI Processing &amp; Source Verification Transparency
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {aiDisclosure?.disclosure ||
            '2MR Unified AI Intelligence routes research questions through authorized server-side APIs and verifies claims against external primary sources.'}
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-[#8793A5]">
          <span>
            Active engines:{' '}
            {aiDisclosure?.providers
              .filter((p) => p.enabled)
              .map((p) => p.name)
              .join(' · ') || '2MR Retrieval Index'}
          </span>
          <Link to="/dashboard/settings/privacy" className="text-[#258BFF] hover:underline font-semibold inline-flex items-center gap-1">
            <Cookie className="w-3.5 h-3.5" /> Manage Privacy &amp; Cookie Settings
          </Link>
          <Link to="/privacy" className="text-[#258BFF] hover:underline font-semibold">
            Read Full Privacy Policy
          </Link>
        </div>
      </div>

      {/* Danger Zone */}
      {user.role !== 'admin' && (
        <div className="p-6 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-[#10243D] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-rose-600 dark:text-rose-400">Delete Account</h2>
            <p className="text-xs text-[#8793A5]">Permanently erase your profile, library, and projects.</p>
          </div>
          {confirmDeleteOpen ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Confirm Permanent Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete My Account
            </button>
          )}
        </div>
      )}
    </div>
  );
};
