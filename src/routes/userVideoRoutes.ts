import { Router, Request, Response } from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  auditLogs,
  users,
  videoCategories,
  videoReports,
  videoReviews,
  videoTags,
  videoViews,
  videos,
} from '../db/schema.ts';
import { AuthRequest, rateLimit, requireAuth } from '../middleware/auth.ts';
import { parseConsentCookie } from './privacyRoutes.ts';
import {
  MAX_THUMBNAIL_BYTES,
  MAX_VIDEO_BYTES,
  deleteStoredObject,
  ensureVideoCategoriesSeeded,
  getTempUploadDir,
  moveTempFileToVault,
  resolveThumbnailPath,
  resolveVideoPath,
  scanFileForMalware,
  validateImageMimeAndExtension,
  validateVideoMimeAndExtension,
  enqueueVideoProcessingPipeline,
} from '../services/videoStorage.ts';
import {
  hashViewerIdentity,
  recordVideoAdInteraction,
  resolveVideoAdBundle,
} from '../services/videoAdEngine.ts';

export const userVideoRoutes = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getTempUploadDir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `up_${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: {
    fileSize: MAX_VIDEO_BYTES,
    files: 2,
  },
});

const uploadFields = upload.fields([
  { name: 'videoFile', maxCount: 1 },
  { name: 'thumbnailFile', maxCount: 1 },
]);

const uploadThumbOnly = upload.single('thumbnailFile');

async function cleanupMulterTemp(files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>) {
  if (!files) return;
  const list = Array.isArray(files)
    ? files
    : Object.values(files).flat();
  for (const f of list) {
    if (f?.path) await fsp.unlink(f.path).catch(() => {});
  }
}

function parseTagsInput(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .map((t) => String(t).trim().toLowerCase())
          .filter((t) => t.length >= 2 && t.length <= 36)
      )
    ).slice(0, 12);
  }
  if (typeof raw === 'string') {
    try {
      if (raw.trim().startsWith('[')) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parseTagsInput(parsed);
      }
    } catch {
      // fall through to comma split
    }
    return Array.from(
      new Set(
        raw
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length >= 2 && t.length <= 36)
      )
    ).slice(0, 12);
  }
  return [];
}

function canUserAccessVideo(
  video: { status: string; isPublished: boolean; uploaderUserId: string | null },
  user?: { id: string; role: string } | null
): boolean {
  const isPubliclyVisible =
    Boolean(video.isPublished) && (video.status === 'published' || video.status === 'approved');
  if (isPubliclyVisible) return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (video.uploaderUserId && video.uploaderUserId === user.id) return true;
  return false;
}

// Public active video categories
userVideoRoutes.get('/video-categories', async (_req: Request, res: Response) => {
  try {
    await ensureVideoCategoriesSeeded();
    const rows = await db
      .select()
      .from(videoCategories)
      .where(eq(videoCategories.isActive, true))
      .orderBy(videoCategories.sortOrder, videoCategories.name);
    return res.json({ categories: rows });
  } catch {
    return res.status(500).json({ error: 'Failed to load video categories.' });
  }
});

// Upload a user video + optional thumbnail (stored privately & processed asynchronously)
userVideoRoutes.post(
  '/videos/upload',
  requireAuth,
  rateLimit(60_000, 10),
  (req: AuthRequest, res: Response) => {
    uploadFields(req, res, async (multerErr: any) => {
      const filesMap = req.files as Record<string, Express.Multer.File[]> | undefined;
      if (multerErr) {
        await cleanupMulterTemp(filesMap);
        return res.status(400).json({
          error:
            multerErr.code === 'LIMIT_FILE_SIZE'
              ? `File exceeds maximum allowed size (${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB).`
              : multerErr.message || 'Invalid multipart upload.',
        });
      }

      const videoFile = filesMap?.videoFile?.[0];
      const thumbFile = filesMap?.thumbnailFile?.[0];

      try {
        await ensureVideoCategoriesSeeded();
        if (!videoFile) {
          await cleanupMulterTemp(filesMap);
          return res.status(400).json({ error: 'Please select a video file (MP4, WebM, or MOV) to upload.' });
        }

        const {
          title,
          description,
          categorySlug = 'education',
          language = 'en',
          tags,
          submissionMode = 'review', // 'draft' | 'review'
          rightsConfirmed,
        } = req.body || {};

        const cleanTitle = String(title || '').trim();
        const cleanDesc = String(description || '').trim();
        if (cleanTitle.length < 3 || cleanTitle.length > 180) {
          await cleanupMulterTemp(filesMap);
          return res.status(400).json({ error: 'Video title must be between 3 and 180 characters.' });
        }
        if (cleanDesc.length < 15 || cleanDesc.length > 5000) {
          await cleanupMulterTemp(filesMap);
          return res.status(400).json({ error: 'Detailed description must be at least 15 characters.' });
        }
        const confirmed = rightsConfirmed === true || rightsConfirmed === 'true' || rightsConfirmed === '1';
        if (!confirmed) {
          await cleanupMulterTemp(filesMap);
          return res.status(400).json({
            error: 'You must confirm copyright ownership or distribution permission before uploading.',
          });
        }

        if (!validateVideoMimeAndExtension(videoFile.mimetype, videoFile.originalname)) {
          await cleanupMulterTemp(filesMap);
          return res.status(400).json({
            error: 'Unsupported video format. Upload MP4, WebM, or MOV files only.',
          });
        }

        if (thumbFile) {
          if (thumbFile.size > MAX_THUMBNAIL_BYTES) {
            await cleanupMulterTemp(filesMap);
            return res.status(400).json({ error: 'Thumbnail exceeds 5 MB limit.' });
          }
          if (!validateImageMimeAndExtension(thumbFile.mimetype, thumbFile.originalname)) {
            await cleanupMulterTemp(filesMap);
            return res.status(400).json({ error: 'Thumbnail must be JPEG, PNG, or WebP.' });
          }
        }

        // Storage quota check
        const totalUploadMb = Math.max(1, Math.ceil((videoFile.size + (thumbFile?.size || 0)) / (1024 * 1024)));
        const user = req.currentUser!;
        if (user.storageUsedMb + totalUploadMb > user.storageLimitMb) {
          await cleanupMulterTemp(filesMap);
          return res.status(403).json({
            error: `Storage quota exceeded (${user.storageUsedMb}/${user.storageLimitMb} MB used). Upgrade plan or remove older videos.`,
          });
        }

        // Malware & magic-byte scan
        const videoScan = await scanFileForMalware(videoFile.path, 'video');
        if (!videoScan.clean) {
          await cleanupMulterTemp(filesMap);
          return res.status(400).json({ error: videoScan.reason || 'Video failed malware security verification.' });
        }

        let thumbObjectKey: string | null = null;
        if (thumbFile) {
          const thumbScan = await scanFileForMalware(thumbFile.path, 'image');
          if (!thumbScan.clean) {
            await cleanupMulterTemp(filesMap);
            return res.status(400).json({ error: thumbScan.reason || 'Thumbnail failed security verification.' });
          }
          thumbObjectKey = await moveTempFileToVault(
            thumbFile.path,
            'thumbnail',
            path.extname(thumbFile.originalname) || '.jpg'
          );
        }

        const videoObjectKey = await moveTempFileToVault(
          videoFile.path,
          'video',
          path.extname(videoFile.originalname) || '.mp4'
        );

        const parsedTags = parseTagsInput(tags);
        const targetStatusAfterProcessing: 'draft' | 'pending_review' =
          submissionMode === 'draft' ? 'draft' : 'pending_review';

        const [created] = await db
          .insert(videos)
          .values({
            uploaderUserId: user.id,
            title: cleanTitle,
            channel: user.fullName || user.email.split('@')[0],
            description: cleanDesc,
            categorySlug: String(categorySlug || 'education').trim().toLowerCase(),
            language: String(language || 'en').trim().toLowerCase(),
            tags: parsedTags,
            duration: '00:00',
            durationSeconds: 0,
            videoUrl: '/api/videos/pending/stream', // replaced with real id below
            thumbnailUrl: null,
            storageObjectKey: videoObjectKey,
            thumbnailObjectKey: thumbObjectKey,
            fileSizeBytes: videoFile.size,
            mimeType: videoFile.mimetype,
            checksumSha256: videoScan.sha256,
            malwareScanStatus: 'clean',
            processingStatus: 'processing',
            rightsConfirmed: true,
            status: 'processing',
            sourcePlatform: '2mr_hosted',
            transcriptAvailable: false,
            isFeatured: false,
            isPublished: false,
            submittedAt: targetStatusAfterProcessing === 'pending_review' ? new Date() : null,
          })
          .returning();

        const streamUrl = `/api/videos/${created.id}/stream`;
        const thumbUrl = thumbObjectKey ? `/api/videos/${created.id}/thumbnail` : null;

        const [updatedVideo] = await db
          .update(videos)
          .set({
            videoUrl: streamUrl,
            thumbnailUrl: thumbUrl,
          })
          .where(eq(videos.id, created.id))
          .returning();

        if (parsedTags.length > 0) {
          await db.insert(videoTags).values(
            parsedTags.map((tag) => ({ videoId: created.id, tag }))
          );
        }

        await db
          .update(users)
          .set({
            storageUsedMb: sql`${users.storageUsedMb} + ${totalUploadMb}`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        await db.insert(auditLogs).values({
          actorUserId: user.id,
          actorEmail: user.email,
          action: 'USER_VIDEO_UPLOADED',
          resource: 'videos',
          details: {
            videoId: created.id,
            title: cleanTitle,
            sizeBytes: videoFile.size,
            submissionMode: targetStatusAfterProcessing,
          },
        });

        enqueueVideoProcessingPipeline({
          videoId: created.id,
          storageObjectKey: videoObjectKey,
          hasCustomThumbnail: Boolean(thumbObjectKey),
          targetStatusAfterProcessing,
          uploaderEmail: user.email,
        });

        return res.status(201).json({
          video: updatedVideo,
          message:
            targetStatusAfterProcessing === 'draft'
              ? 'Video uploaded and processing started. Saved as draft.'
              : 'Video uploaded securely, malware-scanned, and queued for processing and admin review.',
        });
      } catch (err: any) {
        await cleanupMulterTemp(filesMap);
        console.error('POST /api/videos/upload error:', err);
        return res.status(500).json({ error: 'Video upload failed cleanly. Please retry.' });
      }
    });
  }
);

// List authenticated user's uploaded videos + analytics + review history
userVideoRoutes.get('/my-videos', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.currentUser!.id;
    const myVideos = await db
      .select()
      .from(videos)
      .where(eq(videos.uploaderUserId, userId))
      .orderBy(desc(videos.createdAt));

    const reviewsByVideo: Record<string, any[]> = {};
    const engagementByVideo: Record<string, { views: number; avgWatchSeconds: number; completions: number }> = {};

    if (myVideos.length > 0) {
      for (const v of myVideos) {
        const [revRows, viewStats] = await Promise.all([
          db
            .select()
            .from(videoReviews)
            .where(eq(videoReviews.videoId, v.id))
            .orderBy(desc(videoReviews.createdAt))
            .limit(5),
          db
            .select({
              totalViews: sql<number>`count(*)::int`,
              avgWatch: sql<number>`coalesce(round(avg(${videoViews.watchSeconds})), 0)::int`,
              completions: sql<number>`coalesce(sum(case when ${videoViews.completed} then 1 else 0 end), 0)::int`,
            })
            .from(videoViews)
            .where(eq(videoViews.videoId, v.id)),
        ]);
        reviewsByVideo[v.id] = revRows;
        const st = viewStats[0];
        engagementByVideo[v.id] = {
          views: Math.max(v.viewsCount, Number(st?.totalViews || 0)),
          avgWatchSeconds: Number(st?.avgWatch || 0),
          completions: Number(st?.completions || 0),
        };
      }
    }

    return res.json({
      videos: myVideos.map((v) => ({
        ...v,
        reviews: reviewsByVideo[v.id] || [],
        engagement: engagementByVideo[v.id] || { views: v.viewsCount || 0, avgWatchSeconds: 0, completions: 0 },
      })),
      storage: {
        usedMb: req.currentUser!.storageUsedMb,
        limitMb: req.currentUser!.storageLimitMb,
      },
    });
  } catch (err) {
    console.error('GET /api/my-videos error:', err);
    return res.status(500).json({ error: 'Failed to load your uploaded videos.' });
  }
});

// Edit user's own video metadata, optionally replace thumbnail, and resubmit for review
userVideoRoutes.patch('/my-videos/:id', requireAuth, (req: AuthRequest, res: Response) => {
  uploadThumbOnly(req, res, async (multerErr: any) => {
    const thumbFile = req.file;
    try {
      if (multerErr) {
        if (thumbFile?.path) await fsp.unlink(thumbFile.path).catch(() => {});
        return res.status(400).json({ error: multerErr.message || 'Invalid thumbnail upload.' });
      }

      const [existing] = await db
        .select()
        .from(videos)
        .where(eq(videos.id, req.params.id))
        .limit(1);

      if (!existing) {
        if (thumbFile?.path) await fsp.unlink(thumbFile.path).catch(() => {});
        return res.status(404).json({ error: 'Video not found.' });
      }

      if (!existing.uploaderUserId || existing.uploaderUserId !== req.currentUser!.id) {
        if (thumbFile?.path) await fsp.unlink(thumbFile.path).catch(() => {});
        return res.status(403).json({ error: 'You do not have permission to edit this video.' });
      }

      const {
        title,
        description,
        categorySlug,
        language,
        tags,
        action, // 'save' | 'submit_review' | 'draft'
      } = req.body || {};

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (title !== undefined) {
        const t = String(title).trim();
        if (t.length < 3 || t.length > 180) {
          if (thumbFile?.path) await fsp.unlink(thumbFile.path).catch(() => {});
          return res.status(400).json({ error: 'Video title must be between 3 and 180 characters.' });
        }
        updates.title = t;
      }
      if (description !== undefined) {
        const d = String(description).trim();
        if (d.length < 15) {
          if (thumbFile?.path) await fsp.unlink(thumbFile.path).catch(() => {});
          return res.status(400).json({ error: 'Description must be at least 15 characters.' });
        }
        updates.description = d;
      }
      if (categorySlug !== undefined) updates.categorySlug = String(categorySlug).trim().toLowerCase();
      if (language !== undefined) updates.language = String(language).trim().toLowerCase();

      if (tags !== undefined) {
        const parsedTags = parseTagsInput(tags);
        updates.tags = parsedTags;
        await db.delete(videoTags).where(eq(videoTags.videoId, existing.id));
        if (parsedTags.length > 0) {
          await db.insert(videoTags).values(parsedTags.map((tag) => ({ videoId: existing.id, tag })));
        }
      }

      if (thumbFile) {
        if (thumbFile.size > MAX_THUMBNAIL_BYTES || !validateImageMimeAndExtension(thumbFile.mimetype, thumbFile.originalname)) {
          await fsp.unlink(thumbFile.path).catch(() => {});
          return res.status(400).json({ error: 'Thumbnail must be JPEG/PNG/WebP under 5 MB.' });
        }
        const scan = await scanFileForMalware(thumbFile.path, 'image');
        if (!scan.clean) {
          await fsp.unlink(thumbFile.path).catch(() => {});
          return res.status(400).json({ error: scan.reason || 'Thumbnail failed security verification.' });
        }
        const newKey = await moveTempFileToVault(
          thumbFile.path,
          'thumbnail',
          path.extname(thumbFile.originalname) || '.jpg'
        );
        await deleteStoredObject('thumbnail', existing.thumbnailObjectKey);
        updates.thumbnailObjectKey = newKey;
        updates.thumbnailUrl = `/api/videos/${existing.id}/thumbnail?v=${Date.now()}`;
      }

      if (action === 'submit_review') {
        updates.status = existing.processingStatus === 'processing' ? 'processing' : 'pending_review';
        updates.isPublished = false;
        updates.rejectionReason = null;
        updates.submittedAt = new Date();
      } else if (action === 'draft') {
        updates.status = 'draft';
        updates.isPublished = false;
      }

      const [updated] = await db
        .update(videos)
        .set(updates)
        .where(eq(videos.id, existing.id))
        .returning();

      if (action === 'submit_review') {
        await db.insert(videoReviews).values({
          videoId: existing.id,
          reviewerAdminId: req.currentUser!.id,
          reviewerEmail: req.currentUser!.email,
          action: 'submitted',
          notes: 'Creator edited and submitted video for review.',
        });
      }

      return res.json({ video: updated });
    } catch (err) {
      if (thumbFile?.path) await fsp.unlink(thumbFile.path).catch(() => {});
      console.error('PATCH /api/my-videos/:id error:', err);
      return res.status(500).json({ error: 'Failed to update video.' });
    }
  });
});

// Delete user's own video + stored objects
userVideoRoutes.delete('/my-videos/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [existing] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, req.params.id))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Video not found.' });
    if (!existing.uploaderUserId || existing.uploaderUserId !== req.currentUser!.id) {
      return res.status(403).json({ error: 'You do not have permission to delete this video.' });
    }

    await deleteStoredObject('video', existing.storageObjectKey);
    await deleteStoredObject('thumbnail', existing.thumbnailObjectKey);
    await db.delete(videos).where(eq(videos.id, existing.id));

    const reclaimMb = Math.max(1, Math.ceil((existing.fileSizeBytes || 0) / (1024 * 1024)));
    await db
      .update(users)
      .set({
        storageUsedMb: sql`GREATEST(0, ${users.storageUsedMb} - ${reclaimMb})`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.currentUser!.id));

    await db.insert(auditLogs).values({
      actorUserId: req.currentUser!.id,
      actorEmail: req.currentUser!.email,
      action: 'USER_VIDEO_DELETED',
      resource: 'videos',
      details: { videoId: existing.id, title: existing.title },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/my-videos/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete video.' });
  }
});

// Protected byte-range media stream for user-uploaded videos
userVideoRoutes.get('/videos/:id/stream', async (req: AuthRequest, res: Response) => {
  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
    if (!video || !video.storageObjectKey) {
      return res.status(404).json({ error: 'Video media stream not found.' });
    }
    if (!canUserAccessVideo(video, req.currentUser)) {
      return res.status(403).json({ error: 'This video is private or awaiting moderation review.' });
    }
    if (video.malwareScanStatus === 'quarantined') {
      return res.status(403).json({ error: 'Video access blocked by security scan.' });
    }

    const filePath = resolveVideoPath(video.storageObjectKey);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat) {
      return res.status(404).json({ error: 'Stored video object is unavailable.' });
    }

    const total = stat.size;
    const contentType = video.mimeType || 'video/mp4';
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Cache-Control',
      video.isPublished ? 'public, max-age=3600' : 'private, no-store'
    );

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? parseInt(match[1], 10) : 0;
      const end = match?.[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      res.setHeader('Content-Type', contentType);
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.status(200);
    res.setHeader('Content-Length', String(total));
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('GET /api/videos/:id/stream error:', err);
    return res.status(500).json({ error: 'Failed to stream video.' });
  }
});

// Protected thumbnail stream for uploaded videos
userVideoRoutes.get('/videos/:id/thumbnail', async (req: AuthRequest, res: Response) => {
  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
    if (!video || !video.thumbnailObjectKey) {
      return res.status(404).json({ error: 'Thumbnail not found.' });
    }
    if (!canUserAccessVideo(video, req.currentUser)) {
      return res.status(403).json({ error: 'Thumbnail is restricted for unpublished videos.' });
    }
    const thumbPath = resolveThumbnailPath(video.thumbnailObjectKey);
    if (!fs.existsSync(thumbPath)) {
      return res.status(404).json({ error: 'Thumbnail file missing.' });
    }
    const ext = path.extname(thumbPath).toLowerCase();
    const mime =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', video.isPublished ? 'public, max-age=86400' : 'private, no-store');
    fs.createReadStream(thumbPath).pipe(res);
  } catch {
    return res.status(404).json({ error: 'Thumbnail unavailable.' });
  }
});

// Record genuine video view / watch engagement
userVideoRoutes.post('/videos/:id/view', rateLimit(60_000, 30), async (req: AuthRequest, res: Response) => {
  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
    if (!video) return res.status(404).json({ error: 'Video not found.' });
    if (!canUserAccessVideo(video, req.currentUser)) {
      return res.status(403).json({ error: 'Video is not publicly accessible.' });
    }

    const { watchSeconds = 0, completed = false } = req.body || {};
    const viewerHash = hashViewerIdentity(req.currentUser?.id, req.ip, req.headers['user-agent']);
    const recentWindow = new Date(Date.now() - 15 * 60 * 1000);

    const existingRecent = await db
      .select({ id: videoViews.id })
      .from(videoViews)
      .where(
        and(
          eq(videoViews.videoId, video.id),
          eq(videoViews.viewerSessionHash, viewerHash),
          gte(videoViews.createdAt, recentWindow)
        )
      )
      .limit(1);

    await db.insert(videoViews).values({
      videoId: video.id,
      viewerUserId: req.currentUser?.id || null,
      viewerSessionHash: viewerHash,
      watchSeconds: Math.max(0, Math.min(36000, Number(watchSeconds || 0))),
      completed: Boolean(completed),
    });

    let viewsCount = video.viewsCount;
    if (existingRecent.length === 0) {
      const [updated] = await db
        .update(videos)
        .set({ viewsCount: sql`${videos.viewsCount} + 1` })
        .where(eq(videos.id, video.id))
        .returning({ viewsCount: videos.viewsCount });
      viewsCount = updated?.viewsCount ?? viewsCount + 1;
    }

    return res.json({ success: true, viewsCount });
  } catch {
    return res.status(500).json({ error: 'Failed to record view.' });
  }
});

// Report copyrighted or inappropriate video content
userVideoRoutes.post('/videos/:id/report', rateLimit(60_000, 8), async (req: AuthRequest, res: Response) => {
  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
    if (!video) return res.status(404).json({ error: 'Video not found.' });

    const { reason = 'inappropriate', details, reporterEmail } = req.body || {};
    const cleanDetails = String(details || '').trim();
    if (cleanDetails.length < 10) {
      return res.status(400).json({ error: 'Please provide at least 10 characters explaining the report.' });
    }

    const validReason = ['copyright', 'misinformation', 'inappropriate', 'spam', 'other'].includes(String(reason))
      ? String(reason)
      : 'other';

    const [created] = await db
      .insert(videoReports)
      .values({
        videoId: video.id,
        reporterUserId: req.currentUser?.id || null,
        reporterEmail: req.currentUser?.email || (reporterEmail ? String(reporterEmail).trim() : null),
        reason: validReason,
        details: cleanDetails.slice(0, 2000),
        status: 'open',
      })
      .returning();

    await db.insert(auditLogs).values({
      actorUserId: req.currentUser?.id || null,
      actorEmail: req.currentUser?.email || null,
      action: 'VIDEO_CONTENT_REPORTED',
      resource: 'video_reports',
      details: { videoId: video.id, reportId: created.id, reason: validReason },
    });

    return res.status(201).json({
      report: created,
      message: 'Your report has been logged for moderator and administrator review.',
    });
  } catch {
    return res.status(500).json({ error: 'Unable to submit video report.' });
  }
});

// Video-aware Ad Serving Engine (Pre-roll, Mid-roll, Post-roll, Banner, Sponsored Recommendation)
userVideoRoutes.get('/ads/video-bundle', async (req: AuthRequest, res: Response) => {
  try {
    const videoId = String(req.query.videoId || '').trim();
    if (!videoId) {
      return res.status(400).json({ error: 'videoId query parameter is required.' });
    }
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    if (!video) return res.status(404).json({ error: 'Video not found.' });

    const consentCookie = parseConsentCookie(req);
    const viewerHash = hashViewerIdentity(req.currentUser?.id, req.ip, req.headers['user-agent']);

    const bundle = await resolveVideoAdBundle({
      video,
      userRole: req.currentUser?.role || null,
      userId: req.currentUser?.id || null,
      consentAdvertising: Boolean(consentCookie?.advertising),
      viewerSessionHash: viewerHash,
    });

    return res.json(bundle);
  } catch (err) {
    console.error('GET /api/ads/video-bundle error:', err);
    return res.json({
      adFree: false,
      adsEnabledForVideo: false,
      preRoll: null,
      midRoll: null,
      postRoll: null,
      banner: null,
      sponsoredRecommendations: [],
    });
  }
});

// Video Ad Impression / Click Tracking
userVideoRoutes.post('/ads/video-event', rateLimit(60_000, 60), async (req: AuthRequest, res: Response) => {
  try {
    if (req.currentUser && (req.currentUser.role === 'premium' || req.currentUser.role === 'admin')) {
      return res.json({ success: true, skipped: 'ad_free_tier' });
    }
    const consentCookie = parseConsentCookie(req);
    if (!consentCookie?.advertising) {
      return res.json({ success: true, skipped: 'consent_required' });
    }
    const { advertisementId, videoId, placement = 'banner', eventType } = req.body || {};
    if (!advertisementId || !['impression', 'click'].includes(eventType)) {
      return res.status(400).json({ error: 'Valid advertisementId and eventType required.' });
    }
    const viewerHash = hashViewerIdentity(req.currentUser?.id, req.ip, req.headers['user-agent']);
    const recorded = await recordVideoAdInteraction({
      advertisementId: String(advertisementId),
      videoId: videoId ? String(videoId) : null,
      userId: req.currentUser?.id || null,
      placement: String(placement),
      eventType,
      viewerSessionHash: viewerHash,
    });
    return res.json({ success: recorded });
  } catch {
    return res.status(500).json({ error: 'Failed to track ad event.' });
  }
});
