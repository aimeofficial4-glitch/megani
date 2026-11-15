import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  Check,
  Clock,
  ExternalLink,
  FileText,
  Flag,
  Loader2,
  MessageSquare,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  AlertTriangle,
  Youtube,
  X,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { useConsent } from '../context/ConsentContext';
import { VideoRecord, VideoTranscriptSegment } from '../types';
import videoQuantumImg from '../assets/images/video_quantum_lecture_1794549072425.jpg';
import { VisualIntelligencePanel } from '../components/visual/VisualIntelligencePanel';

interface VideoSummaryRecord {
  id: string;
  summary: string;
  keyPoints: string[];
  studyNotes: string | null;
  revisionQuestions: string[];
}

interface VideoNoteRecord {
  id: string;
  content: string;
  timestampSeconds: number;
  createdAt: string;
}

interface ServedVideoAd {
  id: string;
  campaignId?: string | null;
  title: string;
  sponsorName: string;
  placement: 'pre_roll' | 'mid_roll' | 'post_roll' | 'sponsored_recommendation' | 'banner';
  headline: string;
  description: string;
  mediaUrl?: string | null;
  ctaText: string;
  ctaUrl: string;
  minSpacingSeconds?: number;
  sponsoredLabel: string;
}

interface VideoAdBundle {
  adFree: boolean;
  adsEnabledForVideo: boolean;
  effectivePolicy?: string;
  settings?: {
    midRollIntervalSeconds: number;
    maxAdsPerView: number;
    minSpacingSeconds?: number;
  };
  preRoll: ServedVideoAd | null;
  midRoll: ServedVideoAd | null;
  postRoll: ServedVideoAd | null;
  banner: ServedVideoAd | null;
  sponsoredRecommendations: ServedVideoAd[];
}

