/**
 * Memoria alimentare minima (frequenza) — nessuna classificazione nutrizionale / giudizio salute.
 */

/**
 * @param {string} name
 */
export function normalizeFoodNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * @param {{
 *   foodDbKey?: string|null,
 *   name?: string,
 *   type?: 'food'|'recipe',
 *   mealType?: string,
 *   date?: string,
 * }} item
 */
export function resolveFoodIdentity(item) {
  const foodDbKey = item?.foodDbKey != null && String(item.foodDbKey).trim() !== ''
    ? String(item.foodDbKey).trim()
    : null;
  if (foodDbKey) {
    return {
      key: `db:${foodDbKey}`,
      keyType: 'foodDbKey',
      label: item?.name || foodDbKey,
    };
  }
  const nameKey = normalizeFoodNameKey(item?.name);
  if (nameKey) {
    return {
      key: `name:${nameKey}`,
      keyType: 'name',
      label: String(item?.name || '').trim(),
    };
  }
  return {
    key: 'unclassified',
    keyType: 'unclassified',
    label: '',
  };
}

/**
 * @param {Array<{
 *   foodDbKey?: string|null,
 *   name?: string,
 *   type?: string,
 *   mealType?: string,
 *   date: string,
 * }>} foodItemsAcrossDays
 */
export function buildFoodFrequency(foodItemsAcrossDays) {
  const items = Array.isArray(foodItemsAcrossDays) ? foodItemsAcrossDays : [];
  /** @type {Map<string, {
   *   key: string,
   *   keyType: string,
   *   label: string,
   *   kind: 'food'|'recipe',
   *   distinctDays: Set<string>,
   *   occasions: number,
   *   unclassified: boolean,
   * }>} */
  const map = new Map();
  let unclassifiedOccasions = 0;

  for (const item of items) {
    const identity = resolveFoodIdentity(item);
    const unclassified = identity.keyType === 'unclassified' || item?.mealType === 'unknown';
    if (identity.keyType === 'unclassified') {
      unclassifiedOccasions += 1;
      continue;
    }
    const kind = item?.type === 'recipe' ? 'recipe' : 'food';
    const mapKey = `${kind}|${identity.key}`;
    let row = map.get(mapKey);
    if (!row) {
      row = {
        key: identity.key,
        keyType: identity.keyType,
        label: identity.label,
        kind,
        distinctDays: new Set(),
        occasions: 0,
        unclassified: false,
      };
      map.set(mapKey, row);
    }
    row.occasions += 1;
    if (item?.date) row.distinctDays.add(String(item.date));
    if (unclassified) row.unclassified = true;
  }

  const frequencyItems = [...map.values()]
    .map((row) => ({
      key: row.key,
      keyType: row.keyType,
      label: row.label,
      kind: row.kind,
      distinctDays: row.distinctDays.size,
      occasions: row.occasions,
      unclassified: row.unclassified,
    }))
    .sort((a, b) => b.occasions - a.occasions || a.label.localeCompare(b.label));

  return {
    items: frequencyItems,
    unclassifiedOccasions,
    totalOccasions: items.length,
    uniqueIdentities: frequencyItems.length,
  };
}
