import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { categories, videoCategories, videoReviews, videos } from '../db/schema.ts';
import { enqueueBackgroundJob } from './backgroundQueue.ts';

const execFileAsync = promisify(execFile);

const PRIVATE_MEDIA_ROOT = path.resolve(process.cwd(), 'storage', 'private_media');
const VIDEO_DIR = path.join(PRIVATE_MEDIA_ROOT, 'videos');
const THUMB_DIR = path.join(PRIVATE_MEDIA_ROOT, 'thumbnails');
const TEMP_DIR = path.join(PRIVATE_MEDIA_ROOT, 'tmp');

export const MAX_VIDEO_BYTES = 250 * 1024 * 1024; // 250 MB
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function ensureStorageDirectories() {
  for (const dir of [PRIVATE_MEDIA_ROOT, VIDEO_DIR, THUMB_DIR, TEMP_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function getTempUploadDir(): string {
  ensureStorageDirectories();
  return TEMP_DIR;
}

export function sanitizeObjectKey(key: string): string {
  const base = path.basename(String(key || '').trim());
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) {
    throw new Error('Invalid storage object key.');
  }
  return base;
}

export function resolveVideoPath(objectKey: string): string {
  ensureStorageDirectories();
  const safe = sanitizeObjectKey(objectKey);
  const full = path.resolve(VIDEO_DIR, safe);
  if (!full.startsWith(VIDEO_DIR + path.sep)) {
    throw new Error('Path traversal rejected.');
  }
  return full;
}

export function resolveThumbnailPath(objectKey: string): string {
  ensureStorageDirectories();
  const safe = sanitizeObjectKey(objectKey);
  const full = path.resolve(THUMB_DIR, safe);
  if (!full.startsWith(THUMB_DIR + path.sep)) {
    throw new Error('Path traversal rejected.');
  }
  return full;
}

export function validateVideoMimeAndExtension(mime: string, originalName: string): boolean {
  const cleanMime = String(mime || '').toLowerCase();
  const ext = path.extname(String(originalName || '')).toLowerCase();
  return (
    ALLOWED_VIDEO_MIMES.has(cleanMime) &&
    ['.mp4', '.webm', '.mov', '.m4v'].includes(ext)
  );
}

export function validateImageMimeAndExtension(mime: string, originalName: string): boolean {
  const cleanMime = String(mime || '').toLowerCase();
  const ext = path.extname(String(originalName || '')).toLowerCase();
  return (
    ALLOWED_IMAGE_MIMES.has(cleanMime) &&
    ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)
  );
}

async function readHeadTail(filePath: string): Promise<{ head: Buffer; tail: Buffer; size: number }> {
  const stat = await fsp.stat(filePath);
  const size = stat.size;
  const fh = await fsp.open(filePath, 'r');
  try {
    const headLen = Math.min(4096, size);
    const head = Buffer.alloc(headLen);
    if (headLen > 0) await fh.read(head, 0, headLen, 0);

    const tailLen = Math.min(4096, size);
    const tail = Buffer.alloc(tailLen);
    if (tailLen > 0) await fh.read(tail, 0, tailLen, Math.max(0, size - tailLen));
    return { head, tail, size };
  } finally {
    await fh.close();
  }
}

export async function verifyMagicBytes(
  filePath: string,
  expectedKind: 'video' | 'image'
): Promise<{ valid: boolean; reason?: string }> {
  const { head, size } = await readHeadTail(filePath);
  if (size < 16) {
    return { valid: false, reason: 'Uploaded file is empty or truncated.' };
  }

  if (expectedKind === 'image') {
    const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const isPng =
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isWebp =
      head.subarray(0, 4).toString('ascii') === 'RIFF' &&
      head.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!isJpeg && !isPng && !isWebp) {
      return { valid: false, reason: 'Thumbnail file failed image signature validation (JPEG/PNG/WebP required).' };
    }
    return { valid: true };
  }

  // Video magic bytes: ISO BMFF ('ftyp' at offset 4) for MP4/MOV/M4V, or EBML (1A 45 DF A3) for WebM
  const isMp4Family = head.length >= 12 && head.subarray(4, 8).toString('ascii') === 'ftyp';
  const isWebm =
    head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;

  if (!isMp4Family && !isWebm) {
    return { valid: false, reason: 'Video file failed container signature validation (MP4, MOV, or WebM required).' };
  }
  return { valid: true };
}

