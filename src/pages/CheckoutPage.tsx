import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Smartphone,
  CreditCard,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  AlertTriangle,
  Lock,
  Phone,
  Mail,
  UserCheck,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';

interface PlanInfo {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  monthlyPriceRwf: number;
  annualPriceRwf: number;
  aiMonthlyLimit: number;
  storageLimitMb: number;
}

interface MomoSandboxConfigPublic {
  configured: boolean;
  sandboxMode: boolean;
  environment: string;
  targetEnvironment: string;
  baseUrl: string;
  missingVars: string[];
}

interface AccountValidationState {
  state: 'active' | 'inactive' | 'unverified';
  active: boolean | null;
  accountHolderIdType: string;
  maskedAccountHolderId: string;
  checkedAt: string;
  message: string;
  disclaimer?: string;
}

export const CheckoutPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user, addToast } = useApp();

  const initialCycle = searchParams.get('cycle') === 'annual' ? 'annual' : 'monthly';
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>(initialCycle);
  const [method, setMethod] = useState<'momo' | 'card'>('momo');
  const [phone, setPhone] = useState('');
  const [validationConsent, setValidationConsent] = useState(false);

  const [validating, setValidating] = useState(false);
  const [submittingCard, setSubmittingCard] = useState(false);

  const [premiumPlan, setPremiumPlan] = useState<PlanInfo | null>(null);
  const [momoSandboxConfig, setMomoSandboxConfig] = useState<MomoSandboxConfigPublic | null>(null);
  const [validationResult, setValidationResult] = useState<AccountValidationState | null>(null);

  useEffect(() => {
    apiFetch<{ plans: PlanInfo[]; momoSandboxConfig?: MomoSandboxConfigPublic }>('/api/plans')
      .then((res) => {
        const p = (res.plans || []).find((pl) => pl.slug === 'premium') || null;
        setPremiumPlan(p);
        setMomoSandboxConfig(res.momoSandboxConfig || null);
      })
      .catch(() => {});
  }, []);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-[#071426] dark:text-white">Sign in to Upgrade</h1>
        <p className="text-sm text-[#8793A5]">
          Please sign in or register an account to prepare your 2MR Premium subscription and validate your MTN MoMo account.
        </p>
        <Link
          to={`/login?redirect=${encodeURIComponent('/checkout')}`}
          className="inline-block px-6 py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold"
        >
          Sign In to Continue
        </Link>
      </div>
    );
  }

  const amountRwf =
    billingCycle === 'annual'
      ? premiumPlan?.annualPriceRwf ?? 250000
      : premiumPlan?.monthlyPriceRwf ?? 25000;
  const amountUsd =
    billingCycle === 'annual'
      ? premiumPlan?.annualPriceUsd ?? 190
      : premiumPlan?.monthlyPriceUsd ?? 19;

  const handleValidateAccountHolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validationConsent) {
      addToast('Please agree to the MTN account-holder validation consent first.', 'warning');
      return;
    }

    const digits = phone.replace(/\D/g, '');
    const normalized = digits.startsWith('07') && digits.length === 10 ? `250${digits.slice(1)}` : digits;
    if (!/^\d{10,15}$/.test(normalized)) {
      addToast('Enter a valid MTN MoMo phone number (e.g. 078XXXXXXX, 25078XXXXXXX, or Sandbox test MSISDN).', 'error');
      return;
    }

    setValidating(true);
    setValidationResult(null);
    try {
      const res = await apiFetch<AccountValidationState>(
        `/api/momo/accountholder/msisdn/${encodeURIComponent(normalized)}/active?consent=true`
      );
      setValidationResult(res);
      if (res.state === 'active') {
        addToast('MTN MoMo account holder validated as active (Sandbox).', 'success');
      } else if (res.state === 'inactive') {
        addToast('MTN MoMo account holder is inactive.', 'warning');
      } else {
        addToast('Could not verify account status with MTN Sandbox.', 'warning');
      }
    } catch (err: any) {
      setValidationResult({
        state: 'unverified',
        active: null,
        accountHolderIdType: 'msisdn',
        maskedAccountHolderId: phone,
        checkedAt: new Date().toISOString(),
        message: 'Could not verify account',
        disclaimer: err?.message || 'Unable to verify account status at this time.',
      });
      addToast(err?.message || 'Could not verify account.', 'error');
    } finally {
      setValidating(false);
    }
  };

  const handleCardAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingCard(true);
    try {
      await apiFetch('/api/payments/card/initiate', {
        method: 'POST',
        body: JSON.stringify({ planSlug: 'premium', billingCycle }),
      });
    } catch (err: any) {
      addToast(err.message || 'Card gateway setup required.', 'warning');
    } finally {
      setSubmittingCard(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Link to="/pricing" className="text-xs font-semibold text-[#258BFF] hover:underline">
            ← Back to Plans
          </Link>
          <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">2MR Premium Checkout</h1>
          <p className="text-sm text-slate-600 dark:text-[#8793A5]">
            Validate your MTN Mobile Money account status before upcoming payment collection integration.
          </p>
        </div>
        <Link
          to="/dashboard/subscription"
          className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs font-semibold hover:border-[#258BFF]"
        >
          View Subscription Status
        </Link>
      </div>

      {/* Sandbox Configuration Status Banner */}
      {momoSandboxConfig && !momoSandboxConfig.configured && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-[#10243D] border border-amber-300 dark:border-amber-700 text-xs space-y-1.5">
          <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            MTN MoMo Sandbox Credentials Pending Configuration
          </div>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            Server-side MTN MoMo Sandbox credentials are not configured yet. Missing environment variables:{' '}
            <span className="font-mono font-semibold">
              {momoSandboxConfig.missingVars.join(', ')}
            </span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Checkout & Account Holder Validation Panel */}
        <div className="lg:col-span-7 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMethod('momo')}
              className={`p-3.5 rounded-xl border text-left transition ${
                method === 'momo'
                  ? 'border-[#258BFF] bg-[#258BFF]/10'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <Smartphone className="w-5 h-5 text-[#258BFF] mb-1.5" />
              <div className="text-xs font-bold text-[#071426] dark:text-white">MTN Mobile Money</div>
              <div className="text-[11px] text-[#8793A5]">Account Validation (Sandbox)</div>
            </button>
            <button
              type="button"
              onClick={() => setMethod('card')}
              className={`p-3.5 rounded-xl border text-left transition ${
                method === 'card'
                  ? 'border-[#258BFF] bg-[#258BFF]/10'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <CreditCard className="w-5 h-5 text-[#258BFF] mb-1.5" />
              <div className="text-xs font-bold text-[#071426] dark:text-white">Debit / Credit Card</div>
              <div className="text-[11px] text-[#8793A5]">International Gateway</div>
            </button>
          </div>

          {method === 'card' ? (
            <form onSubmit={handleCardAttempt} className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                Card payments are processed exclusively through hosted PCI-compliant payment providers once{' '}
                <span className="font-mono">CARD_GATEWAY_SECRET_KEY</span> is configured. 2MR never stores raw card numbers or CVV codes.
              </div>
              <button
                type="submit"
                disabled={submittingCard}
                className="w-full py-3 rounded-xl bg-[#258BFF] text-white text-sm font-semibold"
              >
                Continue to Hosted Card Checkout (${amountUsd} USD)
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-slate-700 dark:text-slate-200 space-y-1">
                <p className="font-bold text-[#071426] dark:text-white flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-[#258BFF]" />
                  Step 1: MTN MoMo Account Verification (Sandbox)
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Verify that your MTN MoMo number is active before payment collection is enabled. No charge is made and 2MR Premium is not activated by this check.
                </p>
              </div>

              <form onSubmit={handleValidateAccountHolder} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    MTN Mobile Money Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 0780558358, 250780558358, or Sandbox 46733123453"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                  />
                  <div className="mt-2 p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex items-start gap-2 text-[11px] text-[#8793A5]">
                    <Lock className="w-4 h-4 text-[#258BFF] shrink-0 mt-0.5" />
                    <span>
                      Security notice: 2MR will NEVER ask for or store your MTN MoMo PIN or OTP.
                    </span>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={validationConsent}
                    onChange={(e) => setValidationConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#258BFF]"
                  />
                  <span className="text-slate-700 dark:text-slate-200">
                    I agree to let 2MR send an MTN MoMo account-holder validation check for my phone number. I understand this only checks account activity and does not guarantee sufficient funds, take payment, or activate Premium.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={validating || !validationConsent}
                  className="w-full py-3 rounded-xl bg-[#258BFF] text-white text-sm font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {validating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Validate MTN MoMo Account
                </button>
              </form>

              {/* Validation Outcome Card */}
              {validationResult && (
                <div
                  className={`p-4 rounded-2xl border space-y-2 text-xs ${
                    validationResult.state === 'active'
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : validationResult.state === 'inactive'
                        ? 'border-amber-500/40 bg-amber-500/10'
                        : 'border-rose-500/40 bg-rose-500/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-extrabold text-sm">
                      {validationResult.state === 'active' ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-[#B7F34A]" />
                          <span className="text-emerald-700 dark:text-[#B7F34A]">Account active</span>
                        </>
                      ) : validationResult.state === 'inactive' ? (
                        <>
                          <XCircle className="w-5 h-5 text-amber-600 dark:text-amber-300" />
                          <span className="text-amber-700 dark:text-amber-300">Account inactive</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                          <span className="text-rose-700 dark:text-rose-400">Could not verify account</span>
                        </>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-[#8793A5]">
                      {validationResult.maskedAccountHolderId}
                    </span>
                  </div>

                  <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                    {validationResult.state === 'active'
                      ? 'MTN MoMo confirmed this account holder is active. Important: An active account does not guarantee sufficient funds, mark your subscription as paid, or activate 2MR Premium. Live payment collection will be enabled in the next phase.'
                      : validationResult.state === 'inactive'
                        ? 'MTN MoMo reported this account holder as inactive. Please check your mobile number or ensure MTN Mobile Money is registered on this line.'
                        : validationResult.disclaimer || 'Could not verify account status right now. Please check configuration or try again later.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Order Summary & Support */}
        <aside className="lg:col-span-5 space-y-5">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
            <h2 className="text-lg font-bold text-[#071426] dark:text-white">Plan Preview Summary</h2>
            <div className="space-y-2 text-xs">
              <label className="block font-semibold text-[#8793A5]">Billing Cycle</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`py-2 rounded-lg border font-semibold ${
                    billingCycle === 'monthly'
                      ? 'border-[#258BFF] text-[#258BFF]'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`py-2 rounded-lg border font-semibold ${
                    billingCycle === 'annual'
                      ? 'border-[#258BFF] text-[#258BFF]'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Annual (Save)
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#8793A5]">Plan</span>
                <span className="font-semibold">2MR Premium ({billingCycle})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8793A5]">Account</span>
                <span className="font-medium truncate max-w-[180px]">{user.email}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-base font-extrabold">
                <span>Plan Rate</span>
                <span className="text-[#258BFF] dark:text-[#B7F34A] tabular-nums">
                  {method === 'momo' ? `${amountRwf.toLocaleString()} RWF` : `$${amountUsd} USD`}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-[#8793A5]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#B7F34A]" /> Ad-free workspace &amp; expanded AI limits
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#258BFF]" /> Sandbox Account-Holder verification active
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2.5 text-xs">
            <h3 className="font-bold text-[#071426] dark:text-white">Payment Support</h3>
            <p className="text-[#8793A5]">
              Questions about 2MR Premium or MTN Mobile Money availability?
            </p>
            <div className="flex flex-wrap gap-4 pt-1 font-semibold">
              <a href="mailto:2mr@proton.me" className="inline-flex items-center gap-1.5 text-[#258BFF] hover:underline">
                <Mail className="w-3.5 h-3.5" /> 2mr@proton.me
              </a>
              <span className="inline-flex items-center gap-1.5 text-[#071426] dark:text-white">
                <Phone className="w-3.5 h-3.5 text-[#258BFF]" /> 0780558358
              </span>
            </div>
            <Link to="/contact" className="inline-block text-[#258BFF] hover:underline font-semibold pt-1">
              Open Support Desk →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
};
