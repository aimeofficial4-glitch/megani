import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldCheck,
  Cookie,
  Cpu,
  Globe2,
  FolderLock,
  Download,
  Trash2,
  Mail,
  Phone,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sliders,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { useConsent } from '../context/ConsentContext';

interface PrivacySettingsResponse {
  preferences: {
    aiPersonalizationOptIn: boolean;
    aiHistoryRetention: boolean;
    searchHistoryTracking: boolean;
    researchDefaultVisibility: 'private' | 'workspace_only';
    deletionStatus: 'none' | 'requested' | 'cancelled' | 'completed';
    deletionRequestedAt: string | null;
    deletionReason: string | null;
  };
  consent: {
    id: string;
    policyVersion: string;
    action: string;
    necessary: boolean;
    analytics: boolean;
    personalization: boolean;
    advertising: boolean;
    consentedAt: string;
    updatedAt: string;
  } | null;
  aiPrivacy: {
    disclosure: string;
    essentialProcessingNote: string;
    providers: Array<{
      slug: string;
      name: string;
      enabled: boolean;
      configured: boolean;
    }>;
  };
  connectedServices: Array<{
    name: string;
    status: string;
    purpose: string;
  }>;
  researchSummary: {
    projects: number;
    savedItems: number;
    notes: number;
    aiThreads: number;
    searches: number;
  };
  privacyContact: {
    email: string;
    phone: string;
    organization: string;
  };
}

