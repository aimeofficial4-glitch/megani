import React from 'react';
import { Link } from 'react-router-dom';
import { Search, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-5">
      <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#258BFF] dark:text-[#B7F34A]">
        Error 404
      </span>
      <h1 className="text-4xl font-extrabold text-[#071426] dark:text-white">Page Not Found</h1>
      <p className="text-sm text-slate-600 dark:text-[#8793A5]">
        The research workspace or route you requested does not exist or may have moved.
      </p>
      <div className="flex justify-center gap-3 pt-2">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold"
        >
          <Home className="w-4 h-4" /> Back Home
        </Link>
        <Link
          to="/search"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold"
        >
          <Search className="w-4 h-4" /> Search 2MR
        </Link>
      </div>
    </div>
  );
};
