import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from 'lucide-react';

export interface MonthlyGrowthPoint {
  period: string;
  label: string;
  newUsers: number;
  cumulativeUsers: number;
  freeUsers: number;
  premiumUsers: number;
  activeUsers: number;
  subscriptions: number;
  cumulativeSubscriptions: number;
  verifiedRevenueRwf: number;
  aiUsage: number;
  researchActivity: number;
  engagementCount: number;
  errorCount: number;
}

export interface ChartSeriesMeta {
  key: keyof Omit<MonthlyGrowthPoint, 'period' | 'label'>;
  label: string;
  category: string;
  color: string;
  unit?: string;
  description: string;
}

export const ANALYTICS_SERIES: ChartSeriesMeta[] = [
  {
    key: 'cumulativeUsers',
    label: 'Total Registered Users',
    category: 'User Growth',
    color: '#258BFF',
    description: 'Cumulative registered accounts over time.',
  },
  {
    key: 'newUsers',
    label: 'New Users / Month',
    category: 'User Growth',
    color: '#258BFF',
    description: 'New account registrations recorded each month.',
  },
  {
    key: 'activeUsers',
    label: 'Active Users',
    category: 'User Growth',
    color: '#258BFF',
    description: 'Accounts marked active registered per cohort month.',
  },
  {
    key: 'premiumUsers',
    label: 'Premium Users (Cumulative)',
    category: 'Business & Premium',
    color: '#B7F34A',
    description: 'Cumulative Premium-tier accounts in active scope.',
  },
  {
    key: 'cumulativeSubscriptions',
    label: 'Subscription Growth',
    category: 'Business & Premium',
    color: '#B7F34A',
    description: 'Cumulative subscription records logged in PostgreSQL.',
  },
  {
    key: 'verifiedRevenueRwf',
    label: 'Verified Revenue (RWF)',
    category: 'Business & Premium',
    color: '#B7F34A',
    unit: 'RWF',
    description: 'Confirmed non-demo successful payments settled in RWF.',
  },
  {
    key: 'researchActivity',
    label: 'Research Activity',
    category: 'AI & Research',
    color: '#9B7BFF',
    description: 'Monthly searches and structured research builder projects.',
  },
  {
    key: 'aiUsage',
    label: 'AI Feature Usage',
    category: 'AI & Research',
    color: '#9B7BFF',
    description: 'Monthly requests processed by 2MR Unified AI Intelligence.',
  },
  {
    key: 'engagementCount',
    label: 'Engagement Actions',
    category: 'Engagement',
    color: '#F5A623',
    description: 'Saved items, saved videos, and personal knowledge notes.',
  },
  {
    key: 'errorCount',
    label: 'Errors & Payment Risks',
    category: 'Errors & Risks',
    color: '#EF6461',
    description: 'AI errors/timeouts plus failed or unverified payment attempts.',
  },
];

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

interface AnimatedCounterProps {
  value: number;
  durationMs?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  durationMs = 700,
  suffix = '',
  prefix = '',
  decimals = 0,
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const [displayValue, setDisplayValue] = useState<number>(value);
  const prevValueRef = useRef<number>(0);

