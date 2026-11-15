import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  BrainCircuit,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Bookmark,
  Copy,
  Printer,
  ExternalLink,
  Loader2,
  MessageSquare,
  Zap,
  Microscope,
  Square,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { SearchResultItem } from '../types';
import { VisualIntelligencePanel } from '../components/visual/VisualIntelligencePanel';

interface AnalysisResult {
  topic: string;
  insufficientEvidence?: boolean;
  consensusScore: number;
  researchOverview: string;
  executiveSummary: string;
  keyFindings: string[];
  importantFacts: { fact: string; source: string; confidence: string }[];
  detailedExplanation: string;
  differentPerspectives: { viewpoint: string; proponents: string; summary: string }[];
  sourceComparison: {
    agreements: { point: string; supportingSources: string[]; evidenceSnippet: string }[];
    disagreements: {
      point: string;
      perspectiveA: { claim: string; source: string };
      perspectiveB: { claim: string; source: string };
      analysis: string;
    }[];
  };
  needsFurtherVerification: { claim: string; reason: string; suggestedAction: string }[];
  researchLimitations: string;
  citations: { apa: string; mla: string; chicago: string; bibtex: string };
  retrievedSources: Array<
    SearchResultItem & {
      sourceType?: string;
      publisher?: string;
      retrievalDate?: string;
      reliabilityTier?: string;
    }
  >;
  relatedQuestions: string[];
  usedMultiModelCheck?: boolean;
  modelsEvaluatedCount?: number;
  externalSourcesCheckedCount?: number;
  researchDepth?: 'fast' | 'balanced' | 'deep';
  metrics?: {
    totalLatencyMs?: number;
    searchLatencyMs?: number;
    aiLatencyMs?: number;
    cacheHit?: boolean;
    researchDepth?: string;
    providerUsed?: string;
    modelUsed?: string;
  };
  verificationSummary?: {
    verifiedFacts?: string[];
    reportedClaims?: string[];
    interpretations?: string[];
    uncertainPoints?: string[];
    disagreements?: string[];
    note?: string;
  };
}

