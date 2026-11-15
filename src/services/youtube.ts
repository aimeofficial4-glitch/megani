import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { socialMediaSettings } from '../db/schema.ts';
import { getPublicCache, setPublicCache } from './cache.ts';

export interface YouTubeChannelInfo {
  channelName: string;
  handle: string;
  channelUrl: string;
  profileImageUrl: string;
  isEnabled: boolean;
  autoFetchVideos: boolean;
  youtubeConfigured: boolean;
}

export interface OfficialYouTubeVideo {
  externalVideoId: string;
  title: string;
  description: string;
  channel: string;
  channelId: string;
  channelUrl: string;
  publishedAt: string;
  duration: string;
  thumbnailUrl: string;
  videoUrl: string;
  embedAllowed: boolean;
  sourcePlatform: 'youtube';
}

const DEFAULT_CHANNEL: YouTubeChannelInfo = {
  channelName: '2MR – To Master Research',
  handle: '@2mr-z5',
  channelUrl: 'https://www.youtube.com/@2mr-z5',
  profileImageUrl: '/assets/aistudio/2MR_Global_Research_Badge_bf1478c8.png',
  isEnabled: true,
  autoFetchVideos: true,
  youtubeConfigured: Boolean(process.env.YOUTUBE_API_KEY),
};

function parseIsoDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '0:00';
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export async function getOfficialYouTubeSettings(): Promise<YouTubeChannelInfo> {
  const cached = await getPublicCache<YouTubeChannelInfo>('video_meta', 'official_youtube_settings');
  if (cached) return cached;

  try {
    const [row] = await db
      .select()
      .from(socialMediaSettings)
      .where(eq(socialMediaSettings.platformKey, 'youtube'))
      .limit(1);

    const resolved = !row
      ? DEFAULT_CHANNEL
      : {
          channelName: row.channelName,
          handle: row.handle,
          channelUrl: row.channelUrl,
          profileImageUrl: row.profileImageUrl,
          isEnabled: row.isEnabled,
          autoFetchVideos: row.autoFetchVideos,
          youtubeConfigured: Boolean(process.env.YOUTUBE_API_KEY),
        };

    await setPublicCache('video_meta', 'official_youtube_settings', resolved, 300);
    return resolved;
  } catch {
    return DEFAULT_CHANNEL;
  }
}

export async function fetchOfficialChannelVideos(maxResults = 6): Promise<{
  channel: YouTubeChannelInfo;
  videos: OfficialYouTubeVideo[];
  statusMessage?: string;
}> {
  const channel = await getOfficialYouTubeSettings();
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return {
      channel,
      videos: [],
      statusMessage:
        'YouTube Data API v3 key (YOUTUBE_API_KEY) is not configured on the server yet. Click the official @2mr-z5 channel badge or Subscribe button to visit 2MR on YouTube directly.',
    };
  }

  const cacheKey = `yt_channel:${channel.handle}:${maxResults}`;
  const cached = await getPublicCache<{
    channel: YouTubeChannelInfo;
    videos: OfficialYouTubeVideo[];
    statusMessage?: string;
  }>('video_meta', cacheKey);
  if (cached) return cached;

  try {
    const handleParam = channel.handle.startsWith('@') ? channel.handle : `@${channel.handle}`;
    const channelLookupUrl = process.env.YOUTUBE_CHANNEL_ID
      ? `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&id=${encodeURIComponent(process.env.YOUTUBE_CHANNEL_ID)}&key=${apiKey}`
      : `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&forHandle=${encodeURIComponent(handleParam)}&key=${apiKey}`;

    const chRes = await fetch(channelLookupUrl, { signal: AbortSignal.timeout(4000) });
    if (!chRes.ok) {
      return {
        channel,
        videos: [],
        statusMessage: `YouTube Data API responded with HTTP ${chRes.status}. Verify YOUTUBE_API_KEY permissions.`,
      };
    }

    const chJson = (await chRes.json()) as any;
    const chItem = chJson.items?.[0];
    const uploadsPlaylistId = chItem?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      return {
        channel,
        videos: [],
        statusMessage: `No public uploads playlist found for ${channel.handle} yet.`,
      };
    }

    const plUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploadsPlaylistId)}&maxResults=${maxResults}&key=${apiKey}`;
    const plRes = await fetch(plUrl, { signal: AbortSignal.timeout(4000) });
    if (!plRes.ok) return { channel, videos: [] };
    const plJson = (await plRes.json()) as any;
    const videoIds = (plJson.items || [])
      .map((i: any) => i.contentDetails?.videoId)
      .filter(Boolean);

    if (videoIds.length === 0) {
      const emptyPayload = {
        channel,
        videos: [],
        statusMessage: `Official channel ${channel.handle} has no public videos uploaded yet.`,
      };
      await setPublicCache('video_meta', cacheKey, emptyPayload, 300);
      return emptyPayload;
    }

    const vidUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${videoIds.join(',')}&key=${apiKey}`;
    const vidRes = await fetch(vidUrl, { signal: AbortSignal.timeout(4000) });
    if (!vidRes.ok) return { channel, videos: [] };
    const vidJson = (await vidRes.json()) as any;

    const videos: OfficialYouTubeVideo[] = (vidJson.items || []).map((v: any) => ({
      externalVideoId: v.id,
      title: v.snippet?.title || '2MR Video',
      description: v.snippet?.description || '',
      channel: v.snippet?.channelTitle || channel.channelName,
      channelId: v.snippet?.channelId || chItem.id,
      channelUrl: channel.channelUrl,
      publishedAt: (v.snippet?.publishedAt || '').slice(0, 10),
      duration: parseIsoDuration(v.contentDetails?.duration || ''),
      thumbnailUrl:
        v.snippet?.thumbnails?.high?.url ||
        v.snippet?.thumbnails?.medium?.url ||
        v.snippet?.thumbnails?.default?.url ||
        '',
      videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
      embedAllowed: v.status?.embeddable !== false,
      sourcePlatform: 'youtube',
    }));

    const payload = { channel, videos };
    await setPublicCache('video_meta', cacheKey, payload, 600);
    return payload;
  } catch (err: any) {
    return {
      channel,
      videos: [],
      statusMessage: err?.message || 'Unable to reach YouTube Data API.',
    };
  }
}

