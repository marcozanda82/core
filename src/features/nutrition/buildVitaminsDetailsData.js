import { computeTotali, DEFAULT_TARGETS, getTargetForNutrient, TARGETS } from '../../useBiochimico';

/**
 * @param {unknown} value
 * @returns {number}
 */
function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Record<string, unknown> | null | undefined} userTargets
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
function resolveTarget(userTargets, key, fallback) {
  const fromUser = safeNum(userTargets?.[key]);
  if (fromUser > 0) return fromUser;
  const fromDefaults = safeNum(DEFAULT_TARGETS[key]);
  if (fromDefaults > 0) return fromDefaults;
  const fromTargets = safeNum(getTargetForNutrient(key));
  if (fromTargets > 0) return fromTargets;
  return fallback;
}

const HYDRO_KEYS = [
  { key: 'vitc', label: 'Vitamina C', color: '#34d399', unit: 'mg', fallback: TARGETS.vit.vitc },
  { key: 'vitB2', label: 'Vitamina B2', color: '#60a5fa', unit: 'mg', fallback: TARGETS.vit.vitB2 },
  { key: 'vitB6', label: 'Vitamina B6', color: '#818cf8', unit: 'mg', fallback: TARGETS.vit.vitB6 },
  { key: 'b9', label: 'Vitamina B9', color: '#a78bfa', unit: 'µg', fallback: TARGETS.vit.b9 },
];

const WEEKLY_VIT_KEYS = [
  { key: 'vitA', label: 'Vitamina A', color: '#fb923c', unit: 'µg', fallback: TARGETS.vit.vitA },
  { key: 'vitD', label: 'Vitamina D', color: '#fbbf24', unit: 'µg', fallback: TARGETS.vit.vitD },
  { key: 'vitE', label: 'Vitamina E', color: '#facc15', unit: 'mg', fallback: TARGETS.vit.vitE },
  { key: 'vitK', label: 'Vitamina K', color: '#84cc16', unit: 'µg', fallback: TARGETS.vit.vitK },
  { key: 'vitB12', label: 'Vitamina B12', color: '#c4b5fd', unit: 'µg', fallback: TARGETS.vit.vitB12 },
];

/**
 * @param {Record<string, unknown> | null | undefined} weeklyTotals — totali aggregati 7 gg (calculateWeeklyVitamins)
 */
export function buildVitaminsDetailsData(dailyLog, userTargets, weeklyTotals = null) {
  const totali = computeTotali(dailyLog || []);

  const hydrosoluble = HYDRO_KEYS.map(({ key, label, color, unit, fallback }) => ({
    key,
    label,
    color,
    unit,
    current: safeNum(totali[key]),
    target: resolveTarget(userTargets, key, fallback),
  }));

  const weeklyVault = WEEKLY_VIT_KEYS.map(({ key, label, color, unit, fallback }) => {
    const dailyTarget = resolveTarget(userTargets, key, fallback);
    return {
      key,
      label,
      color,
      unit,
      current: safeNum(weeklyTotals?.[key]),
      target: dailyTarget * 7,
      daysInWindow: safeNum(weeklyTotals?.daysWithData) || 0,
    };
  });

  return { hydrosoluble, weeklyVault };
}

export const EMPTY_VITAMINS_DETAILS_DATA = buildVitaminsDetailsData([], null, null);
