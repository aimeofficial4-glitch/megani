import React, { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Sparkles,
  ExternalLink,
  Bookmark,
  BrainCircuit,
  Play,
  Filter,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useApp } from '../context/AppContext';
import { SearchResultItem, VideoRecord, AdCampaignItem } from '../types';
import { AdSlot } from '../components/common/AdSlot';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'websites', label: 'Websites' },
  { id: 'academic', label: 'Academic' },
  { id: 'research', label: 'Research' },
  { id: 'videos', label: 'Videos' },
  { id: 'news', label: 'News' },
  { id: 'images', label: 'Images' },
];

export const SearchResultsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, saveToLibrary } = useApp();

  const initialQ = searchParams.get('q') || '';
  const initialTab = searchParams.get('tab') || 'all';

  const [inputQ, setInputQ] = useState(initialQ);
  const [tab, setTab] = useState(initialTab);
  const [dateFilter, setDateFilter] = useState('any');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('relevance');

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [aiOverview, setAiOverview] = useState<{
    summary: string;
    keyTakeaways: string[];
    verificationNote: string;
    grounded: boolean;
  } | null>(null);
  const [relatedTopics, setRelatedTopics] = useState<string[]>([]);
  const [relatedQuestions, setRelatedQuestions] = useState<string[]>([]);
  const [sponsoredAd, setSponsoredAd] = useState<AdCampaignItem | null>(null);

  const isAdFree = user?.role === 'premium' || user?.role === 'admin';

  useEffect(() => {
    setInputQ(initialQ);
    setTab(initialTab);
  }, [initialQ, initialTab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      q: initialQ,
      tab,
      date: dateFilter,
      sourceType: sourceTypeFilter,
      sort: sortBy,
    });
    apiFetch<any>(`/api/search?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setResults(res.results || []);
        setVideos(res.videos || []);
        setAiOverview(res.aiOverview || null);
        setRelatedTopics(res.relatedTopics || []);
        setRelatedQuestions(res.relatedQuestions || []);
        setSponsoredAd(res.sponsoredAd || null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialQ, tab, dateFilter, sourceTypeFilter, sortBy]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams({ q: inputQ.trim(), tab });
  };

  const changeTab = (nextTab: string) => {
    setTab(nextTab);
    setSearchParams({ q: initialQ, tab: nextTab });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Search & Tabs */}
      <div className="space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-3 flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D]">
            <Search className="w-5 h-5 text-[#258BFF]" />
            <input
              type="text"
              value={inputQ}
              onChange={(e) => setInputQ(e.target.value)}
              placeholder="Search papers, concepts, sources, videos..."
              className="w-full bg-transparent text-sm text-[#071426] dark:text-white focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold hover:brightness-110"
          >
            Search
          </button>
          {initialQ && (
            <button
              type="button"
              onClick={() => navigate(`/research?topic=${encodeURIComponent(initialQ)}`)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-sm font-bold"
            >
              <BrainCircuit className="w-4 h-4" /> Deep Compare
            </button>
          )}
        </form>

        {/* Modality Tabs & Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => changeTab(t.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  tab === t.id
                    ? 'bg-[#258BFF] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#10243D]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-[#8793A5]" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D]"
            >
              <option value="any">Any Date</option>
              <option value="2024+">2024 – Present</option>
            </select>
            <select
              value={sourceTypeFilter}
              onChange={(e) => setSourceTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D]"
            >
              <option value="all">All Providers</option>
              <option value="crossref">CrossRef</option>
              <option value="arxiv">arXiv</option>
              <option value="wikipedia">Wikipedia</option>
              <option value="2mr_index">2MR Curated</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D]"
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="date">Sort: Most Recent</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content + Right Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-5">
          {loading ? (
            <div className="p-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col items-center justify-center gap-3 text-sm text-[#8793A5]">
              <Loader2 className="w-7 h-7 animate-spin text-[#258BFF]" />
              <span>Querying CrossRef, arXiv, Wikipedia, and 2MR Permitted Index...</span>
            </div>
          ) : (
            <>
              {/* AI Grounded Overview */}
              {aiOverview && (
                <div className="p-5 rounded-2xl border border-[#258BFF]/30 bg-white dark:bg-[#10243D] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                      <Sparkles className="w-4 h-4" /> Grounded Search Synthesis
                    </span>
                    <span className="text-[11px] text-[#8793A5]">
                      {aiOverview.grounded ? 'Evidence-backed' : 'No matching retrieval'}
                    </span>
                  </div>
                  <p className="text-sm text-[#071426] dark:text-slate-100 leading-relaxed">
                    {aiOverview.summary}
                  </p>
                  {aiOverview.keyTakeaways.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {aiOverview.keyTakeaways.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[11px] text-[#8793A5] border-t border-slate-100 dark:border-slate-800 pt-2">
                    {aiOverview.verificationNote}
                  </p>
                </div>
              )}

              {/* Clearly Labelled Sponsored Result for Free / Guest Users Only */}
              {!isAdFree && sponsoredAd && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0C1D33] space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-[#8793A5]">
                    <span className="font-semibold uppercase tracking-wider">
                      Sponsored · {sponsoredAd.advertiserName}
                    </span>
                    <Link to="/pricing" className="text-[#258BFF] hover:underline">
                      Remove ads with Premium
                    </Link>
                  </div>
                  <a
                    href={sponsoredAd.ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-bold text-sm text-[#258BFF] hover:underline"
                  >
                    {sponsoredAd.headline}
                  </a>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{sponsoredAd.description}</p>
                </div>
              )}

              {/* Video Results when tab is videos or all */}
              {(tab === 'videos' || tab === 'all') && videos.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-[#8793A5]">
                    Matched Educational Videos
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {videos.map((v) => (
                      <Link
                        key={v.id}
                        to={`/videos?id=${v.id}`}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-xs text-[#258BFF] font-semibold">
                            {v.channel} · {v.duration}
                          </div>
                          <div className="font-bold text-sm text-[#071426] dark:text-white line-clamp-1">
                            {v.title}
                          </div>
                        </div>
                        <Play className="w-4 h-4 text-[#B7F34A] shrink-0" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Results List */}
              {tab !== 'videos' && (
                <div className="space-y-3">
                  {results.length === 0 ? (
                    <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] text-center space-y-2">
                      <AlertCircle className="w-8 h-8 text-[#8793A5] mx-auto" />
                      <h3 className="font-bold text-[#071426] dark:text-white">No matching records found</h3>
                      <p className="text-xs text-[#8793A5]">
                        Try broader search keywords or switch to another source provider filter.
                      </p>
                    </div>
                  ) : (
                    results.map((item) => (
                      <article
                        key={item.id}
                        className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#8793A5]">
                          <span className="font-semibold text-[#258BFF] dark:text-[#B7F34A]">
                            {item.sourceName}
                          </span>
                          <span>·</span>
                          <span>{item.domain}</span>
                          {item.publishedDate && (
                            <>
                              <span>·</span>
                              <span className="tabular-nums">{item.publishedDate}</span>
                            </>
                          )}
                          {item.doi && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-[11px]">DOI: {item.doi}</span>
                            </>
                          )}
                        </div>

                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-base font-bold text-[#071426] dark:text-white hover:text-[#258BFF] transition"
                        >
                          {item.title}
                        </a>

                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                          {item.snippet}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                saveToLibrary({
                                  type: 'article',
                                  title: item.title,
                                  url: item.url,
                                  snippet: item.snippet,
                                  category: item.modality,
                                  tags: item.keywords,
                                })
                              }
                              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-[#258BFF]"
                            >
                              <Bookmark className="w-3.5 h-3.5" /> Save to Library
                            </button>
                            <Link
                              to={`/research?topic=${encodeURIComponent(item.title)}`}
                              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-[#B7F34A]"
                            >
                              <BrainCircuit className="w-3.5 h-3.5" /> Compare
                            </Link>
                          </div>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#258BFF] hover:underline"
                          >
                            Open Original <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Sidebar */}
        <aside className="lg:col-span-4 space-y-5">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
            <h3 className="text-sm font-bold text-[#071426] dark:text-white">Related Topics</h3>
            <div className="flex flex-wrap gap-2">
              {relatedTopics.map((topic) => (
                <Link
                  key={topic}
                  to={`/search?q=${encodeURIComponent(topic)}`}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#071426] border border-slate-200 dark:border-slate-700 text-xs hover:border-[#258BFF]"
                >
                  {topic}
                </Link>
              ))}
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-3">
            <h3 className="text-sm font-bold text-[#071426] dark:text-white">Follow-Up Research Questions</h3>
            <div className="space-y-2">
              {relatedQuestions.map((rq) => (
                <Link
                  key={rq}
                  to={`/ask?q=${encodeURIComponent(rq)}`}
                  className="block p-3 rounded-xl bg-slate-50 dark:bg-[#071426] border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 hover:border-[#258BFF]"
                >
                  {rq}
                </Link>
              ))}
            </div>
          </div>

          <AdSlot type="banner" />
        </aside>
      </div>
    </div>
  );
};
