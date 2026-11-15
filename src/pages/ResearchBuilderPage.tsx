import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Download,
  Printer,
  Save,
  ExternalLink,
  Loader2,
  FolderPlus,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { VisualIntelligencePanel } from '../components/visual/VisualIntelligencePanel';

interface ResearchProject {
  id: string;
  title: string;
  topic: string;
  objectives: string;
  question: string;
  researchType: string;
  description: string;
  hypothesis: string;
  methodology: string;
  literatureReview: string;
  outline: string[];
  findings: string;
  conclusion: string;
  status: string;
  updatedAt: string;
}

interface ProjectSource {
  id: string;
  title: string;
  url: string;
  authors: string | null;
  publishedDate: string | null;
  stance: string;
  notes: string | null;
}

interface ProjectNote {
  id: string;
  content: string;
  createdAt: string;
}

const SECTIONS = [
  { id: 'overview', label: '1. Project Overview' },
  { id: 'questions', label: '2. Research Questions' },
  { id: 'sources', label: '3. Sources' },
  { id: 'literature', label: '4. Literature Review' },
  { id: 'notes', label: '5. Notes' },
  { id: 'outline', label: '6. Outline' },
  { id: 'findings', label: '7. Findings' },
  { id: 'references', label: '8. References' },
  { id: 'report', label: '9. Final Report' },
] as const;

