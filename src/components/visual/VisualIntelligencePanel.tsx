import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Check,
  ExternalLink,
  GitBranch,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  ListChecks,
  Loader2,
  Maximize2,
  Network,
  RefreshCw,
  Scale,
  Sparkles,
  X,
} from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

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
  nodes?: { id: string; label: string; sublabel?: string; group?: string }[];
  edges?: { from: string; to: string; label?: string }[];
  center?: string;
  branches?: { title: string; color?: string; items: string[] }[];
  headline?: string;
  subtitle?: string;
  cards?: { label: string; value: string; detail: string; accent?: string }[];
  takeaways?: string[];
  events?: { marker: string; title: string; detail: string }[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  unit?: string;
  dataPoints?: { label: string; value: number; note?: string; color?: string }[];
  regions?: { name: string; lat: number; lon: number; summary: string; metric?: string }[];
  layers?: { title: string; description: string; badge?: string }[];
}

export interface VisualArtifact {
  id: string;
  format: VisualFormat;
  origin: 'real_photograph' | 'ai_generated_illustration' | 'structured_diagram';
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

interface VisualGenerateResult {
  shouldIncludeVisual: boolean;
  decisionReason: string;
  suggestedIntent: VisualIntent;
  visuals: VisualArtifact[];
}

export const QUICK_VISUAL_ACTIONS: { intent: VisualIntent; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { intent: 'explain_image', label: 'Explain with an image', icon: ImageIcon },
  { intent: 'diagram', label: 'Create a diagram', icon: Network },
  { intent: 'infographic', label: 'Show as an infographic', icon: LayoutGrid },
  { intent: 'compare', label: 'Compare visually', icon: Scale },
  { intent: 'step_by_step', label: 'Show step by step', icon: ListChecks },
];

export const VisualArtifactRenderer: React.FC<{ artifact: VisualArtifact; expanded?: boolean }> = ({
  artifact,
  expanded = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const spec = artifact.spec || {};

  // 1 & 2: Raster photograph or AI-generated image
  if (artifact.imageUrl && !imgFailed) {
    return (
      <div className="rounded-xl overflow-hidden bg-slate-100 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex items-center justify-center">
        <img
          src={artifact.imageUrl}
          alt={artifact.altText || artifact.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`w-full object-contain ${expanded ? 'max-h-[72vh]' : 'max-h-72'}`}
        />
      </div>
    );
  }

  // Fallback schematic when image fails or is structured educational_illustration
  if (artifact.format === 'educational_illustration' || (artifact.imageUrl && imgFailed)) {
    const layers = spec.layers || [
      { title: '1. Core Concept', description: artifact.caption, badge: 'Subject' },
      { title: '2. Explanation', description: artifact.explanation, badge: 'Detail' },
    ];
    return (
      <div className="p-4 rounded-xl bg-[#071426] text-white border border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-[11px] text-[#8793A5]">
          <span className="font-semibold text-[#B7F34A]">Structured Educational Illustration</span>
          <span className="font-mono">2MR Schematic</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {layers.map((layer, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg bg-[#10243D] border border-slate-700/80 space-y-1"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#258BFF]">
                <span>{layer.title}</span>
                {layer.badge && <span className="text-[10px] font-mono text-[#B7F34A]">{layer.badge}</span>}
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{layer.description}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 3: Flowchart (horizontal / responsive step chain)
  if (artifact.format === 'flowchart') {
    const nodes = spec.nodes || [];
    const cols = Math.max(1, nodes.length);
    const boxW = 175;
    const gap = 34;
    const svgW = Math.max(480, cols * boxW + (cols - 1) * gap + 24);

    return (
      <div className="rounded-xl bg-[#071426] border border-slate-800 p-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgW} 150`}
          className={`w-full h-auto ${expanded ? 'min-w-[640px]' : 'min-w-[520px]'}`}
          role="img"
          aria-label={artifact.altText}
        >
          <defs>
            <marker id={`arrow-${artifact.id}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#B7F34A" />
            </marker>
          </defs>
          {nodes.map((node, idx) => {
            const x = 12 + idx * (boxW + gap);
            const y = 26;
            return (
              <g key={node.id}>
                <rect
                  x={x}
                  y={y}
                  width={boxW}
                  height={96}
                  rx={12}
                  fill="#10243D"
                  stroke={idx === 0 ? '#258BFF' : idx === nodes.length - 1 ? '#B7F34A' : '#334155'}
                  strokeWidth={1.8}
                />
                <text x={x + 12} y={y + 24} className="fill-[#B7F34A] text-[11px] font-bold">
                  {node.label.slice(0, 26)}
                </text>
                {node.sublabel && (
                  <foreignObject x={x + 12} y={y + 32} width={boxW - 24} height={56}>
                    <div className="text-[10px] text-slate-300 leading-snug line-clamp-3">
                      {node.sublabel}
                    </div>
                  </foreignObject>
                )}
                {idx < nodes.length - 1 && (
                  <line
                    x1={x + boxW + 2}
                    y1={y + 48}
                    x2={x + boxW + gap - 4}
                    y2={y + 48}
                    stroke="#B7F34A"
                    strokeWidth={2}
                    markerEnd={`url(#arrow-${artifact.id})`}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // 4: Concept Architecture Diagram
  if (artifact.format === 'diagram') {
    const nodes = spec.nodes || [];
    const core = nodes[0];
    const branches = nodes.slice(1);
    return (
      <div className="rounded-xl bg-[#071426] border border-slate-800 p-3 overflow-x-auto">
        <svg viewBox="0 0 720 220" className="w-full h-auto min-w-[480px]" role="img" aria-label={artifact.altText}>
          {core && (
            <>
              <rect x="250" y="16" width="220" height="52" rx="12" fill="#258BFF" />
              <text x="360" y="38" textAnchor="middle" className="fill-white text-[12px] font-bold">
                {core.label.slice(0, 30)}
              </text>
              <text x="360" y="54" textAnchor="middle" className="fill-blue-100 text-[10px]">
                {(core.sublabel || 'Central Topic').slice(0, 34)}
              </text>
            </>
          )}
          {branches.map((b, idx) => {
            const total = Math.max(1, branches.length);
            const boxW = Math.min(210, Math.floor((680 - (total - 1) * 16) / total));
            const startX = (720 - (total * boxW + (total - 1) * 16)) / 2;
            const bx = startX + idx * (boxW + 16);
            const by = 112;
            const cx = bx + boxW / 2;
            return (
              <g key={b.id}>
                <line x1="360" y1="68" x2={cx} y2={by} stroke="#9B7BFF" strokeWidth={1.8} strokeOpacity={0.75} />
                <rect x={bx} y={by} width={boxW} height={90} rx="12" fill="#10243D" stroke="#334155" strokeWidth={1.5} />
                <text x={bx + 12} y={by + 22} className="fill-[#B7F34A] text-[11px] font-bold">
                  {b.label.slice(0, 24)}
                </text>
                <foreignObject x={bx + 12} y={by + 28} width={boxW - 24} height={54}>
                  <div className="text-[10px] text-slate-300 leading-snug line-clamp-3">
                    {b.sublabel || ''}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // 5: Mind Map
  if (artifact.format === 'mind_map') {
    const branches = spec.branches || [];
    const positions = [
      { x: 145, y: 54 },
      { x: 575, y: 54 },
      { x: 145, y: 204 },
      { x: 575, y: 204 },
    ];
    return (
      <div className="rounded-xl bg-[#071426] border border-slate-800 p-3 overflow-x-auto">
        <svg viewBox="0 0 720 260" className="w-full h-auto min-w-[500px]" role="img" aria-label={artifact.altText}>
          {branches.slice(0, 4).map((br, idx) => {
            const pos = positions[idx % positions.length];
            const color = br.color || '#258BFF';
            return (
              <g key={idx}>
                <path
                  d={`M 360 130 Q ${(360 + pos.x) / 2} ${pos.y}, ${pos.x} ${pos.y}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={0.7}
                />
                <rect
                  x={pos.x - 125}
                  y={pos.y - 36}
                  width={250}
                  height={72}
                  rx={12}
                  fill="#10243D"
                  stroke={color}
                  strokeWidth={1.6}
                />
                <text x={pos.x - 112} y={pos.y - 16} className="text-[11px] font-bold" fill={color}>
                  {br.title.slice(0, 28)}
                </text>
                <foreignObject x={pos.x - 112} y={pos.y - 10} width={224} height={40}>
                  <div className="text-[10px] text-slate-200 leading-snug line-clamp-2">
                    {br.items.join(' · ')}
                  </div>
                </foreignObject>
              </g>
            );
          })}
          <rect x="268" y="102" width="184" height="56" rx="14" fill="#258BFF" stroke="#B7F34A" strokeWidth={2} />
          <text x="360" y="134" textAnchor="middle" className="fill-white text-[12px] font-extrabold">
            {(spec.center || artifact.title).slice(0, 26)}
          </text>
        </svg>
      </div>
    );
  }

  // 6: Infographic
  if (artifact.format === 'infographic') {
    return (
      <div className="p-4 rounded-xl bg-[#071426] border border-slate-800 text-white space-y-4">
        <div>
          <div className="text-sm font-extrabold text-[#B7F34A]">{spec.headline || artifact.title}</div>
          {spec.subtitle && <p className="text-xs text-slate-300 mt-0.5">{spec.subtitle}</p>}
        </div>
        {spec.cards && spec.cards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {spec.cards.map((c, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-[#10243D] border border-slate-700/80 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#8793A5]">{c.label}</div>
                <div className="text-xl font-extrabold tabular-nums" style={{ color: c.accent || '#258BFF' }}>
                  {c.value}
                </div>
                <div className="text-[11px] text-slate-300">{c.detail}</div>
              </div>
            ))}
          </div>
        )}
        {spec.takeaways && spec.takeaways.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#258BFF]">Key Visual Takeaways</div>
            <ul className="space-y-1 text-xs text-slate-200">
              {spec.takeaways.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[#B7F34A] font-bold">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // 7: Timeline
  if (artifact.format === 'timeline') {
    const events = spec.events || [];
    return (
      <div className="p-4 rounded-xl bg-[#071426] border border-slate-800 text-white space-y-3">
        <div className="space-y-3 relative pl-5 border-l-2 border-[#258BFF]/50">
          {events.map((ev, idx) => (
            <div key={idx} className="relative pl-3">
              <span className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-[#B7F34A] border-2 border-[#071426]" />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono font-bold text-[#258BFF] tabular-nums">{ev.marker}</span>
                <span className="font-bold text-white">{ev.title}</span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{ev.detail}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 8, 9, 10: Bar Chart / Line Chart / Pie Chart
  if (artifact.format === 'bar_chart' || artifact.format === 'line_chart' || artifact.format === 'pie_chart') {
    const pts = spec.dataPoints || [];
    const total = Math.max(1, pts.reduce((acc, p) => acc + Number(p.value || 0), 0));
    const maxVal = Math.max(1, ...pts.map((p) => Number(p.value || 0)));

    if (artifact.format === 'pie_chart') {
      let cumulative = 0;
      const r = 46;
      const circ = 2 * Math.PI * r;
      return (
        <div className="p-4 rounded-xl bg-[#071426] border border-slate-800 text-white flex flex-col sm:flex-row items-center gap-6">
          <svg width="130" height="130" viewBox="0 0 130 130" className="shrink-0" role="img" aria-label={artifact.altText}>
            {pts.map((pt, idx) => {
              const frac = pt.value / total;
              const dash = frac * circ;
              const offset = -cumulative * circ;
              cumulative += frac;
              return (
                <circle
                  key={idx}
                  cx="65"
                  cy="65"
                  r={r}
                  fill="none"
                  stroke={pt.color || '#258BFF'}
                  strokeWidth="18"
                  strokeDasharray={`${dash} ${circ}`}
                  strokeDashoffset={offset}
                  transform="rotate(-90 65 65)"
                />
              );
            })}
          </svg>
          <div className="flex-1 w-full space-y-2 text-xs">
            {pts.map((pt, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-slate-200 truncate">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pt.color || '#258BFF' }} />
                  {pt.label}
                </span>
                <span className="font-mono font-bold tabular-nums text-[#B7F34A]">
                  {pt.value} ({((pt.value / total) * 100).toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (artifact.format === 'line_chart' && pts.length > 0) {
      const coords = pts.map((pt, idx) => ({
        x: pts.length === 1 ? 300 : 50 + (idx / (pts.length - 1)) * 520,
        y: 145 - (pt.value / maxVal) * 110,
        pt,
      }));
      const pathD = coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
      return (
        <div className="p-3 rounded-xl bg-[#071426] border border-slate-800">
          <svg viewBox="0 0 620 185" className="w-full h-auto" role="img" aria-label={artifact.altText}>
            <path d={pathD} fill="none" stroke="#258BFF" strokeWidth={3} strokeLinecap="round" />
            {coords.map((c, idx) => (
              <g key={idx}>
                <circle cx={c.x} cy={c.y} r={5} fill="#B7F34A" stroke="#071426" strokeWidth={2} />
                <text x={c.x} y={c.y - 10} textAnchor="middle" className="fill-white text-[10px] font-mono tabular-nums">
                  {c.pt.value}
                </text>
                <text x={c.x} y="170" textAnchor="middle" className="fill-[#8793A5] text-[10px]">
                  {c.pt.label.slice(0, 14)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      );
    }

    // Default chart: Bar Chart
    return (
      <div className="p-4 rounded-xl bg-[#071426] border border-slate-800 text-white space-y-2.5">
        {pts.map((pt, idx) => (
          <div key={idx} className="space-y-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-200 truncate">{pt.label}</span>
              <span className="font-mono font-bold tabular-nums text-[#B7F34A]">
                {pt.value.toLocaleString()} {spec.unit || ''}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-[#10243D] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(6, Math.round((pt.value / maxVal) * 100))}%`,
                  backgroundColor: pt.color || '#258BFF',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 11: Geographical Map (equirectangular grid + continental outlines)
  if (artifact.format === 'map') {
    const regions = spec.regions || [];
    const toX = (lon: number) => ((lon + 180) / 360) * 640;
    const toY = (lat: number) => ((90 - lat) / 180) * 260;
    return (
      <div className="p-3 rounded-xl bg-[#071426] border border-slate-800 space-y-3">
        <svg viewBox="0 0 640 260" className="w-full h-auto" role="img" aria-label={artifact.altText}>
          {/* Graticule lines */}
          {[65, 130, 195].map((y) => (
            <line key={y} x1="0" y1={y} x2="640" y2={y} stroke="#1E293B" strokeDasharray="3 3" />
          ))}
          {[160, 320, 480].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="260" stroke="#1E293B" strokeDasharray="3 3" />
          ))}
          {/* Simplified Continental Silhouettes */}
          <path d="M90,45 L195,40 L180,105 L125,115 L80,85 Z" fill="#10243D" stroke="#334155" />
          <path d="M165,130 L225,135 L205,220 L170,210 Z" fill="#10243D" stroke="#334155" />
          <path d="M295,45 L380,40 L375,85 L295,88 Z" fill="#10243D" stroke="#334155" />
          <path d="M295,95 L395,95 L410,165 L350,215 L315,180 Z" fill="#10243D" stroke="#334155" />
          <path d="M385,42 L555,50 L545,135 L430,130 L385,90 Z" fill="#10243D" stroke="#334155" />
          <path d="M495,165 L565,170 L555,220 L495,210 Z" fill="#10243D" stroke="#334155" />

          {regions.map((reg, idx) => {
            const px = toX(reg.lon);
            const py = toY(reg.lat);
            return (
              <g key={idx}>
                <circle cx={px} cy={py} r={12} fill="#258BFF" fillOpacity={0.25} />
                <circle cx={px} cy={py} r={5} fill="#B7F34A" stroke="#071426" strokeWidth={1.5} />
                <text x={px + 8} y={py + 4} className="fill-white text-[10px] font-bold">
                  {reg.name}
                </text>
              </g>
            );
          })}
        </svg>
        {regions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {regions.map((r, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-[#10243D] text-slate-200">
                <div className="font-bold text-[#B7F34A]">{r.name}</div>
                <div className="text-[11px] text-slate-300">{r.summary}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
};

interface VisualIntelligencePanelProps {
  feature: VisualFeature;
  query: string;
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
  autoRun?: boolean;
  compact?: boolean;
}

export const VisualIntelligencePanel: React.FC<VisualIntelligencePanelProps> = ({
  feature,
  query,
  contextText,
  sources,
  videoContext,
  projectContext,
  mapContext,
  autoRun = true,
  compact = false,
}) => {
  const { saveToLibrary, addToast } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisualGenerateResult | null>(null);
  const [activeIntent, setActiveIntent] = useState<VisualIntent>('auto');
  const [viewMode, setViewMode] = useState<'visual' | 'text'>('visual');
  const [zoomedArtifact, setZoomedArtifact] = useState<VisualArtifact | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});

  const fetchVisuals = async (intent: VisualIntent = 'auto') => {
    if (!query.trim() && !projectContext?.topic && !mapContext?.rootTopic && !videoContext?.title) return;
    setLoading(true);
    setError(null);
    setActiveIntent(intent);
    try {
      const data = await apiFetch<VisualGenerateResult>('/api/ai/visuals/generate', {
        method: 'POST',
        body: JSON.stringify({
          query: query.trim() || projectContext?.topic || mapContext?.rootTopic || videoContext?.title,
          feature,
          visualIntent: intent,
          contextText,
          sources,
          videoContext,
          projectContext,
          mapContext,
        }),
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.message || 'Unable to generate visual intelligence right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoRun) {
      fetchVisuals('auto');
    }
  }, [query, feature, autoRun]);

  useEffect(() => {
    if (!zoomedArtifact) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomedArtifact(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomedArtifact]);

  const handleSaveVisual = async (artifact: VisualArtifact) => {
    await saveToLibrary({
      type: 'visual',
      title: artifact.title,
      url: artifact.sourceUrl || undefined,
      snippet: `${artifact.caption} (${artifact.attribution})`,
      notes: JSON.stringify({ visualArtifact: artifact }),
      category: 'Visual Intelligence',
    });
    setSavedIds((prev) => ({ ...prev, [artifact.id]: true }));
  };

  const quickBar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {QUICK_VISUAL_ACTIONS.map((act) => {
        const Icon = act.icon;
        const isSelected = activeIntent === act.intent && result?.shouldIncludeVisual;
        return (
          <button
            key={act.intent}
            type="button"
            disabled={loading}
            onClick={() => {
              setViewMode('visual');
              fetchVisuals(act.intent);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors motion-reduce:transition-none ${
              isSelected
                ? 'bg-[#258BFF] text-white border-[#258BFF]'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] text-slate-700 dark:text-slate-200 hover:border-[#258BFF]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {act.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`${compact ? 'p-4' : 'p-5'} rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4`}>
      {/* Header & Text/Visual Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#258BFF] dark:text-[#B7F34A]" />
          <div>
            <h3 className="text-sm font-bold text-[#071426] dark:text-white">
              2MR Visual Intelligence
            </h3>
            <p className="text-[11px] text-[#8793A5]">
              Context-aware diagrams, real verified photography, infographics, timelines &amp; charts.
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-[11px]">
          <button
            type="button"
            onClick={() => setViewMode('visual')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold ${
              viewMode === 'visual'
                ? 'bg-[#258BFF] text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Layers className="w-3 h-3" /> Visual View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('text')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold ${
              viewMode === 'text'
                ? 'bg-[#258BFF] text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <GitBranch className="w-3 h-3" /> Text View
          </button>
        </div>
      </div>

      {/* Quick Action Visual Triggers */}
      {quickBar}

      {/* Loading State */}
      {loading && (
        <div className="p-6 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs">
          <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none text-[#258BFF] shrink-0" />
          <div>
            <p className="font-semibold text-[#071426] dark:text-white">
              Preparing context-aware visual explanation...
            </p>
            <p className="text-[#8793A5]">
              Evaluating format relevance, querying Wikimedia Commons, and grounding diagrams in retrieved context.
            </p>
          </div>
        </div>
      )}

      {/* Error Recovery */}
      {!loading && error && (
        <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 flex items-center justify-between gap-3 text-xs">
          <span className="text-rose-700 dark:text-rose-300">{error}</span>
          <button
            type="button"
            onClick={() => fetchVisuals(activeIntent)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#258BFF] text-white font-semibold shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry Visual
          </button>
        </div>
      )}

      {/* Context-Aware Skip Notice */}
      {!loading && !error && result && !result.shouldIncludeVisual && (
        <div className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-[#8793A5]">
          <strong className="text-[#071426] dark:text-white">Text-First Response: </strong>
          {result.decisionReason}
        </div>
      )}

      {/* Render Generated Visuals */}
      {!loading && !error && result && result.shouldIncludeVisual && result.visuals.length > 0 && (
        <div className="space-y-4">
          {result.visuals.map((art) => (
            <figure
              key={art.id}
              className="p-4 rounded-xl bg-[#F5F7FA] dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                    {art.origin === 'real_photograph'
                      ? 'Verified Photograph'
                      : art.origin === 'ai_generated_illustration'
                        ? 'AI-Generated Illustration (Not a Photo)'
                        : art.originLabel}
                  </div>
                  <h4 className="text-sm font-bold text-[#071426] dark:text-white">{art.title}</h4>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setZoomedArtifact(art)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] font-semibold hover:border-[#258BFF]"
                    title="Expand / Zoom Visual"
                  >
                    <Maximize2 className="w-3.5 h-3.5" /> Expand
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveVisual(art)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold ${
                      savedIds[art.id]
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#B7F34A]'
                        : 'bg-[#B7F34A] text-[#071426] hover:brightness-95'
                    }`}
                  >
                    {savedIds[art.id] ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                    {savedIds[art.id] ? 'Saved' : 'Save Visual'}
                  </button>
                </div>
              </div>

              {viewMode === 'visual' ? (
                <VisualArtifactRenderer artifact={art} />
              ) : (
                <div className="p-3.5 rounded-xl bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-800 space-y-2 text-xs text-slate-700 dark:text-slate-200">
                  <p className="font-semibold text-[#071426] dark:text-white">{art.explanation}</p>
                  {art.spec?.takeaways?.map((t, i) => (
                    <p key={i}>• {t}</p>
                  ))}
                  {art.spec?.events?.map((e, i) => (
                    <p key={i}>
                      <strong>{e.marker}:</strong> {e.title} — {e.detail}
                    </p>
                  ))}
                  {art.spec?.nodes?.map((n, i) => (
                    <p key={i}>
                      <strong>{n.label}:</strong> {n.sublabel}
                    </p>
                  ))}
                  {art.spec?.branches?.map((b, i) => (
                    <p key={i}>
                      <strong>{b.title}:</strong> {b.items.join(', ')}
                    </p>
                  ))}
                  {art.spec?.dataPoints?.map((d, i) => (
                    <p key={i}>
                      <strong>{d.label}:</strong> {d.value}
                    </p>
                  ))}
                </div>
              )}

              {art.fallbackNotice && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  {art.fallbackNotice}
                </p>
              )}

              <figcaption className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8793A5] pt-1 border-t border-slate-200 dark:border-slate-800">
                <span>
                  <strong className="text-slate-700 dark:text-slate-200">{art.caption}</strong> · Source: {art.attribution}
                </span>
                {art.sourceUrl && (
                  <a
                    href={art.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#258BFF] font-semibold hover:underline"
                  >
                    Original Attribution <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {/* Expand / Zoom Modal */}
      {zoomedArtifact && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={zoomedArtifact.title}
          onClick={() => setZoomedArtifact(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-700 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                  {zoomedArtifact.originLabel}
                </div>
                <h3 className="text-xl font-extrabold text-[#071426] dark:text-white">{zoomedArtifact.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setZoomedArtifact(null)}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#258BFF]"
                aria-label="Close expanded visual"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <VisualArtifactRenderer artifact={zoomedArtifact} expanded />

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#8793A5] pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>{zoomedArtifact.caption} · {zoomedArtifact.attribution}</span>
              <button
                type="button"
                onClick={() => {
                  handleSaveVisual(zoomedArtifact);
                  addToast('Visual saved to My Knowledge.', 'success');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] font-bold"
              >
                <Bookmark className="w-3.5 h-3.5" /> Save to My Knowledge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
