import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. Users & RBAC
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: text('uid').unique(),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    passwordHash: text('password_hash'),
    avatarUrl: text('avatar_url'),
    organization: text('organization'),
    role: text('role').notNull().default('free'), // 'free' | 'premium' | 'admin'
    status: text('status').notNull().default('active'), // 'active' | 'suspended'
    emailVerified: boolean('email_verified').notNull().default(false),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    preferredLanguage: text('preferred_language').notNull().default('en'),
    preferredTheme: text('preferred_theme').notNull().default('dark'),
    aiQueriesUsed: integer('ai_queries_used').notNull().default(0),
    aiQueriesLimit: integer('ai_queries_limit').notNull().default(50),
    storageUsedMb: integer('storage_used_mb').notNull().default(0),
    storageLimitMb: integer('storage_limit_mb').notNull().default(1024),
    resetTokenHash: text('reset_token_hash'),
    resetTokenExpiresAt: timestamp('reset_token_expires_at'),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    accountType: text('account_type').notNull().default('REAL'), // 'REAL' | 'DEMO'
    country: text('country'),
    city: text('city'),
    activityStatus: text('activity_status').notNull().default('active'), // 'active' | 'inactive'
    registrationSource: text('registration_source').notNull().default('web'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('users_email_idx').on(table.email),
    index('users_role_idx').on(table.role),
    index('users_synth_created_idx').on(table.isSynthetic, table.createdAt),
    index('users_synth_role_act_idx').on(table.isSynthetic, table.role, table.activityStatus),
    index('users_synth_country_idx').on(table.isSynthetic, table.country),
  ]
);

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  description: text('description'),
});

export const userRoles = pgTable('user_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  roleId: uuid('role_id')
    .references(() => roles.id, { onDelete: 'cascade' })
    .notNull(),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('sessions_user_idx').on(table.userId),
    index('sessions_expires_idx').on(table.expiresAt),
  ]
);

// 2. Plans, Subscriptions & Payments
export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  monthlyPriceUsd: integer('monthly_price_usd').notNull().default(0),
  annualPriceUsd: integer('annual_price_usd').notNull().default(0),
  monthlyPriceRwf: integer('monthly_price_rwf').notNull().default(0),
  annualPriceRwf: integer('annual_price_rwf').notNull().default(0),
  aiMonthlyLimit: integer('ai_monthly_limit').notNull().default(50),
  storageLimitMb: integer('storage_limit_mb').notNull().default(1024),
  adFree: boolean('ad_free').notNull().default(false),
  features: jsonb('features').$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    planId: uuid('plan_id')
      .references(() => plans.id)
      .notNull(),
    activatedByPaymentId: uuid('activated_by_payment_id'),
    status: text('status').notNull().default('active'), // 'active' | 'expired' | 'cancelled'
    billingCycle: text('billing_cycle').notNull().default('monthly'), // 'monthly' | 'annual'
    startsAt: timestamp('starts_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    autoRenew: boolean('auto_renew').notNull().default(false),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('subscriptions_user_idx').on(table.userId),
    index('subscriptions_payment_idx').on(table.activatedByPaymentId),
    index('subscriptions_synth_idx').on(table.isSynthetic, table.status, table.createdAt),
  ]
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
    transactionRef: text('transaction_ref').notNull().unique(), // UUID v4 X-Reference-Id
    externalId: text('external_id'),
    idempotencyKey: text('idempotency_key'),
    providerRef: text('provider_ref'), // MTN financialTransactionId
    phoneMasked: text('phone_masked'),
    payerMsisdnHash: text('payer_msisdn_hash'), // HMAC-SHA256 for payer identity verification
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('RWF'),
    provider: text('provider').notNull(), // 'mtn_momo_rw' | 'card_gateway'
    environment: text('environment').notNull().default('sandbox'), // 'sandbox' | 'production'
    status: text('status').notNull().default('pending'), // 'pending' | 'successful' | 'failed' | 'rejected' | 'expired' | 'cancelled' | 'requires_reconciliation'
    reconciliationStatus: text('reconciliation_status').notNull().default('not_needed'), // 'not_needed' | 'pending' | 'reconciled' | 'mismatch' | 'failed'
    planSlug: text('plan_slug').notNull(),
    billingCycle: text('billing_cycle').notNull(),
    failureReason: text('failure_reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    isDemoTransaction: boolean('is_demo_transaction').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastCheckedAt: timestamp('last_checked_at'),
    reconciledAt: timestamp('reconciled_at'),
    expiresAt: timestamp('expires_at'),
    verifiedAt: timestamp('verified_at'),
  },
  (table) => [
    index('payments_user_idx').on(table.userId),
    index('payments_status_idx').on(table.status),
    index('payments_env_status_idx').on(table.environment, table.status),
    index('payments_idempotency_idx').on(table.userId, table.idempotencyKey),
    index('payments_synth_idx').on(table.isSynthetic, table.status, table.createdAt),
  ]
);

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentId: uuid('payment_id')
      .references(() => payments.id, { onDelete: 'cascade' })
      .notNull(),
    transactionRef: text('transaction_ref').notNull(),
    eventType: text('event_type').notNull(), // 'initiated' | 'provider_accepted' | 'provider_declined' | 'status_checked' | 'callback_received' | 'callback_duplicate' | 'reconciliation' | 'subscription_activated' | 'verification_mismatch'
    source: text('source').notNull(), // 'checkout' | 'status_poll' | 'mtn_callback' | 'admin_reconcile'
    previousStatus: text('previous_status'),
    newStatus: text('new_status'),
    payloadHash: text('payload_hash'),
    details: jsonb('details').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('payment_events_payment_idx').on(table.paymentId, table.createdAt),
    index('payment_events_ref_hash_idx').on(table.transactionRef, table.payloadHash),
  ]
);

