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

/** Punteggi rigidi (0–100). Sotto MIN_MATCH_SCORE i risultati vengono scartati. */
const SCORE_EXACT_PHRASE = 100;
const SCORE_EXACT_WORD = 100;
const SCORE_NAME_PREFIX = 98;
const SCORE_WORD_PREFIX = 95;
const SCORE_SUBSTRING = 50;
const SCORE_FUZZY = 12;
const MIN_MATCH_SCORE = SCORE_SUBSTRING;
const FUZZY_MIN_QUERY_LENGTH = 5;
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

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 1) return 2;

  const previous = new Array(b.length + 1);
  const current = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let minInRow = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < minInRow) minInRow = current[j];
    }

    if (minInRow > 1) return 2;

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function expandQueryWords(queryWord) {
  return [queryWord, ...(SEARCH_SYNONYMS[queryWord] || [])];
}

/**
 * Punteggio massimo per una singola parola della query contro il nome normalizzato.
 * Gerarchia: parola esatta / prefisso > sottostringa contigua > fuzzy (solo query lunghe).
 */
function scoreQueryWordStrict(queryWord, normalizedName, itemWords) {
  const candidates = expandQueryWords(queryWord);
  let best = 0;

  for (let c = 0; c < candidates.length; c += 1) {
    const qw = candidates[c];
    if (!qw) continue;

    for (let i = 0; i < itemWords.length; i += 1) {
      const itemWord = itemWords[i];

      if (itemWord === qw) {
        best = Math.max(best, SCORE_EXACT_WORD);
        continue;
      }

      if (itemWord.startsWith(qw)) {
        best = Math.max(best, SCORE_WORD_PREFIX);
        continue;
      }

      if (qw.length >= 3 && itemWord.includes(qw)) {
        best = Math.max(best, SCORE_SUBSTRING);
        continue;
      }

      if (qw.length > FUZZY_MIN_QUERY_LENGTH && levenshteinDistance(qw, itemWord) <= 1) {
        best = Math.max(best, SCORE_FUZZY);
      }
    }

    if (normalizedName === qw) {
      best = Math.max(best, SCORE_EXACT_PHRASE);
    } else if (normalizedName.startsWith(qw)) {
      best = Math.max(best, SCORE_NAME_PREFIX);
    } else if (qw.length >= 3 && normalizedName.includes(qw)) {
      best = Math.max(best, SCORE_SUBSTRING);
    }
  }

  return best;
}

/**
 * @returns {{ strictScore: number, matchTier: string, allTokensMatch: boolean }}
 */
function calculateStrictMatchScore(normalizedName, itemWords, queryWords) {
  if (queryWords.length === 0) {
    return { strictScore: 0, matchTier: 'none', allTokensMatch: false };
  }

  if (normalizedName === queryWords.join(' ')) {
    return { strictScore: SCORE_EXACT_PHRASE, matchTier: 'exact_phrase', allTokensMatch: true };
  }

  if (normalizedName.startsWith(queryWords.join(' '))) {
    return { strictScore: SCORE_NAME_PREFIX, matchTier: 'name_prefix', allTokensMatch: true };
  }

  let minWordScore = SCORE_EXACT_PHRASE;
  let maxWordScore = 0;
  let matchedCount = 0;
  let bestTier = 'none';

  const tierRank = {
    exact_phrase: 5,
    exact_word: 4,
    name_prefix: 4,
    word_prefix: 3,
    substring: 2,
    fuzzy: 1,
    none: 0,
  };

  const tierFromScore = (score) => {
    if (score >= SCORE_EXACT_WORD) return 'exact_word';
    if (score >= SCORE_WORD_PREFIX) return 'word_prefix';
    if (score >= SCORE_SUBSTRING) return 'substring';
    if (score >= SCORE_FUZZY) return 'fuzzy';
    return 'none';
  };

  for (let i = 0; i < queryWords.length; i += 1) {
    const wordScore = scoreQueryWordStrict(queryWords[i], normalizedName, itemWords);
    if (wordScore <= 0) {
      return { strictScore: 0, matchTier: 'none', allTokensMatch: false };
    }

    matchedCount += 1;
    minWordScore = Math.min(minWordScore, wordScore);
    maxWordScore = Math.max(maxWordScore, wordScore);

    const tier = tierFromScore(wordScore);
    if (tierRank[tier] > tierRank[bestTier]) {
      bestTier = tier;
    }
  }

  const allTokensMatch = matchedCount === queryWords.length;
  const strictScore = Math.round(minWordScore * 0.7 + maxWordScore * 0.3);

  return { strictScore, matchTier: bestTier, allTokensMatch };
}

function isAutocompletePrefix(normalizedName, itemWords, normalizedQuery) {
  if (!normalizedQuery) return false;
  if (normalizedName.startsWith(normalizedQuery)) return true;
  return itemWords.some((word) => word.startsWith(normalizedQuery));
}

/**
 * Ricerca rigorosa su catalogo locale — corrispondenze esatte e sottostringa contigua.
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

    const { strictScore, matchTier, allTokensMatch } = calculateStrictMatchScore(
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
