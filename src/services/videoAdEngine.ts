import crypto from 'crypto';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  adClicks,
  adImpressions,
  advertisementEvents,
  advertisements,
  platformSettings,
  videoAdSettings,
} from '../db/schema.ts';

export interface GlobalVideoAdConfig {
  globalAdsEnabled: boolean;
  showAdsToFreeUsers: boolean;
  showAdsToGuests: boolean;
  adFreeForPremiumAndAdmin: boolean;
  defaultVideoAdMode: 'ads_enabled' | 'ads_disabled';
  defaultPreRollEnabled: boolean;
  defaultMidRollEnabled: boolean;
  defaultPostRollEnabled: boolean;
  defaultBannerEnabled: boolean;
  defaultSponsoredRecEnabled: boolean;
  defaultMidRollIntervalSeconds: number;
  defaultMaxAdsPerView: number;
  globalMinSpacingSeconds: number;
}

export const DEFAULT_GLOBAL_VIDEO_AD_CONFIG: GlobalVideoAdConfig = {
  globalAdsEnabled: true,
  showAdsToFreeUsers: true,
  showAdsToGuests: true,
  adFreeForPremiumAndAdmin: true,
  defaultVideoAdMode: 'ads_enabled',
  defaultPreRollEnabled: true,
  defaultMidRollEnabled: true,
  defaultPostRollEnabled: true,
  defaultBannerEnabled: true,
  defaultSponsoredRecEnabled: true,
  defaultMidRollIntervalSeconds: 300,
  defaultMaxAdsPerView: 3,
  globalMinSpacingSeconds: 180,
};

const GLOBAL_VIDEO_ADS_KEY = 'global_video_ads';

export async function getGlobalVideoAdConfig(): Promise<GlobalVideoAdConfig> {
  try {
    const [row] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.settingKey, GLOBAL_VIDEO_ADS_KEY))
      .limit(1);
    if (row?.settingValue && typeof row.settingValue === 'object') {
      return {
        ...DEFAULT_GLOBAL_VIDEO_AD_CONFIG,
        ...(row.settingValue as Partial<GlobalVideoAdConfig>),
      };
    }
  } catch {
    // fallback to safe defaults
  }
  return DEFAULT_GLOBAL_VIDEO_AD_CONFIG;
}

export async function updateGlobalVideoAdConfig(
  patch: Partial<GlobalVideoAdConfig>,
  updatedByEmail: string
): Promise<GlobalVideoAdConfig> {
  const current = await getGlobalVideoAdConfig();
  const next: GlobalVideoAdConfig = {
    ...current,
    globalAdsEnabled: patch.globalAdsEnabled ?? current.globalAdsEnabled,
    showAdsToFreeUsers: patch.showAdsToFreeUsers ?? current.showAdsToFreeUsers,
    showAdsToGuests: patch.showAdsToGuests ?? current.showAdsToGuests,
    adFreeForPremiumAndAdmin: patch.adFreeForPremiumAndAdmin ?? current.adFreeForPremiumAndAdmin,
    defaultVideoAdMode:
      patch.defaultVideoAdMode === 'ads_disabled'
        ? 'ads_disabled'
        : patch.defaultVideoAdMode === 'ads_enabled'
          ? 'ads_enabled'
          : current.defaultVideoAdMode,
    defaultPreRollEnabled: patch.defaultPreRollEnabled ?? current.defaultPreRollEnabled,
    defaultMidRollEnabled: patch.defaultMidRollEnabled ?? current.defaultMidRollEnabled,
    defaultPostRollEnabled: patch.defaultPostRollEnabled ?? current.defaultPostRollEnabled,
    defaultBannerEnabled: patch.defaultBannerEnabled ?? current.defaultBannerEnabled,
    defaultSponsoredRecEnabled: patch.defaultSponsoredRecEnabled ?? current.defaultSponsoredRecEnabled,
    defaultMidRollIntervalSeconds: Math.max(
      30,
      Number(patch.defaultMidRollIntervalSeconds ?? current.defaultMidRollIntervalSeconds)
    ),
    defaultMaxAdsPerView: Math.max(
      1,
      Math.min(10, Number(patch.defaultMaxAdsPerView ?? current.defaultMaxAdsPerView))
    ),
    globalMinSpacingSeconds: Math.max(
      15,
      Number(patch.globalMinSpacingSeconds ?? current.globalMinSpacingSeconds)
    ),
  };

  await db
    .insert(platformSettings)
    .values({
      settingKey: GLOBAL_VIDEO_ADS_KEY,
      settingValue: next as unknown as Record<string, unknown>,
      category: 'advertisements',
      updatedBy: updatedByEmail,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettings.settingKey,
      set: {
        settingValue: next as unknown as Record<string, unknown>,
        updatedBy: updatedByEmail,
        updatedAt: new Date(),
      },
    });

  return next;
}

