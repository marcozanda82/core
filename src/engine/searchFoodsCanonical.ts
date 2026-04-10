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

console.log('[searchFoodsCanonical] loaded');

function normalizeQueryInput(query: unknown): string {
  return String(query ?? '').trim();
}

function normalizeOptions(
  options: { maxSearchResults?: number } | null | undefined,
): { maxSearchResults?: number } {
  const maxSearchResults = Number(options?.maxSearchResults);
  return Number.isFinite(maxSearchResults) && maxSearchResults > 0
    ? { maxSearchResults }
    : {};
}

function normalizeSingleResult(
  item: unknown,
): CanonicalSearchResultItem | null {
  if (!item || typeof item !== 'object') return null;

  const maybeItem = item as {
    food?: {
      id?: unknown;
      name_it?: unknown;
      name_en?: unknown;
    } | null;
    score?: unknown;
    canonicalId?: unknown;
    canonicalFood?: unknown;
  };

  const id = String(maybeItem.food?.id ?? '').trim();
  const nameIt = String(maybeItem.food?.name_it ?? '').trim();

  if (!id || !nameIt) return null;

  const rawScore = Number(maybeItem.score);

  return {
    food: {
      id,
      name_it: nameIt,
      name_en: maybeItem.food?.name_en != null ? String(maybeItem.food.name_en) : null,
    },
    score: Number.isFinite(rawScore) ? rawScore : undefined,
    canonicalId: maybeItem.canonicalId != null ? String(maybeItem.canonicalId) : null,
    canonicalFood: maybeItem.canonicalFood ?? null,
  };
}

function normalizeResults(
  dataset: CanonicalSearchResultItem[] | CanonicalSearchResultItem | null | undefined,
): CanonicalSearchResultItem[] {
  if (!dataset) return [];

  if (Array.isArray(dataset)) {
    const safeResults: CanonicalSearchResultItem[] = [];
    for (const item of dataset) {
      const normalized = normalizeSingleResult(item);
      if (normalized) safeResults.push(normalized);
    }
    return safeResults;
  }

  const normalized = normalizeSingleResult(dataset);
  return normalized ? [normalized] : [];
}

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
  const normalizedQuery = normalizeQueryInput(query);
  const normalizedOptions = normalizeOptions(options);

  console.log('[searchFoodsCanonical] executing', {
    query: normalizedQuery,
    maxSearchResults: normalizedOptions.maxSearchResults ?? null,
  });

  if (!normalizedQuery) return [];

  if (!implementation) {
    console.warn('[searchFoodsCanonical] No backend implementation registered yet.');
    return [];
  }

  const result = await implementation(normalizedQuery, normalizedOptions);
  const normalizedResult = normalizeResults(result);

  console.log('[searchFoodsCanonical] completed', {
    query: normalizedQuery,
    resultCount: normalizedResult.length,
  });

  return normalizedResult;
}

