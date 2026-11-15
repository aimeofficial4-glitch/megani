import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Bookmark,
  FileText,
  Search,
  MessageSquare,
  Sparkles,
  Settings,
  User,
  CreditCard,
  NotebookPen,
  ShieldCheck,
  Video,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';

export const UserDashboardPage: React.FC = () => {
  const { user } = useApp();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiFetch('/api/user/dashboard')
      .then((res) => setData(res))
      .catch(() => {});
  }, []);

  if (!user) return null;

  const stats = data?.stats || { savedCount: 0, projectsCount: 0, searchesCount: 0, conversationsCount: 0 };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
            <LayoutDashboard className="w-4 h-4" /> Personal Workspace
          </div>
          <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">
            Welcome back, {user.fullName}
          </h1>
          <p className="text-xs text-[#8793A5]">
            Plan Tier: <strong className="uppercase text-[#258BFF] dark:text-[#B7F34A]">{user.role}</strong> · AI
            Queries Used: <span className="tabular-nums">{user.aiQueriesUsed} / {user.aiQueriesLimit}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Link to="/videos/upload" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#B7F34A] text-[#071426] font-bold">
            <Upload className="w-3.5 h-3.5" /> Upload Video
          </Link>
          <Link to="/dashboard/my-videos" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] font-semibold">
            <Video className="w-3.5 h-3.5 text-[#258BFF]" /> My Videos
          </Link>
          <Link to="/my-knowledge/notes" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] font-semibold">
            <NotebookPen className="w-3.5 h-3.5 text-[#258BFF]" /> Notes &amp; Docs
          </Link>
          <Link to="/dashboard/profile" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] font-semibold">
            <User className="w-3.5 h-3.5" /> Profile
          </Link>
          <Link to="/dashboard/subscription" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] font-semibold">
            <CreditCard className="w-3.5 h-3.5" /> Subscription
          </Link>
          <Link to="/dashboard/settings" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] font-semibold">
            <Settings className="w-3.5 h-3.5" /> Settings
          </Link>
          <Link to="/dashboard/settings/privacy" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-[#258BFF]" /> Privacy
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Saved Items', value: stats.savedCount, icon: Bookmark, to: '/my-knowledge' },
          { label: 'Research Projects', value: stats.projectsCount, icon: FileText, to: '/research-builder' },
          { label: 'Recent Searches', value: stats.searchesCount, icon: Search, to: '/search' },
          { label: 'Ask Threads', value: stats.conversationsCount, icon: MessageSquare, to: '/ask' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.to}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#8793A5]">{card.label}</span>
                <Icon className="w-4 h-4 text-[#258BFF] dark:text-[#B7F34A]" />
              </div>
              <div className="text-3xl font-extrabold text-[#071426] dark:text-white tabular-nums">
                {card.value}
              </div>
            </Link>
          );
        })}
      </div>

      {user.role === 'free' && (
        <div className="p-6 rounded-2xl bg-[#071426] text-white border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#B7F34A]">
              <Sparkles className="w-4 h-4" /> 2MR Premium
            </div>
            <h2 className="text-lg font-bold">Unlock an ad-free workstation & 5,000 monthly AI queries</h2>
            <p className="text-xs text-[#8793A5]">Upgrade seamlessly with MTN Mobile Money Rwanda or Card.</p>
          </div>
          <Link
            to="/pricing"
            className="px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold shrink-0"
          >
            View Plans
          </Link>
        </div>
      )}

      {/* Recent Activity Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-[#071426] dark:text-white">Recent Research Projects</h2>
            <Link to="/research-builder" className="text-xs font-semibold text-[#258BFF] hover:underline">
              Open Builder
            </Link>
          </div>
          {(data?.recentProjects || []).length === 0 ? (
            <p className="text-xs text-[#8793A5]">No projects created yet.</p>
          ) : (
            data.recentProjects.map((p: any) => (
              <Link
                key={p.id}
                to="/research-builder"
                className="block p-3.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 hover:border-[#258BFF]"
              >
                <div className="font-bold text-sm text-[#071426] dark:text-white">{p.title}</div>
                <div className="text-xs text-[#8793A5]">{p.researchType} · {p.topic}</div>
              </Link>
            ))
          )}
        </section>

        <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-[#071426] dark:text-white">Recent Search History</h2>
            <Link to="/search" className="text-xs font-semibold text-[#258BFF] hover:underline">
              New Search
            </Link>
          </div>
          {(data?.recentSearches || []).length === 0 ? (
            <p className="text-xs text-[#8793A5]">No recent searches recorded.</p>
          ) : (
            data.recentSearches.map((s: any) => (
              <Link
                key={s.id}
                to={`/search?q=${encodeURIComponent(s.query)}&tab=${s.modality || 'all'}`}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 hover:border-[#258BFF] text-xs"
              >
                <span className="font-medium truncate">{s.query}</span>
                <span className="text-[#8793A5] tabular-nums shrink-0 ml-2">{s.resultsCount} results</span>
              </Link>
            ))
          )}
        </section>
      </div>
    </div>
  );
};