export async function getOrDefaultVideoAdSettings(videoId: string) {
  const [existing] = await db
    .select()
    .from(videoAdSettings)
    .where(eq(videoAdSettings.videoId, videoId))
    .limit(1);

  if (existing) return existing;

  const globalCfg = await getGlobalVideoAdConfig();
  return {
    videoId,
    adMode: 'use_global' as const,
    allowPreRoll: globalCfg.defaultPreRollEnabled,
    allowMidRoll: globalCfg.defaultMidRollEnabled,
    allowPostRoll: globalCfg.defaultPostRollEnabled,
    allowBanner: globalCfg.defaultBannerEnabled,
    allowSponsoredRec: globalCfg.defaultSponsoredRecEnabled,
    midRollIntervalSeconds: globalCfg.defaultMidRollIntervalSeconds,
    maxAdsPerView: globalCfg.defaultMaxAdsPerView,
    updatedByAdminEmail: null,
    updatedAt: null,
  };
}

export function hashViewerIdentity(userId: string | null | undefined, ip: string | undefined, ua: string | undefined): string {
  const raw = userId ? `user:${userId}` : `anon:${ip || '0.0.0.0'}:${(ua || '').slice(0, 60)}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function isWithinSchedule(startDate: string | null, endDate: string | null, todayIso: string): boolean {
  if (startDate && startDate.trim() && todayIso < startDate.trim().slice(0, 10)) return false;
  if (endDate && endDate.trim() && todayIso > endDate.trim().slice(0, 10)) return false;
  return true;
}

function matchesTargeting(
  targetCategories: string[] | null | undefined,
  targetVideoIds: string[] | null | undefined,
  videoId: string,
  categorySlug: string
): boolean {
  const vidList = Array.isArray(targetVideoIds) ? targetVideoIds.filter(Boolean) : [];
  if (vidList.length > 0 && !vidList.includes(videoId)) {
    return false;
  }
  const catList = Array.isArray(targetCategories) && targetCategories.length > 0 ? targetCategories : ['All'];
  if (catList.includes('All') || catList.includes('all')) return true;
  return catList.map((c) => c.toLowerCase()).includes((categorySlug || '').toLowerCase());
}

export async function resolveVideoAdBundle(params: {
  video: {
    id: string;
    categorySlug: string;
    sourcePlatform?: string | null;
    durationSeconds?: number | null;
  };
  userRole: string | null | undefined;
  userId: string | null | undefined;
  consentAdvertising: boolean;
  viewerSessionHash: string;
}) {
  const globalCfg = await getGlobalVideoAdConfig();
  const perVideo = await getOrDefaultVideoAdSettings(params.video.id);

  // 1. Premium & Admin accounts remain ad-free per 2MR subscription contract
  if (
    globalCfg.adFreeForPremiumAndAdmin &&
    (params.userRole === 'premium' || params.userRole === 'admin')
  ) {
    return {
      adFree: true,
      reason: 'premium_ad_free',
      adsEnabledForVideo: false,
      effectivePolicy: perVideo.adMode,
      settings: perVideo,
      preRoll: null,
      midRoll: null,
      postRoll: null,
      banner: null,
      sponsoredRecommendations: [],
    };
  }

  // 2. Role-level global controls
  if (!params.userId && !globalCfg.showAdsToGuests) {
    return {
      adFree: false,
      reason: 'guest_ads_disabled',
      adsEnabledForVideo: false,
      effectivePolicy: perVideo.adMode,
      settings: perVideo,
      preRoll: null,
      midRoll: null,
      postRoll: null,
      banner: null,
      sponsoredRecommendations: [],
    };
  }
  if (params.userId && params.userRole === 'free' && !globalCfg.showAdsToFreeUsers) {
    return {
      adFree: false,
      reason: 'free_ads_disabled',
      adsEnabledForVideo: false,
      effectivePolicy: perVideo.adMode,
      settings: perVideo,
      preRoll: null,
      midRoll: null,
      postRoll: null,
      banner: null,
      sponsoredRecommendations: [],
    };
  }

  // 3. Per-video Ads Disabled override
  if (perVideo.adMode === 'ads_disabled') {
    return {
      adFree: false,
      reason: 'video_ads_disabled',
      adsEnabledForVideo: false,
      effectivePolicy: 'ads_disabled',
      settings: perVideo,
      preRoll: null,
      midRoll: null,
      postRoll: null,
      banner: null,
      sponsoredRecommendations: [],
    };
  }

  // 4. Global settings check when mode === 'use_global'
  if (
    perVideo.adMode === 'use_global' &&
    (!globalCfg.globalAdsEnabled || globalCfg.defaultVideoAdMode === 'ads_disabled')
  ) {
    return {
      adFree: false,
      reason: 'global_ads_disabled',
      adsEnabledForVideo: false,
      effectivePolicy: 'use_global',
      settings: perVideo,
      preRoll: null,
      midRoll: null,
      postRoll: null,
      banner: null,
      sponsoredRecommendations: [],
    };
  }

  // 5. Cookie consent enforcement
  if (!params.consentAdvertising) {
    return {
      adFree: false,
      consentRequired: true,
      reason: 'advertising_consent_required',
      adsEnabledForVideo: false,
      effectivePolicy: perVideo.adMode,
      settings: perVideo,
      preRoll: null,
      midRoll: null,
      postRoll: null,
      banner: null,
      sponsoredRecommendations: [],
    };
  }

  const is2mrHosted = (params.video.sourcePlatform || '2mr_hosted') === '2mr_hosted';
  const effectiveAllowPreRoll =
    is2mrHosted && (perVideo.adMode === 'ads_enabled' ? perVideo.allowPreRoll : globalCfg.defaultPreRollEnabled);
  const effectiveAllowMidRoll =
    is2mrHosted && (perVideo.adMode === 'ads_enabled' ? perVideo.allowMidRoll : globalCfg.defaultMidRollEnabled);
  const effectiveAllowPostRoll =
    is2mrHosted && (perVideo.adMode === 'ads_enabled' ? perVideo.allowPostRoll : globalCfg.defaultPostRollEnabled);
  const effectiveAllowBanner =
    perVideo.adMode === 'ads_enabled' ? perVideo.allowBanner : globalCfg.defaultBannerEnabled;
  const effectiveAllowSponsoredRec =
    perVideo.adMode === 'ads_enabled' ? perVideo.allowSponsoredRec : globalCfg.defaultSponsoredRecEnabled;

  const todayIso = new Date().toISOString().slice(0, 10);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [allActiveAds, recentImpressions] = await Promise.all([
    db
      .select()
      .from(advertisements)
      .where(eq(advertisements.isActive, true))
      .orderBy(desc(advertisements.createdAt)),
    db
      .select({
        advertisementId: adImpressions.advertisementId,
        createdAt: adImpressions.createdAt,
      })
      .from(adImpressions)
      .where(
        and(
          eq(adImpressions.viewerSessionHash, params.viewerSessionHash),
          gte(adImpressions.createdAt, since24h)
        )
      ),
  ]);

  const countsByAd = new Map<string, number>();
  for (const imp of recentImpressions) {
    countsByAd.set(imp.advertisementId, (countsByAd.get(imp.advertisementId) || 0) + 1);
  }

  const eligible = allActiveAds.filter((ad) => {
    if (!isWithinSchedule(ad.startDate, ad.endDate, todayIso)) return false;
    if (ad.impressionLimit > 0 && ad.impressionsCount >= ad.impressionLimit) return false;
    if (ad.clickLimit > 0 && ad.clicksCount >= ad.clickLimit) return false;
    if (!matchesTargeting(ad.targetCategories, ad.targetVideoIds, params.video.id, params.video.categorySlug)) {
      return false;
    }
    const freqCap = ad.frequencyCapPerUser > 0 ? ad.frequencyCapPerUser : 100;
    const seen = countsByAd.get(ad.id) || 0;
    if (seen >= freqCap) return false;
    return true;
  });

  const formatAd = (ad: typeof eligible[number]) => ({
    id: ad.id,
    campaignId: ad.campaignId,
    title: ad.title,
    sponsorName: ad.sponsorName,
    placement: ad.placement,
    headline: ad.headline,
    description: ad.description,
    mediaUrl: ad.mediaUrl,
    ctaText: ad.ctaText,
    ctaUrl: ad.ctaUrl,
    minSpacingSeconds: ad.minSpacingSeconds,
    sponsoredLabel: 'Sponsored · 2MR Ads',
  });

  const preRollRow = effectiveAllowPreRoll ? eligible.find((a) => a.placement === 'pre_roll') : undefined;
  const midRollRow =
    effectiveAllowMidRoll && (!params.video.durationSeconds || params.video.durationSeconds >= 60)
      ? eligible.find((a) => a.placement === 'mid_roll')
      : undefined;
  const postRollRow = effectiveAllowPostRoll ? eligible.find((a) => a.placement === 'post_roll') : undefined;
  const bannerRow = effectiveAllowBanner ? eligible.find((a) => a.placement === 'banner') : undefined;
  const sponsoredRows = effectiveAllowSponsoredRec
    ? eligible.filter((a) => a.placement === 'sponsored_recommendation').slice(0, 2)
    : [];

  return {
    adFree: false,
    adsEnabledForVideo: true,
    effectivePolicy: perVideo.adMode,
    settings: {
      ...perVideo,
      midRollIntervalSeconds:
        perVideo.adMode === 'ads_enabled'
          ? perVideo.midRollIntervalSeconds
          : globalCfg.defaultMidRollIntervalSeconds,
      maxAdsPerView:
        perVideo.adMode === 'ads_enabled' ? perVideo.maxAdsPerView : globalCfg.defaultMaxAdsPerView,
      minSpacingSeconds: globalCfg.globalMinSpacingSeconds,
    },
    preRoll: preRollRow ? formatAd(preRollRow) : null,
    midRoll: midRollRow ? formatAd(midRollRow) : null,
    postRoll: postRollRow ? formatAd(postRollRow) : null,
    banner: bannerRow ? formatAd(bannerRow) : null,
    sponsoredRecommendations: sponsoredRows.map(formatAd),
  };
}

export async function recordVideoAdInteraction(params: {
  advertisementId: string;
  videoId?: string | null;
  userId?: string | null;
  placement: string;
  eventType: 'impression' | 'click';
  viewerSessionHash: string;
}) {
  const [ad] = await db
    .select({ id: advertisements.id, campaignId: advertisements.campaignId })
    .from(advertisements)
    .where(eq(advertisements.id, params.advertisementId))
    .limit(1);
  if (!ad) return false;

  if (params.eventType === 'impression') {
    await Promise.all([
      db.insert(adImpressions).values({
        advertisementId: ad.id,
        campaignId: ad.campaignId,
        videoId: params.videoId || null,
        userId: params.userId || null,
        placement: params.placement,
        viewerSessionHash: params.viewerSessionHash,
      }),
      db.insert(advertisementEvents).values({
        advertisementId: ad.id,
        campaignId: ad.campaignId,
        placementCode: params.placement,
        eventType: 'impression',
        userId: params.userId || null,
      }),
      db
        .update(advertisements)
        .set({
          impressionsCount: sql`${advertisements.impressionsCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(advertisements.id, ad.id)),
    ]);
  } else {
    await Promise.all([
      db.insert(adClicks).values({
        advertisementId: ad.id,
        campaignId: ad.campaignId,
        videoId: params.videoId || null,
        userId: params.userId || null,
        placement: params.placement,
        viewerSessionHash: params.viewerSessionHash,
      }),
      db.insert(advertisementEvents).values({
        advertisementId: ad.id,
        campaignId: ad.campaignId,
        placementCode: params.placement,
        eventType: 'click',
        userId: params.userId || null,
      }),
      db
        .update(advertisements)
        .set({
          clicksCount: sql`${advertisements.clicksCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(advertisements.id, ad.id)),
    ]);
  }

  return true;
}
