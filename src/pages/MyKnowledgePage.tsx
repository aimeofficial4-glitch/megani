import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  FolderPlus,
  Search,
  Trash2,
  ExternalLink,
  Download,
  Plus,
  NotebookPen,
  Maximize2,
  Sparkles,
  X,
  Copy,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { CollectionFolder, SavedLibraryItem } from '../types';
import {
  VisualArtifact,
  VisualArtifactRenderer,
  VisualIntelligencePanel,
} from '../components/visual/VisualIntelligencePanel';

function parseSavedVisual(notes?: string | null): VisualArtifact | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (parsed && parsed.visualArtifact && parsed.visualArtifact.format) {
      return parsed.visualArtifact as VisualArtifact;
    }
  } catch {
    return null;
  }
  return null;
}

export const MyKnowledgePage: React.FC = () => {
  const { user, addToast } = useApp();
  const [items, setItems] = useState<SavedLibraryItem[]>([]);
  const [collections, setCollections] = useState<CollectionFolder[]>([]);
  const [activeType, setActiveType] = useState('all');
  const [activeCollectionId, setActiveCollectionId] = useState<string>('all');
  const [searchQ, setSearchQ] = useState('');

  const [newFolderName, setNewFolderName] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [expandedVisual, setExpandedVisual] = useState<VisualArtifact | null>(null);
  const [explainItemId, setExplainItemId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiAssistResult, setAiAssistResult] = useState<{
    aiGenerated: boolean;
    modelUsed: string;
    action: string;
    itemCount: number;
    summary: string;
    keyThemes: string[];
    organizationSuggestions: Array<{ folderName: string; rationale: string; itemTitles: string[] }>;
    nextSteps: string[];
  } | null>(null);

  const loadLibrary = async () => {
    if (!user) return;
    try {
      const data = await apiFetch<{ items: SavedLibraryItem[]; collections: CollectionFolder[] }>(
        '/api/library'
      );
      setItems(data.items || []);
      setCollections(data.collections || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadLibrary();
  }, [user]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const data = await apiFetch<{ collection: CollectionFolder }>('/api/library/collections', {
        method: 'POST',
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      setCollections((prev) => [...prev, data.collection]);
      setNewFolderName('');
      addToast('Collection folder created.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Could not create folder.', 'error');
    }
  };

  const handleAddQuickNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    try {
      const res = await apiFetch<{ item: SavedLibraryItem }>('/api/library/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'note',
          title: quickTitle.trim(),
          notes: quickNote.trim(),
          collectionId: activeCollectionId !== 'all' ? activeCollectionId : null,
        }),
      });
      setItems((prev) => [res.item, ...prev]);
      setQuickTitle('');
      setQuickNote('');
      addToast('Personal note saved.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Unable to save note.', 'error');
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await apiFetch(`/api/library/items/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // ignore
    }
  };

  const handleExportNotes = () => {
    const content = items
      .map(
        (i) =>
          `# ${i.title} (${i.type})\n${i.url ? `URL: ${i.url}\n` : ''}${i.snippet || ''}\nNotes: ${i.notes || 'None'}\n---`
      )
      .join('\n\n');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '2mr-my-knowledge.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunLibraryAi = async (action: 'summarize' | 'organize') => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiFetch<NonNullable<typeof aiAssistResult>>('/api/library/ai-assist', {
        method: 'POST',
        body: JSON.stringify({
          action,
          collectionId: activeCollectionId,
        }),
      });
      setAiAssistResult(res);
    } catch (err: any) {
      const msg = err?.message || 'Unable to analyze your saved knowledge right now.';
      setAiError(msg);
      addToast(msg, 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveAiSummary = async () => {
    if (!aiAssistResult) return;
    const textNotes = [
      aiAssistResult.summary,
      aiAssistResult.keyThemes.length ? `\nKey Themes:\n- ${aiAssistResult.keyThemes.join('\n- ')}` : '',
      aiAssistResult.nextSteps.length ? `\nNext Steps:\n- ${aiAssistResult.nextSteps.join('\n- ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const res = await apiFetch<{ item: SavedLibraryItem }>('/api/library/items', {
        method: 'POST',
        body: JSON.stringify({
          type: 'note',
          title: `AI Knowledge Synthesis (${new Date().toLocaleDateString()})`,
          snippet: aiAssistResult.summary.slice(0, 220),
          notes: textNotes,
          category: 'My Knowledge AI',
          collectionId: activeCollectionId !== 'all' ? activeCollectionId : null,
        }),
      });
      setItems((prev) => [res.item, ...prev]);
      addToast('AI synthesis saved to your library.', 'success');
    } catch (err: any) {
      addToast(err?.message || 'Unable to save AI summary.', 'error');
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <Bookmark className="w-12 h-12 text-[#258BFF] mx-auto" />
        <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">My Knowledge Library</h1>
        <p className="text-sm text-slate-600 dark:text-[#8793A5]">
          Sign in to organize saved research reports, academic papers, videos, AI answers, and personal folders.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link to="/login" className="px-5 py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold">
            Sign In
          </Link>
          <Link to="/register" className="px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-sm font-bold">
            Create Free Account
          </Link>
        </div>
      </div>
    );
  }

  const filteredItems = items.filter((item) => {
    if (activeType !== 'all' && item.type !== activeType) return false;
    if (activeCollectionId !== 'all' && item.collectionId !== activeCollectionId) return false;
    if (
      searchQ.trim() &&
      !item.title.toLowerCase().includes(searchQ.toLowerCase()) &&
      !(item.notes || '').toLowerCase().includes(searchQ.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">My Knowledge</h1>
          <p className="text-xs text-[#8793A5]">
            Your private repository of saved research, papers, videos, AI answers, and folders.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/my-knowledge/notes"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold hover:brightness-95"
          >
            <NotebookPen className="w-4 h-4" /> Open Notes &amp; Docs Workspace
          </Link>
          <button
            type="button"
            onClick={handleExportNotes}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
          >
            <Download className="w-4 h-4" /> Export Library (.md)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Collections Sidebar */}
        <aside className="lg:col-span-3 space-y-4">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">Collections</p>
            <button
              type="button"
              onClick={() => setActiveCollectionId('all')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold ${
                activeCollectionId === 'all'
                  ? 'bg-[#258BFF] text-white'
                  : 'hover:bg-slate-100 dark:hover:bg-[#071426]'
              }`}
            >
              All Saved Items ({items.length})
            </button>
            {collections.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => setActiveCollectionId(col.id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs truncate ${
                  activeCollectionId === col.id
                    ? 'bg-[#258BFF] text-white font-semibold'
                    : 'hover:bg-slate-100 dark:hover:bg-[#071426]'
                }`}
              >
                {col.name}
              </button>
            ))}

            <form onSubmit={handleCreateFolder} className="pt-2 flex gap-1.5">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New folder..."
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
              />
              <button
                type="submit"
                className="p-1.5 rounded-lg bg-[#B7F34A] text-[#071426]"
                title="Create folder"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            </form>
          </div>

          <form
            onSubmit={handleAddQuickNote}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2.5"
          >
            <p className="text-xs font-bold text-[#071426] dark:text-white">Quick Personal Note</p>
            <input
              type="text"
              required
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Note title..."
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
            />
            <textarea
              rows={3}
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder="Write your note..."
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
            />
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Save Note
            </button>
          </form>
        </aside>

        {/* Main Library Feed */}
        <div className="lg:col-span-9 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {['all', 'visual', 'research', 'article', 'video', 'answer', 'note'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                    activeType === t
                      ? 'bg-[#258BFF] text-white'
                      : 'bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {t === 'visual' ? 'Visuals' : t}
                </button>
              ))}
            </div>
            <div className="relative sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search saved items..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-xs"
              />
            </div>
          </div>

          {/* 2MR My Knowledge AI Organizer & Summarizer */}
          <section className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                  <Sparkles className="w-3.5 h-3.5" /> 2MR My Knowledge AI
                </div>
                <p className="text-xs text-[#8793A5]">
                  Summarize or organize your own saved items in this collection using server-side Gemini AI.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={aiLoading || items.length === 0}
                  onClick={() => handleRunLibraryAi('summarize')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold hover:brightness-110 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Summarize Saved Items
                </button>
                <button
                  type="button"
                  disabled={aiLoading || items.length === 0}
                  onClick={() => handleRunLibraryAi('organize')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#258BFF]/50 text-[#258BFF] dark:text-[#B7F34A] text-xs font-semibold hover:border-[#258BFF] disabled:opacity-50"
                >
                  Suggest Organization
                </button>
              </div>
            </div>

            {aiError && (
              <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{aiError}</span>
              </div>
            )}

            {aiAssistResult && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[#258BFF] dark:text-[#B7F34A]">
                    AI-Generated Library Synthesis · {aiAssistResult.modelUsed} ({aiAssistResult.itemCount} items analyzed)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${aiAssistResult.summary}\n\nThemes:\n${aiAssistResult.keyThemes.map((t) => `- ${t}`).join('\n')}`
                        );
                        addToast('Summary copied to clipboard.', 'success');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold hover:border-[#258BFF]"
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAiSummary}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#B7F34A] text-[#071426] font-bold"
                    >
                      <Bookmark className="w-3 h-3" /> Save Summary
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{aiAssistResult.summary}</p>
                {aiAssistResult.keyThemes.length > 0 && (
                  <div>
                    <p className="font-bold text-[#071426] dark:text-white mb-1">Key Themes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {aiAssistResult.keyThemes.map((theme) => (
                        <span
                          key={theme}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-800"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {aiAssistResult.organizationSuggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-bold text-[#071426] dark:text-white">Suggested Collections</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {aiAssistResult.organizationSuggestions.map((grp, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-800 space-y-1"
                        >
                          <div className="font-bold text-[#258BFF] dark:text-[#B7F34A]">{grp.folderName}</div>
                          <p className="text-[#8793A5]">{grp.rationale}</p>
                          <p className="text-slate-700 dark:text-slate-300">
                            Items: {grp.itemTitles.join(', ')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {aiAssistResult.nextSteps.length > 0 && (
                  <div>
                    <p className="font-bold text-[#071426] dark:text-white mb-1">Suggested Next Research Steps</p>
                    <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                      {aiAssistResult.nextSteps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          {filteredItems.length === 0 ? (
            <div className="p-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center space-y-2">
              <Bookmark className="w-8 h-8 text-[#8793A5] mx-auto" />
              <p className="font-bold text-sm text-[#071426] dark:text-white">No saved items in this view</p>
              <p className="text-xs text-[#8793A5]">
                Save articles, research reports, videos, or AI answers from across 2MR.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredItems.map((item) => {
                const savedVisual = item.type === 'visual' ? parseSavedVisual(item.notes) : null;
                const isExplaining = explainItemId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col justify-between gap-3 ${
                      isExplaining ? 'md:col-span-2' : ''
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold uppercase text-[#258BFF] dark:text-[#B7F34A]">
                          {savedVisual ? savedVisual.originLabel : item.type}
                        </span>
                        <span className="text-[#8793A5] tabular-nums">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-[#071426] dark:text-white">{item.title}</h3>
                      {savedVisual ? (
                        <div className="space-y-2">
                          <VisualArtifactRenderer artifact={savedVisual} />
                          <p className="text-[11px] text-[#8793A5]">
                            {savedVisual.caption} · {savedVisual.attribution}
                          </p>
                        </div>
                      ) : (
                        <>
                          {item.snippet && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{item.snippet}</p>
                          )}
                          {item.notes && (
                            <p className="text-xs text-slate-500 dark:text-[#8793A5] bg-slate-50 dark:bg-[#071426] p-2.5 rounded-lg line-clamp-4">
                              {item.notes}
                            </p>
                          )}
                        </>
                      )}

                      {isExplaining && (
                        <div className="pt-2">
                          <VisualIntelligencePanel
                            feature="my_knowledge"
                            query={item.title}
                            contextText={`${item.snippet || ''}\n${item.notes || ''}`}
                            autoRun={true}
                            compact
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <div className="flex items-center gap-3">
                        {item.url ? (
                          <a
                            href={item.url}
                            target={item.url.startsWith('http') ? '_blank' : undefined}
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#258BFF] font-semibold hover:underline"
                          >
                            Open Link <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span className="text-[#8793A5]">{item.category}</span>
                        )}

                        {savedVisual ? (
                          <button
                            type="button"
                            onClick={() => setExpandedVisual(savedVisual)}
                            className="inline-flex items-center gap-1 text-[#258BFF] dark:text-[#B7F34A] font-semibold hover:underline"
                          >
                            <Maximize2 className="w-3.5 h-3.5" /> Expand
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setExplainItemId(isExplaining ? null : item.id)}
                            className="inline-flex items-center gap-1 text-[#258BFF] dark:text-[#B7F34A] font-semibold hover:underline"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {isExplaining ? 'Hide Visuals' : 'Explain Visually'}
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-rose-500 hover:text-rose-400 p-1"
                        title="Delete saved item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {expandedVisual && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setExpandedVisual(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-700 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                  {expandedVisual.originLabel}
                </div>
                <h3 className="text-xl font-extrabold text-[#071426] dark:text-white">{expandedVisual.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setExpandedVisual(null)}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#258BFF]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <VisualArtifactRenderer artifact={expandedVisual} expanded />
            <p className="text-xs text-[#8793A5]">
              {expandedVisual.caption} · {expandedVisual.attribution}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