// 3. Categories & Indexed Documents
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  icon: text('icon').notNull().default('BookOpen'),
  subtopics: jsonb('subtopics').$type<string[]>().default([]),
  resourceCount: integer('resource_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const indexedDocuments = pgTable(
  'indexed_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    domain: text('domain').notNull(),
    snippet: text('snippet').notNull(),
    modality: text('modality').notNull().default('research'), // 'websites' | 'images' | 'videos' | 'news' | 'academic' | 'research'
    sourceName: text('source_name').notNull(),
    publishedDate: text('published_date'),
    categorySlug: text('category_slug'),
    authors: jsonb('authors').$type<string[]>().default([]),
    keywords: jsonb('keywords').$type<string[]>().default([]),
    doi: text('doi'),
    isFeatured: boolean('is_featured').notNull().default(false),
    isPublished: boolean('is_published').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('indexed_docs_cat_idx').on(table.categorySlug),
    index('indexed_docs_pub_feat_idx').on(table.isPublished, table.isFeatured, table.createdAt),
  ]
);

export const searchHistory = pgTable(
  'search_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    query: text('query').notNull(),
    modality: text('modality').notNull().default('all'),
    resultsCount: integer('results_count').notNull().default(0),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('search_history_user_idx').on(table.userId),
    index('search_history_created_idx').on(table.createdAt),
    index('search_history_synth_idx').on(table.isSynthetic, table.createdAt),
  ]
);

export const searchSources = pgTable('search_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  searchHistoryId: uuid('search_history_id').references(() => searchHistory.id, {
    onDelete: 'cascade',
  }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  domain: text('domain'),
  publishedDate: text('published_date'),
});

// 4. Research Builder Projects
export const researchProjects = pgTable(
  'research_projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    topic: text('topic').notNull(),
    objectives: text('objectives').default(''),
    question: text('question').default(''),
    researchType: text('research_type').notNull().default('Systematic Review'),
    description: text('description').default(''),
    hypothesis: text('hypothesis').default(''),
    methodology: text('methodology').default(''),
    literatureReview: text('literature_review').default(''),
    outline: jsonb('outline').$type<string[]>().default([]),
    findings: text('findings').default(''),
    conclusion: text('conclusion').default(''),
    status: text('status').notNull().default('in_progress'),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('research_projects_user_idx').on(table.userId),
    index('research_projects_synth_idx').on(table.isSynthetic, table.createdAt),
  ]
);

