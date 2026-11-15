import React from 'react';

export const TermsOfServicePage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">Terms of Service</h1>
        <p className="text-xs text-[#8793A5]">Effective: 2026 · 2MR – To Master Research (Founder & CEO: Gihozo Aime)</p>
      </div>
      <div className="p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <section className="space-y-1.5">
          <h2 className="font-bold text-base text-[#071426] dark:text-white">1. Platform Purpose & Permitted Use</h2>
          <p>
            2MR provides search aggregation, research analysis, educational video indexing, and knowledge management tools. Users must verify primary academic sources before relying on synthesized summaries in critical clinical, legal, or engineering decisions.
          </p>
        </section>
        <section className="space-y-1.5">
          <h2 className="font-bold text-base text-[#071426] dark:text-white">2. Accounts & Security</h2>
          <p>
            You are responsible for safeguarding your account credentials. Unauthorized attempts to bypass role-based access controls, scrape private accounts, or abuse API rate limits are prohibited.
          </p>
        </section>
        <section className="space-y-1.5">
          <h2 className="font-bold text-base text-[#071426] dark:text-white">3. Subscriptions & Billing</h2>
          <p>
            2MR Premium unlocks ad-free access and expanded quotas upon verified payment confirmation via MTN Mobile Money or supported card gateways. Subscriptions may be cancelled at any time from your Subscription settings.
          </p>
        </section>
        <section className="space-y-1.5">
          <h2 className="font-bold text-base text-[#071426] dark:text-white">4. Official Contact</h2>
          <p>
            Questions regarding these terms may be sent to 2mr@proton.me or 0780558358.
          </p>
        </section>
      </div>
    </div>
  );
};
