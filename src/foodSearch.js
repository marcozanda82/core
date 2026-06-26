function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RECENT_FOODS_STORAGE_KEY = 'recent_foods';
const RECENT_FOOD_HIGH_WINDOW_MS = 24 * 60 * 60 * 1000;
const SEARCH_SYNONYMS = {
  arrosto: ['cotto'],
  pollo: ['chicken'],
};

/** Punteggi ranking (0–100). Sotto MIN_MATCH_SCORE → escluso. Fuzzy disabilitato. */
const SCORE_EXACT_OR_PREFIX = 100;
const SCORE_WORD_BOUNDARY = 75;
const SCORE_SUBSTRING = 50;
const MIN_MATCH_SCORE = SCORE_SUBSTRING;
const DEFAULT_SEARCH_LIMIT = 30;
const HISTORY_SCORE_WEIGHT = 0.08;

function loadRecentFoodEntries() {
  if (typeof localStorage === 'undefined') return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_FOODS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;

        const name = String(entry.name || '').trim();
        const id = String(entry.id ?? name).trim();
        const lastUsed = Number(entry.lastUsedAt ?? entry.lastUsed ?? entry.timestamp);
        const count = Number(entry.usageCount ?? entry.count);

        if (!id || !name || !Number.isFinite(lastUsed)) return null;
        return {
          id,
          name,
          lastUsed,
          lastUsedAt: lastUsed,
          count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
          usageCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
        };
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function getRecencyScore(lastUsed, now) {
  const ageMs = now - Number(lastUsed);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
  if (ageMs <= RECENT_FOOD_HIGH_WINDOW_MS) return 1;
  if (ageMs <= 2 * RECENT_FOOD_HIGH_WINDOW_MS) return 0.8;
  if (ageMs <= 7 * RECENT_FOOD_HIGH_WINDOW_MS) return 0.6;
  return 0.3;
}

function getFrequencyScore(count, maxCount) {
  const normalizedCount = Math.max(1, Number(count) || 1);
  const normalizedMaxCount = Math.max(1, Number(maxCount) || 1);
  const rawScore = normalizedCount / normalizedMaxCount;
  return Math.max(0.2, Math.min(1, rawScore));
}

function buildRecentFoodScoreMap() {
  const now = Date.now();
  const recentEntries = loadRecentFoodEntries();
  const scores = new Map();
  const maxCount = recentEntries.reduce(
    (max, entry) => Math.max(max, Math.max(1, Number(entry?.count) || 1)),
    1,
  );

  for (let i = 0; i < recentEntries.length; i += 1) {
    const entry = recentEntries[i];
    const recencyScore = getRecencyScore(entry.lastUsed, now);
    const frequencyScore = getFrequencyScore(entry.count, maxCount);
    const scorePayload = { recencyScore, frequencyScore };

    const idKey = String(entry.id || '').trim();
    const nameKey = normalizeSearchText(entry.name);

    if (idKey) scores.set(idKey, scorePayload);
    if (nameKey) scores.set(nameKey, scorePayload);
  }

  return scores;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expandQueryWords(queryWord) {
  return [queryWord, ...(SEARCH_SYNONYMS[queryWord] || [])];
}

function hasWordBoundaryMatch(normalizedText, queryWord) {
  if (!queryWord || !normalizedText) return false;
  const re = new RegExp(`\\b${escapeRegex(queryWord)}\\b`, 'i');
  return re.test(normalizedText);
}

/**
 * Score per una singola parola della query (testo già normalizzato lowercase).
 */
function scoreQueryToken(normalizedName, itemWords, queryWord) {
  const candidates = expandQueryWords(queryWord);
  let best = 0;

  for (let c = 0; c < candidates.length; c += 1) {
    const qw = candidates[c];
    if (!qw) continue;

    if (normalizedName === qw) {
      best = Math.max(best, SCORE_EXACT_OR_PREFIX);
      continue;
    }

    if (normalizedName.startsWith(qw)) {
      best = Math.max(best, SCORE_EXACT_OR_PREFIX);
      continue;
    }

    if (itemWords.some((word) => word === qw || word.startsWith(qw))) {
      best = Math.max(best, SCORE_EXACT_OR_PREFIX);
      continue;
    }

    if (hasWordBoundaryMatch(normalizedName, qw)) {
      best = Math.max(best, SCORE_WORD_BOUNDARY);
      continue;
    }

    if (normalizedName.includes(qw)) {
      best = Math.max(best, SCORE_SUBSTRING);
    }
  }

  return best;
}

/**
 * @returns {{ strictScore: number, matchTier: string, allTokensMatch: boolean }}
 */
function calculateMatchScore(normalizedName, itemWords, queryWords) {
  if (queryWords.length === 0) {
    return { strictScore: 0, matchTier: 'none', allTokensMatch: false };
  }

  const fullQuery = queryWords.join(' ');

  if (normalizedName === fullQuery || normalizedName.startsWith(fullQuery)) {
    return { strictScore: SCORE_EXACT_OR_PREFIX, matchTier: 'exact', allTokensMatch: true };
  }

  if (hasWordBoundaryMatch(normalizedName, fullQuery)) {
    return { strictScore: SCORE_WORD_BOUNDARY, matchTier: 'word_boundary', allTokensMatch: true };
  }

  if (normalizedName.includes(fullQuery)) {
    return { strictScore: SCORE_SUBSTRING, matchTier: 'substring', allTokensMatch: true };
  }

  if (queryWords.length === 1) {
    const tokenScore = scoreQueryToken(normalizedName, itemWords, queryWords[0]);
    if (tokenScore < MIN_MATCH_SCORE) {
      return { strictScore: 0, matchTier: 'none', allTokensMatch: false };
    }
    const tier = tokenScore >= SCORE_EXACT_OR_PREFIX
      ? 'exact'
      : tokenScore >= SCORE_WORD_BOUNDARY
        ? 'word_boundary'
        : 'substring';
    return { strictScore: tokenScore, matchTier: tier, allTokensMatch: true };
  }

  let minTokenScore = SCORE_EXACT_OR_PREFIX;
  let maxTokenScore = 0;
  let bestTier = 'none';
  const tierRank = { exact: 3, word_boundary: 2, substring: 1, none: 0 };

  for (let i = 0; i < queryWords.length; i += 1) {
    const tokenScore = scoreQueryToken(normalizedName, itemWords, queryWords[i]);
    if (tokenScore < MIN_MATCH_SCORE) {
      return { strictScore: 0, matchTier: 'none', allTokensMatch: false };
    }

    minTokenScore = Math.min(minTokenScore, tokenScore);
    maxTokenScore = Math.max(maxTokenScore, tokenScore);

    const tier = tokenScore >= SCORE_EXACT_OR_PREFIX
      ? 'exact'
      : tokenScore >= SCORE_WORD_BOUNDARY
        ? 'word_boundary'
        : 'substring';
    if (tierRank[tier] > tierRank[bestTier]) bestTier = tier;
  }

  const strictScore = Math.round(minTokenScore * 0.7 + maxTokenScore * 0.3);
  return { strictScore, matchTier: bestTier, allTokensMatch: true };
}

function isAutocompletePrefix(normalizedName, itemWords, normalizedQuery) {
  if (!normalizedQuery) return false;
  if (normalizedName.startsWith(normalizedQuery)) return true;
  return itemWords.some((word) => word.startsWith(normalizedQuery));
}

/**
 * Ricerca case-insensitive con substring match contiguo; fuzzy/sparse lettere disabilitato.
 */
export function searchFoodsDetailed(foodDb, query, options = {}) {
  if (!foodDb || typeof foodDb !== 'object') return [];

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const includeUserHistory = options.includeUserHistory !== false;
  const mode = options.mode || 'search';
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_SEARCH_LIMIT;

  const queryWords = normalizedQuery.split(' ').filter(Boolean);
  if (queryWords.length === 0) return [];

  const results = [];
  const entries = Object.entries(foodDb);
  const recentFoodScores = includeUserHistory ? buildRecentFoodScoreMap() : new Map();

  for (let i = 0; i < entries.length; i += 1) {
    const [id, food] = entries[i];
    const name = String(food?.desc || food?.name || '').trim();
    if (!name) continue;

    const normalizedName = normalizeSearchText(name);
    if (!normalizedName) continue;

    const itemWords = normalizedName.split(' ').filter(Boolean);
    if (itemWords.length === 0) continue;

    if (mode === 'autocomplete' && !isAutocompletePrefix(normalizedName, itemWords, normalizedQuery)) {
      continue;
    }

    const { strictScore, matchTier, allTokensMatch } = calculateMatchScore(
      normalizedName,
      itemWords,
      queryWords,
    );

    if (strictScore < MIN_MATCH_SCORE) continue;

    const historyScores = includeUserHistory
      ? recentFoodScores.get(String(id).trim()) || recentFoodScores.get(normalizedName) || null
      : null;
    const recencyScore = historyScores?.recencyScore ?? 0;
    const frequencyScore = historyScores?.frequencyScore ?? 0;
    const historyBoost = includeUserHistory
      ? (recencyScore * 0.6 + frequencyScore * 0.4) * 100 * HISTORY_SCORE_WEIGHT
      : 0;

    const score = strictScore + historyBoost;
    const matchScore = strictScore / 100;

    results.push({
      id,
      name,
      matchScore,
      recencyScore,
      frequencyScore,
      score,
      strictScore,
      matchTier,
      allTokensMatch,
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.strictScore !== a.strictScore) return b.strictScore - a.strictScore;
    if (b.allTokensMatch !== a.allTokensMatch) return Number(b.allTokensMatch) - Number(a.allTokensMatch);
    return a.name.localeCompare(b.name, 'it');
  });

  return results.slice(0, limit).map(
    ({ id, name, matchScore, recencyScore, frequencyScore, score, strictScore }) => ({
      id,
      name,
      matchScore,
      recencyScore,
      frequencyScore,
      textScore: score / 100,
      strictScore,
    }),
  );
}

export function searchFoods(foodDb, query, options = {}) {
  return searchFoodsDetailed(foodDb, query, options).map(({ id, name }) => ({ id, name }));
}

export default searchFoods;
