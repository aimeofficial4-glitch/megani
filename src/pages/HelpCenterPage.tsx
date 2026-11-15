import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, HelpCircle } from 'lucide-react';

const FAQS = [
  {
    q: 'How does 2MR verify search results and citations?',
    a: '2MR queries permitted open-access scholarly and reference APIs (CrossRef, arXiv, Wikipedia, and our curated database index) in real time. AI syntheses strictly cite retrieved records and flag empty or unverified claims.',
  },
  {
    q: 'What is the difference between Ask 2MR and Research Intelligence?',
    a: 'Ask 2MR is a conversational research assistant for direct answers and follow-up questions with saved thread history. Research Intelligence produces a structured 11-section report including Source Agreement & Disagreement matrices.',
  },
  {
    q: 'How do I export a research paper from Research Builder?',
    a: 'Open the 9. Final Report section inside Research Builder and click "Download Word (.docx)" for a formatted .docx document or "Print / Save PDF" for clean print layout.',
  },
  {
    q: 'How do ads work on Free accounts vs Premium?',
    a: 'Guest and Free accounts see clearly labelled 2MR Ads banners, sponsored search cards, or pre-roll cards. Premium subscribers experience zero advertisements across the entire platform.',
  },
  {
    q: 'How do I pay with MTN Mobile Money Rwanda?',
    a: 'Go to Pricing -> Upgrade, select MTN Mobile Money, and enter your Rwanda MTN number. Approve the payment prompt directly on your phone; never share your PIN online.',
  },
];

export const HelpCenterPage: React.FC = () => {
  const [filter, setFilter] = useState('');
  const matched = FAQS.filter(
    (f) =>
      !filter.trim() ||
      f.q.toLowerCase().includes(filter.toLowerCase()) ||
      f.a.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
          <HelpCircle className="w-4 h-4" /> Help Center
        </div>
        <h1 className="text-3xl font-extrabold text-[#071426] dark:text-white">How can we help?</h1>
        <div className="relative max-w-md pt-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 mt-1" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search help articles..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#10243D] text-sm"
          />
        </div>
      </div>

      <div className="space-y-4">
        {matched.map((item) => (
          <div
            key={item.q}
            className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2"
          >
            <h2 className="font-bold text-base text-[#071426] dark:text-white">{item.q}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>

      <div className="p-6 rounded-2xl bg-[#071426] text-white border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold">Still need help or found an issue?</h3>
          <p className="text-xs text-[#8793A5]">Contact 2mr@proton.me or submit tracked feedback.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/contact" className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold">
            Contact Support
          </Link>
          <Link to="/feedback" className="px-4 py-2 rounded-xl bg-[#B7F34A] text-[#071426] text-xs font-bold">
            Give Feedback
          </Link>
        </div>
      </div>
    </div>
  );
};
