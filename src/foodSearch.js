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
        const lastUsed = Number(entry.lastUsed ?? entry.timestamp);
        const count = Number(entry.count);

        if (!id || !name || !Number.isFinite(lastUsed)) return null;
        return {
          id,
          name,
          lastUsed,
          count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
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
  if (ageMs <= RECENT_FOOD_HIGH_WINDOW_MS) return 5;
  if (ageMs <= RECENT_FOOD_MEDIUM_WINDOW_MS) return 3;
  return 1;
}

function getFrequencyScore(count) {
  const normalizedCount = Math.max(1, Number(count) || 1);
  return Math.min(4, Math.floor(Math.log2(normalizedCount)) + 1);
}

function getSmartScore(entry, now) {
  return getRecencyScore(entry?.lastUsed, now) + getFrequencyScore(entry?.count);
}

function buildRecentFoodSmartScoreMap() {
  const now = Date.now();
  const recentEntries = loadRecentFoodEntries();
  const smartScores = new Map();

  for (let i = 0; i < recentEntries.length; i += 1) {
    const entry = recentEntries[i];
    const smartScore = getSmartScore(entry, now);
    if (smartScore <= 0) continue;

    const idKey = String(entry.id || '').trim();
    const nameKey = normalizeSearchText(entry.name);

    if (idKey) {
      smartScores.set(idKey, Math.max(smartScore, smartScores.get(idKey) || 0));
    }
    if (nameKey) {
      smartScores.set(nameKey, Math.max(smartScore, smartScores.get(nameKey) || 0));
    }
  }

  return smartScores;
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
  let bestScore = 0;

  for (let i = 0; i < itemWords.length; i += 1) {
    const itemWord = itemWords[i];
    if (itemWord === queryWord) return 2;
    if (bestScore === 0 && levenshteinDistance(queryWord, itemWord) <= 1) {
      bestScore = 1;
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

    if (wordScore === 2) {
      exactMatches += 1;
      continue;
    }

    if (wordScore === 1) {
      fuzzyMatches += 1;
      continue;
    }

    if (itemWords.some((itemWord) => itemWord.includes(queryWord))) {
      partialMatches += 1;
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

export function searchFoods(foodDb, query) {
  if (!foodDb || typeof foodDb !== 'object') return [];

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const queryWords = normalizedQuery.split(' ').filter(Boolean);
  if (queryWords.length === 0) return [];

  const results = [];
  const entries = Object.entries(foodDb);
  const recentFoodSmartScores = buildRecentFoodSmartScoreMap();

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

    let searchScore = 0;
    if (matchSummary.exactPhraseMatch) {
      searchScore = 1000 + (queryWords.length * 20);
    } else if (matchSummary.allTokensMatch) {
      searchScore = 700
        + (matchSummary.exactMatches * 20)
        + (matchSummary.fuzzyMatches * 10)
        + (matchSummary.partialMatches * 5);
    } else {
      searchScore = 300
        + (matchSummary.matchedTokens * 15)
        + (matchSummary.exactMatches * 10)
        + (matchSummary.fuzzyMatches * 5)
        + matchSummary.partialMatches;
    }

    const smartScore = Math.max(
      recentFoodSmartScores.get(String(id).trim()) || 0,
      recentFoodSmartScores.get(normalizedName) || 0
    );
    const finalScore = searchScore + smartScore;

    results.push({ id, name, searchScore, smartScore, finalScore, matchSummary });
  }

  results.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
    return b.matchSummary.matchedTokens - a.matchSummary.matchedTokens;
  });

  return results.slice(0, 50).map(({ id, name }) => ({ id, name }));
}

export default searchFoods;
