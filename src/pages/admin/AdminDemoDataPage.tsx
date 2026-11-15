import React, { useEffect, useState } from 'react';
import {
  Database,
  Play,
  Square,
  Trash2,
  RefreshCw,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

interface CountryWeight {
  country: string;
  city: string;
  percent: number;
}

interface LanguageWeight {
  code: string;
  label: string;
  percent: number;
}

interface GeneratorConfig {
  targetUsers: number;
  freePercent: number;
  premiumPercent: number;
  activePercent: number;
  inactivePercent: number;
  newRegistrationsPercent: number;
  olderRegistrationsPercent: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  activityScale: 'minimal' | 'standard' | 'heavy';
  countries: CountryWeight[];
  languages: LanguageWeight[];
}

interface DemoJob {
  id: string;
  jobType: string;
  status: string;
  targetCount: number;
  generatedCount: number;
  activityGeneratedCount: number;
  batchSize: number;
  startedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  errorMessage: string | null;
  peakMemoryMb: number;
  avgBatchMs: number;
}

interface DemoStatusResponse {
  activeJobId: string | null;
  jobs: DemoJob[];
  batches: Array<{
    id: string;
    jobId: string;
    batchNumber: number;
    tableName: string;
    recordsInserted: number;
    durationMs: number;
    status: string;
    createdAt: string;
  }>;
  logs: Array<{
    id: string;
    jobId: string;
    level: string;
    message: string;
    createdAt: string;
  }>;
  counts: {
    syntheticUsers: number;
    realUsers: number;
    syntheticFree: number;
    syntheticPremium: number;
    syntheticActive: number;
    syntheticSearches: number;
    syntheticAiRequests: number;
    syntheticProjects: number;
    syntheticSavedResources: number;
    syntheticVideoInteractions: number;
    syntheticNotes: number;
    syntheticFeedback: number;
    syntheticSubscriptions: number;
    syntheticPayments: number;
    syntheticAdInteractions: number;
  };
  system: {
    memoryRssMb: number;
    cpuLoad1m: number;
    dbLatencyMs: number;
  };
  defaultConfig: GeneratorConfig;
}

interface SyntheticUserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  account_type: string;
  country: string;
  city: string;
  activity_status: string;
  preferred_language: string;
  registration_source: string;
  created_at: string;
}