export async function searchYouTubeEducationalVideos(
  query: string,
  maxResults = 6
): Promise<{
  youtubeConfigured: boolean;
  videos: OfficialYouTubeVideo[];
  error?: string;
}> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return { youtubeConfigured: false, videos: [] };
  }

  const cacheKey = `yt_search:${maxResults}:${query}`;
  const cached = await getPublicCache<{
    youtubeConfigured: boolean;
    videos: OfficialYouTubeVideo[];
  }>('search', cacheKey);
  if (cached) return cached;

  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=27&maxResults=${maxResults}&q=${encodeURIComponent(query)}&key=${apiKey}`;
    const sRes = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
    if (!sRes.ok) {
      return { youtubeConfigured: true, videos: [], error: `YouTube API returned ${sRes.status}` };
    }
    const sJson = (await sRes.json()) as any;
    const ids = (sJson.items || []).map((i: any) => i.id?.videoId).filter(Boolean);
    if (ids.length === 0) return { youtubeConfigured: true, videos: [] };

    const vidUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${ids.join(',')}&key=${apiKey}`;
    const vRes = await fetch(vidUrl, { signal: AbortSignal.timeout(4000) });
    if (!vRes.ok) return { youtubeConfigured: true, videos: [] };
    const vJson = (await vRes.json()) as any;

    const videos: OfficialYouTubeVideo[] = (vJson.items || []).map((v: any) => ({
      externalVideoId: v.id,
      title: v.snippet?.title || '',
      description: v.snippet?.description || '',
      channel: v.snippet?.channelTitle || 'YouTube Educator',
      channelId: v.snippet?.channelId || '',
      channelUrl: v.snippet?.channelId ? `https://www.youtube.com/channel/${v.snippet.channelId}` : 'https://www.youtube.com',
      publishedAt: (v.snippet?.publishedAt || '').slice(0, 10),
      duration: parseIsoDuration(v.contentDetails?.duration || ''),
      thumbnailUrl:
        v.snippet?.thumbnails?.high?.url ||
        v.snippet?.thumbnails?.medium?.url ||
        '',
      videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
      embedAllowed: v.status?.embeddable !== false,
      sourcePlatform: 'youtube',
    }));

    const out = { youtubeConfigured: true, videos };
    await setPublicCache('search', cacheKey, out, 600);
    return out;
  } catch (err: any) {
    return { youtubeConfigured: true, videos: [], error: err?.message };
  }
}
