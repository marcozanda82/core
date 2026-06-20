import { useMemo } from 'react';
import { addDays } from '../../../calendarDateUtils';

const TRACKER_STORICO_KEY = (date) => `trackerStorico_${date}`;
const DEFAULT_LOOKBACK_DAYS = 30;

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeMealType(mealType) {
  return String(mealType || '').split('_')[0].trim().toLowerCase();
}

function inferMealType(entry) {
  return normalizeMealType(entry?.mealType ?? entry?.mealId ?? 'pranzo');
}

function resolveFoodKey(entry) {
  if (entry?.foodDbKey != null && String(entry.foodDbKey).trim() !== '') {
    return String(entry.foodDbKey).trim();
  }
  const desc = entry?.desc ?? entry?.name;
  if (desc != null && String(desc).trim() !== '') {
    return String(desc).trim().toLowerCase();
  }
  return null;
}

function resolveQuantity(entry) {
  return Number(entry?.qta ?? entry?.weight) || 0;
}

function computeModalQuantity(quantities) {
  if (!quantities.length) return 0;
  if (quantities.length === 1) return quantities[0];

  const frequencyByQty = new Map();
  for (const qty of quantities) {
    frequencyByQty.set(qty, (frequencyByQty.get(qty) || 0) + 1);
  }

  let modalQty = quantities[quantities.length - 1];
  let bestCount = 0;

  for (const [qty, count] of frequencyByQty) {
    if (count > bestCount) {
      bestCount = count;
      modalQty = qty;
    }
  }

  return modalQty;
}

function buildQtyLabel(entry, qta) {
  if (entry?.qtyLabel) return entry.qtyLabel;
  if (qta > 0) return `${qta}g`;
  return '—';
}

function buildLabel(desc, qtyLabel) {
  if (!desc) return qtyLabel || 'Alimento';
  if (!qtyLabel || qtyLabel === '—') return desc;
  return `${desc} (${qtyLabel})`;
}

function asLogArray(rawLog) {
  if (Array.isArray(rawLog)) return rawLog;
  if (rawLog && typeof rawLog === 'object') return Object.values(rawLog);
  return [];
}

/**
 * Appiattisce il log giornaliero Firebase (meal/items, single, food flat).
 * Ignora workout, sleep, ghost_meal e ricette.
 */
export function flattenLogToFoodEntries(rawLog) {
  const out = [];

  for (const entry of asLogArray(rawLog)) {
    if (!entry) continue;

    if (entry.type === 'meal') {
      const mealType = inferMealType(entry);
      for (const subItem of entry.items || []) {
        if (!subItem || subItem.type === 'recipe') continue;
        out.push({
          ...subItem,
          type: 'food',
          mealType: normalizeMealType(subItem.mealType) || mealType,
        });
      }
      continue;
    }

    if (entry.type === 'food') {
      out.push({
        ...entry,
        mealType: inferMealType(entry),
      });
      continue;
    }

    if (entry.type === 'single' || entry.type == null) {
      out.push({
        ...entry,
        type: 'food',
        mealType: inferMealType(entry),
      });
    }
  }

  return out;
}

function isFlatFoodLogArray(fullHistory) {
  if (!Array.isArray(fullHistory) || fullHistory.length === 0) return false;
  return fullHistory.every(
    (item) => item && typeof item === 'object' && item.type === 'food',
  );
}

function isDayNodeArray(fullHistory) {
  if (!Array.isArray(fullHistory) || fullHistory.length === 0) return false;
  return fullHistory.every(
    (day) => day && typeof day === 'object' && day.log != null,
  );
}

/**
 * Estrae tutti gli alimenti flat dagli ultimi N giorni di fullHistory KentuOS.
 *
 * @param {object|Array} fullHistory Albero tracker_data o formati legacy sandbox
 * @param {{ lookbackDays?: number, anchorDate?: string }} [options]
 * @returns {Array<object>}
 */