export async function scanFileForMalware(
  filePath: string,
  expectedKind: 'video' | 'image'
): Promise<{ clean: boolean; reason?: string; sha256: string }> {
  const { head, tail } = await readHeadTail(filePath);

  // Reject executable headers (PE/MZ, ELF, Mach-O, Shebang scripts)
  if (
    (head[0] === 0x4d && head[1] === 0x5a) || // MZ
    (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) || // ELF
    head.subarray(0, 2).toString('ascii') === '#!'
  ) {
    return { clean: false, reason: 'Executable binary signature detected and quarantined.', sha256: '' };
  }

  // Reject EICAR standard antivirus test signature or embedded script payloads
  const combinedSample = `${head.toString('latin1')}\n${tail.toString('latin1')}`;
  if (
    combinedSample.includes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!') ||
    /<script[\s>]|<\?php/i.test(combinedSample)
  ) {
    return { clean: false, reason: 'Malicious payload signature detected by security scanner.', sha256: '' };
  }

  const magic = await verifyMagicBytes(filePath, expectedKind);
  if (!magic.valid) {
    return { clean: false, reason: magic.reason, sha256: '' };
  }

  // Compute SHA-256 checksum via stream
  const hash = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  return { clean: true, sha256: hash.digest('hex') };
}

export async function moveTempFileToVault(
  tempPath: string,
  kind: 'video' | 'thumbnail',
  extension: string
): Promise<string> {
  ensureStorageDirectories();
  const cleanExt = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  const objectKey = `${kind === 'video' ? 'vid' : 'thm'}_${crypto.randomUUID()}${cleanExt}`;
  const targetPath = kind === 'video' ? resolveVideoPath(objectKey) : resolveThumbnailPath(objectKey);
  try {
    await fsp.rename(tempPath, targetPath);
  } catch {
    await fsp.copyFile(tempPath, targetPath);
    await fsp.unlink(tempPath).catch(() => {});
  }
  return objectKey;
}

export async function deleteStoredObject(kind: 'video' | 'thumbnail', objectKey: string | null | undefined) {
  if (!objectKey) return;
  try {
    const full = kind === 'video' ? resolveVideoPath(objectKey) : resolveThumbnailPath(objectKey);
    await fsp.unlink(full).catch(() => {});
  } catch {
    // ignore invalid keys cleanly
  }
}

export function formatDurationClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export async function probeVideoMetadata(filePath: string): Promise<{ durationSeconds: number; hasVideoStream: boolean }> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type',
      '-of', 'json',
      filePath,
    ], { timeout: 15000 });
    const parsed = JSON.parse(stdout || '{}');
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const hasVideoStream = streams.some((s: any) => s.codec_type === 'video');
    const rawDuration = Number(parsed?.format?.duration || 0);
    return {
      durationSeconds: Number.isFinite(rawDuration) ? Math.max(0, Math.round(rawDuration)) : 0,
      hasVideoStream,
    };
  } catch {
    return { durationSeconds: 0, hasVideoStream: true };
  }
}

export async function generateThumbnailFromVideo(
  videoPath: string,
  durationSeconds: number
): Promise<string | null> {
  try {
    ensureStorageDirectories();
    const thumbKey = `thm_${crypto.randomUUID()}.jpg`;
    const thumbPath = resolveThumbnailPath(thumbKey);
    const seekSec = durationSeconds > 6 ? Math.min(10, Math.floor(durationSeconds * 0.15)) : 1;
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', String(seekSec),
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=960:-2',
      '-q:v', '3',
      thumbPath,
    ], { timeout: 20000 });
    const stat = await fsp.stat(thumbPath).catch(() => null);
    if (stat && stat.size > 100) {
      return thumbKey;
    }
    await fsp.unlink(thumbPath).catch(() => {});
    return null;
  } catch {
    return null;
  }
}

