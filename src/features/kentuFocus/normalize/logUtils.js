/**
 * Utility log trackerStorico (pure).
 */

import { expandTrackerLogEntries, pickDayLogRaw } from './expandTrackerDayLog.js';

/** @param {unknown} node */
export function getLogArray(node) {
  return expandTrackerLogEntries(pickDayLogRaw(node));
}

/** @param {unknown} node */
export function getManualNodesArray(node) {
  if (!node || typeof node !== 'object') return [];
  return expandTrackerLogEntries(node.manualNodes);
}

/**
 * Deduplica per id stabile; voci senza id restano tutte (ordine preservato).
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string|null|undefined} getId
 */
export function dedupeById(items, getId) {
  return dedupeByIdWithStats(items, getId).items;
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string|null|undefined} getId
 * @returns {{ items: T[], duplicatesRemoved: number, duplicateIds: string[] }}
 */
export function dedupeByIdWithStats(items, getId) {
  const seen = new Set();
  const out = [];
  const duplicateIds = [];
  for (const item of items) {
    const id = getId(item);
    if (id != null && id !== '') {
      const key = String(id);
      if (seen.has(key)) {
        duplicateIds.push(key);
        continue;
      }
      seen.add(key);
    }
    out.push(item);
  }
  return {
    items: out,
    duplicatesRemoved: duplicateIds.length,
    duplicateIds,
  };
}

/** @param {unknown} n */
export function finiteNumber(n) {
  // Number(null) === 0: non trattare null/undefined come zero misurato.
  if (n == null || n === '') return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}
