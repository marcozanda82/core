export function searchFoods(foodDb, query) {
  if (!foodDb || typeof foodDb !== 'object') return [];

  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return [];

  const results = [];
  const entries = Object.entries(foodDb);

  for (let i = 0; i < entries.length; i += 1) {
    const [id, food] = entries[i];
    const name = String(food?.desc || food?.name || '').trim();
    if (!name) continue;
    if (!name.toLowerCase().includes(normalizedQuery)) continue;

    results.push({ id, name });
    if (results.length >= 50) break;
  }

  return results;
}

export default searchFoods;
