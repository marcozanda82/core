import { useMemo } from 'react';
import { addDays } from '../../../calendarDateUtils';
import { flattenLogToFoodEntries } from './usePredictiveFoodBlocks';

const TRACKER_STORICO_KEY = (date) => `trackerStorico_${date}`;
const DEFAULT_LOOKBACK_DAYS = 30;
const MIN_COMBO_FREQUENCY = 2;
const CORE_MIN_THIRD_KCAL = 80;
const CORE_MIN_THIRD_RATIO = 0.15;

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeMealType(mealType) {
  return String(mealType || '').split('_')[0].trim().toLowerCase();
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

function resolveKcal(entry) {
  return Number(entry?.kcal ?? entry?.cal) || 0;
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
 * Raggruppa un Pasto Evento per ogni giorno con alimenti nello slot target.
 */
export function collectMealEventsFromFullHistory(
  fullHistory,
  targetMealType,
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
) {
  if (fullHistory == null || !targetMealType) return [];

  const slot = normalizeMealType(targetMealType);
  const safeLookback = Math.max(1, Number(lookbackDays) || DEFAULT_LOOKBACK_DAYS);
  const events = [];

  if (isFlatFoodLogArray(fullHistory)) {
    const foods = fullHistory.filter(
      (item) =>
        item?.type === 'food' &&
        normalizeMealType(item?.mealType) === slot,
    );
    if (foods.length > 0) {
      events.push({ date: 'legacy', foods });
    }
    return events;
  }

  if (isDayNodeArray(fullHistory)) {
    const recentDays = fullHistory.slice(-safeLookback);
    recentDays.forEach((day) => {
      const foods = flattenLogToFoodEntries(day.log).filter(
        (item) => normalizeMealType(item?.mealType) === slot,
      );
      if (foods.length > 0) {
        events.push({
          date: String(day.data || day.date || 'unknown'),
          foods,
        });
      }
    });
    return events;
  }

  if (typeof fullHistory !== 'object') return [];

  const anchorDate = getTodayString();
  for (let offset = 0; offset < safeLookback; offset += 1) {
    const dateStr = addDays(anchorDate, -offset);
    const node = fullHistory[TRACKER_STORICO_KEY(dateStr)];
    if (!node) continue;

    const rawLog = node.log ?? node.dati?.log;
    if (rawLog == null) continue;

    const foods = flattenLogToFoodEntries(rawLog).filter(
      (item) => normalizeMealType(item?.mealType) === slot,
    );
    if (foods.length > 0) {
      events.push({ date: dateStr, foods });
    }
  }

  return events;
}

/**
 * Nucleo elastico: top 2 per kcal + eventuale 3° se calorico rilevante.
 */
export function extractMealCore(foods) {
  if (!Array.isArray(foods) || foods.length === 0) return [];

  const sorted = [...foods]
    .map((food) => ({ ...food, _kcal: resolveKcal(food) }))
    .sort((a, b) => b._kcal - a._kcal);

  const core = sorted.slice(0, 2);
  if (sorted.length < 3) {
    return core.map(({ _kcal, ...food }) => food);
  }

  const totalKcal = sorted.reduce((sum, food) => sum + food._kcal, 0);
  const third = sorted[2];
  const thirdRatio = totalKcal > 0 ? third._kcal / totalKcal : 0;

  if (third._kcal >= CORE_MIN_THIRD_KCAL || thirdRatio >= CORE_MIN_THIRD_RATIO) {
    core.push(third);
  }

  return core.map(({ _kcal, ...food }) => food);
}

export function buildCoreSignature(coreItems) {
  const keys = coreItems
    .map((item) => resolveFoodKey(item))
    .filter(Boolean)
    .sort();

  return keys.join('_');
}

function titleCaseWord(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function humanizeFoodKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return 'Alimento';

  const fromDesc = raw.includes('_') && !raw.startsWith('food_') && !raw.startsWith('USDA_')
    ? raw.replace(/_/g, ' ')
    : raw;

  return titleCaseWord(fromDesc);
}

function buildComboName(coreItems) {
  const labels = coreItems
    .map((item) => String(item.desc || item.name || humanizeFoodKey(resolveFoodKey(item))).trim())
    .filter(Boolean);

  if (labels.length === 0) return 'Combo pasto';
  if (labels.length === 1) return `Combo: ${labels[0]}`;
  if (labels.length === 2) return `Combo: ${labels[0]} e ${labels[1]}`;
  return `Combo: ${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

function buildComboItemFromOccurrences(identityKey, occurrences) {
  const snapshots = [];

  occurrences.forEach((occurrence) => {
    const match = occurrence.core.find((item) => resolveFoodKey(item) === identityKey);
    if (match) snapshots.push(match);
  });

  if (snapshots.length === 0) return null;

  const quantities = snapshots.map((item) => resolveQuantity(item));
  const qta = computeModalQuantity(quantities);
  const template =
    snapshots.find((item) => resolveQuantity(item) === qta) ??
    snapshots[snapshots.length - 1];

  const desc = String(template.desc || template.name || humanizeFoodKey(identityKey)).trim();

  return {
    type: 'food',
    desc,
    foodDbKey: template.foodDbKey ?? null,
    qta,
    weight: qta,
    qtyLabel: buildQtyLabel(template, qta),
    kcal: resolveKcal(template),
    prot: Number(template.prot) || 0,
    carb: Number(template.carb) || 0,
    fat: Number(template.fat ?? template.fatTotal) || 0,
    fatTotal: Number(template.fatTotal ?? template.fat) || 0,
  };
}

/**
 * Aggrega combo ricorrenti per firma del nucleo calorico.
 */
export function aggregatePredictiveMealCombos(
  fullHistory,
  targetMealType,
  limit = 2,
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
) {
  const slot = normalizeMealType(targetMealType);
  const safeLimit = Math.max(0, Number(limit) || 0);
  if (!slot || safeLimit === 0) return [];

  const mealEvents = collectMealEventsFromFullHistory(fullHistory, slot, lookbackDays);
  const signatureGroups = new Map();

  mealEvents.forEach((event) => {
    const core = extractMealCore(event.foods);
    const signature = buildCoreSignature(core);
    if (!signature) return;

    if (!signatureGroups.has(signature)) {
      signatureGroups.set(signature, {
        signature,
        count: 0,
        occurrences: [],
        identityKeys: core.map((item) => resolveFoodKey(item)).filter(Boolean).sort(),
      });
    }

    const group = signatureGroups.get(signature);
    group.count += 1;
    group.occurrences.push({ date: event.date, core });
  });

  return Array.from(signatureGroups.values())
    .filter((group) => group.count >= MIN_COMBO_FREQUENCY)
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature, 'it'))
    .slice(0, safeLimit)
    .map((group) => {
      const referenceCore = group.occurrences[0]?.core ?? [];
      const items = group.identityKeys
        .map((identityKey) => buildComboItemFromOccurrences(identityKey, group.occurrences))
        .filter(Boolean);

      const totalKcal = items.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0);

      return {
        id: group.signature,
        name: buildComboName(referenceCore),
        count: group.count,
        items,
        totalKcal: Math.round(totalKcal),
      };
    });
}

/**
 * Individua pasti completi ricorrenti tramite estrazione del nucleo calorico.
 *
 * @param {object|Array} fullHistory Albero tracker_data Firebase
 * @param {string} targetMealType es. 'colazione', 'pranzo', 'cena'
 * @param {number} [limit=2] Numero massimo di combo Hero
 * @returns {Array<{ id: string, name: string, items: object[], totalKcal: number, count: number }>}
 */
export function usePredictiveMealCombos(fullHistory, targetMealType, limit = 2) {
  return useMemo(
    () => aggregatePredictiveMealCombos(fullHistory, targetMealType, limit),
    [fullHistory, targetMealType, limit],
  );
}

export default usePredictiveMealCombos;
