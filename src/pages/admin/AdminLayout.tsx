import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Shield,
  Users,
  KeyRound,
  Cpu,
  BarChart3,
  Gauge,
  FileText,
  Video,
  Megaphone,
  Building2,
  Target,
  CreditCard,
  Award,
  MessageSquare,
  FolderTree,
  Bell,
  LineChart,
  Lock,
  ScrollText,
  Settings,
  Youtube,
  LayoutDashboard,
  Database,
  Cookie,
  Wallet,
  Smartphone,
  BookMarked,
} from 'lucide-react';

const ADMIN_GROUPS = [
  {
    group: 'Core & Access',
    items: [
      { label: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
      { label: 'Users', to: '/admin/users', icon: Users },
      { label: 'Roles & Permissions', to: '/admin/roles', icon: KeyRound },
    ],
  },
  {
    group: 'Unified AI',
    items: [
      { label: 'AI Providers', to: '/admin/ai-providers', icon: Cpu },
      { label: 'AI Performance', to: '/admin/ai-performance', icon: Gauge },
      { label: 'AI Usage & Costs', to: '/admin/ai-usage', icon: BarChart3 },
    ],
  },
  {
    group: 'Content & Discovery',
    items: [
      { label: 'Research Content', to: '/admin/content', icon: FileText },
      { label: 'Video Management', to: '/admin/videos', icon: Video },
      { label: 'Categories', to: '/admin/categories', icon: FolderTree },
      { label: 'Brand Knowledge', to: '/admin/brand-knowledge', icon: BookMarked },
    ],
  },
  {
    group: '2MR Ads',
    items: [
      { label: 'Advertisements', to: '/admin/advertisements', icon: Megaphone },
      { label: 'Advertisers', to: '/admin/advertisers', icon: Building2 },
      { label: 'Campaigns', to: '/admin/campaigns', icon: Target },
    ],
  },
  {
    group: 'Commerce & Community',
    items: [
      { label: 'Payments', to: '/admin/payments', icon: CreditCard },
      { label: 'MoMo Integration', to: '/admin/momo/integration', icon: Smartphone },
      { label: 'MoMo Balance', to: '/admin/momo/balance', icon: Wallet },
      { label: 'Subscriptions', to: '/admin/subscriptions', icon: Award },
      { label: 'Feedback', to: '/admin/feedback', icon: MessageSquare },
      { label: 'Notifications', to: '/admin/notifications', icon: Bell },
      { label: 'Reports & Analytics', to: '/admin/reports', icon: LineChart },
      { label: 'Demo Data (500K)', to: '/admin/demo-data', icon: Database },
    ],
  },
  {
    group: 'Security & Settings',
    items: [
      { label: 'Security Center', to: '/admin/settings/security', icon: Lock },
      { label: 'Privacy & Consent', to: '/admin/privacy/consent', icon: Cookie },
      { label: 'Audit Logs', to: '/admin/audit-logs', icon: ScrollText },
      { label: 'System Settings', to: '/admin/settings/system', icon: Settings },
      { label: 'Social Media', to: '/admin/settings/social-media', icon: Youtube },
    ],
  },
];

export const AdminLayout: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar Covering All 19 Admin Sections */}
        <aside className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] p-4 space-y-4 lg:sticky lg:top-20">
          <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
              <Shield className="w-4 h-4" /> 2MR Admin Console
            </div>
            <p className="text-[11px] text-[#8793A5] mt-0.5">Authorized Governance &amp; Operations</p>
          </div>

          <nav className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {ADMIN_GROUPS.map((grp) => (
              <div key={grp.group} className="space-y-1">
                <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#8793A5]">{grp.group}</p>
                {grp.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                          isActive
                            ? 'bg-[#258BFF] text-white'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071426] hover:text-[#071426] dark:hover:text-white'
                        }`
                      }
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Admin Content Viewport */}
        <div className="lg:col-span-9 space-y-6 min-w-0">
          <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#071426] dark:text-white">{title}</h1>
            <p className="text-xs text-[#8793A5] mt-1">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};
