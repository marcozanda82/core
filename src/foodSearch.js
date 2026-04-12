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
const RECENT_FOOD_MEDIUM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const SEARCH_SYNONYMS = {
  arrosto: ['cotto'],
  pollo: ['chicken'],
};
const MATCH_SCORE_WEIGHT = 0.5;
const RECENCY_SCORE_WEIGHT = 0.3;
const FREQUENCY_SCORE_WEIGHT = 0.2;

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

function getSmartScore(entry, now, maxCount) {
  return (
    (getRecencyScore(entry?.lastUsed, now) * RECENCY_SCORE_WEIGHT) +
    (getFrequencyScore(entry?.count, maxCount) * FREQUENCY_SCORE_WEIGHT)
  );
}

function buildRecentFoodScoreMap() {
  const now = Date.now();
  const recentEntries = loadRecentFoodEntries();
  const scores = new Map();
  const maxCount = recentEntries.reduce((max, entry) => (
    Math.max(max, Math.max(1, Number(entry?.count) || 1))
  ), 1);

  for (let i = 0; i < recentEntries.length; i += 1) {
    const entry = recentEntries[i];
    const recencyScore = getRecencyScore(entry.lastUsed, now);
    const frequencyScore = getFrequencyScore(entry.count, maxCount);
    const weightedHistoryScore = getSmartScore(entry, now, maxCount);

    const idKey = String(entry.id || '').trim();
    const nameKey = normalizeSearchText(entry.name);
    const scorePayload = {
      recencyScore,
      frequencyScore,
      weightedHistoryScore,
    };

    if (idKey) {
      scores.set(idKey, scorePayload);
    }
    if (nameKey) {
      scores.set(nameKey, scorePayload);
    }
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
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      if (current[j] < minInRow) minInRow = current[j];
    }

    if (minInRow > 1) return 2;

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function scoreQueryWord(queryWord, itemWords) {
  const expandedQueryWords = [queryWord, ...(SEARCH_SYNONYMS[queryWord] || [])];
  let bestScore = 0;

  for (let q = 0; q < expandedQueryWords.length; q += 1) {
    const candidateQueryWord = expandedQueryWords[q];

    for (let i = 0; i < itemWords.length; i += 1) {
      const itemWord = itemWords[i];
      if (itemWord === candidateQueryWord) return 3;
      if (itemWord.includes(candidateQueryWord) || candidateQueryWord.includes(itemWord)) {
        bestScore = Math.max(bestScore, 2);
        continue;
      }
      if (levenshteinDistance(candidateQueryWord, itemWord) <= 1) {
        bestScore = Math.max(bestScore, 1);
      }
    }
  }

  return bestScore;
}

function getTokenMatchSummary(queryWords, itemWords) {
  let exactMatches = 0;
  let fuzzyMatches = 0;
  let partialMatches = 0;

  for (let i = 0; i < queryWords.length; i += 1) {
    const queryWord = queryWords[i];
    const wordScore = scoreQueryWord(queryWord, itemWords);

    if (wordScore === 3) {
      exactMatches += 1;
      continue;
    }

    if (wordScore === 2) {
      partialMatches += 1;
      continue;
    }

    if (wordScore === 1) {
      fuzzyMatches += 1;
      continue;
    }
  }

  const matchedTokens = exactMatches + fuzzyMatches + partialMatches;
  const allTokensMatch = matchedTokens === queryWords.length;
  const exactPhraseMatch = itemWords.join(' ') === queryWords.join(' ');

  return {
    exactMatches,
    fuzzyMatches,
    partialMatches,
    matchedTokens,
    allTokensMatch,
    exactPhraseMatch,
  };
}

function getMatchScore(matchSummary, queryWords) {
  const tokenCount = Math.max(1, queryWords.length);
  if (matchSummary.exactPhraseMatch) return 1;
  if (matchSummary.allTokensMatch) {
    return Math.min(
      0.98,
      ((matchSummary.exactMatches * 1) + (matchSummary.partialMatches * 0.7) + (matchSummary.fuzzyMatches * 0.45)) / tokenCount
    );
  }
  return Math.min(
    0.79,
    ((matchSummary.exactMatches * 1) + (matchSummary.partialMatches * 0.6) + (matchSummary.fuzzyMatches * 0.35)) / tokenCount
  );
}

export function searchFoods(foodDb, query, options = {}) {
  if (!foodDb || typeof foodDb !== 'object') return [];

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const includeUserHistory = options.includeUserHistory !== false;

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
    const matchSummary = getTokenMatchSummary(queryWords, itemWords);
    if (matchSummary.matchedTokens === 0) continue;

    const matchScore = getMatchScore(matchSummary, queryWords);
    const historyScores = includeUserHistory ? (
      recentFoodScores.get(String(id).trim()) || recentFoodScores.get(normalizedName) || null
    ) : null;
    const recencyScore = historyScores?.recencyScore ?? 0;
    const frequencyScore = historyScores?.frequencyScore ?? 0;
    const score = (matchScore * MATCH_SCORE_WEIGHT) + (
      includeUserHistory
        ? ((recencyScore * RECENCY_SCORE_WEIGHT) + (frequencyScore * FREQUENCY_SCORE_WEIGHT))
        : 0
    );

    results.push({ id, name, matchScore, recencyScore, frequencyScore, score, matchSummary });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return b.matchSummary.matchedTokens - a.matchSummary.matchedTokens;
  });

  return results.slice(0, 50).map(({ id, name }) => ({ id, name }));
}

export default searchFoods;
