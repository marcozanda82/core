/**
 * Esclude dal log gli alimenti dello stesso slot in modifica (mealType base + mealTime),
 * così il pasto aperto non viene contato due volte nel residuo.
 *
 * @param {unknown[]} log
 * @param {unknown[]} slotItems
 * @returns {unknown[]}
 */
export function excludeEditingMealSlotFromLog(log, slotItems) {
  const rows = Array.isArray(log) ? log : [];
  const items = Array.isArray(slotItems) ? slotItems : [];
  if (items.length === 0) return rows;
  const keys = new Set(
    items.map((food) => {
      const base = String(food.mealType ?? '').split('_')[0];
      const t = typeof food.mealTime === 'number' && !Number.isNaN(food.mealTime) ? food.mealTime : 'na';
      return `${base}|${t}`;
    }),
  );
  return rows.filter((entry) => {
    if (entry?.type !== 'food' && entry?.type !== 'recipe') return true;
    const base = String(entry.mealType ?? '').split('_')[0];
    const t = typeof entry.mealTime === 'number' && !Number.isNaN(entry.mealTime) ? entry.mealTime : 'na';
    return !keys.has(`${base}|${t}`);
  });
}
