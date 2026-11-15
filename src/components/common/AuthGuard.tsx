import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, authLoading } = useApp();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#258BFF]" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  return <>{children}</>;
};

export const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, authLoading } = useApp();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#258BFF]" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/admin/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  if (user.role !== 'admin') {
    return (
      <div className="max-w-lg mx-auto my-20 p-8 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-[#10243D] text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
        <h1 className="text-xl font-bold text-[#071426] dark:text-white">Administrator Access Required</h1>
        <p className="text-sm text-slate-600 dark:text-[#8793A5]">
          This route is restricted to authorized 2MR administrators. Public accounts cannot access admin operations.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="inline-block px-5 py-2.5 rounded-lg bg-[#258BFF] text-white text-sm font-semibold"
          >
            Return to Dashboard
          </Link>
          <Link
            to="/admin/login"
            className="inline-block px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold"
          >
            Admin Sign In
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
