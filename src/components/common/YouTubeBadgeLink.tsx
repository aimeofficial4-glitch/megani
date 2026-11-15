import React, { useEffect, useState } from 'react';
import { ExternalLink, Youtube } from 'lucide-react';
import { apiFetch } from '../../services/api';

export interface OfficialYouTubeInfo {
  channelName: string;
  channelHandle: string;
  channelUrl: string;
  badgeImagePath: string;
  autoFetchVideos: boolean;
}

const DEFAULT_YT: OfficialYouTubeInfo = {
  channelName: '2MR – To Master Research',
  channelHandle: '@2mr-z5',
  channelUrl: 'https://www.youtube.com/@2mr-z5',
  badgeImagePath: '/assets/aistudio/2MR_Global_Research_Badge_bf1478c8.png',
  autoFetchVideos: true,
};

let cachedSettings: OfficialYouTubeInfo | null = null;

export function useOfficialYouTube(): OfficialYouTubeInfo {
  const [info, setInfo] = useState<OfficialYouTubeInfo>(cachedSettings || DEFAULT_YT);

  useEffect(() => {
    if (cachedSettings) return;
    apiFetch<{ youtube: OfficialYouTubeInfo }>('/api/social-settings')
      .then((res) => {
        if (res?.youtube) {
          cachedSettings = res.youtube;
          setInfo(res.youtube);
        }
      })
      .catch(() => {});
  }, []);

  return info;
}

export const YouTubeBadgeLink: React.FC<{ variant?: 'compact' | 'card' }> = ({ variant = 'compact' }) => {
  const yt = useOfficialYouTube();

  if (variant === 'compact') {
    return (
      <a
        href={yt.channelUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Official 2MR YouTube Channel (${yt.channelHandle})`}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#10243D] hover:border-[#FF0000]/60 text-xs font-semibold text-[#071426] dark:text-white transition-colors whitespace-nowrap shrink-0"
      >
        <Youtube className="w-4 h-4 text-[#FF0000] shrink-0" />
        <span className="hidden lg:inline">{yt.channelHandle}</span>
      </a>
    );
  }

  return (
    <a
      href={yt.channelUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#071426] hover:border-[#258BFF] transition-colors"
    >
      <div className="w-11 h-11 rounded-lg bg-[#071426] border border-slate-700 p-1 shrink-0 overflow-hidden flex items-center justify-center">
        <img
          src={yt.badgeImagePath || '/assets/aistudio/2MR_Global_Research_Badge_bf1478c8.png'}
          alt={`${yt.channelName} official badge`}
          className="w-full h-full object-contain"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-bold text-[#071426] dark:text-white truncate">
          <Youtube className="w-4 h-4 text-[#FF0000] shrink-0" />
          <span className="truncate">{yt.channelName}</span>
        </div>
        <p className="text-xs text-[#8793A5] truncate">Official YouTube Channel · {yt.channelHandle}</p>
      </div>
      <ExternalLink className="w-4 h-4 text-[#8793A5] group-hover:text-[#258BFF] shrink-0" />
    </a>
  );
};
