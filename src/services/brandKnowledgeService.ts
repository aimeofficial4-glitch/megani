import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { brandAnnouncements, brandKnowledge } from '../db/schema.ts';
import { clearPublicCache } from './cache.ts';
import { ProvenanceSource } from './sourceDiscovery.ts';

export interface BrandCoreFeature {
  name: string;
  description: string;
}

export interface OfficialBrandKnowledge {
  id: string;
  slug: string;
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
  coreFeatures: BrandCoreFeature[];
  supportedLanguages: string[];
  officialFoundingDate: string | null;
  publicLaunchDate: string | null;
  developmentStartDate: string | null;
  contactEmail: string;
  contactPhone: string;
  isPublished: boolean;
  updatedAt: string;
}

export interface OfficialBrandAnnouncement {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  announcementDate: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BrandSubIntent =
  | 'security_probe'
  | 'founder'
  | 'founding_date'
  | 'launch_date'
  | 'development_date'
  | 'meaning'
  | 'purpose_mission'
  | 'features'
  | 'announcements'
  | 'overview'
  | null;

export type DetectedQueryLang = 'en' | 'rw' | 'fr' | 'sw' | 'es';

export interface BrandQueryClassification {
  isBrandQuery: boolean;
  isSecurityProbe: boolean;
  subIntent: BrandSubIntent;
  detectedLang: DetectedQueryLang;
}

export const DEFAULT_CORE_FEATURES: BrandCoreFeature[] = [
  {
    name: '2MR Research Intelligence',
    description:
      'Multi-source deep research synthesis comparing evidence, agreements, disagreements, and verified citations.',
  },
  {
    name: '2MR Ask',
    description:
      'Conversational AI research assistant delivering real-time streaming answers grounded in primary sources.',
  },
  {
    name: '2MR Research Builder',
    description:
      'Structured workspace for drafting research questions, hypotheses, methodologies, literature reviews, and Word (.docx) exports.',
  },
  {
    name: '2MR Video Intelligence',
    description:
      'Educational video discovery, transcript extraction, AI study summaries, and interactive video Q&A.',
  },
  {
    name: '2MR Knowledge Map',
    description:
      'Interactive visual concept mapping that connects ideas, definitions, and cross-disciplinary relationships.',
  },
  {
    name: '2MR My Knowledge',
    description:
      'Personal research library, structured notes, collections, and AI-assisted knowledge organization.',
  },
];

export const DEFAULT_BRAND_SEED = {
  slug: 'official',
  officialName: '2MR – To Master Research',
  shortName: '2MR',
  acronymMeaning: 'To Master Research',
  founderName: 'Gihozo Aime',
  founderTitle: 'Founder & Chief Executive Officer',
  founderBio:
    'Gihozo Aime is the founder and creator of 2MR – To Master Research, dedicated to empowering students, researchers, independent analysts, and institutions worldwide with transparent, source-verified discovery tools.',
  slogan: 'Discover More. Understand Better.',
  vision: 'Global Research Platform.',
  mission:
    'To make deep research, evidence comparison, and structured learning accessible to everyone through reliable, source-verified intelligence.',
  purpose:
    'To help people discover information, conduct research, understand complex topics, analyze knowledge, and organize research.',
  originStory:
    '2MR – To Master Research was founded on 9 November 2026 by Gihozo Aime to help people discover reliable information, conduct rigorous research, compare sources, and organize knowledge inside one global platform.',
  coreFeatures: DEFAULT_CORE_FEATURES,
  supportedLanguages: ['English', 'Kinyarwanda', 'French', 'Swahili', 'Spanish'],
  officialFoundingDate: '2026-11-09',
  publicLaunchDate: null as string | null,
  developmentStartDate: null as string | null,
  contactEmail: '2mr@proton.me',
  contactPhone: '0780558358',
  isPublished: true,
};

let brandCache: {
  expiresAt: number;
  brand: OfficialBrandKnowledge;
  announcements: OfficialBrandAnnouncement[];
} | null = null;

export function invalidateBrandKnowledgeCache(): void {
  brandCache = null;
  clearPublicCache('public_ai');
  clearPublicCache('search');
}

function mapBrandRow(row: typeof brandKnowledge.$inferSelect): OfficialBrandKnowledge {
  return {
    id: row.id,
    slug: row.slug,
    officialName: row.officialName,
    shortName: row.shortName,
    acronymMeaning: row.acronymMeaning,
    founderName: row.founderName,
    founderTitle: row.founderTitle,
    founderBio: row.founderBio,
    slogan: row.slogan,
    vision: row.vision,
    mission: row.mission,
    purpose: row.purpose,
    originStory: row.originStory,
    coreFeatures:
      Array.isArray(row.coreFeatures) && row.coreFeatures.length > 0
        ? row.coreFeatures
        : DEFAULT_CORE_FEATURES,
    supportedLanguages:
      Array.isArray(row.supportedLanguages) && row.supportedLanguages.length > 0
        ? row.supportedLanguages
        : DEFAULT_BRAND_SEED.supportedLanguages,
    officialFoundingDate: row.officialFoundingDate || null,
    publicLaunchDate: row.publicLaunchDate || null,
    developmentStartDate: row.developmentStartDate || null,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    isPublished: row.isPublished,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapAnnouncementRow(row: typeof brandAnnouncements.$inferSelect): OfficialBrandAnnouncement {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    announcementDate: row.announcementDate,
    isPublished: row.isPublished,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureBrandKnowledgeSeeded(): Promise<OfficialBrandKnowledge> {
  const [existing] = await db
    .select()
    .from(brandKnowledge)
    .where(eq(brandKnowledge.slug, 'official'))
    .limit(1);

  if (existing) {
    return mapBrandRow(existing);
  }

  await db
    .insert(brandKnowledge)
    .values({
      ...DEFAULT_BRAND_SEED,
      updatedByAdminEmail: 'system',
    })
    .onConflictDoNothing({ target: brandKnowledge.slug });

  const [created] = await db
    .select()
    .from(brandKnowledge)
    .where(eq(brandKnowledge.slug, 'official'))
    .limit(1);

  return mapBrandRow(created);
}

export async function getOfficialBrandKnowledge(options?: {
  includeDrafts?: boolean;
  bypassCache?: boolean;
}): Promise<{
  brand: OfficialBrandKnowledge;
  announcements: OfficialBrandAnnouncement[];
}> {
  const includeDrafts = Boolean(options?.includeDrafts);
  if (!includeDrafts && !options?.bypassCache && brandCache && brandCache.expiresAt > Date.now()) {
    return {
      brand: brandCache.brand,
      announcements: brandCache.announcements,
    };
  }

  const brand = await ensureBrandKnowledgeSeeded();
  const annRows = await db
    .select()
    .from(brandAnnouncements)
    .orderBy(desc(brandAnnouncements.announcementDate), desc(brandAnnouncements.createdAt));

  const allAnnouncements = annRows.map(mapAnnouncementRow);
  const publishedAnnouncements = allAnnouncements.filter((a) => a.isPublished);

  if (!includeDrafts) {
    brandCache = {
      expiresAt: Date.now() + 60_000,
      brand,
      announcements: publishedAnnouncements,
    };
  }

  return {
    brand,
    announcements: includeDrafts ? allAnnouncements : publishedAnnouncements,
  };
}

const MONTHS_EN = [
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

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

const MONTHS_RW = [
  'Mutarama',
  'Gashyantare',
  'Werurwe',
  'Mata',
  'Gicurasi',
  'Kamena',
  'Nyakanga',
  'Kanama',
  'Nzeli',
  'Ukwakira',
  'Ugushyingo',
  'Ukuboza',
];

export function formatBrandDateDisplay(
  rawDate: string | null | undefined,
  lang: DetectedQueryLang = 'en'
): string | null {
  const val = String(rawDate || '').trim();
  if (!val) return null;
  const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return val;
  const year = Number(isoMatch[1]);
  const monthIdx = Number(isoMatch[2]) - 1;
  const day = Number(isoMatch[3]);
  if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return val;
  if (lang === 'fr') return `${day} ${MONTHS_FR[monthIdx]} ${year}`;
  if (lang === 'rw') return `${day} ${MONTHS_RW[monthIdx]} ${year}`;
  return `${day} ${MONTHS_EN[monthIdx]} ${year}`;
}

export function detectQueryLanguage(query: string, explicitLanguage?: string): DetectedQueryLang {
  const q = (query || '').toLowerCase();
  // Explicit Kinyarwanda tokens
  if (
    /\b(ninde|wakoze|yashinzwe|ryari|bisobanura|icyerekezo|intego|ibikorwa|nyirayo|uwashinze|amakuru|yatangijwe|kuki|uburyo|iki)\b/i.test(
      q
    )
  ) {
    return 'rw';
  }
  // Explicit French tokens
  if (
    /\b(qui a|créé|fondé|fondateur|créateur|signifie|quand|lancement|mission|fonctionnalités|pourquoi|plateforme|quelle est)\b/i.test(
      q
    )
  ) {
    return 'fr';
  }
  // Explicit Swahili tokens
  if (/\b(nani|alianzisha|maana|lini|lengo|vipengele)\b/i.test(q)) {
    return 'sw';
  }
  // Explicit Spanish tokens
  if (/\b(quién|creó|fundó|significa|cuándo|misión|propósito|características)\b/i.test(q)) {
    return 'es';
  }

  const exp = (explicitLanguage || '').toLowerCase();
  if (exp.includes('kinyarwanda')) return 'rw';
  if (exp.includes('french') || exp.includes('français')) return 'fr';
  if (exp.includes('swahili')) return 'sw';
  if (exp.includes('spanish') || exp.includes('español')) return 'es';
  return 'en';
}

export function classifyBrandIdentityQuery(
  query: string,
  explicitLanguage?: string
): BrandQueryClassification {
  const q = (query || '').trim().toLowerCase();
  const detectedLang = detectQueryLanguage(q, explicitLanguage);

  const isSecurityProbe =
    /\b(password|passwd|api[_\s-]?key|gemini_api_key|mtn_momo|secret|argon2|totp[_\s-]?secret|session[_\s-]?token|private[_\s-]?admin|database[_\s-]?url|admin[_\s-]?credentials|reveal.*key|dump.*admin)\b/i.test(
      q
    );

  const mentions2mrOrPlatform =
    /\b2mr\b|to master research|gihozo|aime|\bthis platform\b|\bthis website\b|\bthis app\b|\byour creator\b|\byour founder\b|\bwho made you\b|\bwho built you\b|\bqui t['’]a cr[ée]é\b|\bninde wakoze\b|\bwakoze iyi\b/i.test(
      q
    );

  if (isSecurityProbe) {
    return {
      isBrandQuery: true,
      isSecurityProbe: true,
      subIntent: 'security_probe',
      detectedLang,
    };
  }

  if (!mentions2mrOrPlatform) {
    return {
      isBrandQuery: false,
      isSecurityProbe: false,
      subIntent: null,
      detectedLang,
    };
  }

  // Classify specific 2MR identity sub-intent
  if (
    /\b(launch date|public launch|launched|released|release date|went live|go live|date de lancement|lancé|yatangijwe kumugaragaro)\b/i.test(
      q
    )
  ) {
    return { isBrandQuery: true, isSecurityProbe: false, subIntent: 'launch_date', detectedLang };
  }

  if (
    /\b(development start|started building|started developing|began development|début du développement)\b/i.test(
      q
    )
  ) {
    return { isBrandQuery: true, isSecurityProbe: false, subIntent: 'development_date', detectedLang };
  }

  if (
    /\b(when was|creation date|founding date|founded|established|created on|what year|what date|yashinzwe ryari|yakozwe ryari|ryari|quand .*créé|quand .*fondé|date de création|date de fondation|lini|cuándo)\b/i.test(
      q
    )
  ) {
    return { isBrandQuery: true, isSecurityProbe: false, subIntent: 'founding_date', detectedLang };
  }

  if (
    /\b(who created|who founded|who built|who made|who owns|founder|creator|owner|ceo|gihozo|ninde wakoze|ninde washinze|uwashinze|nyirayo|qui a créé|qui a fondé|fondateur|créateur|propriétaire|nani alianzisha|quién creó|fundador)\b/i.test(
      q
    )
  ) {
    return { isBrandQuery: true, isSecurityProbe: false, subIntent: 'founder', detectedLang };
  }

  if (
    /\b(what does 2mr mean|meaning|stand for|stands for|acronym|full name|bisobanura iki|que signifie|signification|maana ya|qué significa)\b/i.test(
      q
    )
  ) {
    return { isBrandQuery: true, isSecurityProbe: false, subIntent: 'meaning', detectedLang };
  }

  if (
    /\b(announcement|announcements|news|updates|official update|amakuru|annonces|novedades)\b/i.test(q)
  ) {
    return { isBrandQuery: true, isSecurityProbe: false, subIntent: 'announcements', detectedLang };
  }

  if (
    /\b(features|services|tools|workspaces|what can 2mr do|capabilities|fonctionnalités|ibikorwa|vipengele|características)\b/i.test(
      q
    )
  ) {
    return { isBrandQuery: true, isSecurityProbe: false, subIntent: 'features', detectedLang };
  }

  if (
    /\b(why was 2mr|purpose|mission|vision|slogan|goal|objective|icyerekezo|intego|pourquoi 2mr|objectif|misión|propósito)\b/i.test(
      q
    )
  ) {
    return { isBrandQuery: true, isSecurityProbe: false, subIntent: 'purpose_mission', detectedLang };
  }

  return { isBrandQuery: true, isSecurityProbe: false, subIntent: 'overview', detectedLang };
}

export function buildBrandSystemContext(
  brand: OfficialBrandKnowledge,
  announcements: OfficialBrandAnnouncement[]
): string {
  const foundingStr = brand.officialFoundingDate
    ? `${formatBrandDateDisplay(brand.officialFoundingDate, 'en')} (ISO: ${brand.officialFoundingDate})`
    : 'NOT YET PUBLICLY CONFIRMED';

  const launchStr = brand.publicLaunchDate
    ? `${formatBrandDateDisplay(brand.publicLaunchDate, 'en')} (ISO: ${brand.publicLaunchDate})`
    : 'NOT YET PUBLICLY CONFIRMED';

  const devStartStr = brand.developmentStartDate
    ? `${formatBrandDateDisplay(brand.developmentStartDate, 'en')} (ISO: ${brand.developmentStartDate})`
    : 'NOT YET PUBLICLY CONFIGURED';

  const featuresList = brand.coreFeatures
    .map((f, idx) => `${idx + 1}. ${f.name} — ${f.description}`)
    .join('\n');

  const announcementsBlock =
    announcements.length > 0
      ? announcements
          .slice(0, 5)
          .map(
            (a) =>
              `- [${a.announcementDate}] ${a.title} (${a.category}): ${a.summary}`
          )
          .join('\n')
      : '- No official public announcements have been published yet.';

  return `=== VERIFIED OFFICIAL 2MR KNOWLEDGE BASE ===
- Official Name: ${brand.officialName}
- Short Name: ${brand.shortName}
- Meaning of 2MR: ${brand.acronymMeaning}
- Founder and Creator: ${brand.founderName} (${brand.founderTitle})
- Founder Bio: ${brand.founderBio}
- Official Slogan: ${brand.slogan}
- Vision: ${brand.vision}
- Mission: ${brand.mission}
- Purpose: ${brand.purpose}
- Origin Story: ${brand.originStory}
- Official Founding Date (when 2MR was founded/created): ${foundingStr}
- Public Launch Date (when 2MR is publicly launched): ${launchStr}
- Development Start Date: ${devStartStr}
- Supported Languages: ${brand.supportedLanguages.join(', ')}
- Public Contact Email: ${brand.contactEmail}
- Public Contact Phone: ${brand.contactPhone}

Main Features (Workspaces):
${featuresList}

Official Published Announcements:
${announcementsBlock}

STRICT TRUTHFULNESS, DATE & SECURITY RULES FOR 2MR QUESTIONS:
1. Ground every statement about 2MR, its founder, dates, meaning, mission, slogan, features, and announcements strictly in the Official Knowledge Base above. NEVER invent co-founders, investors, dates, awards, ownership structures, or history.
2. NEVER confuse Official Founding Date, Public Launch Date, and Development Start Date:
   - When asked when 2MR was created or founded, use ONLY the Official Founding Date (${foundingStr}).
   - When asked when 2MR was publicly launched or released, use ONLY the Public Launch Date (${launchStr}). If Public Launch Date is NOT YET PUBLICLY CONFIRMED, state clearly: "The official public launch date of 2MR has not yet been publicly confirmed. Please check the official 2MR announcements for verified updates." (localized to the user's language if non-English).
   - If Development Start Date is NOT YET PUBLICLY CONFIGURED, do not invent one.
3. Answer naturally in the language requested or used by the user (English, Kinyarwanda, French, Swahili, Spanish, etc.).
4. SECURITY RULE: NEVER disclose private admin account lists, personal admin passwords/hashes, API keys, secrets, tokens, or internal server configuration.
=============================================`;
}

export function buildBrandReferenceSources(
  brand: OfficialBrandKnowledge,
  announcements: OfficialBrandAnnouncement[]
): ProvenanceSource[] {
  const foundingHuman = formatBrandDateDisplay(brand.officialFoundingDate, 'en');
  const launchHuman = formatBrandDateDisplay(brand.publicLaunchDate, 'en');
  const retrievalDate = new Date().toISOString().slice(0, 10);
  const sources: ProvenanceSource[] = [
    {
      id: `brand-official-${brand.id}`,
      title: `${brand.officialName} — Official Identity, Founder & Platform Documentation`,
      url: '/about',
      publisher: '2MR Official Knowledge Base',
      sourceName: '2MR Official Knowledge Base',
      domain: '2mr.research',
      modality: 'research',
      publishedDate: foundingHuman || 'Official Record',
      retrievalDate,
      authors: [brand.founderName],
      keywords: ['2MR', 'To Master Research', brand.founderName, 'Official Identity'],
      provider: '2mr_index',
      snippet: `Official Name: ${brand.officialName}. Founder & Creator: ${brand.founderName}. Slogan: "${brand.slogan}". Founding Date: ${foundingHuman || 'Not yet confirmed'}. Public Launch Date: ${launchHuman || 'Not yet publicly confirmed'}. Purpose: ${brand.purpose}`,
      sourceType: 'Official Institutional Documentation',
      reliabilityTier: 'High Reliability',
      reliabilityScore: 99,
      evidenceClassification: 'Verified Primary / Standard',
    },
  ];

  for (const ann of announcements.slice(0, 3)) {
    sources.push({
      id: `brand-ann-${ann.id}`,
      title: `Official 2MR Announcement: ${ann.title}`,
      url: '/about#announcements',
      publisher: '2MR Official Announcements',
      sourceName: '2MR Official Announcements',
      domain: '2mr.research',
      modality: 'news',
      publishedDate: ann.announcementDate,
      retrievalDate,
      authors: [brand.founderName],
      keywords: ['2MR', 'Announcement', ann.category],
      provider: '2mr_index',
      snippet: ann.summary,
      sourceType: 'Official Announcement',
      reliabilityTier: 'High Reliability',
      reliabilityScore: 98,
      evidenceClassification: 'Verified Primary / Standard',
    });
  }

  return sources;
}

export function buildGroundedBrandFallback(params: {
  query: string;
  classification: BrandQueryClassification;
  brand: OfficialBrandKnowledge;
  announcements: OfficialBrandAnnouncement[];
  requestedLanguage?: string;
}): {
  directAnswer: string;
  detailedExplanation: string;
  simpleExplanation: string;
} {
  const { classification, brand, announcements } = params;
  const lang = classification.detectedLang !== 'en'
    ? classification.detectedLang
    : detectQueryLanguage(params.requestedLanguage || '', params.requestedLanguage);

  const foundingStr = formatBrandDateDisplay(brand.officialFoundingDate, lang);
  const launchStr = formatBrandDateDisplay(brand.publicLaunchDate, lang);
  const devStr = formatBrandDateDisplay(brand.developmentStartDate, lang);

  if (classification.isSecurityProbe) {
    const refusal =
      lang === 'fr'
        ? `Pour des raisons de sécurité, 2MR ne divulgue jamais de clés API, de mots de passe administrateurs, de jetons de session ni de configurations internes. Pour toute assistance officielle, contactez ${brand.contactEmail}.`
        : lang === 'rw'
          ? `Ku mpamvu z'umutekano, 2MR ntitangaza imibare y'ibanga, API keys, cyangwa amakuru y'abagenzuzi b'imbere muri sisitemu. Kubindi bisobanuro mwandikire ${brand.contactEmail}.`
          : `For security and privacy protection, 2MR cannot reveal API keys, administrator passwords, authentication tokens, private admin account data, or internal security configurations. For authorized public inquiries, please contact ${brand.contactEmail}.`;
    return {
      directAnswer: refusal,
      detailedExplanation: refusal,
      simpleExplanation: refusal,
    };
  }

  const sub = classification.subIntent || 'overview';

  if (sub === 'founder') {
    if (lang === 'rw') {
      const ans = `${brand.officialName} yashinzwe kandi yakozwe na ${brand.founderName} (${brand.founderTitle}).`;
      const det = `${ans}\n\n${brand.founderBio}${foundingStr ? `\n\nItariki yashinzweho: ${foundingStr}.` : ''}\nIntego nyamukuru ni: *"${brand.slogan}"* — ${brand.purpose}`;
      return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
    }
    if (lang === 'fr') {
      const ans = `${brand.officialName} a été fondé et créé par ${brand.founderName} (${brand.founderTitle}).`;
      const det = `${ans}\n\n${brand.founderBio}${foundingStr ? `\n\nDate de fondation officielle : ${foundingStr}.` : ''}\nSlogan officiel : *« ${brand.slogan} »*.`;
      return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
    }
    const ans = `${brand.officialName} was founded and created by ${brand.founderName} (${brand.founderTitle}).`;
    const det = `${ans}\n\n${brand.founderBio}\n\n- **Official Name:** ${brand.officialName}\n- **Founder & Creator:** ${brand.founderName}\n- **Official Founding Date:** ${foundingStr || 'Not yet publicly confirmed'}\n- **Official Slogan:** "${brand.slogan}"\n- **Vision:** ${brand.vision}`;
    return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
  }

  if (sub === 'founding_date') {
    if (!foundingStr) {
      const unconf =
        lang === 'fr'
          ? "La date officielle de fondation de 2MR n'a pas encore été confirmée publiquement. Veuillez consulter les annonces officielles de 2MR pour des mises à jour vérifiées."
          : lang === 'rw'
            ? "Itariki nyakuri 2MR yashinzweho ntiratangazwa ku mugaragaro. Nyamuneka musuzume amakuru nyayo ya 2MR."
            : 'The official founding or launch date of 2MR has not yet been publicly confirmed. Please check the official 2MR announcements for verified updates.';
      return { directAnswer: unconf, detailedExplanation: unconf, simpleExplanation: unconf };
    }
    if (lang === 'rw') {
      const ans = `${brand.officialName} yashinzwe ku wa ${foundingStr} na ${brand.founderName}.`;
      const det = `${ans}\n\n${brand.originStory}${launchStr ? `\n\nItariki yo gutangizwa ku mugaragaro: ${launchStr}.` : '\n\nItariki yo gutangizwa ku mugaragaro (Public Launch Date) ntiratangazwa kumugaragaro.'}`;
      return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
    }
    if (lang === 'fr') {
      const ans = `${brand.officialName} a été fondé le ${foundingStr} par ${brand.founderName}.`;
      const det = `${ans}\n\n${brand.originStory}${launchStr ? `\n\nDate de lancement public : ${launchStr}.` : "\n\nNote : La date officielle de lancement public de 2MR n'a pas encore été confirmée publiquement."}`;
      return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
    }
    const ans = `${brand.officialName} was founded on ${foundingStr} by ${brand.founderName}.`;
    const det = `${ans}\n\n- **Official Founding Date:** ${foundingStr}\n- **Founder & Creator:** ${brand.founderName}\n- **Public Launch Date:** ${launchStr || 'Not yet publicly confirmed — check official 2MR announcements for verified updates.'}\n\n${brand.originStory}`;
    return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
  }

  if (sub === 'launch_date') {
    if (!launchStr) {
      const ans =
        lang === 'fr'
          ? `La date officielle de lancement public de 2MR n'a pas encore été confirmée publiquement. Veuillez consulter les annonces officielles de 2MR pour des mises à jour vérifiées.${foundingStr ? ` (Pour information, 2MR a été fondé le ${foundingStr} par ${brand.founderName}.)` : ''}`
          : lang === 'rw'
            ? `Itariki nyakuri 2MR izatangirizwaho ku mugaragaro ntiratangazwa. Nyamuneka musuzume amakuru nyayo ya 2MR kugira ngo mubone ibyemejwe.${foundingStr ? ` (2MR yashinzwe ku wa ${foundingStr} na ${brand.founderName}.)` : ''}`
            : `The official public launch date of 2MR has not yet been publicly confirmed. Please check the official 2MR announcements for verified updates.${foundingStr ? ` (Note: While the public launch date is unconfirmed, ${brand.officialName} was officially founded on ${foundingStr} by ${brand.founderName}.)` : ''}`;
      return { directAnswer: ans, detailedExplanation: ans, simpleExplanation: ans };
    }
    const ans = `${brand.officialName} has a verified Public Launch Date of ${launchStr}.`;
    const det = `${ans}\n\n- **Public Launch Date:** ${launchStr}\n- **Official Founding Date:** ${foundingStr || 'Not specified'}\n- **Founder:** ${brand.founderName}`;
    return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
  }

  if (sub === 'development_date') {
    if (!devStr) {
      const ans = `The official development start date of 2MR has not yet been publicly confirmed.${foundingStr ? ` 2MR was officially founded on ${foundingStr} by ${brand.founderName}.` : ''}`;
      return { directAnswer: ans, detailedExplanation: ans, simpleExplanation: ans };
    }
    const ans = `2MR development officially began on ${devStr}.`;
    return { directAnswer: ans, detailedExplanation: ans, simpleExplanation: ans };
  }

  if (sub === 'meaning') {
    if (lang === 'rw') {
      const ans = `2MR bisobanura "${brand.acronymMeaning}" (${brand.officialName}).`;
      const det = `${ans}\n\nYashinzwe na ${brand.founderName}${foundingStr ? ` ku wa ${foundingStr}` : ''}, ifite intego igira iti: *"${brand.slogan}"*. ${brand.purpose}`;
      return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
    }
    if (lang === 'fr') {
      const ans = `2MR signifie « ${brand.acronymMeaning} » (${brand.officialName}).`;
      const det = `${ans}\n\nFondée par ${brand.founderName}${foundingStr ? ` le ${foundingStr}` : ''}, la plateforme porte le slogan *« ${brand.slogan} »* avec pour vision : ${brand.vision}`;
      return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
    }
    const ans = `2MR stands for "${brand.acronymMeaning}" — officially ${brand.officialName}.`;
    const det = `${ans}\n\n- **Official Slogan:** "${brand.slogan}"\n- **Vision:** ${brand.vision}\n- **Purpose:** ${brand.purpose}\n- **Founder:** ${brand.founderName}`;
    return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
  }

  if (sub === 'features') {
    const featLines = brand.coreFeatures
      .map((f, i) => `${i + 1}. **${f.name}** — ${f.description}`)
      .join('\n');
    const ans = `${brand.officialName} brings together ${brand.coreFeatures.length} core research workspaces including ${brand.coreFeatures.map((f) => f.name).join(', ')}.`;
    const det = `${ans}\n\n${featLines}`;
    return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
  }

  if (sub === 'announcements') {
    if (announcements.length === 0) {
      const ans = `There are currently no additional official public announcements posted on ${brand.officialName}. Check the official 2MR About page for verified updates.`;
      return { directAnswer: ans, detailedExplanation: ans, simpleExplanation: ans };
    }
    const ans = `Latest official ${brand.officialName} announcements (${announcements.length} published): ${announcements[0].title} (${announcements[0].announcementDate}).`;
    const det = announcements
      .map((a) => `### ${a.title} (${a.announcementDate})\n${a.summary}\n\n${a.body}`)
      .join('\n\n');
    return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
  }

  if (sub === 'purpose_mission') {
    const ans = `${brand.officialName} was created by ${brand.founderName} to help people discover information, conduct research, understand complex topics, analyze knowledge, and organize research.`;
    const det = `${ans}\n\n- **Official Slogan:** "${brand.slogan}"\n- **Vision:** ${brand.vision}\n- **Mission:** ${brand.mission}\n- **Purpose:** ${brand.purpose}\n- **Official Founding Date:** ${foundingStr || 'Not yet confirmed'}`;
    return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
  }

  // General overview
  const ans = `${brand.officialName} is a ${brand.vision.replace(/\.$/, '')} founded by ${brand.founderName}${foundingStr ? ` on ${foundingStr}` : ''}. Slogan: "${brand.slogan}".`;
  const det = `${ans}\n\n${brand.purpose}\n\n**Main Features:**\n${brand.coreFeatures
    .map((f, i) => `${i + 1}. **${f.name}** — ${f.description}`)
    .join('\n')}\n\n- **Official Founding Date:** ${foundingStr || 'Not yet confirmed'}\n- **Public Launch Date:** ${launchStr || 'Not yet publicly confirmed'}\n- **Supported Languages:** ${brand.supportedLanguages.join(', ')}`;
  return { directAnswer: ans, detailedExplanation: det, simpleExplanation: ans };
}
