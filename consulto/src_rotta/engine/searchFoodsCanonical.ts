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

console.log('[searchFoodsCanonical] module loaded');

/**
 * Pure, server-safe canonical search entrypoint.
 *
 * This function does not access browser APIs, React state, Firebase client SDK,
 * or any mutable module-level dataset. If no dataset is passed, it safely
 * returns an empty array.
 */
export async function searchFoodsCanonical(
  query: string,
  options: {
    maxSearchResults?: number;
    dataset?: CanonicalSearchResultItem[] | CanonicalSearchResultItem | null;
  } = {},
): Promise<CanonicalSearchResultItem[]> {
  const normalizedQuery = String(query ?? '').trim();
  const rawMaxSearchResults = Number(options?.maxSearchResults);
  const maxSearchResults =
    Number.isFinite(rawMaxSearchResults) && rawMaxSearchResults > 0
      ? rawMaxSearchResults
      : 10;

  console.log('[searchFoodsCanonical] running', {
    query: normalizedQuery,
    maxSearchResults,
  });

  if (!normalizedQuery) return [];
  if (options == null || typeof options !== 'object') return [];

  const dataset = options?.dataset;
  if (!dataset) return [];

  const safeResults: CanonicalSearchResultItem[] = [];
  const inputItems = Array.isArray(dataset) ? dataset : [dataset];

  for (const item of inputItems) {
    if (!item || typeof item !== 'object') continue;

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
    const nameEn = maybeItem.food?.name_en != null ? String(maybeItem.food.name_en) : null;
    const score = Number(maybeItem.score);

    if (!id || !nameIt) continue;

    safeResults.push({
      food: {
        id,
        name_it: nameIt,
        name_en: nameEn,
      },
      score: Number.isFinite(score) ? score : undefined,
      canonicalId: maybeItem.canonicalId != null ? String(maybeItem.canonicalId) : null,
      canonicalFood: maybeItem.canonicalFood ?? null,
    });
  }

  console.log('[searchFoodsCanonical] completed', {
    query: normalizedQuery,
    resultCount: safeResults.length,
  });

  return safeResults.slice(0, maxSearchResults);
}

