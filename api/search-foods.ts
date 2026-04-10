import {
  searchFoodsCanonical,
  type CanonicalSearchResultItem,
} from '../src/engine/searchFoodsCanonical';

type ApiRequestLike = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
};

type ApiResponseLike = {
  status: (code: number) => ApiResponseLike;
  json: (body: unknown) => void;
};

function extractQueryParam(req: ApiRequestLike, key: string): string {
  const rawFromQuery = req.query?.[key];
  if (Array.isArray(rawFromQuery)) return String(rawFromQuery[0] || '').trim();
  if (typeof rawFromQuery === 'string') return rawFromQuery.trim();

  if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      return String(url.searchParams.get(key) || '').trim();
    } catch {
      return '';
    }
  }

  return '';
}

function mapResult(item: CanonicalSearchResultItem) {
  return {
    id: item.food.id,
    name_it: item.food.name_it,
    score: typeof item.score === 'number' ? item.score : null,
  };
}

export default async function handler(
  req: ApiRequestLike,
  res: ApiResponseLike,
): Promise<void> {
  console.log('[api/search-foods] endpoint executed');

  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const q = extractQueryParam(req, 'q');
  console.log('[api/search-foods] request', { q });

  if (!q) {
    res.status(200).json({ results: [] });
    return;
  }

  try {
    const results = await searchFoodsCanonical(q, { maxSearchResults: 10 });
    console.log('[api/search-foods] returning results', {
      q,
      resultCount: results.length,
    });
    res.status(200).json({
      results: results.slice(0, 5).map(mapResult),
    });
  } catch (error) {
    console.error('[api/search-foods] search failed', error);
    res.status(500).json({ error: 'Food search failed' });
  }
}