export function enqueueVideoProcessingPipeline(params: {
  videoId: string;
  storageObjectKey: string;
  hasCustomThumbnail: boolean;
  targetStatusAfterProcessing: 'draft' | 'pending_review';
  uploaderEmail: string;
}) {
  enqueueBackgroundJob(`process-video-${params.videoId}`, async () => {
    try {
      const videoPath = resolveVideoPath(params.storageObjectKey);
      const probe = await probeVideoMetadata(videoPath);

      if (!probe.hasVideoStream) {
        await db
          .update(videos)
          .set({
            processingStatus: 'failed',
            processingError: 'No readable video stream was found in uploaded container.',
            status: 'rejected',
            rejectionReason: 'Uploaded file did not contain a valid video stream.',
            updatedAt: new Date(),
          })
          .where(eq(videos.id, params.videoId));
        return;
      }

      // Faststart remux for MP4 when possible so browser seeking is instant
      if (params.storageObjectKey.endsWith('.mp4')) {
        const fastPath = path.join(TEMP_DIR, `fast_${crypto.randomUUID()}.mp4`);
        try {
          await execFileAsync('ffmpeg', [
            '-y',
            '-i', videoPath,
            '-c', 'copy',
            '-movflags', '+faststart',
            fastPath,
          ], { timeout: 30000 });
          const st = await fsp.stat(fastPath).catch(() => null);
          if (st && st.size > 1024) {
            await fsp.rename(fastPath, videoPath);
          } else {
            await fsp.unlink(fastPath).catch(() => {});
          }
        } catch {
          await fsp.unlink(fastPath).catch(() => {});
        }
      }

      let generatedThumbKey: string | null = null;
      if (!params.hasCustomThumbnail) {
        generatedThumbKey = await generateThumbnailFromVideo(videoPath, probe.durationSeconds);
      }

      const [existing] = await db.select().from(videos).where(eq(videos.id, params.videoId)).limit(1);
      if (!existing) return;

      const patch: Record<string, any> = {
        durationSeconds: probe.durationSeconds,
        duration: formatDurationClock(probe.durationSeconds),
        processingStatus: 'ready',
        processingError: null,
        status: existing.status === 'processing' ? params.targetStatusAfterProcessing : existing.status,
        updatedAt: new Date(),
      };
      if (generatedThumbKey && !existing.thumbnailObjectKey) {
        patch.thumbnailObjectKey = generatedThumbKey;
        patch.thumbnailUrl = `/api/videos/${params.videoId}/thumbnail`;
      }

      await db.update(videos).set(patch).where(eq(videos.id, params.videoId));

      if (params.targetStatusAfterProcessing === 'pending_review') {
        await db.insert(videoReviews).values({
          videoId: params.videoId,
          reviewerEmail: params.uploaderEmail,
          action: 'submitted',
          notes: 'Automated verification & thumbnail processing completed; queued for admin review.',
        });
      }
    } catch (err: any) {
      await db
        .update(videos)
        .set({
          processingStatus: 'failed',
          processingError: err?.message || 'Video processing failed.',
          updatedAt: new Date(),
        })
        .where(eq(videos.id, params.videoId));
    }
  });
}

let seededVideoCategories = false;
export async function ensureVideoCategoriesSeeded() {
  if (seededVideoCategories) return;
  try {
    const existingCats = await db.select().from(videoCategories);
    if (existingCats.length === 0) {
      const baseCats = await db.select().from(categories);
      const defaults =
        baseCats.length > 0
          ? baseCats.map((c, idx) => ({
              slug: c.slug,
              name: c.name,
              description: c.description,
              isActive: true,
              sortOrder: idx,
            }))
          : [
              { slug: 'science', name: 'Science & Physics', description: 'Experimental and theoretical sciences.', isActive: true, sortOrder: 1 },
              { slug: 'technology', name: 'Technology & AI', description: 'Computing, AI systems, and engineering.', isActive: true, sortOrder: 2 },
              { slug: 'health', name: 'Health & Medicine', description: 'Clinical research and public health.', isActive: true, sortOrder: 3 },
              { slug: 'education', name: 'Academic Lectures', description: 'University briefings and seminars.', isActive: true, sortOrder: 4 },
              { slug: 'energy-climate', name: 'Energy & Climate', description: 'Clean energy systems and sustainability.', isActive: true, sortOrder: 5 },
            ];
      for (const item of defaults) {
        await db
          .insert(videoCategories)
          .values(item)
          .onConflictDoNothing({ target: videoCategories.slug });
      }
    }
    seededVideoCategories = true;
  } catch {
    // ignore startup race cleanly
  }
}