export const researchSources = pgTable('research_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => researchProjects.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  authors: text('authors'),
  publishedDate: text('published_date'),
  stance: text('stance').notNull().default('support'),
  notes: text('notes'),
  sourceType: text('source_type').default('academic'),
  publisher: text('publisher'),
  relevantExcerpt: text('relevant_excerpt'),
  retrievalDate: text('retrieval_date'),
  reliabilityLabel: text('reliability_label').default('standard'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const researchNotes = pgTable('research_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => researchProjects.id, { onDelete: 'cascade' })
    .notNull(),
  content: text('content').notNull(),
  tags: jsonb('tags').$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 5. AI Ask Conversations
export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('ai_conv_user_idx').on(table.userId)]
);

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .references(() => aiConversations.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  structuredData: jsonb('structured_data').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 6. Video Intelligence & User Video Publishing
export const videoCategories = pgTable('video_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const videos = pgTable(
  'videos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uploaderUserId: uuid('uploader_user_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    channel: text('channel').notNull(),
    description: text('description').notNull(),
    categorySlug: text('category_slug').notNull(),
    language: text('language').notNull().default('en'),
    tags: jsonb('tags').$type<string[]>().default([]),
    duration: text('duration').notNull(),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    videoUrl: text('video_url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    storageObjectKey: text('storage_object_key'),
    thumbnailObjectKey: text('thumbnail_object_key'),
    fileSizeBytes: integer('file_size_bytes').notNull().default(0),
    mimeType: text('mime_type'),
    checksumSha256: text('checksum_sha256'),
    malwareScanStatus: text('malware_scan_status').notNull().default('clean'), // 'pending' | 'clean' | 'quarantined'
    processingStatus: text('processing_status').notNull().default('ready'), // 'queued' | 'processing' | 'ready' | 'failed'
    processingError: text('processing_error'),
    rightsConfirmed: boolean('rights_confirmed').notNull().default(true),
    status: text('status').notNull().default('published'), // 'draft' | 'pending_review' | 'approved' | 'rejected' | 'processing' | 'published' | 'archived'
    rejectionReason: text('rejection_reason'),
    viewsCount: integer('views_count').notNull().default(0),
    aiSummary: text('ai_summary'),
    keyTimestamps: jsonb('key_timestamps')
      .$type<{ time: number; label: string; summary: string }[]>()
      .default([]),
    keyConcepts: jsonb('key_concepts').$type<string[]>().default([]),
    publishedAt: text('published_at'),
    sourcePlatform: text('source_platform').notNull().default('2mr_hosted'),
    externalVideoId: text('external_video_id'),
    channelId: text('channel_id'),
    channelUrl: text('channel_url'),
    embedAllowed: boolean('embed_allowed').notNull().default(true),
    transcriptAvailable: boolean('transcript_available').notNull().default(true),
    isFeatured: boolean('is_featured').notNull().default(false),
    isPublished: boolean('is_published').notNull().default(true),
    submittedAt: timestamp('submitted_at'),
    approvedAt: timestamp('approved_at'),
    approvedByAdminId: uuid('approved_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('videos_pub_cat_idx').on(table.isPublished, table.categorySlug, table.isFeatured),
    index('videos_ext_id_idx').on(table.externalVideoId),
    index('videos_uploader_status_idx').on(table.uploaderUserId, table.status, table.createdAt),
    index('videos_status_pub_idx').on(table.status, table.isPublished, table.createdAt),
  ]
);

export const videoTranscripts = pgTable('video_transcripts', {
  id: uuid('id').defaultRandom().primaryKey(),
  videoId: uuid('video_id')
    .references(() => videos.id, { onDelete: 'cascade' })
    .notNull(),
  startSeconds: integer('start_seconds').notNull(),
  endSeconds: integer('end_seconds').notNull(),
  speaker: text('speaker'),
  text: text('text').notNull(),
});

export const videoTags = pgTable(
  'video_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    videoId: uuid('video_id')
      .references(() => videos.id, { onDelete: 'cascade' })
      .notNull(),
    tag: text('tag').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('video_tags_video_idx').on(table.videoId, table.tag)]
);

export const videoReviews = pgTable(
  'video_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    videoId: uuid('video_id')
      .references(() => videos.id, { onDelete: 'cascade' })
      .notNull(),
    reviewerAdminId: uuid('reviewer_admin_id').references(() => users.id, { onDelete: 'set null' }),
    reviewerEmail: text('reviewer_email'),
    action: text('action').notNull(), // 'submitted' | 'approved' | 'rejected' | 'published' | 'unpublished' | 'archived' | 'edited'
    reason: text('reason'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('video_reviews_video_idx').on(table.videoId, table.createdAt)]
);

export const videoViews = pgTable(
  'video_views',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    videoId: uuid('video_id')
      .references(() => videos.id, { onDelete: 'cascade' })
      .notNull(),
    viewerUserId: uuid('viewer_user_id').references(() => users.id, { onDelete: 'set null' }),
    viewerSessionHash: text('viewer_session_hash'),
    watchSeconds: integer('watch_seconds').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('video_views_video_idx').on(table.videoId, table.createdAt),
    index('video_views_session_idx').on(table.videoId, table.viewerSessionHash, table.createdAt),
  ]
);

export const videoReports = pgTable(
  'video_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    videoId: uuid('video_id')
      .references(() => videos.id, { onDelete: 'cascade' })
      .notNull(),
    reporterUserId: uuid('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),
    reporterEmail: text('reporter_email'),
    reason: text('reason').notNull(), // 'copyright' | 'misinformation' | 'inappropriate' | 'spam' | 'other'
    details: text('details').notNull(),
    status: text('status').notNull().default('open'), // 'open' | 'reviewing' | 'resolved' | 'dismissed'
    adminNotes: text('admin_notes'),
    resolvedByAdminId: uuid('resolved_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('video_reports_video_status_idx').on(table.videoId, table.status, table.createdAt)]
);

export const videoAdSettings = pgTable(
  'video_ad_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    videoId: uuid('video_id')
      .references(() => videos.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    adMode: text('ad_mode').notNull().default('use_global'), // 'use_global' | 'ads_enabled' | 'ads_disabled'
    allowPreRoll: boolean('allow_pre_roll').notNull().default(true),
    allowMidRoll: boolean('allow_mid_roll').notNull().default(true),
    allowPostRoll: boolean('allow_post_roll').notNull().default(true),
    allowBanner: boolean('allow_banner').notNull().default(true),
    allowSponsoredRec: boolean('allow_sponsored_rec').notNull().default(true),
    midRollIntervalSeconds: integer('mid_roll_interval_seconds').notNull().default(300),
    maxAdsPerView: integer('max_ads_per_view').notNull().default(3),
    updatedByAdminEmail: text('updated_by_admin_email'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('video_ad_settings_mode_idx').on(table.adMode)]
);

// 7. Knowledge Map
export const knowledgeMaps = pgTable('knowledge_maps', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  rootTopic: text('root_topic').notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const knowledgeNodes = pgTable('knowledge_nodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  mapId: uuid('map_id')
    .references(() => knowledgeMaps.id, { onDelete: 'cascade' })
    .notNull(),
  nodeKey: text('node_key').notNull(),
  label: text('label').notNull(),
  category: text('category').notNull(),
  definition: text('definition').notNull(),
  explanation: text('explanation'),
  depth: integer('depth').notNull().default(0),
  x: integer('x').notNull().default(400),
  y: integer('y').notNull().default(300),
  keyConcepts: jsonb('key_concepts').$type<string[]>().default([]),
});

export const knowledgeEdges = pgTable('knowledge_edges', {
  id: uuid('id').defaultRandom().primaryKey(),
  mapId: uuid('map_id')
    .references(() => knowledgeMaps.id, { onDelete: 'cascade' })
    .notNull(),
  sourceKey: text('source_key').notNull(),
  targetKey: text('target_key').notNull(),
  relation: text('relation').notNull(),
});

// 8. My Knowledge (Personal Library & Collections)
export const collections = pgTable('collections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const savedItems = pgTable(
  'saved_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    collectionId: uuid('collection_id').references(() => collections.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(), // 'research' | 'article' | 'website' | 'video' | 'answer' | 'note' | 'map'
    title: text('title').notNull(),
    url: text('url'),
    snippet: text('snippet'),
    notes: text('notes'),
    category: text('category').default('General'),
    tags: jsonb('tags').$type<string[]>().default([]),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('saved_items_user_idx').on(table.userId),
    index('saved_items_synth_idx').on(table.isSynthetic, table.createdAt),
  ]
);

export const collectionItems = pgTable('collection_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id')
    .references(() => collections.id, { onDelete: 'cascade' })
    .notNull(),
  savedItemId: uuid('saved_item_id')
    .references(() => savedItems.id, { onDelete: 'cascade' })
    .notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
});

// 9. 2MR Ads System
export const advertisers = pgTable('advertisers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  contactEmail: text('contact_email'),
  website: text('website'),
  industry: text('industry').default('Education & Research'),
  status: text('status').notNull().default('active'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const adCampaigns = pgTable('ad_campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  advertiserId: uuid('advertiser_id').references(() => advertisers.id),
  advertiserName: text('advertiser_name').notNull(),
  campaignName: text('campaign_name').notNull(),
  adType: text('ad_type').notNull(), // 'banner' | 'pre-roll' | 'sponsored-result'
  headline: text('headline').notNull(),
  description: text('description').notNull(),
  ctaText: text('cta_text').notNull().default('Learn More'),
  ctaUrl: text('cta_url').notNull(),
  targetCategory: text('target_category').notNull().default('All'),
  status: text('status').notNull().default('active'), // 'active' | 'paused' | 'completed'
  startDate: text('start_date'),
  endDate: text('end_date'),
  budget: integer('budget').notNull().default(0),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const adEvents = pgTable(
  'ad_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .references(() => adCampaigns.id, { onDelete: 'cascade' })
      .notNull(),
    eventType: text('event_type').notNull(), // 'impression' | 'click' | 'completion'
    userId: uuid('user_id'),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('ad_events_synth_idx').on(table.isSynthetic, table.eventType, table.createdAt)]
);

// 10. Notifications, Feedback, Support & Audit Logs
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    category: text('category').notNull(), // 'research' | 'subscription' | 'security' | 'system'
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('notifications_user_idx').on(table.userId)]
);

export const feedbackSubmissions = pgTable(
  'feedback_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    referenceNumber: text('reference_number').notNull().unique(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    fullName: text('full_name'),
    email: text('email').notNull(),
    category: text('category').notNull(),
    subject: text('subject').notNull(),
    message: text('message').notNull(),
    attachmentName: text('attachment_name'),
    status: text('status').notNull().default('new'), // 'new' | 'in_review' | 'replied' | 'resolved' | 'archived'
    internalNotes: text('internal_notes'),
    adminReply: text('admin_reply'),
    repliedAt: timestamp('replied_at'),
    emailDispatchStatus: text('email_dispatch_status').default('pending'),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('feedback_status_idx').on(table.status),
    index('feedback_synth_idx').on(table.isSynthetic, table.status, table.createdAt),
  ]
);

