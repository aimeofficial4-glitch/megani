import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { AdminLayout } from './AdminLayout';

export const AdminContentPage: React.FC = () => {
  const { addToast } = useApp();
  const [documents, setDocuments] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [docTitle, setDocTitle] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docSource, setDocSource] = useState('');
  const [docSnippet, setDocSnippet] = useState('');
  const [docCat, setDocCat] = useState('technology');

  const loadContent = () => {
    apiFetch<{ documents: any[]; videos: any[] }>('/api/admin/content')
      .then((res) => {
        setDocuments(res.documents || []);
        setVideos(res.videos || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadContent();
  }, []);

  const addDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/content/documents', {
        method: 'POST',
        body: JSON.stringify({
          title: docTitle,
          url: docUrl,
          sourceName: docSource,
          snippet: docSnippet,
          categorySlug: docCat,
          isFeatured: true,
        }),
      });
      setDocTitle('');
      setDocUrl('');
      setDocSource('');
      setDocSnippet('');
      loadContent();
      addToast('Indexed document added.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to add document.', 'error');
    }
  };

  return (
    <AdminLayout
      title="Content & Index Manager"
      subtitle="Publish, feature, or remove indexed scholarly documents and educational videos."
    >
      <form
        onSubmit={addDocument}
        className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3"
      >
        <h2 className="font-bold text-sm text-[#071426] dark:text-white">Index New Document</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            required
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Document Title"
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
          />
          <input
            required
            value={docUrl}
            onChange={(e) => setDocUrl(e.target.value)}
            placeholder="Primary Source URL"
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
          />
          <input
            required
            value={docSource}
            onChange={(e) => setDocSource(e.target.value)}
            placeholder="Publisher / Institution"
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            required
            value={docSnippet}
            onChange={(e) => setDocSnippet(e.target.value)}
            placeholder="Abstract / snippet summary..."
            className="sm:col-span-3 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
          />
          <select
            value={docCat}
            onChange={(e) => setDocCat(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] text-xs"
          >
            <option value="technology">Technology</option>
            <option value="science">Science</option>
            <option value="health">Health</option>
            <option value="cybersecurity">Cybersecurity</option>
            <option value="environment">Environment</option>
            <option value="agriculture">Agriculture</option>
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#258BFF] text-white text-xs font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> Publish to Index
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-3">
          <h2 className="font-bold text-sm text-[#071426] dark:text-white">
            Indexed Documents ({documents.length})
          </h2>
          {documents.map((d) => (
            <div key={d.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex items-start justify-between gap-3 text-xs">
              <div>
                <div className="font-bold text-[#071426] dark:text-white">{d.title}</div>
                <div className="text-[#8793A5]">{d.sourceName} · {d.categorySlug}</div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(`/api/admin/content/documents/${d.id}`, { method: 'DELETE' });
                  loadContent();
                }}
                className="text-rose-500 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-sm text-[#071426] dark:text-white">
            Educational Videos ({videos.length})
          </h2>
          {videos.map((v) => (
            <div key={v.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex items-start justify-between gap-3 text-xs">
              <div>
                <div className="font-bold text-[#071426] dark:text-white">{v.title}</div>
                <div className="text-[#8793A5]">{v.channel} · {v.duration}</div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(`/api/admin/content/videos/${v.id}`, { method: 'PATCH', body: JSON.stringify({ isFeatured: !v.isFeatured }) });
                  loadContent();
                }}
                className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
              >
                {v.isFeatured ? 'Featured' : 'Standard'}
              </button>
            </div>
          ))}
        </section>
      </div>
    </AdminLayout>
  );
};
