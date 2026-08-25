/**
 * Costruttori dati per il grafico a torta pasti (Home dial).
 * Funzioni pure: nessun accesso a React state.
 */

import { MEAL_LABELS_SAVE } from '../../../coreEngine';
import { safeNum } from '../../../utils/salaComandiUtils';

const PIE_COLORS = ['#00e5ff', '#b388ff', '#00e676', '#ffea00', '#ff9800', '#f48fb1', '#4fc3f7', '#aed581', '#ffb74d'];
const RIMANENTI_SLICE_COLOR = 'rgba(255, 255, 255, 0.05)';

/**
 * Aggrega activeLog in fette kcal (pasti + rimanenti/surplus).
 *
 * @param {{
 *   activeLog?: object[],
 *   dailyTargetKcal?: number,
 * }} params
 * @returns {object[]}
 */
export function buildMealPieData({
  activeLog = [],
  dailyTargetKcal: dailyTargetKcalRaw = 2000,
} = {}) {
  const rimanentiSliceColor = RIMANENTI_SLICE_COLOR;
  const mealsById = {};

  (Array.isArray(activeLog) ? activeLog : []).forEach((item) => {
    if (item.type !== 'food' && item.type !== 'recipe' && item.type !== 'meal') return;

    const timeKey = typeof item.mealTime === 'number' ? item.mealTime.toString() : 'unknown';
    const typeKey = item.mealType || 'pasto';
    const uniqueMealId = `${typeKey}_${timeKey}`;

    if (!mealsById[uniqueMealId]) {
      let timeLabel = '';
      if (typeof item.mealTime === 'number') {
        const h = Math.floor(item.mealTime).toString().padStart(2, '0');
        const m = Math.round((item.mealTime % 1) * 60).toString().padStart(2, '0');
        timeLabel = ` (${h}:${m})`;
      }

      const slot = item.mealType ? (item.mealType.split('_')[0] || 'snack') : 'snack';
      const baseName = MEAL_LABELS_SAVE?.[slot] || item.mealType || 'Pasto';

      mealsById[uniqueMealId] = {
        id: uniqueMealId,
        name: `${baseName}${timeLabel}`,
        value: 0,
        prot: 0,
        carb: 0,
        fat: 0,
        timeValue: typeof item.mealTime === 'number' ? item.mealTime : 0,
      };
    }

    mealsById[uniqueMealId].value += safeNum(item.kcal ?? item.cal);
    mealsById[uniqueMealId].prot += safeNum(item.prot ?? item.proteine);
    mealsById[uniqueMealId].carb += safeNum(item.carb ?? item.carboidrati);
    mealsById[uniqueMealId].fat += safeNum(item.fatTotal ?? item.fat ?? item.grassi);
  });

  const calculatedPieData = Object.values(mealsById)
    .sort((a, b) => a.timeValue - b.timeValue)
    .map((meal, index) => ({
      ...meal,
      value: safeNum(meal.value),
      prot: safeNum(meal.prot),
      carb: safeNum(meal.carb),
      fat: safeNum(meal.fat),
      macros: {
        pro: safeNum(meal.prot),
        carb: safeNum(meal.carb),
        fat: safeNum(meal.fat),
      },
      color: PIE_COLORS[index % PIE_COLORS.length],
      fill: PIE_COLORS[index % PIE_COLORS.length],
    }));

  let data = calculatedPieData.filter((d) => d.value > 0);
  const currentTotal = data.reduce((s, d) => s + safeNum(d.value), 0);
  const dailyTargetKcal = Math.round(safeNum(dailyTargetKcalRaw) || 2000) || 2000;
  const surplusKcal = Math.max(0, Math.round(currentTotal - dailyTargetKcal));

  if (dailyTargetKcal > 0 && currentTotal > 0 && currentTotal < dailyTargetKcal) {
    data = [...data, {
      name: 'Rimanenti',
      value: dailyTargetKcal - currentTotal,
      macros: null,
      id: 'rimanenti',
      fill: rimanentiSliceColor,
      color: rimanentiSliceColor,
    }];
  } else if (surplusKcal > 0 && currentTotal > 0) {
    const scale = dailyTargetKcal / currentTotal;
    data = data.map((meal) => ({
      ...meal,
      actualKcal: safeNum(meal.value),
      value: safeNum(meal.value) * scale,
    }));
    data = [...data, {
      name: 'SURPLUS',
      value: surplusKcal,
      actualKcal: surplusKcal,
      macros: null,
      id: 'surplus',
      fill: '#ef4444',
      color: '#ef4444',
    }];
  }
  if (data.length === 0) {
    data = [{
      name: 'Rimanenti',
      value: dailyTargetKcal,
      macros: null,
      id: 'rimanenti',
      fill: rimanentiSliceColor,
      color: rimanentiSliceColor,
    }];
  }
  const sortedPieData = [...data]
    .map((d) => ({ ...d, value: safeNum(d.value) }))
    .filter((fetta) => fetta.value > 0)
    .sort((a, b) => {
      if (a.id === 'rimanenti' || a.id === 'surplus') return 1;
      if (b.id === 'rimanenti' || b.id === 'surplus') return -1;
      const tA = a.timeValue ?? a.time ?? 0;
      const tB = b.timeValue ?? b.time ?? 0;
      return safeNum(tA) - safeNum(tB);
    });
  if (sortedPieData.length === 0) {
    return [{
      name: 'Rimanenti',
      value: dailyTargetKcal > 0 ? dailyTargetKcal : 1,
      macros: null,
      id: 'rimanenti',
      fill: rimanentiSliceColor,
      color: rimanentiSliceColor,
    }];
  }
  return sortedPieData;
}

