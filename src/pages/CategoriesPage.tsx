import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Layers } from 'lucide-react';
import { apiFetch } from '../services/api';
import { CategoryItem } from '../types';
import { CategoryIcon } from '../components/common/CategoryIcon';

export const CategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ categories: CategoryItem[] }>('/api/categories')
      .then((res) => setCategories(res.categories || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
          <Layers className="w-4 h-4" /> Academic & Technical Directory
        </div>
        <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">All Research Categories</h1>
        <p className="text-sm text-slate-600 dark:text-[#8793A5]">
          Select any discipline below to browse indexed documents, educational videos, and live scholarly papers.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-44 rounded-2xl bg-slate-200 dark:bg-[#10243D] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              to={`/categories/${cat.slug}`}
              className="group p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#258BFF]/10 text-[#258BFF] dark:bg-[#B7F34A]/15 dark:text-[#B7F34A] flex items-center justify-center">
                    <CategoryIcon name={cat.icon} className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono text-[#8793A5] tabular-nums">
                    {cat.resourceCount.toLocaleString()} resources
                  </span>
                </div>
                <h2 className="text-lg font-bold text-[#071426] dark:text-white group-hover:text-[#258BFF]">
                  {cat.name}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">{cat.description}</p>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs font-semibold text-[#258BFF] dark:text-[#B7F34A]">
                <span>{cat.subtopics.slice(0, 2).join(' · ')}</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
