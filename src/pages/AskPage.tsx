import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Send,
  Plus,
  Trash2,
  Edit2,
  Bookmark,
  Copy,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Loader2,
  MessageSquare,
  Square,
  Zap,
  Scale,
  Microscope,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { VisualIntelligencePanel } from '../components/visual/VisualIntelligencePanel';

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

type ResearchDepth = 'fast' | 'balanced' | 'deep';

interface OrchestratorMetrics {
  researchDepth?: ResearchDepth;
  intentCategory?: string;
  routingReason?: string;
  totalLatencyMs?: number;
  ttftMs?: number;
  searchLatencyMs?: number;
  cacheHit?: boolean;
  providerUsed?: string;
  modelUsed?: string;
}

interface AskStructured {
  directAnswer: string;
  detailedExplanation: string;
  simpleExplanation?: string;
  verifiedFacts?: { fact: string; source: string; confidence: string }[];
  reportedClaims?: string[];
  interpretations?: string[];
  uncertainInformation?: { claim: string; notes: string; uncertaintyReason: string }[];
  sources?: { title: string; url: string; publisher: string; date: string }[];
  retrievedSources?: { title: string; url: string; publisher: string; publishedDate?: string }[];
  relatedTopics?: string[];
  followUpQuestions?: string[];
  insufficientEvidence?: boolean;
  usedMultiModelCheck?: boolean;
  modelsEvaluatedCount?: number;
  externalSourcesCheckedCount?: number;
  researchDepth?: ResearchDepth;
  metrics?: OrchestratorMetrics;
  verificationSummary?: {
    verifiedFacts?: string[];
    reportedClaims?: string[];
    interpretations?: string[];
    uncertainPoints?: string[];
    disagreements?: string[];
    note?: string;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  stopped?: boolean;
  errorText?: string;
  structuredData?: AskStructured | null;
}

export const AskPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user, saveToLibrary, addToast } = useApp();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [questionInput, setQuestionInput] = useState(searchParams.get('q') || '');
  const [attachmentNote, setAttachmentNote] = useState('');
  const [aiMode, setAiMode] = useState<'ask' | 'smart_answer' | 'comparison' | 'deep_research'>('ask');
  const [researchDepth, setResearchDepth] = useState<ResearchDepth>('fast');
  const [compareModels, setCompareModels] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamStage, setStreamStage] = useState<string>('');
  const [lastErrorQuery, setLastErrorQuery] = useState<{ query: string; message: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = async () => {
    if (!user) return;
    try {
      const data = await apiFetch<{ conversations: Conversation[] }>('/api/conversations');
      setConversations(data.conversations || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadConversations();
  }, [user]);

  useEffect(() => {
    if (loading) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, loading]);

  const openConversation = async (id: string) => {
    try {
      const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/conversations/${id}`);
      setActiveConvId(id);
      setMessages(data.messages || []);
      setLastErrorQuery(null);
    } catch (err: any) {
      addToast(err.message || 'Could not open thread.', 'error');
    }
  };

  const handleRenameConversation = async (conv: Conversation) => {
    const nextTitle = window.prompt('Rename conversation:', conv.title);
    if (!nextTitle || !nextTitle.trim()) return;
    try {
      await apiFetch(`/api/conversations/${conv.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: nextTitle.trim() }),
      });
      loadConversations();
    } catch (err: any) {
      addToast(err.message || 'Rename failed.', 'error');
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await apiFetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
      }
      loadConversations();
    } catch {
      // ignore
    }
  };

  const stopGeneration = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setLoading(false);
      setStreamStage('');
      setMessages((prev) =>
        prev.map((m) => (m.streaming ? { ...m, streaming: false, stopped: true } : m))
      );
    }
  };

  const handleModeSelect = (nextMode: typeof aiMode) => {
    setAiMode(nextMode);
    if (nextMode === 'deep_research') {
      setResearchDepth('deep');
    } else if (nextMode === 'comparison') {
      setResearchDepth('balanced');
    }
  };

  const sendQuestion = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || loading) return;

    setLastErrorQuery(null);
    const tempUserId = `tmp-u-${Date.now()}`;
    const tempAssistantId = `tmp-a-${Date.now() + 1}`;

    setMessages((prev) => [
      ...prev,
      { id: tempUserId, role: 'user', content: trimmed },
      {
        id: tempAssistantId,
        role: 'assistant',
        content: '',
        streaming: true,
        structuredData: {
          directAnswer: '',
          detailedExplanation: '',
          sources: [],
        },
      },
    ]);
    setQuestionInput('');
    setLoading(true);
    setStreamStage('Routing query and retrieving open-access sources...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/ask/stream', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          question: trimmed,
          conversationId: activeConvId,
          attachmentContext: attachmentNote.trim() || undefined,
          mode: aiMode,
          researchDepth,
          compareModels,
        }),
      });

      if (!response.ok || !response.body) {
        let errMessage = 'Unable to answer question.';
        try {
          const errJson = await response.json();
          if (errJson?.error) errMessage = errJson.error;
        } catch {
          // ignore
        }
        throw new Error(errMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      const processSseBlock = (block: string) => {
        const lines = block.split('\n');
        let eventName = 'message';
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) return;
        let payload: any = {};
        try {
          payload = JSON.parse(dataLines.join('\n'));
        } catch {
          return;
        }

        if (eventName === 'conversation' && payload.conversationId && !activeConvId) {
          setActiveConvId(payload.conversationId);
          loadConversations();
        } else if (eventName === 'routing') {
          setStreamStage(payload.routingReason || 'Generating response...');
        } else if (eventName === 'sources') {
          const mappedSources = (payload.sources || []).map((s: any) => ({
            title: s.title,
            url: s.url,
            publisher: s.publisher || s.sourceName || 'Verified Source',
            date: s.publishedDate || 'Open Access',
          }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId
                ? {
                    ...m,
                    structuredData: {
                      ...(m.structuredData || { directAnswer: '', detailedExplanation: '' }),
                      sources: mappedSources,
                      externalSourcesCheckedCount: mappedSources.length,
                    },
                  }
                : m
            )
          );
        } else if (eventName === 'token') {
          setStreamStage('Streaming response...');
          const acc = String(payload.accumulated || '');
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId
                ? {
                    ...m,
                    content: acc,
                    structuredData: {
                      ...(m.structuredData || { directAnswer: '', detailedExplanation: '' }),
                      directAnswer: '',
                      detailedExplanation: acc,
                    },
                  }
                : m
            )
          );
        } else if (eventName === 'structured') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId
                ? {
                    ...m,
                    content: payload.detailedExplanation || payload.directAnswer || m.content,
                    structuredData: payload,
                  }
                : m
            )
          );
        } else if (eventName === 'done') {
          if (payload.conversationId && !activeConvId) {
            setActiveConvId(payload.conversationId);
            loadConversations();
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === tempAssistantId ? { ...m, streaming: false } : m))
          );
        } else if (eventName === 'error') {
          throw new Error(payload.message || 'Streaming error');
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const blocks = sseBuffer.split('\n\n');
        sseBuffer = blocks.pop() || '';
        for (const blk of blocks) {
          if (blk.trim()) processSseBlock(blk);
        }
      }
      if (sseBuffer.trim()) {
        processSseBlock(sseBuffer);
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === tempAssistantId ? { ...m, streaming: false } : m))
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempAssistantId ? { ...m, streaming: false, stopped: true } : m))
        );
      } else {
        const msg = err?.message || 'Unable to answer question.';
        setLastErrorQuery({ query: trimmed, message: msg });
        addToast(msg, 'error');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId
              ? {
                  ...m,
                  streaming: false,
                  errorText: msg,
                  content: m.content || 'Request did not complete.',
                }
              : m
          )
        );
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setStreamStage('');
    }
  };

  useEffect(() => {
    const initialQ = searchParams.get('q');
    if (initialQ) {
      sendQuestion(initialQ);
    }
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion(questionInput);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[75vh]">
      {/* Left Conversation Sidebar */}
      <aside className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] p-4 flex flex-col gap-4 h-fit lg:sticky lg:top-20">
        <button
          type="button"
          onClick={() => {
            if (loading) stopGeneration();
            setActiveConvId(null);
            setMessages([]);
            setLastErrorQuery(null);
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold hover:brightness-95"
        >
          <Plus className="w-4 h-4" /> New Research Thread
        </button>

        {!user ? (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-[#8793A5] space-y-2">
            <p>Sign in to automatically save conversation history across sessions.</p>
            <Link to="/login" className="text-[#258BFF] font-semibold hover:underline inline-block">
              Sign in to 2MR →
            </Link>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5] px-1">
              Saved Threads
            </p>
            {conversations.length === 0 ? (
              <p className="text-xs text-[#8793A5] px-1 py-2">No saved conversations yet.</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs cursor-pointer ${
                    activeConvId === conv.id
                      ? 'bg-[#258BFF]/15 text-[#258BFF] dark:text-[#B7F34A] font-semibold'
                      : 'hover:bg-slate-100 dark:hover:bg-[#071426] text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openConversation(conv.id)}
                    className="flex-1 text-left truncate flex items-center gap-2"
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{conv.title}</span>
                  </button>
                  <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRenameConversation(conv)}
                      className="p-1 hover:text-[#258BFF]"
                      title="Rename"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteConversation(conv.id)}
                      className="p-1 hover:text-rose-500"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </aside>

      {/* Main Chat Area */}
      <div className="lg:col-span-9 flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#258BFF] dark:text-[#B7F34A]" />
              <div>
                <h1 className="font-bold text-[#071426] dark:text-white text-base">2MR Unified AI Intelligence</h1>
                <p className="text-xs text-[#8793A5]">
                  Real-time streaming synthesis grounded in retrieved primary &amp; open-access sources.
                </p>
              </div>
            </div>

            {/* Smart Research Mode Selector (Fast Default / Balanced / Deep) */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] p-0.5 text-xs">
              {[
                { key: 'fast' as ResearchDepth, label: 'Fast', icon: Zap },
                { key: 'balanced' as ResearchDepth, label: 'Balanced', icon: Scale },
                { key: 'deep' as ResearchDepth, label: 'Deep Research', icon: Microscope },
              ].map((d) => {
                const Icon = d.icon;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setResearchDepth(d.key)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold whitespace-nowrap transition-colors ${
                      researchDepth === d.key
                        ? 'bg-[#B7F34A] text-[#071426]'
                        : 'text-slate-600 dark:text-slate-300 hover:text-[#071426] dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071426] p-0.5">
              {[
                { key: 'ask', label: '2MR Ask' },
                { key: 'smart_answer', label: 'Smart Answer' },
                { key: 'comparison', label: 'Comparison' },
                { key: 'deep_research', label: 'Deep Research' },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => handleModeSelect(m.key as typeof aiMode)}
                  className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap transition-colors ${
                    aiMode === m.key
                      ? 'bg-[#258BFF] text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-[#071426] dark:hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={compareModels || aiMode === 'comparison' || researchDepth === 'deep'}
                onChange={(e) => setCompareModels(e.target.checked)}
              />
              <span>Multi-model verification</span>
            </label>
          </div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[62vh]">
          {messages.length === 0 ? (
            <div className="py-12 text-center max-w-xl mx-auto space-y-4">
              <h2 className="text-xl font-bold text-[#071426] dark:text-white">
                Ask any scientific, technical, or policy question
              </h2>
              <p className="text-sm text-slate-600 dark:text-[#8793A5]">
                2MR streams answers progressively in Fast Mode by default, retrieving sources concurrently and distinguishing verified facts from uncertain points.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                {[
                  'What is Post-Quantum Cryptography and why did NIST standardize FIPS 203?',
                  'How does Retrieval-Augmented Generation reduce AI hallucinations?',
                  'Explain CRISPR-dCas9 epigenetic gene silencing in simple terms.',
                  'What are the key pathways in IPCC climate mitigation reports?',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => sendQuestion(sample)}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071426] hover:border-[#258BFF] text-xs text-slate-700 dark:text-slate-200"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-2xl px-4 py-3 rounded-2xl bg-[#258BFF] text-white text-sm font-medium">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              const sd = msg.structuredData;
              const prevUserMsg = messages[idx - 1]?.content || 'Research Question';

              return (
                <div
                  key={msg.id}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071426] space-y-4"
                >
                  {/* Streaming Header */}
                  {msg.streaming && (
                    <div className="flex items-center justify-between gap-2 text-xs text-[#258BFF] dark:text-[#B7F34A]">
                      <div className="flex items-center gap-2 font-semibold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{streamStage || 'Streaming answer...'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={stopGeneration}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold hover:bg-rose-500/20"
                      >
                        <Square className="w-3 h-3 fill-current" /> Stop
                      </button>
                    </div>
                  )}

                  {msg.errorText && (
                    <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 flex items-center justify-between gap-3 text-xs">
                      <span className="text-rose-700 dark:text-rose-300">{msg.errorText}</span>
                      <button
                        type="button"
                        onClick={() => sendQuestion(prevUserMsg)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white font-semibold shrink-0"
                      >
                        <RefreshCw className="w-3 h-3" /> Retry
                      </button>
                    </div>
                  )}

                  {/* Direct Answer (when finalized) or Live Streamed Markdown */}
                  {sd?.directAnswer && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                        Direct Answer
                      </span>
                      <p className="text-sm font-medium text-[#071426] dark:text-white leading-relaxed">
                        {sd.directAnswer}
                      </p>
                    </div>
                  )}

                  {sd?.simpleExplanation && (
                    <div className="p-3.5 rounded-xl bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                      <strong className="text-[#071426] dark:text-white">Plain-Language Summary: </strong>
                      {sd.simpleExplanation}
                    </div>
                  )}

                  {(sd?.detailedExplanation || msg.content) && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">
                        {sd?.directAnswer ? 'Detailed Explanation' : '2MR Live Response'}
                      </span>
                      <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
                        {sd?.detailedExplanation || msg.content}
                        {msg.streaming && (
                          <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-[#258BFF] dark:bg-[#B7F34A] animate-pulse" />
                        )}
                      </div>
                    </div>
                  )}

                  {msg.stopped && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                      Generation stopped by user. Partial output preserved.
                    </p>
                  )}

                  {/* Verification & Performance Metadata Strip */}
                  {(sd?.externalSourcesCheckedCount !== undefined ||
                    sd?.usedMultiModelCheck ||
                    sd?.metrics?.totalLatencyMs !== undefined) && (
                    <div className="text-xs text-[#8793A5] flex flex-wrap items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800 tabular-nums">
                      <span className="font-semibold text-[#258BFF] dark:text-[#B7F34A]">
                        AI-Generated{sd?.metrics?.modelUsed ? ` · ${sd.metrics.modelUsed}` : ''}
                      </span>
                      <span>·</span>
                      <span className="uppercase font-semibold text-[#071426] dark:text-white">
                        {sd?.metrics?.researchDepth || sd?.researchDepth || researchDepth} Mode
                      </span>
                      <span>·</span>
                      <span>{sd?.externalSourcesCheckedCount || 0} external sources checked</span>
                      {sd?.metrics?.ttftMs !== undefined && (
                        <>
                          <span>·</span>
                          <span>TTFT {sd.metrics.ttftMs} ms</span>
                        </>
                      )}
                      {sd?.metrics?.totalLatencyMs !== undefined && (
                        <>
                          <span>·</span>
                          <span>Total {sd.metrics.totalLatencyMs} ms</span>
                        </>
                      )}
                      {sd?.metrics?.cacheHit && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-[#B7F34A] font-semibold">Cached</span>
                        </>
                      )}
                      {sd?.usedMultiModelCheck && (
                        <>
                          <span>·</span>
                          <span className="text-[#258BFF] dark:text-[#B7F34A] font-semibold">
                            Cross-checked across {sd.modelsEvaluatedCount || 2} analytical passes
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Verified vs Uncertain */}
                  {(sd?.verifiedFacts?.length || sd?.uncertainInformation?.length || sd?.verificationSummary) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {sd.verifiedFacts && sd.verifiedFacts.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-white dark:bg-[#10243D] border border-emerald-200 dark:border-emerald-900/50 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-[#B7F34A]">
                            <CheckCircle2 className="w-4 h-4" /> Verified Facts
                          </div>
                          {sd.verifiedFacts.map((f, i) => (
                            <div key={i} className="text-xs text-slate-700 dark:text-slate-200">
                              • {f.fact} <span className="text-[#8793A5]">({f.source})</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {sd.uncertainInformation && sd.uncertainInformation.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-white dark:bg-[#10243D] border border-amber-200 dark:border-amber-900/50 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-4 h-4" /> Uncertain / Needs Verification
                          </div>
                          {sd.uncertainInformation.map((u, i) => (
                            <div key={i} className="text-xs text-slate-700 dark:text-slate-200">
                              • {u.claim} — <span className="text-[#8793A5]">{u.uncertaintyReason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {sd.verificationSummary?.reportedClaims && sd.verificationSummary.reportedClaims.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-800 space-y-1.5 md:col-span-2">
                          <p className="text-xs font-bold text-[#071426] dark:text-white">
                            Reported Claims &amp; Source Disagreements
                          </p>
                          {sd.verificationSummary.reportedClaims.map((rc, i) => (
                            <p key={i} className="text-xs text-slate-600 dark:text-slate-300">
                              • {rc}
                            </p>
                          ))}
                          {sd.verificationSummary.disagreements?.map((d, i) => (
                            <p key={`dis-${i}`} className="text-xs text-amber-600 dark:text-amber-400">
                              • {d}
                            </p>
                          ))}
                          {sd.verificationSummary.note && (
                            <p className="text-[11px] text-[#8793A5] pt-1">{sd.verificationSummary.note}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Real Sources */}
                  {sd?.sources && sd.sources.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">
                        Retrieved Sources &amp; Citations
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sd.sources.map((s, i) => (
                          <a
                            key={i}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-lg bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-800 hover:border-[#258BFF] flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-[#071426] dark:text-white truncate">{s.title}</div>
                              <div className="text-[11px] text-[#8793A5] truncate">{s.publisher}</div>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-[#258BFF] shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up Questions */}
                  {!msg.streaming && sd?.followUpQuestions && sd.followUpQuestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {sd.followUpQuestions.map((fq) => (
                        <button
                          key={fq}
                          type="button"
                          onClick={() => sendQuestion(fq)}
                          className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-700 hover:border-[#258BFF] text-xs text-left"
                        >
                          {fq}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Context-Aware Visual Intelligence */}
                  {!msg.streaming && !msg.errorText && (sd?.directAnswer || sd?.detailedExplanation || msg.content) && (
                    <VisualIntelligencePanel
                      feature="ask"
                      query={prevUserMsg}
                      contextText={sd?.detailedExplanation || sd?.directAnswer || msg.content}
                      sources={sd?.sources}
                      autoRun={idx === messages.length - 1}
                      compact
                    />
                  )}

                  {/* Message Actions */}
                  {!msg.streaming && (
                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(sd?.detailedExplanation || msg.content);
                          addToast('Answer copied to clipboard.', 'success');
                        }}
                        className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-[#258BFF]"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          saveToLibrary({
                            type: 'answer',
                            title: prevUserMsg,
                            snippet: sd?.directAnswer || msg.content.slice(0, 220),
                            notes: sd?.detailedExplanation || msg.content,
                            category: 'Ask 2MR',
                          })
                        }
                        className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-[#258BFF]"
                      >
                        <Bookmark className="w-3.5 h-3.5" /> Save Answer
                      </button>
                      <button
                        type="button"
                        onClick={() => sendQuestion(prevUserMsg)}
                        className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-[#258BFF]"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Retry / Regenerate
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={feedEndRef} />
        </div>

        {/* Recovery Banner on Error */}
        {lastErrorQuery && !loading && (
          <div className="mx-4 mb-2 px-4 py-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 flex items-center justify-between gap-3 text-xs">
            <span className="text-amber-800 dark:text-amber-300">
              Connection interrupted: {lastErrorQuery.message}
            </span>
            <button
              type="button"
              onClick={() => sendQuestion(lastErrorQuery.query)}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#258BFF] text-white font-semibold shrink-0"
            >
              <RefreshCw className="w-3 h-3" /> Retry Question
            </button>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50 dark:bg-[#071426]/60">
          <input
            type="text"
            value={attachmentNote}
            onChange={(e) => setAttachmentNote(e.target.value)}
            placeholder="Optional context or excerpt to analyze alongside your question..."
            className="w-full px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-xs focus:outline-none focus:border-[#258BFF]"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="Ask 2MR a research question..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-sm focus:outline-none focus:border-[#258BFF]"
            />
            {loading ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:brightness-110 inline-flex items-center gap-2"
              >
                <Square className="w-4 h-4 fill-current" /> Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!questionInput.trim()}
                className="px-5 py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Send className="w-4 h-4" /> Ask
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

