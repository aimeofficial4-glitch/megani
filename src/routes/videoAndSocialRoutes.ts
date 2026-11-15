import { Router, Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  videos,
  videoTranscripts,
  videoSummaries,
  videoNotes,
  savedVideos,
  savedItems,
} from '../db/schema.ts';
import { AuthRequest, requireAuth, rateLimit } from '../middleware/auth.ts';
import { ensureSeeded } from '../db/seed.ts';
import {
  getOfficialYouTubeSettings,
  fetchOfficialChannelVideos,
  searchYouTubeEducationalVideos,
} from '../services/youtube.ts';
import {
  GeminiConfigError,
  ThinkingLevel,
  Type,
  generateGeminiJson,
  sanitizeGeminiError,
} from '../services/geminiService.ts';

export const videoAndSocialRoutes = Router();

videoAndSocialRoutes.get('/social-settings', async (_req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const youtube = await getOfficialYouTubeSettings();
    return res.json({ youtube });
  } catch {
    return res.status(500).json({ error: 'Failed to load social settings.' });
  }
});

videoAndSocialRoutes.get('/youtube/channel', async (_req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const data = await fetchOfficialChannelVideos(6);
    return res.json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch official YouTube channel data.' });
  }
});

videoAndSocialRoutes.get('/youtube/search', async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.json({ youtubeConfigured: Boolean(process.env.YOUTUBE_API_KEY), videos: [] });
    }
    const result = await searchYouTubeEducationalVideos(q, 8);
    return res.json(result);
  } catch {
    return res.status(500).json({ error: 'Failed to search YouTube educational videos.' });
  }
});

videoAndSocialRoutes.post('/videos/import-youtube', async (req: Request, res: Response) => {
  try {
    await ensureSeeded();
    const {
      externalVideoId,
      title,
      description,
      channel,
      channelId,
      channelUrl,
      duration,
      thumbnailUrl,
      videoUrl,
      publishedAt,
      embedAllowed = true,
      categorySlug = 'education',
    } = req.body || {};

    if (!externalVideoId || !title || !videoUrl) {
      return res.status(400).json({ error: 'Valid YouTube video metadata is required.' });
    }

    const existing = await db
      .select()
      .from(videos)
      .where(eq(videos.externalVideoId, String(externalVideoId)))
      .limit(1);

    if (existing.length > 0) {
      return res.json({ video: existing[0] });
    }

    const [created] = await db
      .insert(videos)
      .values({
        title: String(title).trim(),
        channel: String(channel || 'YouTube Channel'),
        description: String(description || ''),
        categorySlug: String(categorySlug || 'education'),
        duration: String(duration || '0:00'),
        videoUrl: String(videoUrl),
        thumbnailUrl: thumbnailUrl || null,
        publishedAt: publishedAt || new Date().toISOString().slice(0, 10),
        sourcePlatform: 'youtube',
        externalVideoId: String(externalVideoId),
        channelId: channelId || null,
        channelUrl: channelUrl || null,
        embedAllowed: Boolean(embedAllowed),
        transcriptAvailable: false, // Honest: external YouTube captions are not automatically fetched without OAuth/caption access
        isFeatured: false,
        isPublished: true,
      })
      .returning();

    return res.status(201).json({ video: created });
  } catch (err) {
    console.error('Import YouTube video error:', err);
    return res.status(500).json({ error: 'Unable to open video detail page.' });
  }
});

