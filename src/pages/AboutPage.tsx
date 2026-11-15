import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Globe,
  BookOpen,
  Mail,
  Phone,
  Calendar,
  Megaphone,
  Layers,
  Languages,
} from 'lucide-react';
import avatarResearcherImg from '../assets/images/avatar_researcher_profile_1794549073513.jpg';
import { YouTubeBadgeLink, useOfficialYouTube } from '../components/common/YouTubeBadgeLink';
import { apiFetch } from '../services/api';

interface BrandFeature {
  name: string;
  description: string;
}

interface BrandKnowledgePayload {
  officialName: string;
  shortName: string;
  acronymMeaning: string;
  founderName: string;
  founderTitle: string;
  founderBio: string;
  slogan: string;
  vision: string;
  mission: string;
  purpose: string;
  originStory: string;
  coreFeatures: BrandFeature[];
  supportedLanguages: string[];
  officialFoundingDate: string | null;
  publicLaunchDate: string | null;
  developmentStartDate: string | null;
  contactEmail: string;
  contactPhone: string;
}

interface BrandAnnouncement {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  announcementDate: string;
}

const DEFAULT_BRAND: BrandKnowledgePayload = {
  officialName: '2MR – To Master Research',
  shortName: '2MR',
  acronymMeaning: 'To Master Research',
  founderName: 'Gihozo Aime',
  founderTitle: 'Founder & Chief Executive Officer',
  founderBio:
    'Gihozo Aime is the founder and creator of 2MR – To Master Research, leading 2MR’s mission to empower students, independent analysts, universities, and institutions worldwide with transparent, source-verified discovery tools.',
  slogan: 'Discover More. Understand Better.',
  vision: 'Global Research Platform.',
  mission:
    'To make deep research, evidence comparison, and structured learning accessible to everyone through reliable, source-verified intelligence.',
  purpose:
    'To help people discover information, conduct research, understand complex topics, analyze knowledge, and organize research.',
  originStory:
    '2MR – To Master Research was founded on 9 November 2026 by Gihozo Aime to help people discover reliable information, conduct rigorous research, compare sources, and organize knowledge inside one global platform.',
  coreFeatures: [
    {
      name: '2MR Research Intelligence',
      description: 'Multi-source deep research synthesis comparing evidence, agreements, and verified citations.',
    },
    {
      name: '2MR Ask',
      description: 'Conversational AI research assistant delivering real-time streaming answers grounded in sources.',
    },
    {
      name: '2MR Research Builder',
      description: 'Structured workspace for objectives, methodologies, literature reviews, and Word (.docx) exports.',
    },
    {
      name: '2MR Video Intelligence',
      description: 'Educational video discovery, transcript extraction, AI study summaries, and interactive Q&A.',
    },
    {
      name: '2MR Knowledge Map',
      description: 'Interactive visual concept mapping connecting ideas, definitions, and relationships.',
    },
    {
      name: '2MR My Knowledge',
      description: 'Personal research library, structured notes, collections, and AI-assisted organization.',
    },
  ],
  supportedLanguages: ['English', 'Kinyarwanda', 'French', 'Swahili', 'Spanish'],
  officialFoundingDate: '2026-11-09',
  publicLaunchDate: null,
  developmentStartDate: null,
  contactEmail: '2mr@proton.me',
  contactPhone: '0780558358',
};

