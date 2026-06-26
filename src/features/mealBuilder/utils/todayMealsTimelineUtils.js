import { getLogFromStoricoTree, getTodayString, decimalToTimeStr, normalizeLogData } from '../../../coreEngine';
import {
  hoursFastedAtTimelineHour,
  resolveMetabolicColorForHoursFasted,
} from '../../salaComandi/utils/metabolicPhaseColors';

const MEAL_TYPE_LABELS = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Snack',
};

function normalizeMealType(mealType) {
  return String(mealType || 'pranzo').split('_')[0].trim().toLowerCase();
}

function resolveBatchKey(entry) {
  if (entry?.batchId != null && String(entry.batchId).trim() !== '') {
    return String(entry.batchId).trim();
  }

  const id = String(entry?.id ?? '');
  const batchMatch = id.match(/^f_(\d+)_/);
  if (batchMatch) return `batch_${batchMatch[1]}`;

  const mealType = normalizeMealType(entry?.mealType);
  const mealTime = Number(entry?.mealTime ?? entry?.time);
  if (Number.isFinite(mealTime)) {
    return `${mealType}_${mealTime.toFixed(3)}`;
  }

  return `${mealType}_${id || 'solo'}`;
}

function isFoodLikeEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.type === 'food' || entry.type === 'recipe') return true;
  if (entry.type === 'single' || entry.type == null) {
    const desc = String(entry.desc ?? entry.name ?? '').trim();
    return Boolean(desc);
  }
  return false;
}

function flattenTodayFoodEntries(log) {
  if (!Array.isArray(log)) return [];

  const out = [];
  for (const entry of log) {
    if (!entry) continue;

    if (entry.type === 'meal') {
      const mealType = normalizeMealType(entry.mealType);
      const mealTime = Number(entry.mealTime ?? entry.time);
      for (const subItem of entry.items || []) {
        if (!subItem || subItem.type === 'recipe') continue;
        out.push({
          ...subItem,
          type: subItem.type || 'food',
          mealType: normalizeMealType(subItem.mealType) || mealType,
          mealTime: Number.isFinite(Number(subItem.mealTime))
            ? Number(subItem.mealTime)
            : mealTime,
          batchId: subItem.batchId || entry.batchId || entry.id,
        });
      }
      continue;
    }

    if (isFoodLikeEntry(entry)) {
      out.push({
        ...entry,
        type: entry.type === 'recipe' ? 'recipe' : 'food',
        mealType: normalizeMealType(entry.mealType),
      });
    }
  }

  return out;
}

function sumMacros(items) {
  return items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + (Number(item.kcal ?? item.cal) || 0),
      prot: acc.prot + (Number(item.prot) || 0),
      carb: acc.carb + (Number(item.carb) || 0),
      fat: acc.fat + (Number(item.fatTotal ?? item.fat) || 0),
    }),
    { kcal: 0, prot: 0, carb: 0, fat: 0 },
  );
}

function resolveTodayLog(fullHistory, todayLog, dateStr) {
  if (Array.isArray(todayLog)) {
    return normalizeLogData(todayLog);
  }
  return getLogFromStoricoTree(fullHistory, dateStr) || [];
}

function enrichBatchMetabolicColors(batches, allMealTimes, yesterdayLastMealTime = null) {
  return batches.map((batch) => {
    const mealHour = Number(batch.mealTime);
    if (!Number.isFinite(mealHour)) {
      return { ...batch, metabolicColor: resolveMetabolicColorForHoursFasted(0) };
    }

    const hoursBeforeMeal = hoursFastedAtTimelineHour(
      Math.max(0, mealHour - 0.05),
      allMealTimes,
      yesterdayLastMealTime,
    );

    return {
      ...batch,
      metabolicColor: resolveMetabolicColorForHoursFasted(hoursBeforeMeal),
    };
  });
}

/**
 * Raggruppa i pasti loggati oggi in batch cronologici per la timeline Vetrina.
 *
 * @param {object} fullHistory Albero tracker_data Firebase (fallback)
 * @param {{ todayLog?: Array, dateStr?: string, yesterdayLastMealTime?: number|null }} [options]
 */
export function collectTodayMealBatches(fullHistory, options = {}) {
  const dateStr = options.dateStr ?? getTodayString();
  const log = resolveTodayLog(fullHistory, options.todayLog, dateStr);
  const foods = flattenTodayFoodEntries(log);
  if (foods.length === 0) return [];

  const batches = new Map();

  foods.forEach((entry) => {
    const batchKey = resolveBatchKey(entry);
    if (!batches.has(batchKey)) {
      const mealType = normalizeMealType(entry.mealType);
      const mealTime = Number(entry.mealTime ?? entry.time);
      batches.set(batchKey, {
        id: batchKey,
        mealType,
        mealLabel: MEAL_TYPE_LABELS[mealType] || mealType,
        mealTime: Number.isFinite(mealTime) ? mealTime : null,
        items: [],
      });
    }
    batches.get(batchKey).items.push(entry);
  });

  const sorted = Array.from(batches.values())
    .map((batch) => {
      const macros = sumMacros(batch.items);
      const mealTime = batch.mealTime
        ?? (Number(batch.items[0]?.mealTime ?? batch.items[0]?.time) || null);
      return {
        ...batch,
        mealTime: Number.isFinite(Number(mealTime)) ? Number(mealTime) : null,
        timeLabel: Number.isFinite(Number(mealTime))
          ? decimalToTimeStr(Number(mealTime))
          : '—',
        itemCount: batch.items.length,
        kcal: Math.round(macros.kcal),
        prot: Math.round(macros.prot * 10) / 10,
        carb: Math.round(macros.carb * 10) / 10,
        fat: Math.round(macros.fat * 10) / 10,
        previewName: String(
          batch.items[0]?.desc ?? batch.items[0]?.name ?? batch.mealLabel,
        ).trim(),
      };
    })
    .sort((a, b) => {
      const ta = Number.isFinite(a.mealTime) ? a.mealTime : 99;
      const tb = Number.isFinite(b.mealTime) ? b.mealTime : 99;
      if (ta !== tb) return ta - tb;
      return a.mealLabel.localeCompare(b.mealLabel, 'it');
    });

  const allMealTimes = sorted
    .map((b) => Number(b.mealTime))
    .filter((t) => Number.isFinite(t));

  return enrichBatchMetabolicColors(
    sorted,
    allMealTimes,
    options.yesterdayLastMealTime ?? null,
  );
}

export { MEAL_TYPE_LABELS };
