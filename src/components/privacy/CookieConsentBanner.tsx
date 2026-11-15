import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useConsent } from '../../context/ConsentContext';
import { useApp } from '../../context/AppContext';

export const CookieConsentBanner: React.FC = () => {
  const { showBanner, acceptAll, rejectOptional, openCustomizeModal } = useConsent();
  const { user } = useApp();

  if (!showBanner) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="no-print fixed inset-x-0 bottom-0 z-50 p-3 sm:p-5 pointer-events-none"
    >
      <div className="max-w-5xl mx-auto pointer-events-auto rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] shadow-2xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
              <ShieldCheck className="w-4 h-4" />
              <span>2MR Privacy &amp; Cookies</span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#071426] dark:text-white">
              Your Privacy Matters
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              2MR uses cookies and similar technologies to operate the platform, improve performance, understand usage, and support advertising where applicable. Optional analytics, personalization, and advertising cookies remain off until you choose to enable them.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-[#8793A5]">
              <Link to="/privacy" className="text-[#258BFF] hover:underline font-medium">
                Privacy Policy
              </Link>
              {user && (
                <Link to="/dashboard/settings/privacy" className="text-[#258BFF] hover:underline font-medium">
                  Privacy Settings
                </Link>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={rejectOptional}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#071426] text-[#071426] dark:text-white text-xs font-bold hover:border-[#258BFF] transition whitespace-nowrap"
            >
              Reject Optional Cookies
            </button>
            <button
              type="button"
              onClick={openCustomizeModal}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-[#071426] text-[#071426] dark:text-white text-xs font-bold hover:border-[#258BFF] transition whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Customize Settings
            </button>
            <button
              type="button"
              onClick={acceptAll}
              className="px-5 py-2.5 rounded-xl bg-[#258BFF] text-white text-xs font-bold hover:brightness-110 transition whitespace-nowrap"
            >
              Accept All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