/**
 * Adatta mealPieData al modo dial (kcal | pro | cho | fat).
 *
 * @param {{
 *   mealPieData?: object[],
 *   activeDialMode?: string,
 *   userTargets?: object|null,
 * }} params
 * @returns {object[]}
 */
export function buildMealPieDisplayData({
  mealPieData = [],
  activeDialMode = 'kcal',
  userTargets = null,
} = {}) {
  const pie = Array.isArray(mealPieData) ? mealPieData : [];

  if (activeDialMode === 'kcal') {
    return pie.filter((fetta) => safeNum(fetta.value) > 0);
  }

  const macroKey =
    activeDialMode === 'pro' ? 'prot' : activeDialMode === 'cho' ? 'carb' : 'fat';
  const targetG = Math.max(
    0,
    safeNum(
      activeDialMode === 'pro'
        ? userTargets?.prot ?? 150
        : activeDialMode === 'cho'
          ? userTargets?.carb ?? 200
          : userTargets?.fatTotal ?? userTargets?.fat ?? 65,
    ),
  );

  const mealsOnly = pie.filter((e) => e.id !== 'rimanenti' && e.id !== 'surplus');
  const slices = mealsOnly.map((m) => ({
    ...m,
    value: Math.max(0, safeNum(m[macroKey])),
  }));
  const consumed = slices.reduce((s, d) => s + safeNum(d.value), 0);
  let data = slices.filter((fetta) => fetta.value > 0);
  if (targetG > 0 && consumed < targetG) {
    data = [
      ...data,
      {
        name: 'Rimanenti',
        value: targetG - consumed,
        macros: null,
        id: 'rimanenti',
        fill: 'rgba(255, 255, 255, 0.05)',
        color: 'rgba(255, 255, 255, 0.05)',
        prot: 0,
        carb: 0,
        fat: 0,
        timeValue: 0,
      },
    ];
  }
  if (data.length === 0) {
    data = [
      {
        name: 'Rimanenti',
        value: targetG > 0 ? targetG : 1,
        macros: null,
        id: 'rimanenti',
        fill: 'rgba(255,255,255,0.05)',
        color: 'rgba(255,255,255,0.05)',
        prot: 0,
        carb: 0,
        fat: 0,
        timeValue: 0,
      },
    ];
  }
  return [...data]
    .map((d) => ({ ...d, value: safeNum(d.value) }))
    .filter((fetta) => fetta.value > 0)
    .sort((a, b) => {
      if (a.id === 'rimanenti') return 1;
      if (b.id === 'rimanenti') return -1;
      const tA = a.timeValue ?? 0;
      const tB = b.timeValue ?? 0;
      return safeNum(tA) - safeNum(tB);
    });
}