export const ResearchBuilderPage: React.FC = () => {
  const { user, addToast } = useApp();
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [sources, setSources] = useState<ProjectSource[]>([]);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]['id']>('overview');

  // New project modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newType, setNewType] = useState('Systematic Review');
  const [newObjectives, setNewObjectives] = useState('');

  // Add source / note inputs
  const [srcTitle, setSrcTitle] = useState('');
  const [srcUrl, setSrcUrl] = useState('');
  const [srcAuthors, setSrcAuthors] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [assisting, setAssisting] = useState(false);
  const [aiTitleSuggestions, setAiTitleSuggestions] = useState<string[]>([]);
  const [aiDraftMeta, setAiDraftMeta] = useState<{ usedAi: boolean; modelUsed?: string; warning?: string } | null>(null);

  const loadProjects = async () => {
    if (!user) return;
    try {
      const data = await apiFetch<{ projects: ResearchProject[] }>('/api/projects');
      setProjects(data.projects || []);
      if (data.projects?.length > 0 && !activeId) {
        openProject(data.projects[0].id);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadProjects();
  }, [user]);

  const openProject = async (id: string) => {
    try {
      const data = await apiFetch<{
        project: ResearchProject;
        sources: ProjectSource[];
        notes: ProjectNote[];
      }>(`/api/projects/${id}`);
      setActiveId(id);
      setProject(data.project);
      setSources(data.sources || []);
      setNotes(data.notes || []);
    } catch (err: any) {
      addToast(err.message || 'Unable to load project.', 'error');
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await apiFetch<{ project: ResearchProject }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle,
          topic: newTopic,
          researchType: newType,
          objectives: newObjectives,
        }),
      });
      setShowCreate(false);
      setNewTitle('');
      setNewTopic('');
      setNewObjectives('');
      await loadProjects();
      openProject(data.project.id);
      addToast('Research project created.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to create project.', 'error');
    }
  };

  const handleSaveProject = async () => {
    if (!project) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ project: ResearchProject }>(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify(project),
      });
      setProject(res.project);
      addToast('Project changes saved.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAiAssist = async () => {
    if (!project) return;
    setAssisting(true);
    try {
      const res = await apiFetch<{
        suggestions: any;
        usedAi?: boolean;
        modelUsed?: string;
        warning?: string;
      }>(`/api/projects/${project.id}/assist`, {
        method: 'POST',
      });
      const s = res.suggestions || {};
      setAiTitleSuggestions(Array.isArray(s.titleSuggestions) ? s.titleSuggestions : []);
      setAiDraftMeta({
        usedAi: Boolean(res.usedAi),
        modelUsed: res.modelUsed,
        warning: res.warning,
      });
      setProject((prev) =>
        prev
          ? {
              ...prev,
              objectives: prev.objectives || s.objectives || '',
              question: prev.question || s.question || '',
              hypothesis: prev.hypothesis || s.hypothesis || '',
              methodology: prev.methodology || s.methodology || '',
              literatureReview: prev.literatureReview || s.literatureReview || '',
              outline: prev.outline?.length ? prev.outline : s.outline || [],
              findings: prev.findings || s.findings || '',
              conclusion: prev.conclusion || s.conclusion || '',
            }
          : prev
      );
      addToast('AI research draft suggestions populated. Review and save.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Unable to run assistant.', 'error');
    } finally {
      setAssisting(false);
    }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    try {
      const res = await apiFetch<{ source: ProjectSource }>(`/api/projects/${project.id}/sources`, {
        method: 'POST',
        body: JSON.stringify({ title: srcTitle, url: srcUrl, authors: srcAuthors }),
      });
      setSources((prev) => [...prev, res.source]);
      setSrcTitle('');
      setSrcUrl('');
      setSrcAuthors('');
      addToast('Source added.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Unable to add source.', 'error');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !noteInput.trim()) return;
    try {
      const res = await apiFetch<{ note: ProjectNote }>(`/api/projects/${project.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: noteInput.trim() }),
      });
      setNotes((prev) => [res.note, ...prev]);
      setNoteInput('');
    } catch (err: any) {
      addToast(err.message || 'Unable to save note.', 'error');
    }
  };

  const handleDownloadDocx = async () => {
    if (!project) return;
    try {
      const blob = await apiFetch<Blob>(`/api/projects/${project.id}/export/docx`, {
        method: 'POST',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.title.replace(/[^a-zA-Z0-9-_]/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      addToast('Word (.docx) report downloaded.', 'success');
    } catch (err: any) {
      addToast(err.message || 'DOCX export failed.', 'error');
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <FileText className="w-12 h-12 text-[#258BFF] mx-auto" />
        <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">2MR Research Builder</h1>
        <p className="text-sm text-slate-600 dark:text-[#8793A5]">
          Sign in to create structured research projects, manage citations, draft literature reviews, and export reports to PDF or Word (.docx).
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-extrabold text-[#071426] dark:text-white">2MR Research Builder</h1>
          <p className="text-xs text-[#8793A5]">
            Organize your research from initial question to formatted DOCX & PDF export.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
        >
          <FolderPlus className="w-4 h-4" /> New Research Project
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreateProject}
          className="p-6 rounded-2xl border border-[#258BFF]/40 bg-white dark:bg-[#10243D] space-y-4 no-print"
        >
          <h2 className="font-bold text-[#071426] dark:text-white">Create New Project</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Project Title"
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
            />
            <input
              type="text"
              required
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="Core Topic"
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
            >
              <option>Systematic Review</option>
              <option>Empirical Case Study</option>
              <option>Technical Whitepaper</option>
              <option>Policy Briefing</option>
            </select>
          </div>
          <textarea
            value={newObjectives}
            onChange={(e) => setNewObjectives(e.target.value)}
            placeholder="Primary objectives..."
            rows={2}
            className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs"
            >
              Cancel
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold">
              Create Project
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar: Projects & 9 Sections */}
        <aside className="lg:col-span-3 space-y-4 no-print">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">Your Projects</p>
            {projects.length === 0 ? (
              <p className="text-xs text-[#8793A5]">Create your first research project above.</p>
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openProject(p.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs truncate ${
                    project?.id === p.id
                      ? 'bg-[#258BFF] text-white font-semibold'
                      : 'hover:bg-slate-100 dark:hover:bg-[#071426]'
                  }`}
                >
                  {p.title}
                </button>
              ))
            )}
          </div>

          {project && (
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5] mb-2">
                Workspace Sections
              </p>
              {SECTIONS.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSection(sec.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition ${
                    activeSection === sec.id
                      ? 'bg-[#258BFF]/15 text-[#258BFF] dark:text-[#B7F34A] font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#071426]'
                  }`}
                >
                  {sec.label}
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Main Workspace Canvas */}
        <div className="lg:col-span-9">
          {!project ? (
            <div className="p-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center space-y-3">
              <FileText className="w-10 h-10 text-[#258BFF] mx-auto" />
              <h2 className="font-bold text-lg text-[#071426] dark:text-white">No Active Project Selected</h2>
              <p className="text-xs text-[#8793A5]">Click "New Research Project" to begin organizing your work.</p>
            </div>
          ) : (
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-6">
              {/* Top Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800 no-print">
                <div>
                  <h2 className="text-xl font-bold text-[#071426] dark:text-white">{project.title}</h2>
                  <p className="text-xs text-[#8793A5]">
                    {project.researchType} · Topic: {project.topic}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleAiAssist}
                    disabled={assisting}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#258BFF]/50 text-[#258BFF] dark:text-[#B7F34A] text-xs font-semibold"
                  >
                    {assisting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    AI Outline & Review Helper
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProject}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold"
                  >
                    <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              {aiDraftMeta && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 space-y-2 text-xs no-print">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#258BFF] dark:text-[#B7F34A]">
                      {aiDraftMeta.usedAi
                        ? `AI-Generated Draft Assistance · ${aiDraftMeta.modelUsed || 'Gemini'}`
                        : 'Structured Research Scaffold (AI Unavailable Fallback)'}
                    </span>
                    {aiDraftMeta.warning && <span className="text-amber-600 dark:text-amber-400">{aiDraftMeta.warning}</span>}
                  </div>
                  {aiTitleSuggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[#8793A5]">Suggested Titles:</span>
                      {aiTitleSuggestions.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setProject((prev) => (prev ? { ...prev, title: t } : prev))}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#10243D] border border-slate-200 dark:border-slate-700 hover:border-[#258BFF] text-left"
                        >
                          Use: {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeSection === 'overview' && (
                <div className="space-y-4">
                  <label className="block text-xs font-bold uppercase text-[#8793A5]">Description & Scope</label>
                  <textarea
                    rows={4}
                    value={project.description}
                    onChange={(e) => setProject({ ...project, description: e.target.value })}
                    placeholder="Summarize the context and scope of this research..."
                    className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                  />
                  <label className="block text-xs font-bold uppercase text-[#8793A5]">Objectives</label>
                  <textarea
                    rows={3}
                    value={project.objectives}
                    onChange={(e) => setProject({ ...project, objectives: e.target.value })}
                    className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                  />
                </div>
              )}

              {activeSection === 'questions' && (
                <div className="space-y-4">
                  <label className="block text-xs font-bold uppercase text-[#8793A5]">Primary Research Question</label>
                  <textarea
                    rows={3}
                    value={project.question}
                    onChange={(e) => setProject({ ...project, question: e.target.value })}
                    className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                  />
                  <label className="block text-xs font-bold uppercase text-[#8793A5]">Hypothesis / Thesis</label>
                  <textarea
                    rows={3}
                    value={project.hypothesis}
                    onChange={(e) => setProject({ ...project, hypothesis: e.target.value })}
                    className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                  />
                  <label className="block text-xs font-bold uppercase text-[#8793A5]">Methodology</label>
                  <textarea
                    rows={4}
                    value={project.methodology}
                    onChange={(e) => setProject({ ...project, methodology: e.target.value })}
                    className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                  />
                </div>
              )}

              {activeSection === 'sources' && (
                <div className="space-y-4">
                  <form onSubmit={handleAddSource} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      required
                      value={srcTitle}
                      onChange={(e) => setSrcTitle(e.target.value)}
                      placeholder="Source Title"
                      className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                    />
                    <input
                      required
                      value={srcUrl}
                      onChange={(e) => setSrcUrl(e.target.value)}
                      placeholder="https://..."
                      className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                    />
                    <input
                      value={srcAuthors}
                      onChange={(e) => setSrcAuthors(e.target.value)}
                      placeholder="Authors"
                      className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
                    />
                    <button type="submit" className="px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold">
                      <Plus className="w-3.5 h-3.5 inline mr-1" /> Add Source
                    </button>
                  </form>
                  <div className="space-y-2">
                    {sources.map((s) => (
                      <div key={s.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071426] flex items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-bold text-[#071426] dark:text-white">{s.title}</div>
                          <div className="text-[#8793A5]">{s.authors || 'Unknown'} · {s.url}</div>
                        </div>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#258BFF]">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeSection === 'literature' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-[#8793A5]">Literature Review Synthesis</label>
                  <textarea
                    rows={10}
                    value={project.literatureReview}
                    onChange={(e) => setProject({ ...project, literatureReview: e.target.value })}
                    placeholder="Synthesize agreements, gaps, and scholarly perspectives across your collected sources..."
                    className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                  />
                </div>
              )}

              {activeSection === 'notes' && (
                <div className="space-y-4">
                  <form onSubmit={handleAddNote} className="flex gap-2">
                    <input
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Record an analytical note or observation..."
                      className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                    />
                    <button type="submit" className="px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold">
                      Add Note
                    </button>
                  </form>
                  <div className="space-y-2">
                    {notes.map((n) => (
                      <div key={n.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071426] flex items-start justify-between gap-3 text-sm">
                        <span>{n.content}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/projects/${project.id}/notes/${n.id}`, { method: 'DELETE' });
                            setNotes((prev) => prev.filter((item) => item.id !== n.id));
                          }}
                          className="text-rose-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeSection === 'outline' && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase text-[#8793A5]">Structured Report Outline</label>
                  <textarea
                    rows={8}
                    value={(project.outline || []).join('\n')}
                    onChange={(e) => setProject({ ...project, outline: e.target.value.split('\n') })}
                    className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm font-mono"
                  />
                </div>
              )}

              {activeSection === 'findings' && (
                <div className="space-y-4">
                  <label className="block text-xs font-bold uppercase text-[#8793A5]">Findings</label>
                  <textarea
                    rows={6}
                    value={project.findings}
                    onChange={(e) => setProject({ ...project, findings: e.target.value })}
                    className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                  />
                  <label className="block text-xs font-bold uppercase text-[#8793A5]">Conclusion</label>
                  <textarea
                    rows={4}
                    value={project.conclusion}
                    onChange={(e) => setProject({ ...project, conclusion: e.target.value })}
                    className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-sm"
                  />
                </div>
              )}

              {activeSection === 'references' && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-[#071426] dark:text-white">Formatted Reference List</h3>
                  {sources.length === 0 ? (
                    <p className="text-xs text-[#8793A5]">Add sources in Section 3 to generate formatted citations.</p>
                  ) : (
                    sources.map((s) => (
                      <div key={s.id} className="p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs font-mono">
                        {s.authors || 'Research Author'} ({s.publishedDate || '2026'}). {s.title}. Retrieved from {s.url}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeSection === 'report' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-3 no-print">
                    <button
                      type="button"
                      onClick={handleDownloadDocx}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold"
                    >
                      <Download className="w-4 h-4" /> Download Word (.docx)
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                    >
                      <Printer className="w-4 h-4" /> Print / Save PDF
                    </button>
                  </div>

                  <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#071426] space-y-4 text-sm">
                    <h1 className="text-2xl font-extrabold">{project.title}</h1>
                    <p className="text-xs text-[#8793A5]">{project.researchType} · Topic: {project.topic}</p>
                    <div>
                      <h3 className="font-bold">Research Question</h3>
                      <p>{project.question || 'Not specified yet.'}</p>
                    </div>
                    <div>
                      <h3 className="font-bold">Literature Review</h3>
                      <p className="whitespace-pre-line">{project.literatureReview || 'Not drafted yet.'}</p>
                    </div>
                    <div>
                      <h3 className="font-bold">Methodology</h3>
                      <p>{project.methodology || 'Not drafted yet.'}</p>
                    </div>
                    <div>
                      <h3 className="font-bold">Findings & Conclusion</h3>
                      <p className="whitespace-pre-line">{project.findings || 'Not drafted yet.'}</p>
                      <p className="mt-2">{project.conclusion}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 no-print">
                <VisualIntelligencePanel
                  feature="research_builder"
                  query={project.topic || project.title}
                  contextText={`${project.description || ''}\n${project.question || ''}\n${project.methodology || ''}\n${project.findings || ''}`}
                  sources={sources.map((s) => ({
                    title: s.title,
                    url: s.url,
                    publisher: s.authors || 'Project Reference',
                    publishedDate: s.publishedDate || undefined,
                  }))}
                  projectContext={{
                    title: project.title,
                    topic: project.topic,
                    researchType: project.researchType,
                    question: project.question,
                    methodology: project.methodology,
                    outline: project.outline,
                    sourcesCount: sources.length,
                  }}
                  autoRun={true}
                  compact
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
