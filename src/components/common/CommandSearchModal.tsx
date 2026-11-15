import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sparkles, BrainCircuit, Video, Network, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const CommandSearchModal: React.FC = () => {
  const { searchModalOpen, setSearchModalOpen } = useApp();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (searchModalOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [searchModalOpen]);

  if (!searchModalOpen) return null;

  const goTo = (url: string) => {
    setSearchModalOpen(false);
    setQuery('');
    navigate(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    goTo(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#10243D] shadow-2xl overflow-hidden">
        <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-[#258BFF] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles, papers, videos, or jump to a workspace..."
            className="flex-1 bg-transparent text-sm text-[#071426] dark:text-white placeholder:text-[#8793A5] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setSearchModalOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </form>

        <div className="p-4 space-y-3">
          {query.trim() && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => goTo(`/search?q=${encodeURIComponent(query.trim())}`)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-[#071426] hover:border-[#258BFF] border border-slate-200 dark:border-slate-700 text-left text-sm"
              >
                <Search className="w-4 h-4 text-[#258BFF]" />
                <span>Search "{query.trim()}" across sources</span>
              </button>
              <button
                type="button"
                onClick={() => goTo(`/research?topic=${encodeURIComponent(query.trim())}`)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-[#071426] hover:border-[#B7F34A] border border-slate-200 dark:border-slate-700 text-left text-sm"
              >
                <BrainCircuit className="w-4 h-4 text-[#B7F34A]" />
                <span>Analyze "{query.trim()}" in Research Intelligence</span>
              </button>
            </div>
          )}

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8793A5] mb-2">
              Quick Navigation
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <button
                type="button"
                onClick={() => goTo('/ask')}
                className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#071426] text-left"
              >
                <Sparkles className="w-4 h-4 text-[#B7F34A]" />
                <span>Ask 2MR AI</span>
              </button>
              <button
                type="button"
                onClick={() => goTo('/research')}
                className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#071426] text-left"
              >
                <BrainCircuit className="w-4 h-4 text-[#258BFF]" />
                <span>Research Lab</span>
              </button>
              <button
                type="button"
                onClick={() => goTo('/videos')}
                className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#071426] text-left"
              >
                <Video className="w-4 h-4 text-[#258BFF]" />
                <span>Videos</span>
              </button>
              <button
                type="button"
                onClick={() => goTo('/knowledge-map')}
                className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#071426] text-left"
              >
                <Network className="w-4 h-4 text-[#B7F34A]" />
                <span>Knowledge Map</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
