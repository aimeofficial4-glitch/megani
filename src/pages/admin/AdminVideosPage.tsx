import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Flag,
  FolderPlus,
  Loader2,
  Megaphone,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { VideoAdSettingsRecord, VideoCategoryRecord } from '../../types';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'pending_review', label: 'Pending Review' },
  { id: 'processing', label: 'Processing' },
  { id: 'approved', label: 'Approved' },
  { id: 'published', label: 'Published' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'archived', label: 'Archived' },
];

export const AdminVideosPage: React.FC = () => {
  const { addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'catalog' | 'categories' | 'reports' | 'sources'>('catalog');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQ, setSearchQ] = useState('');

  const [videos, setVideos] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [categories, setCategories] = useState<VideoCategoryRecord[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState({
    totalVideos: 0,
    pendingReview: 0,
    published: 0,
    totalViews: 0,
    openReports: 0,
  });
  const [loading, setLoading] = useState(true);

  // Modals
  const [previewVideo, setPreviewVideo] = useState<any | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    categorySlug: 'education',
    language: 'en',
    tags: '',
  });
  const [adSettingsTarget, setAdSettingsTarget] = useState<any | null>(null);
  const [adSettingsForm, setAdSettingsForm] = useState<VideoAdSettingsRecord>({
    videoId: '',
    adMode: 'use_global',
    allowPreRoll: true,
    allowMidRoll: true,
    allowPostRoll: true,
    allowBanner: true,
    allowSponsoredRec: true,
    midRollIntervalSeconds: 300,
    maxAdsPerView: 3,
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Category creation
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        videos: any[];
        sources: any[];
        categories: VideoCategoryRecord[];
        reports: any[];
        analytics: any;
      }>(`/api/admin/videos?status=${encodeURIComponent(statusFilter)}`);
      setVideos(res.videos || []);
      setSources(res.sources || []);
      setCategories(res.categories || []);
      setReports(res.reports || []);
      if (res.analytics) setAnalytics(res.analytics);
    } catch (err: any) {
      addToast(err.message || 'Failed to load videos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleReviewAction = async (
    videoId: string,
    action: 'approve' | 'reject' | 'publish' | 'unpublish' | 'archive',
    reason?: string
  ) => {
    try {
      await apiFetch(`/api/admin/videos/${videoId}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, reason, publishImmediately: true }),
      });
      addToast(`Video ${action} processed.`, 'success');
      setRejectTarget(null);
      setRejectReason('');
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Review action failed.', 'error');
    }
  };

  const openEditModal = (v: any) => {
    setEditTarget(v);
    setEditForm({
      title: v.title || '',
      description: v.description || '',
      categorySlug: v.categorySlug || 'education',
      language: v.language || 'en',
      tags: Array.isArray(v.tags) ? v.tags.join(', ') : '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    try {
      await apiFetch(`/api/admin/videos/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          categorySlug: editForm.categorySlug,
          language: editForm.language.trim(),
          tags: editForm.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      setEditTarget(null);
      addToast('Video metadata updated.', 'success');
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Update failed.', 'error');
    }
  };

  const openAdSettingsModal = (v: any) => {
    setAdSettingsTarget(v);
    setAdSettingsForm({
      videoId: v.id,
      adMode: v.adSettings?.adMode || 'use_global',
      allowPreRoll: v.adSettings?.allowPreRoll ?? true,
      allowMidRoll: v.adSettings?.allowMidRoll ?? true,
      allowPostRoll: v.adSettings?.allowPostRoll ?? true,
      allowBanner: v.adSettings?.allowBanner ?? true,
      allowSponsoredRec: v.adSettings?.allowSponsoredRec ?? true,
      midRollIntervalSeconds: v.adSettings?.midRollIntervalSeconds ?? 300,
      maxAdsPerView: v.adSettings?.maxAdsPerView ?? 3,
    });
  };

  const handleSaveAdSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adSettingsTarget) return;
    try {
      await apiFetch(`/api/admin/videos/${adSettingsTarget.id}/ad-settings`, {
        method: 'PUT',
        body: JSON.stringify(adSettingsForm),
      });
      setAdSettingsTarget(null);
      addToast('Video advertisement controls saved.', 'success');
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to save video ad settings.', 'error');
    }
  };

  const toggleFeatured = async (v: any) => {
    try {
      await apiFetch(`/api/admin/videos/${v.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isFeatured: !v.isFeatured }),
      });
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Toggle failed.', 'error');
    }
  };

  const deleteVideo = async (id: string) => {
    try {
      await apiFetch(`/api/admin/videos/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      addToast('Video deleted.', 'success');
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Delete failed.', 'error');
    }
  };

  const toggleSource = async (slug: string, isEnabled: boolean) => {
    try {
      await apiFetch(`/api/admin/video-sources/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled }),
      });
      addToast(`Video source "${slug}" updated.`, 'success');
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Update failed.', 'error');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    try {
      await apiFetch('/api/admin/video-categories', {
        method: 'POST',
        body: JSON.stringify({ name: catName.trim(), description: catDescription.trim() }),
      });
      setCatName('');
      setCatDescription('');
      addToast('Video category created.', 'success');
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to create category.', 'error');
    }
  };

  const handleToggleCategory = async (cat: VideoCategoryRecord) => {
    try {
      await apiFetch(`/api/admin/video-categories/${cat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !cat.isActive }),
      });
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to update category.', 'error');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await apiFetch(`/api/admin/video-categories/${id}`, { method: 'DELETE' });
      addToast('Category removed.', 'success');
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to delete category.', 'error');
    }
  };

  const handleResolveReport = async (reportId: string, unpublishVideo: boolean) => {
    try {
      await apiFetch(`/api/admin/video-reports/${reportId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'resolved',
          unpublishVideo,
          adminNotes: unpublishVideo ? 'Unpublished and archived following review.' : 'Reviewed by administrator.',
        }),
      });
      addToast(unpublishVideo ? 'Video unpublished & report resolved.' : 'Report marked resolved.', 'success');
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Failed to update report.', 'error');
    }
  };

  const visibleVideos = videos.filter((v) => {
    if (!searchQ.trim()) return true;
    const q = searchQ.toLowerCase();
    return (
      (v.title || '').toLowerCase().includes(q) ||
      (v.uploaderName || v.channel || '').toLowerCase().includes(q) ||
      (v.categorySlug || '').toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout
      title="Video Moderation & Source Control"
      subtitle="Review user-uploaded videos, manage categories, resolve copyright/content reports, and control per-video advertising."
    >
      <div className="space-y-6">
        {/* Analytics KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total Videos', value: analytics.totalVideos, color: 'text-[#071426] dark:text-white' },
            { label: 'Pending Review', value: analytics.pendingReview, color: 'text-[#258BFF]' },
            { label: 'Published Live', value: analytics.published, color: 'text-emerald-600 dark:text-[#B7F34A]' },
            { label: 'Total Views', value: analytics.totalViews, color: 'text-[#071426] dark:text-white' },
            { label: 'Open Reports', value: analytics.openReports, color: 'text-rose-500' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1"
            >
              <div className="text-[11px] font-semibold text-[#8793A5]">{kpi.label}</div>
              <div className={`text-2xl font-extrabold tabular-nums ${kpi.color}`}>
                {Number(kpi.value || 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* Workspace Sub-Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          {[
            { id: 'catalog', label: 'Moderation & Catalog' },
            { id: 'categories', label: `Categories (${categories.length})` },
            { id: 'reports', label: `Reports Queue (${analytics.openReports})` },
            { id: 'sources', label: 'Video Sources' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                activeTab === t.id
                  ? 'bg-[#258BFF] text-white'
                  : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-slate-600 dark:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB 1: MODERATION & CATALOG */}
        {activeTab === 'catalog' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {STATUS_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                      statusFilter === tab.id
                        ? 'bg-[#B7F34A] text-[#071426]'
                        : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] sm:w-64">
                <Search className="w-3.5 h-3.5 text-[#258BFF]" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Filter by title or creator..."
                  className="w-full bg-transparent text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
              {loading ? (
                <div className="py-12 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-[#258BFF]" />
                </div>
              ) : visibleVideos.length === 0 ? (
                <p className="text-xs text-[#8793A5] py-6 text-center">No videos match the selected filter.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleVideos.map((v) => {
                    const effectiveStatus = v.status || (v.isPublished ? 'published' : 'draft');
                    const adModeLabel =
                      v.adSettings?.adMode === 'ads_disabled'
                        ? 'Ads Disabled'
                        : v.adSettings?.adMode === 'ads_enabled'
                          ? 'Ads Enabled'
                          : 'Global Ad Policy';

                    return (
                      <div key={v.id} className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#8793A5]">
                            <span
                              className={`font-bold uppercase ${
                                effectiveStatus === 'published'
                                  ? 'text-emerald-600 dark:text-[#B7F34A]'
                                  : effectiveStatus === 'pending_review'
                                    ? 'text-[#258BFF]'
                                    : effectiveStatus === 'rejected'
                                      ? 'text-rose-500'
                                      : 'text-slate-500'
                              }`}
                            >
                              {effectiveStatus.replace('_', ' ')}
                            </span>
                            <span>·</span>
                            <span>{v.uploaderName || v.channel}</span>
                            <span>·</span>
                            <span>{v.categoryName || v.categorySlug}</span>
                            <span>·</span>
                            <span className="tabular-nums">{v.engagement?.views ?? v.viewsCount ?? 0} views</span>
                            <span>·</span>
                            <span className="text-[#258BFF] font-semibold">{adModeLabel}</span>
                          </div>
                          <div className="font-bold text-sm text-[#071426] dark:text-white truncate">{v.title}</div>
                          {v.rejectionReason && (
                            <p className="text-[11px] text-rose-500">Rejection reason: {v.rejectionReason}</p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewVideo(v)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold hover:border-[#258BFF]"
                          >
                            <Play className="w-3 h-3" /> Preview
                          </button>

                          {(effectiveStatus === 'pending_review' || effectiveStatus === 'draft' || effectiveStatus === 'rejected') && (
                            <button
                              type="button"
                              onClick={() => handleReviewAction(v.id, 'approve')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#B7F34A] text-[#071426] font-bold"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Approve &amp; Publish
                            </button>
                          )}

                          {effectiveStatus !== 'rejected' && (
                            <button
                              type="button"
                              onClick={() => {
                                setRejectTarget(v);
                                setRejectReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-500/40 text-rose-500 font-semibold"
                            >
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleReviewAction(v.id, v.isPublished ? 'unpublish' : 'publish')}
                            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700"
                            title={v.isPublished ? 'Unpublish' : 'Publish'}
                          >
                            {v.isPublished ? (
                              <Eye className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(v)}
                            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700"
                            title="Edit Metadata"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openAdSettingsModal(v)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold hover:border-[#258BFF]"
                            title="Configure Video Ads"
                          >
                            <Megaphone className="w-3 h-3 text-[#258BFF]" /> Ads
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleFeatured(v)}
                            className={`p-1.5 rounded-lg border ${
                              v.isFeatured ? 'border-[#B7F34A] text-[#B7F34A]' : 'border-slate-300 dark:border-slate-700 text-[#8793A5]'
                            }`}
                            title="Toggle Featured"
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>

                          {confirmDeleteId === v.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => deleteVideo(v.id)}
                                className="px-2 py-1 rounded bg-rose-600 text-white font-bold"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(v.id)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                              title="Delete Video"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: VIDEO CATEGORIES */}
        {activeTab === 'categories' && (
          <div className="space-y-4">
            <form
              onSubmit={handleCreateCategory}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col sm:flex-row gap-3 items-end"
            >
              <div className="flex-1 w-full space-y-1">
                <label className="block text-xs font-bold">Category Name</label>
                <input
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g., Environmental Science"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                />
              </div>
              <div className="flex-1 w-full space-y-1">
                <label className="block text-xs font-bold">Description</label>
                <input
                  value={catDescription}
                  onChange={(e) => setCatDescription(e.target.value)}
                  placeholder="Optional category scope..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold whitespace-nowrap"
              >
                <FolderPlus className="w-4 h-4" /> Add Category
              </button>
            </form>

            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] divide-y divide-slate-100 dark:divide-slate-800">
              {categories.map((cat) => (
                <div key={cat.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="font-bold text-[#071426] dark:text-white">{cat.name}</div>
                    <div className="text-[#8793A5]">
                      Slug: <span className="font-mono">{cat.slug}</span>
                      {cat.description ? ` · ${cat.description}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleCategory(cat)}
                      className={`px-3 py-1 rounded-lg font-semibold ${
                        cat.isActive
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#B7F34A]'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-1.5 text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: CONTENT & COPYRIGHT REPORTS */}
        {activeTab === 'reports' && (
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
            <h2 className="font-bold text-sm text-[#071426] dark:text-white flex items-center gap-2">
              <Flag className="w-4 h-4 text-rose-500" /> Submitted Video Reports ({reports.length})
            </h2>
            {reports.length === 0 ? (
              <p className="text-xs text-[#8793A5] py-4">No copyright or content reports submitted.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {reports.map((rep) => (
                  <div key={rep.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold uppercase text-rose-500">{rep.reason}</span>
                        <span>·</span>
                        <span className="font-bold text-[#071426] dark:text-white">{rep.videoTitle}</span>
                        <span>·</span>
                        <span className={rep.status === 'open' ? 'text-amber-500 font-bold' : 'text-emerald-500 font-bold'}>
                          {rep.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{rep.details}</p>
                    </div>
                    {rep.status === 'open' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleResolveReport(rep.id, false)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
                        >
                          Dismiss / Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveReport(rep.id, true)}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold"
                        >
                          Unpublish &amp; Archive Video
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: VIDEO SOURCES */}
        {activeTab === 'sources' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sources.map((src) => (
              <div
                key={src.id}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex items-center justify-between gap-4"
              >
                <div>
                  <h2 className="font-bold text-sm text-[#071426] dark:text-white">{src.name}</h2>
                  <p className="text-xs text-[#8793A5]">
                    Type: {src.sourceType} · Slug: <span className="font-mono">{src.slug}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleSource(src.slug, !src.isEnabled)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold ${
                    src.isEnabled
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#B7F34A]'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {src.isEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline Video Preview Modal */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-[#071426] text-white overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="font-bold text-sm truncate">{previewVideo.title}</h3>
                <p className="text-[11px] text-[#8793A5]">
                  Uploader: {previewVideo.uploaderName || previewVideo.channel} · Status: {previewVideo.status}
                </p>
              </div>
              <button type="button" onClick={() => setPreviewVideo(null)} className="p-1 text-[#8793A5] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            {previewVideo.sourcePlatform === 'youtube' && previewVideo.externalVideoId ? (
              <iframe
                title={previewVideo.title}
                src={`https://www.youtube-nocookie.com/embed/${previewVideo.externalVideoId}`}
                className="w-full aspect-video bg-black"
                allowFullScreen
              />
            ) : (
              <video
                src={previewVideo.videoUrl}
                poster={previewVideo.thumbnailUrl || undefined}
                controls
                autoPlay
                className="w-full aspect-video bg-black"
              />
            )}
            <div className="p-4 flex flex-wrap items-center justify-between gap-3 bg-[#10243D] text-xs">
              <p className="text-slate-300 line-clamp-2 max-w-xl">{previewVideo.description}</p>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const id = previewVideo.id;
                    setPreviewVideo(null);
                    handleReviewAction(id, 'approve');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] font-bold"
                >
                  Approve &amp; Publish
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = previewVideo;
                    setPreviewVideo(null);
                    setRejectTarget(target);
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleReviewAction(rejectTarget.id, 'reject', rejectReason);
            }}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#071426] dark:text-white">Reject Video Submission</h3>
              <button type="button" onClick={() => setRejectTarget(null)} className="text-[#8793A5]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#8793A5]">
              Provide a clear reason for rejecting <strong>{rejectTarget.title}</strong>. The creator will see this message and can edit and resubmit.
            </p>
            <textarea
              rows={4}
              required
              minLength={5}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain policy, copyright, audio/video quality, or metadata requirements..."
              className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold">
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-[#071426] dark:text-white">Edit Video Metadata</h3>
              <button type="button" onClick={() => setEditTarget(null)} className="text-[#8793A5]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Title</label>
                <input
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Description</label>
                <textarea
                  rows={4}
                  required
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Category</label>
                  <select
                    value={editForm.categorySlug}
                    onChange={(e) => setEditForm((f) => ({ ...f, categorySlug: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">Language</label>
                  <input
                    value={editForm.language}
                    onChange={(e) => setEditForm((f) => ({ ...f, language: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold mb-1">Tags (comma-separated)</label>
                <input
                  value={editForm.tags}
                  onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-bold">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Per-Video Advertisement Control Modal */}
      {adSettingsTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveAdSettings}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#071426] dark:text-white flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-[#258BFF]" /> Video Advertisement Settings
                </h3>
                <p className="text-[11px] text-[#8793A5] truncate max-w-md">{adSettingsTarget.title}</p>
              </div>
              <button type="button" onClick={() => setAdSettingsTarget(null)} className="text-[#8793A5]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold mb-1">Advertisement Mode</label>
                <select
                  value={adSettingsForm.adMode}
                  onChange={(e) =>
                    setAdSettingsForm((s) => ({ ...s, adMode: e.target.value as VideoAdSettingsRecord['adMode'] }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                >
                  <option value="use_global">Use Global Advertisement Settings</option>
                  <option value="ads_enabled">Ads Enabled (Override ON for Free/Guest)</option>
                  <option value="ads_disabled">Ads Disabled (No Ads on This Video)</option>
                </select>
                <p className="text-[11px] text-[#8793A5] mt-1">
                  Premium and Admin viewers remain ad-free regardless of video setting.
                </p>
              </div>

              {adSettingsForm.adMode !== 'ads_disabled' && (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { key: 'allowPreRoll', label: 'Pre-Roll Video Ad' },
                      { key: 'allowMidRoll', label: 'Mid-Roll Video Ad' },
                      { key: 'allowPostRoll', label: 'Post-Roll Video Ad' },
                      { key: 'allowBanner', label: 'Banner Placement' },
                      { key: 'allowSponsoredRec', label: 'Sponsored Recommendations' },
                    ].map((item) => (
                      <label
                        key={item.key}
                        className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071426] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean((adSettingsForm as any)[item.key])}
                          onChange={(e) =>
                            setAdSettingsForm((s) => ({ ...s, [item.key]: e.target.checked }))
                          }
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold mb-1">Mid-Roll Interval (sec)</label>
                      <input
                        type="number"
                        min={30}
                        value={adSettingsForm.midRollIntervalSeconds}
                        onChange={(e) =>
                          setAdSettingsForm((s) => ({ ...s, midRollIntervalSeconds: Number(e.target.value) }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1">Max Ads Per View</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={adSettingsForm.maxAdsPerView}
                        onChange={(e) =>
                          setAdSettingsForm((s) => ({ ...s, maxAdsPerView: Number(e.target.value) }))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAdSettingsTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold">
                Save Ad Controls
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminLayout>
  );
};
