import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  ExternalLink,
  Megaphone,
  PauseCircle,
  PlayCircle,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';
import {
  AdCampaignItem,
  AdPlacementType,
  VideoAdvertisementRecord,
  VideoCategoryRecord,
} from '../../types';
import { AdminLayout } from './AdminLayout';

const PLACEMENT_OPTIONS: { value: AdPlacementType; label: string }[] = [
  { value: 'pre_roll', label: 'Pre-Roll Video Ad' },
  { value: 'mid_roll', label: 'Mid-Roll Video Ad' },
  { value: 'post_roll', label: 'Post-Roll Video Ad' },
  { value: 'banner', label: 'Banner Placement' },
  { value: 'sponsored_recommendation', label: 'Sponsored Recommendation Card' },
];

interface GlobalVideoAdConfig {
  globalAdsEnabled: boolean;
  showAdsToFreeUsers: boolean;
  showAdsToGuests: boolean;
  adFreeForPremiumAndAdmin: boolean;
  defaultVideoAdMode: 'ads_enabled' | 'ads_disabled';
  defaultPreRollEnabled: boolean;
  defaultMidRollEnabled: boolean;
  defaultPostRollEnabled: boolean;
  defaultBannerEnabled: boolean;
  defaultSponsoredRecEnabled: boolean;
  defaultMidRollIntervalSeconds: number;
  defaultMaxAdsPerView: number;
  globalMinSpacingSeconds: number;
}

const EMPTY_AD_FORM = {
  title: '',
  sponsorName: '',
  placement: 'pre_roll' as AdPlacementType,
  headline: '',
  description: '',
  mediaUrl: '',
  ctaText: 'Learn More',
  ctaUrl: 'https://',
  targetCategories: ['All'] as string[],
  targetVideoIds: [] as string[],
  startDate: '',
  endDate: '',
  budgetUsd: 500,
  impressionLimit: 50000,
  clickLimit: 2500,
  frequencyCapPerUser: 3,
  minSpacingSeconds: 180,
  isActive: true,
};

