import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  FileVideo,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { auth } from '../lib/firebase';
import { VideoCategoryRecord, VideoRecord } from '../types';

const VIDEO_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'rw', label: 'Kinyarwanda' },
  { code: 'sw', label: 'Swahili' },
  { code: 'es', label: 'Spanish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  processing: 'Processing Media',
  pending_review: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  published: 'Published',
  archived: 'Archived',
};

export const VideoUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, addToast } = useApp();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<VideoCategoryRecord[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categorySlug, setCategorySlug] = useState('education');
  const [language, setLanguage] = useState('en');
  const [tagsInput, setTagsInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreviewUrl, setThumbPreviewUrl] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'idle' | 'uploading' | 'scanning' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<VideoRecord | null>(null);

  useEffect(() => {
    apiFetch<{ categories: VideoCategoryRecord[] }>('/api/video-categories')
      .then((res) => {
        const list = res.categories || [];
        setCategories(list);
        if (list.length > 0 && !list.some((c) => c.slug === categorySlug)) {
          setCategorySlug(list[0].slug);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      if (thumbPreviewUrl) URL.revokeObjectURL(thumbPreviewUrl);
    };
  }, [videoPreviewUrl, thumbPreviewUrl]);

  const handleVideoSelected = (file: File | null) => {
    setError(null);
    if (!file) return;
    const maxBytes = 250 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError('Video file exceeds the 250 MB upload limit.');
      return;
    }
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.mp4') && !ext.endsWith('.webm') && !ext.endsWith('.mov')) {
      setError('Supported formats: MP4, WebM, and MOV.');
      return;
    }
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    if (!title.trim()) {
      const cleaned = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
      setTitle(cleaned.slice(0, 140));
    }
  };

  const handleThumbSelected = (file: File | null) => {
    setError(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Thumbnail image exceeds 5 MB limit.');
      return;
    }
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.jpg') && !ext.endsWith('.jpeg') && !ext.endsWith('.png') && !ext.endsWith('.webp')) {
      setError('Thumbnail must be JPEG, PNG, or WebP.');
      return;
    }
    if (thumbPreviewUrl) URL.revokeObjectURL(thumbPreviewUrl);
    setThumbFile(file);
    setThumbPreviewUrl(URL.createObjectURL(file));
  };

  const commitTagsFromInput = () => {
    const parts = tagsInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length >= 2 && s.length <= 36);
    if (parts.length === 0) return;
    setTags((prev) => Array.from(new Set([...prev, ...parts])).slice(0, 12));
    setTagsInput('');
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleUploadSubmit = async (submissionMode: 'draft' | 'review') => {
    setError(null);
    if (!videoFile) {
      setError('Please select a video file before uploading.');
      return;
    }
    if (title.trim().length < 3) {
      setError('Please enter a video title (at least 3 characters).');
      return;
    }
    if (description.trim().length < 15) {
      setError('Please enter a detailed description (at least 15 characters).');
      return;
    }
    if (!rightsConfirmed) {
      setError('Confirm copyright ownership or permission to publish on 2MR before uploading.');
      return;
    }

    const finalTags = Array.from(
      new Set([
        ...tags,
        ...tagsInput
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.length >= 2 && s.length <= 36),
      ])
    ).slice(0, 12);

    const formData = new FormData();
    formData.append('videoFile', videoFile);
    if (thumbFile) formData.append('thumbnailFile', thumbFile);
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('categorySlug', categorySlug);
    formData.append('language', language);
    formData.append('tags', JSON.stringify(finalTags));
    formData.append('submissionMode', submissionMode);
    formData.append('rightsConfirmed', 'true');

    setUploading(true);
    setUploadProgress(0);
    setUploadStage('uploading');

    try {
      let bearerToken: string | null = null;
      if (auth.currentUser) {
        bearerToken = await auth.currentUser.getIdToken().catch(() => null);
      }

      const result = await new Promise<{ video: VideoRecord; message: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/videos/upload');
        xhr.withCredentials = true;
        if (bearerToken) {
          xhr.setRequestHeader('Authorization', `Bearer ${bearerToken}`);
        }

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.min(99, Math.round((ev.loaded / ev.total) * 100));
            setUploadProgress(pct);
            if (pct >= 98) {
              setUploadStage('scanning');
            }
          }
        };

        xhr.onload = () => {
          let payload: any = {};
          try {
            payload = JSON.parse(xhr.responseText || '{}');
          } catch {
            payload = {};
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(100);
            setUploadStage('done');
            resolve(payload);
          } else {
            reject(new Error(payload.error || `Upload failed (${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during video upload.'));
        xhr.send(formData);
      });

      setUploadedVideo(result.video);
      addToast(result.message, 'success');
    } catch (err: any) {
      setUploadStage('idle');
      setError(err.message || 'Video upload failed.');
      addToast(err.message || 'Video upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;

  const storageRemainingMb = Math.max(0, (user.storageLimitMb || 500) - (user.storageUsedMb || 0));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-xs">
            <Link to="/videos" className="inline-flex items-center gap-1.5 font-semibold text-[#258BFF] hover:underline">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Videos
            </Link>
            <span className="text-[#8793A5]">·</span>
            <Link to="/dashboard/my-videos" className="font-semibold text-slate-600 dark:text-slate-300 hover:text-[#258BFF]">
              My Uploaded Videos
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#071426] dark:text-white">
            Upload Research Video
          </h1>
          <p className="text-xs text-[#8793A5]">
            Publish lectures, tutorials, or documented briefings. Only administrator-approved and published videos become publicly accessible.
          </p>
        </div>

        <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
          Available Storage:{' '}
          <strong className="text-[#071426] dark:text-white">{storageRemainingMb.toLocaleString()} MB</strong> of{' '}
          {(user.storageLimitMb || 500).toLocaleString()} MB
        </div>
      </div>

      {/* Upload Success Banner */}
      {uploadedVideo && (
        <div className="p-5 rounded-2xl border border-emerald-500/40 bg-emerald-50/70 dark:bg-[#10243D] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-[#B7F34A] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-sm text-[#071426] dark:text-white">
                {uploadedVideo.title}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Status:{' '}
                <strong className="text-[#258BFF] dark:text-[#B7F34A]">
                  {STATUS_LABELS[uploadedVideo.status || 'processing'] || uploadedVideo.status}
                </strong>{' '}
                · Security scan clean · Stored privately pending review
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate(`/videos/${uploadedVideo.id}`)}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
            >
              Preview Video
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard/my-videos')}
              className="px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
            >
              Manage My Videos
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300 font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Metadata & Form */}
        <div className="lg:col-span-7 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
          {/* Video File Picker */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#071426] dark:text-white">
              Video File (MP4, WebM, MOV · Max 250 MB)
            </label>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              onChange={(e) => handleVideoSelected(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => videoInputRef.current?.click()}
              className="w-full p-5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] hover:border-[#258BFF] transition flex items-center justify-between gap-4 text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#258BFF]/10 text-[#258BFF] flex items-center justify-center shrink-0">
                  <FileVideo className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#071426] dark:text-white truncate">
                    {videoFile ? videoFile.name : 'Choose a video file from your device'}
                  </div>
                  <div className="text-[11px] text-[#8793A5] tabular-nums">
                    {videoFile
                      ? `${(videoFile.size / (1024 * 1024)).toFixed(2)} MB · ${videoFile.type || 'video media'}`
                      : 'Validated via magic-byte inspection and malware scan'}
                  </div>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-lg bg-[#258BFF] text-white text-xs font-semibold shrink-0 whitespace-nowrap">
                {videoFile ? 'Replace File' : 'Select Video'}
              </span>
            </button>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#071426] dark:text-white">Video Title</label>
            <input
              type="text"
              value={title}
              maxLength={180}
              disabled={uploading}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Applied Machine Learning for Climate Data Synthesis"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs text-[#071426] dark:text-white focus:outline-none focus:border-[#258BFF]"
            />
          </div>

          {/* Detailed Description */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#071426] dark:text-white">Detailed Description</label>
            <textarea
              rows={5}
              maxLength={5000}
              disabled={uploading}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summarize research objectives, sources discussed, and learning outcomes (minimum 15 characters)..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs text-[#071426] dark:text-white focus:outline-none focus:border-[#258BFF]"
            />
          </div>

          {/* Category & Language */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#071426] dark:text-white">Category</label>
              <select
                value={categorySlug}
                disabled={uploading}
                onChange={(e) => setCategorySlug(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs text-[#071426] dark:text-white"
              >
                {categories.length === 0 ? (
                  <option value="education">Education &amp; Academic</option>
                ) : (
                  categories.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#071426] dark:text-white">Video Language</label>
              <select
                value={language}
                disabled={uploading}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs text-[#071426] dark:text-white"
              >
                {VIDEO_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags & Keywords */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#071426] dark:text-white">Tags &amp; Keywords</label>
            <div className="flex gap-2">
              <input
                type="text"
                disabled={uploading}
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    commitTagsFromInput();
                  }
                }}
                placeholder="Type keywords separated by comma and press Enter (e.g., genomics, crispr, rwanda)"
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs text-[#071426] dark:text-white"
              />
              <button
                type="button"
                disabled={uploading || !tagsInput.trim()}
                onClick={commitTagsFromInput}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF] disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300 pt-1">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 font-medium">
                    <span className="text-[#258BFF] dark:text-[#B7F34A]">#{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-slate-400 hover:text-rose-500"
                      aria-label={`Remove ${tag}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Thumbnail Picker */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#071426] dark:text-white">
              Custom Thumbnail (Optional — auto-extracted if omitted)
            </label>
            <input
              ref={thumbInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={(e) => handleThumbSelected(e.target.files?.[0] || null)}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={uploading}
                onClick={() => thumbInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
              >
                <ImageIcon className="w-4 h-4 text-[#258BFF]" />
                {thumbFile ? 'Change Thumbnail' : 'Upload Thumbnail (JPEG/PNG/WebP)'}
              </button>
              {thumbFile && (
                <button
                  type="button"
                  onClick={() => {
                    if (thumbPreviewUrl) URL.revokeObjectURL(thumbPreviewUrl);
                    setThumbFile(null);
                    setThumbPreviewUrl(null);
                  }}
                  className="text-xs text-rose-500 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Rights & Processing Confirmation */}
          <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              disabled={uploading}
              checked={rightsConfirmed}
              onChange={(e) => setRightsConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-[#258BFF] focus:ring-[#258BFF]"
            />
            <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              I confirm that I own the rights or have explicit permission to distribute this video on 2MR, and I authorize automated security scanning, media optimization, and administrator moderation review.
            </span>
          </label>

          {/* Progress Bar */}
          {uploading && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="inline-flex items-center gap-2 text-[#258BFF]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {uploadStage === 'scanning'
                    ? 'Running malware verification & queuing FFmpeg processing...'
                    : 'Uploading media securely...'}
                </span>
                <span className="tabular-nums text-[#071426] dark:text-white">{uploadProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-[#258BFF] transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => handleUploadSubmit('draft')}
              className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF] disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => handleUploadSubmit('review')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold hover:brightness-95 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              Submit for Review
            </button>
          </div>
        </div>

        {/* Right: Live Local Preview Before Submission */}
        <aside className="lg:col-span-5 space-y-5 lg:sticky lg:top-20">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#071426] dark:text-white">Pre-Submission Video Preview</h2>
              <span className="text-[11px] text-[#8793A5]">Local Playback</span>
            </div>

            {videoPreviewUrl ? (
              <video
                src={videoPreviewUrl}
                poster={thumbPreviewUrl || undefined}
                controls
                className="w-full aspect-video bg-black"
              />
            ) : (
              <div className="aspect-video bg-[#071426] flex flex-col items-center justify-center p-6 text-center space-y-2 text-[#8793A5]">
                <FileVideo className="w-8 h-8 text-[#258BFF]" />
                <p className="text-xs font-semibold text-white">No video selected yet</p>
                <p className="text-[11px]">Select an MP4, WebM, or MOV file to preview playback before submitting.</p>
              </div>
            )}

            <div className="p-4 space-y-2">
              <div className="text-[11px] text-[#8793A5] flex items-center gap-2">
                <span className="font-semibold text-[#258BFF] dark:text-[#B7F34A]">
                  {categories.find((c) => c.slug === categorySlug)?.name || categorySlug}
                </span>
                <span>·</span>
                <span>{VIDEO_LANGUAGES.find((l) => l.code === language)?.label || language}</span>
              </div>
              <h3 className="text-sm font-bold text-[#071426] dark:text-white">
                {title.trim() || 'Untitled Research Video'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                {description.trim() || 'Your detailed description will appear here alongside playback.'}
              </p>
              {thumbPreviewUrl && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
                  <img
                    src={thumbPreviewUrl}
                    alt="Thumbnail preview"
                    className="w-20 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                  />
                  <span className="text-[11px] text-[#8793A5]">Custom poster thumbnail attached</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-[#071426] dark:text-white">
              <ShieldCheck className="w-4 h-4 text-[#258BFF]" /> Moderation &amp; Workflow Statuses
            </div>
            <p className="text-[#8793A5] leading-relaxed">
              Uploaded videos pass through automated malware scanning and FFmpeg optimization into{' '}
              <strong className="text-[#071426] dark:text-white">Draft</strong> or{' '}
              <strong className="text-[#071426] dark:text-white">Pending Review</strong>. Only administrator-approved and published videos become publicly discoverable.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};
