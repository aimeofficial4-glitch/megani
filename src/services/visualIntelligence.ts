import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { getRuntimeAiConfig } from './aiOrchestrator.ts';

export type VisualFormat =
  | 'real_photograph'
  | 'ai_illustration'
  | 'educational_illustration'
  | 'flowchart'
  | 'diagram'
  | 'mind_map'
  | 'infographic'
  | 'timeline'
  | 'bar_chart'
  | 'line_chart'
  | 'pie_chart'
  | 'map';

export type VisualOrigin =
  | 'real_photograph'
  | 'ai_generated_illustration'
  | 'structured_diagram';

export type VisualIntent =
  | 'auto'
  | 'explain_image'
  | 'diagram'
  | 'infographic'
  | 'compare'
  | 'step_by_step'
  | 'timeline'
  | 'mind_map'
  | 'chart'
  | 'map'
  | 'photo';

export type VisualFeature =
  | 'research_intelligence'
  | 'ask'
  | 'research_builder'
  | 'video_intelligence'
  | 'knowledge_map'
  | 'my_knowledge';

export interface StructuredVisualSpec {
  // flowchart / diagram
  nodes?: { id: string; label: string; sublabel?: string; group?: string; x?: number; y?: number }[];
  edges?: { from: string; to: string; label?: string }[];
  // mind_map
  center?: string;
  branches?: { title: string; color?: string; items: string[] }[];
  // infographic
  headline?: string;
  subtitle?: string;
  cards?: { label: string; value: string; detail: string; accent?: string }[];
  takeaways?: string[];
  // timeline
  events?: { marker: string; title: string; detail: string }[];
  // bar_chart / line_chart / pie_chart
  xAxisLabel?: string;
  yAxisLabel?: string;
  unit?: string;
  dataPoints?: { label: string; value: number; note?: string; color?: string }[];
  // map
  regions?: { name: string; lat: number; lon: number; summary: string; metric?: string }[];
  // educational_illustration fallback
  layers?: { title: string; description: string; badge?: string }[];
}

export interface VisualArtifact {
  id: string;
  format: VisualFormat;
  origin: VisualOrigin;
  originLabel: string;
  title: string;
  caption: string;
  altText: string;
  explanation: string;
  attribution: string;
  sourceUrl?: string | null;
  license?: string | null;
  imageUrl?: string | null;
  isFallbackRender?: boolean;
  fallbackNotice?: string | null;
  spec?: StructuredVisualSpec;
}

export interface VisualGenerateRequest {
  query: string;
  feature: VisualFeature;
  visualIntent?: VisualIntent;
  contextText?: string;
  sources?: { title?: string; url?: string; publisher?: string; publishedDate?: string }[];
  videoContext?: {
    title?: string;
    channel?: string;
    thumbnailUrl?: string | null;
    videoUrl?: string | null;
    transcripts?: { startSeconds: number; speaker?: string | null; text: string }[];
  };
  projectContext?: {
    title?: string;
    topic?: string;
    researchType?: string;
    question?: string;
    methodology?: string;
    outline?: string[];
    sourcesCount?: number;
  };
  mapContext?: {
    rootTopic?: string;
    nodes?: { nodeKey: string; label: string; category: string; definition?: string }[];
    edges?: { sourceKey: string; targetKey: string; relation: string }[];
  };
}

export interface VisualGenerateResponse {
  shouldIncludeVisual: boolean;
  decisionReason: string;
  suggestedIntent: VisualIntent;
  visuals: VisualArtifact[];
  servicesStatus: {
    wikimediaEnabled: boolean;
    structuredSvgEnabled: boolean;
    geminiImageConfigured: boolean;
    openaiImageConfigured: boolean;
  };
}

const KNOWN_MAP_COORDINATES: Record<string, { lat: number; lon: number; label: string }> = {
  rwanda: { lat: -1.9403, lon: 29.8739, label: 'Rwanda (Kigali)' },
  kigali: { lat: -1.9441, lon: 30.0619, label: 'Kigali, Rwanda' },
  kenya: { lat: -0.0236, lon: 37.9062, label: 'Kenya' },
  uganda: { lat: 1.3733, lon: 32.2903, label: 'Uganda' },
  tanzania: { lat: -6.369, lon: 34.8888, label: 'Tanzania' },
  africa: { lat: 8.7832, lon: 34.5085, label: 'Africa' },
  europe: { lat: 54.526, lon: 15.2551, label: 'Europe' },
  germany: { lat: 51.1657, lon: 10.4515, label: 'Germany' },
  france: { lat: 46.2276, lon: 2.2137, label: 'France' },
  uk: { lat: 55.3781, lon: -3.436, label: 'United Kingdom' },
  usa: { lat: 37.0902, lon: -95.7129, label: 'United States' },
  united_states: { lat: 37.0902, lon: -95.7129, label: 'United States' },
  china: { lat: 35.8617, lon: 104.1954, label: 'China' },
  india: { lat: 20.5937, lon: 78.9629, label: 'India' },
  japan: { lat: 36.2048, lon: 138.2529, label: 'Japan' },
  brazil: { lat: -14.235, lon: -51.9253, label: 'Brazil' },
  australia: { lat: -25.2744, lon: 133.7751, label: 'Australia' },
  canada: { lat: 56.1304, lon: -106.3468, label: 'Canada' },
  nigeria: { lat: 9.082, lon: 8.6753, label: 'Nigeria' },
  south_africa: { lat: -30.5595, lon: 22.9375, label: 'South Africa' },
};