const FEATURE_ROUTES: Record<string, string> = {
  '2MR Research Intelligence': '/research',
  '2MR Ask': '/ask',
  '2MR Research Builder': '/research-builder',
  '2MR Video Intelligence': '/videos',
  '2MR Knowledge Map': '/knowledge-map',
  '2MR My Knowledge': '/my-knowledge',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatHumanDate(iso: string | null | undefined): string | null {
  const s = String(iso || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  const idx = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (idx < 0 || idx > 11) return s;
  return `${day} ${MONTHS[idx]} ${m[1]}`;
}

export const AboutPage: React.FC = () => {
  const yt = useOfficialYouTube();
  const [brand, setBrand] = useState<BrandKnowledgePayload>(DEFAULT_BRAND);
  const [announcements, setAnnouncements] = useState<BrandAnnouncement[]>([]);

  useEffect(() => {
    let mounted = true;
    apiFetch<{ brand?: BrandKnowledgePayload; announcements?: BrandAnnouncement[] }>('/api/brand-knowledge')
      .then((res) => {
        if (!mounted) return;
        if (res?.brand) setBrand(res.brand);
        if (Array.isArray(res?.announcements)) setAnnouncements(res.announcements);
      })
      .catch(() => {
        // Keep verified fallback on transient error
      });
    return () => {
      mounted = false;
    };
  }, []);

  const foundingLabel = formatHumanDate(brand.officialFoundingDate);
  const launchLabel = formatHumanDate(brand.publicLaunchDate);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-12">
      <div className="space-y-4">
        <span className="text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
          About {brand.officialName}
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#071426] dark:text-white leading-tight">
          {brand.slogan} — {brand.mission}
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
          {brand.originStory}
        </p>

        {/* Verified Official Key Facts */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">
              <Calendar className="w-3.5 h-3.5 text-[#258BFF]" />
              Official Founding Date
            </div>
            <p className="text-sm font-bold text-[#071426] dark:text-white mt-1 tabular-nums">
              {foundingLabel || 'Not yet publicly confirmed'}
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">
              <Calendar className="w-3.5 h-3.5 text-[#B7F34A]" />
              Public Launch Date
            </div>
            <p className="text-sm font-bold text-[#071426] dark:text-white mt-1 tabular-nums">
              {launchLabel || 'Not yet publicly confirmed'}
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D]">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8793A5]">
              <Languages className="w-3.5 h-3.5 text-[#258BFF]" />
              Supported Languages
            </div>
            <p className="text-sm font-bold text-[#071426] dark:text-white mt-1">
              {brand.supportedLanguages.join(', ')}
            </p>
          </div>
        </div>
      </div>

      {/* Founder & Leadership */}
      <section className="p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] flex flex-col sm:flex-row items-center gap-6">
        <img
          src={avatarResearcherImg}
          alt={`${brand.founderName} - ${brand.founderTitle} of ${brand.shortName}`}
          className="w-24 h-24 rounded-2xl object-cover border border-slate-700 shrink-0"
        />
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#258BFF] dark:text-[#B7F34A]">
            {brand.founderTitle}
          </span>
          <h2 className="text-2xl font-bold text-[#071426] dark:text-white">{brand.founderName}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{brand.founderBio}</p>
          <div className="flex flex-wrap gap-4 pt-1 text-xs text-[#8793A5]">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#258BFF]" /> {brand.contactEmail}
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Phone className="w-3.5 h-3.5 text-[#258BFF]" /> {brand.contactPhone}
            </span>
          </div>
        </div>
      </section>

      {/* Vision, Honesty & Purpose */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2">
          <Globe className="w-6 h-6 text-[#258BFF]" />
          <h3 className="font-bold text-[#071426] dark:text-white">Our Vision</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {brand.vision} Where learners and researchers move seamlessly from discovery to verified understanding.
          </p>
        </div>
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2">
          <ShieldCheck className="w-6 h-6 text-[#B7F34A]" />
          <h3 className="font-bold text-[#071426] dark:text-white">Intellectual Honesty</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Every AI synthesis surfaces primary sources, highlights disagreements across literature, and flags claims needing verification.
          </p>
        </div>
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-2">
          <BookOpen className="w-6 h-6 text-[#258BFF]" />
          <h3 className="font-bold text-[#071426] dark:text-white">Our Purpose</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">{brand.purpose}</p>
        </div>
      </div>

      {/* Six Core Features */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#258BFF]" />
          <h2 className="text-xl font-bold text-[#071426] dark:text-white">
            Main {brand.shortName} Workspaces
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {brand.coreFeatures.map((feat, idx) => {
            const targetRoute = FEATURE_ROUTES[feat.name] || '/ask';
            return (
              <Link
                key={feat.name}
                to={targetRoute}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] hover:border-[#258BFF] transition-colors space-y-1.5"
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#258BFF] tabular-nums">
                  0{idx + 1}
                </span>
                <h3 className="text-sm font-bold text-[#071426] dark:text-white">{feat.name}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {feat.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Official Announcements */}
      {announcements.length > 0 && (
        <section
          id="announcements"
          className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4"
        >
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#258BFF]" />
            <h2 className="text-lg font-bold text-[#071426] dark:text-white">
              Official {brand.shortName} Announcements
            </h2>
          </div>
          <div className="space-y-3">
            {announcements.map((ann) => (
              <article
                key={ann.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F5F7FA] dark:bg-[#071426] space-y-1.5"
              >
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#8793A5]">
                  <span className="tabular-nums text-[#258BFF]">{ann.announcementDate}</span>
                  <span>· {ann.category.replace('_', ' ')}</span>
                </div>
                <h3 className="text-sm font-bold text-[#071426] dark:text-white">{ann.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{ann.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Official YouTube Channel */}
      <section className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#10243D] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-[#071426] dark:text-white">Official 2MR YouTube Channel</h2>
            <p className="text-sm text-slate-600 dark:text-[#8793A5]">
              Follow research briefings, method walkthroughs, and global discovery sessions on {yt.channelHandle}.
            </p>
          </div>
          <a
            href={yt.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-xl bg-[#FF0000] text-white text-xs font-bold hover:brightness-110 whitespace-nowrap shrink-0"
          >
            Subscribe on YouTube
          </a>
        </div>
        <YouTubeBadgeLink variant="card" />
      </section>

      <div className="flex flex-wrap gap-3">
        <Link to="/contact" className="px-5 py-2.5 rounded-xl bg-[#258BFF] text-white text-sm font-semibold">
          Contact 2MR Team
        </Link>
        <Link to="/feedback" className="px-5 py-2.5 rounded-xl bg-[#B7F34A] text-[#071426] text-sm font-bold">
          Share Product Feedback
        </Link>
      </div>
    </div>
  );
};