videoAndSocialRoutes.post(
  '/videos/:id/intelligence',
  rateLimit(60_000, 12),
  async (req: AuthRequest, res: Response) => {
    try {
      const [video] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
      if (!video) return res.status(404).json({ error: 'Video not found.' });

      const transcripts = await db
        .select()
        .from(videoTranscripts)
        .where(eq(videoTranscripts.videoId, video.id))
        .orderBy(videoTranscripts.startSeconds);

      if (transcripts.length === 0) {
        return res.status(400).json({
          transcriptAvailable: false,
          error:
            'No accessible transcript is available for this video. 2MR never fabricates summaries, quotes, or study notes without verified transcript text.',
        });
      }

      const { action = 'summary', question, forceRefresh = false } = req.body || {};
      const transcriptText = transcripts
        .map((t) => `[${t.startSeconds}s] ${t.speaker || 'Speaker'}: ${t.text}`)
        .join('\n')
        .slice(0, 14000);

      if (action === 'qa') {
        const cleanQ = String(question || '').trim();
        if (!cleanQ) {
          return res.status(400).json({ error: 'A question about the transcript is required.' });
        }

        const aiQa = await generateGeminiJson<{
          answer: string;
          citedTimestamps: string[];
          uncertainInformation: { claim: string; notes: string; uncertaintyReason: string }[];
        }>({
          feature: 'video_intelligence_qa',
          thinkingLevel: ThinkingLevel.LOW,
          timeoutMs: 12000,
          systemInstruction:
            'You are 2MR Video Intelligence. Answer ONLY using facts explicitly stated in the provided verified video transcript. Never claim to have watched unprovided video frames or external content.',
          prompt: `Video Title: "${video.title}"\nChannel: "${video.channel}"\n\nVERIFIED TRANSCRIPT:\n${transcriptText}\n\nUSER QUESTION: "${cleanQ}"`,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING },
              citedTimestamps: { type: Type.ARRAY, items: { type: Type.STRING } },
              uncertainInformation: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    claim: { type: Type.STRING },
                    notes: { type: Type.STRING },
                    uncertaintyReason: { type: Type.STRING },
                  },
                },
              },
            },
            required: ['answer'],
          },
        });

        return res.json({
          transcriptAvailable: true,
          aiGenerated: true,
          modelUsed: aiQa.model,
          action: 'qa',
          answer: aiQa.data.answer,
          citedTimestamps: aiQa.data.citedTimestamps || [],
          uncertainInformation: aiQa.data.uncertainInformation || [],
        });
      }

      const [existingSummary] = await db
        .select()
        .from(videoSummaries)
        .where(eq(videoSummaries.videoId, video.id))
        .limit(1);

      if (existingSummary && action === 'summary' && !forceRefresh) {
        return res.json({
          transcriptAvailable: true,
          aiGenerated: true,
          modelUsed: 'cached-transcript-summary',
          summary: existingSummary,
        });
      }

      const aiSummary = await generateGeminiJson<{
        summary: string;
        keyPoints: string[];
        studyNotes: string;
        revisionQuestions: string[];
      }>({
        feature: 'video_intelligence_summary',
        thinkingLevel: ThinkingLevel.LOW,
        timeoutMs: 14000,
        systemInstruction:
          'You are 2MR Video Intelligence. Produce study notes strictly grounded in the provided verified video transcript. Do not invent facts or quotes outside the transcript.',
        prompt: `Video Title: "${video.title}"\nChannel: "${video.channel}"\n\nVERIFIED TRANSCRIPT:\n${transcriptText}\n\nGenerate a concise transcript summary, 4-5 key points, structured study notes, and 3 revision questions.`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            studyNotes: { type: Type.STRING },
            revisionQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['summary', 'keyPoints', 'studyNotes', 'revisionQuestions'],
        },
      });

      const summaryText =
        (aiSummary.data?.summary || '').trim() ||
        transcripts.map((t) => t.text).join(' ').slice(0, 400);
      const keyPoints =
        Array.isArray(aiSummary.data?.keyPoints) && aiSummary.data.keyPoints.length > 0
          ? aiSummary.data.keyPoints.slice(0, 6)
          : transcripts.slice(0, 3).map((t) => t.text);
      const revisionQuestions =
        Array.isArray(aiSummary.data?.revisionQuestions) && aiSummary.data.revisionQuestions.length > 0
          ? aiSummary.data.revisionQuestions.slice(0, 5)
          : [`What core concept is presented in "${video.title}"?`];

      if (existingSummary) {
        const [updated] = await db
          .update(videoSummaries)
          .set({
            summary: summaryText,
            keyPoints,
            studyNotes: aiSummary.data?.studyNotes || summaryText,
            revisionQuestions,
            generatedFromTranscript: true,
          })
          .where(eq(videoSummaries.id, existingSummary.id))
          .returning();

        return res.json({
          transcriptAvailable: true,
          aiGenerated: true,
          modelUsed: aiSummary.model,
          summary: updated,
        });
      }

      const [saved] = await db
        .insert(videoSummaries)
        .values({
          videoId: video.id,
          summary: summaryText,
          keyPoints,
          studyNotes: aiSummary.data?.studyNotes || summaryText,
          revisionQuestions,
          generatedFromTranscript: true,
        })
        .returning();

      return res.json({
        transcriptAvailable: true,
        aiGenerated: true,
        modelUsed: aiSummary.model,
        summary: saved,
      });
    } catch (err) {
      console.error('Video intelligence error:', err);
      const status = err instanceof GeminiConfigError ? err.statusCode : 500;
      return res.status(status).json({ error: sanitizeGeminiError(err) });
    }
  }
);

videoAndSocialRoutes.get('/videos/:id/notes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const notes = await db
      .select()
      .from(videoNotes)
      .where(and(eq(videoNotes.videoId, req.params.id), eq(videoNotes.userId, req.currentUser!.id)))
      .orderBy(desc(videoNotes.createdAt));
    return res.json({ notes });
  } catch {
    return res.status(500).json({ error: 'Failed to load video notes.' });
  }
});

videoAndSocialRoutes.post('/videos/:id/notes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { content, timestampSeconds = 0 } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Note content is required.' });
    }
    const [created] = await db
      .insert(videoNotes)
      .values({
        videoId: req.params.id,
        userId: req.currentUser!.id,
        content: String(content).trim(),
        timestampSeconds: Number(timestampSeconds) || 0,
      })
      .returning();
    return res.status(201).json({ note: created });
  } catch {
    return res.status(500).json({ error: 'Failed to save video note.' });
  }
});

videoAndSocialRoutes.delete('/videos/:id/notes/:noteId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .delete(videoNotes)
      .where(and(eq(videoNotes.id, req.params.noteId), eq(videoNotes.userId, req.currentUser!.id)));
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to delete note.' });
  }
});

videoAndSocialRoutes.post('/videos/:id/save', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [video] = await db.select().from(videos).where(eq(videos.id, req.params.id)).limit(1);
    if (!video) return res.status(404).json({ error: 'Video not found.' });

    const existing = await db
      .select()
      .from(savedVideos)
      .where(and(eq(savedVideos.videoId, video.id), eq(savedVideos.userId, req.currentUser!.id)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(savedVideos).values({
        videoId: video.id,
        userId: req.currentUser!.id,
        notes: req.body?.notes || null,
      });
      await db.insert(savedItems).values({
        userId: req.currentUser!.id,
        type: 'video',
        title: video.title,
        url: `/videos/${video.id}`,
        snippet: video.description,
        notes: req.body?.notes || video.aiSummary || null,
        category: video.categorySlug,
      });
    }
    return res.json({ saved: true });
  } catch {
    return res.status(500).json({ error: 'Failed to save video.' });
  }
});