export const PrivacySettingsPage: React.FC = () => {
  const { user, addToast, logout } = useApp();
  const { consent, policyVersion, openCustomizeModal, rejectOptional, withdrawConsent, refreshConsent } = useConsent();
  const navigate = useNavigate();

  const [data, setData] = useState<PrivacySettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Editable preferences
  const [aiPersonalizationOptIn, setAiPersonalizationOptIn] = useState(false);
  const [aiHistoryRetention, setAiHistoryRetention] = useState(true);
  const [searchHistoryTracking, setSearchHistoryTracking] = useState(true);
  const [researchDefaultVisibility, setResearchDefaultVisibility] = useState<'private' | 'workspace_only'>('private');

  // Account deletion UI (inline confirmation, zero window.confirm)
  const [deletionReason, setDeletionReason] = useState('');
  const [showRequestConfirm, setShowRequestConfirm] = useState(false);
  const [showImmediateDeleteConfirm, setShowImmediateDeleteConfirm] = useState(false);
  const [submittingDeletion, setSubmittingDeletion] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<PrivacySettingsResponse>('/api/privacy/settings');
      setData(res);
      setAiPersonalizationOptIn(Boolean(res.preferences.aiPersonalizationOptIn));
      setAiHistoryRetention(Boolean(res.preferences.aiHistoryRetention));
      setSearchHistoryTracking(Boolean(res.preferences.searchHistoryTracking));
      setResearchDefaultVisibility(
        res.preferences.researchDefaultVisibility === 'workspace_only' ? 'workspace_only' : 'private'
      );
    } catch (err: any) {
      addToast(err.message || 'Unable to load privacy settings.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (!user) return null;

  const handleSavePrivacyPrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    try {
      const res = await apiFetch<{ preferences: PrivacySettingsResponse['preferences'] }>('/api/privacy/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          aiPersonalizationOptIn,
          aiHistoryRetention,
          searchHistoryTracking,
          researchDefaultVisibility,
        }),
      });
      setData((prev) => (prev ? { ...prev, preferences: res.preferences } : prev));
      addToast('AI and research privacy preferences saved.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save privacy settings.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleDownloadData = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/privacy/export', { credentials: 'include' });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to export personal data.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `2mr-my-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      addToast('Your personal data archive (JSON) has been downloaded.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Download failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleSubmitDeletionRequest = async () => {
    setSubmittingDeletion(true);
    try {
      const res = await apiFetch<{ preferences: PrivacySettingsResponse['preferences']; message: string }>(
        '/api/privacy/deletion-request',
        {
          method: 'POST',
          body: JSON.stringify({ reason: deletionReason.trim() || undefined }),
        }
      );
      setData((prev) => (prev ? { ...prev, preferences: res.preferences } : prev));
      setShowRequestConfirm(false);
      setDeletionReason('');
      addToast(res.message || 'Account deletion request recorded.', 'info');
    } catch (err: any) {
      addToast(err.message || 'Unable to submit deletion request.', 'error');
    } finally {
      setSubmittingDeletion(false);
    }
  };

  const handleCancelDeletionRequest = async () => {
    setSubmittingDeletion(true);
    try {
      const res = await apiFetch<{ preferences: PrivacySettingsResponse['preferences'] | null; message: string }>(
        '/api/privacy/deletion-request',
        { method: 'DELETE' }
      );
      if (res.preferences) {
        setData((prev) => (prev ? { ...prev, preferences: res.preferences! } : prev));
      }
      addToast('Account deletion request cancelled.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Unable to cancel deletion request.', 'error');
    } finally {
      setSubmittingDeletion(false);
    }
  };

  const handleImmediateSelfDelete = async () => {
    setSubmittingDeletion(true);
    try {
      await apiFetch('/api/user/account', { method: 'DELETE' });
      await logout();
      navigate('/');
    } catch (err: any) {
      addToast(err.message || 'Unable to delete account.', 'error');
      setSubmittingDeletion(false);
    }
  };

  const activeConsent = consent || data?.consent;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            to="/dashboard/settings"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#258BFF] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Account Settings
          </Link>
          <div className="flex items-center gap-2 pt-1">
            <ShieldCheck className="w-6 h-6 text-[#258BFF] dark:text-[#B7F34A]" />
            <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">
              Privacy &amp; Cookie Settings
            </h1>
          </div>
          <p className="text-xs text-[#8793A5]">
            Manage your cookie consent, AI processing transparency, saved research privacy, and personal data rights.
          </p>
        </div>

        <Link
          to="/privacy"
          className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs font-semibold hover:border-[#258BFF]"
        >
          Read Full Privacy Policy
        </Link>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-[#258BFF]" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. Cookie Preferences */}
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[#071426] dark:text-white flex items-center gap-2">
                  <Cookie className="w-5 h-5 text-[#258BFF] dark:text-[#B7F34A]" />
                  Cookie Preferences
                </h2>
                <p className="text-xs text-[#8793A5] mt-0.5">
                  Policy Version <span className="font-mono">{activeConsent?.policyVersion || policyVersion}</span> ·{' '}
                  {activeConsent?.updatedAt
                    ? `Last updated ${new Date(activeConsent.updatedAt).toLocaleString()}`
                    : 'No optional consent active'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openCustomizeModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold hover:brightness-110"
                >
                  <Sliders className="w-3.5 h-3.5" /> Customize Settings
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await rejectOptional();
                    await refreshConsent();
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold hover:border-[#258BFF]"
                >
                  Reject Optional Cookies
                </button>
                {activeConsent && activeConsent.action !== 'withdrawn' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await withdrawConsent();
                      await refreshConsent();
                    }}
                    className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-semibold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Withdraw Consent
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {[
                {
                  name: 'Strictly Necessary',
                  active: true,
                  note: 'Always active (Auth & Security)',
                },
                {
                  name: 'Analytics Cookies',
                  active: Boolean(activeConsent?.analytics),
                  note: 'Usage & performance telemetry',
                },
                {
                  name: 'Personalization Cookies',
                  active: Boolean(activeConsent?.personalization),
                  note: 'Theme & language persistence',
                },
                {
                  name: 'Advertising Cookies',
                  active: Boolean(activeConsent?.advertising),
                  note: 'Guest/Free discovery ad measurement',
                },
              ].map((cat) => (
                <div
                  key={cat.name}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#071426] dark:text-white">{cat.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        cat.active
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-[#B7F34A]'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {cat.active ? 'Active' : 'Off'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8793A5]">{cat.note}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 2. AI Privacy & Research Controls */}
          <form
            onSubmit={handleSavePrivacyPrefs}
            className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5"
          >
            <div>
              <h2 className="text-lg font-bold text-[#071426] dark:text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-[#258BFF] dark:text-[#B7F34A]" />
                AI Privacy Controls &amp; Processing Transparency
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                {data?.aiPrivacy.disclosure}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-[#071426] text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
              <strong className="text-[#071426] dark:text-white">Important Service Processing Notice:</strong>{' '}
              {data?.aiPrivacy.essentialProcessingNote}
            </div>

            <div className="space-y-3">
              <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] cursor-pointer">
                <div>
                  <p className="text-sm font-bold text-[#071426] dark:text-white">
                    Optional AI Response Personalization
                  </p>
                  <p className="text-xs text-[#8793A5]">
                    Allow 2MR to tailor follow-up recommendations based on your recent saved workspace topics.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={aiPersonalizationOptIn}
                  onChange={(e) => setAiPersonalizationOptIn(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#258BFF]"
                />
              </label>

              <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] cursor-pointer">
                <div>
                  <p className="text-sm font-bold text-[#071426] dark:text-white">Retain AI Conversation History</p>
                  <p className="text-xs text-[#8793A5]">
                    When disabled, Ask 2MR still answers your questions in real time without saving new conversation threads to your account history.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={aiHistoryRetention}
                  onChange={(e) => setAiHistoryRetention(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#258BFF]"
                />
              </label>

              <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] cursor-pointer">
                <div>
                  <p className="text-sm font-bold text-[#071426] dark:text-white">Save Personal Search History</p>
                  <p className="text-xs text-[#8793A5]">
                    Control whether queries executed while signed in are added to your personal search history log.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={searchHistoryTracking}
                  onChange={(e) => setSearchHistoryTracking(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#258BFF]"
                />
              </label>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#071426] dark:text-white flex items-center gap-1.5">
                    <FolderLock className="w-4 h-4 text-[#258BFF]" /> Saved Research Default Visibility
                  </p>
                  <p className="text-xs text-[#8793A5]">
                    Your {data?.researchSummary.projects || 0} research projects, {data?.researchSummary.savedItems || 0} saved items, and{' '}
                    {data?.researchSummary.notes || 0} notes remain private to your account.
                  </p>
                </div>
                <select
                  value={researchDefaultVisibility}
                  onChange={(e) =>
                    setResearchDefaultVisibility(e.target.value === 'workspace_only' ? 'workspace_only' : 'private')
                  }
                  className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs font-semibold"
                >
                  <option value="private">Strictly Private (Owner Only)</option>
                  <option value="workspace_only">Workspace Notes Only</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-[#8793A5]">
                Configured Official AI Engines
              </p>
              <div className="flex flex-wrap gap-2">
                {(data?.aiPrivacy.providers || []).map((prov) => (
                  <span
                    key={prov.slug}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                      prov.enabled && prov.configured
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-[#B7F34A]'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] text-[#8793A5]'
                    }`}
                  >
                    {prov.name} · {prov.enabled ? (prov.configured ? 'Active Official API' : 'Enabled') : 'Disabled'}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPrefs}
              className="px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold hover:brightness-95 inline-flex items-center gap-2 disabled:opacity-60"
            >
              {savingPrefs && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save AI &amp; Research Privacy Preferences
            </button>
          </form>

          {/* 3. Connected Third-Party Services */}
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
            <h2 className="text-lg font-bold text-[#071426] dark:text-white flex items-center gap-2">
              <Globe2 className="w-5 h-5 text-[#258BFF] dark:text-[#B7F34A]" />
              Connected Services &amp; External Disclosures
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(data?.connectedServices || []).map((svc) => (
                <div
                  key={svc.name}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-[#071426] dark:text-white">{svc.name}</p>
                    <span className="text-[10px] font-semibold text-[#258BFF] dark:text-[#B7F34A]">{svc.status}</span>
                  </div>
                  <p className="text-xs text-[#8793A5] leading-relaxed">{svc.purpose}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 4. Data Export & Account Deletion Rights */}
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
            <h2 className="text-lg font-bold text-[#071426] dark:text-white">Your Personal Data Rights</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Download My Data */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] flex flex-col justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#071426] dark:text-white">Download My Data</h3>
                  <p className="text-xs text-[#8793A5] leading-relaxed">
                    Export a portable JSON archive containing your profile, consent history, research projects, saved library items, notes, AI conversations, and search history. Passwords and credentials are never included.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadData}
                  disabled={exporting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#258BFF] text-white text-xs font-semibold hover:brightness-110 disabled:opacity-60"
                >
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Download My Data (.json)
                </button>
              </div>

              {/* Request Account Deletion */}
              <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-[#F5F7FA] dark:bg-[#071426] flex flex-col justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400">Request Account Deletion</h3>
                  <p className="text-xs text-[#8793A5] leading-relaxed">
                    Submit a formal account deletion request for privacy review, or immediately erase a non-admin account.
                  </p>
                </div>

                {user.role === 'admin' ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                    Official administrator accounts are protected from self-deletion.
                  </p>
                ) : data?.preferences.deletionStatus === 'requested' ? (
                  <div className="space-y-2.5">
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Deletion request active (submitted{' '}
                        {data.preferences.deletionRequestedAt
                          ? new Date(data.preferences.deletionRequestedAt).toLocaleDateString()
                          : 'recently'}
                        ).
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelDeletionRequest}
                      disabled={submittingDeletion}
                      className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold hover:border-[#258BFF]"
                    >
                      Cancel Deletion Request
                    </button>
                  </div>
                ) : showRequestConfirm ? (
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      value={deletionReason}
                      onChange={(e) => setDeletionReason(e.target.value)}
                      placeholder="Optional reason for deletion request..."
                      className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSubmitDeletionRequest}
                        disabled={submittingDeletion}
                        className="px-3.5 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold"
                      >
                        Confirm Deletion Request
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRequestConfirm(false)}
                        className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : showImmediateDeleteConfirm ? (
                  <div className="space-y-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                    <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" /> Permanently delete all data now?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleImmediateSelfDelete}
                        disabled={submittingDeletion}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                      >
                        Yes, Erase Account
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowImmediateDeleteConfirm(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-semibold"
                      >
                        Keep Account
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRequestConfirm(true)}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
                    >
                      Request Account Deletion
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowImmediateDeleteConfirm(true)}
                      className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Erase Now
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 5. Privacy Contact Details */}
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-[#071426] dark:text-white">2MR Data Protection &amp; Privacy Contact</h2>
              <p className="text-xs text-[#8793A5]">
                Contact our privacy governance team directly regarding consent records, data access, or account deletion.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
              <a
                href={`mailto:${data?.privacyContact.email || '2mr@proton.me'}`}
                className="inline-flex items-center gap-1.5 text-[#258BFF] hover:underline"
              >
                <Mail className="w-4 h-4" /> {data?.privacyContact.email || '2mr@proton.me'}
              </a>
              <span className="inline-flex items-center gap-1.5 text-[#071426] dark:text-white">
                <Phone className="w-4 h-4 text-[#258BFF]" /> {data?.privacyContact.phone || '0780558358'}
              </span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