export const VideoDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, addToast } = useApp();
  const { consent } = useConsent();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [video, setVideo] = useState<VideoRecord | null>(null);
  const [transcripts, setTranscripts] = useState<VideoTranscriptSegment[]>([]);
  const [summary, setSummary] = useState<VideoSummaryRecord | null>(null);
  const [relatedVideos, setRelatedVideos] = useState<VideoRecord[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [viewsCount, setViewsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Notes & Video Intelligence state
  const [notes, setNotes] = useState<VideoNoteRecord[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [noteTimestamp, setNoteTimestamp] = useState(0);
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [intelLoading, setIntelLoading] = useState(false);
  const [qaInput, setQaInput] = useState('');
  const [qaAnswer, setQaAnswer] = useState<string | null>(null);

  // Report modal state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('copyright');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Ad Engine state (strictly disabled for Premium/Admin and ads_disabled videos)
  const isAdFree = user?.role === 'premium' || user?.role === 'admin';
  const [adBundle, setAdBundle] = useState<VideoAdBundle | null>(null);
  const [activeOverlayAd, setActiveOverlayAd] = useState<'pre_roll' | 'mid_roll' | 'post_roll' | null>(null);
  const shownAdIdsRef = useRef<Set<string>>(new Set());
  const adsShownThisPlayRef = useRef<number>(0);
  const lastMidRollAtRef = useRef<number>(-999);
  const viewRecordedRef = useRef<boolean>(false);

  const trackAdEvent = (ad: ServedVideoAd, eventType: 'impression' | 'click') => {
    if (isAdFree || !id) return;
    apiFetch('/api/ads/video-event', {
      method: 'POST',
      body: JSON.stringify({
        advertisementId: ad.id,
        videoId: id,
        placement: ad.placement,
        eventType,
      }),
    }).catch(() => {});
  };

  const recordImpressionOnce = (ad: ServedVideoAd | null) => {
    if (!ad || isAdFree) return;
    const key = `${ad.id}:${ad.placement}`;
    if (shownAdIdsRef.current.has(key)) return;
    shownAdIdsRef.current.add(key);
    trackAdEvent(ad, 'impression');
  };

  const loadDetail = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    shownAdIdsRef.current = new Set();
    adsShownThisPlayRef.current = 0;
    lastMidRollAtRef.current = -999;
    viewRecordedRef.current = false;

    try {
      const data = await apiFetch<{
        video: VideoRecord;
        transcripts: VideoTranscriptSegment[];
        summary: VideoSummaryRecord | null;
        isSaved: boolean;
        relatedVideos: VideoRecord[];
      }>(`/api/videos/${id}`);

      setVideo(data.video);
      setViewsCount(data.video.viewsCount || 0);
      setTranscripts(data.transcripts || []);
      setSummary(data.summary || null);
      setIsSaved(Boolean(data.isSaved));
      setRelatedVideos(data.relatedVideos || []);

      if (!isAdFree) {
        apiFetch<VideoAdBundle>(`/api/ads/video-bundle?videoId=${encodeURIComponent(id)}`)
          .then((bundle) => {
            setAdBundle(bundle);
            if (!bundle.adFree && bundle.adsEnabledForVideo) {
              if (bundle.preRoll && data.video.sourcePlatform !== 'youtube') {
                setActiveOverlayAd('pre_roll');
                adsShownThisPlayRef.current += 1;
                recordImpressionOnce(bundle.preRoll);
              } else {
                setActiveOverlayAd(null);
              }
              if (bundle.banner) recordImpressionOnce(bundle.banner);
              for (const rec of bundle.sponsoredRecommendations || []) {
                recordImpressionOnce(rec);
              }
            } else {
              setActiveOverlayAd(null);
            }
          })
          .catch(() => {
            setAdBundle(null);
            setActiveOverlayAd(null);
          });
      } else {
        setAdBundle(null);
        setActiveOverlayAd(null);
      }

      if (user) {
        apiFetch<{ notes: VideoNoteRecord[] }>(`/api/videos/${id}/notes`)
          .then((n) => setNotes(n.notes || []))
          .catch(() => {});
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load video.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id, user?.id, consent?.advertising]);

  const recordViewPing = (completed = false) => {
    if (!id || !video) return;
    if (!completed && viewRecordedRef.current) return;
    if (!completed) viewRecordedRef.current = true;
    const watchSec = videoRef.current ? Math.floor(videoRef.current.currentTime) : 0;
    apiFetch<{ viewsCount: number }>(`/api/videos/${id}/view`, {
      method: 'POST',
      body: JSON.stringify({ watchSeconds: watchSec, completed }),
    })
      .then((res) => {
        if (typeof res.viewsCount === 'number') setViewsCount(res.viewsCount);
      })
      .catch(() => {});
  };

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || isAdFree || !adBundle?.adsEnabledForVideo || !adBundle.midRoll) return;
    if (activeOverlayAd) return;

    const maxAds = adBundle.settings?.maxAdsPerView ?? 3;
    if (adsShownThisPlayRef.current >= maxAds) return;

    const interval = Math.max(30, adBundle.settings?.midRollIntervalSeconds ?? 300);
    const minSpacing = Math.max(30, adBundle.settings?.minSpacingSeconds ?? 180);
    const cur = Math.floor(el.currentTime);

    if (cur >= interval && cur % interval <= 1 && cur - lastMidRollAtRef.current >= minSpacing) {
      lastMidRollAtRef.current = cur;
      adsShownThisPlayRef.current += 1;
      el.pause();
      setActiveOverlayAd('mid_roll');
      recordImpressionOnce(adBundle.midRoll);
    }
  };

  const handleVideoEnded = () => {
    recordViewPing(true);
    if (!isAdFree && adBundle?.adsEnabledForVideo && adBundle.postRoll) {
      const maxAds = adBundle.settings?.maxAdsPerView ?? 3;
      if (adsShownThisPlayRef.current < maxAds) {
        adsShownThisPlayRef.current += 1;
        setActiveOverlayAd('post_roll');
        recordImpressionOnce(adBundle.postRoll);
      }
    }
  };

  const dismissOverlayAd = () => {
    const prev = activeOverlayAd;
    setActiveOverlayAd(null);
    if ((prev === 'pre_roll' || prev === 'mid_roll') && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const jumpToSeconds = (sec: number) => {
    setNoteTimestamp(sec);
    if (videoRef.current) {
      videoRef.current.currentTime = sec;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleSaveVideo = async () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/videos/${id}`)}`);
      return;
    }
    try {
      await apiFetch(`/api/videos/${id}/save`, { method: 'POST', body: JSON.stringify({}) });
      setIsSaved(true);
      addToast('Video saved to My Knowledge.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Unable to save video.', 'error');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/videos/${id}`)}`);
      return;
    }
    if (!noteInput.trim()) return;
    const currentSec = videoRef.current ? Math.floor(videoRef.current.currentTime) : noteTimestamp;
    try {
      const res = await apiFetch<{ note: VideoNoteRecord }>(`/api/videos/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: noteInput.trim(), timestampSeconds: currentSec }),
      });
      setNotes((prev) => [res.note, ...prev]);
      setNoteInput('');
      addToast('Timestamped note saved.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save note.', 'error');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await apiFetch(`/api/videos/${id}/notes/${noteId}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      // ignore
    }
  };

  const handleRunIntelligence = async (action: 'summary' | 'qa') => {
    if (transcripts.length === 0) return;
    if (action === 'qa' && !qaInput.trim()) return;
    setIntelLoading(true);
    try {
      const res = await apiFetch<{
        transcriptAvailable: boolean;
        summary?: VideoSummaryRecord;
        answer?: string;
      }>(`/api/videos/${id}/intelligence`, {
        method: 'POST',
        body: JSON.stringify({ action, question: action === 'qa' ? qaInput.trim() : undefined }),
      });
      if (res.summary) setSummary(res.summary);
      if (res.answer) setQaAnswer(res.answer);
    } catch (err: any) {
      addToast(err.message || 'Video intelligence request failed.', 'error');
    } finally {
      setIntelLoading(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (reportDetails.trim().length < 10) {
      addToast('Please provide at least 10 characters explaining the report.', 'error');
      return;
    }
    setReportSubmitting(true);
    try {
      await apiFetch(`/api/videos/${id}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: reportReason, details: reportDetails.trim() }),
      });
      setReportOpen(false);
      setReportDetails('');
      addToast('Report submitted for moderation review.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to submit report.', 'error');
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#258BFF]" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-[#071426] dark:text-white">Video Not Found or Restricted</h1>
        <p className="text-sm text-[#8793A5]">
          {error || 'This video is either unavailable or awaiting administrator publication approval.'}
        </p>
        <Link to="/videos" className="inline-block px-5 py-2.5 rounded-xl bg-[#258BFF] text-white text-xs font-semibold">
          Back to Videos
        </Link>
      </div>
    );
  }

  const isYouTube = video.sourcePlatform === 'youtube' && Boolean(video.externalVideoId);
  const canEmbedYouTube = isYouTube && video.embedAllowed !== false;
  const hasTranscript = transcripts.length > 0;
  const filteredTranscripts = transcripts.filter(
    (t) =>
      !transcriptQuery.trim() ||
      t.text.toLowerCase().includes(transcriptQuery.toLowerCase()) ||
      (t.speaker || '').toLowerCase().includes(transcriptQuery.toLowerCase())
  );

  const isUnpublishedPreview =
    !video.isPublished || (video.status && !['published', 'approved'].includes(video.status));

  const currentOverlayAd: ServedVideoAd | null =
    activeOverlayAd === 'pre_roll'
      ? adBundle?.preRoll || null
      : activeOverlayAd === 'mid_roll'
        ? adBundle?.midRoll || null
        : activeOverlayAd === 'post_roll'
          ? adBundle?.postRoll || null
          : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/videos" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#258BFF] hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Video Discovery
        </Link>
        <div className="flex items-center gap-4 text-xs">
          {video.channelUrl && (
            <a
              href={video.channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300 hover:text-[#258BFF]"
            >
              Original Channel: {video.channel} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex items-center gap-1.5 font-semibold text-slate-500 hover:text-rose-500"
          >
            <Flag className="w-3.5 h-3.5" /> Report Video
          </button>
        </div>
      </div>

      {isUnpublishedPreview && (
        <div className="p-4 rounded-2xl border border-amber-500/40 bg-amber-50/70 dark:bg-[#10243D] flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Private Preview Mode:</strong> This video has status{' '}
              <strong className="uppercase">{video.status || 'draft'}</strong> and is only visible to you and platform administrators.
            </span>
          </div>
          <Link to="/dashboard/my-videos" className="font-bold text-[#258BFF] hover:underline shrink-0">
            Manage in My Videos
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Player, Banner Ad, Metadata, Intelligence, Notes */}
        <div className="lg:col-span-8 space-y-5">
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#071426]">
            {isYouTube ? (
              canEmbedYouTube ? (
                <iframe
                  title={video.title}
                  src={`https://www.youtube-nocookie.com/embed/${video.externalVideoId}`}
                  className="w-full aspect-video bg-black"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="aspect-video p-8 flex flex-col items-center justify-center text-center gap-4 bg-[#071426] text-white">
                  {video.thumbnailUrl && (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      referrerPolicy="no-referrer"
                      className="max-h-48 rounded-xl object-cover border border-slate-700"
                    />
                  )}
                  <div className="space-y-1 max-w-md">
                    <p className="text-sm font-bold">Embedding Disabled by Publisher</p>
                    <p className="text-xs text-[#8793A5]">
                      2MR respects original creator embedding permissions. Open the original video directly on YouTube.
                    </p>
                  </div>
                  <a
                    href={video.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF0000] text-white text-xs font-bold"
                  >
                    <Youtube className="w-4 h-4" /> Watch on Original Source
                  </a>
                </div>
              )
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={video.videoUrl}
                  controls
                  poster={video.thumbnailUrl || videoQuantumImg}
                  onPlay={() => recordViewPing(false)}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleVideoEnded}
                  className="w-full aspect-video bg-black"
                />

                {/* Transparent Pre-Roll / Mid-Roll / Post-Roll Overlay */}
                {currentOverlayAd && !isAdFree && (
                  <div className="absolute inset-0 z-20 p-6 sm:p-10 flex flex-col justify-between bg-[#071426]/95 text-white">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="text-[#B7F34A] font-bold uppercase tracking-wide">
                        {currentOverlayAd.sponsoredLabel} ·{' '}
                        {activeOverlayAd === 'pre_roll'
                          ? 'Pre-Roll'
                          : activeOverlayAd === 'mid_roll'
                            ? 'Mid-Roll Break'
                            : 'Post-Roll'}
                      </span>
                      <Link to="/pricing" className="text-[#258BFF] hover:underline whitespace-nowrap">
                        Go Premium for ad-free study
                      </Link>
                    </div>

                    <div className="space-y-3 max-w-xl">
                      <p className="text-xs text-[#8793A5]">Sponsor: {currentOverlayAd.sponsorName}</p>
                      <h3 className="text-xl sm:text-2xl font-bold">{currentOverlayAd.headline}</h3>
                      <p className="text-xs sm:text-sm text-slate-300">{currentOverlayAd.description}</p>
                      <div className="flex flex-wrap gap-3 pt-2">
                        <a
                          href={currentOverlayAd.ctaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => trackAdEvent(currentOverlayAd, 'click')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold"
                        >
                          {currentOverlayAd.ctaText} <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {activeOverlayAd === 'post_roll' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveOverlayAd(null);
                              if (videoRef.current) {
                                videoRef.current.currentTime = 0;
                                videoRef.current.play().catch(() => {});
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Replay Video
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={dismissOverlayAd}
                            className="px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
                          >
                            {activeOverlayAd === 'pre_roll' ? 'Continue to Video →' : 'Resume Playback →'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] text-[#8793A5]">
                      Clearly labeled advertising supports free open research on 2MR.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Transparent Banner Advertisement (Only when active + consented + non-Premium/Admin) */}
          {!isAdFree && adBundle?.adsEnabledForVideo && adBundle.banner && (
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                  {adBundle.banner.sponsoredLabel} · {adBundle.banner.sponsorName}
                </div>
                <div className="font-bold text-sm text-[#071426] dark:text-white">{adBundle.banner.headline}</div>
                <p className="text-xs text-[#8793A5] line-clamp-2">{adBundle.banner.description}</p>
              </div>
              <a
                href={adBundle.banner.ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackAdEvent(adBundle.banner!, 'click')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold shrink-0 whitespace-nowrap"
              >
                {adBundle.banner.ctaText} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Metadata & Actions */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#8793A5]">
                  <span className="font-semibold text-[#258BFF] dark:text-[#B7F34A]">
                    {video.uploaderName || video.channel}
                  </span>
                  <span>·</span>
                  <span>{video.categoryName || video.categorySlug}</span>
                  <span>·</span>
                  <span className="uppercase">{video.language || 'en'}</span>
                  <span>·</span>
                  <span className="font-mono tabular-nums">{video.duration || '00:00'}</span>
                  <span>·</span>
                  <span className="tabular-nums">{viewsCount.toLocaleString()} views</span>
                  {video.publishedAt && (
                    <>
                      <span>·</span>
                      <span className="tabular-nums">{video.publishedAt}</span>
                    </>
                  )}
                </div>
                <h1 className="text-2xl font-extrabold text-[#071426] dark:text-white">{video.title}</h1>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveVideo}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
                    isSaved
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#B7F34A] border border-emerald-500/30'
                      : 'bg-[#B7F34A] text-[#071426] hover:brightness-95'
                  }`}
                >
                  {isSaved ? <Check className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                  {isSaved ? 'Saved to My Knowledge' : 'Save Video'}
                </button>
                {isYouTube && (
                  <a
                    href={video.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
                  >
                    Original Source <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
              {video.description}
            </p>

            {Array.isArray(video.tags) && video.tags.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-[#8793A5] flex flex-wrap gap-3">
                <span className="font-semibold text-[#071426] dark:text-white">Tags:</span>
                {video.tags.map((t) => (
                  <span key={t} className="text-[#258BFF] dark:text-[#B7F34A]">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Video Intelligence (Strictly Gated on Transcript Availability) */}
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#071426] dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#258BFF] dark:text-[#B7F34A]" />
                  2MR Video Intelligence
                </h2>
                <p className="text-xs text-[#8793A5]">
                  Study summaries, key points, and revision questions are generated strictly from verified transcript text.
                </p>
              </div>
              <button
                type="button"
                disabled={!hasTranscript || intelLoading}
                onClick={() => handleRunIntelligence('summary')}
                className="px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {intelLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Generate Study Summary
              </button>
            </div>

            {!hasTranscript ? (
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-[#071426] flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[#071426] dark:text-white">Transcript Unavailable</p>
                  <p className="mt-0.5">
                    No accessible transcript is available for this video. 2MR never fabricates summaries, quotes, or study notes without verified transcript text. You can still write personal notes below.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {(summary || video.aiSummary) && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                    <p className="font-bold text-[#071426] dark:text-white">
                      AI-Generated Study Summary (Grounded Strictly in Transcript)
                    </p>
                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                      {summary?.summary || video.aiSummary}
                    </p>
                    {summary?.keyPoints && summary.keyPoints.length > 0 && (
                      <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                        {summary.keyPoints.map((kp, i) => (
                          <li key={i}>{kp}</li>
                        ))}
                      </ul>
                    )}
                    {summary?.revisionQuestions && summary.revisionQuestions.length > 0 && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                        <p className="font-bold text-[#258BFF] dark:text-[#B7F34A]">Revision Questions</p>
                        {summary.revisionQuestions.map((rq, i) => (
                          <p key={i} className="text-slate-700 dark:text-slate-200">
                            {i + 1}. {rq}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={qaInput}
                    onChange={(e) => setQaInput(e.target.value)}
                    placeholder="Ask a question grounded strictly in this video's transcript..."
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                  />
                  <button
                    type="button"
                    disabled={intelLoading || !qaInput.trim()}
                    onClick={() => handleRunIntelligence('qa')}
                    className="px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Ask Video
                  </button>
                </div>

                {qaAnswer && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 leading-relaxed space-y-1.5">
                    <div className="font-bold text-[#258BFF] dark:text-[#B7F34A]">
                      AI-Generated Transcript Answer
                    </div>
                    <div>{qaAnswer}</div>
                  </div>
                )}
              </div>
            )}

            <VisualIntelligencePanel
              feature="video_intelligence"
              query={video.title}
              contextText={qaAnswer || summary?.summary || video.aiSummary || video.description}
              videoContext={{
                title: video.title,
                channel: video.channel,
                thumbnailUrl: video.thumbnailUrl,
                videoUrl: video.videoUrl,
                transcripts: transcripts.map((t) => ({
                  startSeconds: t.startSeconds,
                  speaker: t.speaker,
                  text: t.text,
                })),
              }}
              autoRun={true}
              compact
            />
          </section>

          {/* Personal Video Notes */}
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#071426] dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#258BFF]" /> Personal Study Notes
              </h2>
              <Link to="/my-knowledge/notes" className="text-xs font-semibold text-[#258BFF] hover:underline">
                Open Full Notes Workspace →
              </Link>
            </div>
            <form onSubmit={handleAddNote} className="space-y-2.5">
              <textarea
                rows={3}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder={
                  user
                    ? 'Capture key takeaways or timestamps while watching...'
                    : 'Sign in to save personal timestamped notes for this video...'
                }
                className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold"
              >
                Save Note
              </button>
            </form>

            {notes.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <span className="font-mono text-[11px] text-[#258BFF] tabular-nums">
                        {Math.floor(n.timestampSeconds / 60)}:{String(n.timestampSeconds % 60).padStart(2, '0')}
                      </span>
                      <p className="text-slate-700 dark:text-slate-200">{n.content}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(n.id)}
                      className="text-rose-500 hover:text-rose-400 p-1 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Synchronized Transcript + Sponsored Recommendations + Related Videos */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] p-5 space-y-4">
            <div>
              <h3 className="font-bold text-sm text-[#071426] dark:text-white">Transcript &amp; Timestamps</h3>
              <p className="text-xs text-[#8793A5]">
                {hasTranscript ? 'Click a segment to jump playback.' : 'No verified transcript indexed for this video.'}
              </p>
            </div>
            {hasTranscript && (
              <>
                <input
                  type="text"
                  value={transcriptQuery}
                  onChange={(e) => setTranscriptQuery(e.target.value)}
                  placeholder="Search transcript..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                />
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {filteredTranscripts.map((seg) => (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => jumpToSeconds(seg.startSeconds)}
                      className="w-full p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 hover:border-[#258BFF] text-left text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#258BFF] tabular-nums">
                        <span>{seg.speaker || 'Speaker'}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {Math.floor(seg.startSeconds / 60)}:{String(seg.startSeconds % 60).padStart(2, '0')}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{seg.text}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Sponsored Video Recommendations (Clearly Labeled, Separated from Organic Results) */}
          {!isAdFree && adBundle?.adsEnabledForVideo && adBundle.sponsoredRecommendations.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] p-5 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                Sponsored Recommendations · 2MR Ads
              </div>
              <div className="space-y-2.5">
                {adBundle.sponsoredRecommendations.map((ad) => (
                  <a
                    key={ad.id}
                    href={ad.ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackAdEvent(ad, 'click')}
                    className="block p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 hover:border-[#258BFF] transition space-y-1"
                  >
                    <div className="text-[11px] font-semibold text-[#8793A5]">
                      Sponsored by {ad.sponsorName}
                    </div>
                    <div className="text-xs font-bold text-[#071426] dark:text-white">{ad.headline}</div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                      {ad.description}
                    </div>
                    <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[#258BFF] pt-1">
                      {ad.ctaText} <ExternalLink className="w-3 h-3" />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {relatedVideos.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] p-5 space-y-3">
              <h3 className="font-bold text-sm text-[#071426] dark:text-white">Related Videos</h3>
              <div className="space-y-2.5">
                {relatedVideos.map((rv) => (
                  <Link
                    key={rv.id}
                    to={`/videos/${rv.id}`}
                    className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 hover:border-[#258BFF] transition"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#10243D] flex items-center justify-center shrink-0 text-[#B7F34A]">
                      <Play className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#071426] dark:text-white line-clamp-2">{rv.title}</p>
                      <p className="text-[11px] text-[#8793A5] truncate">
                        {rv.channel} · {rv.duration}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Report Video Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleReportSubmit}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-[#071426] dark:text-white flex items-center gap-2">
                <Flag className="w-4 h-4 text-rose-500" /> Report Video Content
              </h2>
              <button type="button" onClick={() => setReportOpen(false)} className="text-[#8793A5]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                >
                  <option value="copyright">Copyright / Ownership Infringement</option>
                  <option value="inappropriate">Inappropriate or Harmful Content</option>
                  <option value="misinformation">Factual Misinformation</option>
                  <option value="spam">Spam or Misleading Metadata</option>
                  <option value="other">Other Concern</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">Details (minimum 10 characters)</label>
                <textarea
                  rows={4}
                  required
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Describe the copyright claim or content issue clearly..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reportSubmitting}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-50"
              >
                {reportSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
