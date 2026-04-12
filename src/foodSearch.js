function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    const isMatch = queryWords.every((word) => normalizedName.includes(word));
    if (!isMatch) continue;

    results.push({ id, name });
    if (results.length >= 50) break;
  }

  return results;
}

export default searchFoods;
