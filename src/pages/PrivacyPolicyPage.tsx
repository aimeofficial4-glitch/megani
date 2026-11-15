import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../services/api';
import { useConsent } from '../context/ConsentContext';
import { useApp } from '../context/AppContext';

interface DisclosurePayload {
  disclosure: string;
  multiModelVerificationEnabled: boolean;
  providers: Array<{ name: string; enabled: boolean; configured: boolean }>;
}

export const PrivacyPolicyPage: React.FC = () => {
  const [aiDisclosure, setAiDisclosure] = useState<DisclosurePayload | null>(null);
  const { openCustomizeModal, policyVersion } = useConsent();
  const { user } = useApp();

  useEffect(() => {
    apiFetch<DisclosurePayload>('/api/ai/disclosure')
      .then(setAiDisclosure)
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">Privacy Policy</h1>
          <p className="text-xs text-[#8793A5]">
            Policy Version {policyVersion} · Last updated: 2026 · 2MR – To Master Research
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCustomizeModal}
            className="px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold hover:brightness-110"
          >
            Cookie Settings
          </button>
          {user && (
            <Link
              to="/dashboard/settings/privacy"
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs font-semibold hover:border-[#258BFF]"
            >
              My Privacy Settings
            </Link>
          )}
        </div>
      </div>

      <div className="p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <section className="space-y-1.5">
          <h2 className="font-bold text-base text-[#071426] dark:text-white">1. Data We Collect</h2>
          <p>
            2MR collects account registration details (name, email, optional organization), personal research projects, saved library items, notes, search queries, and feedback submissions solely to provide and improve your research workspace.
          </p>
        </section>
        <section className="space-y-1.5">
          <h2 className="font-bold text-base text-[#071426] dark:text-white">
            2. AI Processing &amp; External Research Providers
          </h2>
          <p>
            {aiDisclosure?.disclosure ||
              '2MR Unified AI Intelligence processes research inquiries through authorized server-side developer APIs and cross-checks claims against external primary sources (CrossRef, OpenAlex, arXiv, Wikipedia, and verified standards).'}
          </p>
          <p className="text-xs text-[#8793A5]">
            Note: Disabling optional cookies does not disable core server-side AI processing strictly required to answer questions or analyze documents you explicitly submit.
          </p>
          {aiDisclosure && aiDisclosure.providers.length > 0 && (
            <p className="text-xs text-[#8793A5]">
              Registered orchestration providers:{' '}
              {aiDisclosure.providers
                .filter((p) => p.enabled)
                .map((p) => p.name)
                .join(', ') || 'Retrieval-grounded fallback'}
              . Multi-model cross-checking:{' '}
              {aiDisclosure.multiModelVerificationEnabled ? 'Enabled for deep synthesis' : 'Disabled'}.
            </p>
          )}
        </section>
        <section className="space-y-1.5">
          <h2 className="font-bold text-base text-[#071426] dark:text-white">3. Cookie Categories &amp; Consent</h2>
          <p>
            We separate cookies into four clear categories: Strictly Necessary (always active for authentication, sessions, and security), Analytics Cookies (optional), Personalization Cookies (optional), and Advertising Cookies (optional). Optional analytics, personalization, and advertising trackers are never activated before your consent. You can update or withdraw optional consent anytime via Cookie Settings.
          </p>
        </section>
        <section className="space-y-1.5">
          <h2 className="font-bold text-base text-[#071426] dark:text-white">4. Payment &amp; Financial Security</h2>
          <p>
            2MR never collects, asks for, or stores MTN Mobile Money PIN codes, OTPs, or raw credit card CVV numbers. Mobile numbers used during checkout are masked in transaction logs and processed directly through official provider APIs.
          </p>
        </section>
        <section className="space-y-1.5">
          <h2 className="font-bold text-base text-[#071426] dark:text-white">5. Advertising &amp; Plan Separation</h2>
          <p>
            Free accounts display clearly labelled 2MR Ads only when advertising cookies are consented. Premium subscribers enjoy an ad-free environment without ad targeting trackers. Third-party embedded video players never have 2MR ads injected into them.
          </p>
        </section>
        <section className="space-y-1.5">
          <h2 className="font-bold text-base text-[#071426] dark:text-white">6. Account Rights &amp; Contact</h2>
          <p>
            You may download a complete JSON copy of your personal data, adjust AI &amp; search privacy preferences, or request account deletion directly from{' '}
            <Link to="/dashboard/settings/privacy" className="text-[#258BFF] underline">
              Privacy Settings
            </Link>
            , or contact our team at{' '}
            <a href="mailto:2mr@proton.me" className="text-[#258BFF] underline">
              2mr@proton.me
            </a>{' '}
            or 0780558358.
          </p>
        </section>
      </div>
    </div>
  );
};
