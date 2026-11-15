import React, { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Calendar,
  CheckCircle2,
  Eye,
  Globe,
  Megaphone,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

interface CoreFeatureItem {
  name: string;
  description: string;
}

interface BrandKnowledgeData {
  id: string;
  officialName: string;
  shortName: string;
  acronymMeaning: string;
  founderName: string;
  founderTitle: string;
  founderBio: string;
  slogan: string;
  vision: string;
  mission: string;
  purpose: string;
  originStory: string;
  coreFeatures: CoreFeatureItem[];
  supportedLanguages: string[];
  officialFoundingDate: string | null;
  publicLaunchDate: string | null;
  developmentStartDate: string | null;
  contactEmail: string;
  contactPhone: string;
  isPublished: boolean;
  updatedAt: string;
}

interface BrandAnnouncementItem {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  announcementDate: string;
  isPublished: boolean;
  createdAt: string;
}

interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  createdAt: string;
  details?: Record<string, unknown>;
}

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatDateReadable(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (monthIdx < 0 || monthIdx > 11) return s;
  return `${day} ${MONTHS_EN[monthIdx]} ${m[1]}`;
}

export const AdminBrandKnowledgePage: React.FC = () => {
  const { addToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'identity' | 'announcements' | 'preview'>('identity');

  const [form, setForm] = useState<BrandKnowledgeData | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const [announcements, setAnnouncements] = useState<BrandAnnouncementItem[]>([]);
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);

  const [newLanguage, setNewLanguage] = useState('');
  const [newAnnTitle, setNewAnnTitle] = useState('');
  const [newAnnCategory, setNewAnnCategory] = useState('official_update');
  const [newAnnDate, setNewAnnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newAnnSummary, setNewAnnSummary] = useState('');
  const [newAnnBody, setNewAnnBody] = useState('');
  const [newAnnPublished, setNewAnnPublished] = useState(true);
  const [creatingAnn, setCreatingAnn] = useState(false);
  const [confirmDeleteAnnId, setConfirmDeleteAnnId] = useState<string | null>(null);

  const [liveTestQuery, setLiveTestQuery] = useState('Who created 2MR and when was it founded?');
  const [liveTesting, setLiveTesting] = useState(false);
  const [liveTestResult, setLiveTestResult] = useState<{
    directAnswer: string;
    detailedExplanation: string;
    sourcesCount: number;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{
        brand: BrandKnowledgeData;
        announcements: BrandAnnouncementItem[];
        auditHistory: AuditEntry[];
      }>('/api/admin/brand-knowledge');
      setForm(data.brand);
      setSavedSnapshot(JSON.stringify(data.brand));
      setAnnouncements(data.announcements || []);
      setAuditHistory(data.auditHistory || []);
    } catch (err: any) {
      addToast(err.message || 'Failed to load official brand knowledge.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const hasUnsavedChanges = useMemo(() => {
    if (!form) return false;
    return JSON.stringify(form) !== savedSnapshot;
  }, [form, savedSnapshot]);

  const handlePublishChanges = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const res = await apiFetch<{
        brand: BrandKnowledgeData;
        announcements: BrandAnnouncementItem[];
      }>('/api/admin/brand-knowledge', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setForm(res.brand);
      setSavedSnapshot(JSON.stringify(res.brand));
      addToast('Official 2MR knowledge saved & published across AI and public pages.', 'success');
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to save brand knowledge.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addLanguage = () => {
    if (!form) return;
    const clean = newLanguage.trim();
    if (!clean) return;
    if (form.supportedLanguages.some((l) => l.toLowerCase() === clean.toLowerCase())) {
      setNewLanguage('');
      return;
    }
    setForm({
      ...form,
      supportedLanguages: [...form.supportedLanguages, clean],
    });
    setNewLanguage('');
  };

  const removeLanguage = (lang: string) => {
    if (!form || form.supportedLanguages.length <= 1) return;
    setForm({
      ...form,
      supportedLanguages: form.supportedLanguages.filter((l) => l !== lang),
    });
  };

  const updateFeature = (idx: number, field: keyof CoreFeatureItem, value: string) => {
    if (!form) return;
    const next = [...form.coreFeatures];
    next[idx] = { ...next[idx], [field]: value };
    setForm({ ...form, coreFeatures: next });
  };

  const addFeature = () => {
    if (!form) return;
    setForm({
      ...form,
      coreFeatures: [
        ...form.coreFeatures,
        { name: 'New 2MR Capability', description: 'Describe what this workspace enables.' },
      ],
    });
  };

  const removeFeature = (idx: number) => {
    if (!form || form.coreFeatures.length <= 1) return;
    setForm({
      ...form,
      coreFeatures: form.coreFeatures.filter((_, i) => i !== idx),
    });
  };

  const createAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnTitle.trim() || !newAnnSummary.trim()) {
      addToast('Please provide an announcement title and summary.', 'error');
      return;
    }
    setCreatingAnn(true);
    try {
      await apiFetch('/api/admin/brand-knowledge/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: newAnnTitle.trim(),
          category: newAnnCategory,
          announcementDate: newAnnDate,
          summary: newAnnSummary.trim(),
          body: newAnnBody.trim() || newAnnSummary.trim(),
          isPublished: newAnnPublished,
        }),
      });
      setNewAnnTitle('');
      setNewAnnSummary('');
      setNewAnnBody('');
      addToast('Official announcement created and synced with AI knowledge.', 'success');
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to publish announcement.', 'error');
    } finally {
      setCreatingAnn(false);
    }
  };

  const toggleAnnouncementPublish = async (ann: BrandAnnouncementItem) => {
    try {
      await apiFetch(`/api/admin/brand-knowledge/announcements/${ann.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublished: !ann.isPublished }),
      });
      addToast(
        !ann.isPublished ? 'Announcement published to About & AI.' : 'Announcement moved to draft.',
        'success'
      );
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to toggle status.', 'error');
    }
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      await apiFetch(`/api/admin/brand-knowledge/announcements/${id}`, {
        method: 'DELETE',
      });
      setConfirmDeleteAnnId(null);
      addToast('Announcement deleted.', 'info');
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to delete announcement.', 'error');
    }
  };

  const runLiveAiTest = async () => {
    if (!liveTestQuery.trim()) return;
    setLiveTesting(true);
    setLiveTestResult(null);
    try {
      const res = await apiFetch<{ data?: any; externalSourcesCheckedCount?: number }>(
        '/api/ai/smart-answer',
        {
          method: 'POST',
          body: JSON.stringify({
            query: liveTestQuery.trim(),
            mode: 'ask',
            researchDepth: 'fast',
          }),
        }
      );
      setLiveTestResult({
        directAnswer: res.data?.directAnswer || '',
        detailedExplanation: res.data?.detailedExplanation || '',
        sourcesCount: res.externalSourcesCheckedCount || res.data?.retrievedSources?.length || 0,
      });
    } catch (err: any) {
      addToast(err.message || 'Live AI verification test failed.', 'error');
    } finally {
      setLiveTesting(false);
    }
  };

  const previewFounding = formatDateReadable(form?.officialFoundingDate);
  const previewLaunch = formatDateReadable(form?.publicLaunchDate);
  const previewDevStart = formatDateReadable(form?.developmentStartDate);

  return (
    <AdminLayout
      title="Brand Knowledge & AI Identity"
      subtitle="Manage official 2MR company facts, founder biography, milestone dates, features, announcements, and review updates before publishing."
    >
      {loading || !form ? (
        <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex items-center gap-3 text-sm text-[#8793A5]">
          <RefreshCw className="w-4 h-4 animate-spin text-[#258BFF]" />
          Loading official 2MR knowledge base...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('identity')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'identity'
                    ? 'bg-[#258BFF] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071426]'
                }`}
              >
                Identity, Dates &amp; Features
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('announcements')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'announcements'
                    ? 'bg-[#258BFF] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071426]'
                }`}
              >
                Official Announcements ({announcements.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'preview'
                    ? 'bg-[#258BFF] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#071426]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Review Before Publishing
              </button>
            </div>

            <div className="flex items-center gap-3">
              {hasUnsavedChanges && (
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Unsaved draft changes
                </span>
              )}
              <button
                type="button"
                onClick={() => handlePublishChanges()}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-extrabold hover:brightness-105 disabled:opacity-60 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Publishing...' : 'Publish Changes'}
              </button>
            </div>
          </div>

          {/* Tab 1: Identity, Dates, Founder, Languages & Features */}
          {activeTab === 'identity' && (
            <form onSubmit={handlePublishChanges} className="space-y-6">
              {/* Official Identity */}
              <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <BookMarked className="w-4 h-4 text-[#258BFF]" />
                  <h2 className="text-sm font-bold text-[#071426] dark:text-white uppercase tracking-wider">
                    Official Company &amp; Platform Identity
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Official Name</span>
                    <input
                      type="text"
                      value={form.officialName}
                      onChange={(e) => setForm({ ...form, officialName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                      required
                    />
                  </label>
                  <label className="space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Short Acronym</span>
                    <input
                      type="text"
                      value={form.shortName}
                      onChange={(e) => setForm({ ...form, shortName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                      required
                    />
                  </label>
                  <label className="space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Meaning of 2MR</span>
                    <input
                      type="text"
                      value={form.acronymMeaning}
                      onChange={(e) => setForm({ ...form, acronymMeaning: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                      required
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Official Slogan</span>
                    <input
                      type="text"
                      value={form.slogan}
                      onChange={(e) => setForm({ ...form, slogan: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                      required
                    />
                  </label>
                  <label className="space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Vision</span>
                    <input
                      type="text"
                      value={form.vision}
                      onChange={(e) => setForm({ ...form, vision: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                      required
                    />
                  </label>
                </div>

                <label className="block space-y-1.5 text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Purpose</span>
                  <textarea
                    rows={2}
                    value={form.purpose}
                    onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                    required
                  />
                </label>

                <label className="block space-y-1.5 text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Mission Statement</span>
                  <textarea
                    rows={2}
                    value={form.mission}
                    onChange={(e) => setForm({ ...form, mission: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                    required
                  />
                </label>

                <label className="block space-y-1.5 text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Origin Story</span>
                  <textarea
                    rows={3}
                    value={form.originStory}
                    onChange={(e) => setForm({ ...form, originStory: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                    required
                  />
                </label>
              </section>

              {/* Official Dates */}
              <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#B7F34A]" />
                    <h2 className="text-sm font-bold text-[#071426] dark:text-white uppercase tracking-wider">
                      Official Timeline Dates (Strictly Separated)
                    </h2>
                  </div>
                  <span className="text-[11px] text-[#8793A5]">
                    Empty fields are treated by AI as not yet publicly confirmed.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#071426] dark:text-white">
                        Official Founding Date
                      </label>
                      {form.officialFoundingDate && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, officialFoundingDate: null })}
                          className="text-[11px] text-[#8793A5] hover:text-red-500"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={form.officialFoundingDate || ''}
                      onChange={(e) =>
                        setForm({ ...form, officialFoundingDate: e.target.value || null })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs text-[#071426] dark:text-white tabular-nums"
                    />
                    <p className="text-[11px] text-[#8793A5]">
                      {previewFounding
                        ? `Displayed: ${previewFounding}`
                        : 'Status: Not yet publicly confirmed'}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#071426] dark:text-white">
                        Public Launch Date
                      </label>
                      {form.publicLaunchDate && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, publicLaunchDate: null })}
                          className="text-[11px] text-[#8793A5] hover:text-red-500"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={form.publicLaunchDate || ''}
                      onChange={(e) =>
                        setForm({ ...form, publicLaunchDate: e.target.value || null })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs text-[#071426] dark:text-white tabular-nums"
                    />
                    <p className="text-[11px] text-[#8793A5]">
                      {previewLaunch
                        ? `Displayed: ${previewLaunch}`
                        : 'Status: Not yet publicly confirmed'}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#071426] dark:text-white">
                        Development Start Date
                      </label>
                      {form.developmentStartDate && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, developmentStartDate: null })}
                          className="text-[11px] text-[#8793A5] hover:text-red-500"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={form.developmentStartDate || ''}
                      onChange={(e) =>
                        setForm({ ...form, developmentStartDate: e.target.value || null })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs text-[#071426] dark:text-white tabular-nums"
                    />
                    <p className="text-[11px] text-[#8793A5]">
                      {previewDevStart
                        ? `Displayed: ${previewDevStart}`
                        : 'Status: Not configured'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Founder & Public Contact */}
              <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <UserCheck className="w-4 h-4 text-[#258BFF]" />
                  <h2 className="text-sm font-bold text-[#071426] dark:text-white uppercase tracking-wider">
                    Founder &amp; Creator Profile
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Founder &amp; Creator Name</span>
                    <input
                      type="text"
                      value={form.founderName}
                      onChange={(e) => setForm({ ...form, founderName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                      required
                    />
                  </label>
                  <label className="space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Official Title</span>
                    <input
                      type="text"
                      value={form.founderTitle}
                      onChange={(e) => setForm({ ...form, founderTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                      required
                    />
                  </label>
                </div>

                <label className="block space-y-1.5 text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Founder Biography</span>
                  <textarea
                    rows={3}
                    value={form.founderBio}
                    onChange={(e) => setForm({ ...form, founderBio: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                    required
                  />
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Public Support Email</span>
                    <input
                      type="email"
                      value={form.contactEmail}
                      onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                      required
                    />
                  </label>
                  <label className="space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Public Support Phone</span>
                    <input
                      type="text"
                      value={form.contactPhone}
                      onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                      required
                    />
                  </label>
                </div>
              </section>

              {/* Supported Languages */}
              <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <Globe className="w-4 h-4 text-[#258BFF]" />
                  <h2 className="text-sm font-bold text-[#071426] dark:text-white uppercase tracking-wider">
                    Supported AI &amp; Platform Languages
                  </h2>
                </div>

                <div className="flex flex-wrap gap-2">
                  {form.supportedLanguages.map((lang) => (
                    <span
                      key={lang}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs font-semibold text-[#071426] dark:text-white"
                    >
                      {lang}
                      {form.supportedLanguages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLanguage(lang)}
                          aria-label={`Remove ${lang}`}
                          className="text-[#8793A5] hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 max-w-sm">
                  <input
                    type="text"
                    value={newLanguage}
                    onChange={(e) => setNewLanguage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addLanguage();
                      }
                    }}
                    placeholder="Add language (e.g. Arabic)..."
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs text-[#071426] dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={addLanguage}
                    className="px-3.5 py-2 rounded-lg bg-[#258BFF] text-white text-xs font-bold hover:brightness-110"
                  >
                    Add
                  </button>
                </div>
              </section>

              {/* Main Features */}
              <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#B7F34A]" />
                    <h2 className="text-sm font-bold text-[#071426] dark:text-white uppercase tracking-wider">
                      Official 2MR Core Features ({form.coreFeatures.length})
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={addFeature}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-[#071426] dark:text-white hover:bg-slate-100 dark:hover:bg-[#071426]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Feature
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {form.coreFeatures.map((feat, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#258BFF] tabular-nums">
                          Feature #{idx + 1}
                        </span>
                        {form.coreFeatures.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeFeature(idx)}
                            className="text-[#8793A5] hover:text-red-500"
                            title="Remove feature"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={feat.name}
                        onChange={(e) => updateFeature(idx, 'name', e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs font-semibold text-[#071426] dark:text-white"
                      />
                      <textarea
                        rows={2}
                        value={feat.description}
                        onChange={(e) => updateFeature(idx, 'description', e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs text-slate-600 dark:text-slate-300"
                      />
                    </div>
                  ))}
                </div>
              </section>
            </form>
          )}

          {/* Tab 2: Official Announcements */}
          {activeTab === 'announcements' && (
            <div className="space-y-6">
              <form
                onSubmit={createAnnouncement}
                className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4"
              >
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <Megaphone className="w-4 h-4 text-[#258BFF]" />
                  <h2 className="text-sm font-bold text-[#071426] dark:text-white uppercase tracking-wider">
                    Publish Official 2MR Announcement
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="md:col-span-2 space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Title</span>
                    <input
                      type="text"
                      value={newAnnTitle}
                      onChange={(e) => setNewAnnTitle(e.target.value)}
                      placeholder="e.g., Official 2MR Founding Milestone Confirmed"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                      required
                    />
                  </label>
                  <label className="space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Date</span>
                    <input
                      type="date"
                      value={newAnnDate}
                      onChange={(e) => setNewAnnDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white tabular-nums"
                      required
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Category</span>
                    <select
                      value={newAnnCategory}
                      onChange={(e) => setNewAnnCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                    >
                      <option value="official_update">Official Update</option>
                      <option value="launch_notice">Launch Notice</option>
                      <option value="milestone">Platform Milestone</option>
                      <option value="policy">Policy &amp; Trust</option>
                    </select>
                  </label>
                  <label className="md:col-span-2 space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Short Summary</span>
                    <input
                      type="text"
                      value={newAnnSummary}
                      onChange={(e) => setNewAnnSummary(e.target.value)}
                      placeholder="Concise one-sentence summary cited by 2MR AI..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                      required
                    />
                  </label>
                </div>

                <label className="block space-y-1.5 text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Detailed Body</span>
                  <textarea
                    rows={3}
                    value={newAnnBody}
                    onChange={(e) => setNewAnnBody(e.target.value)}
                    placeholder="Full official statement for the About page and AI synthesis..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[#071426] dark:text-white"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAnnPublished}
                      onChange={(e) => setNewAnnPublished(e.target.checked)}
                      className="rounded border-slate-400"
                    />
                    Publish immediately to 2MR AI &amp; About page
                  </label>
                  <button
                    type="submit"
                    disabled={creatingAnn}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-bold hover:brightness-110 disabled:opacity-60"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {creatingAnn ? 'Saving...' : 'Add Announcement'}
                  </button>
                </div>
              </form>

              <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
                <h3 className="text-sm font-bold text-[#071426] dark:text-white uppercase tracking-wider">
                  Announcements Registry
                </h3>
                {announcements.length === 0 ? (
                  <p className="text-xs text-[#8793A5]">
                    No official announcements yet. Create one above to share verified updates across 2MR.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {announcements.map((ann) => (
                      <div
                        key={ann.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                            <span className="tabular-nums text-[#258BFF]">{ann.announcementDate}</span>
                            <span className="text-[#8793A5]">· {ann.category}</span>
                            <span
                              className={
                                ann.isPublished
                                  ? 'text-emerald-600 dark:text-[#B7F34A]'
                                  : 'text-amber-600 dark:text-amber-400'
                              }
                            >
                              · {ann.isPublished ? 'Published' : 'Draft'}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-[#071426] dark:text-white">{ann.title}</h4>
                          <p className="text-xs text-slate-600 dark:text-slate-300">{ann.summary}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleAnnouncementPublish(ann)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-[#071426] dark:text-white hover:bg-slate-200 dark:hover:bg-[#10243D]"
                          >
                            {ann.isPublished ? 'Unpublish' : 'Publish'}
                          </button>
                          {confirmDeleteAnnId === ann.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => deleteAnnouncement(ann.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAnnId(null)}
                                className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAnnId(ann.id)}
                              className="p-1.5 rounded-lg text-[#8793A5] hover:text-red-500"
                              title="Delete announcement"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Tab 3: Review Before Publishing & Live AI Test */}
          {activeTab === 'preview' && (
            <div className="space-y-6">
              <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h2 className="text-sm font-bold text-[#071426] dark:text-white uppercase tracking-wider">
                      Draft Preview Before Publishing
                    </h2>
                    <p className="text-xs text-[#8793A5]">
                      Verify exact answers 2MR AI and `/about` will present based on your current draft fields.
                    </p>
                  </div>
                  {hasUnsavedChanges && (
                    <button
                      type="button"
                      onClick={() => handlePublishChanges()}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-extrabold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {saving ? 'Publishing...' : 'Approve & Publish Now'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#258BFF]">
                      Q: Who created 2MR?
                    </p>
                    <p className="text-xs text-[#071426] dark:text-slate-200 leading-relaxed">
                      {form.officialName} was founded and created by {form.founderName} ({form.founderTitle}).
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#258BFF]">
                      Q: When was 2MR created / founded?
                    </p>
                    <p className="text-xs text-[#071426] dark:text-slate-200 leading-relaxed">
                      {previewFounding
                        ? `${form.officialName} was founded on ${previewFounding} by ${form.founderName}.`
                        : 'The official founding or launch date of 2MR has not yet been publicly confirmed.'}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#258BFF]">
                      Q: When was 2MR publicly launched?
                    </p>
                    <p className="text-xs text-[#071426] dark:text-slate-200 leading-relaxed">
                      {previewLaunch
                        ? `${form.officialName} publicly launched on ${previewLaunch}.`
                        : 'The official public launch date of 2MR has not yet been publicly confirmed. Please check the official 2MR announcements for verified updates.'}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#258BFF]">
                      Q: What does 2MR stand for?
                    </p>
                    <p className="text-xs text-[#071426] dark:text-slate-200 leading-relaxed">
                      2MR stands for &ldquo;{form.acronymMeaning}&rdquo; ({form.officialName}). Official slogan: &ldquo;{form.slogan}&rdquo;.
                    </p>
                  </div>
                </div>
              </section>

              {/* Live Published AI Check */}
              <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
                <h3 className="text-sm font-bold text-[#071426] dark:text-white uppercase tracking-wider">
                  Live Published AI Verification Check
                </h3>
                <p className="text-xs text-[#8793A5]">
                  Query the live `/api/ai/smart-answer` endpoint to verify published knowledge in English, Kinyarwanda, or French.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={liveTestQuery}
                    onChange={(e) => setLiveTestQuery(e.target.value)}
                    placeholder="Ask a test question..."
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs text-[#071426] dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={runLiveAiTest}
                    disabled={liveTesting}
                    className="px-4 py-2 rounded-lg bg-[#258BFF] text-white text-xs font-bold hover:brightness-110 disabled:opacity-60 whitespace-nowrap"
                  >
                    {liveTesting ? 'Testing AI...' : 'Run Live AI Check'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Who created 2MR?',
                    'When was 2MR created?',
                    'When was 2MR launched?',
                    'Ninde wakoze 2MR?',
                    'Que signifie 2MR ?',
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setLiveTestQuery(q)}
                      className="px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:border-[#258BFF]"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {liveTestResult && (
                  <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                    <div className="text-[11px] font-bold text-emerald-600 dark:text-[#B7F34A]">
                      Verified Response ({liveTestResult.sourcesCount} official knowledge source(s) cited)
                    </div>
                    <p className="text-xs font-semibold text-[#071426] dark:text-white">
                      {liveTestResult.directAnswer}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line">
                      {liveTestResult.detailedExplanation}
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Recent Audit Logs */}
          {auditHistory.length > 0 && (
            <section className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8793A5]">
                Recent Brand Knowledge Audit Trail
              </h3>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {auditHistory.slice(0, 6).map((log) => (
                  <div key={log.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-[#071426] dark:text-white">{log.action}</span>
                      <span className="text-[#8793A5]"> · {log.actorEmail}</span>
                    </div>
                    <span className="text-[11px] text-[#8793A5] tabular-nums">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AdminLayout>
  );
};
