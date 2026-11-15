import { db } from '../db/index.ts';
import { sourceMetadata, sourceVerificationLogs } from '../db/schema.ts';
import { runLiveMultiSourceSearch, LiveSearchResult } from './searchProvider.ts';
import { getPublicCache, setPublicCache } from './cache.ts';
import { enqueueBackgroundJob } from './backgroundQueue.ts';

export interface ProvenanceSource extends LiveSearchResult {
  sourceType: string;
  publisher: string;
  retrievalDate: string;
  reliabilityScore: number;
  reliabilityTier: 'High Reliability' | 'Standard Reference' | 'Community / Preprint';
  evidenceClassification: 'Verified Primary / Standard' | 'Scholarly Preprint' | 'Encyclopedic Summary';
}

export async function searchOpenAlex(
  query: string,
  limit = 4,
  timeoutMs = 2800
): Promise<LiveSearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}&select=id,title,publication_date,doi,primary_location,authorships,concepts`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': '2MR-Global-Research/1.0 (mailto:2mr@proton.me)' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const results = json?.results || [];

    return results
      .filter((w: any) => w.title && (w.doi || w.primary_location?.landing_page_url || w.id))
      .map((w: any, idx: number) => {
        const landingUrl = w.doi || w.primary_location?.landing_page_url || w.id;
        const venue = w.primary_location?.source?.display_name || 'OpenAlex Scholarly Index';
        const authors = (w.authorships || [])
          .slice(0, 4)
          .map((a: any) => a.author?.display_name)
          .filter(Boolean);
        const concepts = (w.concepts || [])
          .slice(0, 4)
          .map((c: any) => c.display_name)
          .filter(Boolean);

        return {
          id: `openalex-${idx}-${w.publication_date || 'nd'}`,
          title: String(w.title),
          url: String(landingUrl),
          domain: String(landingUrl).includes('doi.org') ? 'doi.org' : 'openalex.org',
          snippet: `Indexed in OpenAlex via ${venue} (${w.publication_date || 'n.d.'}). Topics: ${concepts.join(', ') || 'Academic Research'}.`,
          modality: 'academic',
          sourceName: venue,
          publishedDate: w.publication_date || '',
          authors,
          keywords: concepts,
          doi: w.doi ? String(w.doi).replace('https://doi.org/', '') : null,
          provider: 'crossref' as const,
        };
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export function classifySourceProvenance(item: LiveSearchResult): ProvenanceSource {
  const retrievalDate = new Date().toISOString().slice(0, 10);
  let reliabilityScore = 76;
  let reliabilityTier: ProvenanceSource['reliabilityTier'] = 'Standard Reference';
  let evidenceClassification: ProvenanceSource['evidenceClassification'] = 'Encyclopedic Summary';
  let sourceType = 'Reference Source';

  if (item.provider === '2mr_index' && /\.(gov|int|edu)|nist\.gov|who\.int|ipcc\.ch|fao\.org/i.test(item.domain)) {
    reliabilityScore = 95;
    reliabilityTier = 'High Reliability';
    evidenceClassification = 'Verified Primary / Standard';
    sourceType = 'Official Institutional / Standard';
  } else if (item.provider === 'crossref' || item.doi) {
    reliabilityScore = 90;
    reliabilityTier = 'High Reliability';
    evidenceClassification = 'Verified Primary / Standard';
    sourceType = 'Peer-Reviewed Journal / DOI';
  } else if (item.provider === 'arxiv') {
    reliabilityScore = 78;
    reliabilityTier = 'Community / Preprint';
    evidenceClassification = 'Scholarly Preprint';
    sourceType = 'Academic Preprint (Not Yet Peer-Reviewed)';
  } else if (item.provider === 'wikipedia') {
    reliabilityScore = 70;
    reliabilityTier = 'Standard Reference';
    evidenceClassification = 'Encyclopedic Summary';
    sourceType = 'Open Encyclopedia';
  }

  return {
    ...item,
    sourceType,
    publisher: item.sourceName,
    retrievalDate,
    reliabilityScore,
    reliabilityTier,
    evidenceClassification,
  };
}

export async function discoverVerifiedSourcesWithMetrics(
  query: string,
  modality = 'all',
  categorySlug?: string,
  options?: {
    budgetMs?: number;
    includeAcademic?: boolean;
    maxResults?: number;
    cacheTtlSeconds?: number;
  }
): Promise<{
  sources: ProvenanceSource[];
  searchLatencyMs: number;
  cacheHit: boolean;
}> {
  const t0 = performance.now();
  const budgetMs = options?.budgetMs ?? 3200;
  const includeAcademic = options?.includeAcademic ?? true;
  const maxResults = options?.maxResults ?? 12;
  const cacheTtlSeconds = options?.cacheTtlSeconds ?? 600;
  const cacheKey = `${modality}:${categorySlug || 'none'}:${includeAcademic ? 'acad' : 'lite'}:${query}`;

  const cached = await getPublicCache<ProvenanceSource[]>('search', cacheKey);
  if (cached !== null) {
    return {
      sources: cached.slice(0, maxResults),
      searchLatencyMs: Math.round(performance.now() - t0),
      cacheHit: true,
    };
  }

  const [baseResults, openAlexResults] = await Promise.all([
    runLiveMultiSourceSearch(query, modality, categorySlug, {
      budgetMs,
      includeAcademic,
      maxPerSource: includeAcademic ? 4 : 3,
    }),
    includeAcademic && (modality === 'all' || modality === 'academic' || modality === 'research')
      ? searchOpenAlex(query, 4, Math.min(budgetMs, 2800))
      : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const combined: ProvenanceSource[] = [];
  for (const item of [...baseResults, ...openAlexResults]) {
    const key = (item.url || item.title).toLowerCase().trim();
    if (!seen.has(key) && item.title && item.url) {
      seen.add(key);
      combined.push(classifySourceProvenance(item));
    }
  }

  if (combined.length > 0) {
    await setPublicCache('search', cacheKey, combined, cacheTtlSeconds);

    const topSources = combined.slice(0, 4);
    enqueueBackgroundJob('persist-source-provenance', async () => {
      await Promise.all([
        db.insert(sourceMetadata).values(
          topSources.map((s) => ({
            url: s.url,
            title: s.title,
            publisher: s.publisher,
            author: s.authors.join(', ') || null,
            publishedDate: s.publishedDate || null,
            sourceType: s.sourceType,
            relevantExcerpt: s.snippet,
            retrievalDate: s.retrievalDate,
            reliabilityScore: s.reliabilityScore,
            reliabilityNotes: s.evidenceClassification,
          }))
        ),
        db.insert(sourceVerificationLogs).values(
          topSources.map((s) => ({
            topic: query.slice(0, 120),
            sourceUrl: s.url,
            verificationOutcome:
              s.evidenceClassification === 'Verified Primary / Standard' ? 'verified' : 'reported_claim',
            claimChecked: s.title,
            notes: `Retrieved via ${s.provider} (${s.reliabilityTier})`,
          }))
        ),
      ]);
    });
  }

  return {
    sources: combined.slice(0, maxResults),
    searchLatencyMs: Math.round(performance.now() - t0),
    cacheHit: false,
  };
}

export async function discoverVerifiedSources(
  query: string,
  modality = 'all',
  categorySlug?: string
): Promise<ProvenanceSource[]> {
  const res = await discoverVerifiedSourcesWithMetrics(query, modality, categorySlug);
  return res.sources;
}
