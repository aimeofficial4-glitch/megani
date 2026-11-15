import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ExternalLink, Bookmark, Play, BrainCircuit, ArrowLeft } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { CategoryItem, SearchResultItem, VideoRecord } from '../types';
import { CategoryIcon } from '../components/common/CategoryIcon';

export const CategoryDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { saveToLibrary } = useApp();
  const [category, setCategory] = useState<CategoryItem | null>(null);
  const [documents, setDocuments] = useState<SearchResultItem[]>([]);
  const [liveResources, setLiveResources] = useState<SearchResultItem[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError('');
    apiFetch<{
      category: CategoryItem;
      documents: SearchResultItem[];
      videos: VideoRecord[];
      liveResources: SearchResultItem[];
    }>(`/api/categories/${slug}`)
      .then((res) => {
        setCategory(res.category);
        setDocuments(res.documents || []);
        setVideos(res.videos || []);
        setLiveResources(res.liveResources || []);
      })
      .catch((err) => setError(err.message || 'Category not found.'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="h-32 rounded-2xl bg-slate-200 dark:bg-[#10243D] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-44 rounded-xl bg-slate-200 dark:bg-[#10243D] animate-pulse" />
          <div className="h-44 rounded-xl bg-slate-200 dark:bg-[#10243D] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !category) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-[#071426] dark:text-white">Category Not Found</h1>
        <p className="text-sm text-[#8793A5]">{error}</p>
        <Link to="/categories" className="inline-block px-5 py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold">
          Browse All Categories
        </Link>
      </div>
    );
  }

  const combinedDocs = [...documents, ...liveResources];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div className="p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
        <Link to="/categories" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#258BFF] hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> All Categories
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#258BFF]/15 text-[#258BFF] dark:bg-[#B7F34A]/15 dark:text-[#B7F34A] flex items-center justify-center">
              <CategoryIcon name={category.icon} className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">{category.name}</h1>
              <p className="text-sm text-slate-600 dark:text-[#8793A5]">{category.description}</p>
            </div>
          </div>
          <Link
            to={`/research?topic=${encodeURIComponent(category.name)}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold shrink-0"
          >
            <BrainCircuit className="w-4 h-4" /> Analyze {category.name}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {category.subtopics.map((sub) => (
            <Link
              key={sub}
              to={`/search?q=${encodeURIComponent(sub)}`}
              className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-[#071426] border border-slate-200 dark:border-slate-700 text-xs font-medium hover:border-[#258BFF]"
            >
              {sub}
            </Link>
          ))}
        </div>
      </div>

      {/* Scholarly & Indexed Resources */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-[#071426] dark:text-white">
          Indexed Documents & Live Scholarly Records
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {combinedDocs.map((doc) => (
            <div
              key={doc.id}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#258BFF] dark:text-[#B7F34A]">
                  {doc.sourceName} {doc.publishedDate ? `· ${doc.publishedDate}` : ''}
                </div>
                <h3 className="font-bold text-[#071426] dark:text-white">{doc.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">{doc.snippet}</p>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    saveToLibrary({
                      type: 'research',
                      title: doc.title,
                      url: doc.url,
                      snippet: doc.snippet,
                      category: category.name,
                    })
                  }
                  className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-[#258BFF]"
                >
                  <Bookmark className="w-3.5 h-3.5" /> Save
                </button>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-[#258BFF] hover:underline"
                >
                  Open Source <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {videos.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-[#071426] dark:text-white">Related Video Briefings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {videos.map((v) => (
              <Link
                key={v.id}
                to={`/videos?id=${v.id}`}
                className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-[#258BFF]">{v.channel} · {v.duration}</span>
                  <h3 className="font-bold text-sm text-[#071426] dark:text-white">{v.title}</h3>
                  <p className="text-xs text-[#8793A5] line-clamp-2">{v.description}</p>
                </div>
                <Play className="w-5 h-5 text-[#B7F34A] shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
