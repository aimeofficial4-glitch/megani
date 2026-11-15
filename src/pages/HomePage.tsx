import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  Sparkles,
  ArrowRight,
  BrainCircuit,
  MessageSquare,
  FileText,
  Video,
  Network,
  Bookmark,
  Check,
  ShieldCheck,
  Globe,
  BookOpen,
  Play,
  ExternalLink,
  Youtube,
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { CategoryItem, SearchResultItem, VideoRecord } from '../types';
import { CategoryIcon } from '../components/common/CategoryIcon';
import { AdSlot } from '../components/common/AdSlot';
import { useOfficialYouTube } from '../components/common/YouTubeBadgeLink';
import heroLabImg from '../assets/images/research_hero_lab_1794549070942.jpg';
import videoQuantumImg from '../assets/images/video_quantum_lecture_1794549072425.jpg';
import videoAiImg from '../assets/images/video_ai_systems_1794549072309.jpg';
import videoBiotechImg from '../assets/images/video_biotech_lab_1794549072743.jpg';

const VIDEO_FALLBACKS = [videoQuantumImg, videoAiImg, videoBiotechImg];

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [featuredDocs, setFeaturedDocs] = useState<SearchResultItem[]>([]);
  const [featuredVideos, setFeaturedVideos] = useState<VideoRecord[]>([]);
  const yt = useOfficialYouTube();
  const [ytChannelVideos, setYtChannelVideos] = useState<any[]>([]);
  const [ytConfigured, setYtConfigured] = useState<boolean>(false);
  const [ytNotice, setYtNotice] = useState<string | null>(null);
  const [trendingQueries, setTrendingQueries] = useState<string[]>([
    'Post-Quantum Cryptography NIST FIPS 203',
    'Retrieval-Augmented Generation Citations',
    'CRISPR dCas9 Epigenetic Regulation',
    'Climate Mitigation IPCC Pathways',
  ]);

  useEffect(() => {
    apiFetch<{
      categories: CategoryItem[];
      featuredDocuments: SearchResultItem[];
      featuredVideos: VideoRecord[];
      trendingQueries: string[];
    }>('/api/home')
      .then((data) => {
        setCategories(data.categories || []);
        setFeaturedDocs(data.featuredDocuments || []);
        setFeaturedVideos(data.featuredVideos || []);
        if (data.trendingQueries?.length) setTrendingQueries(data.trendingQueries);
      })
      .catch(() => {});

    apiFetch<{ youtubeConfigured: boolean; videos: any[]; message?: string }>('/api/youtube/channel')
      .then((res) => {
        setYtConfigured(Boolean(res.youtubeConfigured));
        setYtChannelVideos(res.videos || []);
        if (res.message) setYtNotice(res.message);
      })
      .catch(() => {});
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      navigate('/search');
      return;
    }
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleAskRedirect = () => {
    if (query.trim()) {
      navigate(`/ask?q=${encodeURIComponent(query.trim())}`);
    } else {
      navigate('/ask');
    }
  };

  return (
    <div className="space-y-16 pb-16">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#071426]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
              <span>2MR – To Master Research</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600 dark:text-[#8793A5]">Global Knowledge & Research Platform</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#071426] dark:text-white leading-[1.08]">
              Discover More.{' '}
              <span className="text-[#258BFF] dark:text-[#B7F34A]">Understand Better.</span>
            </h1>

            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
              Search across peer-reviewed literature, compare evidence and source disagreements, learn through indexed video transcripts, and build structured research reports in one workspace.
            </p>

            {/* Central Search Bar */}
            <form onSubmit={handleSearch} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 p-2 rounded-2xl border border-slate-300 dark:border-slate-700 bg-[#F5F7FA] dark:bg-[#10243D] shadow-sm focus-within:border-[#258BFF] transition">
                <div className="flex items-center gap-3 flex-1 px-3 py-1.5">
                  <Search className="w-5 h-5 text-[#258BFF] shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search scientific papers, technical concepts, videos, or websites..."
                    className="w-full bg-transparent text-sm sm:text-base text-[#071426] dark:text-white placeholder:text-[#8793A5] focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold hover:brightness-110 transition cursor-pointer"
                  >
                    Search
                  </button>
                  <button
                    type="button"
                    onClick={handleAskRedirect}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-sm font-bold hover:brightness-95 transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    Ask 2MR AI
                  </button>
                </div>
              </div>

              {/* Quick Suggestions */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500 dark:text-[#8793A5]">
                <span className="font-semibold text-[#071426] dark:text-slate-300">Popular searches:</span>
                {trendingQueries.slice(0, 4).map((qText) => (
                  <Link
                    key={qText}
                    to={`/search?q=${encodeURIComponent(qText)}`}
                    className="hover:text-[#258BFF] dark:hover:text-[#B7F34A] underline decoration-slate-300 dark:decoration-slate-700 underline-offset-4"
                  >
                    {qText}
                  </Link>
                ))}
              </div>
            </form>
          </div>

          {/* Right Branded Hero Visual */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700/80 bg-[#071426] shadow-xl">
              <img
                src={heroLabImg}
                alt="2MR Global Knowledge Discovery Workstation"
                className="w-full h-64 sm:h-80 object-cover opacity-85"
              />
              <div className="p-5 bg-[#071426] border-t border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src="/assets/aistudio/2MR_Global_Research_Badge_bf1478c8.png"
                    alt="2MR Badge"
                    className="h-12 w-16 object-contain rounded-md"
                  />
                  <div>
                    <p className="text-sm font-bold text-white">Six Integrated Research Engines</p>
                    <p className="text-xs text-[#8793A5]">
                      Search · Ask · Build · Videos · Knowledge Map · Library
                    </p>
                  </div>
                </div>
                <Link
                  to="/research"
                  className="shrink-0 p-2.5 rounded-lg bg-[#10243D] text-[#B7F34A] hover:bg-[#258BFF] hover:text-white transition"
                  aria-label="Open Research Intelligence"
                >
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-16">
        <AdSlot type="banner" />

        {/* SECTION 1: TRENDING RESEARCH */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[#071426] dark:text-white">Trending Research Topics</h2>
              <p className="text-sm text-slate-600 dark:text-[#8793A5]">
                Jump directly into multi-source evidence synthesis and live literature comparisons.
              </p>
            </div>
            <Link
              to="/explore"
              className="text-sm font-semibold text-[#258BFF] hover:underline inline-flex items-center gap-1 shrink-0"
            >
              Explore all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {trendingQueries.slice(0, 6).map((topic, idx) => (
              <Link
                key={topic}
                to={`/research?topic=${encodeURIComponent(topic)}`}
                className="group p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition flex items-start justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <span className="text-xs font-mono font-semibold text-[#258BFF] dark:text-[#B7F34A] tabular-nums">
                    0{idx + 1}
                  </span>
                  <h3 className="font-bold text-[#071426] dark:text-white group-hover:text-[#258BFF] transition">
                    {topic}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#8793A5]">
                    Compare peer-reviewed agreements & open questions
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#258BFF] shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        </section>

        {/* SECTION 2: EXPLORE CATEGORIES (12 CATEGORIES) */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-[#071426] dark:text-white">Explore Knowledge Domains</h2>
              <p className="text-sm text-slate-600 dark:text-[#8793A5]">
                Twelve curated academic and applied disciplines indexed on 2MR.
              </p>
            </div>
            <Link
              to="/categories"
              className="text-sm font-semibold text-[#258BFF] hover:underline inline-flex items-center gap-1 shrink-0"
            >
              All 12 categories <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                to={`/categories/${cat.slug}`}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-[#258BFF]/10 text-[#258BFF] dark:bg-[#B7F34A]/10 dark:text-[#B7F34A] flex items-center justify-center">
                    <CategoryIcon name={cat.icon} className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-mono text-[#8793A5] tabular-nums">
                    {cat.resourceCount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#071426] dark:text-white">{cat.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-[#8793A5] line-clamp-2 mt-0.5">
                    {cat.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* SECTION 3: 6 CORE 2MR FEATURES */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-[#071426] dark:text-white">
              Inside the 2MR Research Architecture
            </h2>
            <p className="text-sm text-slate-600 dark:text-[#8793A5]">
              Built as a complete research workflow from initial discovery to structured final report.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                title: '2MR Research Intelligence',
                desc: 'Cross-source synthesis highlighting where peer-reviewed studies agree, disagree, and require verification.',
                to: '/research',
                icon: BrainCircuit,
              },
              {
                title: 'Ask 2MR AI Assistant',
                desc: 'Grounded explanations with verified citations, uncertainty markers, and persistent research threads.',
                to: '/ask',
                icon: MessageSquare,
              },
              {
                title: '2MR Research Builder',
                desc: 'Structured 9-stage workspace for research questions, sources, notes, literature review, PDF & DOCX export.',
                to: '/research-builder',
                icon: FileText,
              },
              {
                title: 'Video Intelligence',
                desc: 'Educational lectures paired with searchable transcripts, timestamp jumps, summaries, and personal notes.',
                to: '/videos',
                icon: Video,
              },
              {
                title: 'Interactive Knowledge Map',
                desc: 'Explore visual concept graphs, inspect definitions, expand sub-topics, and save custom maps.',
                to: '/knowledge-map',
                icon: Network,
              },
              {
                title: 'My Knowledge Library',
                desc: 'Organize saved papers, websites, videos, AI answers, and custom folders in one private library.',
                to: '/my-knowledge',
                icon: Bookmark,
              },
            ].map((feat) => {
              const Icon = feat.icon;
              return (
                <Link
                  key={feat.to}
                  to={feat.to}
                  className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-[#258BFF]/10 text-[#258BFF] dark:bg-[#B7F34A]/15 dark:text-[#B7F34A] flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-[#071426] dark:text-white">{feat.title}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{feat.desc}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#258BFF] dark:text-[#B7F34A]">
                    Open Workspace <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* SECTION 4: FEATURED INDEXED RESEARCH */}
        {featuredDocs.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[#071426] dark:text-white">Featured Indexed Standards & Papers</h2>
                <p className="text-sm text-slate-600 dark:text-[#8793A5]">
                  Direct access to open-access authoritative publications from NIST, IPCC, WHO, and arXiv.
                </p>
              </div>
              <Link to="/search?tab=academic" className="text-sm font-semibold text-[#258BFF] hover:underline">
                Browse academic index
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {featuredDocs.slice(0, 4).map((doc) => (
                <div
                  key={doc.id}
                  className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-[#8793A5]">
                      <span className="font-semibold text-[#258BFF] dark:text-[#B7F34A]">{doc.sourceName}</span>
                      <span>·</span>
                      <span className="tabular-nums">{doc.publishedDate || 'Open Access'}</span>
                    </div>
                    <h3 className="font-bold text-[#071426] dark:text-white leading-snug">{doc.title}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">{doc.snippet}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                    <Link
                      to={`/research?topic=${encodeURIComponent(doc.title)}`}
                      className="font-semibold text-[#258BFF] hover:underline"
                    >
                      Compare Sources
                    </Link>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-300 hover:text-[#258BFF]"
                    >
                      Open Source <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SECTION 5: VIDEO DISCOVERY */}
        {featuredVideos.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[#071426] dark:text-white">Video Discovery & Transcripts</h2>
                <p className="text-sm text-slate-600 dark:text-[#8793A5]">
                  Watch research briefings with synchronized transcripts, concept extraction, and timestamps.
                </p>
              </div>
              <Link to="/videos" className="text-sm font-semibold text-[#258BFF] hover:underline">
                All videos
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {featuredVideos.map((vid, idx) => (
                <Link
                  key={vid.id}
                  to={`/videos/${vid.id}`}
                  className="group rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition"
                >
                  <div className="relative h-44 bg-[#071426] overflow-hidden">
                    <img
                      src={VIDEO_FALLBACKS[idx % VIDEO_FALLBACKS.length]}
                      alt={vid.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#071426]/80 via-transparent to-transparent flex items-end justify-between p-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#071426]/85 text-white text-xs font-semibold">
                        <Play className="w-3 h-3 text-[#B7F34A]" /> Watch Briefing
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#071426]/85 text-white text-xs font-mono tabular-nums">
                        {vid.duration}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-1.5">
                    <p className="text-xs font-semibold text-[#258BFF] dark:text-[#B7F34A]">{vid.channel}</p>
                    <h3 className="font-bold text-sm text-[#071426] dark:text-white line-clamp-2">{vid.title}</h3>
                    <p className="text-xs text-slate-500 dark:text-[#8793A5] line-clamp-2">{vid.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* SECTION 5B: FOLLOW 2MR ON YOUTUBE */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] p-6 sm:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <a
                href={yt.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-16 h-16 rounded-xl bg-[#071426] border border-slate-700 p-1.5 shrink-0 flex items-center justify-center hover:border-[#FF0000] transition"
              >
                <img
                  src={yt.badgeImagePath}
                  alt={yt.channelName}
                  className="w-full h-full object-contain"
                />
              </a>
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
                  Follow 2MR on YouTube
                </p>
                <h2 className="text-xl sm:text-2xl font-extrabold text-[#071426] dark:text-white flex items-center gap-2">
                  <Youtube className="w-5 h-5 text-[#FF0000] shrink-0" />
                  <span>{yt.channelName}</span>
                </h2>
                <p className="text-xs text-[#8793A5]">
                  Official Channel · {yt.channelHandle} · Research Briefings &amp; Knowledge Tutorials
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <a
                href={yt.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF0000] text-white text-xs font-bold hover:brightness-110 transition whitespace-nowrap"
              >
                <Youtube className="w-4 h-4" />
                Subscribe to 2MR on YouTube
              </a>
              <a
                href={yt.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-[#071426] dark:text-white hover:border-[#258BFF] transition whitespace-nowrap"
              >
                Visit Channel <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {ytChannelVideos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              {ytChannelVideos.slice(0, 3).map((v) => (
                <button
                  key={v.externalVideoId}
                  type="button"
                  onClick={async () => {
                    try {
                      const imported = await apiFetch<{ video: { id: string } }>('/api/videos/import-youtube', {
                        method: 'POST',
                        body: JSON.stringify(v),
                      });
                      navigate(`/videos/${imported.video.id}`);
                    } catch {
                      window.open(v.videoUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="text-left rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] hover:border-[#258BFF] transition"
                >
                  {v.thumbnailUrl && (
                    <img
                      src={v.thumbnailUrl}
                      alt={v.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-36 object-cover"
                    />
                  )}
                  <div className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-[#8793A5]">
                      <span>{v.channel}</span>
                      <span className="font-mono tabular-nums">{v.duration}</span>
                    </div>
                    <h3 className="text-sm font-bold text-[#071426] dark:text-white line-clamp-2">{v.title}</h3>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#8793A5]">
              <span>
                {ytConfigured
                  ? ytNotice || 'No public uploads are currently listed on the official YouTube channel.'
                  : 'Connect YOUTUBE_API_KEY in server configuration to stream live official channel uploads directly inside 2MR.'}
              </span>
              <a
                href={yt.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#258BFF] hover:underline shrink-0"
              >
                Open {yt.channelHandle} on YouTube →
              </a>
            </div>
          )}
        </section>

        {/* SECTION 6: WHY CHOOSE 2MR */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <ShieldCheck className="w-6 h-6 text-[#258BFF] dark:text-[#B7F34A]" />
            <h3 className="font-bold text-lg text-[#071426] dark:text-white">Source Transparency</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Every synthesis separates established consensus from conflicting findings and explicitly links retrieved open-access sources.
            </p>
          </div>
          <div className="space-y-2">
            <Globe className="w-6 h-6 text-[#258BFF] dark:text-[#B7F34A]" />
            <h3 className="font-bold text-lg text-[#071426] dark:text-white">Global & Accessible</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Built for students, analysts, universities, and independent researchers worldwide with accessible Free and Premium tiers.
            </p>
          </div>
          <div className="space-y-2">
            <BookOpen className="w-6 h-6 text-[#258BFF] dark:text-[#B7F34A]" />
            <h3 className="font-bold text-lg text-[#071426] dark:text-white">Structured Output</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Export ready-to-submit research outlines, literature reviews, and citations directly to PDF and Word (.docx).
            </p>
          </div>
        </section>

        {/* SECTION 7: FREE VS PREMIUM PREVIEW */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-[#071426] dark:text-white">Free Explorer</h3>
              <span className="text-2xl font-extrabold text-[#071426] dark:text-white tabular-nums">$0</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-[#8793A5]">
              Global multi-source search, personal library, and foundational research tools supported by clearly labelled ads.
            </p>
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#258BFF]" /> Live CrossRef, arXiv & Wikipedia search</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#258BFF]" /> 50 AI Ask & Research Intelligence queries / month</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#258BFF]" /> Personal My Knowledge library (1 GB)</li>
            </ul>
            <Link
              to="/register"
              className="inline-block px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold hover:border-[#258BFF] transition"
            >
              Get Started Free
            </Link>
          </div>

          <div className="p-7 rounded-2xl border-2 border-[#258BFF] dark:border-[#B7F34A] bg-white dark:bg-[#10243D] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-[#071426] dark:text-white">2MR Premium</h3>
              <span className="text-2xl font-extrabold text-[#258BFF] dark:text-[#B7F34A] tabular-nums">
                25,000 RWF<span className="text-xs font-normal text-[#8793A5]"> / mo</span>
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-[#8793A5]">
              100% ad-free research workstation with expanded AI capacity, full DOCX/PDF exports, and unlimited Knowledge Maps.
            </p>
            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#B7F34A]" /> Zero advertisements platform-wide</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#B7F34A]" /> 5,000 AI Ask & Deep Comparison queries / month</li>
              <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#B7F34A]" /> MTN Mobile Money Rwanda & Card checkout</li>
            </ul>
            <Link
              to="/pricing"
              className="inline-block px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-sm font-bold hover:brightness-95 transition"
            >
              Compare Plans & Upgrade
            </Link>
          </div>
        </section>

        {/* SECTION 8: FINAL CTA */}
        <section className="rounded-2xl bg-[#071426] border border-slate-800 text-white p-8 sm:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <h2 className="text-2xl sm:text-3xl font-extrabold">Ready to master your next research topic?</h2>
            <p className="text-sm text-slate-300">
              Start searching across verified scholarly repositories or open a new project in 2MR Research Builder.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link
              to="/search"
              className="px-5 py-3 rounded-xl bg-[#258BFF] text-white text-sm font-semibold hover:brightness-110"
            >
              Launch Global Search
            </Link>
            <Link
              to="/feedback"
              className="px-5 py-3 rounded-xl border border-slate-700 text-slate-200 text-sm font-semibold hover:border-[#B7F34A]"
            >
              Share Feedback
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};
