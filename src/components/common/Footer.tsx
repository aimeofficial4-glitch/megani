import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, Globe, Youtube, Cookie } from 'lucide-react';
import { useOfficialYouTube } from './YouTubeBadgeLink';
import { useConsent } from '../../context/ConsentContext';
import { useApp } from '../../context/AppContext';

export const Footer: React.FC = () => {
  const yt = useOfficialYouTube();
  const { openCustomizeModal } = useConsent();
  const { user } = useApp();
  return (
    <footer className="no-print border-t border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#071426] text-slate-600 dark:text-[#8793A5]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Column */}
          <div className="md:col-span-1 space-y-3">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <div className="h-10 w-14 rounded-lg bg-[#071426] border border-slate-700 p-0.5 flex items-center justify-center">
                <img
                  src="/assets/aistudio/2MR_Global_Research_Badge_bf1478c8.png"
                  alt="2MR To Master Research"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <div className="font-extrabold text-[#071426] dark:text-white text-base">2MR</div>
                <div className="text-[11px] font-medium text-[#258BFF] dark:text-[#B7F34A]">
                  To Master Research
                </div>
              </div>
            </Link>
            <p className="text-xs leading-relaxed">
              Discover More. Understand Better. Global Knowledge & Research Platform founded by Gihozo Aime.
            </p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#258BFF]" />
                <a href="mailto:2mr@proton.me" className="hover:text-[#258BFF]">
                  2mr@proton.me
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#258BFF]" />
                <span>0780558358</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-[#258BFF]" />
                <span>Global Research Platform</span>
              </div>
              <div className="pt-1">
                <a
                  href={yt.channelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#10243D] text-[#071426] dark:text-white font-semibold hover:border-[#FF0000]/60 transition"
                >
                  <img
                    src={yt.badgeImagePath}
                    alt="2MR Official YouTube"
                    className="w-5 h-5 rounded object-contain bg-[#071426]"
                  />
                  <Youtube className="w-3.5 h-3.5 text-[#FF0000]" />
                  <span>YouTube ({yt.channelHandle})</span>
                </a>
              </div>
            </div>
          </div>

          {/* Discovery & Tools */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#071426] dark:text-white mb-3">
              Research Tools
            </h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/search" className="hover:text-[#258BFF]">Global Search</Link></li>
              <li><Link to="/research" className="hover:text-[#258BFF]">Research Intelligence</Link></li>
              <li><Link to="/ask" className="hover:text-[#258BFF]">Ask 2MR AI</Link></li>
              <li><Link to="/research-builder" className="hover:text-[#258BFF]">Research Builder</Link></li>
              <li><Link to="/videos" className="hover:text-[#258BFF]">Video Intelligence</Link></li>
              <li><Link to="/knowledge-map" className="hover:text-[#258BFF]">Knowledge Map</Link></li>
            </ul>
          </div>

          {/* Platform & Company */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#071426] dark:text-white mb-3">
              Platform
            </h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/explore" className="hover:text-[#258BFF]">Explore Topics</Link></li>
              <li><Link to="/categories" className="hover:text-[#258BFF]">Browse Categories</Link></li>
              <li><Link to="/my-knowledge" className="hover:text-[#258BFF]">My Knowledge</Link></li>
              <li><Link to="/my-knowledge/notes" className="hover:text-[#258BFF]">Notes & Docs</Link></li>
              <li><Link to="/pricing" className="hover:text-[#258BFF]">Free & Premium Plans</Link></li>
              <li><Link to="/about" className="hover:text-[#258BFF]">About 2MR</Link></li>
            </ul>
          </div>

          {/* Support & Governance */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#071426] dark:text-white mb-3">
              Support & Legal
            </h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/contact" className="hover:text-[#258BFF]">Contact Team</Link></li>
              <li><Link to="/help" className="hover:text-[#258BFF]">Help Center</Link></li>
              <li>
                <Link to="/feedback" className="font-semibold text-[#258BFF] dark:text-[#B7F34A] hover:underline">
                  Give Feedback
                </Link>
              </li>
              <li><Link to="/privacy" className="hover:text-[#258BFF]">Privacy Policy</Link></li>
              <li>
                <button
                  type="button"
                  onClick={openCustomizeModal}
                  className="inline-flex items-center gap-1.5 hover:text-[#258BFF] text-left"
                >
                  <Cookie className="w-3.5 h-3.5 text-[#258BFF]" />
                  Cookie Settings
                </button>
              </li>
              {user && (
                <li>
                  <Link to="/dashboard/settings/privacy" className="hover:text-[#258BFF]">
                    Privacy Settings
                  </Link>
                </li>
              )}
              <li><Link to="/terms" className="hover:text-[#258BFF]">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <p>© {new Date().getFullYear()} 2MR – To Master Research. Founder & CEO: Gihozo Aime. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/privacy" className="hover:text-[#258BFF]">Privacy</Link>
            <button type="button" onClick={openCustomizeModal} className="hover:text-[#258BFF]">
              Cookie Settings
            </button>
            <Link to="/terms" className="hover:text-[#258BFF]">Terms</Link>
            <Link to="/feedback" className="hover:text-[#258BFF]">Feedback</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
