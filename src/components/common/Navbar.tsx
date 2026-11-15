import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Search,
  Sun,
  Moon,
  Bell,
  Menu,
  X,
  User,
  LogOut,
  Settings,
  LayoutDashboard,
  Shield,
  CreditCard,
  ChevronDown,
  MessageSquarePlus,
  NotebookPen,
  Cookie,
  Video,
  Upload,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { YouTubeBadgeLink } from './YouTubeBadgeLink';

const PRIMARY_NAV = [
  { label: 'Home', to: '/' },
  { label: 'Explore', to: '/explore' },
  { label: 'Research', to: '/research' },
  { label: 'Ask 2MR', to: '/ask' },
  { label: 'Builder', to: '/research-builder' },
  { label: 'Videos', to: '/videos' },
  { label: 'Map', to: '/knowledge-map' },
  { label: 'Library', to: '/my-knowledge' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'About', to: '/about' },
];

export const Navbar: React.FC = () => {
  const { user, theme, toggleTheme, unreadCount, logout, setSearchModalOpen } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    setProfileOpen(false);
    setMobileOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <header className="no-print sticky top-0 z-40 h-16 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-[#071426]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="h-10 w-14 rounded-lg bg-[#071426] border border-slate-700/70 p-0.5 flex items-center justify-center overflow-hidden">
            <img
              src="/assets/aistudio/2MR_Global_Research_Badge_bf1478c8.png"
              alt="2MR To Master Research"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="leading-tight hidden sm:block">
            <span className="font-extrabold text-base tracking-tight text-[#071426] dark:text-white">
              2MR
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
              To Master Research
            </span>
          </div>
        </Link>

        {/* Desktop Primary Navigation */}
        <nav className="hidden xl:flex items-center gap-1">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `px-2.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[#258BFF]/12 text-[#258BFF] dark:bg-[#B7F34A]/15 dark:text-[#B7F34A] font-semibold'
                    : 'text-slate-600 hover:text-[#071426] hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-[#10243D]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Global Search Shortcut */}
          <button
            type="button"
            onClick={() => setSearchModalOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#10243D] text-slate-500 dark:text-slate-300 hover:border-[#258BFF] text-xs transition-colors"
            title="Global Search (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5 text-[#258BFF]" />
            <span className="hidden md:inline">Search</span>
            <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] rounded bg-white dark:bg-[#071426] border border-slate-200 dark:border-slate-700 font-mono">
              Ctrl K
            </kbd>
          </button>

          {/* Official 2MR YouTube Channel */}
          <YouTubeBadgeLink variant="compact" />

          {/* Theme Switcher */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#10243D] text-slate-600 dark:text-slate-200 hover:border-[#258BFF] transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-[#B7F34A]" /> : <Moon className="w-4 h-4 text-[#071426]" />}
          </button>

          {/* Notifications */}
          {user && (
            <Link
              to="/notifications"
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#10243D] text-slate-600 dark:text-slate-200 hover:border-[#258BFF] transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#258BFF] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          )}

          {/* Auth / Profile Menu */}
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#10243D] hover:border-[#258BFF] transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-[#258BFF]/20 text-[#258BFF] dark:text-[#B7F34A] flex items-center justify-center text-xs font-bold overflow-hidden">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.fullName} className="w-full h-full object-cover" />
                  ) : (
                    user.fullName.charAt(0).toUpperCase()
                  )}
                </div>
                <span className="hidden md:inline text-xs font-semibold text-[#071426] dark:text-white max-w-[110px] truncate">
                  {user.fullName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 mt-2 w-60 z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] shadow-xl py-2">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-sm font-semibold text-[#071426] dark:text-white truncate">{user.fullName}</p>
                      <p className="text-xs text-[#8793A5] truncate">{user.email}</p>
                      <span className="inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#258BFF]/15 text-[#258BFF] dark:bg-[#B7F34A]/15 dark:text-[#B7F34A]">
                        {user.role} tier
                      </span>
                    </div>

                    <Link
                      to="/dashboard"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#071426]/60"
                    >
                      <LayoutDashboard className="w-4 h-4 text-[#258BFF]" />
                      User Dashboard
                    </Link>
                    <Link
                      to="/dashboard/profile"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#071426]/60"
                    >
                      <User className="w-4 h-4 text-[#258BFF]" />
                      Profile
                    </Link>
                    <Link
                      to="/dashboard/subscription"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#071426]/60"
                    >
                      <CreditCard className="w-4 h-4 text-[#258BFF]" />
                      Subscription & Billing
                    </Link>
                    <Link
                      to="/dashboard/my-videos"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#071426]/60"
                    >
                      <Video className="w-4 h-4 text-[#258BFF]" />
                      My Videos
                    </Link>
                    <Link
                      to="/videos/upload"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#071426]/60"
                    >
                      <Upload className="w-4 h-4 text-[#258BFF]" />
                      Upload Video
                    </Link>
                    <Link
                      to="/my-knowledge/notes"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#071426]/60"
                    >
                      <NotebookPen className="w-4 h-4 text-[#258BFF]" />
                      Notes &amp; Docs
                    </Link>
                    <Link
                      to="/dashboard/settings"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#071426]/60"
                    >
                      <Settings className="w-4 h-4 text-[#258BFF]" />
                      Settings
                    </Link>
                    <Link
                      to="/dashboard/settings/privacy"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#071426]/60"
                    >
                      <Cookie className="w-4 h-4 text-[#258BFF]" />
                      Privacy &amp; Cookies
                    </Link>
                    <Link
                      to="/feedback"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#071426]/60"
                    >
                      <MessageSquarePlus className="w-4 h-4 text-[#258BFF]" />
                      Give Feedback
                    </Link>

                    {user.role === 'admin' && (
                      <Link
                        to="/admin"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm font-semibold text-[#258BFF] dark:text-[#B7F34A] border-t border-slate-100 dark:border-slate-800 mt-1 pt-2 hover:bg-slate-50 dark:hover:bg-[#071426]/60"
                      >
                        <Shield className="w-4 h-4" />
                        Admin Console
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-rose-600 dark:text-rose-400 border-t border-slate-100 dark:border-slate-800 mt-1 pt-2 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Link
                to="/login"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#10243D] whitespace-nowrap"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#B7F34A] text-[#071426] hover:brightness-95 whitespace-nowrap transition"
              >
                Register
              </Link>
            </div>
          )}

          {/* Mobile Drawer Trigger */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="xl:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-200"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="xl:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#071426] px-4 py-4 space-y-2 shadow-xl">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              setSearchModalOpen(true);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#10243D] text-sm text-slate-600 dark:text-slate-300"
          >
            <Search className="w-4 h-4 text-[#258BFF]" />
            Search global research...
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive
                      ? 'bg-[#258BFF]/15 text-[#258BFF] dark:bg-[#B7F34A]/15 dark:text-[#B7F34A] font-semibold'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#10243D]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          {!user && (
            <div className="pt-2 flex gap-2 border-t border-slate-100 dark:border-slate-800">
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="flex-1 text-center py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold"
              >
                Login
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileOpen(false)}
                className="flex-1 text-center py-2 rounded-lg bg-[#B7F34A] text-[#071426] text-sm font-bold"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
