import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Shield, Lock, KeyRound, Loader2, CheckCircle2 } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from '../../lib/firebase';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser, addToast } = useApp();

  const redirect = searchParams.get('redirect') || '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2fa, setRequires2fa] = useState(false);

  // Forced initial password change state
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch<{
        requires2fa?: boolean;
        mustChangePassword?: boolean;
        message?: string;
        user?: any;
      }>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          totpCode: requires2fa ? totpCode.trim() : undefined,
        }),
      });

      if (res.requires2fa) {
        setRequires2fa(true);
        addToast(res.message || 'Enter your 6-digit authenticator code.', 'info');
        return;
      }

      await refreshUser();
      if (res.mustChangePassword) {
        setMustChangePassword(true);
        addToast('Initial password change required before continuing.', 'warning');
        return;
      }

      addToast('Administrator session authenticated.', 'success');
      navigate(redirect);
    } catch (err: any) {
      addToast(err.message || 'Administrator sign-in failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      await apiFetch('/api/admin/auth/google', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await refreshUser();
      addToast('Authorized Google administrator verified.', 'success');
      navigate(redirect);
    } catch (err: any) {
      addToast(err.message || 'Google administrator verification failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRotatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 10) {
      addToast('New administrator password must be at least 10 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('Passwords do not match.', 'error');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/api/admin/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
      addToast('Administrator Argon2id password updated.', 'success');
      navigate(redirect);
    } catch (err: any) {
      addToast(err.message || 'Failed to rotate password.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-[#071426] border border-slate-700 mx-auto flex items-center justify-center">
            <Shield className="w-7 h-7 text-[#B7F34A]" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#071426] dark:text-white">
            2MR Administrator Portal
          </h1>
          <p className="text-xs text-[#8793A5]">
            Restricted access for authorized 2MR administrators. All login attempts and security events are audited.
          </p>
        </div>

        {mustChangePassword ? (
          <form onSubmit={handleRotatePassword} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-[#071426] border border-amber-300 dark:border-amber-800 text-xs text-slate-700 dark:text-slate-200">
              Your account signed in using the bootstrap administrator password. Set a new strong Argon2id password (minimum 10 characters) to continue.
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                New Administrator Password
              </label>
              <input
                type="password"
                required
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                minLength={10}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-sm font-bold inline-flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Update Password &amp; Enter Console
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={handleGoogleAdminLogin}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] text-sm font-semibold hover:border-[#258BFF] transition flex items-center justify-center gap-2"
            >
              Continue with Authorized Google Account
            </button>

            <div className="relative flex items-center justify-center text-xs text-[#8793A5]">
              <span className="border-t border-slate-200 dark:border-slate-800 w-full" />
              <span className="px-3 bg-white dark:bg-[#10243D] shrink-0">or Argon2id credentials</span>
              <span className="border-t border-slate-200 dark:border-slate-800 w-full" />
            </div>

            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Administrator Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="2mr@proton.me"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Administrator password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                />
              </div>

              {requires2fa && (
                <div>
                  <label className="block text-xs font-semibold text-[#258BFF] dark:text-[#B7F34A] mb-1">
                    Two-Factor Authenticator Code (6 digits)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="123456"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#258BFF] bg-[#F5F7FA] dark:bg-[#071426] text-sm font-mono tracking-widest"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold hover:brightness-110 inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : requires2fa ? <KeyRound className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {requires2fa ? 'Verify 2FA & Sign In' : 'Sign In to Admin Console'}
              </button>
            </form>
          </>
        )}

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-[#8793A5]">
          <Link to="/" className="text-[#258BFF] hover:underline">
            ← Return to 2MR Platform
          </Link>
        </div>
      </div>
    </div>
  );
};