export const AdminAdsPage: React.FC = () => {
  const { addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'video_ads' | 'global_policy' | 'legacy_campaigns'>('video_ads');

  // Video & Platform Ads State
  const [ads, setAds] = useState<VideoAdvertisementRecord[]>([]);
  const [categories, setCategories] = useState<VideoCategoryRecord[]>([]);
  const [videos, setVideos] = useState<{ id: string; title: string; categorySlug: string; status: string }[]>([]);
  const [analytics, setAnalytics] = useState({
    totalAds: 0,
    activeAds: 0,
    totalImpressions: 0,
    totalClicks: 0,
  });
  const [globalConfig, setGlobalConfig] = useState<GlobalVideoAdConfig | null>(null);

  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_AD_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [confirmDeleteAdId, setConfirmDeleteAdId] = useState<string | null>(null);

  // Legacy adCampaigns state (preserved)
  const [legacyCampaigns, setLegacyCampaigns] = useState<AdCampaignItem[]>([]);
  const [legacyForm, setLegacyForm] = useState({
    advertiserName: '',
    campaignName: '',
    adType: 'banner' as 'banner' | 'sponsored-result' | 'pre-roll',
    headline: '',
    description: '',
    ctaUrl: '',
    budget: 1000,
  });

  const loadAll = async () => {
    try {
      const [adsRes, legacyRes] = await Promise.all([
        apiFetch<{
          advertisements: VideoAdvertisementRecord[];
          categories: VideoCategoryRecord[];
          videos: any[];
          globalConfig: GlobalVideoAdConfig;
          analytics: any;
        }>('/api/admin/ads'),
        apiFetch<{ campaigns: AdCampaignItem[] }>('/api/admin/advertisements'),
      ]);
      setAds(adsRes.advertisements || []);
      setCategories(adsRes.categories || []);
      setVideos(adsRes.videos || []);
      setGlobalConfig(adsRes.globalConfig || null);
      if (adsRes.analytics) setAnalytics(adsRes.analytics);
      setLegacyCampaigns(legacyRes.campaigns || []);
    } catch (err: any) {
      addToast(err.message || 'Failed to load advertisement controls.', 'error');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.headline.trim() || !form.ctaUrl.trim()) {
      addToast('Title, headline, and CTA URL are required.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      if (editingAdId) {
        await apiFetch(`/api/admin/ads/${editingAdId}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
        addToast('Advertisement updated.', 'success');
      } else {
        await apiFetch('/api/admin/ads', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        addToast('Advertisement created and saved.', 'success');
      }
      setEditingAdId(null);
      setForm(EMPTY_AD_FORM);
      await loadAll();
    } catch (err: any) {
      addToast(err.message || 'Failed to save advertisement.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const startEditAd = (ad: VideoAdvertisementRecord) => {
    setEditingAdId(ad.id);
    setForm({
      title: ad.title,
      sponsorName: ad.sponsorName || '',
      placement: ad.placement,
      headline: ad.headline,
      description: ad.description,
      mediaUrl: ad.mediaUrl || '',
      ctaText: ad.ctaText || 'Learn More',
      ctaUrl: ad.ctaUrl,
      targetCategories: Array.isArray(ad.targetCategories) && ad.targetCategories.length > 0 ? ad.targetCategories : ['All'],
      targetVideoIds: Array.isArray(ad.targetVideoIds) ? ad.targetVideoIds : [],
      startDate: ad.startDate || '',
      endDate: ad.endDate || '',
      budgetUsd: ad.budgetUsd || 0,
      impressionLimit: ad.impressionLimit || 0,
      clickLimit: ad.clickLimit || 0,
      frequencyCapPerUser: ad.frequencyCapPerUser || 3,
      minSpacingSeconds: ad.minSpacingSeconds || 180,
      isActive: ad.isActive,
    });
    setActiveTab('video_ads');
  };

  const toggleAdActive = async (ad: VideoAdvertisementRecord) => {
    try {
      await apiFetch(`/api/admin/ads/${ad.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !ad.isActive }),
      });
      addToast(ad.isActive ? 'Advertisement deactivated.' : 'Advertisement activated.', 'success');
      await loadAll();
    } catch (err: any) {
      addToast(err.message || 'Status update failed.', 'error');
    }
  };

  const deleteAd = async (id: string) => {
    try {
      await apiFetch(`/api/admin/ads/${id}`, { method: 'DELETE' });
      setConfirmDeleteAdId(null);
      addToast('Advertisement deleted.', 'success');
      await loadAll();
    } catch (err: any) {
      addToast(err.message || 'Delete failed.', 'error');
    }
  };

  const toggleCategoryTarget = (slug: string) => {
    setForm((prev) => {
      if (slug === 'All') {
        return { ...prev, targetCategories: ['All'] };
      }
      const withoutAll = prev.targetCategories.filter((c) => c !== 'All');
      const exists = withoutAll.includes(slug);
      const next = exists ? withoutAll.filter((c) => c !== slug) : [...withoutAll, slug];
      return { ...prev, targetCategories: next.length === 0 ? ['All'] : next };
    });
  };

  const toggleVideoTarget = (videoId: string) => {
    setForm((prev) => {
      const exists = prev.targetVideoIds.includes(videoId);
      return {
        ...prev,
        targetVideoIds: exists
          ? prev.targetVideoIds.filter((id) => id !== videoId)
          : [...prev.targetVideoIds, videoId],
      };
    });
  };

  const handleSaveGlobalConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalConfig) return;
    setSavingGlobal(true);
    try {
      const res = await apiFetch<{ config: GlobalVideoAdConfig }>('/api/admin/ads/global-settings', {
        method: 'PUT',
        body: JSON.stringify(globalConfig),
      });
      setGlobalConfig(res.config);
      addToast('Global video advertisement policy updated.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save global settings.', 'error');
    } finally {
      setSavingGlobal(false);
    }
  };

  // Legacy handlers preserved
  const handleCreateLegacy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/advertisements', {
        method: 'POST',
        body: JSON.stringify(legacyForm),
      });
      setLegacyForm({
        advertiserName: '',
        campaignName: '',
        adType: 'banner',
        headline: '',
        description: '',
        ctaUrl: '',
        budget: 1000,
      });
      await loadAll();
      addToast('Legacy ad campaign launched.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to create campaign.', 'error');
    }
  };

  const toggleLegacyStatus = async (c: AdCampaignItem) => {
    const next = c.status === 'active' ? 'paused' : 'active';
    await apiFetch(`/api/admin/advertisements/${c.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
    await loadAll();
  };

  const removeLegacyCampaign = async (id: string) => {
    await apiFetch(`/api/admin/advertisements/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  const overallCtr =
    analytics.totalImpressions > 0
      ? ((analytics.totalClicks / analytics.totalImpressions) * 100).toFixed(2)
      : '0.00';

  return (
    <AdminLayout
      title="Advertisement Management & Video Ad Controls"
      subtitle="Create targeted video placements, preview creatives live, enforce spacing/frequency caps, and protect Premium ad-free playback."
    >
      <div className="space-y-6">
        {/* Analytics KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1">
            <div className="text-[11px] font-semibold text-[#8793A5]">Active Video Ads</div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-[#B7F34A] tabular-nums">
              {analytics.activeAds} / {analytics.totalAds}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1">
            <div className="text-[11px] font-semibold text-[#8793A5]">Verified Impressions</div>
            <div className="text-2xl font-extrabold text-[#258BFF] tabular-nums">
              {analytics.totalImpressions.toLocaleString()}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1">
            <div className="text-[11px] font-semibold text-[#8793A5]">Verified Clicks</div>
            <div className="text-2xl font-extrabold text-[#071426] dark:text-white tabular-nums">
              {analytics.totalClicks.toLocaleString()}
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1">
            <div className="text-[11px] font-semibold text-[#8793A5]">Click-Through Rate</div>
            <div className="text-2xl font-extrabold text-[#071426] dark:text-white tabular-nums">{overallCtr}%</div>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          {[
            { id: 'video_ads', label: 'Video & Placement Ads' },
            { id: 'global_policy', label: 'Global Video Ad Settings' },
            { id: 'legacy_campaigns', label: `Search & Banner Campaigns (${legacyCampaigns.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#258BFF] text-white'
                  : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-slate-600 dark:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: VIDEO & PLACEMENT ADS */}
        {activeTab === 'video_ads' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Create / Edit Form */}
              <form
                onSubmit={handleSaveAd}
                className="lg:col-span-7 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4 text-xs"
              >
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <h2 className="font-bold text-sm text-[#071426] dark:text-white flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-[#258BFF]" />
                    {editingAdId ? 'Edit Advertisement' : 'Create New Advertisement'}
                  </h2>
                  {editingAdId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAdId(null);
                        setForm(EMPTY_AD_FORM);
                      }}
                      className="inline-flex items-center gap-1 text-[#8793A5] hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold mb-1">Ad Internal Title</label>
                    <input
                      required
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g., Lab Bench Fall Fellowship"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Sponsor Name</label>
                    <input
                      required
                      value={form.sponsorName}
                      onChange={(e) => setForm((f) => ({ ...f, sponsorName: e.target.value }))}
                      placeholder="e.g., OpenBio Labs"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold mb-1">Placement Type</label>
                    <select
                      value={form.placement}
                      onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value as AdPlacementType }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    >
                      {PLACEMENT_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Media Image/Asset URL (Optional)</label>
                    <input
                      value={form.mediaUrl}
                      onChange={(e) => setForm((f) => ({ ...f, mediaUrl: e.target.value }))}
                      placeholder="https://..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold mb-1">Headline</label>
                  <input
                    required
                    value={form.headline}
                    onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
                    placeholder="Clear, concise sponsored headline"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Transparent sponsor description..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold mb-1">CTA Button Text</label>
                    <input
                      value={form.ctaText}
                      onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))}
                      placeholder="Learn More"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Destination URL</label>
                    <input
                      required
                      value={form.ctaUrl}
                      onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))}
                      placeholder="https://example.org"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                </div>

                {/* Scheduling & Limits */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold mb-1">Start Date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">End Date</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Budget (USD)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.budgetUsd}
                      onChange={(e) => setForm((f) => ({ ...f, budgetUsd: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Impression Limit</label>
                    <input
                      type="number"
                      min={0}
                      value={form.impressionLimit}
                      onChange={(e) => setForm((f) => ({ ...f, impressionLimit: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Click Limit</label>
                    <input
                      type="number"
                      min={0}
                      value={form.clickLimit}
                      onChange={(e) => setForm((f) => ({ ...f, clickLimit: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Freq Cap / User (24h)</label>
                    <input
                      type="number"
                      min={1}
                      value={form.frequencyCapPerUser}
                      onChange={(e) => setForm((f) => ({ ...f, frequencyCapPerUser: Number(e.target.value) }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                    />
                  </div>
                </div>

                {/* Category Targeting */}
                <div className="space-y-1.5">
                  <label className="block font-bold">Category Targeting</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCategoryTarget('All')}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                        form.targetCategories.includes('All')
                          ? 'bg-[#258BFF] text-white border-[#258BFF]'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      All Categories
                    </button>
                    {categories.map((cat) => {
                      const selected = form.targetCategories.includes(cat.slug);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => toggleCategoryTarget(cat.slug)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                            selected
                              ? 'bg-[#258BFF] text-white border-[#258BFF]'
                              : 'border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Specific Video Targeting (Optional) */}
                {videos.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="block font-bold">
                      Target Specific Videos (Optional — leave unchecked for all matching category videos)
                    </label>
                    <div className="max-h-32 overflow-y-auto p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-1">
                      {videos.map((v) => (
                        <label key={v.id} className="flex items-center gap-2 cursor-pointer text-[11px]">
                          <input
                            type="checkbox"
                            checked={form.targetVideoIds.includes(v.id)}
                            onChange={() => toggleVideoTarget(v.id)}
                          />
                          <span className="truncate">{v.title}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    />
                    Activate Immediately
                  </label>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] font-bold hover:brightness-95 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    {submitting ? 'Saving...' : editingAdId ? 'Update Advertisement' : 'Create Advertisement'}
                  </button>
                </div>
              </form>

              {/* Live Advertisement Preview */}
              <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                      Live Advertisement Preview
                    </h3>
                    <span className="text-[11px] text-[#8793A5]">{form.placement.replace('_', '-')}</span>
                  </div>

                  <div className="p-5 rounded-xl bg-[#071426] text-white space-y-3 border border-slate-800">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#B7F34A] font-bold uppercase">Sponsored · 2MR Ads</span>
                      <span className="text-[#8793A5]">{form.sponsorName || 'Sponsor Name'}</span>
                    </div>
                    {form.mediaUrl && (
                      <img
                        src={form.mediaUrl}
                        alt="Ad creative"
                        className="w-full h-32 object-cover rounded-lg border border-slate-700"
                      />
                    )}
                    <div className="font-bold text-base">{form.headline || 'Your Advertisement Headline'}</div>
                    <p className="text-xs text-slate-300">
                      {form.description || 'Concise, transparent sponsor description shown to Free & Guest viewers.'}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#258BFF] text-white text-xs font-semibold">
                        {form.ctaText || 'Learn More'} <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#8793A5]">
                    Served only to Free and Guest viewers with Advertising Consent enabled, and never on videos where ads are disabled.
                  </p>
                </div>
              </div>
            </div>

            {/* Active & Configured Video Ads List */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
              <h2 className="font-bold text-sm text-[#071426] dark:text-white">
                Configured Video &amp; Placement Ads ({ads.length})
              </h2>
              {ads.length === 0 ? (
                <p className="text-xs text-[#8793A5] py-4">No video advertisements created yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ads.map((ad) => {
                    const ctr =
                      ad.impressionsCount > 0
                        ? ((ad.clicksCount / ad.impressionsCount) * 100).toFixed(2)
                        : '0.00';
                    return (
                      <div
                        key={ad.id}
                        className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="font-bold uppercase text-[#258BFF]">
                              {ad.placement.replace('_', '-')}
                            </span>
                            <span className="text-[#8793A5]">·</span>
                            <span className="font-semibold text-[#071426] dark:text-white">{ad.sponsorName}</span>
                            <span className="text-[#8793A5]">·</span>
                            <span className={ad.isActive ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>
                              {ad.isActive ? 'ACTIVE' : 'PAUSED'}
                            </span>
                            <span className="text-[#8793A5]">·</span>
                            <span className="text-[#8793A5]">
                              Targets: {ad.targetCategories?.join(', ') || 'All'}
                              {ad.targetVideoIds?.length > 0 ? ` (${ad.targetVideoIds.length} videos)` : ''}
                            </span>
                          </div>
                          <div className="font-bold text-sm text-[#071426] dark:text-white truncate">
                            {ad.headline}
                          </div>
                          <div className="text-[#8793A5] tabular-nums">
                            Impressions: {ad.impressionsCount.toLocaleString()} · Clicks:{' '}
                            {ad.clicksCount.toLocaleString()} · CTR: {ctr}% · Cap: {ad.frequencyCapPerUser}/user ·
                            Budget: ${ad.budgetUsd}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditAd(ad)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleAdActive(ad)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
                          >
                            {ad.isActive ? (
                              <>
                                <PauseCircle className="w-3.5 h-3.5 text-amber-500" /> Deactivate
                              </>
                            ) : (
                              <>
                                <PlayCircle className="w-3.5 h-3.5 text-emerald-500" /> Activate
                              </>
                            )}
                          </button>

                          {confirmDeleteAdId === ad.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => deleteAd(ad.id)}
                                className="px-2 py-1 rounded bg-rose-600 text-white font-bold"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAdId(null)}
                                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAdId(ad.id)}
                              className="p-2 text-rose-500"
                            >
                              <Trash2 className="w-4 h-4" />
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

        {/* TAB 2: GLOBAL VIDEO AD SETTINGS */}
        {activeTab === 'global_policy' && globalConfig && (
          <form
            onSubmit={handleSaveGlobalConfig}
            className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="font-bold text-sm text-[#071426] dark:text-white flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-[#258BFF]" /> Global Video Advertisement Policy
                </h2>
                <p className="text-[11px] text-[#8793A5]">
                  Applies to all videos set to &ldquo;Use Global Advertisement Settings&rdquo;.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-[#B7F34A] font-bold">
                <CheckCircle2 className="w-4 h-4" /> Premium &amp; Admin Ad-Free Enforced
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'globalAdsEnabled', label: 'Enable Video Ads Globally' },
                { key: 'showAdsToFreeUsers', label: 'Show Ads to Free Registered Users' },
                { key: 'showAdsToGuests', label: 'Show Ads to Guest Visitors' },
                { key: 'adFreeForPremiumAndAdmin', label: 'Ad-Free Experience for Premium & Admin' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] cursor-pointer font-semibold"
                >
                  <input
                    type="checkbox"
                    checked={Boolean((globalConfig as any)[item.key])}
                    onChange={(e) =>
                      setGlobalConfig((g) => (g ? { ...g, [item.key]: e.target.checked } : g))
                    }
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold mb-1">Default Video Behavior</label>
                <select
                  value={globalConfig.defaultVideoAdMode}
                  onChange={(e) =>
                    setGlobalConfig((g) =>
                      g ? { ...g, defaultVideoAdMode: e.target.value as 'ads_enabled' | 'ads_disabled' } : g
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                >
                  <option value="ads_enabled">Ads Enabled by Default</option>
                  <option value="ads_disabled">Ads Disabled by Default</option>
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1">Minimum Spacing Between Ads (sec)</label>
                <input
                  type="number"
                  min={15}
                  value={globalConfig.globalMinSpacingSeconds}
                  onChange={(e) =>
                    setGlobalConfig((g) => (g ? { ...g, globalMinSpacingSeconds: Number(e.target.value) } : g))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-bold">Default Enabled Placement Slots</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { key: 'defaultPreRollEnabled', label: 'Pre-Roll Video Ads' },
                  { key: 'defaultMidRollEnabled', label: 'Mid-Roll Video Ads' },
                  { key: 'defaultPostRollEnabled', label: 'Post-Roll Video Ads' },
                  { key: 'defaultBannerEnabled', label: 'Banner Placements' },
                  { key: 'defaultSponsoredRecEnabled', label: 'Sponsored Recommendations' },
                ].map((slot) => (
                  <label
                    key={slot.key}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean((globalConfig as any)[slot.key])}
                      onChange={(e) =>
                        setGlobalConfig((g) => (g ? { ...g, [slot.key]: e.target.checked } : g))
                      }
                    />
                    <span>{slot.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold mb-1">Default Mid-Roll Interval (sec)</label>
                <input
                  type="number"
                  min={30}
                  value={globalConfig.defaultMidRollIntervalSeconds}
                  onChange={(e) =>
                    setGlobalConfig((g) =>
                      g ? { ...g, defaultMidRollIntervalSeconds: Number(e.target.value) } : g
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Default Max Ads Per View</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={globalConfig.defaultMaxAdsPerView}
                  onChange={(e) =>
                    setGlobalConfig((g) => (g ? { ...g, defaultMaxAdsPerView: Number(e.target.value) } : g))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingGlobal}
                className="px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] font-bold hover:brightness-95 disabled:opacity-50"
              >
                {savingGlobal ? 'Saving...' : 'Save Global Policy'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: LEGACY SEARCH & BANNER CAMPAIGNS (Preserved) */}
        {activeTab === 'legacy_campaigns' && (
          <div className="space-y-6">
            <form
              onSubmit={handleCreateLegacy}
              className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4"
            >
              <h2 className="font-bold text-sm text-[#071426] dark:text-white">Create Search / Banner Campaign</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  required
                  value={legacyForm.advertiserName}
                  onChange={(e) => setLegacyForm((f) => ({ ...f, advertiserName: e.target.value }))}
                  placeholder="Advertiser Name"
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                />
                <input
                  required
                  value={legacyForm.campaignName}
                  onChange={(e) => setLegacyForm((f) => ({ ...f, campaignName: e.target.value }))}
                  placeholder="Campaign Name"
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                />
                <select
                  value={legacyForm.adType}
                  onChange={(e) => setLegacyForm((f) => ({ ...f, adType: e.target.value as any }))}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                >
                  <option value="banner">Banner Slot</option>
                  <option value="sponsored-result">Sponsored Search Result</option>
                  <option value="pre-roll">Video Pre-Roll</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  required
                  value={legacyForm.headline}
                  onChange={(e) => setLegacyForm((f) => ({ ...f, headline: e.target.value }))}
                  placeholder="Headline"
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                />
                <input
                  required
                  value={legacyForm.ctaUrl}
                  onChange={(e) => setLegacyForm((f) => ({ ...f, ctaUrl: e.target.value }))}
                  placeholder="Destination URL (https://...)"
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                />
                <input
                  type="number"
                  value={legacyForm.budget}
                  onChange={(e) => setLegacyForm((f) => ({ ...f, budget: Number(e.target.value) }))}
                  placeholder="Budget USD"
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                />
              </div>
              <input
                value={legacyForm.description}
                onChange={(e) => setLegacyForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short transparent description..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
              >
                <Plus className="w-4 h-4" /> Launch Campaign
              </button>
            </form>

            <div className="space-y-3">
              {legacyCampaigns.map((c) => {
                const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : '0.00';
                return (
                  <div
                    key={c.id}
                    className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold uppercase text-[#258BFF]">{c.adType}</span>
                        <span>·</span>
                        <span className="font-semibold">{c.advertiserName}</span>
                        <span>·</span>
                        <span className={c.status === 'active' ? 'text-[#B7F34A] font-bold' : 'text-amber-400 font-bold'}>
                          {c.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="font-bold text-sm text-[#071426] dark:text-white">{c.headline}</div>
                      <div className="text-[#8793A5] tabular-nums">
                        Impressions: {c.impressions.toLocaleString()} · Clicks: {c.clicks.toLocaleString()} · CTR: {ctr}%
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleLegacyStatus(c)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
                      >
                        {c.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                      <button type="button" onClick={() => removeLegacyCampaign(c.id)} className="p-2 text-rose-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};
