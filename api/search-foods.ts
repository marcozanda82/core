import {
  searchFoodsCanonical,
} from '../src/engine/searchFoodsCanonical';

export default async function handler(req, res) {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Missing query' });
    }

    console.log('[api/search-foods] START', { q });

    let results = [];

    try {
      results = await searchFoodsCanonical(q);
    } catch (innerError) {
      console.error('[api/search-foods] searchFoodsCanonical failed', innerError);
    }

    console.log('[api/search-foods] SUCCESS', { count: results?.length || 0 });

    return res.status(200).json({
      results: results || [],
    });

  } catch (error) {
    console.error('[api/search-foods] FATAL', error);

    return res.status(200).json({
      results: [],
      fallback: true,
    });
  }
}

