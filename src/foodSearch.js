/**
 * Normalizza testo ricerca: trim, lower-case, senza accenti/punteggiatura.
 * Es. " Anguria " / "ANGURIA" → "anguria".
 */
export function normalizeSearchText(value) {
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

/** Punteggi ranking (0–100). */
const SCORE_EXACT_OR_PREFIX = 100;
const SCORE_WORD_BOUNDARY = 75;
const SCORE_SUBSTRING = 50;
const SCORE_FUZZY_DIST_1 = 90;
const SCORE_FUZZY_DIST_2 = 85;
const MIN_MATCH_SCORE = SCORE_SUBSTRING;
const DEFAULT_SEARCH_LIMIT = 30;
const HISTORY_SCORE_WEIGHT = 0.08;
/** Peso usageCount sul ranking (DB personale). */
const USAGE_COUNT_SCORE_WEIGHT = 0.35;

/**
 * Conta usi da usageCount esplicito o somma usageStats (morning…night).
 * @param {object | null | undefined} food
 * @returns {number}
 */
export function getFoodUsageCount(food) {
  if (!food || typeof food !== 'object') return 0;
  const explicit = Number(food.usageCount ?? food.count);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const stats = food.usageStats;
  if (stats && typeof stats === 'object') {
    const sum = ['morning', 'afternoon', 'evening', 'night']
      .reduce((acc, key) => acc + (Math.max(0, Number(stats[key]) || 0)), 0);
    if (sum > 0) return sum;
  }
  return 0;
}

/**
 * Distanza di Levenshtein (edit distance).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  // Early exit se differenza lunghezza già > max utile (2).
  if (Math.abs(s.length - t.length) > 2) return Math.abs(s.length - t.length);

  const prev = new Array(t.length + 1);
  const curr = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;

  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = curr[j];
  }
  return prev[t.length];
}

/**
 * Max distanza fuzzy: 1 per stringhe corte, 2 altrimenti.
 * @param {string} query
 * @returns {number}
 */
export function maxFuzzyDistanceForQuery(query) {
  const len = String(query || '').length;
  if (len <= 0) return 0;
  if (len <= 5) return 1;
  return 2;
}

/**
 * Miglior distanza fuzzy tra query e nome (intero o singole parole).
 * @returns {{ distance: number, score: number } | null}
 */
export function bestFuzzyMatch(normalizedQuery, normalizedName, itemWords = []) {
  const q = String(normalizedQuery || '');
  const name = String(normalizedName || '');
  if (!q || !name) return null;

  const maxDist = maxFuzzyDistanceForQuery(q);
  let best = levenshteinDistance(q, name);

  for (let i = 0; i < itemWords.length; i += 1) {
    const w = itemWords[i];
    if (!w) continue;
    // Solo parole di lunghezza simile (evita match spurî su token corti).
    if (Math.abs(w.length - q.length) > maxDist) continue;
    best = Math.min(best, levenshteinDistance(q, w));
  }

  if (best <= 0 || best > maxDist) return null;
  return {
    distance: best,
    score: best === 1 ? SCORE_FUZZY_DIST_1 : SCORE_FUZZY_DIST_2,
  };
}

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

    // Prefisso sull'intero nome: leggermente sotto uguaglianza esatta.
    if (normalizedName.startsWith(qw) && normalizedName !== qw) {
      best = Math.max(best, SCORE_EXACT_OR_PREFIX - 1);
      continue;
    }

    if (itemWords.some((word) => word === qw)) {
      best = Math.max(best, SCORE_EXACT_OR_PREFIX);
      continue;
    }

    if (itemWords.some((word) => word.startsWith(qw) && word !== qw)) {
      best = Math.max(best, SCORE_EXACT_OR_PREFIX - 1);
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

  // Uguaglianza esatta (case-insensitive) batte il prefix: "anguria" → "Anguria" > "Anguria gialla".
  if (normalizedName === fullQuery) {
    return { strictScore: SCORE_EXACT_OR_PREFIX, matchTier: 'exact', allTokensMatch: true };
  }

  if (normalizedName.startsWith(fullQuery)) {
    return { strictScore: SCORE_EXACT_OR_PREFIX - 1, matchTier: 'prefix', allTokensMatch: true };
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
  const tierRank = { exact: 3, word_boundary: 2, substring: 1, none: 0, prefix: 2.5 };

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

function usageBoostFromCount(usageCount, maxUsageInDb) {
  const count = Math.max(0, Number(usageCount) || 0);
  if (count <= 0) return 0;
  const maxU = Math.max(1, Number(maxUsageInDb) || 1);
  return (count / maxU) * 100 * USAGE_COUNT_SCORE_WEIGHT;
}

/**
 * Ricerca case-insensitive (trim + lower-case).
 * Cascata qualità: exact → prefix → includes → fuzzy Levenshtein (max 1–2 char).
 * Tra match equivalenti vince usageCount più alto (abitudini utente).
 */
export function searchFoodsDetailed(foodDb, query, options = {}) {
  if (!foodDb || typeof foodDb !== 'object') return [];

  const trimmedQuery = String(query ?? '').trim();
  const normalizedQuery = normalizeSearchText(trimmedQuery);
  if (!normalizedQuery) return [];

  const includeUserHistory = options.includeUserHistory !== false;
  const mode = options.mode || 'search';
  const enableFuzzy = options.enableFuzzy !== false && mode !== 'autocomplete';
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_SEARCH_LIMIT;

  const queryWords = normalizedQuery.split(' ').filter(Boolean);
  if (queryWords.length === 0) return [];

  const results = [];
  const entries = Object.entries(foodDb);
  const recentFoodScores = includeUserHistory ? buildRecentFoodScoreMap() : new Map();

  let maxUsageInDb = 1;
  for (let i = 0; i < entries.length; i += 1) {
    maxUsageInDb = Math.max(maxUsageInDb, getFoodUsageCount(entries[i][1]));
  }

  for (let i = 0; i < entries.length; i += 1) {
    const [id, food] = entries[i];
    const descName = String(food?.desc || '').trim();
    const altName = String(food?.name || '').trim();
    const name = descName || altName;
    if (!name) continue;

    const normalizedName = normalizeSearchText(name);
    const normalizedAlt = altName && altName !== name ? normalizeSearchText(altName) : '';
    if (!normalizedName && !normalizedAlt) continue;

    const primaryNorm = normalizedName || normalizedAlt;
    const itemWords = primaryNorm.split(' ').filter(Boolean);
    if (itemWords.length === 0) continue;

    if (mode === 'autocomplete' && !isAutocompletePrefix(primaryNorm, itemWords, normalizedQuery)) {
      continue;
    }

    let { strictScore, matchTier, allTokensMatch } = calculateMatchScore(
      primaryNorm,
      itemWords,
      queryWords,
    );

    // Secondo passaggio su `name` se diverso da `desc` (es. alias).
    if (normalizedAlt && normalizedAlt !== primaryNorm) {
      const altWords = normalizedAlt.split(' ').filter(Boolean);
      const altMatch = calculateMatchScore(normalizedAlt, altWords, queryWords);
      if (altMatch.strictScore > strictScore) {
        strictScore = altMatch.strictScore;
        matchTier = altMatch.matchTier;
        allTokensMatch = altMatch.allTokensMatch;
      }
    }

    // Boost esplicito uguaglianza esatta (case-insensitive) su desc o name.
    if (primaryNorm === normalizedQuery || normalizedAlt === normalizedQuery) {
      strictScore = SCORE_EXACT_OR_PREFIX;
      matchTier = 'exact';
      allTokensMatch = true;
    }

    if (strictScore < MIN_MATCH_SCORE) continue;

    const usageCount = getFoodUsageCount(food);
    const historyScores = includeUserHistory
      ? recentFoodScores.get(String(id).trim()) || recentFoodScores.get(primaryNorm) || null
      : null;
    const recencyScore = historyScores?.recencyScore ?? 0;
    const frequencyScore = historyScores?.frequencyScore ?? 0;
    const historyBoost = includeUserHistory
      ? (recencyScore * 0.6 + frequencyScore * 0.4) * 100 * HISTORY_SCORE_WEIGHT
      : 0;
    const usageBoost = usageBoostFromCount(usageCount, maxUsageInDb);

    // Exact match batte sempre i boost storici / prefix su altri alimenti.
    // Tra exact multipli (es. due "minestrone") decide usageCount.
    const score = matchTier === 'exact'
      ? SCORE_EXACT_OR_PREFIX + 50 + usageBoost + historyBoost
      : matchTier === 'prefix'
        ? SCORE_EXACT_OR_PREFIX + 10 + usageBoost + historyBoost
        : strictScore + usageBoost + historyBoost;
    const matchScore = strictScore / 100;

    results.push({
      id,
      name,
      matchScore,
      recencyScore,
      frequencyScore,
      usageCount,
      score,
      strictScore,
      matchTier,
      allTokensMatch,
    });
  }

  // Fuzzy fallback: solo se exact/includes non hanno prodotto risultati.
  if (results.length === 0 && enableFuzzy && queryWords.length === 1) {
    for (let i = 0; i < entries.length; i += 1) {
      const [id, food] = entries[i];
      const descName = String(food?.desc || '').trim();
      const altName = String(food?.name || '').trim();
      const name = descName || altName;
      if (!name) continue;

      const normalizedName = normalizeSearchText(name);
      const normalizedAlt = altName && altName !== name ? normalizeSearchText(altName) : '';
      const primaryNorm = normalizedName || normalizedAlt;
      if (!primaryNorm) continue;
      const itemWords = primaryNorm.split(' ').filter(Boolean);

      let fuzzy = bestFuzzyMatch(normalizedQuery, primaryNorm, itemWords);
      if (normalizedAlt && normalizedAlt !== primaryNorm) {
        const altFuzzy = bestFuzzyMatch(
          normalizedQuery,
          normalizedAlt,
          normalizedAlt.split(' ').filter(Boolean),
        );
        if (altFuzzy && (!fuzzy || altFuzzy.distance < fuzzy.distance)) {
          fuzzy = altFuzzy;
        }
      }
      if (!fuzzy) continue;

      const usageCount = getFoodUsageCount(food);
      const usageBoost = usageBoostFromCount(usageCount, maxUsageInDb);

      results.push({
        id,
        name,
        matchScore: fuzzy.score / 100,
        recencyScore: 0,
        frequencyScore: 0,
        usageCount,
        score: fuzzy.score + usageBoost,
        strictScore: fuzzy.score,
        matchTier: 'fuzzy',
        allTokensMatch: true,
        fuzzyDistance: fuzzy.distance,
      });
    }
  }

  results.sort((a, b) => {
    // Fuzzy solo come fallback: resta sotto i match exact/includes.
    const aFuzzy = a.matchTier === 'fuzzy' ? 1 : 0;
    const bFuzzy = b.matchTier === 'fuzzy' ? 1 : 0;
    if (aFuzzy !== bFuzzy) return aFuzzy - bFuzzy;
    // Stessa parola chiave (exact o parziale): abitudini utente prima di tutto.
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    if (b.score !== a.score) return b.score - a.score;
    if (b.strictScore !== a.strictScore) return b.strictScore - a.strictScore;
    if (b.allTokensMatch !== a.allTokensMatch) return Number(b.allTokensMatch) - Number(a.allTokensMatch);
    return a.name.localeCompare(b.name, 'it');
  });

  return results.slice(0, limit).map(
    ({ id, name, matchScore, recencyScore, frequencyScore, usageCount, score, strictScore, matchTier }) => ({
      id,
      name,
      matchScore,
      recencyScore,
      frequencyScore,
      usageCount,
      textScore: score / 100,
      strictScore,
      matchTier,
    }),
  );
}

export function searchFoods(foodDb, query, options = {}) {
  return searchFoodsDetailed(foodDb, query, options).map(({ id, name }) => ({ id, name }));
}

export default searchFoods;
