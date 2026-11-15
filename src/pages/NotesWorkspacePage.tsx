import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderPlus,
  Plus,
  Search,
  Trash2,
  ExternalLink,
  Download,
  Printer,
  Lock,
  Globe,
  Pin,
  Link2,
  NotebookPen,
  Check,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';

interface NoteFolder {
  id: string;
  name: string;
  color: string;
}

interface NoteSource {
  id: string;
  title: string;
  url: string;
  publisher: string | null;
  publishedDate: string | null;
  excerpt: string | null;
}

interface KnowledgeNote {
  id: string;
  folderId: string | null;
  projectId: string | null;
  videoId: string | null;
  title: string;
  content: string;
  isPinned: boolean;
  isPrivate: boolean;
  tags: string[];
  sources: NoteSource[];
  updatedAt: string;
}

export const NotesWorkspacePage: React.FC = () => {
  const { addToast } = useApp();
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [videos, setVideos] = useState<{ id: string; title: string }[]>([]);

  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [searchQ, setSearchQ] = useState('');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  // Editor state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [videoId, setVideoId] = useState<string>('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // New folder / source forms
  const [newFolderName, setNewFolderName] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourcePublisher, setSourcePublisher] = useState('');
  const [sourceDate, setSourceDate] = useState('');
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadWorkspace = async (selectId?: string) => {
    try {
      const [notesRes, projRes, vidRes] = await Promise.all([
        apiFetch<{ folders: NoteFolder[]; notes: KnowledgeNote[] }>('/api/notes'),
        apiFetch<{ projects: { id: string; title: string }[] }>('/api/projects').catch(() => ({ projects: [] })),
        apiFetch<{ videos: { id: string; title: string }[] }>('/api/videos').catch(() => ({ videos: [] })),
      ]);
      setFolders(notesRes.folders || []);
      setNotes(notesRes.notes || []);
      setProjects(projRes.projects || []);
      setVideos(vidRes.videos || []);

      const targetId = selectId || activeNoteId || notesRes.notes?.[0]?.id;
      if (targetId) {
        const found = notesRes.notes?.find((n) => n.id === targetId);
        if (found) selectNote(found);
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to load notes workspace.', 'error');
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  const selectNote = (note: KnowledgeNote) => {
    setActiveNoteId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setTagsInput((note.tags || []).join(', '));
    setFolderId(note.folderId || '');
    setProjectId(note.projectId || '');
    setVideoId(note.videoId || '');
    setIsPrivate(note.isPrivate);
    setSaveState('saved');
  };

  const persistCurrentNote = async (override?: Partial<{
    title: string;
    content: string;
    tagsInput: string;
    folderId: string;
    projectId: string;
    videoId: string;
    isPrivate: boolean;
  }>) => {
    if (!activeNoteId) return;
    setSaveState('saving');
    const nextTitle = override?.title ?? title;
    const nextContent = override?.content ?? content;
    const nextTags = (override?.tagsInput ?? tagsInput)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const nextFolder = override?.folderId ?? folderId;
    const nextProject = override?.projectId ?? projectId;
    const nextVideo = override?.videoId ?? videoId;
    const nextPrivate = override?.isPrivate ?? isPrivate;

    try {
      await apiFetch(`/api/notes/${activeNoteId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: nextTitle,
          content: nextContent,
          tags: nextTags,
          folderId: nextFolder || null,
          projectId: nextProject || null,
          videoId: nextVideo || null,
          isPrivate: nextPrivate,
        }),
      });
      setNotes((prev) =>
        prev.map((n) =>
          n.id === activeNoteId
            ? {
                ...n,
                title: nextTitle,
                content: nextContent,
                tags: nextTags,
                folderId: nextFolder || null,
                projectId: nextProject || null,
                videoId: nextVideo || null,
                isPrivate: nextPrivate,
                updatedAt: new Date().toISOString(),
              }
            : n
        )
      );
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  };

  const scheduleAutosave = (patch: Partial<{
    title: string;
    content: string;
    tagsInput: string;
    folderId: string;
    projectId: string;
    videoId: string;
    isPrivate: boolean;
  }>) => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaveState('saving');
    autosaveTimer.current = setTimeout(() => {
      persistCurrentNote(patch);
    }, 600);
  };

  const handleCreateNote = async () => {
    try {
      const res = await apiFetch<{ note: KnowledgeNote }>('/api/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Untitled Research Note',
          content: '',
          folderId: selectedFolderId !== 'all' ? selectedFolderId : null,
          isPrivate: true,
        }),
      });
      setNotes((prev) => [res.note, ...prev]);
      selectNote(res.note);
    } catch (err: any) {
      addToast(err.message || 'Unable to create note.', 'error');
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const res = await apiFetch<{ folder: NoteFolder }>('/api/notes/folders', {
        method: 'POST',
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      setFolders((prev) => [...prev, res.folder]);
      setNewFolderName('');
      addToast('Note folder created.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Unable to create folder.', 'error');
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
      const remaining = notes.filter((n) => n.id !== id);
      setNotes(remaining);
      if (activeNoteId === id) {
        if (remaining[0]) selectNote(remaining[0]);
        else {
          setActiveNoteId(null);
          setTitle('');
          setContent('');
        }
      }
    } catch {
      // ignore
    }
  };

  const handleAttachSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeNoteId || !sourceTitle.trim() || !sourceUrl.trim()) return;
    try {
      const res = await apiFetch<{ source: NoteSource }>(`/api/notes/${activeNoteId}/sources`, {
        method: 'POST',
        body: JSON.stringify({
          title: sourceTitle.trim(),
          url: sourceUrl.trim(),
          publisher: sourcePublisher.trim() || null,
          publishedDate: sourceDate.trim() || null,
        }),
      });
      setNotes((prev) =>
        prev.map((n) => (n.id === activeNoteId ? { ...n, sources: [...(n.sources || []), res.source] } : n))
      );
      setSourceTitle('');
      setSourceUrl('');
      setSourcePublisher('');
      setSourceDate('');
      addToast('Source attribution attached.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to attach source.', 'error');
    }
  };

  const handleRemoveSource = async (sourceId: string) => {
    if (!activeNoteId) return;
    try {
      await apiFetch(`/api/notes/${activeNoteId}/sources/${sourceId}`, { method: 'DELETE' });
      setNotes((prev) =>
        prev.map((n) =>
          n.id === activeNoteId ? { ...n, sources: (n.sources || []).filter((s) => s.id !== sourceId) } : n
        )
      );
    } catch {
      // ignore
    }
  };

  const handleExportDocx = async () => {
    if (!activeNoteId) return;
    try {
      const res = await fetch(`/api/notes/${activeNoteId}/export/docx`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9-_]/g, '_') || '2mr-note'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      addToast(err.message || 'Could not export DOCX.', 'error');
    }
  };

  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags || [])));
  const filteredNotes = notes.filter((n) => {
    if (selectedFolderId !== 'all' && n.folderId !== selectedFolderId) return false;
    if (selectedTag !== 'all' && !(n.tags || []).includes(selectedTag)) return false;
    if (
      searchQ.trim() &&
      !n.title.toLowerCase().includes(searchQ.toLowerCase()) &&
      !n.content.toLowerCase().includes(searchQ.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const activeNote = notes.find((n) => n.id === activeNoteId) || null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#8793A5]">
            <Link to="/my-knowledge" className="text-[#258BFF] hover:underline">
              My Knowledge
            </Link>
            <span>/</span>
            <span>Notes &amp; Documentation</span>
          </div>
          <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white flex items-center gap-2 mt-1">
            <NotebookPen className="w-6 h-6 text-[#258BFF] dark:text-[#B7F34A]" />
            Personal Research Notes
          </h1>
        </div>
        <button
          type="button"
          onClick={handleCreateNote}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold hover:brightness-95 shrink-0"
        >
          <Plus className="w-4 h-4" /> New Note
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Column 1: Folders, Search & Note List */}
        <aside className="lg:col-span-4 space-y-4 no-print">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search notes..."
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
              />
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">Folders</p>
              <button
                type="button"
                onClick={() => setSelectedFolderId('all')}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  selectedFolderId === 'all' ? 'bg-[#258BFF] text-white' : 'hover:bg-slate-100 dark:hover:bg-[#071426]'
                }`}
              >
                All Notes ({notes.length})
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFolderId(f.id)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs truncate ${
                    selectedFolderId === f.id ? 'bg-[#258BFF] text-white font-semibold' : 'hover:bg-slate-100 dark:hover:bg-[#071426]'
                  }`}
                >
                  {f.name}
                </button>
              ))}
              <form onSubmit={handleCreateFolder} className="pt-2 flex gap-1.5">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Add folder..."
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                />
                <button type="submit" className="p-1.5 rounded-lg bg-[#B7F34A] text-[#071426]" title="Create folder">
                  <FolderPlus className="w-4 h-4" />
                </button>
              </form>
            </div>

            {allTags.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">Filter by Tag</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedTag('all')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold ${
                      selectedTag === 'all' ? 'bg-[#258BFF] text-white' : 'bg-slate-100 dark:bg-[#071426]'
                    }`}
                  >
                    All
                  </button>
                  {allTags.map((tg) => (
                    <button
                      key={tg}
                      type="button"
                      onClick={() => setSelectedTag(tg)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold ${
                        selectedTag === tg ? 'bg-[#258BFF] text-white' : 'bg-slate-100 dark:bg-[#071426]'
                      }`}
                    >
                      #{tg}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notes List */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center text-xs text-[#8793A5]">
                No notes match this filter. Click &ldquo;New Note&rdquo; to begin.
              </div>
            ) : (
              filteredNotes.map((n) => (
                <div
                  key={n.id}
                  onClick={() => selectNote(n)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start justify-between gap-2 ${
                    activeNoteId === n.id
                      ? 'border-[#258BFF] bg-white dark:bg-[#10243D]'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF]/50'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#071426] dark:text-white truncate">
                      {n.isPinned && <Pin className="w-3 h-3 text-[#258BFF] shrink-0" />}
                      <span className="truncate">{n.title}</span>
                    </div>
                    <p className="text-[11px] text-[#8793A5] line-clamp-1">{n.content || 'Empty note'}</p>
                    <p className="text-[10px] text-[#8793A5] tabular-nums">
                      {n.sources?.length || 0} sources · {new Date(n.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNote(n.id);
                    }}
                    className="text-rose-500 hover:text-rose-400 p-1 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Column 2: Full Note Editor + Attribution */}
        <div className="lg:col-span-8">
          {!activeNote ? (
            <div className="p-16 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center space-y-3">
              <NotebookPen className="w-10 h-10 text-[#258BFF] mx-auto" />
              <h2 className="text-lg font-bold text-[#071426] dark:text-white">Select or Create a Note</h2>
              <p className="text-xs text-[#8793A5] max-w-md mx-auto">
                Organize research notes in folders, attach original source documentation URLs, link notes to projects or videos, and export to PDF or Word (.docx).
              </p>
              <button
                type="button"
                onClick={handleCreateNote}
                className="px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
              >
                Create First Note
              </button>
            </div>
          ) : (
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-5">
              {/* Editor Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4 no-print">
                <div className="flex items-center gap-2 text-xs text-[#8793A5]">
                  {saveState === 'saving' ? (
                    <span className="inline-flex items-center gap-1 text-[#258BFF]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-[#B7F34A]">
                      <Check className="w-3.5 h-3.5" /> Autosaved
                    </span>
                  )}
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isPrivate;
                      setIsPrivate(next);
                      persistCurrentNote({ isPrivate: next });
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-[#071426] dark:text-white hover:text-[#258BFF]"
                  >
                    {isPrivate ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                    {isPrivate ? 'Private Note' : 'Shared Note'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-[#258BFF]"
                  >
                    <Printer className="w-3.5 h-3.5" /> Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleExportDocx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#258BFF] text-white text-xs font-semibold hover:brightness-110"
                  >
                    <Download className="w-3.5 h-3.5" /> Export .DOCX
                  </button>
                </div>
              </div>

              {/* Title */}
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  scheduleAutosave({ title: e.target.value });
                }}
                placeholder="Note title..."
                className="w-full text-2xl font-extrabold bg-transparent text-[#071426] dark:text-white focus:outline-none"
              />

              {/* Linking & Tags */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs no-print">
                <select
                  value={folderId}
                  onChange={(e) => {
                    setFolderId(e.target.value);
                    persistCurrentNote({ folderId: e.target.value });
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                >
                  <option value="">No Folder</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      Folder: {f.name}
                    </option>
                  ))}
                </select>

                <select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    persistCurrentNote({ projectId: e.target.value });
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                >
                  <option value="">Link Research Project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>

                <select
                  value={videoId}
                  onChange={(e) => {
                    setVideoId(e.target.value);
                    persistCurrentNote({ videoId: e.target.value });
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                >
                  <option value="">Link Video...</option>
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => {
                    setTagsInput(e.target.value);
                    scheduleAutosave({ tagsInput: e.target.value });
                  }}
                  placeholder="Tags (comma-separated)"
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
                />
              </div>

              {/* Editor Body */}
              <textarea
                rows={12}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  scheduleAutosave({ content: e.target.value });
                }}
                placeholder="Write structured research notes, hypotheses, observations, and citations..."
                className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] text-sm leading-relaxed focus:outline-none focus:border-[#258BFF]"
              />

              {/* Attached Original Documentation Links */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#071426] dark:text-white flex items-center gap-1.5">
                  <Link2 className="w-4 h-4 text-[#258BFF]" /> Attached Original Sources &amp; Documentation Links
                </h3>

                {(activeNote.sources || []).length > 0 ? (
                  <div className="space-y-2">
                    {activeNote.sources.map((src) => (
                      <div
                        key={src.id}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-[#258BFF] hover:underline inline-flex items-center gap-1"
                          >
                            {src.title} <ExternalLink className="w-3 h-3" />
                          </a>
                          <p className="text-[11px] text-[#8793A5] truncate">
                            {src.publisher || 'Original Publisher'}
                            {src.publishedDate ? ` · ${src.publishedDate}` : ''} · {src.url}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSource(src.id)}
                          className="text-rose-500 hover:text-rose-400 p-1 shrink-0 no-print"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#8793A5]">No source links attached to this note yet.</p>
                )}

                <form onSubmit={handleAttachSource} className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1 no-print">
                  <input
                    type="text"
                    required
                    value={sourceTitle}
                    onChange={(e) => setSourceTitle(e.target.value)}
                    placeholder="Source title *"
                    className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                  />
                  <input
                    type="url"
                    required
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://original-source..."
                    className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-lg bg-[#B7F34A] text-[#071426] text-xs font-bold"
                  >
                    Attach Link
                  </button>
                  <input
                    type="text"
                    value={sourcePublisher}
                    onChange={(e) => setSourcePublisher(e.target.value)}
                    placeholder="Publisher / Author (optional)"
                    className="sm:col-span-3 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                  />
                  <input
                    type="text"
                    value={sourceDate}
                    onChange={(e) => setSourceDate(e.target.value)}
                    placeholder="Year / Date (optional)"
                    className="sm:col-span-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                  />
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
