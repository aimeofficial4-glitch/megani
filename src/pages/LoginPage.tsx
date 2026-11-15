import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const LoginPage: React.FC = () => {
  const { loginWithEmail, loginWithGoogle, addToast } = useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const redirect = searchParams.get('redirect') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await loginWithEmail(email, password);
      addToast(`Welcome back, ${user.fullName}.`, 'success');
      navigate(user.role === 'admin' && redirect === '/dashboard' ? '/admin' : redirect);
    } catch (err: any) {
      addToast(err.message || 'Sign in failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      addToast(`Signed in as ${user.fullName}.`, 'success');
      navigate(user.role === 'admin' && redirect === '/dashboard' ? '/admin' : redirect);
    } catch (err: any) {
      addToast(err.message || 'Google sign-in cancelled or failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-6">
        <div className="text-center space-y-2">
          <img
            src="/assets/aistudio/2MR_Global_Research_Badge_bf1478c8.png"
            alt="2MR Logo"
            className="h-14 w-20 object-contain mx-auto rounded-lg bg-[#071426] p-1"
          />
          <h1 className="text-2xl font-extrabold text-[#071426] dark:text-white">Sign in to 2MR</h1>
          <p className="text-xs text-[#8793A5]">Access your research library, projects, and saved history.</p>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] text-sm font-semibold hover:border-[#258BFF] transition flex items-center justify-center gap-2"
        >
          Continue with Google
        </button>

        <div className="relative flex items-center justify-center text-xs text-[#8793A5]">
          <span className="border-t border-slate-200 dark:border-slate-800 w-full" />
          <span className="px-3 bg-white dark:bg-[#10243D] shrink-0">or with email</span>
          <span className="border-t border-slate-200 dark:border-slate-800 w-full" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="researcher@example.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Password</label>
              <Link to="/forgot-password" className="text-xs text-[#258BFF] hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold hover:brightness-110 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            Sign In
          </button>
        </form>

        <p className="text-center text-xs text-[#8793A5]">
          New to 2MR?{' '}
          <Link to="/register" className="font-semibold text-[#258BFF] hover:underline">
            Create a free account
          </Link>
        </p>
      </div>
    </div>
  );
};
