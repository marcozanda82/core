export type CanonicalSearchFood = {
  id: string;
  name_it: string;
  name_en?: string | null;
};

export type CanonicalSearchMatch = {
  food: CanonicalSearchFood;
  score: number;
  matchType: 'exact' | 'fulltext' | 'fuzzy';
  canonicalId: string | null;
  canonicalFood: unknown;
};

export type SearchFoodsConfig = {
  maxSearchResults?: number;
};

type SearchStageFn = (
  query: string,
  config: Required<SearchFoodsConfig>,
) => Promise<CanonicalSearchMatch[] | CanonicalSearchMatch | null>;

type SearchFoodsCanonicalDependencies = {
  aliasSearch?: SearchStageFn;
  fullTextSearch?: SearchStageFn;
  fuzzySearch?: SearchStageFn;
};

const DEFAULT_CONFIG: Required<SearchFoodsConfig> = {
  maxSearchResults: 10,
};

let dependencies: SearchFoodsCanonicalDependencies = {};

/**
 * Registers backend search adapters used by `searchFoodsCanonicalList`.
 * The engine file itself stays free of direct DB queries.
 */
export function registerSearchFoodsCanonicalDependencies(
  next: SearchFoodsCanonicalDependencies,
): void {
  dependencies = {
    ...dependencies,
    ...next,
  };
}

function normalizeQuery(query: string): string {
  return String(query || '').trim();
}

function normalizeStageResults(
  result: CanonicalSearchMatch[] | CanonicalSearchMatch | null | undefined,
): CanonicalSearchMatch[] {
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

function sanitizeMatch(match: CanonicalSearchMatch): CanonicalSearchMatch | null {
  const id = String(match?.food?.id ?? '').trim();
  const nameIt = String(match?.food?.name_it ?? '').trim();
  const score = Number(match?.score ?? 0);

  if (!id || !nameIt || !Number.isFinite(score)) return null;

  return {
    food: {
      id,
      name_it: nameIt,
      name_en: match?.food?.name_en ?? null,
    },
    score,
    matchType: match.matchType,
    canonicalId: match?.canonicalId != null ? String(match.canonicalId) : null,
    canonicalFood: match?.canonicalFood ?? null,
  };
}

function canonicalDedupKey(match: CanonicalSearchMatch): string {
  return match.canonicalId && String(match.canonicalId).trim() !== ''
    ? `canonical:${match.canonicalId}`
    : `food:${match.food.id}`;
}

function chooseBetterMatch(
  current: CanonicalSearchMatch | undefined,
  candidate: CanonicalSearchMatch,
): CanonicalSearchMatch {
  if (!current) return candidate;

  if (candidate.score > current.score) return candidate;
  if (candidate.score < current.score) return current;

  const priority = { exact: 3, fulltext: 2, fuzzy: 1 };
  return priority[candidate.matchType] > priority[current.matchType]
    ? candidate
    : current;
}

/**
 * Returns multiple canonical search matches by combining:
 *  1. alias exact matches
 *  2. full-text canonical matches
 *  3. fuzzy canonical matches
 *
 * Rules:
 * - no early return
 * - dedupe by canonicalId when present
 * - keep highest-score representative
 * - sort descending by score
 * - limit to `config.maxSearchResults`
 */
export async function searchFoodsCanonicalList(
  query: string,
  config: SearchFoodsConfig = {},
): Promise<CanonicalSearchMatch[]> {
  const normalizedQuery = normalizeQuery(query);
  const finalConfig: Required<SearchFoodsConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  if (!normalizedQuery) return [];

  const [aliasResults, fullTextResults, fuzzyResults] = await Promise.all([
    dependencies.aliasSearch
      ? dependencies.aliasSearch(normalizedQuery, finalConfig)
      : Promise.resolve(null),
    dependencies.fullTextSearch
      ? dependencies.fullTextSearch(normalizedQuery, finalConfig)
      : Promise.resolve(null),
    dependencies.fuzzySearch
      ? dependencies.fuzzySearch(normalizedQuery, finalConfig)
      : Promise.resolve(null),
  ]);

  const combined = [
    ...normalizeStageResults(aliasResults),
    ...normalizeStageResults(fullTextResults),
    ...normalizeStageResults(fuzzyResults),
  ]
    .map(sanitizeMatch)
    .filter(Boolean) as CanonicalSearchMatch[];

  const deduped = new Map<string, CanonicalSearchMatch>();

  for (const match of combined) {
    const key = canonicalDedupKey(match);
    deduped.set(key, chooseBetterMatch(deduped.get(key), match));
  }

  return [...deduped.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      const priority = { exact: 3, fulltext: 2, fuzzy: 1 };
      if (priority[b.matchType] !== priority[a.matchType]) {
        return priority[b.matchType] - priority[a.matchType];
      }

      return a.food.name_it.localeCompare(b.food.name_it, 'it', { sensitivity: 'base' });
    })
    .slice(0, finalConfig.maxSearchResults);
}