export const AdminDemoDataPage: React.FC = () => {
  const { addToast } = useApp();
  const [statusData, setStatusData] = useState<DemoStatusResponse | null>(null);
  const [config, setConfig] = useState<GeneratorConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [generatingActivity, setGeneratingActivity] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteMode, setConfirmDeleteMode] = useState<'none' | 'delete' | 'reset'>('none');

  // Paginated synthetic user explorer
  const [users, setUsers] = useState<SyntheticUserRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [searchQ, setSearchQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [usersLoading, setUsersLoading] = useState(false);

  const loadStatus = async (initConfig = false) => {
    try {
      const res = await apiFetch<DemoStatusResponse>('/api/admin/demo-data/status');
      setStatusData(res);
      if (initConfig && res.defaultConfig) {
        setConfig((prev) => prev || res.defaultConfig);
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to load synthetic data status.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async (page = 1) => {
    setUsersLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: '25',
        ...(searchQ.trim() ? { search: searchQ.trim() } : {}),
        ...(roleFilter !== 'all' ? { role: roleFilter } : {}),
        ...(activityFilter !== 'all' ? { activityStatus: activityFilter } : {}),
        ...(countryFilter !== 'all' ? { country: countryFilter } : {}),
        ...(languageFilter !== 'all' ? { language: languageFilter } : {}),
      });
      const res = await apiFetch<{
        users: SyntheticUserRow[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/api/admin/demo-data/users?${qs.toString()}`);
      setUsers(res.users || []);
      setPagination(res.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 });
    } catch (err: any) {
      addToast(err.message || 'Failed to load synthetic users.', 'error');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    loadStatus(true);
    loadUsers(1);
  }, []);

  const runningJob = statusData?.jobs?.find((j) => j.status === 'running') || null;
  const latest500kJob =
    statusData?.jobs?.find((j) => j.jobType === 'users_500k') || statusData?.jobs?.[0] || null;
  const wasRunningRef = React.useRef(false);

  // Poll automatically every 1.5s while a generation job is running, and refresh table when done
  useEffect(() => {
    const isRunning = Boolean(runningJob || statusData?.activeJobId);
    if (wasRunningRef.current && !isRunning) {
      loadUsers(1);
    }
    wasRunningRef.current = isRunning;

    if (!isRunning) return;
    const timer = setInterval(() => {
      loadStatus(false);
    }, 1500);
    return () => clearInterval(timer);
  }, [runningJob?.id, statusData?.activeJobId]);

  const handleStart500k = async () => {
    if (!config || runningJob) return;
    setStarting(true);
    try {
      await apiFetch('/api/admin/demo-data/generate-users', {
        method: 'POST',
        body: JSON.stringify(config),
      });
      addToast('Started 500,000 synthetic user generation job.', 'success');
      await loadStatus(false);
    } catch (err: any) {
      addToast(err.message || 'Unable to start 500K generator.', 'error');
    } finally {
      setStarting(false);
    }
  };

  const handleCancelJob = async () => {
    try {
      await apiFetch('/api/admin/demo-data/cancel', {
        method: 'POST',
        body: JSON.stringify({ jobId: runningJob?.id }),
      });
      addToast('Cancellation requested. Current transaction will finish cleanly.', 'info');
      await loadStatus(false);
    } catch (err: any) {
      addToast(err.message || 'Cancel request failed.', 'error');
    }
  };

  const handleGenerateActivity = async () => {
    if (!config) return;
    setGeneratingActivity(true);
    try {
      const res = await apiFetch<{ totalActivity: number }>('/api/admin/demo-data/generate-activity', {
        method: 'POST',
        body: JSON.stringify({
          scale: config.activityScale,
          dateRangeStart: config.dateRangeStart,
          dateRangeEnd: config.dateRangeEnd,
        }),
      });
      addToast(`Generated ${res.totalActivity.toLocaleString()} linked synthetic activity records.`, 'success');
      await loadStatus(false);
    } catch (err: any) {
      addToast(err.message || 'Activity generation failed.', 'error');
    } finally {
      setGeneratingActivity(false);
    }
  };

  const handleDeleteSynthetic = async (resetHistory: boolean) => {
    setDeleting(true);
    setConfirmDeleteMode('none');
    try {
      const res = await apiFetch<{ deletedUsers: number; realUsersPreserved: number }>(
        `/api/admin/demo-data${resetHistory ? '?reset=true' : ''}`,
        { method: 'DELETE' }
      );
      addToast(
        `Deleted ${res.deletedUsers.toLocaleString()} synthetic users. ${res.realUsersPreserved} genuine user(s) preserved.`,
        'success'
      );
      await Promise.all([loadStatus(false), loadUsers(1)]);
    } catch (err: any) {
      addToast(err.message || 'Failed to delete synthetic data.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleExportCsv = () => {
    const qs = new URLSearchParams({
      ...(searchQ.trim() ? { search: searchQ.trim() } : {}),
      ...(roleFilter !== 'all' ? { role: roleFilter } : {}),
      ...(activityFilter !== 'all' ? { activityStatus: activityFilter } : {}),
      ...(countryFilter !== 'all' ? { country: countryFilter } : {}),
      ...(languageFilter !== 'all' ? { language: languageFilter } : {}),
    });
    window.location.href = `/api/admin/demo-data/export?${qs.toString()}`;
  };

  const progressPct =
    latest500kJob && latest500kJob.targetCount > 0
      ? Math.min(100, Math.round((latest500kJob.generatedCount / latest500kJob.targetCount) * 100))
      : 0;

  const freeExact = config ? Math.round((500000 * config.freePercent) / 100) : 410000;
  const premiumExact = 500000 - freeExact;
  const activeExact = config ? Math.round((500000 * config.activePercent) / 100) : 370000;
  const inactiveExact = 500000 - activeExact;
  const newExact = config ? Math.round((500000 * config.newRegistrationsPercent) / 100) : 140000;
  const olderExact = 500000 - newExact;

  const counts = statusData?.counts;

  return (
    <AdminLayout
      title="Synthetic User Data Generator (500,000 Demo Scale)"
      subtitle="Generate isolated, fictional test datasets (is_synthetic = true, account_type = 'DEMO') for analytics and capacity validation."
    >
      <div className="space-y-6">
        {/* Safety Notice */}
        <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-bold">Strict Isolation Policy — Synthetic Test Records Only</p>
            <p className="mt-0.5 text-amber-800 dark:text-amber-300">
              All generated accounts use fictional identities and reserved <span className="font-mono">@example.com</span> domains, are blocked from authentication, never trigger emails or notifications, never consume AI credits, and are excluded from real customer reports and real payment revenue by default.
            </p>
          </div>
        </div>

        {/* Live Counts Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Synthetic Users (DB)', value: counts?.syntheticUsers ?? 0 },
            { label: 'Genuine Users Protected', value: counts?.realUsers ?? 0 },
            { label: 'Demo Free / Premium', value: `${(counts?.syntheticFree ?? 0).toLocaleString()} / ${(counts?.syntheticPremium ?? 0).toLocaleString()}` },
            {
              label: 'Linked Demo Activity',
              value: (
                (counts?.syntheticSearches ?? 0) +
                (counts?.syntheticAiRequests ?? 0) +
                (counts?.syntheticProjects ?? 0) +
                (counts?.syntheticSavedResources ?? 0) +
                (counts?.syntheticVideoInteractions ?? 0) +
                (counts?.syntheticNotes ?? 0) +
                (counts?.syntheticFeedback ?? 0) +
                (counts?.syntheticSubscriptions ?? 0) +
                (counts?.syntheticPayments ?? 0) +
                (counts?.syntheticAdInteractions ?? 0)
              ).toLocaleString(),
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]"
            >
              <div className="text-[11px] font-semibold text-[#8793A5]">{kpi.label}</div>
              <div className="text-xl font-extrabold text-[#071426] dark:text-white mt-1 tabular-nums">
                {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Section 1: Synthetic User Data Generator */}
        <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-[#071426] dark:text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-[#258BFF] dark:text-[#B7F34A]" />
                Synthetic User Data Generator
              </h2>
              <p className="text-xs text-[#8793A5] mt-0.5">
                Batched transactional PostgreSQL insertion (10,000 users/batch x 50 batches = 500,000 users).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleStart500k}
                disabled={Boolean(runningJob) || starting || !config}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold hover:brightness-95 disabled:opacity-50 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                {runningJob ? 'Generation Running...' : starting ? 'Starting...' : 'Generate 500,000 Demo Users'}
              </button>

              {runningJob && (
                <button
                  type="button"
                  onClick={handleCancelJob}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 whitespace-nowrap"
                >
                  <Square className="w-3.5 h-3.5" /> Cancel Generation
                </button>
              )}

              <button
                type="button"
                onClick={handleGenerateActivity}
                disabled={Boolean(runningJob) || generatingActivity || (counts?.syntheticUsers ?? 0) === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF] disabled:opacity-50 whitespace-nowrap"
              >
                <Activity className="w-3.5 h-3.5" />
                {generatingActivity ? 'Generating Activity...' : 'Generate Additional Demo Activity'}
              </button>

              <button
                type="button"
                onClick={() => loadStatus(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
          </div>

          {/* Active / Latest Job Progress Monitor */}
          {latest500kJob && (
            <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 font-semibold text-[#071426] dark:text-white">
                  <span>Status: <span className="uppercase text-[#258BFF] dark:text-[#B7F34A]">{latest500kJob.status}</span></span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {latest500kJob.generatedCount.toLocaleString()} / {latest500kJob.targetCount.toLocaleString()} users ({progressPct}%)
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    Activity: {latest500kJob.activityGeneratedCount.toLocaleString()}
                  </span>
                </div>
                <div className="text-[11px] text-[#8793A5] tabular-nums">
                  Avg Batch: {latest500kJob.avgBatchMs} ms · Peak RAM: {latest500kJob.peakMemoryMb} MB · DB Ping: {statusData?.system.dbLatencyMs ?? '--'} ms
                </div>
              </div>

              <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-[#258BFF] dark:bg-[#B7F34A] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#8793A5] tabular-nums">
                <span>Start Date: {new Date(latest500kJob.startedAt).toLocaleString()}</span>
                <span>
                  Completion Date:{' '}
                  {latest500kJob.completedAt
                    ? new Date(latest500kJob.completedAt).toLocaleString()
                    : latest500kJob.cancelledAt
                      ? `Cancelled ${new Date(latest500kJob.cancelledAt).toLocaleString()}`
                      : 'In progress'}
                </span>
                {latest500kJob.errorMessage && (
                  <span className="text-red-500 font-semibold">Error: {latest500kJob.errorMessage}</span>
                )}
              </div>
            </div>
          )}

          {/* Distribution Configuration */}
          {config && (
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8793A5]">
                  Distribution Configuration (Exact Total = 500,000 Users)
                </h3>
                <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-[#B7F34A]">
                  Verified Sum: {(freeExact + premiumExact).toLocaleString()} users
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Free Users % (Premium: {config.premiumPercent}%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={config.freePercent}
                    onChange={(e) => {
                      const f = Math.max(0, Math.min(100, Number(e.target.value)));
                      setConfig({ ...config, freePercent: f, premiumPercent: 100 - f });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
                  />
                  <div className="text-[11px] text-[#8793A5] mt-1 tabular-nums">
                    {freeExact.toLocaleString()} free · {premiumExact.toLocaleString()} premium
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Active Users % (Inactive: {config.inactivePercent}%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={config.activePercent}
                    onChange={(e) => {
                      const a = Math.max(0, Math.min(100, Number(e.target.value)));
                      setConfig({ ...config, activePercent: a, inactivePercent: 100 - a });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
                  />
                  <div className="text-[11px] text-[#8793A5] mt-1 tabular-nums">
                    {activeExact.toLocaleString()} active · {inactiveExact.toLocaleString()} inactive
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    New Regs 30d % (Older: {config.olderRegistrationsPercent}%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={config.newRegistrationsPercent}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(100, Number(e.target.value)));
                      setConfig({ ...config, newRegistrationsPercent: n, olderRegistrationsPercent: 100 - n });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
                  />
                  <div className="text-[11px] text-[#8793A5] mt-1 tabular-nums">
                    {newExact.toLocaleString()} recent · {olderExact.toLocaleString()} historical
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Linked Activity Scale
                  </label>
                  <select
                    value={config.activityScale}
                    onChange={(e) =>
                      setConfig({ ...config, activityScale: e.target.value as 'minimal' | 'standard' | 'heavy' })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                  >
                    <option value="minimal">Minimal (~8,000 linked events)</option>
                    <option value="standard">Standard (~25,000 linked events)</option>
                    <option value="heavy">Heavy (~50,000+ linked events)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Historical Start Date
                  </label>
                  <input
                    type="date"
                    value={config.dateRangeStart}
                    onChange={(e) => setConfig({ ...config, dateRangeStart: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Historical End Date
                  </label>
                  <input
                    type="date"
                    value={config.dateRangeEnd}
                    onChange={(e) => setConfig({ ...config, dateRangeEnd: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] tabular-nums"
                  />
                </div>
              </div>

              {/* Country & Language Weights */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 text-xs">
                <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-bold text-[#071426] dark:text-white">Country Distribution Weights (%)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {config.countries.map((c, idx) => (
                      <label key={c.country} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate">{c.country}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(c.percent)}
                          onChange={(e) => {
                            const next = [...config.countries];
                            next[idx] = { ...c, percent: Math.max(0, Number(e.target.value)) };
                            setConfig({ ...config, countries: next });
                          }}
                          className="w-16 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] tabular-nums"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-bold text-[#071426] dark:text-white">Preferred Language Weights (%)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {config.languages.map((l, idx) => (
                      <label key={l.code} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate">{l.label} ({l.code})</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(l.percent)}
                          onChange={(e) => {
                            const next = [...config.languages];
                            next[idx] = { ...l, percent: Math.max(0, Number(e.target.value)) };
                            setConfig({ ...config, languages: next });
                          }}
                          className="w-16 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] tabular-nums"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cleanup & Reset Controls */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#8793A5]">
              Cleanup deletes only rows where <span className="font-mono">is_synthetic = true</span>; genuine users and real transactions are never touched.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {confirmDeleteMode === 'none' ? (
                <>
                  <button
                    type="button"
                    disabled={Boolean(runningJob) || deleting || (counts?.syntheticUsers ?? 0) === 0}
                    onClick={() => setConfirmDeleteMode('delete')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Generated Demo Data
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(runningJob) || deleting}
                    onClick={() => setConfirmDeleteMode('reset')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-red-500 disabled:opacity-40 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset Demo Environment
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {confirmDeleteMode === 'reset'
                      ? 'Confirm full demo reset (data + job history)?'
                      : 'Confirm delete all synthetic records?'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteSynthetic(confirmDeleteMode === 'reset')}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMode('none')}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Linked Activity Breakdown */}
        <section className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
          <h2 className="font-bold text-sm text-[#071426] dark:text-white">Synthetic Activity Records Breakdown</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs tabular-nums">
            {[
              { label: 'Searches', val: counts?.syntheticSearches ?? 0 },
              { label: 'AI Requests', val: counts?.syntheticAiRequests ?? 0 },
              { label: 'Research Projects', val: counts?.syntheticProjects ?? 0 },
              { label: 'Saved Resources', val: counts?.syntheticSavedResources ?? 0 },
              { label: 'Video Interactions', val: counts?.syntheticVideoInteractions ?? 0 },
              { label: 'Notes Activity', val: counts?.syntheticNotes ?? 0 },
              { label: 'Feedback Tickets', val: counts?.syntheticFeedback ?? 0 },
              { label: 'Demo Subscriptions', val: counts?.syntheticSubscriptions ?? 0 },
              { label: 'Demo Payment Sims', val: counts?.syntheticPayments ?? 0 },
              { label: 'Ad Events', val: counts?.syntheticAdInteractions ?? 0 },
            ].map((item) => (
              <div
                key={item.label}
                className="p-3 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800"
              >
                <div className="text-[11px] text-[#8793A5]">{item.label}</div>
                <div className="font-bold text-[#071426] dark:text-white mt-0.5">{item.val.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Paginated Synthetic User Explorer + CSV Export */}
        <section className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-sm text-[#071426] dark:text-white">
                Generated Synthetic User Records ({pagination.total.toLocaleString()} matching)
              </h2>
              <p className="text-xs text-[#8793A5]">
                Server-side indexed pagination across 500,000+ records. Every record carries is_synthetic = true &amp; account_type = DEMO.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={pagination.total === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF] disabled:opacity-40 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" /> Export Filtered CSV
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 text-xs">
            <div className="lg:col-span-2 relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadUsers(1)}
                placeholder="Search fictional name or @example.com..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
            >
              <option value="all">All Tiers</option>
              <option value="free">Free</option>
              <option value="premium">Premium</option>
            </select>

            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
            >
              <option value="all">All Activity</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
            >
              <option value="all">All Countries</option>
              {(config?.countries || []).map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country}
                </option>
              ))}
            </select>

            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
            >
              <option value="all">All Languages</option>
              {(config?.languages || []).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} ({l.code})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => loadUsers(1)}
              className="px-3 py-2 rounded-xl bg-[#258BFF] text-white font-semibold hover:brightness-110"
            >
              Apply Filters
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[#8793A5] border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-3">Name &amp; Synthetic Email</th>
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 pr-3">Tier / Activity</th>
                  <th className="py-2 pr-3">Location</th>
                  <th className="py-2 pr-3">Lang / Source</th>
                  <th className="py-2">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {usersLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#8793A5]">
                      Loading paginated synthetic users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#8793A5]">
                      No synthetic users generated yet. Click &quot;Generate 500,000 Demo Users&quot; above.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-[#071426] dark:text-white">{u.full_name}</div>
                        <div className="text-[11px] font-mono text-[#8793A5]">{u.email}</div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                        {u.account_type}
                      </td>
                      <td className="py-2.5 pr-3">
                        {u.role} · {u.activity_status}
                      </td>
                      <td className="py-2.5 pr-3 text-[#8793A5]">
                        {u.city}, {u.country}
                      </td>
                      <td className="py-2.5 pr-3 text-[#8793A5]">
                        {u.preferred_language} · {u.registration_source}
                      </td>
                      <td className="py-2.5 text-[#8793A5]">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs pt-2">
            <span className="text-[#8793A5] tabular-nums">
              Page {pagination.page.toLocaleString()} of {pagination.totalPages.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1 || usersLoading}
                onClick={() => loadUsers(pagination.page - 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || usersLoading}
                onClick={() => loadUsers(pagination.page + 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* Section 4: Generation Job Logs & Batch Telemetry */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
            <h3 className="font-bold text-sm text-[#071426] dark:text-white">Recent Batch Telemetry</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto text-xs tabular-nums">
              {(statusData?.batches || []).length === 0 ? (
                <p className="text-[#8793A5]">No batches recorded yet.</p>
              ) : (
                statusData!.batches.map((b) => (
                  <div
                    key={b.id}
                    className="p-2.5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] flex items-center justify-between gap-2"
                  >
                    <span>
                      Batch #{b.batchNumber} · <span className="font-mono">{b.tableName}</span>
                    </span>
                    <span className="text-[#8793A5]">
                      {b.recordsInserted.toLocaleString()} rows · {b.durationMs} ms
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
            <h3 className="font-bold text-sm text-[#071426] dark:text-white">Generation Audit Logs</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto text-xs">
              {(statusData?.logs || []).length === 0 ? (
                <p className="text-[#8793A5]">No generation logs yet.</p>
              ) : (
                statusData!.logs.map((l) => (
                  <div key={l.id} className="p-2.5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] space-y-0.5">
                    <div className="font-medium text-[#071426] dark:text-white">{l.message}</div>
                    <div className="text-[11px] text-[#8793A5] tabular-nums">
                      {l.level.toUpperCase()} · {new Date(l.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {loading && <div className="text-xs text-[#8793A5]">Synchronizing synthetic data metrics...</div>}
      </div>
    </AdminLayout>
  );
};
