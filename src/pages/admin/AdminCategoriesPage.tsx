import React, { useEffect, useState } from 'react';
import { FolderTree, Plus, Trash2 } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { apiFetch } from '../../services/api';
import { useApp } from '../../context/AppContext';

export const AdminCategoriesPage: React.FC = () => {
  const { addToast } = useApp();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('BookOpen');
  const [subtopicsInput, setSubtopicsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ categories: any[] }>('/api/admin/categories');
      setCategories(res.categories || []);
    } catch (err: any) {
      addToast(err.message || 'Failed to load categories.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) {
      setSlug(
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      );
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !description.trim()) {
      addToast('Name, slug, and description are required.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const subtopics = subtopicsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name, slug, description, icon, subtopics }),
      });
      setName('');
      setSlug('');
      setDescription('');
      setSubtopicsInput('');
      addToast('Research category created.', 'success');
      await loadCategories();
    } catch (err: any) {
      addToast(err.message || 'Failed to create category.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, catName: string) => {
    try {
      await apiFetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
      addToast(`Deleted category "${catName}".`, 'success');
      await loadCategories();
    } catch (err: any) {
      addToast(err.message || 'Failed to delete category.', 'error');
    }
  };

  return (
    <AdminLayout
      title="Categories & Knowledge Taxonomy"
      subtitle="Create and maintain global research disciplines and subtopic hierarchies across 2MR."
    >
      <div className="space-y-6">
        <form
          onSubmit={handleCreate}
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4"
        >
          <h2 className="font-bold text-sm text-[#071426] dark:text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#258BFF] dark:text-[#B7F34A]" /> Add Research Discipline
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[#8793A5] mb-1">Category Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Climate Science"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              />
            </div>
            <div>
              <label className="block text-[#8793A5] mb-1">URL Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="climate-science"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426] font-mono"
              />
            </div>
            <div>
              <label className="block text-[#8793A5] mb-1">Icon Identifier</label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="BookOpen"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[#8793A5] mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Earth systems, atmospheric physics, and decarbonization."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              />
            </div>
            <div>
              <label className="block text-[#8793A5] mb-1">Subtopics (comma-separated)</label>
              <input
                type="text"
                value={subtopicsInput}
                onChange={(e) => setSubtopicsInput(e.target.value)}
                placeholder="Carbon Cycle, Paleoclimatology, Grid Storage"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#071426]"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> {submitting ? 'Creating...' : 'Create Category'}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-[#258BFF]" />
            <h2 className="font-bold text-sm text-[#071426] dark:text-white">
              Active Categories ({categories.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-[#8793A5]">Loading taxonomy...</div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {categories.map((cat) => (
                <div key={cat.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-[#071426] dark:text-white">{cat.name}</h3>
                      <span className="text-[11px] font-mono text-[#8793A5]">/{cat.slug}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{cat.description}</p>
                    {Array.isArray(cat.subtopics) && cat.subtopics.length > 0 && (
                      <p className="text-[11px] text-[#8793A5]">Subtopics: {cat.subtopics.join(' · ')}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(cat.id, cat.name)}
                    className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10 shrink-0"
                    title="Delete category"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};
