function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RECENT_FOODS_STORAGE_KEY = 'recent_foods';
const RECENT_FOOD_HIGH_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_FOOD_MEDIUM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
        const timestamp = Number(entry.timestamp);

        if (!id || !name || !Number.isFinite(timestamp)) return null;
        return { id, name, timestamp };
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function getRecencyBonus(timestamp, now) {
  const ageMs = now - Number(timestamp);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
  if (ageMs <= RECENT_FOOD_HIGH_WINDOW_MS) return 5;
  if (ageMs <= RECENT_FOOD_MEDIUM_WINDOW_MS) return 3;
  return 1;
}

function buildRecentFoodBonusMap() {
  const now = Date.now();
  const recentEntries = loadRecentFoodEntries();
  const bonuses = new Map();

  for (let i = 0; i < recentEntries.length; i += 1) {
    const entry = recentEntries[i];
    const bonus = getRecencyBonus(entry.timestamp, now);
    if (bonus <= 0) continue;

    const idKey = String(entry.id || '').trim();
    const nameKey = normalizeSearchText(entry.name);

    if (idKey) {
      bonuses.set(idKey, Math.max(bonus, bonuses.get(idKey) || 0));
    }
    if (nameKey) {
      bonuses.set(nameKey, Math.max(bonus, bonuses.get(nameKey) || 0));
    }
  }

  return bonuses;
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

export function searchFoods(foodDb, query) {
  if (!foodDb || typeof foodDb !== 'object') return [];

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const queryWords = normalizedQuery.split(' ').filter(Boolean);
  if (queryWords.length === 0) return [];

  const results = [];
  const entries = Object.entries(foodDb);
  const recentFoodBonuses = buildRecentFoodBonusMap();

  for (let i = 0; i < entries.length; i += 1) {
    const [id, food] = entries[i];
    const name = String(food?.desc || food?.name || '').trim();
    if (!name) continue;

    const normalizedName = normalizeSearchText(name);
    if (!normalizedName) continue;

    const itemWords = normalizedName.split(' ').filter(Boolean);
    if (itemWords.length === 0) continue;

    let score = 0;
    for (let j = 0; j < queryWords.length; j += 1) {
      score += scoreQueryWord(queryWords[j], itemWords);
    }

    if (score === 0) continue;

    const recencyBonus = Math.max(
      recentFoodBonuses.get(String(id).trim()) || 0,
      recentFoodBonuses.get(normalizedName) || 0
    );
    const finalScore = score + recencyBonus;

    results.push({ id, name, score, finalScore });
  }

  results.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return b.score - a.score;
  });

  return results.slice(0, 50).map(({ id, name }) => ({ id, name }));
}

export default searchFoods;
