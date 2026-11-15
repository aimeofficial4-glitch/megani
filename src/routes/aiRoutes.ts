import { Router, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { aiProviderSettings, aiProviders, users } from '../db/schema.ts';
import { AuthRequest, rateLimit } from '../middleware/auth.ts';
import { ensureSeeded } from '../db/seed.ts';
import {
  orchestrateUnifiedAI,
  orchestrateUnifiedAIStream,
  UnifiedAiMode,
} from '../services/aiOrchestrator.ts';
import { ResearchDepth } from '../services/aiRouter.ts';
import { enqueueBackgroundJob } from '../services/backgroundQueue.ts';
import {
  getVisualServicesStatus,
  planAndGenerateVisuals,
  VisualFeature,
  VisualIntent,
} from '../services/visualIntelligence.ts';

export const aiRoutes = Router();

aiRoutes.get('/disclosure', async (_req, res: Response) => {
  try {
    await ensureSeeded();
    const [settings] = await db.select().from(aiProviderSettings).limit(1);
    const providers = await db
      .select({
        slug: aiProviders.slug,
        name: aiProviders.name,
        isEnabled: aiProviders.isEnabled,
        healthStatus: aiProviders.healthStatus,
      })
      .from(aiProviders);

    return res.json({
      disclosure:
        settings?.privacyDisclosureText ||
        '2MR Unified AI Intelligence processes queries through authorized server-side AI APIs and verifies claims against external primary sources.',
      multiModelVerificationEnabled: settings?.multiModelVerificationEnabled ?? true,
      providers: providers.map((p) => ({
        name: p.name,
        enabled: p.isEnabled,
        configured: p.healthStatus !== 'unconfigured',
      })),
    });
  } catch {
    return res.status(500).json({ error: 'Unable to load AI disclosure details.' });
  }
});

aiRoutes.post('/stream', rateLimit(60_000, 20), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const {
      query,
      mode = 'ask',
      researchDepth = 'fast',
      compareModels = false,
      language = 'English',
      attachmentContext,
      conversationId = null,
    } = req.body || {};

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    if (
      req.currentUser &&
      req.currentUser.role === 'free' &&
      req.currentUser.aiQueriesUsed >= req.currentUser.aiQueriesLimit
    ) {
      return res.status(403).json({
        error: 'Monthly AI query limit reached on Free plan. Upgrade to 2MR Premium for higher limits.',
      });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const controller = new AbortController();
    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
      controller.abort();
    });

    const emit = (eventName: string, payload: unknown) => {
      if (clientClosed || res.writableEnded) return;
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const validModes: UnifiedAiMode[] = [
      'ask',
      'research_intelligence',
      'deep_research',
      'smart_answer',
      'comparison',
    ];
    const resolvedMode: UnifiedAiMode = validModes.includes(mode) ? mode : 'ask';
    const validDepths: ResearchDepth[] = ['fast', 'balanced', 'deep'];
    const resolvedDepth: ResearchDepth = validDepths.includes(researchDepth) ? researchDepth : 'fast';

    if (req.currentUser) {
      const uid = req.currentUser.id;
      enqueueBackgroundJob('increment-ai-quota', async () => {
        await db
          .update(users)
          .set({ aiQueriesUsed: sql`${users.aiQueriesUsed} + 1` })
          .where(eq(users.id, uid));
      });
    }

    const result = await orchestrateUnifiedAIStream({
      userId: req.currentUser?.id || null,
      mode: resolvedMode,
      researchDepth: resolvedDepth,
      query: query.trim(),
      conversationId,
      attachmentContext: attachmentContext ? String(attachmentContext).slice(0, 2000) : undefined,
      language,
      compareMultipleModels: Boolean(compareModels),
      signal: controller.signal,
      onEvent: emit,
    });

    emit('done', { requestId: result.requestId, metrics: result.metrics });
    if (!res.writableEnded) res.end();
  } catch (err: any) {
    console.error('POST /api/ai/stream error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Unable to start AI stream.' });
    }
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err?.message || 'Streaming failed' })}\n\n`);
      res.end();
    }
  }
});

aiRoutes.post('/smart-answer', rateLimit(60_000, 15), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const {
      query,
      mode = 'smart_answer',
      researchDepth = 'fast',
      compareModels = false,
      language = 'English',
      attachmentContext,
    } = req.body || {};

    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    if (
      req.currentUser &&
      req.currentUser.role === 'free' &&
      req.currentUser.aiQueriesUsed >= req.currentUser.aiQueriesLimit
    ) {
      return res.status(403).json({
        error: 'Monthly AI query limit reached on Free plan. Upgrade to 2MR Premium for higher limits.',
      });
    }

    const q = query.trim();

    if (req.currentUser) {
      const uid = req.currentUser.id;
      enqueueBackgroundJob('increment-ai-quota', async () => {
        await db
          .update(users)
          .set({ aiQueriesUsed: sql`${users.aiQueriesUsed} + 1` })
          .where(eq(users.id, uid));
      });
    }

    const validModes: UnifiedAiMode[] = [
      'ask',
      'research_intelligence',
      'deep_research',
      'smart_answer',
      'comparison',
    ];
    const resolvedMode: UnifiedAiMode = validModes.includes(mode) ? mode : 'smart_answer';
    const validDepths: ResearchDepth[] = ['fast', 'balanced', 'deep'];
    const resolvedDepth: ResearchDepth = validDepths.includes(researchDepth) ? researchDepth : 'fast';

    const result = await orchestrateUnifiedAI({
      userId: req.currentUser?.id || null,
      mode: resolvedMode,
      researchDepth: resolvedDepth,
      query: q,
      attachmentContext,
      language,
      compareMultipleModels:
        Boolean(compareModels) || resolvedMode === 'deep_research' || resolvedMode === 'comparison',
    });

    return res.json(result);
  } catch (err) {
    console.error('POST /api/ai/smart-answer error:', err);
    return res.status(500).json({ error: 'Unable to complete AI synthesis.' });
  }
});

aiRoutes.post('/deep-research', rateLimit(60_000, 10), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSeeded();
    const {
      topic,
      question,
      sourceFocus,
      depth = 'Deep Comparative Analysis',
      researchDepth = 'deep',
      language = 'English',
    } = req.body || {};

    const target = String(topic || question || '').trim();
    if (!target) {
      return res.status(400).json({ error: 'Research topic or question is required.' });
    }

    if (
      req.currentUser &&
      req.currentUser.role === 'free' &&
      req.currentUser.aiQueriesUsed >= req.currentUser.aiQueriesLimit
    ) {
      return res.status(403).json({
        error: 'Monthly AI query limit reached on Free plan. Upgrade to 2MR Premium for expanded limits.',
      });
    }

    if (req.currentUser) {
      const uid = req.currentUser.id;
      enqueueBackgroundJob('increment-ai-quota', async () => {
        await db
          .update(users)
          .set({ aiQueriesUsed: sql`${users.aiQueriesUsed} + 1` })
          .where(eq(users.id, uid));
      });
    }

    const validDepths: ResearchDepth[] = ['fast', 'balanced', 'deep'];
    const resolvedDepth: ResearchDepth = validDepths.includes(researchDepth) ? researchDepth : 'deep';

    const result = await orchestrateUnifiedAI({
      userId: req.currentUser?.id || null,
      mode: 'deep_research',
      researchDepth: resolvedDepth,
      query: question ? `${target} — ${String(question).trim()}` : target,
      language,
      sourceFocus,
      depth,
      compareMultipleModels: resolvedDepth === 'deep',
    });

    return res.json(result);
  } catch (err) {
    console.error('POST /api/ai/deep-research error:', err);
    return res.status(500).json({ error: 'Deep research synthesis failed.' });
  }
});

aiRoutes.get('/visuals/status', async (_req, res: Response) => {
  try {
    const status = await getVisualServicesStatus();
    return res.json(status);
  } catch {
    return res.status(500).json({ error: 'Unable to check visual service status.' });
  }
});

aiRoutes.post('/visuals/generate', rateLimit(60_000, 30), async (req: AuthRequest, res: Response) => {
  try {
    const {
      query,
      feature = 'ask',
      visualIntent = 'auto',
      contextText,
      sources,
      videoContext,
      projectContext,
      mapContext,
    } = req.body || {};

    const cleanQ = typeof query === 'string' ? query.trim() : '';
    if (!cleanQ && !projectContext?.topic && !mapContext?.rootTopic && !videoContext?.title) {
      return res.status(400).json({ error: 'Query or visual context is required.' });
    }

    const validFeatures: VisualFeature[] = [
      'research_intelligence',
      'ask',
      'research_builder',
      'video_intelligence',
      'knowledge_map',
      'my_knowledge',
    ];
    const resolvedFeature: VisualFeature = validFeatures.includes(feature) ? feature : 'ask';

    const validIntents: VisualIntent[] = [
      'auto',
      'explain_image',
      'diagram',
      'infographic',
      'compare',
      'step_by_step',
      'timeline',
      'mind_map',
      'chart',
      'map',
      'photo',
    ];
    const resolvedIntent: VisualIntent = validIntents.includes(visualIntent) ? visualIntent : 'auto';

    const result = await planAndGenerateVisuals({
      query: cleanQ || projectContext?.topic || mapContext?.rootTopic || videoContext?.title || 'Research',
      feature: resolvedFeature,
      visualIntent: resolvedIntent,
      contextText: typeof contextText === 'string' ? contextText.slice(0, 6000) : undefined,
      sources: Array.isArray(sources) ? sources.slice(0, 12) : undefined,
      videoContext: videoContext || undefined,
      projectContext: projectContext || undefined,
      mapContext: mapContext || undefined,
    });

    return res.json(result);
  } catch (err) {
    console.error('POST /api/ai/visuals/generate error:', err);
    return res.status(500).json({ error: 'Unable to generate visual intelligence artifacts.' });
  }
});
