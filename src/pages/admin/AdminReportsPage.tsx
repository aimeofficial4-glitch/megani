import React, { useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, LineChart, RefreshCw, Search } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';
import {
  AnimatedCounter,
  AnimatedProgressBar,
  ChartSeriesMeta,
  InteractiveGrowthChart,
  MonthlyGrowthPoint,
  PlatformGrowthDiagrams,
} from '../../components/analytics/AnimatedCharts';

type DataScope = 'real' | 'demo' | 'combined';

export const AdminReportsPage: React.FC = () => {
  const { addToast } = useApp();
  const [scope, setScope] = useState<DataScope>('real');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeSeriesKey, setActiveSeriesKey] = useState<ChartSeriesMeta['key']>('cumulativeUsers');
  const [compareFreeVsPremium, setCompareFreeVsPremium] = useState(false);

  const loadReports = async (targetScope: DataScope = scope) => {
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/api/admin/reports?scope=${targetScope}`);
      setData(res);
    } catch (err: any) {
      addToast(err.message || 'Failed to load analytics reports.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports(scope);
  }, [scope]);

  const s = data?.summary;
  const topQueries: { query: string; count: number }[] = data?.topQueries || [];
  const timeline: { period: string; registrations: number; premium_count: number }[] =
    data?.registrationsTimeline || [];
  const monthlyGrowthTimeline: MonthlyGrowthPoint[] = data?.monthlyGrowthTimeline || [];
  const aiFeatureBreakdown: { feature: string; count: number; avgLatencyMs: number }[] =
    data?.aiFeatureBreakdown || [];
  const categoryBreakdown: { category: string; count: number }[] = data?.categoryBreakdown || [];
  const countries: { country: string; count: number }[] = data?.countryBreakdown || [];
  const languages: { language: string; count: number }[] = data?.languageBreakdown || [];

  const maxCountry = Math.max(1, ...countries.map((c) => Number(c.count || 0)));
  const maxLanguage = Math.max(1, ...languages.map((l) => Number(l.count || 0)));
  const ctr =
    s && s.adImpressions > 0 ? Number(((s.adClicks / s.adImpressions) * 100).toFixed(2)) : 0;

  const kpiCards: {
    label: string;
    numValue: number;
    accentColor: string;
    subText?: string;
    suffix?: string;
    decimals?: number;
  }[] = s
    ? [
        {
          label: 'Total Registered Users',
          numValue: Number(s.totalUsers || 0),
          accentColor: '#258BFF',
          subText: `${Number(s.newRegistrations30d || 0).toLocaleString()} joined in 30d`,
        },
        {
          label: 'Premium Users',
          numValue: Number(s.premiumUsers || 0),
          accentColor: '#B7F34A',
          subText: `${Number(s.freeUsers || 0).toLocaleString()} Free tier accounts`,
        },
        {
          label: 'Active Users',
          numValue: Number(s.activeUsers || 0),
          accentColor: '#258BFF',
          subText: `${Number(s.activeSubscriptions || 0).toLocaleString()} active subscriptions`,
        },
        {
          label: 'Verified Revenue (RWF)',
          numValue: Number(s.totalRevenueRwf || 0),
          accentColor: '#B7F34A',
          suffix: ' RWF',
          subText: `${Number(s.successfulPayments || 0).toLocaleString()} confirmed payments`,
        },
        {
          label: 'AI Feature Requests',
          numValue: Number(s.totalAiCalls || 0),
          accentColor: '#9B7BFF',
          subText: `${Number(s.totalResearchProjects || 0).toLocaleString()} Builder projects`,
        },
        {
          label: 'Research Searches',
          numValue: Number(s.totalSearches || 0),
          accentColor: '#9B7BFF',
          subText: `${Number(s.openFeedback || 0).toLocaleString()} open feedback items`,
        },
        {
          label: 'Knowledge Engagement',
          numValue:
            Number(s.totalSavedResources || 0) +
            Number(s.totalVideoInteractions || 0) +
            Number(s.totalNotes || 0),
          accentColor: '#F5A623',
          subText: `${Number(s.adImpressions || 0).toLocaleString()} ad impressions · ${ctr}% CTR`,
        },
        {
          label: 'Errors & Payment Risks',
          numValue: Number(s.totalErrors || 0),
          accentColor: '#EF6461',
          subText: 'AI errors + unverified/failed payments',
        },
      ]
    : [];

  return (
    <AdminLayout
      title="Reports & Platform Analytics"
      subtitle="Animated KPIs, interactive monthly growth charts, user segmentation, AI demand, verified revenue, and platform diagrams."
    >
      <div className="relative space-y-6 motion-reduce:transition-none transition-opacity duration-300">
        {/* Subtle Ambient Background Halo */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-24 h-64 bg-gradient-to-r from-[#258BFF]/5 via-[#9B7BFF]/5 to-[#B7F34A]/5 blur-3xl -z-10"
        />

        {/* Data Scope Selector: Defaults strictly to Real Data Only */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs">
            {[
              { key: 'real' as const, label: 'Real Data Only' },
              { key: 'demo' as const, label: 'Demo Data Only' },
              { key: 'combined' as const, label: 'Combined Data' },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setScope(opt.key)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors motion-reduce:transition-none whitespace-nowrap ${
                  scope === opt.key
                    ? 'bg-[#258BFF] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#071426] dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => loadReports(scope)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF] disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
            Refresh Metrics
          </button>
        </div>

        {/* Mandatory Visible Synthetic Warning Banner */}
        {scope !== 'real' && (
          <div className="p-4 rounded-xl border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/50 flex items-center gap-3 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <div className="text-sm font-extrabold tracking-wide">
                DEMO DATA – NOT REAL USERS OR TRANSACTIONS
              </div>
              <div className="text-xs mt-0.5 tabular-nums">
                Active Scope: {scope === 'demo' ? 'Synthetic Demo Dataset Only' : 'Combined Real + Synthetic Test Dataset'} · Synthetic Users Included: {Number(s?.demoUsers || 0).toLocaleString()} · Simulated Non-Financial Transactions: {Number(s?.demoSimulatedPayments || 0).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {loading && !data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] animate-pulse motion-reduce:animate-none"
                />
              ))}
            </div>
            <div className="h-72 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex items-center justify-center text-xs text-[#8793A5]">
              Compiling live PostgreSQL analytics across platform tables...
            </div>
          </div>
        ) : (
          <>
            {/* Animated KPI Counters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {kpiCards.map((card) => (
                <div
                  key={card.label}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF]/50 transition-colors motion-reduce:transition-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8793A5]">
                      {card.label}
                    </p>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: card.accentColor }}
                    />
                  </div>
                  <p className="text-2xl font-extrabold text-[#071426] dark:text-white mt-1.5">
                    <AnimatedCounter
                      value={card.numValue}
                      suffix={card.suffix || ''}
                      decimals={card.decimals || 0}
                    />
                  </p>
                  {card.subText && (
                    <p className="text-[11px] text-[#8793A5] mt-1 tabular-nums">{card.subText}</p>
                  )}
                </div>
              ))}
            </div>

            {scope !== 'real' && (
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-wrap items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-[#071426] dark:text-white">
                    Simulated Demo Billing Telemetry (Excluded from Real Revenue)
                  </div>
                  <div className="text-[#8793A5]">
                    Demo payment simulations are tracked separately and never counted as confirmed revenue.
                  </div>
                </div>
                <div className="font-mono font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {Number(s?.demoSimulatedPayments || 0).toLocaleString()} demo events · {Number(s?.demoSimulatedRwf || 0).toLocaleString()} RWF (Simulated)
                </div>
              </div>
            )}

            {/* Interactive Monthly Growth Chart with Circular Click/Hover Markers */}
            <InteractiveGrowthChart
              timeline={monthlyGrowthTimeline}
              activeSeriesKey={activeSeriesKey}
              onSelectSeries={setActiveSeriesKey}
              compareFreeVsPremium={compareFreeVsPremium}
              onToggleCompareFreeVsPremium={() => setCompareFreeVsPremium((v) => !v)}
            />

            {/* Platform Growth Illustrations & Flow Diagrams */}
            {s && (
              <PlatformGrowthDiagrams
                summary={{
                  totalUsers: Number(s.totalUsers || 0),
                  freeUsers: Number(s.freeUsers || 0),
                  premiumUsers: Number(s.premiumUsers || 0),
                  activeUsers: Number(s.activeUsers || 0),
                  activeSubscriptions: Number(s.activeSubscriptions || 0),
                  successfulPayments: Number(s.successfulPayments || 0),
                  totalRevenueRwf: Number(s.totalRevenueRwf || 0),
                  totalSearches: Number(s.totalSearches || 0),
                  totalAiCalls: Number(s.totalAiCalls || 0),
                  totalResearchProjects: Number(s.totalResearchProjects || 0),
                  totalSavedResources: Number(s.totalSavedResources || 0),
                  totalVideoInteractions: Number(s.totalVideoInteractions || 0),
                  totalNotes: Number(s.totalNotes || 0),
                  totalErrors: Number(s.totalErrors || 0),
                }}
                aiFeatureBreakdown={aiFeatureBreakdown}
                categoryBreakdown={categoryBreakdown}
              />
            )}

            {/* Registrations Timeline + Country & Language Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
                <h2 className="font-bold text-sm text-[#071426] dark:text-white">Monthly Cohort Ledger</h2>
                {timeline.length === 0 ? (
                  <p className="text-xs text-[#8793A5]">No registration timeline entries.</p>
                ) : (
                  <div className="space-y-2 text-xs tabular-nums max-h-64 overflow-y-auto">
                    {timeline.map((row) => (
                      <div key={row.period} className="flex items-center justify-between p-2.5 rounded-lg bg-[#F5F7FA] dark:bg-[#071426]">
                        <span className="font-mono font-semibold text-[#071426] dark:text-white">{row.period}</span>
                        <span>
                          <strong className="text-[#258BFF]">{Number(row.registrations).toLocaleString()}</strong> new ·{' '}
                          <span className="text-emerald-600 dark:text-[#B7F34A] font-semibold">
                            {Number(row.premium_count).toLocaleString()} premium
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
                <h2 className="font-bold text-sm text-[#071426] dark:text-white">Top User Countries</h2>
                {countries.length === 0 ? (
                  <p className="text-xs text-[#8793A5]">No country metadata recorded.</p>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {countries.map((c) => (
                      <AnimatedProgressBar
                        key={c.country}
                        label={c.country}
                        value={Number(c.count || 0)}
                        max={maxCountry}
                        color="#258BFF"
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
                <h2 className="font-bold text-sm text-[#071426] dark:text-white">Preferred Languages</h2>
                {languages.length === 0 ? (
                  <p className="text-xs text-[#8793A5]">No language data recorded.</p>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {languages.map((l) => (
                      <AnimatedProgressBar
                        key={l.language}
                        label={String(l.language || 'en').toUpperCase()}
                        value={Number(l.count || 0)}
                        max={maxLanguage}
                        color="#9B7BFF"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
              <div className="flex items-center gap-2">
                <LineChart className="w-4 h-4 text-[#258BFF] dark:text-[#B7F34A]" />
                <h2 className="font-bold text-sm text-[#071426] dark:text-white">
                  Top Researched Queries ({scope === 'real' ? 'Real Users Only' : scope === 'demo' ? 'Demo Dataset' : 'Combined'})
                </h2>
              </div>

              {topQueries.length === 0 ? (
                <p className="text-xs text-[#8793A5]">No search queries recorded in selected scope.</p>
              ) : (
                <div className="space-y-2">
                  {topQueries.map((item, idx) => (
                    <div
                      key={item.query}
                      className="flex items-center justify-between gap-4 p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-[#258BFF]/15 text-[#258BFF] dark:text-[#B7F34A] font-bold flex items-center justify-center tabular-nums shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-medium text-[#071426] dark:text-white truncate flex items-center gap-1.5">
                          <Search className="w-3.5 h-3.5 text-[#8793A5] shrink-0" />
                          {item.query}
                        </span>
                      </div>
                      <span className="font-bold tabular-nums text-[#8793A5] inline-flex items-center gap-1 shrink-0">
                        <BarChart3 className="w-3.5 h-3.5" /> {Number(item.count).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};
