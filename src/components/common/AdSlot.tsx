import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useConsent } from '../../context/ConsentContext';
import { apiFetch } from '../../services/api';
import { AdCampaignItem } from '../../types';

interface AdSlotProps {
  type?: 'banner' | 'sponsored-result' | 'pre-roll';
  className?: string;
}

export const AdSlot: React.FC<AdSlotProps> = ({ type = 'banner', className = '' }) => {
  const { user } = useApp();
  const { consent } = useConsent();
  const [ad, setAd] = useState<AdCampaignItem | null>(null);

  const isAdFree = user?.role === 'premium' || user?.role === 'admin';
  const advertisingAllowed = consent?.advertising === true;

  useEffect(() => {
    if (isAdFree || !advertisingAllowed) {
      setAd(null);
      return;
    }

    let cancelled = false;
    apiFetch<{ ad: AdCampaignItem | null; adFree: boolean }>(`/api/ads/serve?type=${type}`)
      .then((res) => {
        if (cancelled || res.adFree || !res.ad) return;
        setAd(res.ad);
        apiFetch('/api/ads/event', {
          method: 'POST',
          body: JSON.stringify({ campaignId: res.ad.id, eventType: 'impression' }),
        }).catch(() => {});
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [type, isAdFree, advertisingAllowed]);

  if (isAdFree || !advertisingAllowed || !ad) return null;

  const handleClick = () => {
    if (!advertisingAllowed) return;
    apiFetch('/api/ads/event', {
      method: 'POST',
      body: JSON.stringify({ campaignId: ad.id, eventType: 'click' }),
    }).catch(() => {});
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#10243D] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${className}`}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#8793A5]">
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#071426] border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
            Sponsored · 2MR Ads
          </span>
          <span>{ad.advertiserName}</span>
        </div>
        <h4 className="text-sm font-bold text-[#071426] dark:text-white">{ad.headline}</h4>
        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{ad.description}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/pricing"
          className="text-[11px] font-medium text-[#8793A5] hover:text-[#258BFF] inline-flex items-center gap-1"
        >
          <Sparkles className="w-3 h-3" />
          Go Ad-Free
        </Link>
        <a
          href={ad.ctaUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#258BFF] text-white text-xs font-semibold hover:brightness-110 transition"
        >
          {ad.ctaText}
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};