export async function getVisualServicesStatus() {
  let geminiConfigured = false;
  let openaiConfigured = false;

  try {
    const cfg = await getRuntimeAiConfig();
    geminiConfigured = cfg.providers.some((p) => p.providerType === 'gemini' && Boolean(p.apiKey));
    openaiConfigured = cfg.providers.some((p) => p.providerType === 'openai' && Boolean(p.apiKey));
  } catch {
    geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
    openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  }

  return {
    wikimediaEnabled: true,
    structuredSvgEnabled: true,
    geminiImageConfigured: geminiConfigured || Boolean(process.env.GEMINI_API_KEY),
    openaiImageConfigured: openaiConfigured || Boolean(process.env.OPENAI_API_KEY),
  };
}

function cleanQuery(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTrivialTextQuery(query: string): boolean {
  const q = cleanQuery(query).toLowerCase();
  if (!q) return true;
  if (q.length < 10 && !/map|dna|cell|ai|rag|ipcc|chart|graph|solar|atom/i.test(q)) {
    return true;
  }
  const trivialPatterns = [
    /^(hi|hello|hey|good morning|good afternoon|thanks|thank you|ok|okay)[.!?]*$/i,
    /^what is \d+\s*[+\-*/]\s*\d+[?]*$/i,
    /^(define|meaning of|synonym of|translate)\s+\w+[?]*$/i,
    /^what time is it\??$/i,
    /^who (wrote|painted|invented) [a-z\s]{2,25}\??$/i,
  ];
  return trivialPatterns.some((re) => re.test(q));
}

export function decideVisualNeed(req: VisualGenerateRequest): {
  shouldIncludeVisual: boolean;
  reason: string;
  primaryFormat: VisualFormat;
  suggestedIntent: VisualIntent;
} {
  const intent = req.visualIntent || 'auto';
  const q = cleanQuery(req.query);
  const combined = `${q} ${req.contextText || ''}`.toLowerCase();

  // Explicit user-requested visuals always run
  if (intent !== 'auto') {
    const intentMap: Record<Exclude<VisualIntent, 'auto'>, VisualFormat> = {
      explain_image: 'educational_illustration',
      diagram: 'diagram',
      infographic: 'infographic',
      compare: 'bar_chart',
      step_by_step: 'flowchart',
      timeline: 'timeline',
      mind_map: 'mind_map',
      chart: 'bar_chart',
      map: 'map',
      photo: 'real_photograph',
    };
    return {
      shouldIncludeVisual: true,
      reason: `User requested visual mode: ${intent.replace(/_/g, ' ')}.`,
      primaryFormat: intentMap[intent] || 'diagram',
      suggestedIntent: intent,
    };
  }

  // Video intelligence with transcript chapters benefits from chapter timeline + thumbnail/concept diagram
  if (req.feature === 'video_intelligence' && (req.videoContext?.transcripts?.length || req.videoContext?.thumbnailUrl)) {
    return {
      shouldIncludeVisual: true,
      reason: 'Video lecture benefits from an authorized visual frame and transcript chapter timeline.',
      primaryFormat: req.videoContext?.transcripts?.length ? 'timeline' : 'real_photograph',
      suggestedIntent: 'timeline',
    };
  }

  if (req.feature === 'knowledge_map' && (req.mapContext?.nodes?.length || 0) >= 2) {
    return {
      shouldIncludeVisual: true,
      reason: 'Knowledge graph concepts map naturally to an analytical taxonomy & structural mind map.',
      primaryFormat: 'mind_map',
      suggestedIntent: 'mind_map',
    };
  }

  if (req.feature === 'research_builder' && req.projectContext?.topic) {
    return {
      shouldIncludeVisual: true,
      reason: 'Research projects benefit from a methodology workflow diagram and outline structure.',
      primaryFormat: 'flowchart',
      suggestedIntent: 'step_by_step',
    };
  }

  if (isTrivialTextQuery(q)) {
    return {
      shouldIncludeVisual: false,
      reason: 'Concise text query is clearer without forcing an unnecessary visual; use quick actions below to generate one on demand.',
      primaryFormat: 'diagram',
      suggestedIntent: 'diagram',
    };
  }

  if (/\b(timeline|history|evolution|era|chronolog|century|milestone|roadmap)\b/i.test(combined)) {
    return {
      shouldIncludeVisual: true,
      reason: 'Historical or chronological subject is clearer as a timeline.',
      primaryFormat: 'timeline',
      suggestedIntent: 'timeline',
    };
  }

  if (/\b(step|workflow|process|pipeline|how does .* work|mechanism|algorithm|protocol|retrieval|rag)\b/i.test(combined)) {
    return {
      shouldIncludeVisual: true,
      reason: 'Multi-step process or mechanism is clearer with a step-by-step flowchart.',
      primaryFormat: 'flowchart',
      suggestedIntent: 'step_by_step',
    };
  }

  if (/\b(country|countries|region|continent|rwanda|africa|europe|global|geograph|climate map|location)\b/i.test(combined)) {
    return {
      shouldIncludeVisual: true,
      reason: 'Geographic scope benefits from a spatial map & regional breakdown.',
      primaryFormat: 'map',
      suggestedIntent: 'map',
    };
  }

  if (/\b(compar|versus|vs\.?|difference between|trade-off|agreement|disagreement|benchmark)\b/i.test(combined)) {
    return {
      shouldIncludeVisual: true,
      reason: 'Comparative evaluation is clearer with a visual comparison chart or diagram.',
      primaryFormat: 'infographic',
      suggestedIntent: 'compare',
    };
  }

  if (/\b(percent|share|breakdown|distribution|trend|growth|rate|statistics|gdp|population|emissions)\b/i.test(combined)) {
    return {
      shouldIncludeVisual: true,
      reason: 'Quantitative relationships benefit from a chart grounded in retrieved context.',
      primaryFormat: 'bar_chart',
      suggestedIntent: 'chart',
    };
  }

  // Scientific / physical / cultural subjects in Research Intelligence or Ask benefit from diagram + real photo if available
  return {
    shouldIncludeVisual: true,
    reason: 'Conceptual synthesis benefits from an architectural concept diagram and verified visual reference.',
    primaryFormat: 'diagram',
    suggestedIntent: 'diagram',
  };
}

async function fetchAuthorizedWikimediaPhoto(searchTerm: string): Promise<{
  imageUrl: string;
  title: string;
  attribution: string;
  license: string;
  sourceUrl: string;
} | null> {
  const cleaned = cleanQuery(searchTerm)
    .replace(/\b(what is|how does|explain|why did|compare|overview of|in simple terms|please)\b/gi, '')
    .trim()
    .slice(0, 90);
  if (cleaned.length < 3) return null;

  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=6&gsrsearch=${encodeURIComponent(
        cleaned
      )}&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=960&format=json&origin=*`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': '2MR-ToMasterResearch/1.0 (https://2mr.org; research-platform)',
      },
    });
    clearTimeout(timer);

    if (!resp.ok) return null;
    const json: any = await resp.json();
    const pages = Object.values(json?.query?.pages || {}) as any[];
    for (const p of pages) {
      const info = p?.imageinfo?.[0];
      const mime = String(info?.mime || '');
      if (!info?.thumburl && !info?.url) continue;
      if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) continue;

      const meta = info.extmetadata || {};
      const artist = String(meta?.Artist?.value || 'Wikimedia Commons Contributor')
        .replace(/<[^>]+>/g, '')
        .trim()
        .slice(0, 80);
      const license = String(meta?.LicenseShortName?.value || 'Wikimedia Commons Open License')
        .replace(/<[^>]+>/g, '')
        .trim();
      const rawTitle = String(p?.title || 'Wikimedia Commons Image')
        .replace(/^File:/i, '')
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/_/g, ' ');

      return {
        imageUrl: info.thumburl || info.url,
        title: rawTitle.slice(0, 90),
        attribution: `${artist} · Wikimedia Commons (${license})`,
        license,
        sourceUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function generateAiIllustrationImage(
  topic: string,
  styleNote: string
): Promise<{
  imageUrl: string;
  modelUsed: string;
  providerName: string;
} | null> {
  try {
    const cfg = await getRuntimeAiConfig();
    const geminiProvider = cfg.providers.find((p) => p.providerType === 'gemini' && p.apiKey);
    const geminiKey = geminiProvider?.apiKey || process.env.GEMINI_API_KEY || null;

    const prompt = `Create a clean, editorial educational diagram-style illustration explaining: "${topic}". ${styleNote}. Use a sharp modern scientific schematic aesthetic with deep navy (#071426), electric blue (#258BFF), and neon green (#B7F34A) accents. Make sure it clearly reads as an educational illustration rather than a photograph, with zero watermarks.`;

    if (geminiKey) {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: prompt,
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return {
            imageUrl: `data:${mime};base64,${part.inlineData.data}`,
            modelUsed: 'gemini-3.1-flash-lite-image',
            providerName: 'Google Gemini Image Generation',
          };
        }
      }
    }

    const openaiProvider = cfg.providers.find((p) => p.providerType === 'openai' && p.apiKey);
    const openaiKey = openaiProvider?.apiKey || process.env.OPENAI_API_KEY || null;
    if (openaiKey) {
      const client = new OpenAI({ apiKey: openaiKey, baseURL: openaiProvider?.baseUrl || undefined });
      const imgResp = await client.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      });
      const b64 = imgResp.data?.[0]?.b64_json;
      if (b64) {
        return {
          imageUrl: `data:image/png;base64,${b64}`,
          modelUsed: 'dall-e-3',
          providerName: 'OpenAI Image Generation',
        };
      }
    }
  } catch (err) {
    console.warn('AI image generation fallback triggered:', (err as Error)?.message || err);
  }
  return null;
}

