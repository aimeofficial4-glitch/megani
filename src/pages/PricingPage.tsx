import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Sparkles, ShieldCheck, HelpCircle } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';

interface PlanRow {
  slug: string;
  name: string;
  description: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  monthlyPriceRwf: number;
  annualPriceRwf: number;
  features: string[];
}

export const PricingPage: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [plans, setPlans] = useState<PlanRow[]>([]);

  useEffect(() => {
    apiFetch<{ plans: PlanRow[] }>('/api/plans')
      .then((res) => setPlans(res.plans || []))
      .catch(() => {});
  }, []);

  const freePlan = plans.find((p) => p.slug === 'free');
  const premiumPlan = plans.find((p) => p.slug === 'premium');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-12">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <span className="text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
          Transparent Plans
        </span>
        <h1 className="text-4xl font-extrabold text-[#071426] dark:text-white">
          Free Explorer or Ad-Free 2MR Premium
        </h1>
        <p className="text-sm text-slate-600 dark:text-[#8793A5]">
          Start researching immediately on our Free plan, or upgrade for an ad-free workstation, expanded AI limits, and full report exports.
        </p>

        {/* Billing Toggle */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]">
          <button
            type="button"
            onClick={() => setBilling('monthly')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              billing === 'monthly'
                ? 'bg-[#258BFF] text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling('annual')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              billing === 'annual'
                ? 'bg-[#258BFF] text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Annual (Save 17%)
          </button>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Free Card */}
        <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-[#071426] dark:text-white">
                {freePlan?.name || 'Free Explorer'}
              </h2>
              <span className="text-3xl font-extrabold text-[#071426] dark:text-white tabular-nums">$0</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-[#8793A5]">
              {freePlan?.description ||
                'Essential global search, foundational research tools, and personal library.'}
            </p>
            <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-200 pt-2">
              {(
                freePlan?.features || [
                  'Global multi-source search across permitted indexes',
                  '50 AI Ask & Research Intelligence queries / month',
                  'Personal My Knowledge library (1 GB)',
                  'Supported by clearly labelled 2MR Ads',
                ]
              ).map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#258BFF] shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <Link
            to={user ? '/dashboard' : '/register'}
            className="w-full text-center py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold hover:border-[#258BFF] transition"
          >
            {user ? 'Current Free Features' : 'Create Free Account'}
          </Link>
        </div>

        {/* Premium Card */}
        <div className="p-8 rounded-2xl border-2 border-[#258BFF] dark:border-[#B7F34A] bg-white dark:bg-[#10243D] flex flex-col justify-between gap-6 shadow-lg">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#258BFF] dark:text-[#B7F34A]" />
                <h2 className="text-2xl font-bold text-[#071426] dark:text-white">
                  {premiumPlan?.name || '2MR Premium'}
                </h2>
              </div>
              <div className="text-right">
                <div className="text-2xl font-extrabold text-[#258BFF] dark:text-[#B7F34A] tabular-nums">
                  {billing === 'annual'
                    ? `${(premiumPlan?.annualPriceRwf || 250000).toLocaleString()} RWF`
                    : `${(premiumPlan?.monthlyPriceRwf || 25000).toLocaleString()} RWF`}
                </div>
                <div className="text-xs text-[#8793A5] tabular-nums">
                  (${billing === 'annual' ? premiumPlan?.annualPriceUsd || 190 : premiumPlan?.monthlyPriceUsd || 19}{' '}
                  / {billing === 'annual' ? 'year' : 'month'})
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-[#8793A5]">
              {premiumPlan?.description ||
                'Complete research workstation with expanded AI limits, exports, and zero ads.'}
            </p>
            <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-200 pt-2">
              {(
                premiumPlan?.features || [
                  '100% ad-free experience across every page and video',
                  '5,000 AI Ask & Research Intelligence queries / month',
                  'Full Research Builder PDF & DOCX report exports',
                  'Enhanced Video Intelligence transcript search & notes',
                  'Unlimited Knowledge Maps & 50 GB storage',
                ]
              ).map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#B7F34A] shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/checkout?cycle=${billing}`)}
            className="w-full py-3 rounded-xl bg-[#B7F34A] text-[#071426] text-sm font-bold hover:brightness-95 transition"
          >
            {user?.role === 'premium' ? 'Manage Premium Subscription' : 'Upgrade with MTN MoMo or Card'}
          </button>
        </div>
      </div>

      {/* Security & Payment FAQ */}
      <section className="p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#258BFF]" />
          <h2 className="text-lg font-bold text-[#071426] dark:text-white">Billing & Payment FAQ</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
          <div className="space-y-1">
            <h3 className="font-bold text-[#071426] dark:text-white">How does MTN Mobile Money Rwanda work?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Enter your MTN Rwanda number at checkout. 2MR sends a Request-to-Pay prompt to your phone via MTN&apos;s official Collection API. You confirm directly on your handset—2MR never asks for your PIN.
            </p>
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-[#071426] dark:text-white">When is Premium activated?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Subscriptions activate automatically once the payment provider confirms successful settlement on our backend server.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#8793A5] pt-2 border-t border-slate-100 dark:border-slate-800">
          <ShieldCheck className="w-4 h-4 text-[#B7F34A]" />
          <span>Need institutional licensing? Contact 2mr@proton.me or call 0780558358.</span>
        </div>
      </section>
    </div>
  );
};