export const supportMessages = pgTable('support_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id'),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    resource: text('resource').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('audit_logs_created_idx').on(table.createdAt)]
);

// 11. 2MR Unified Multi-AI Orchestrator Tables
export const aiProviders = pgTable('ai_providers', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(), // 'gemini' | 'openai' | 'anthropic' | 'custom'
  name: text('name').notNull(),
  providerType: text('provider_type').notNull(), // 'gemini' | 'openai' | 'anthropic' | 'openai_compatible'
  baseUrl: text('base_url'),
  apiKeyEncrypted: text('api_key_encrypted'),
  apiKeyLast4: text('api_key_last4'),
  isEnabled: boolean('is_enabled').notNull().default(false),
  isDefault: boolean('is_default').notNull().default(false),
  priority: integer('priority').notNull().default(10),
  rateLimitPerMin: integer('rate_limit_per_min').notNull().default(60),
  healthStatus: text('health_status').notNull().default('unconfigured'), // 'healthy' | 'degraded' | 'unconfigured' | 'error'
  lastCheckedAt: timestamp('last_checked_at'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiProviderModels = pgTable('ai_provider_models', {
  id: uuid('id').defaultRandom().primaryKey(),
  providerId: uuid('provider_id')
    .references(() => aiProviders.id, { onDelete: 'cascade' })
    .notNull(),
  modelKey: text('model_key').notNull(),
  displayName: text('display_name').notNull(),
  capabilities: jsonb('capabilities').$type<string[]>().default([]),
  isDefault: boolean('is_default').notNull().default(false),
  isEnabled: boolean('is_enabled').notNull().default(true),
  costPer1kInputMicroUsd: integer('cost_per_1k_input_micro_usd').notNull().default(0),
  costPer1kOutputMicroUsd: integer('cost_per_1k_output_micro_usd').notNull().default(0),
  maxContextTokens: integer('max_context_tokens').notNull().default(128000),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aiProviderSettings = pgTable('ai_provider_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  multiModelVerificationEnabled: boolean('multi_model_verification_enabled').notNull().default(true),
  autoFallbackEnabled: boolean('auto_fallback_enabled').notNull().default(true),
  maxProvidersPerDeepQuery: integer('max_providers_per_deep_query').notNull().default(3),
  timeoutMs: integer('timeout_ms').notNull().default(15000),
  defaultResearchDepth: text('default_research_depth').notNull().default('fast'),
  defaultFastModel: text('default_fast_model').notNull().default('gemini-4-hydrogen'),
  defaultResearchModel: text('default_research_model').notNull().default('gemini-4-hydrogen'),
  fastTimeoutMs: integer('fast_timeout_ms').notNull().default(7000),
  balancedTimeoutMs: integer('balanced_timeout_ms').notNull().default(12000),
  deepTimeoutMs: integer('deep_timeout_ms').notNull().default(22000),
  cacheTtlSearchSeconds: integer('cache_ttl_search_seconds').notNull().default(600),
  cacheTtlMetadataSeconds: integer('cache_ttl_metadata_seconds').notNull().default(1800),
  cacheTtlDocumentSeconds: integer('cache_ttl_document_seconds').notNull().default(3600),
  defaultTemperature: text('default_temperature').notNull().default('0.2'),
  privacyDisclosureText: text('privacy_disclosure_text').notNull().default(
    '2MR processes queries through authorized server-side AI model APIs without sharing user passwords or private account credentials.'
  ),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiRequests = pgTable(
  'ai_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    mode: text('mode').notNull(), // 'ask' | 'research_intelligence' | 'deep_research' | 'smart_answer' | 'comparison'
    researchDepth: text('research_depth').notNull().default('fast'), // 'fast' | 'balanced' | 'deep'
    intentCategory: text('intent_category').notNull().default('simple_qa'),
    promptSummary: text('prompt_summary').notNull(),
    providersSelected: jsonb('providers_selected').$type<string[]>().default([]),
    status: text('status').notNull().default('completed'),
    latencyMs: integer('latency_ms').notNull().default(0),
    ttftMs: integer('ttft_ms').notNull().default(0),
    searchLatencyMs: integer('search_latency_ms').notNull().default(0),
    dbLatencyMs: integer('db_latency_ms').notNull().default(0),
    aiLatencyMs: integer('ai_latency_ms').notNull().default(0),
    cacheHit: boolean('cache_hit').notNull().default(false),
    routingReason: text('routing_reason'),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('ai_requests_created_idx').on(table.createdAt),
    index('ai_requests_depth_idx').on(table.researchDepth, table.createdAt),
    index('ai_requests_synth_idx').on(table.isSynthetic, table.createdAt),
  ]
);

export const aiResponses = pgTable(
  'ai_responses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .references(() => aiRequests.id, { onDelete: 'cascade' })
      .notNull(),
    providerSlug: text('provider_slug').notNull(),
    modelKey: text('model_key').notNull(),
    responseExcerpt: text('response_excerpt').notNull(),
    latencyMs: integer('latency_ms').notNull().default(0),
    status: text('status').notNull().default('success'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('ai_responses_req_idx').on(table.requestId),
    index('ai_responses_prov_idx').on(table.providerSlug, table.status, table.createdAt),
  ]
);

export const aiUsageLogs = pgTable(
  'ai_usage_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    providerSlug: text('provider_slug').notNull(),
    modelKey: text('model_key').notNull(),
    mode: text('mode').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    status: text('status').notNull().default('success'),
    errorMessage: text('error_message'),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('ai_usage_created_idx').on(table.createdAt),
    index('ai_usage_prov_idx').on(table.providerSlug, table.status, table.createdAt),
    index('ai_usage_synth_idx').on(table.isSynthetic, table.createdAt),
  ]
);

export const aiCostRecords = pgTable('ai_cost_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  providerSlug: text('provider_slug').notNull(),
  modelKey: text('model_key').notNull(),
  requestId: uuid('request_id').references(() => aiRequests.id, { onDelete: 'set null' }),
  estimatedCostMicroUsd: integer('estimated_cost_micro_usd').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

export const aiVerificationRecords = pgTable('ai_verification_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id').references(() => aiRequests.id, { onDelete: 'cascade' }),
  topic: text('topic').notNull(),
  modelsCompared: jsonb('models_compared').$type<string[]>().default([]),
  agreementSummary: text('agreement_summary'),
  disagreementsFound: jsonb('disagreements_found').$type<string[]>().default([]),
  externalSourcesChecked: jsonb('external_sources_checked').$type<string[]>().default([]),
  verificationStatus: text('verification_status').notNull().default('mixed'), // 'supported' | 'mixed' | 'insufficient'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 12. Real Source Discovery & Provenance Verification Tables
export const externalSourceConnections = pgTable('external_source_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  sourceType: text('source_type').notNull(), // 'academic_api' | 'encyclopedia' | 'official_docs' | 'rss_feed' | 'video_api'
  endpointUrl: text('endpoint_url').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  requiresApiKey: boolean('requires_api_key').notNull().default(false),
  reliabilityTier: text('reliability_tier').notNull().default('high'), // 'high' | 'medium' | 'community'
  description: text('description'),
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sourceMetadata = pgTable('source_metadata', {
  id: uuid('id').defaultRandom().primaryKey(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  publisher: text('publisher').notNull(),
  author: text('author'),
  publishedDate: text('published_date'),
  sourceType: text('source_type').notNull(),
  relevantExcerpt: text('relevant_excerpt'),
  retrievalDate: text('retrieval_date').notNull(),
  reliabilityScore: integer('reliability_score').notNull().default(80),
  reliabilityNotes: text('reliability_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sourceVerificationLogs = pgTable('source_verification_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  topic: text('topic').notNull(),
  sourceUrl: text('source_url').notNull(),
  verificationOutcome: text('verification_outcome').notNull(), // 'verified' | 'reported_claim' | 'uncertain' | 'unreachable'
  claimChecked: text('claim_checked'),
  notes: text('notes'),
  checkedAt: timestamp('checked_at').defaultNow().notNull(),
});

// 13. Extended Video Sources, Summaries, Notes & Saved Videos
export const videoSources = pgTable('video_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  platform: text('platform').notNull(), // 'youtube_api_v3' | '2mr_hosted' | 'open_courseware'
  baseUrl: text('base_url').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  requiresApiKey: boolean('requires_api_key').notNull().default(false),
  embedPolicy: text('embed_policy').notNull().default('respect_provider_embeddable'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const videoMetadata = pgTable('video_metadata', {
  id: uuid('id').defaultRandom().primaryKey(),
  videoId: uuid('video_id')
    .references(() => videos.id, { onDelete: 'cascade' })
    .notNull(),
  viewCount: integer('view_count').default(0),
  language: text('language').default('en'),
  license: text('license').default('Standard'),
  tags: jsonb('tags').$type<string[]>().default([]),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
});

export const videoSummaries = pgTable('video_summaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  videoId: uuid('video_id')
    .references(() => videos.id, { onDelete: 'cascade' })
    .notNull(),
  summary: text('summary').notNull(),
  keyPoints: jsonb('key_points').$type<string[]>().default([]),
  studyNotes: text('study_notes'),
  revisionQuestions: jsonb('revision_questions').$type<string[]>().default([]),
  generatedFromTranscript: boolean('generated_from_transcript').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const videoNotes = pgTable(
  'video_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    videoId: uuid('video_id')
      .references(() => videos.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    content: text('content').notNull(),
    timestampSeconds: integer('timestamp_seconds').default(0),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('video_notes_synth_idx').on(table.isSynthetic, table.createdAt)]
);

export const savedVideos = pgTable(
  'saved_videos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    videoId: uuid('video_id')
      .references(() => videos.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    notes: text('notes'),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('saved_videos_synth_idx').on(table.isSynthetic, table.createdAt)]
);

// 14. Structured Notes & Documentation Links Workspace
export const noteFolders = pgTable('note_folders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  color: text('color').default('#258BFF'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const knowledgeNotes = pgTable(
  'knowledge_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    folderId: uuid('folder_id').references(() => noteFolders.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => researchProjects.id, { onDelete: 'set null' }),
    videoId: uuid('video_id').references(() => videos.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    isPinned: boolean('is_pinned').notNull().default(false),
    isPrivate: boolean('is_private').notNull().default(true),
    aiSummaryIncluded: boolean('ai_summary_included').notNull().default(false),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('knowledge_notes_user_idx').on(table.userId),
    index('knowledge_notes_synth_idx').on(table.isSynthetic, table.createdAt),
  ]
);

export const noteTags = pgTable('note_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  noteId: uuid('note_id')
    .references(() => knowledgeNotes.id, { onDelete: 'cascade' })
    .notNull(),
  tag: text('tag').notNull(),
});

export const noteSources = pgTable('note_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  noteId: uuid('note_id')
    .references(() => knowledgeNotes.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  publisher: text('publisher'),
  publishedDate: text('published_date'),
  excerpt: text('excerpt'),
  addedAt: timestamp('added_at').defaultNow().notNull(),
});

export const noteAttachments = pgTable('note_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  noteId: uuid('note_id')
    .references(() => knowledgeNotes.id, { onDelete: 'cascade' })
    .notNull(),
  label: text('label').notNull(),
  attachmentType: text('attachment_type').notNull().default('link'), // 'link' | 'research_project' | 'video' | 'ai_answer'
  referenceUrl: text('reference_url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 15. Administrator Security, Argon2id Auth & Governance Tables
export const rolePermissions = pgTable('role_permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  roleId: uuid('role_id')
    .references(() => roles.id, { onDelete: 'cascade' })
    .notNull(),
  permissionId: uuid('permission_id')
    .references(() => permissions.id, { onDelete: 'cascade' })
    .notNull(),
  grantedAt: timestamp('granted_at').defaultNow().notNull(),
});

export const adminAccounts = pgTable('admin_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  email: text('email').notNull().unique(),
  passwordHashArgon2: text('password_hash_argon2'),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  totpSecretEncrypted: text('totp_secret_encrypted'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until'),
  lastLoginAt: timestamp('last_login_at'),
  createdByAdminId: uuid('created_by_admin_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const adminSessions = pgTable('admin_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  adminAccountId: uuid('admin_account_id')
    .references(() => adminAccounts.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  isActive: boolean('is_active').notNull().default(true),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const adminLoginLogs = pgTable('admin_login_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  adminAccountId: uuid('admin_account_id').references(() => adminAccounts.id, { onDelete: 'set null' }),
  email: text('email').notNull(),
  authMethod: text('auth_method').notNull(), // 'google_oauth' | 'argon2_password' | '2fa_totp'
  success: boolean('success').notNull().default(false),
  failureReason: text('failure_reason'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const adminSecurityEvents = pgTable('admin_security_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  adminAccountId: uuid('admin_account_id').references(() => adminAccounts.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  severity: text('severity').notNull().default('info'), // 'info' | 'warning' | 'critical'
  description: text('description').notNull(),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  adminAccountId: uuid('admin_account_id').references(() => adminAccounts.id, { onDelete: 'set null' }),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),
  targetResource: text('target_resource').notNull(),
  targetId: text('target_id'),
  details: jsonb('details').$type<Record<string, unknown>>(),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 16. Expanded Advertisement Management Tables
export const advertisementCampaigns = pgTable('advertisement_campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  advertiserId: uuid('advertiser_id').references(() => advertisers.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'), // 'draft' | 'active' | 'paused' | 'completed'
  budgetUsd: integer('budget_usd').notNull().default(0),
  dailyCap: integer('daily_cap').notNull().default(1000),
  impressionCap: integer('impression_cap').notNull().default(50000),
  clickCap: integer('click_cap').notNull().default(5000),
  frequencyCapPerUser: integer('frequency_cap_per_user').notNull().default(5),
  targetCategories: jsonb('target_categories').$type<string[]>().default(['All']),
  startDate: text('start_date'),
  endDate: text('end_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const advertisements = pgTable(
  'advertisements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    advertiserId: uuid('advertiser_id').references(() => advertisers.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id').references(() => advertisementCampaigns.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sponsorName: text('sponsor_name').notNull().default('2MR Partner'),
    adFormat: text('ad_format').notNull().default('banner'), // 'banner' | 'sponsored_card' | 'sponsored_content' | 'video_ad' | 'sidebar_ad' | 'search_sponsored'
    placement: text('placement').notNull().default('banner'), // 'pre_roll' | 'mid_roll' | 'post_roll' | 'sponsored_recommendation' | 'banner'
    headline: text('headline').notNull(),
    description: text('description').notNull(),
    mediaUrl: text('media_url'),
    ctaText: text('cta_text').notNull().default('Learn More'),
    ctaUrl: text('cta_url').notNull(),
    targetCategories: jsonb('target_categories').$type<string[]>().default(['All']),
    targetVideoIds: jsonb('target_video_ids').$type<string[]>().default([]),
    startDate: text('start_date'),
    endDate: text('end_date'),
    budgetUsd: integer('budget_usd').notNull().default(0),
    impressionLimit: integer('impression_limit').notNull().default(0),
    clickLimit: integer('click_limit').notNull().default(0),
    frequencyCapPerUser: integer('frequency_cap_per_user').notNull().default(3),
    minSpacingSeconds: integer('min_spacing_seconds').notNull().default(180),
    impressionsCount: integer('impressions_count').notNull().default(0),
    clicksCount: integer('clicks_count').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('advertisements_active_placement_idx').on(table.isActive, table.placement)]
);

export const advertisementPlacements = pgTable('advertisement_placements', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  placementType: text('placement_type').notNull(),
  allowsThirdPartyVideo: boolean('allows_third_party_video').notNull().default(false),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const advertisementEvents = pgTable(
  'advertisement_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    advertisementId: uuid('advertisement_id').references(() => advertisements.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => advertisementCampaigns.id, { onDelete: 'cascade' }),
    placementCode: text('placement_code'),
    eventType: text('event_type').notNull(), // 'impression' | 'click' | 'completion'
    userId: uuid('user_id'),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('adv_events_synth_idx').on(table.isSynthetic, table.eventType, table.createdAt)]
);

export const adImpressions = pgTable(
  'ad_impressions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    advertisementId: uuid('advertisement_id')
      .references(() => advertisements.id, { onDelete: 'cascade' })
      .notNull(),
    campaignId: uuid('campaign_id').references(() => advertisementCampaigns.id, { onDelete: 'set null' }),
    videoId: uuid('video_id').references(() => videos.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    placement: text('placement').notNull(),
    viewerSessionHash: text('viewer_session_hash'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('ad_impressions_ad_idx').on(table.advertisementId, table.createdAt),
    index('ad_impressions_video_idx').on(table.videoId, table.createdAt),
    index('ad_impressions_viewer_idx').on(table.advertisementId, table.viewerSessionHash, table.createdAt),
  ]
);

export const adClicks = pgTable(
  'ad_clicks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    advertisementId: uuid('advertisement_id')
      .references(() => advertisements.id, { onDelete: 'cascade' })
      .notNull(),
    campaignId: uuid('campaign_id').references(() => advertisementCampaigns.id, { onDelete: 'set null' }),
    videoId: uuid('video_id').references(() => videos.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    placement: text('placement').notNull(),
    viewerSessionHash: text('viewer_session_hash'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('ad_clicks_ad_idx').on(table.advertisementId, table.createdAt),
    index('ad_clicks_video_idx').on(table.videoId, table.createdAt),
  ]
);

export const advertisementAnalytics = pgTable('advertisement_analytics', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaignId: uuid('campaign_id')
    .references(() => advertisementCampaigns.id, { onDelete: 'cascade' })
    .notNull(),
  dateKey: text('date_key').notNull(),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  completions: integer('completions').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 17. Official Social Media & Platform Settings
export const socialMediaSettings = pgTable('social_media_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  platformKey: text('platform_key').notNull().unique(), // 'youtube'
  channelName: text('channel_name').notNull(),
  handle: text('handle').notNull(),
  channelUrl: text('channel_url').notNull(),
  profileImageUrl: text('profile_image_url').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  autoFetchVideos: boolean('auto_fetch_videos').notNull().default(true),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const platformSettings = pgTable('platform_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  settingKey: text('setting_key').notNull().unique(),
  settingValue: jsonb('setting_value').$type<Record<string, unknown>>().default({}),
  category: text('category').notNull().default('general'),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 18. Synthetic Demo Data Generation Jobs, Batches & Logs
export const demoGenerationJobs = pgTable(
  'demo_generation_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobType: text('job_type').notNull().default('users_500k'), // 'users_500k' | 'activity_batch' | 'cleanup'
    status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'
    targetCount: integer('target_count').notNull().default(500000),
    generatedCount: integer('generated_count').notNull().default(0),
    activityGeneratedCount: integer('activity_generated_count').notNull().default(0),
    batchSize: integer('batch_size').notNull().default(10000),
    config: jsonb('config').$type<Record<string, unknown>>().default({}),
    startedByAdminId: uuid('started_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    cancelledAt: timestamp('cancelled_at'),
    errorMessage: text('error_message'),
    peakMemoryMb: integer('peak_memory_mb').notNull().default(0),
    avgBatchMs: integer('avg_batch_ms').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('demo_jobs_status_idx').on(table.status, table.createdAt),
  ]
);

export const demoGenerationBatches = pgTable(
  'demo_generation_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .references(() => demoGenerationJobs.id, { onDelete: 'cascade' })
      .notNull(),
    batchNumber: integer('batch_number').notNull(),
    tableName: text('table_name').notNull(),
    recordsInserted: integer('records_inserted').notNull().default(0),
    durationMs: integer('duration_ms').notNull().default(0),
    status: text('status').notNull().default('completed'), // 'completed' | 'failed'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('demo_batches_job_idx').on(table.jobId, table.batchNumber),
  ]
);

export const demoGenerationLogs = pgTable(
  'demo_generation_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .references(() => demoGenerationJobs.id, { onDelete: 'cascade' })
      .notNull(),
    level: text('level').notNull().default('info'), // 'info' | 'warning' | 'error'
    message: text('message').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('demo_logs_job_idx').on(table.jobId, table.createdAt),
  ]
);

// 19. Cookie Consent & User Privacy Preferences
export const cookieConsents = pgTable(
  'cookie_consents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    visitorId: text('visitor_id').notNull(),
    policyVersion: text('policy_version').notNull().default('2026.1'),
    consentAction: text('consent_action').notNull().default('reject_optional'), // 'accept_all' | 'reject_optional' | 'customized' | 'withdrawn'
    necessary: boolean('necessary').notNull().default(true),
    analytics: boolean('analytics').notNull().default(false),
    personalization: boolean('personalization').notNull().default(false),
    advertising: boolean('advertising').notNull().default(false),
    consentedAt: timestamp('consented_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('cookie_consents_visitor_idx').on(table.visitorId),
    index('cookie_consents_user_idx').on(table.userId),
    index('cookie_consents_action_idx').on(table.consentAction, table.policyVersion),
  ]
);

export const cookieConsentEvents = pgTable(
  'cookie_consent_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    consentId: uuid('consent_id')
      .references(() => cookieConsents.id, { onDelete: 'cascade' })
      .notNull(),
    eventType: text('event_type').notNull(), // 'initial_consent' | 'preference_updated' | 'consent_withdrawn'
    consentAction: text('consent_action').notNull(),
    policyVersion: text('policy_version').notNull(),
    analytics: boolean('analytics').notNull().default(false),
    personalization: boolean('personalization').notNull().default(false),
    advertising: boolean('advertising').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('cookie_consent_events_created_idx').on(table.createdAt),
    index('cookie_consent_events_consent_idx').on(table.consentId),
  ]
);

export const userPrivacyPreferences = pgTable(
  'user_privacy_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    aiPersonalizationOptIn: boolean('ai_personalization_opt_in').notNull().default(false),
    aiHistoryRetention: boolean('ai_history_retention').notNull().default(true),
    searchHistoryTracking: boolean('search_history_tracking').notNull().default(true),
    researchDefaultVisibility: text('research_default_visibility').notNull().default('private'), // 'private' | 'workspace_only'
    deletionRequestedAt: timestamp('deletion_requested_at'),
    deletionStatus: text('deletion_status').notNull().default('none'), // 'none' | 'requested' | 'cancelled'
    deletionReason: text('deletion_reason'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_privacy_prefs_user_idx').on(table.userId),
  ]
);

// 20. Official Brand Identity, Founder Knowledge & Announcements
export const brandKnowledge = pgTable('brand_knowledge', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique().default('official'),
  officialName: text('official_name').notNull().default('2MR – To Master Research'),
  shortName: text('short_name').notNull().default('2MR'),
  acronymMeaning: text('acronym_meaning').notNull().default('To Master Research'),
  founderName: text('founder_name').notNull().default('Gihozo Aime'),
  founderTitle: text('founder_title').notNull().default('Founder & Chief Executive Officer'),
  founderBio: text('founder_bio').notNull(),
  slogan: text('slogan').notNull().default('Discover More. Understand Better.'),
  vision: text('vision').notNull().default('Global Research Platform.'),
  mission: text('mission').notNull(),
  purpose: text('purpose').notNull(),
  originStory: text('origin_story').notNull(),
  coreFeatures: jsonb('core_features')
    .$type<Array<{ name: string; description: string }>>()
    .notNull()
    .default([]),
  supportedLanguages: jsonb('supported_languages').$type<string[]>().notNull().default([]),
  officialFoundingDate: text('official_founding_date'),
  publicLaunchDate: text('public_launch_date'),
  developmentStartDate: text('development_start_date'),
  contactEmail: text('contact_email').notNull().default('2mr@proton.me'),
  contactPhone: text('contact_phone').notNull().default('0780558358'),
  isPublished: boolean('is_published').notNull().default(true),
  updatedByAdminEmail: text('updated_by_admin_email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const brandAnnouncements = pgTable(
  'brand_announcements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    body: text('body').notNull(),
    category: text('category').notNull().default('official_update'),
    announcementDate: text('announcement_date').notNull(),
    isPublished: boolean('is_published').notNull().default(true),
    createdByEmail: text('created_by_email'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('brand_announcements_pub_date_idx').on(table.isPublished, table.announcementDate),
  ]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(subscriptions),
  payments: many(payments),
  researchProjects: many(researchProjects),
  savedItems: many(savedItems),
  notifications: many(notifications),
  aiConversations: many(aiConversations),
}));

export const researchProjectsRelations = relations(researchProjects, ({ one, many }) => ({
  owner: one(users, { fields: [researchProjects.userId], references: [users.id] }),
  sources: many(researchSources),
  notes: many(researchNotes),
}));

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  owner: one(users, { fields: [aiConversations.userId], references: [users.id] }),
  messages: many(aiMessages),
}));

export const videosRelations = relations(videos, ({ many }) => ({
  transcripts: many(videoTranscripts),
}));

export const knowledgeMapsRelations = relations(knowledgeMaps, ({ many }) => ({
  nodes: many(knowledgeNodes),
  edges: many(knowledgeEdges),
}));

