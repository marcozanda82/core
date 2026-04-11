import {
  searchFoodsCanonical,
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

function mapResult(item: any) {
  return {
    id: item?.food?.id || item?.fdcId || item?.id || item?.code || Math.random().toString(36).substring(7),
    name_it: item?.food?.name_it || item?.food?.name || item?.name_it || item?.product_name || item?.name || item?.description || 'Alimento sconosciuto',
    score: typeof item?.score === 'number' ? item.score : null,
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
    console.log('[api/search-foods] before search execution', { q });
    const rawData: any = await searchFoodsCanonical(q);
    const resultsArray = Array.isArray(rawData) ? rawData : (rawData?.results || rawData?.foods || rawData?.products || []);
    console.log('[api/search-foods] raw results', resultsArray);
    console.log('[api/search-foods] returning results', {
      q,
      resultCount: resultsArray.length,
    });
    res.status(200).json({
      results: resultsArray.slice(0, 15).map(mapResult),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[api/search-foods] search failed', {
      q,
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      ok: false,
      error: err.message,
      stack: err.stack,
    });
  }
}