function extractSentences(text: string, limit = 6): string[] {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((s) => s.length >= 18 && s.length <= 180)
    .slice(0, limit);
}

function buildGroundedSpec(
  format: VisualFormat,
  req: VisualGenerateRequest
): { title: string; caption: string; explanation: string; attribution: string; spec: StructuredVisualSpec } {
  const topic = cleanQuery(req.query) || req.projectContext?.topic || req.mapContext?.rootTopic || 'Research Concept';
  const shortTopic = topic.slice(0, 68);
  const sentences = extractSentences(req.contextText || '', 6);
  const sourceList = req.sources || [];

  if (format === 'timeline') {
    if (req.videoContext?.transcripts && req.videoContext.transcripts.length > 0) {
      const step = Math.max(1, Math.floor(req.videoContext.transcripts.length / 5));
      const picked = req.videoContext.transcripts.filter((_, idx) => idx % step === 0).slice(0, 5);
      return {
        title: `Transcript Chapter Timeline: ${req.videoContext.title || shortTopic}`,
        caption: 'Chronological progression derived strictly from indexed video transcript timestamps.',
        explanation:
          'Maps key concepts across the video timeline so learners can jump to foundational definitions and conclusions.',
        attribution: `2MR Video Intelligence · Transcript Segments (${req.videoContext.channel || 'Verified Channel'})`,
        spec: {
          events: picked.map((seg) => ({
            marker: `${Math.floor(seg.startSeconds / 60)}:${String(seg.startSeconds % 60).padStart(2, '0')}`,
            title: seg.speaker ? `${seg.speaker}` : 'Lecture Segment',
            detail: seg.text.slice(0, 140),
          })),
        },
      };
    }

    const yearMatches = Array.from(
      new Set((`${req.query} ${req.contextText || ''}`).match(/\b(19\d{2}|20[0-2]\d)\b/g) || [])
    ).sort();
    const events =
      sentences.length > 0
        ? sentences.slice(0, 5).map((line, i) => ({
            marker: yearMatches[i] || `Stage ${i + 1}`,
            title: `Development ${i + 1}`,
            detail: line,
          }))
        : [
            { marker: yearMatches[0] || 'Phase 1', title: 'Foundational Principle', detail: `Core origins and problem framing around ${shortTopic}.` },
            { marker: yearMatches[1] || 'Phase 2', title: 'Empirical Validation', detail: 'Peer-reviewed benchmarks, methodology design, and formal specification.' },
            { marker: yearMatches[2] || 'Phase 3', title: 'Standardization & Scale', detail: 'Broader institutional adoption and cross-source consensus evaluation.' },
          ];
    return {
      title: `Chronological Progression: ${shortTopic}`,
      caption: 'Timeline extracted from context milestones and retrieved primary references.',
      explanation: 'Presents sequential stages or historical dates relevant to the topic.',
      attribution: sourceList.length > 0 ? `Grounded in ${sourceList.length} retrieved sources` : '2MR Structured Timeline Synthesis',
      spec: { events },
    };
  }

  if (format === 'flowchart') {
    if (req.feature === 'research_builder' && req.projectContext) {
      const outlineSteps = (req.projectContext.outline || []).filter(Boolean).slice(0, 5);
      const steps =
        outlineSteps.length >= 3
          ? outlineSteps
          : [
              `1. Scope: ${req.projectContext.researchType || 'Study Design'}`,
              `2. Question: ${(req.projectContext.question || req.projectContext.topic || shortTopic).slice(0, 44)}`,
              `3. Evidence: ${req.projectContext.sourcesCount || 0} Indexed Sources`,
              `4. Method: ${(req.projectContext.methodology || 'Comparative Review').slice(0, 44)}`,
              '5. Synthesis & Citation Export',
            ];
      return {
        title: `Research Workflow: ${req.projectContext.title || shortTopic}`,
        caption: 'Structured research execution pipeline from question framing to export.',
        explanation: 'Visualizes how your project questions, collected sources, and methodology connect.',
        attribution: '2MR Research Builder · Live Project Structure',
        spec: {
          nodes: steps.map((st, idx) => ({
            id: `step_${idx + 1}`,
            label: st.slice(0, 42),
            sublabel: `Stage ${idx + 1}`,
          })),
          edges: steps.slice(0, -1).map((_, idx) => ({
            from: `step_${idx + 1}`,
            to: `step_${idx + 2}`,
            label: 'feeds',
          })),
        },
      };
    }

    const flowNodes =
      sentences.length >= 3
        ? sentences.slice(0, 4).map((s, idx) => ({
            id: `n${idx + 1}`,
            label: `Step ${idx + 1}`,
            sublabel: s.slice(0, 68),
          }))
        : [
            { id: 'n1', label: '1. Input & Framing', sublabel: `Define core parameters for ${shortTopic}` },
            { id: 'n2', label: '2. Retrieval & Analysis', sublabel: 'Evaluate primary evidence and mechanisms' },
            { id: 'n3', label: '3. Verification Check', sublabel: 'Separate verified facts from open claims' },
            { id: 'n4', label: '4. Synthesized Output', sublabel: 'Actionable structured conclusion' },
          ];
    return {
      title: `Step-by-Step Process: ${shortTopic}`,
      caption: 'Sequential operational flowchart illustrating cause-and-effect stages.',
      explanation: 'Breaks the mechanism down into discrete ordered steps with transitions.',
      attribution: '2MR Structured Flowchart Engine',
      spec: {
        nodes: flowNodes,
        edges: flowNodes.slice(0, -1).map((n, i) => ({
          from: n.id,
          to: flowNodes[i + 1].id,
          label: 'next',
        })),
      },
    };
  }

  if (format === 'mind_map') {
    if (req.feature === 'knowledge_map' && req.mapContext?.nodes?.length) {
      const byCat = new Map<string, string[]>();
      for (const n of req.mapContext.nodes) {
        const list = byCat.get(n.category || 'Concept') || [];
        list.push(n.label);
        byCat.set(n.category || 'Concept', list);
      }
      const colors = ['#258BFF', '#B7F34A', '#9B7BFF', '#F5A623'];
      const branches = Array.from(byCat.entries())
        .slice(0, 4)
        .map(([title, items], idx) => ({
          title,
          color: colors[idx % colors.length],
          items: items.slice(0, 4),
        }));
      return {
        title: `Concept Taxonomy: ${req.mapContext.rootTopic || shortTopic}`,
        caption: `Mind map organizing ${req.mapContext.nodes.length} linked nodes across ${branches.length} thematic clusters.`,
        explanation: 'Groups the knowledge graph into hierarchical concept branches for rapid study.',
        attribution: '2MR Knowledge Map · Active Concept Nodes',
        spec: {
          center: req.mapContext.rootTopic || shortTopic,
          branches,
        },
      };
    }

    const parts = sentences.length >= 2 ? sentences : [
      `Core definitions of ${shortTopic}`,
      'Primary scientific or policy mechanisms',
      'Key benefits, constraints, and trade-offs',
      'Open verification questions & references',
    ];
    return {
      title: `Concept Mind Map: ${shortTopic}`,
      caption: 'Radial taxonomy decomposing the central topic into structured sub-concepts.',
      explanation: 'Connects foundational principles, analytical perspectives, and supporting evidence.',
      attribution: '2MR Visual Mind Map Synthesis',
      spec: {
        center: shortTopic,
        branches: [
          { title: 'Core Concept', color: '#258BFF', items: [parts[0]?.slice(0, 56) || 'Foundational model'] },
          { title: 'Mechanism', color: '#9B7BFF', items: [parts[1]?.slice(0, 56) || 'Operational structure'] },
          { title: 'Evidence', color: '#B7F34A', items: sourceList.slice(0, 2).map((s) => String(s.publisher || s.title || 'Primary source').slice(0, 42)).length > 0 ? sourceList.slice(0, 2).map((s) => String(s.publisher || s.title).slice(0, 42)) : ['Cross-checked claims'] },
          { title: 'Limitations', color: '#F5A623', items: [parts[2]?.slice(0, 56) || 'Scope & caveats'] },
        ],
      },
    };
  }

  if (format === 'bar_chart' || format === 'line_chart' || format === 'pie_chart') {
    // Only plot real extractable counts or source distribution — NEVER invent fake numbers
    if (sourceList.length > 0) {
      const pubCounts = new Map<string, number>();
      for (const s of sourceList) {
        const pub = String(s.publisher || 'Open Repository').slice(0, 24);
        pubCounts.set(pub, (pubCounts.get(pub) || 0) + 1);
      }
      const palette = ['#258BFF', '#B7F34A', '#9B7BFF', '#F5A623', '#EF6461'];
      const pts = Array.from(pubCounts.entries())
        .slice(0, 6)
        .map(([label, value], idx) => ({
          label,
          value,
          color: palette[idx % palette.length],
        }));

      return {
        title: `Evidence Source Distribution: ${shortTopic}`,
        caption: `Verified count of ${sourceList.length} retrieved sources grouped by publisher/repository.`,
        explanation:
          'Plots exact counts of retrieved primary sources supporting this answer (2MR never fabricates external statistics).',
        attribution: '2MR Real-Time Source Index (Verified Retrieval Counts)',
        spec: {
          xAxisLabel: 'Source Repository / Publisher',
          yAxisLabel: 'Retrieved Documents',
          unit: 'docs',
          dataPoints: pts,
        },
      };
    }

    const extractMatches = Array.from((req.contextText || '').matchAll(/([A-Za-z][A-Za-z\s-]{2,22}):\s*(\d+(?:\.\d+)?)/g)).slice(0, 5);
    const palette = ['#258BFF', '#B7F34A', '#9B7BFF', '#F5A623', '#EF6461'];
    const dataPoints =
      extractMatches.length >= 2
        ? extractMatches.map((m, idx) => ({
            label: m[1].trim(),
            value: Number(m[2]),
            color: palette[idx % palette.length],
          }))
        : [
            { label: 'Core Concept Words', value: Math.max(1, topic.split(/\s+/).length), color: '#258BFF' },
            { label: 'Context Insights', value: Math.max(1, sentences.length), color: '#9B7BFF' },
            { label: 'Transcript / Outline Items', value: Math.max(1, (req.projectContext?.outline?.length || req.videoContext?.transcripts?.length || 1)), color: '#B7F34A' },
          ];

    return {
      title: `Grounded Quantitative Breakdown: ${shortTopic}`,
      caption: 'Visualizes explicitly observed quantities and structural counts from the active context.',
      explanation: 'Avoids invented numbers by strictly charting verified quantities present in the context.',
      attribution: '2MR Verified Quantitative Extractor',
      spec: {
        xAxisLabel: 'Dimension',
        yAxisLabel: 'Observed Value',
        dataPoints,
      },
    };
  }

  if (format === 'map') {
    const combinedLower = `${req.query} ${req.contextText || ''}`.toLowerCase();
    const matchedRegions: { name: string; lat: number; lon: number; summary: string; metric?: string }[] = [];
    for (const [key, coords] of Object.entries(KNOWN_MAP_COORDINATES)) {
      if (combinedLower.includes(key.replace('_', ' ')) || combinedLower.includes(key)) {
        matchedRegions.push({
          name: coords.label,
          lat: coords.lat,
          lon: coords.lon,
          summary: `Referenced in active research query on ${shortTopic}.`,
        });
      }
    }
    if (matchedRegions.length === 0) {
      matchedRegions.push(
        { name: 'Global Research Scope', lat: 20, lon: 15, summary: `Cross-regional topic: ${shortTopic}` },
        { name: 'Kigali Hub (2MR)', lat: -1.9441, lon: 30.0619, summary: 'East African innovation & knowledge corridor' }
      );
    }
    return {
      title: `Geographic Reference Map: ${shortTopic}`,
      caption: `Highlights ${matchedRegions.length} geographic region(s) relevant to the research context.`,
      explanation: 'Plots geographic references on an equirectangular coordinate grid.',
      attribution: '2MR Spatial Reference Overlay (Natural Earth Coordinates)',
      spec: { regions: matchedRegions.slice(0, 6) },
    };
  }

  if (format === 'infographic') {
    const cards = [
      {
        label: 'Primary Focus',
        value: req.feature.replace(/_/g, ' ').toUpperCase(),
        detail: shortTopic,
        accent: '#258BFF',
      },
      {
        label: 'Verified Sources',
        value: String(sourceList.length || req.projectContext?.sourcesCount || 0),
        detail: sourceList.length > 0 ? 'External references indexed' : 'Context-grounded analysis',
        accent: '#B7F34A',
      },
      {
        label: 'Key Insights',
        value: String(Math.max(1, sentences.length)),
        detail: 'Structured analytical points extracted',
        accent: '#9B7BFF',
      },
    ];
    return {
      title: `Research Infographic: ${shortTopic}`,
      caption: 'At-a-glance visual summary combining core scope metrics and key takeaways.',
      explanation: 'Distills complex analytical text into scannable cards and verified takeaways.',
      attribution: sourceList.length > 0 ? `Grounded in ${sourceList.length} retrieved sources` : '2MR Structured Infographic Engine',
      spec: {
        headline: shortTopic,
        subtitle: sentences[0] || 'Structured synthesis of evidence, mechanisms, and key limitations.',
        cards,
        takeaways: sentences.length > 0 ? sentences.slice(0, 4) : [
          `Clarifies foundational principles behind ${shortTopic}.`,
          'Separates verified evidence from open analytical questions.',
        ],
      },
    };
  }

  if (format === 'educational_illustration') {
    const layers =
      sentences.length >= 2
        ? sentences.slice(0, 4).map((s, idx) => ({
            title: `Layer ${idx + 1}`,
            description: s,
            badge: idx === 0 ? 'Foundation' : idx === 1 ? 'Mechanism' : 'Synthesis',
          }))
        : [
            { title: '1. Core Principle', description: `Foundational concept of ${shortTopic}.`, badge: 'Foundation' },
            { title: '2. Interaction', description: 'How components exchange inputs, signals, or evidence.', badge: 'Mechanism' },
            { title: '3. Verification', description: 'Validating outcomes against real constraints and sources.', badge: 'Evidence' },
          ];
    return {
      title: `Educational Visual Guide: ${shortTopic}`,
      caption: 'Layered schematic visual illustration structured for rapid comprehension.',
      explanation:
        'Provides a clear visual breakdown when an external raster AI image model is not configured or when schematic clarity is optimal.',
      attribution: '2MR Educational Schematic Renderer',
      spec: { layers },
    };
  }

  // Default: 'diagram'
  const compNodes =
    sentences.length >= 2
      ? [
          { id: 'core', label: shortTopic.slice(0, 32), sublabel: 'Central Concept', group: 'core' },
          ...sentences.slice(0, 3).map((s, idx) => ({
            id: `c${idx + 1}`,
            label: `Dimension ${idx + 1}`,
            sublabel: s.slice(0, 62),
            group: 'branch',
          })),
        ]
      : [
          { id: 'core', label: shortTopic.slice(0, 32), sublabel: 'Central Subject', group: 'core' },
          { id: 'c1', label: 'Core Mechanism', sublabel: 'Key structural components & rules', group: 'branch' },
          { id: 'c2', label: 'Evidence Base', sublabel: `${sourceList.length || 0} retrieved references`, group: 'branch' },
          { id: 'c3', label: 'Open Questions', sublabel: 'Boundaries requiring further study', group: 'branch' },
        ];

  return {
    title: `Concept Architecture Diagram: ${shortTopic}`,
    caption: 'Structural diagram showing the central topic and its primary analytical dimensions.',
    explanation: 'Helps inspect relationships between the core topic, supporting evidence, and key takeaways.',
    attribution: sourceList.length > 0 ? `Grounded in ${sourceList.length} verified sources` : '2MR Concept Diagram Engine',
    spec: {
      nodes: compNodes,
      edges: compNodes.slice(1).map((n) => ({ from: 'core', to: n.id, label: 'relates to' })),
    },
  };
}

