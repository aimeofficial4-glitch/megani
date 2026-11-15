import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Edit3,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { VideoCategoryRecord, VideoRecord, VideoReviewRecord } from '../types';

interface MyVideoEntry extends VideoRecord {
  reviews?: VideoReviewRecord[];
  engagement?: {
    views: number;
    avgWatchSeconds: number;
    completions: number;
  };
}

const STATUS_DISPLAY: Record<string, { label: string; colorClass: string }> = {
  draft: { label: 'Draft', colorClass: 'text-slate-600 dark:text-slate-300' },
  processing: { label: 'Processing', colorClass: 'text-amber-600 dark:text-amber-400' },
  pending_review: { label: 'Pending Review', colorClass: 'text-[#258BFF]' },
  approved: { label: 'Approved (Unpublished)', colorClass: 'text-emerald-600 dark:text-emerald-400' },
  rejected: { label: 'Rejected', colorClass: 'text-rose-600 dark:text-rose-400' },
  published: { label: 'Published', colorClass: 'text-emerald-600 dark:text-[#B7F34A]' },
  archived: { label: 'Archived', colorClass: 'text-[#8793A5]' },
};

export const MyVideosPage: React.FC = () => {
  const { addToast } = useApp();
  const [videos, setVideos] = useState<MyVideoEntry[]>([]);
  const [categories, setCategories] = useState<VideoCategoryRecord[]>([]);
  const [storage, setStorage] = useState<{ usedMb: number; limitMb: number }>({ usedMb: 0, limitMb: 500 });
  const [loading, setLoading] = useState(true);

  const [editingVideo, setEditingVideo] = useState<MyVideoEntry | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('education');
  const [editLanguage, setEditLanguage] = useState('en');
  const [editTags, setEditTags] = useState('');
  const [editThumbFile, setEditThumbFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadMyVideos = async () => {
    setLoading(true);
    try {
      const [myRes, catRes] = await Promise.all([
        apiFetch<{ videos: MyVideoEntry[]; storage: { usedMb: number; limitMb: number } }>('/api/my-videos'),
        apiFetch<{ categories: VideoCategoryRecord[] }>('/api/video-categories'),
      ]);
      setVideos(myRes.videos || []);
      setStorage(myRes.storage || { usedMb: 0, limitMb: 500 });
      setCategories(catRes.categories || []);
    } catch (err: any) {
      addToast(err.message || 'Unable to load your videos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyVideos();
  }, []);

  const openEditModal = (video: MyVideoEntry) => {
    setEditingVideo(video);
    setEditTitle(video.title || '');
    setEditDescription(video.description || '');
    setEditCategory(video.categorySlug || 'education');
    setEditLanguage(video.language || 'en');
    setEditTags(Array.isArray(video.tags) ? video.tags.join(', ') : '');
    setEditThumbFile(null);
  };

  const handleSaveEdit = async (action: 'save' | 'submit_review' | 'draft') => {
    if (!editingVideo) return;
    if (editTitle.trim().length < 3 || editDescription.trim().length < 15) {
      addToast('Title (3+ chars) and description (15+ chars) are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', editTitle.trim());
      fd.append('description', editDescription.trim());
      fd.append('categorySlug', editCategory);
      fd.append('language', editLanguage);
      fd.append('tags', editTags);
      fd.append('action', action);
      if (editThumbFile) fd.append('thumbnailFile', editThumbFile);

      await apiFetch(`/api/my-videos/${editingVideo.id}`, {
        method: 'PATCH',
        body: fd,
      });

      addToast(
        action === 'submit_review'
          ? 'Video updated and submitted for administrator review.'
          : 'Video metadata updated.',
        'success'
      );
      setEditingVideo(null);
      await loadMyVideos();
    } catch (err: any) {
      addToast(err.message || 'Failed to update video.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickResubmit = async (videoId: string) => {
    try {
      const fd = new FormData();
      fd.append('action', 'submit_review');
      await apiFetch(`/api/my-videos/${videoId}`, {
        method: 'PATCH',
        body: fd,
      });
      addToast('Video submitted for review.', 'success');
      await loadMyVideos();
    } catch (err: any) {
      addToast(err.message || 'Resubmit failed.', 'error');
    }
  };

  const handleDelete = async (videoId: string) => {
    setDeletingId(videoId);
    try {
      await apiFetch(`/api/my-videos/${videoId}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      addToast('Video deleted and storage reclaimed.', 'success');
      await loadMyVideos();
    } catch (err: any) {
      addToast(err.message || 'Failed to delete video.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const storagePct = storage.limitMb > 0 ? Math.min(100, Math.round((storage.usedMb / storage.limitMb) * 100)) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#258BFF] dark:text-[#B7F34A] font-bold uppercase tracking-wider">
            <Video className="w-4 h-4" /> Creator Studio
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#071426] dark:text-white mt-1">My Videos</h1>
          <p className="text-xs text-[#8793A5]">
            Track review statuses, edit metadata, replace thumbnails, monitor real watch metrics, or resubmit rejected uploads.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadMyVideos}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <Link
            to="/videos/upload"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold hover:brightness-95"
          >
            <Plus className="w-4 h-4" /> Upload Video
          </Link>
        </div>
      </div>

      {/* Quota & Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1">
          <div className="text-xs text-[#8793A5]">Uploaded Videos</div>
          <div className="text-2xl font-extrabold text-[#071426] dark:text-white tabular-nums">{videos.length}</div>
        </div>
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1">
          <div className="text-xs text-[#8793A5]">Published Live</div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-[#B7F34A] tabular-nums">
            {videos.filter((v) => v.isPublished && v.status === 'published').length}
          </div>
        </div>
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1">
          <div className="text-xs text-[#8793A5]">Total Views</div>
          <div className="text-2xl font-extrabold text-[#258BFF] tabular-nums">
            {videos.reduce((sum, v) => sum + (v.engagement?.views ?? v.viewsCount ?? 0), 0).toLocaleString()}
          </div>
        </div>
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#8793A5]">Storage Used</span>
            <span className="font-semibold text-[#071426] dark:text-white tabular-nums">
              {storage.usedMb} / {storage.limitMb} MB
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-[#258BFF]" style={{ width: `${storagePct}%` }} />
          </div>
        </div>
      </div>

      {/* Video List */}
      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-[#258BFF]" />
        </div>
      ) : videos.length === 0 ? (
        <div className="p-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center space-y-3">
          <Upload className="w-10 h-10 text-[#258BFF] mx-auto" />
          <h2 className="text-lg font-bold text-[#071426] dark:text-white">No Uploaded Videos Yet</h2>
          <p className="text-xs text-[#8793A5] max-w-md mx-auto">
            Upload your first educational video, lecture, or research briefing to submit it for publication on 2MR.
          </p>
          <Link
            to="/videos/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
          >
            <Plus className="w-4 h-4" /> Upload First Video
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {videos.map((v) => {
            const statusKey = v.status || (v.isPublished ? 'published' : 'draft');
            const statusMeta = STATUS_DISPLAY[statusKey] || { label: statusKey, colorClass: 'text-[#8793A5]' };
            const views = v.engagement?.views ?? v.viewsCount ?? 0;
            const avgWatch = v.engagement?.avgWatchSeconds ?? 0;

            return (
              <div
                key={v.id}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col lg:flex-row gap-5 justify-between"
              >
                <div className="flex flex-col sm:flex-row gap-4 min-w-0">
                  <div className="w-full sm:w-48 h-28 rounded-xl bg-[#071426] overflow-hidden shrink-0 border border-slate-200 dark:border-slate-800">
                    {v.thumbnailUrl ? (
                      <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#8793A5]">
                        <Video className="w-7 h-7" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`font-bold ${statusMeta.colorClass}`}>{statusMeta.label}</span>
                      <span className="text-[#8793A5]">·</span>
                      <span className="text-[#8793A5]">{v.categorySlug}</span>
                      <span className="text-[#8793A5]">·</span>
                      <span className="uppercase text-[#8793A5]">{v.language || 'en'}</span>
                      <span className="text-[#8793A5]">·</span>
                      <span className="font-mono text-[#8793A5] tabular-nums">{v.duration || '00:00'}</span>
                    </div>

                    <h2 className="text-base font-bold text-[#071426] dark:text-white truncate">{v.title}</h2>
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{v.description}</p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8793A5] tabular-nums pt-0.5">
                      <span>Views: {views.toLocaleString()}</span>
                      <span>·</span>
                      <span>Avg Watch: {avgWatch}s</span>
                      <span>·</span>
                      <span>Completions: {v.engagement?.completions ?? 0}</span>
                      {v.fileSizeBytes ? (
                        <>
                          <span>·</span>
                          <span>{(v.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                        </>
                      ) : null}
                    </div>

                    {v.status === 'rejected' && v.rejectionReason && (
                      <div className="mt-2 p-2.5 rounded-xl border border-rose-500/30 bg-rose-50/70 dark:bg-rose-950/20 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <strong>Reviewer Reason:</strong> {v.rejectionReason}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap lg:flex-col items-start lg:items-end justify-between gap-2 shrink-0">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/videos/${v.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </Link>
                    <button
                      type="button"
                      onClick={() => openEditModal(v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    {(v.status === 'draft' || v.status === 'rejected') && (
                      <button
                        type="button"
                        onClick={() => handleQuickResubmit(v.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#258BFF] text-white text-xs font-semibold"
                      >
                        <Send className="w-3.5 h-3.5" /> Submit for Review
                      </button>
                    )}
                  </div>

                  {confirmDeleteId === v.id ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-rose-500 font-semibold">Confirm delete?</span>
                      <button
                        type="button"
                        disabled={deletingId === v.id}
                        onClick={() => handleDelete(v.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold"
                      >
                        {deletingId === v.id ? 'Deleting...' : 'Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(v.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-400 px-2 py-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Video Modal */}
      {editingVideo && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-[#071426] dark:text-white">Edit Video &amp; Thumbnail</h2>
              <button
                type="button"
                onClick={() => setEditingVideo(null)}
                className="p-1 rounded-lg text-[#8793A5] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Description</label>
                <textarea
                  rows={4}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
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
                    type="text"
                    value={editLanguage}
                    onChange={(e) => setEditLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Replace Thumbnail (Optional)</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setEditThumbFile(e.target.files?.[0] || null)}
                  className="w-full text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingVideo(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveEdit('save')}
                className="px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveEdit('submit_review')}
                className="px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
              >
                Save &amp; Resubmit for Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