export function collectFoodEntriesFromFullHistory(fullHistory, options = {}) {
  if (fullHistory == null) return [];

  const lookbackDays = Math.max(
    1,
    Number(options.lookbackDays) || DEFAULT_LOOKBACK_DAYS,
  );
  const anchorDate = options.anchorDate ?? getTodayString();

  if (isFlatFoodLogArray(fullHistory)) {
    return fullHistory;
  }

  if (isDayNodeArray(fullHistory)) {
    const recentDays = fullHistory.slice(-lookbackDays);
    return recentDays.flatMap((day) => flattenLogToFoodEntries(day.log));
  }

  if (typeof fullHistory !== 'object') return [];

  const entries = [];
  for (let offset = 0; offset < lookbackDays; offset += 1) {
    const dateStr = addDays(anchorDate, -offset);
    const node = fullHistory[TRACKER_STORICO_KEY(dateStr)];
    if (!node) continue;

    const rawLog = node.log ?? node.dati?.log;
    if (rawLog == null) continue;

    entries.push(...flattenLogToFoodEntries(rawLog));
  }

  return entries;
}

function aggregatePredictiveFoodBlocks(allFoodEntries, targetMealType, limit) {
  const slot = normalizeMealType(targetMealType);
  const safeLimit = Math.max(0, Number(limit) || 0);
  if (!slot || safeLimit === 0) return [];

  const filtered = allFoodEntries.filter(
    (item) =>
      item?.type === 'food' &&
      normalizeMealType(item?.mealType) === slot,
  );

  const groups = new Map();

  for (const entry of filtered) {
    const key = resolveFoodKey(entry);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        foodDbKey: entry.foodDbKey ?? null,
        desc: String(entry.desc ?? entry.name ?? key).trim(),
        count: 0,
        quantities: [],
        entries: [],
      });
    }

    const group = groups.get(key);
    group.count += 1;
    group.quantities.push(resolveQuantity(entry));
    group.entries.push(entry);

    if (!group.foodDbKey && entry.foodDbKey) {
      group.foodDbKey = entry.foodDbKey;
    }
  }

  return Array.from(groups.values())
    .map((group) => {
      const qta = computeModalQuantity(group.quantities);
      const template =
        group.entries.find((entry) => resolveQuantity(entry) === qta) ??
        group.entries[group.entries.length - 1];
      const qtyLabel = buildQtyLabel(template, qta);

      return {
        key: group.key,
        foodDbKey: group.foodDbKey,
        desc: group.desc,
        count: group.count,
        type: 'food',
        qta,
        weight: qta,
        kcal: Number(template?.kcal ?? template?.cal) || 0,
        cal: Number(template?.cal ?? template?.kcal) || 0,
        prot: Number(template?.prot) || 0,
        carb: Number(template?.carb) || 0,
        fat: Number(template?.fat ?? template?.fatTotal) || 0,
        fatTotal: Number(template?.fatTotal ?? template?.fat) || 0,
        qtyLabel,
        label: buildLabel(group.desc, qtyLabel),
      };
    })
    .sort((a, b) => b.count - a.count || a.desc.localeCompare(b.desc, 'it'))
    .slice(0, safeLimit);
}

/**
 * Analizza fullHistory KentuOS e restituisce i blocchi food più frequenti per uno slot pasto.
 *
 * @param {object|Array} fullHistory Albero tracker_data Firebase (`trackerStorico_YYYY-MM-DD`)
 * @param {string} targetMealType es. 'colazione', 'pranzo', 'cena'
 * @param {number} [limit=6] Numero massimo di blocchi predittivi
 * @returns {Array<object>} Blocchi ordinati per frequenza decrescente
 */
export function usePredictiveFoodBlocks(fullHistory, targetMealType, limit = 6) {
  return useMemo(() => {
    if (!targetMealType) return [];

    const allFoodEntries = collectFoodEntriesFromFullHistory(fullHistory);
    return aggregatePredictiveFoodBlocks(allFoodEntries, targetMealType, limit);
  }, [fullHistory, targetMealType, limit]);
}
