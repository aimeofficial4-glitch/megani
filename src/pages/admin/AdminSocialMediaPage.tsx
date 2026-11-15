import React, { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Save, AlertTriangle, Youtube } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminSocialMediaPage: React.FC = () => {
  const { addToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [youtubeApiKeyConfigured, setYoutubeApiKeyConfigured] = useState(false);

  const [channelName, setChannelName] = useState('2MR – To Master Research');
  const [handle, setHandle] = useState('@2mr-z5');
  const [channelUrl, setChannelUrl] = useState('https://www.youtube.com/@2mr-z5');
  const [profileImageUrl, setProfileImageUrl] = useState('/assets/aistudio/2MR_Global_Research_Badge_bf1478c8.png');
  const [isEnabled, setIsEnabled] = useState(true);
  const [autoFetchVideos, setAutoFetchVideos] = useState(true);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ socialSettings: any[]; youtubeApiKeyConfigured: boolean }>(
        '/api/admin/settings/social-media'
      );
      setYoutubeApiKeyConfigured(Boolean(res.youtubeApiKeyConfigured));
      const yt = (res.socialSettings || []).find((s) => s.platformKey === 'youtube');
      if (yt) {
        setChannelName(yt.channelName || '2MR – To Master Research');
        setHandle(yt.handle || '@2mr-z5');
        setChannelUrl(yt.channelUrl || 'https://www.youtube.com/@2mr-z5');
        setProfileImageUrl(yt.profileImageUrl || '/assets/aistudio/2MR_Global_Research_Badge_bf1478c8.png');
        setIsEnabled(Boolean(yt.isEnabled));
        setAutoFetchVideos(Boolean(yt.autoFetchVideos));
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to load social media settings.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/admin/settings/social-media', {
        method: 'PATCH',
        body: JSON.stringify({
          channelName,
          handle,
          channelUrl,
          profileImageUrl,
          isEnabled,
          autoFetchVideos,
        }),
      });
      addToast('Official 2MR YouTube channel settings saved.', 'success');
      await loadSettings();
    } catch (err: any) {
      addToast(err.message || 'Failed to update social media settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout
      title="Social Media & Official YouTube Channel"
      subtitle="Manage the official 2MR YouTube badge, handle, channel URL, and live YouTube Data API v3 channel synchronization."
    >
      <div className="space-y-6">
        {/* API Status Notice */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            {youtubeApiKeyConfigured ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <div>
              <p className="font-bold text-[#071426] dark:text-white">
                YouTube Data API v3 (`YOUTUBE_API_KEY`)
              </p>
              <p className="text-[#8793A5]">
                {youtubeApiKeyConfigured
                  ? 'Configured on server — official @2mr-z5 uploads and live educational video search are active.'
                  : 'Not set in environment secrets — official channel badges and links remain active, and live YouTube API results will appear automatically once YOUTUBE_API_KEY is configured.'}
              </p>
            </div>
          </div>
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 text-white font-bold"
          >
            <Youtube className="w-4 h-4" /> Visit {handle} <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {loading ? (
          <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center text-xs text-[#8793A5]">
            Loading social media configuration...
          </div>
        ) : (
          <form
            onSubmit={handleSave}
            className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5 text-xs"
          >
            <div className="flex items-center gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <img
                src={profileImageUrl}
                alt={channelName}
                className="w-14 h-14 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
              <div>
                <p className="font-bold text-sm text-[#071426] dark:text-white">{channelName}</p>
                <p className="text-[#8793A5]">{handle} · {channelUrl}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[#8793A5] mb-1">Channel Display Name</label>
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
              <div>
                <label className="block text-[#8793A5] mb-1">YouTube Handle</label>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] font-mono"
                />
              </div>
              <div>
                <label className="block text-[#8793A5] mb-1">Official Channel URL</label>
                <input
                  type="url"
                  value={channelUrl}
                  onChange={(e) => setChannelUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
              <div>
                <label className="block text-[#8793A5] mb-1">Official Badge Image Path</label>
                <input
                  type="text"
                  value={profileImageUrl}
                  onChange={(e) => setProfileImageUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
                <span>Show Official 2MR YouTube Badge Across Platform</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoFetchVideos}
                  onChange={(e) => setAutoFetchVideos(e.target.checked)}
                />
                <span>Auto-Fetch Channel Videos via YouTube Data API v3</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] font-bold disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Channel Settings'}
            </button>
          </form>
        )}
      </div>
    </AdminLayout>
  );
};
