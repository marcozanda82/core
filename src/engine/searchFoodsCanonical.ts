export type CanonicalSearchResultItem = {
  food: {
    id: string;
    name_it: string;
    name_en?: string | null;
  };
  score?: number;
  canonicalId?: string | null;
  canonicalFood?: unknown;
};

type SearchFoodsCanonicalImplementation = (
  query: string,
  options?: { maxSearchResults?: number }
) => Promise<CanonicalSearchResultItem[] | CanonicalSearchResultItem | null>;

let implementation: SearchFoodsCanonicalImplementation | null = null;

/**
 * Allows the real backend engine to register the canonical food search implementation.
 * Until then, callers receive an empty result set instead of crashing on import.
 */
export function registerSearchFoodsCanonical(
  fn: SearchFoodsCanonicalImplementation,
): void {
  implementation = fn;
}

/**
 * Backend-facing canonical food search entrypoint.
 * This endpoint intentionally uses only this function and never performs DB queries directly.
 */
export async function searchFoodsCanonical(
  query: string,
  options: { maxSearchResults?: number } = {},
): Promise<CanonicalSearchResultItem[]> {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) return [];

  console.log('[searchFoodsCanonical] called', {
    query: normalizedQuery,
    maxSearchResults: options.maxSearchResults ?? null,
  });

  if (!implementation) {
    console.warn('[searchFoodsCanonical] No backend implementation registered yet.');
    return [];
  }

  const result = await implementation(normalizedQuery, options);
  const normalizedResult = !result ? [] : (Array.isArray(result) ? result : [result]);

  console.log('[searchFoodsCanonical] completed', {
    query: normalizedQuery,
    resultCount: normalizedResult.length,
  });

  return normalizedResult;
}