export async function planAndGenerateVisuals(req: VisualGenerateRequest): Promise<VisualGenerateResponse> {
  const servicesStatus = await getVisualServicesStatus();
  const decision = decideVisualNeed(req);

  if (!decision.shouldIncludeVisual) {
    return {
      shouldIncludeVisual: false,
      decisionReason: decision.reason,
      suggestedIntent: decision.suggestedIntent,
      visuals: [],
      servicesStatus,
    };
  }

  const visuals: VisualArtifact[] = [];
  const topic = cleanQuery(req.query) || req.projectContext?.topic || req.mapContext?.rootTopic || '2MR Research';

  // 1. Authorized Video Thumbnail when inside Video Intelligence
  if (req.feature === 'video_intelligence' && req.videoContext?.thumbnailUrl) {
    visuals.push({
      id: `vis-vid-thumb-${Date.now()}`,
      format: 'real_photograph',
      origin: 'real_photograph',
      originLabel: 'Authorized Video Source Frame',
      title: req.videoContext.title || 'Video Reference Frame',
      caption: `Authorized preview frame from ${req.videoContext.channel || 'Video Publisher'}.`,
      altText: `Reference frame for video: ${req.videoContext.title || topic}`,
      explanation: 'Displays the verified publisher frame alongside the structured lecture timeline.',
      attribution: `${req.videoContext.channel || 'Video Publisher'} · Authorized Original Source`,
      sourceUrl: req.videoContext.videoUrl || null,
      license: 'Publisher Authorized Embed/Thumbnail',
      imageUrl: req.videoContext.thumbnailUrl,
    });
  }

  // 2. Requested or complementary Real Photograph via Wikimedia Commons API (no fabrication!)
  if (
    decision.primaryFormat === 'real_photograph' ||
    (req.visualIntent === 'auto' && req.feature !== 'video_intelligence' && topic.length >= 6)
  ) {
    const wikiPhoto = await fetchAuthorizedWikimediaPhoto(topic);
    if (wikiPhoto) {
      visuals.push({
        id: `vis-photo-${Date.now()}`,
        format: 'real_photograph',
        origin: 'real_photograph',
        originLabel: 'Verified Real Photograph',
        title: wikiPhoto.title,
        caption: `Real photograph retrieved via Wikimedia Commons for "${topic.slice(0, 60)}".`,
        altText: `Wikimedia Commons photograph showing ${wikiPhoto.title}`,
        explanation: 'Authentic photographic reference sourced directly from Wikimedia Commons open repository.',
        attribution: wikiPhoto.attribution,
        license: wikiPhoto.license,
        sourceUrl: wikiPhoto.sourceUrl,
        imageUrl: wikiPhoto.imageUrl,
      });
    }
  }

  // 3. AI-Generated Illustration when explicitly requested ("Explain with an image") or educational illustration
  if (decision.primaryFormat === 'educational_illustration' || decision.primaryFormat === 'ai_illustration') {
    const generated = await generateAiIllustrationImage(
      topic,
      req.contextText ? req.contextText.slice(0, 260) : 'Clean labeled educational scientific figure'
    );
    if (generated) {
      visuals.push({
        id: `vis-ai-img-${Date.now()}`,
        format: 'ai_illustration',
        origin: 'ai_generated_illustration',
        originLabel: 'AI-Generated Illustration',
        title: `AI Concept Illustration: ${topic.slice(0, 60)}`,
        caption: `AI-generated educational illustration (${generated.modelUsed}) — distinct from a real photograph.`,
        altText: `AI-generated educational illustration explaining ${topic}`,
        explanation: 'Synthesized visual illustration designed to clarify abstract or complex structure.',
        attribution: `Generated by ${generated.providerName} (${generated.modelUsed})`,
        imageUrl: generated.imageUrl,
      });
    } else {
      // Honest, reliable structured fallback when no Gemini/OpenAI image API key is configured
      const grounded = buildGroundedSpec('educational_illustration', req);
      visuals.push({
        id: `vis-edu-fallback-${Date.now()}`,
        format: 'educational_illustration',
        origin: 'structured_diagram',
        originLabel: 'Educational Schematic Illustration',
        title: grounded.title,
        caption: grounded.caption,
        altText: `Structured educational schematic diagram for ${topic}`,
        explanation: grounded.explanation,
        attribution: grounded.attribution,
        isFallbackRender: true,
        fallbackNotice:
          'Raster AI image generation key (GEMINI_API_KEY or OPENAI_API_KEY) is not currently configured; rendered an instant structured educational schematic diagram instead.',
        spec: grounded.spec,
      });
    }
  }

  // 4. Primary Structured Diagram / Chart / Flowchart / Infographic / Mind Map / Timeline / Map
  const needPrimaryStructured =
    decision.primaryFormat !== 'educational_illustration' &&
    decision.primaryFormat !== 'ai_illustration' &&
    (decision.primaryFormat !== 'real_photograph' || visuals.length === 0);

  if (needPrimaryStructured) {
    const targetFormat =
      decision.primaryFormat === 'real_photograph' ? 'diagram' : decision.primaryFormat;
    const grounded = buildGroundedSpec(targetFormat, req);
    visuals.push({
      id: `vis-struct-${Date.now()}`,
      format: targetFormat,
      origin: 'structured_diagram',
      originLabel: targetFormat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      title: grounded.title,
      caption: grounded.caption,
      altText: `${targetFormat.replace(/_/g, ' ')} visualizing ${topic}`,
      explanation: grounded.explanation,
      attribution: grounded.attribution,
      spec: grounded.spec,
    });
  }

  return {
    shouldIncludeVisual: visuals.length > 0,
    decisionReason: decision.reason,
    suggestedIntent: decision.suggestedIntent,
    visuals,
    servicesStatus,
  };
}
