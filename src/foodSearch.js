function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    results.push({ id, name, score });
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, 50).map(({ id, name }) => ({ id, name }));
}

export default searchFoods;