export const ResearchIntelligencePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { saveToLibrary, addToast } = useApp();

  const [topic, setTopic] = useState(searchParams.get('topic') || '');
  const [question, setQuestion] = useState('');
  const [sourceFocus, setSourceFocus] = useState('Academic & Peer-Reviewed');
  const [researchDepth, setResearchDepth] = useState<'fast' | 'balanced' | 'deep'>('fast');
  const [depth, setDepth] = useState('Brief Overview');
  const [language, setLanguage] = useState('English');
  const [compareModels, setCompareModels] = useState(false);
  const [citationFormat, setCitationFormat] = useState<'apa' | 'mla' | 'chicago' | 'bibtex'>('apa');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisResult | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const selectResearchMode = (modeKey: 'fast' | 'balanced' | 'deep') => {
    setResearchDepth(modeKey);
    if (modeKey === 'fast') {
      setDepth('Brief Overview');
      setCompareModels(false);
    } else if (modeKey === 'balanced') {
      setDepth('Standard');
    } else {
      setDepth('Deep Comparative Analysis');
      setCompareModels(true);
    }
  };

  const cancelAnalysis = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setLoading(false);
      addToast('Research synthesis cancelled.', 'info');
    }
  };

  const runAnalysis = async (targetTopic: string) => {
    if (!targetTopic.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/research/analyze', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          topic: targetTopic.trim(),
          question: question.trim() || undefined,
          sourceFocus,
          depth,
          researchDepth,
          language,
          compareModels,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Research analysis failed.');
      }
      setReport(data);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        const msg = err?.message || 'Research analysis failed.';
        setErrorMsg(msg);
        addToast(msg, 'error');
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  useEffect(() => {
    const paramTopic = searchParams.get('topic');
    if (paramTopic) {
      setTopic(paramTopic);
      runAnalysis(paramTopic);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runAnalysis(topic);
  };

  const copySummary = () => {
    if (!report) return;
    const text = `${report.topic}\n\nExecutive Summary:\n${report.executiveSummary}\n\nKey Findings:\n${report.keyFindings.map((f) => `- ${f}`).join('\n')}\n\nCitation:\n${report.citations?.[citationFormat] || ''}`;
    navigator.clipboard.writeText(text);
    addToast('Research synthesis copied to clipboard.', 'success');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Header & Input Form */}
      <div className="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
              <BrainCircuit className="w-4 h-4" /> 2MR Research Intelligence
            </div>
            <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">
              Multi-Source Evidence &amp; Agreement Engine
            </h1>
            <p className="text-sm text-slate-600 dark:text-[#8793A5]">
              Retrieve live literature, compare where sources agree or disagree, verify limitations, and export citations.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] p-1 text-xs self-start">
            {[
              { key: 'fast' as const, label: 'Fast Mode', icon: Zap },
              { key: 'balanced' as const, label: 'Balanced', icon: Scale },
              { key: 'deep' as const, label: 'Deep Research', icon: Microscope },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => selectResearchMode(m.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                    researchDepth === m.key
                      ? 'bg-[#B7F34A] text-[#071426]'
                      : 'text-slate-600 dark:text-slate-300 hover:text-[#071426] dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Research Topic *
              </label>
              <input
                type="text"
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Post-Quantum Cryptography NIST Standards"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm focus:outline-none focus:border-[#258BFF]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Specific Research Question (Optional)
              </label>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. How do lattice schemes compare on performance?"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm focus:outline-none focus:border-[#258BFF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Source Focus
              </label>
              <select
                value={sourceFocus}
                onChange={(e) => setSourceFocus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
              >
                <option>Academic & Peer-Reviewed</option>
                <option>Technical Standards & Preprints</option>
                <option>Global Policy & Public Reports</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Depth Level
              </label>
              <select
                value={depth}
                onChange={(e) => {
                  const val = e.target.value;
                  setDepth(val);
                  if (val === 'Brief Overview') setResearchDepth('fast');
                  else if (val === 'Standard') setResearchDepth('balanced');
                  else setResearchDepth('deep');
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
              >
                <option>Brief Overview</option>
                <option>Standard</option>
                <option>Deep Comparative Analysis</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
              >
                <option>English</option>
                <option>French</option>
                <option>Kinyarwanda</option>
              </select>
            </div>
            {loading ? (
              <button
                type="button"
                onClick={cancelAnalysis}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:brightness-110"
              >
                <Square className="w-4 h-4 fill-current" /> Cancel
              </button>
            ) : (
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-sm font-bold hover:brightness-95"
              >
                <Sparkles className="w-4 h-4" /> Run Analysis
              </button>
            )}
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={compareModels}
              onChange={(e) => setCompareModels(e.target.checked)}
            />
            <span>Enable 2MR Multi-Model Verification &amp; External Source Cross-Checking</span>
          </label>
        </form>
      </div>

      {/* Results Output — All 11 Structured Sections */}
      {loading && (
        <div className="p-16 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-[#258BFF] mx-auto" />
          <p className="font-semibold text-[#071426] dark:text-white">
            Running {researchDepth.toUpperCase()} synthesis &amp; source comparison...
          </p>
          <p className="text-xs text-[#8793A5]">CrossRef · arXiv · Wikipedia · 2MR Curated Index</p>
          <button
            type="button"
            onClick={cancelAnalysis}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-300 dark:border-rose-900/60 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            <Square className="w-3.5 h-3.5 fill-current" /> Cancel Request
          </button>
        </div>
      )}

      {!loading && errorMsg && (
        <div className="p-6 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-rose-700 dark:text-rose-300">{errorMsg}</div>
          <button
            type="button"
            onClick={() => runAnalysis(topic)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry Analysis
          </button>
        </div>
      )}

      {!loading && report && (
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]">
            <div>
              <h2 className="text-2xl font-extrabold text-[#071426] dark:text-white">{report.topic}</h2>
              <p className="text-xs text-[#8793A5] tabular-nums">
                <strong className="text-[#071426] dark:text-white">AI-Generated Synthesis</strong>
                {report.metrics?.modelUsed ? ` (${report.metrics.modelUsed})` : ''} · Estimated Source Alignment:{' '}
                <strong className="text-[#258BFF] dark:text-[#B7F34A]">{report.consensusScore}%</strong> ·{' '}
                {report.retrievedSources?.length || 0} retrieved sources
                {report.usedMultiModelCheck ? ` · Cross-checked across ${report.modelsEvaluatedCount || 2} analytical passes` : ''}
                {report.metrics?.totalLatencyMs ? ` · ${report.metrics.totalLatencyMs} ms (${report.metrics.researchDepth || researchDepth})` : ''}
                {report.metrics?.cacheHit ? ' · Cached' : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 no-print">
              <button
                type="button"
                onClick={() =>
                  saveToLibrary({
                    type: 'research',
                    title: `Research Brief: ${report.topic}`,
                    snippet: report.executiveSummary,
                    notes: report.researchLimitations,
                    category: 'Research Intelligence',
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
              >
                <Bookmark className="w-3.5 h-3.5" /> Save Research
              </button>
              <button
                type="button"
                onClick={copySummary}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
              >
                <Printer className="w-3.5 h-3.5" /> Export PDF
              </button>
            </div>
          </div>

          {/* 1 & 2: Overview & Executive Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#258BFF]">1. Research Overview</h3>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{report.researchOverview}</p>
            </section>
            <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                2. Executive Summary
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{report.executiveSummary}</p>
            </section>
          </div>

          <VisualIntelligencePanel
            feature="research_intelligence"
            query={report.topic}
            contextText={`${report.executiveSummary}\n${(report.keyFindings || []).join('\n')}\n${report.detailedExplanation}`}
            sources={report.retrievedSources}
            autoRun={true}
          />

          {/* 3 & 4: Key Findings & Important Facts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#071426] dark:text-white">
                3. Key Findings
              </h3>
              <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200 list-disc pl-5">
                {(report.keyFindings || []).map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </section>
            <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#071426] dark:text-white">
                4. Verified & Important Facts
              </h3>
              <div className="space-y-2.5">
                {(report.importantFacts || []).map((item, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#258BFF] dark:text-[#B7F34A]">{item.confidence}</span>
                      <span className="text-[#8793A5] truncate max-w-[200px]">{item.source}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-200">{item.fact}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* 5 & 6: Detailed Explanation & Different Perspectives */}
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#071426] dark:text-white">
              5. Detailed Explanation
            </h3>
            <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
              {report.detailedExplanation}
            </div>
          </section>

          {report.differentPerspectives?.length > 0 && (
            <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#071426] dark:text-white">
                6. Different Perspectives
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.differentPerspectives.map((p, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="text-xs font-bold text-[#258BFF]">{p.viewpoint}</div>
                    <div className="text-[11px] text-[#8793A5]">Proponents: {p.proponents}</div>
                    <p className="text-xs text-slate-700 dark:text-slate-200">{p.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 7: Source Comparison (Agreements vs Disagreements) */}
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-[#258BFF] dark:text-[#B7F34A]" />
              <h3 className="text-base font-bold text-[#071426] dark:text-white">
                7. Source Comparison: Agreements & Disagreements
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-[#B7F34A] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Where Sources Agree
                </h4>
                {(report.sourceComparison?.agreements || []).map((ag, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-emerald-50/60 dark:bg-[#071426] border border-emerald-200 dark:border-emerald-900/60 space-y-1.5 text-xs">
                    <p className="font-bold text-[#071426] dark:text-white">{ag.point}</p>
                    <p className="text-slate-600 dark:text-slate-300">{ag.evidenceSnippet}</p>
                    <p className="text-[11px] text-[#8793A5]">
                      Supporting: {(ag.supportingSources || []).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Where Sources Disagree
                </h4>
                {(report.sourceComparison?.disagreements || []).length === 0 ? (
                  <p className="text-xs text-[#8793A5]">No major methodological conflict identified across retrieved abstracts.</p>
                ) : (
                  report.sourceComparison.disagreements.map((dis, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-amber-50/50 dark:bg-[#071426] border border-amber-200 dark:border-amber-900/50 space-y-2 text-xs">
                      <p className="font-bold text-[#071426] dark:text-white">{dis.point}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-lg bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-800">
                          <span className="font-semibold text-[#258BFF] block mb-0.5">{dis.perspectiveA?.source}</span>
                          <span>{dis.perspectiveA?.claim}</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-800">
                          <span className="font-semibold text-amber-500 block mb-0.5">{dis.perspectiveB?.source}</span>
                          <span>{dis.perspectiveB?.claim}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">{dis.analysis}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* 8 & 9: Further Verification & Research Limitations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                8. Needs Further Verification
              </h3>
              {(report.needsFurtherVerification || []).map((item, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <p className="font-bold text-[#071426] dark:text-white">{item.claim}</p>
                  <p className="text-slate-600 dark:text-slate-300">{item.reason}</p>
                  <p className="text-[#258BFF] font-medium">Next step: {item.suggestedAction}</p>
                </div>
              ))}
            </section>

            <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#071426] dark:text-white">
                9. Research Limitations
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{report.researchLimitations}</p>
            </section>
          </div>

          {/* 10: References & Citations */}
          <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#071426] dark:text-white">
                10. References & Verified Citations
              </h3>
              <div className="flex gap-1.5 text-xs">
                {(['apa', 'mla', 'chicago', 'bibtex'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setCitationFormat(fmt)}
                    className={`px-2.5 py-1 rounded-lg uppercase font-mono font-semibold ${
                      citationFormat === fmt
                        ? 'bg-[#258BFF] text-white'
                        : 'bg-slate-100 dark:bg-[#071426] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {report.citations?.[citationFormat] && (
              <pre className="p-4 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                {report.citations[citationFormat]}
              </pre>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(report.retrievedSources || []).map((src) => (
                <a
                  key={src.id}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 hover:border-[#258BFF] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-bold text-[#071426] dark:text-white truncate">{src.title}</div>
                    <div className="text-[#8793A5] truncate">
                      {src.publisher || src.sourceName}
                      {src.sourceType ? ` · ${src.sourceType}` : ''}
                      {src.reliabilityTier ? ` · ${src.reliabilityTier}` : ''}
                      {src.publishedDate ? ` · ${src.publishedDate}` : ''}
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#258BFF] shrink-0" />
                </a>
              ))}
            </div>
            {report.verificationSummary?.note && (
              <p className="text-xs text-[#8793A5] pt-1">{report.verificationSummary.note}</p>
            )}
          </section>

          {/* 11: Related Research Questions */}
          {report.relatedQuestions?.length > 0 && (
            <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3 no-print">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#071426] dark:text-white">
                11. Related Follow-Up Questions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {report.relatedQuestions.map((rq) => (
                  <button
                    key={rq}
                    type="button"
                    onClick={() => navigate(`/ask?q=${encodeURIComponent(rq)}`)}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 hover:border-[#258BFF] text-left text-xs font-medium flex items-start gap-2"
                  >
                    <MessageSquare className="w-4 h-4 text-[#258BFF] shrink-0 mt-0.5" />
                    <span>{rq}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
