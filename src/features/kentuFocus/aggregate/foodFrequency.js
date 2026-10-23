/**
 * Memoria alimentare minima (frequenza) — nessuna classificazione nutrizionale / giudizio salute.
 */

import { isIsoDateString } from '../normalize/focusDateUtils.js';

/**
 * Giorni di calendario inclusivi tra due YYYY-MM-DD.
 * @param {string} from
 * @param {string} to
 */
export function inclusiveCalendarDays(from, to) {
  if (!isIsoDateString(from) || !isIsoDateString(to)) return null;
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return days > 0 ? days : null;
}

/**
 * @param {{ distinctDays?: number, occasions?: number }} item
 * @param {number|null|undefined} windowDays
 * @param {{
 *   consolidatedDistinctDays?: number,
 *   consolidatedMinWindowDays?: number,
 *   consolidatedMinDensity?: number,
 *   emergingDistinctDays?: number,
 *   emergingOccasions?: number,
 * }} [thresholds]
 * @returns {'consolidated'|'emerging_candidate'|'descriptive'}
 */
export function classifyFoodFrequencyHabit(item, windowDays, thresholds = {}) {
  const distinct = Number(item?.distinctDays) || 0;
  const occasions = Number(item?.occasions) || 0;
  const win = Number(windowDays) || 0;
  const consolidatedDistinct = thresholds.consolidatedDistinctDays ?? 10;
  const minWin = thresholds.consolidatedMinWindowDays ?? 21;
  const minDensity = thresholds.consolidatedMinDensity ?? 0.4;
  const emergingDays = thresholds.emergingDistinctDays ?? 3;
  const emergingOcc = thresholds.emergingOccasions ?? 4;

  if (
    distinct >= consolidatedDistinct
    || (win >= minWin && distinct >= Math.ceil(win * minDensity))
  ) {
    return 'consolidated';
  }
  if (distinct >= emergingDays && occasions >= emergingOcc && win > 0 && win <= 14) {
    return 'emerging_candidate';
  }
  return 'descriptive';
}

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
  /** @type {string|null} */
  let firstDate = null;
  /** @type {string|null} */
  let lastDate = null;

  for (const item of items) {
    const dateStr = item?.date && isIsoDateString(item.date) ? String(item.date) : null;
    if (dateStr) {
      if (!firstDate || dateStr < firstDate) firstDate = dateStr;
      if (!lastDate || dateStr > lastDate) lastDate = dateStr;
    }
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
    if (dateStr) row.distinctDays.add(dateStr);
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

  const windowDays = firstDate && lastDate
    ? inclusiveCalendarDays(firstDate, lastDate)
    : 0;

  return {
    items: frequencyItems,
    unclassifiedOccasions,
    totalOccasions: items.length,
    uniqueIdentities: frequencyItems.length,
    windowDays: windowDays || 0,
    firstDate,
    lastDate,
  };
}
