import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Search, Youtube, ExternalLink, Loader2, ArrowRight, Upload, Video } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { VideoCategoryRecord, VideoRecord } from '../types';
import { useOfficialYouTube } from '../components/common/YouTubeBadgeLink';
import videoQuantumImg from '../assets/images/video_quantum_lecture_1794549072425.jpg';
import videoAiImg from '../assets/images/video_ai_systems_1794549072309.jpg';
import videoBiotechImg from '../assets/images/video_biotech_lab_1794549072743.jpg';

const THUMBS = [videoQuantumImg, videoAiImg, videoBiotechImg];

export const VideosPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, addToast } = useApp();
  const yt = useOfficialYouTube();

  const [tab, setTab] = useState<'curated' | 'official' | 'youtube_search'>('curated');
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [categories, setCategories] = useState<VideoCategoryRecord[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [ytChannelVideos, setYtChannelVideos] = useState<any[]>([]);
  const [ytSearchResults, setYtSearchResults] = useState<any[]>([]);
  const [ytConfigured, setYtConfigured] = useState(false);
  const [ytMessage, setYtMessage] = useState<string | null>(null);
  const [ytLoading, setYtLoading] = useState(false);

  const loadCurated = async (q = searchQ, cat = categoryFilter) => {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (cat !== 'all') params.set('category', cat);
      const data = await apiFetch<{ videos: VideoRecord[] }>(`/api/videos?${params.toString()}`);
      setVideos(data.videos || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadCurated();
  }, [categoryFilter]);

  useEffect(() => {
    apiFetch<{ categories: VideoCategoryRecord[] }>('/api/video-categories')
      .then((res) => setCategories(res.categories || []))
      .catch(() => {});
    apiFetch<{ youtubeConfigured: boolean; videos: any[]; message?: string }>('/api/youtube/channel')
      .then((res) => {
        setYtConfigured(Boolean(res.youtubeConfigured));
        setYtChannelVideos(res.videos || []);
        if (res.message) setYtMessage(res.message);
      })
      .catch(() => {});
  }, []);

  const handleYouTubeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'curated') {
      loadCurated(searchQ, categoryFilter);
      return;
    }
    if (!searchQ.trim()) return;
    setYtLoading(true);
    try {
      const res = await apiFetch<{ youtubeConfigured: boolean; videos: any[]; message?: string }>(
        `/api/youtube/search?q=${encodeURIComponent(searchQ.trim())}`
      );
      setYtConfigured(Boolean(res.youtubeConfigured));
      setYtSearchResults(res.videos || []);
      if (res.message) setYtMessage(res.message);
    } catch (err: any) {
      addToast(err.message || 'YouTube search failed.', 'error');
    } finally {
      setYtLoading(false);
    }
  };

  const openImportedYouTubeVideo = async (v: any) => {
    try {
      const imported = await apiFetch<{ video: { id: string } }>('/api/videos/import-youtube', {
        method: 'POST',
        body: JSON.stringify(v),
      });
      navigate(`/videos/${imported.video.id}`);
    } catch (err: any) {
      addToast(err.message || 'Could not open video workspace.', 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header & Search */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">Video Discovery &amp; Intelligence</h1>
          <p className="text-sm text-slate-600 dark:text-[#8793A5]">
            Watch curated 2MR research briefings, browse the official {yt.channelHandle} YouTube channel, or discover educational lectures.
          </p>
        </div>

        <form onSubmit={handleYouTubeSearch} className="flex flex-wrap gap-2 w-full lg:w-auto">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] flex-1 sm:w-72">
            <Search className="w-4 h-4 text-[#258BFF]" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={tab === 'youtube_search' ? 'Search YouTube lectures...' : 'Search curated videos...'}
              className="w-full bg-transparent text-xs focus:outline-none"
            />
          </div>
          {tab === 'curated' && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs"
            >
              <option value="all">All Categories</option>
              {categories.length > 0 ? (
                categories.map((cat) => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="science">Science</option>
                  <option value="technology">Technology</option>
                  <option value="health">Health</option>
                </>
              )}
            </select>
          )}
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold hover:brightness-110"
          >
            Search
          </button>
        </form>
      </div>

      {/* Mode Switcher Tabs & Creator Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] p-1 gap-1">
          {[
            { id: 'curated', label: '2MR Videos & Briefings' },
            { id: 'official', label: `Official ${yt.channelHandle}` },
            { id: 'youtube_search', label: 'YouTube Educational Search' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                tab === item.id
                  ? 'bg-[#258BFF] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-[#071426] dark:hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/videos/upload"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold hover:brightness-95 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Video
          </Link>
          {user && (
            <Link
              to="/dashboard/my-videos"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-xs font-semibold hover:border-[#258BFF] whitespace-nowrap"
            >
              <Video className="w-3.5 h-3.5 text-[#258BFF]" />
              My Videos
            </Link>
          )}
          <a
            href={yt.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF0000] text-white text-xs font-bold hover:brightness-110 whitespace-nowrap"
          >
            <Youtube className="w-4 h-4" />
            Subscribe to 2MR on YouTube
          </a>
        </div>
      </div>

      {/* Tab 1: 2MR Curated Briefings */}
      {tab === 'curated' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {videos.map((v, idx) => (
            <Link
              key={v.id}
              to={`/videos/${v.id}`}
              className="group rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition flex flex-col justify-between"
            >
              <div>
                <div className="relative h-44 bg-[#071426] overflow-hidden">
                  <img
                    src={v.thumbnailUrl || THUMBS[idx % THUMBS.length]}
                    alt={v.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#071426]/80 via-transparent to-transparent flex items-end justify-between p-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#071426]/85 text-white text-xs font-semibold">
                      <Play className="w-3 h-3 text-[#B7F34A]" /> Open Lecture
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#071426]/85 text-white text-xs font-mono tabular-nums">
                      {v.duration}
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-1.5">
                  <div className="text-xs text-[#8793A5] flex flex-wrap items-center gap-1.5 tabular-nums">
                    <span className="font-semibold text-[#258BFF] dark:text-[#B7F34A]">{v.channel}</span>
                    <span>·</span>
                    <span>{v.categorySlug}</span>
                    <span>·</span>
                    <span>{(v.viewsCount || 0).toLocaleString()} views</span>
                  </div>
                  <h2 className="font-bold text-sm text-[#071426] dark:text-white line-clamp-2">{v.title}</h2>
                  <p className="text-xs text-slate-600 dark:text-[#8793A5] line-clamp-2">{v.description}</p>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-[#258BFF]">
                <span>Watch &amp; Study</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Tab 2: Official @2mr-z5 YouTube Channel */}
      {tab === 'official' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src={yt.badgeImagePath}
                alt={yt.channelName}
                className="w-14 h-14 rounded-xl bg-[#071426] p-1 border border-slate-700 object-contain"
              />
              <div>
                <h2 className="text-lg font-bold text-[#071426] dark:text-white">{yt.channelName}</h2>
                <p className="text-xs text-[#8793A5]">
                  Official 2MR Channel ({yt.channelHandle}) · {yt.channelUrl}
                </p>
              </div>
            </div>
            <a
              href={yt.channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
            >
              Visit on YouTube <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {ytChannelVideos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {ytChannelVideos.map((v) => (
                <button
                  key={v.externalVideoId}
                  type="button"
                  onClick={() => openImportedYouTubeVideo(v)}
                  className="text-left rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition"
                >
                  {v.thumbnailUrl && (
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-44 object-cover"
                    />
                  )}
                  <div className="p-4 space-y-1">
                    <div className="flex items-center justify-between text-xs text-[#8793A5]">
                      <span className="font-semibold text-[#258BFF]">{v.channel}</span>
                      <span className="font-mono tabular-nums">{v.duration}</span>
                    </div>
                    <h3 className="font-bold text-sm text-[#071426] dark:text-white line-clamp-2">{v.title}</h3>
                    <p className="text-xs text-[#8793A5] line-clamp-2">{v.description}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center space-y-3">
              <Youtube className="w-10 h-10 text-[#FF0000] mx-auto" />
              <p className="font-bold text-sm text-[#071426] dark:text-white">
                {ytConfigured ? 'No public uploads listed yet' : 'YouTube Data API v3 Not Configured'}
              </p>
              <p className="text-xs text-[#8793A5] max-w-lg mx-auto">
                {ytMessage ||
                  'Set YOUTUBE_API_KEY in server environment variables to automatically fetch live uploads from @2mr-z5. 2MR never fabricates placeholder videos.'}
              </p>
              <a
                href={yt.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF0000] text-white text-xs font-bold"
              >
                Open {yt.channelHandle} on YouTube <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: YouTube Educational Discovery */}
      {tab === 'youtube_search' && (
        <div className="space-y-5">
          {ytLoading ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-[#258BFF]" />
            </div>
          ) : ytSearchResults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {ytSearchResults.map((v) => (
                <button
                  key={v.externalVideoId}
                  type="button"
                  onClick={() => openImportedYouTubeVideo(v)}
                  className="text-left rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition"
                >
                  {v.thumbnailUrl && (
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-44 object-cover"
                    />
                  )}
                  <div className="p-4 space-y-1">
                    <div className="flex items-center justify-between text-xs text-[#8793A5]">
                      <span className="font-semibold text-[#258BFF] truncate">{v.channel}</span>
                      <span className="font-mono tabular-nums">{v.duration}</span>
                    </div>
                    <h3 className="font-bold text-sm text-[#071426] dark:text-white line-clamp-2">{v.title}</h3>
                    <p className="text-xs text-[#8793A5] line-clamp-2">{v.description}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center space-y-2">
              <p className="font-bold text-sm text-[#071426] dark:text-white">
                {ytConfigured
                  ? 'Enter an educational topic above and click Search'
                  : 'YouTube Data API v3 Key Required for Live Discovery'}
              </p>
              <p className="text-xs text-[#8793A5] max-w-lg mx-auto">
                {ytMessage ||
                  'Configure YOUTUBE_API_KEY on the server to search real educational channels, check embedding permissions, and open them inside /videos/:id.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
