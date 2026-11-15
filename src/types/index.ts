export type UserRole = 'free' | 'premium' | 'admin';

export interface AppUser {
  id: string;
  uid: string | null;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  organization: string | null;
  role: UserRole;
  status: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  preferredLanguage: string;
  preferredTheme: 'dark' | 'light';
  aiQueriesUsed: number;
  aiQueriesLimit: number;
  storageUsedMb: number;
  storageLimitMb: number;
}

export interface CategoryItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  subtopics: string[];
  resourceCount: number;
}

export interface SearchResultItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  modality: string;
  sourceName: string;
  publishedDate: string;
  authors: string[];
  keywords: string[];
  doi?: string | null;
  provider?: string;
}

export type VideoStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'processing'
  | 'published'
  | 'archived';

export interface VideoRecord {
  id: string;
  uploaderUserId?: string | null;
  uploaderName?: string | null;
  title: string;
  channel: string;
  description: string;
  categorySlug: string;
  categoryName?: string | null;
  language?: string;
  tags?: string[];
  duration: string;
  durationSeconds?: number;
  videoUrl: string;
  thumbnailUrl: string | null;
  fileSizeBytes?: number;
  mimeType?: string | null;
  malwareScanStatus?: string;
  processingStatus?: string;
  processingError?: string | null;
  rightsConfirmed?: boolean;
  status?: VideoStatus;
  rejectionReason?: string | null;
  viewsCount?: number;
  aiSummary: string | null;
  keyTimestamps: { time: number; label: string; summary: string }[];
  keyConcepts: string[];
  publishedAt: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt?: string;
  sourcePlatform?: string | null;
  externalVideoId?: string | null;
  channelId?: string | null;
  channelUrl?: string | null;
  embedAllowed?: boolean;
  transcriptAvailable?: boolean;
  isFeatured: boolean;
  isPublished: boolean;
}

export interface VideoCategoryRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface VideoReviewRecord {
  id: string;
  videoId: string;
  reviewerEmail: string | null;
  action: string;
  reason: string | null;
  notes: string | null;
  createdAt: string;
}

export interface VideoAdSettingsRecord {
  videoId: string;
  adMode: 'use_global' | 'ads_enabled' | 'ads_disabled';
  allowPreRoll: boolean;
  allowMidRoll: boolean;
  allowPostRoll: boolean;
  allowBanner: boolean;
  allowSponsoredRec: boolean;
  midRollIntervalSeconds: number;
  maxAdsPerView: number;
  updatedByAdminEmail?: string | null;
  updatedAt?: string;
}

export type AdPlacementType =
  | 'pre_roll'
  | 'mid_roll'
  | 'post_roll'
  | 'sponsored_recommendation'
  | 'banner';

export interface VideoAdvertisementRecord {
  id: string;
  campaignId?: string | null;
  advertiserId?: string | null;
  title: string;
  sponsorName: string;
  adFormat: string;
  placement: AdPlacementType;
  headline: string;
  description: string;
  mediaUrl: string | null;
  ctaText: string;
  ctaUrl: string;
  targetCategories: string[];
  targetVideoIds: string[];
  startDate: string | null;
  endDate: string | null;
  budgetUsd: number;
  impressionLimit: number;
  clickLimit: number;
  frequencyCapPerUser: number;
  minSpacingSeconds: number;
  impressionsCount: number;
  clicksCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface VideoTranscriptSegment {
  id: string;
  videoId: string;
  startSeconds: number;
  endSeconds: number;
  speaker: string | null;
  text: string;
}

export interface AdCampaignItem {
  id: string;
  advertiserName: string;
  campaignName: string;
  adType: 'banner' | 'pre-roll' | 'sponsored-result';
  headline: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  targetCategory: string;
  status: 'active' | 'paused' | 'completed';
  startDate?: string | null;
  endDate?: string | null;
  budget: number;
  impressions: number;
  clicks: number;
}

export interface SavedLibraryItem {
  id: string;
  collectionId: string | null;
  type: string;
  title: string;
  url: string | null;
  snippet: string | null;
  notes: string | null;
  category: string;
  tags: string[];
  createdAt: string;
}

export interface CollectionFolder {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  category: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}
