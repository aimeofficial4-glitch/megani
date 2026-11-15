import { desc, eq, ilike, or, and } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { indexedDocuments } from '../db/schema.ts';

export interface LiveSearchResult {
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
  provider: 'crossref' | 'arxiv' | 'wikipedia' | '2mr_index';
}

function cleanXml(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchCrossRef(
  query: string,
  limit = 5,
  timeoutMs = 3200
): Promise<LiveSearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}&select=DOI,title,author,published-print,published-online,created,container-title,URL,subject,abstract`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': '2MR-Global-Research/1.0 (mailto:2mr@proton.me)' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const items = json?.message?.items || [];

    return items
      .filter((item: any) => item.title && item.title[0] && item.URL)
      .map((item: any, idx: number) => {
        const authors = (item.author || [])
          .slice(0, 4)
          .map((a: any) => [a.given, a.family].filter(Boolean).join(' '))
          .filter(Boolean);
        const dateParts =
          item['published-print']?.['date-parts']?.[0] ||
          item['published-online']?.['date-parts']?.[0] ||
          item.created?.['date-parts']?.[0];
        const pubDate = dateParts ? dateParts.slice(0, 3).join('-') : '';
        const journal = item['container-title']?.[0] || 'CrossRef Scholarly Record';
        const rawAbstract = item.abstract ? cleanXml(item.abstract) : '';
        const snippet =
          rawAbstract.slice(0, 240) + (rawAbstract.length > 240 ? '...' : '') ||
          `Peer-reviewed publication indexed via CrossRef in ${journal}.`;

        return {
          id: `crossref-${item.DOI || idx}`,
          title: cleanXml(item.title[0]),
          url: item.URL,
          domain: 'doi.org',
          snippet,
          modality: 'academic',
          sourceName: journal,
          publishedDate: pubDate,
          authors,
          keywords: (item.subject || []).slice(0, 4),
          doi: item.DOI || null,
          provider: 'crossref' as const,
        };
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchArxiv(
  query: string,
  limit = 4,
  timeoutMs = 3200
): Promise<LiveSearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const xml = await res.text();

    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    return entries.map((entry, idx) => {
      const title = cleanXml((entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
      const summary = cleanXml((entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || '');
      const link = cleanXml((entry.match(/<id>([\s\S]*?)<\/id>/) || [])[1] || '');
      const published = cleanXml((entry.match(/<published>([\s\S]*?)<\/published>/) || [])[1] || '').slice(0, 10);
      const authorMatches = entry.match(/<name>([\s\S]*?)<\/name>/g) || [];
      const authors = authorMatches.slice(0, 4).map((m) => cleanXml(m));

      return {
        id: `arxiv-${idx}-${published}`,
        title,
        url: link,
        domain: 'arxiv.org',
        snippet: summary.slice(0, 240) + (summary.length > 240 ? '...' : ''),
        modality: 'research',
        sourceName: 'arXiv Preprint Repository',
        publishedDate: published,
        authors,
        keywords: ['Preprint', 'arXiv'],
        doi: null,
        provider: 'arxiv' as const,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchWikipedia(
  query: string,
  limit = 4,
  timeoutMs = 2400
): Promise<LiveSearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': '2MR-Global-Research/1.0' },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const hits = json?.query?.search || [];

    return hits.map((hit: any) => {
      const slug = encodeURIComponent(String(hit.title).replace(/ /g, '_'));
      return {
        id: `wiki-${hit.pageid}`,
        title: hit.title,
        url: `https://en.wikipedia.org/wiki/${slug}`,
        domain: 'en.wikipedia.org',
        snippet: cleanXml(hit.snippet || ''),
        modality: 'websites',
        sourceName: 'Wikipedia Open Encyclopedia',
        publishedDate: (hit.timestamp || '').slice(0, 10),
        authors: ['Wikipedia Contributors'],
        keywords: ['Encyclopedia', 'Reference'],
        doi: null,
        provider: 'wikipedia' as const,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchPermittedIndex(
  query: string,
  modality = 'all',
  categorySlug?: string,
  limit = 10
): Promise<LiveSearchResult[]> {
  try {
    const conditions: any[] = [eq(indexedDocuments.isPublished, true)];
    if (query.trim()) {
      const pattern = `%${query.trim()}%`;
      conditions.push(
        or(
          ilike(indexedDocuments.title, pattern),
          ilike(indexedDocuments.snippet, pattern),
          ilike(indexedDocuments.sourceName, pattern)
        )
      );
    }
    if (modality !== 'all') {
      conditions.push(eq(indexedDocuments.modality, modality));
    }
    if (categorySlug) {
      conditions.push(eq(indexedDocuments.categorySlug, categorySlug));
    }

    const rows = await db
      .select({
        id: indexedDocuments.id,
        title: indexedDocuments.title,
        url: indexedDocuments.url,
        domain: indexedDocuments.domain,
        snippet: indexedDocuments.snippet,
        modality: indexedDocuments.modality,
        sourceName: indexedDocuments.sourceName,
        publishedDate: indexedDocuments.publishedDate,
        authors: indexedDocuments.authors,
        keywords: indexedDocuments.keywords,
        doi: indexedDocuments.doi,
      })
      .from(indexedDocuments)
      .where(and(...conditions))
      .orderBy(desc(indexedDocuments.isFeatured), desc(indexedDocuments.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      domain: r.domain,
      snippet: r.snippet,
      modality: r.modality,
      sourceName: r.sourceName,
      publishedDate: r.publishedDate || '',
      authors: (r.authors as string[]) || [],
      keywords: (r.keywords as string[]) || [],
      doi: r.doi,
      provider: '2mr_index' as const,
    }));
  } catch (err) {
    console.error('Permitted index search error:', err);
    return [];
  }
}

export async function runLiveMultiSourceSearch(
  query: string,
  modality = 'all',
  categorySlug?: string,
  options?: { budgetMs?: number; includeAcademic?: boolean; maxPerSource?: number }
): Promise<LiveSearchResult[]> {
  const budgetMs = options?.budgetMs ?? 3200;
  const includeAcademic = options?.includeAcademic ?? true;
  const maxPerSource = options?.maxPerSource ?? 4;

  const [localIndex, crossref, arxiv, wiki] = await Promise.all([
    searchPermittedIndex(query, modality, categorySlug, maxPerSource + 4),
    includeAcademic && (modality === 'all' || modality === 'academic' || modality === 'research')
      ? searchCrossRef(query, maxPerSource, budgetMs)
      : Promise.resolve([]),
    includeAcademic && (modality === 'all' || modality === 'research' || modality === 'academic')
      ? searchArxiv(query, Math.min(maxPerSource, 3), budgetMs)
      : Promise.resolve([]),
    modality === 'all' || modality === 'websites'
      ? searchWikipedia(query, Math.min(maxPerSource, 3), Math.min(budgetMs, 2400))
      : Promise.resolve([]),
  ]);

  const combined = [...localIndex, ...arxiv, ...crossref, ...wiki];

  const seen = new Set<string>();
  const deduped: LiveSearchResult[] = [];
  for (const item of combined) {
    const key = (item.url || item.title).toLowerCase().trim();
    if (!seen.has(key) && item.title) {
      seen.add(key);
      deduped.push(item);
    }
  }
  return deduped;
}