  useEffect(() => {
    if (reducedMotion) {
      setDisplayValue(value);
      prevValueRef.current = value;
      return;
    }

    const startVal = prevValueRef.current;
    const delta = value - startVal;
    if (delta === 0) {
      setDisplayValue(value);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + delta * eased;
      setDisplayValue(decimals > 0 ? current : Math.round(current));

      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
        prevValueRef.current = value;
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs, decimals, reducedMotion]);

  const formatted =
    decimals > 0
      ? displayValue.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(displayValue).toLocaleString();

  return (
    <span className="tabular-nums">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};

interface AnimatedProgressBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
  sublabel?: string;
}

export const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({
  label,
  value,
  max,
  color,
  sublabel,
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setMounted(true);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [reducedMotion, value]);

  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="font-medium text-[#071426] dark:text-slate-200 truncate">{label}</span>
        <span className="font-mono font-semibold text-[#8793A5] tabular-nums shrink-0">
          {value.toLocaleString()} {sublabel ? `· ${sublabel}` : ''}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-[#071426] overflow-hidden">
        <div
          className="h-full rounded-full motion-reduce:transition-none transition-all duration-700 ease-out"
          style={{
            width: mounted ? `${Math.max(value > 0 ? 4 : 0, pct)}%` : '0%',
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
};

interface InteractiveGrowthChartProps {
  timeline: MonthlyGrowthPoint[];
  activeSeriesKey: ChartSeriesMeta['key'];
  onSelectSeries: (key: ChartSeriesMeta['key']) => void;
  compareFreeVsPremium?: boolean;
  onToggleCompareFreeVsPremium?: () => void;
}

export const InteractiveGrowthChart: React.FC<InteractiveGrowthChartProps> = ({
  timeline,
  activeSeriesKey,
  onSelectSeries,
  compareFreeVsPremium = false,
  onToggleCompareFreeVsPremium,
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animProgress, setAnimProgress] = useState(reducedMotion ? 1 : 0);

  const activeMeta =
    ANALYTICS_SERIES.find((s) => s.key === activeSeriesKey) || ANALYTICS_SERIES[0];

  useEffect(() => {
    if (timeline.length > 0) {
      setSelectedIndex(timeline.length - 1);
    } else {
      setSelectedIndex(null);
    }
  }, [timeline.length, activeSeriesKey, compareFreeVsPremium]);

  useEffect(() => {
    if (reducedMotion) {
      setAnimProgress(1);
      return;
    }
    setAnimProgress(0);
    const raf = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setAnimProgress(1));
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf);
  }, [activeSeriesKey, compareFreeVsPremium, timeline.length, reducedMotion]);

  const inspectedIndex = hoveredIndex !== null ? hoveredIndex : selectedIndex;

  const chartDimensions = { width: 820, height: 270, padLeft: 56, padRight: 28, padTop: 28, padBottom: 38 };
  const plotW = chartDimensions.width - chartDimensions.padLeft - chartDimensions.padRight;
  const plotH = chartDimensions.height - chartDimensions.padTop - chartDimensions.padBottom;

  const computed = useMemo(() => {
    if (timeline.length === 0) {
      return { maxVal: 10, points: [], secondaryPoints: [] };
    }

    const values = timeline.map((pt) => Number(pt[activeSeriesKey] || 0));
    const secondaryValues = compareFreeVsPremium
      ? timeline.map((pt) => Number(pt.freeUsers || 0))
      : [];
    const maxRaw = Math.max(
      1,
      ...values,
      ...(compareFreeVsPremium ? timeline.map((pt) => Number(pt.premiumUsers || 0)) : []),
      ...secondaryValues
    );
    const maxVal = maxRaw * 1.12;

    const getX = (idx: number) =>
      timeline.length === 1
        ? chartDimensions.padLeft + plotW / 2
        : chartDimensions.padLeft + (idx / (timeline.length - 1)) * plotW;

    const getY = (val: number) =>
      chartDimensions.padTop + plotH - (val / maxVal) * plotH;

    const points = timeline.map((pt, idx) => {
      const val = compareFreeVsPremium ? Number(pt.premiumUsers || 0) : Number(pt[activeSeriesKey] || 0);
      return {
        idx,
        x: getX(idx),
        y: getY(val),
        val,
        pt,
      };
    });

    const secondaryPoints = compareFreeVsPremium
      ? timeline.map((pt, idx) => {
          const val = Number(pt.freeUsers || 0);
          return { idx, x: getX(idx), y: getY(val), val, pt };
        })
      : [];

    return { maxVal, points, secondaryPoints };
  }, [timeline, activeSeriesKey, compareFreeVsPremium, plotH, plotW]);

  const buildSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i];
      const next = pts[i + 1];
      const cx = (curr.x + next.x) / 2;
      d += ` C ${cx} ${curr.y}, ${cx} ${next.y}, ${next.x} ${next.y}`;
    }
    return d;
  };

  const primaryPath = buildSmoothPath(computed.points);
  const secondaryPath = buildSmoothPath(computed.secondaryPoints);
  const primaryColor = compareFreeVsPremium ? '#B7F34A' : activeMeta.color;
  const areaPath =
    computed.points.length > 1
      ? `${primaryPath} L ${computed.points[computed.points.length - 1].x} ${
          chartDimensions.padTop + plotH
        } L ${computed.points[0].x} ${chartDimensions.padTop + plotH} Z`
      : '';

  const inspectedPoint =
    inspectedIndex !== null && timeline[inspectedIndex] ? timeline[inspectedIndex] : null;
  const prevPoint =
    inspectedIndex !== null && inspectedIndex > 0 ? timeline[inspectedIndex - 1] : null;

  const currentVal = inspectedPoint
    ? Number(compareFreeVsPremium ? inspectedPoint.premiumUsers : inspectedPoint[activeSeriesKey] || 0)
    : 0;
  const prevVal = prevPoint
    ? Number(compareFreeVsPremium ? prevPoint.premiumUsers : prevPoint[activeSeriesKey] || 0)
    : null;
  const diff = prevVal !== null ? currentVal - prevVal : null;
  const growthPct =
    prevVal !== null
      ? prevVal === 0
        ? currentVal > 0
          ? 100
          : 0
        : ((currentVal - prevVal) / prevVal) * 100
      : null;

  return (
    <div className="relative overflow-hidden p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
      {/* Subtle Ambient Background Gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-10 blur-3xl"
        style={{ backgroundColor: primaryColor }}
      />

      {/* Header & Metric Selector */}
      <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#8793A5]">
            <TrendingUp className="w-4 h-4" style={{ color: primaryColor }} />
            <span>
              {compareFreeVsPremium ? 'Free vs Premium Cohort Comparison' : activeMeta.category}
            </span>
          </div>
          <h2 className="text-lg font-extrabold text-[#071426] dark:text-white mt-0.5">
            {compareFreeVsPremium ? 'Free (#258BFF) vs Premium (#B7F34A) Growth' : activeMeta.label}
          </h2>
          <p className="text-xs text-[#8793A5]">
            {compareFreeVsPremium
              ? 'Cumulative Free-tier vs Premium-tier users aggregated by month.'
              : activeMeta.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onToggleCompareFreeVsPremium && (
            <button
              type="button"
              onClick={onToggleCompareFreeVsPremium}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                compareFreeVsPremium
                  ? 'bg-[#B7F34A] text-[#071426] border-[#B7F34A]'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#258BFF]'
              }`}
            >
              Free vs Premium Overlay
            </button>
          )}
        </div>
      </div>

      {/* Series Switcher */}
      <div className="relative flex flex-wrap gap-1.5">
        {ANALYTICS_SERIES.map((series) => {
          const isActive = !compareFreeVsPremium && activeSeriesKey === series.key;
          return (
            <button
              key={series.key}
              type="button"
              onClick={() => {
                if (compareFreeVsPremium && onToggleCompareFreeVsPremium) {
                  onToggleCompareFreeVsPremium();
                }
                onSelectSeries(series.key);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors motion-reduce:transition-none ${
                isActive
                  ? 'bg-[#071426] dark:bg-white text-white dark:text-[#071426] border-transparent'
                  : 'border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] text-slate-600 dark:text-slate-300 hover:border-[#258BFF]'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: series.color }}
              />
              {series.label}
            </button>
          );
        })}
      </div>

      {/* Interactive SVG Canvas */}
      {timeline.length === 0 ? (
        <div className="py-12 text-center rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs text-[#8793A5]">
          No monthly time-series records recorded yet for the selected scope.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
          <div className="xl:col-span-8 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 p-3">
            <svg
              viewBox={`0 0 ${chartDimensions.width} ${chartDimensions.height}`}
              className="w-full h-auto select-none"
              role="img"
              aria-label={`Monthly chart showing ${activeMeta.label}`}
            >
              <defs>
                <linearGradient id={`area-${activeSeriesKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryColor} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={primaryColor} stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines & Y Labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const yPos = chartDimensions.padTop + plotH - ratio * plotH;
                const tickVal = Math.round(computed.maxVal * ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1={chartDimensions.padLeft}
                      y1={yPos}
                      x2={chartDimensions.width - chartDimensions.padRight}
                      y2={yPos}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800"
                      strokeDasharray={ratio === 0 ? undefined : '4 4'}
                    />
                    <text
                      x={chartDimensions.padLeft - 8}
                      y={yPos + 4}
                      textAnchor="end"
                      className="fill-[#8793A5] text-[10px] font-mono tabular-nums"
                    >
                      {tickVal >= 1000 ? `${(tickVal / 1000).toFixed(tickVal >= 10000 ? 0 : 1)}k` : tickVal}
                    </text>
                  </g>
                );
              })}

              {/* Area Fill */}
              {areaPath && (
                <path
                  d={areaPath}
                  fill={`url(#area-${activeSeriesKey})`}
                  style={{
                    opacity: animProgress,
                    transition: reducedMotion ? 'none' : 'opacity 600ms ease-out',
                  }}
                />
              )}

              {/* Optional Free Users Comparison Line */}
              {compareFreeVsPremium && secondaryPath && (
                <path
                  d={secondaryPath}
                  fill="none"
                  stroke="#258BFF"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="1"
                  strokeDashoffset={1 - animProgress}
                  style={{
                    transition: reducedMotion ? 'none' : 'stroke-dashoffset 800ms ease-out',
                  }}
                />
              )}

              {/* Primary Series Path */}
              {primaryPath && (
                <path
                  d={primaryPath}
                  fill="none"
                  stroke={primaryColor}
                  strokeWidth={3}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="1"
                  strokeDashoffset={1 - animProgress}
                  style={{
                    transition: reducedMotion ? 'none' : 'stroke-dashoffset 800ms ease-out',
                  }}
                />
              )}

              {/* Active Vertical Guide Line */}
              {inspectedIndex !== null && computed.points[inspectedIndex] && (
                <line
                  x1={computed.points[inspectedIndex].x}
                  y1={chartDimensions.padTop}
                  x2={computed.points[inspectedIndex].x}
                  y2={chartDimensions.padTop + plotH}
                  stroke={primaryColor}
                  strokeOpacity={0.35}
                  strokeDasharray="3 3"
                />
              )}

              {/* Secondary Comparison Circular Markers */}
              {compareFreeVsPremium &&
                computed.secondaryPoints.map((pt) => {
                  const isFocused = inspectedIndex === pt.idx;
                  return (
                    <circle
                      key={`sec-${pt.pt.period}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={isFocused ? 6 : 4.5}
                      fill="#071426"
                      stroke="#258BFF"
                      strokeWidth={2.5}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIndex(pt.idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={() => setSelectedIndex(pt.idx)}
                    />
                  );
                })}

              {/* Required Visible Circular Markers on Every Monthly Data Point */}
              {computed.points.map((pt) => {
                const isFocused = inspectedIndex === pt.idx;
                return (
                  <g key={pt.pt.period}>
                    {/* Larger invisible hit target for easy click/hover */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={14}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIndex(pt.idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={() => setSelectedIndex(pt.idx)}
                    />
                    {/* Halo on active marker */}
                    {isFocused && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={10}
                        fill={primaryColor}
                        fillOpacity={0.2}
                      />
                    )}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isFocused ? 6.5 : 5}
                      fill={isFocused ? primaryColor : '#FFFFFF'}
                      stroke={primaryColor}
                      strokeWidth={2.5}
                      style={{
                        opacity: animProgress,
                        transition: reducedMotion
                          ? 'none'
                          : `opacity 400ms ease-out ${pt.idx * 45}ms, r 180ms ease-out`,
                      }}
                      className="pointer-events-none"
                    />
                    {/* X-axis month label */}
                    <text
                      x={pt.x}
                      y={chartDimensions.height - 12}
                      textAnchor="middle"
                      className={`text-[10px] font-mono tabular-nums ${
                        isFocused ? 'fill-[#071426] dark:fill-white font-bold' : 'fill-[#8793A5]'
                      }`}
                    >
                      {pt.pt.period}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Click / Hover Monthly Inspector Card */}
          <div className="xl:col-span-4 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between space-y-4">
            {inspectedPoint ? (
              <>
                <div className="space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">
                    Monthly Data Point Inspector
                  </div>
                  <div className="text-xl font-extrabold text-[#071426] dark:text-white">
                    {inspectedPoint.label}
                  </div>
                  <p className="text-xs text-[#8793A5] font-mono">{inspectedPoint.period}</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-[#8793A5]">
                      Actual Recorded Value
                    </div>
                    <div className="text-3xl font-extrabold tabular-nums" style={{ color: primaryColor }}>
                      {currentVal.toLocaleString()}
                      {activeMeta.unit && !compareFreeVsPremium ? ` ${activeMeta.unit}` : ''}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                    <div>
                      <div className="text-[11px] text-[#8793A5]">Previous Month</div>
                      <div className="font-bold text-[#071426] dark:text-white tabular-nums mt-0.5">
                        {prevVal !== null
                          ? `${prevVal.toLocaleString()}${
                              activeMeta.unit && !compareFreeVsPremium ? ` ${activeMeta.unit}` : ''
                            }`
                          : 'Baseline Month'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#8793A5]">Difference</div>
                      <div className="font-bold text-[#071426] dark:text-white tabular-nums mt-0.5">
                        {diff !== null ? `${diff >= 0 ? '+' : ''}${diff.toLocaleString()}` : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-[#8793A5]">Month-over-Month Growth</span>
                    {growthPct !== null ? (
                      <span
                        className={`inline-flex items-center gap-1 font-bold tabular-nums ${
                          growthPct > 0
                            ? 'text-emerald-600 dark:text-[#B7F34A]'
                            : growthPct < 0
                              ? 'text-[#EF6461]'
                              : 'text-[#8793A5]'
                        }`}
                      >
                        {growthPct > 0 ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : growthPct < 0 ? (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        ) : (
                          <Minus className="w-3.5 h-3.5" />
                        )}
                        {growthPct >= 0 ? '+' : ''}
                        {growthPct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[#8793A5]">Initial period</span>
                    )}
                  </div>

                  {compareFreeVsPremium && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs flex justify-between tabular-nums">
                      <span className="text-[#258BFF] font-semibold">Free Tier Cohort</span>
                      <span className="font-bold text-[#071426] dark:text-white">
                        {inspectedPoint.freeUsers.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-[#8793A5]">
                  Hover or click any circular marker on the chart to inspect another month.
                </p>
              </>
            ) : (
              <div className="text-xs text-[#8793A5]">Select a monthly point to inspect growth details.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface PlatformGrowthDiagramsProps {
  summary: {
    totalUsers: number;
    freeUsers: number;
    premiumUsers: number;
    activeUsers: number;
    activeSubscriptions: number;
    successfulPayments: number;
    totalRevenueRwf: number;
    totalSearches: number;
    totalAiCalls: number;
    totalResearchProjects: number;
    totalSavedResources: number;
    totalVideoInteractions: number;
    totalNotes: number;
    totalErrors: number;
  };
  aiFeatureBreakdown: { feature: string; count: number; avgLatencyMs: number }[];
  categoryBreakdown: { category: string; count: number }[];
}

export const PlatformGrowthDiagrams: React.FC<PlatformGrowthDiagramsProps> = ({
  summary,
  aiFeatureBreakdown,
  categoryBreakdown,
}) => {
  const totalUsers = Math.max(0, summary.totalUsers);
  const freePct = totalUsers > 0 ? (summary.freeUsers / totalUsers) * 100 : 0;
  const premiumPct = totalUsers > 0 ? (summary.premiumUsers / totalUsers) * 100 : 0;
  const activePct = totalUsers > 0 ? (summary.activeUsers / totalUsers) * 100 : 0;

  const maxAiCount = Math.max(1, ...aiFeatureBreakdown.map((f) => f.count));
  const maxCatCount = Math.max(1, ...categoryBreakdown.map((c) => c.count));

  const formatFeatureLabel = (raw: string) => {
    const map: Record<string, string> = {
      ask: '2MR Ask Intelligence',
      research_intelligence: 'Research Intelligence',
      deep_research: 'Deep Research Engine',
      smart_answer: 'Smart Answer Synthesis',
      comparison: 'Multi-Model Comparison',
      research_builder: 'Research Builder Projects',
      knowledge_maps: 'Knowledge Maps',
      video_intelligence: 'Video Intelligence Summaries',
    };
    return map[raw] || raw.replace(/_/g, ' ');
  };

  // Donut stroke math for Free vs Premium ratio
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const premiumArc = totalUsers > 0 ? (summary.premiumUsers / totalUsers) * circumference : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Diagram 1: Platform Growth & Conversion Architecture */}
      <div className="lg:col-span-7 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
        <div>
          <h3 className="text-sm font-bold text-[#071426] dark:text-white">
            Platform Growth &amp; Monetization Flow Diagram
          </h3>
          <p className="text-xs text-[#8793A5]">
            Live progression from total registered accounts to active engagement and confirmed Premium revenue.
          </p>
        </div>

        {/* Visual Funnel Diagram */}
        <svg viewBox="0 0 680 170" className="w-full h-auto" role="img" aria-label="2MR platform growth flow diagram">
          <defs>
            <marker id="flowArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#258BFF" />
            </marker>
          </defs>

          {/* Stage 1: Users Joining */}
          <rect x="10" y="24" width="142" height="114" rx="14" className="fill-[#258BFF]/10 stroke-[#258BFF]" strokeWidth="1.5" />
          <text x="81" y="52" textAnchor="middle" className="fill-[#258BFF] text-[10px] font-bold uppercase">
            1. Users Joining
          </text>
          <text x="81" y="84" textAnchor="middle" className="fill-[#071426] dark:fill-white text-[22px] font-extrabold tabular-nums">
            {totalUsers.toLocaleString()}
          </text>
          <text x="81" y="106" textAnchor="middle" className="fill-[#8793A5] text-[10px]">
            Total Registered
          </text>

          <line x1="156" y1="81" x2="176" y2="81" stroke="#258BFF" strokeWidth="2" markerEnd="url(#flowArrow)" />

          {/* Stage 2: Active Users */}
          <rect x="182" y="24" width="142" height="114" rx="14" className="fill-[#9B7BFF]/10 stroke-[#9B7BFF]" strokeWidth="1.5" />
          <text x="253" y="52" textAnchor="middle" className="fill-[#9B7BFF] text-[10px] font-bold uppercase">
            2. Active Base
          </text>
          <text x="253" y="84" textAnchor="middle" className="fill-[#071426] dark:fill-white text-[22px] font-extrabold tabular-nums">
            {summary.activeUsers.toLocaleString()}
          </text>
          <text x="253" y="106" textAnchor="middle" className="fill-[#8793A5] text-[10px]">
            {activePct.toFixed(1)}% of Accounts
          </text>

          <line x1="328" y1="81" x2="348" y2="81" stroke="#258BFF" strokeWidth="2" markerEnd="url(#flowArrow)" />

          {/* Stage 3: Research & Engagement */}
          <rect x="354" y="24" width="142" height="114" rx="14" className="fill-[#F5A623]/10 stroke-[#F5A623]" strokeWidth="1.5" />
          <text x="425" y="52" textAnchor="middle" className="fill-[#F5A623] text-[10px] font-bold uppercase">
            3. AI &amp; Engagement
          </text>
          <text x="425" y="84" textAnchor="middle" className="fill-[#071426] dark:fill-white text-[22px] font-extrabold tabular-nums">
            {(summary.totalAiCalls + summary.totalSearches).toLocaleString()}
          </text>
          <text x="425" y="106" textAnchor="middle" className="fill-[#8793A5] text-[10px]">
            AI + Search Events
          </text>

          <line x1="500" y1="81" x2="520" y2="81" stroke="#258BFF" strokeWidth="2" markerEnd="url(#flowArrow)" />

          {/* Stage 4: Premium Conversion */}
          <rect x="526" y="24" width="142" height="114" rx="14" className="fill-[#B7F34A]/15 stroke-[#B7F34A]" strokeWidth="1.5" />
          <text x="597" y="52" textAnchor="middle" className="fill-emerald-600 dark:fill-[#B7F34A] text-[10px] font-bold uppercase">
            4. Premium Tier
          </text>
          <text x="597" y="84" textAnchor="middle" className="fill-[#071426] dark:fill-white text-[22px] font-extrabold tabular-nums">
            {summary.premiumUsers.toLocaleString()}
          </text>
          <text x="597" y="106" textAnchor="middle" className="fill-[#8793A5] text-[10px]">
            {premiumPct.toFixed(1)}% Conversion
          </text>
        </svg>

        {/* Free vs Premium Donut + Health Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 items-center">
          <div className="flex items-center gap-4">
            <svg width="110" height="110" viewBox="0 0 110 110" className="shrink-0">
              <circle
                cx="55"
                cy="55"
                r={radius}
                fill="none"
                stroke="#258BFF"
                strokeWidth="12"
                strokeOpacity="0.25"
              />
              <circle
                cx="55"
                cy="55"
                r={radius}
                fill="none"
                stroke="#258BFF"
                strokeWidth="12"
                strokeDasharray={`${circumference - premiumArc} ${circumference}`}
                transform="rotate(-90 55 55)"
              />
              <circle
                cx="55"
                cy="55"
                r={radius}
                fill="none"
                stroke="#B7F34A"
                strokeWidth="12"
                strokeDasharray={`${premiumArc} ${circumference}`}
                strokeDashoffset={-(circumference - premiumArc)}
                transform="rotate(-90 55 55)"
              />
              <text
                x="55"
                y="53"
                textAnchor="middle"
                className="fill-[#071426] dark:fill-white text-[13px] font-extrabold tabular-nums"
              >
                {premiumPct.toFixed(0)}%
              </text>
              <text x="55" y="67" textAnchor="middle" className="fill-[#8793A5] text-[9px]">
                Premium
              </text>
            </svg>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#258BFF]" />
                <span className="text-slate-600 dark:text-slate-300">
                  Free Users: <strong className="tabular-nums">{summary.freeUsers.toLocaleString()}</strong> ({freePct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B7F34A]" />
                <span className="text-slate-600 dark:text-slate-300">
                  Premium: <strong className="tabular-nums">{summary.premiumUsers.toLocaleString()}</strong> ({premiumPct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF6461]" />
                <span className="text-slate-600 dark:text-slate-300">
                  Logged Errors / Risks: <strong className="tabular-nums">{summary.totalErrors.toLocaleString()}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <AnimatedProgressBar
              label="Active User Retention Rate"
              value={summary.activeUsers}
              max={Math.max(1, totalUsers)}
              color="#258BFF"
              sublabel={`${activePct.toFixed(1)}%`}
            />
            <AnimatedProgressBar
              label="Active Subscriptions"
              value={summary.activeSubscriptions}
              max={Math.max(1, summary.premiumUsers || totalUsers)}
              color="#B7F34A"
              sublabel={`${summary.successfulPayments.toLocaleString()} paid`}
            />
            <AnimatedProgressBar
              label="Knowledge Engagement Actions"
              value={summary.totalSavedResources + summary.totalVideoInteractions + summary.totalNotes}
              max={Math.max(
                1,
                summary.totalSavedResources + summary.totalVideoInteractions + summary.totalNotes + summary.totalSearches
              )}
              color="#F5A623"
            />
          </div>
        </div>
      </div>

      {/* Diagram 2: Popular AI Features & Growing Research Categories */}
      <div className="lg:col-span-5 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#071426] dark:text-white">
              Most Popular AI &amp; Research Features
            </h3>
            <span className="text-[11px] font-semibold text-[#9B7BFF]">Real DB Usage</span>
          </div>
          {aiFeatureBreakdown.length === 0 ? (
            <p className="text-xs text-[#8793A5]">No AI feature usage logged yet.</p>
          ) : (
            <div className="space-y-2.5">
              {aiFeatureBreakdown.slice(0, 5).map((item) => (
                <AnimatedProgressBar
                  key={item.feature}
                  label={formatFeatureLabel(item.feature)}
                  value={item.count}
                  max={maxAiCount}
                  color="#9B7BFF"
                  sublabel={item.avgLatencyMs > 0 ? `${item.avgLatencyMs}ms avg` : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#071426] dark:text-white">
              Indexed Research Categories
            </h3>
            <span className="text-[11px] font-semibold text-[#258BFF]">Content Growth</span>
          </div>
          {categoryBreakdown.length === 0 ? (
            <p className="text-xs text-[#8793A5]">No indexed categories yet.</p>
          ) : (
            <div className="space-y-2.5">
              {categoryBreakdown.slice(0, 5).map((cat) => (
                <AnimatedProgressBar
                  key={cat.category}
                  label={cat.category}
                  value={cat.count}
                  max={maxCatCount}
                  color="#258BFF"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
