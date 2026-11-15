import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Lock, BarChart3, Sliders, Megaphone, RotateCcw } from 'lucide-react';
import { useConsent } from '../../context/ConsentContext';
import { useApp } from '../../context/AppContext';

export const CookieCustomizeModal: React.FC = () => {
  const {
    consent,
    policyVersion,
    customizeOpen,
    closeCustomizeModal,
    acceptAll,
    rejectOptional,
    saveCustomPreferences,
    withdrawConsent,
  } = useConsent();
  const { user } = useApp();

  // Strictly never preselect optional switches when no prior consent exists
  const [analytics, setAnalytics] = useState(false);
  const [personalization, setPersonalization] = useState(false);
  const [advertising, setAdvertising] = useState(false);

  useEffect(() => {
    if (customizeOpen) {
      setAnalytics(Boolean(consent?.analytics));
      setPersonalization(Boolean(consent?.personalization));
      setAdvertising(Boolean(consent?.advertising));
    }
  }, [customizeOpen, consent]);

  if (!customizeOpen) return null;

  const categories = [
    {
      key: 'necessary',
      title: 'Strictly Necessary',
      description:
        'Required for authentication, security, sessions, consent recording, and essential platform functionality. Always active and cannot be disabled.',
      icon: Lock,
      checked: true,
      locked: true,
      onChange: undefined,
    },
    {
      key: 'analytics',
      title: 'Analytics Cookies',
      description:
        'Used to understand platform usage, performance, search demand, and user interactions so we can improve reliability.',
      icon: BarChart3,
      checked: analytics,
      locked: false,
      onChange: setAnalytics,
    },
    {
      key: 'personalization',
      title: 'Personalization Cookies',
      description:
        'Used to remember preferences such as language, theme, and workspace settings across visits.',
      icon: Sliders,
      checked: personalization,
      locked: false,
      onChange: setPersonalization,
    },
    {
      key: 'advertising',
      title: 'Advertising Cookies',
      description:
        'Used for permitted advertising measurement and personalization for guest and free-tier discovery placements.',
      icon: Megaphone,
      checked: advertising,
      locked: false,
      onChange: setAdvertising,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-customize-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 sticky top-0 bg-white dark:bg-[#10243D] z-10">
          <div>
            <h2 id="cookie-customize-title" className="text-lg font-extrabold text-[#071426] dark:text-white">
              Customize Cookie Settings
            </h2>
            <p className="text-xs text-[#8793A5] mt-0.5">
              Policy Version {policyVersion} · Optional switches are never preselected without your choice.
            </p>
          </div>
          <button
            type="button"
            onClick={closeCustomizeModal}
            aria-label="Close cookie preferences"
            className="p-1.5 rounded-lg text-[#8793A5] hover:text-[#071426] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#071426]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Categories */}
        <div className="p-6 space-y-3">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.key}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-[#258BFF] dark:text-[#B7F34A]" />
                    <span className="text-sm font-bold text-[#071426] dark:text-white">{cat.title}</span>
                    {cat.locked && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-[#B7F34A]">
                        Always Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{cat.description}</p>
                </div>

                <div className="pt-1 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={cat.checked}
                    aria-label={cat.title}
                    disabled={cat.locked}
                    onClick={() => cat.onChange && cat.onChange(!cat.checked)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      cat.checked
                        ? 'bg-[#258BFF] dark:bg-[#B7F34A]'
                        : 'bg-slate-300 dark:bg-slate-700'
                    } ${cat.locked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-[#071426] transition-transform ${
                        cat.checked ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}

          {consent && (
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-[#8793A5] flex flex-wrap items-center justify-between gap-2">
              <span>
                Consent ID: <span className="font-mono">{consent.id || 'Browser Cookie'}</span> · Status:{' '}
                <strong className="uppercase">{consent.action.replace('_', ' ')}</strong>
              </span>
              {consent.action !== 'withdrawn' && (
                <button
                  type="button"
                  onClick={withdrawConsent}
                  className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold hover:underline"
                >
                  <RotateCcw className="w-3 h-3" /> Withdraw Optional Consent
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <Link to="/privacy" onClick={closeCustomizeModal} className="text-[#258BFF] hover:underline font-medium">
              Privacy Policy
            </Link>
            {user && (
              <Link
                to="/dashboard/settings/privacy"
                onClick={closeCustomizeModal}
                className="text-[#258BFF] hover:underline font-medium"
              >
                Privacy Settings
              </Link>
            )}
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={rejectOptional}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold text-[#071426] dark:text-white hover:border-[#258BFF]"
            >
              Reject Optional Cookies
            </button>
            <button
              type="button"
              onClick={() => saveCustomPreferences({ analytics, personalization, advertising })}
              className="px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold hover:brightness-95"
            >
              Save My Preferences
            </button>
            <button
              type="button"
              onClick={acceptAll}
              className="px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-bold hover:brightness-110"
            >
              Accept All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
