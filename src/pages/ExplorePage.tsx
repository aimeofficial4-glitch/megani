import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Compass, ExternalLink, Play, Search } from 'lucide-react';
import { apiFetch } from '../services/api';
import { CategoryItem, SearchResultItem, VideoRecord } from '../types';
import { CategoryIcon } from '../components/common/CategoryIcon';
import { AdSlot } from '../components/common/AdSlot';

export const ExplorePage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [docs, setDocs] = useState<SearchResultItem[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    apiFetch<{
      categories: CategoryItem[];
      featuredDocuments: SearchResultItem[];
      featuredVideos: VideoRecord[];
    }>('/api/home')
      .then((d) => {
        setCategories(d.categories || []);
        setDocs(d.featuredDocuments || []);
        setVideos(d.featuredVideos || []);
      })
      .catch(() => {});
  }, []);

  if (slug) {
    const decodedTopic = decodeURIComponent(slug).replace(/-/g, ' ');
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="space-y-2">
          <Link to="/explore" className="text-xs font-semibold text-[#258BFF] hover:underline">
            ← Back to Explore
          </Link>
          <h1 className="text-3xl font-extrabold capitalize text-[#071426] dark:text-white">
            Topic Explorer: {decodedTopic}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#8793A5]">
            Choose how you want to investigate {decodedTopic} across the 2MR platform.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            to={`/search?q=${encodeURIComponent(decodedTopic)}`}
            className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] space-y-2"
          >
            <h2 className="font-bold text-[#071426] dark:text-white">Multi-Source Search</h2>
            <p className="text-xs text-slate-500 dark:text-[#8793A5]">
              Retrieve live CrossRef, arXiv, and Wikipedia records on {decodedTopic}.
            </p>
          </Link>
          <Link
            to={`/research?topic=${encodeURIComponent(decodedTopic)}`}
            className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#B7F34A] space-y-2"
          >
            <h2 className="font-bold text-[#071426] dark:text-white">Research Intelligence</h2>
            <p className="text-xs text-slate-500 dark:text-[#8793A5]">
              Run source agreement & disagreement analysis on {decodedTopic}.
            </p>
          </Link>
          <Link
            to={`/ask?q=${encodeURIComponent(`Explain ${decodedTopic} clearly with verified sources.`)}`}
            className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] space-y-2"
          >
            <h2 className="font-bold text-[#071426] dark:text-white">Ask 2MR AI</h2>
            <p className="text-xs text-slate-500 dark:text-[#8793A5]">
              Get a guided, citation-backed explanation of {decodedTopic}.
            </p>
          </Link>
        </div>
      </div>
    );
  }

  const filteredCats = categories.filter(
    (c) =>
      !filterText.trim() ||
      c.name.toLowerCase().includes(filterText.toLowerCase()) ||
      c.subtopics.some((s) => s.toLowerCase().includes(filterText.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
            <Compass className="w-4 h-4" /> Discovery Hub
          </div>
          <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">Explore Global Knowledge</h1>
          <p className="text-sm text-slate-600 dark:text-[#8793A5]">
            Browse trending research subjects, discipline hubs, curated standards, and educational video lectures.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter topics or disciplines..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] text-sm focus:outline-none focus:border-[#258BFF]"
          />
        </div>
      </div>

      <AdSlot type="banner" />

      {/* Subject Hubs */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-[#071426] dark:text-white">Subject Hubs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCats.map((cat) => (
            <div
              key={cat.slug}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3"
            >
              <div className="flex items-center justify-between">
                <Link to={`/categories/${cat.slug}`} className="flex items-center gap-2.5 group">
                  <div className="w-9 h-9 rounded-lg bg-[#258BFF]/10 text-[#258BFF] dark:bg-[#B7F34A]/10 dark:text-[#B7F34A] flex items-center justify-center">
                    <CategoryIcon name={cat.icon} className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-[#071426] dark:text-white group-hover:text-[#258BFF]">
                    {cat.name}
                  </h3>
                </Link>
                <span className="text-xs font-mono text-[#8793A5] tabular-nums">
                  {cat.resourceCount.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">{cat.description}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {cat.subtopics.slice(0, 4).map((sub) => (
                  <Link
                    key={sub}
                    to={`/explore/${encodeURIComponent(sub.toLowerCase().replace(/\s+/g, '-'))}`}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-[#071426] text-slate-600 dark:text-slate-300 hover:text-[#258BFF]"
                  >
                    {sub}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Papers & Videos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-[#071426] dark:text-white">Curated Research Records</h2>
          <div className="space-y-3">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-[#258BFF] dark:text-[#B7F34A]">
                    {doc.sourceName}
                  </span>
                  <h3 className="font-bold text-sm text-[#071426] dark:text-white">{doc.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-[#8793A5] line-clamp-2">{doc.snippet}</p>
                </div>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#258BFF] shrink-0"
                  aria-label="Open primary source"
                >
                  <ExternalLink className="w-4 h-4 text-[#258BFF]" />
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-[#071426] dark:text-white">Featured Educational Briefings</h2>
          <div className="space-y-3">
            {videos.map((v) => (
              <Link
                key={v.id}
                to={`/videos?id=${v.id}`}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-[#258BFF]">{v.channel} · {v.duration}</span>
                  <h3 className="font-bold text-sm text-[#071426] dark:text-white">{v.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-[#8793A5] line-clamp-2">{v.description}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-[#B7F34A] text-[#071426] flex items-center justify-center shrink-0">
                  <Play className="w-4 h-4 fill-current" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
