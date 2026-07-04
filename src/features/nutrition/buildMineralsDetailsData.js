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

/**
 * @param {Record<string, unknown> | null | undefined} userTargets
 * @param {number} na
 * @param {number} k
 * @returns {{ na: number, k: number, naTarget: number, kTarget: number, kShare: number, ratio: number, isBalanced: boolean }}
 */
function buildWaterBalance(na, k, userTargets) {
  const naTarget = resolveTarget(userTargets, 'na', TARGETS.min.na);
  const kTarget = resolveTarget(userTargets, 'k', TARGETS.min.k);
  const total = na + k;
  const kShare = total > 0 ? k / total : 0.5;
  const ratio = na > 0 ? k / na : k > 0 ? 2 : 0;

  return {
    na,
    k,
    naTarget,
    kTarget,
    kShare,
    ratio: Math.round(ratio * 100) / 100,
    isBalanced: k > na,
  };
}

const MINERAL_KEYS = [
  { key: 'mg', label: 'Magnesio', color: '#60a5fa', fallback: TARGETS.min.mg },
  { key: 'ca', label: 'Calcio', color: '#e2e8f0', fallback: TARGETS.min.ca },
  { key: 'fe', label: 'Ferro', color: '#f87171', fallback: TARGETS.min.fe },
  { key: 'zn', label: 'Zinco', color: '#a78bfa', fallback: TARGETS.min.zn },
  { key: 'cu', label: 'Rame', color: '#fb923c', fallback: TARGETS.min.cu },
  { key: 'p', label: 'Fosforo', color: '#fbbf24', fallback: TARGETS.min.p },
];

/**
 * @param {Array<Record<string, unknown>> | null | undefined} dailyLog
 * @param {Record<string, unknown> | null | undefined} userTargets
 */
export function buildMineralsDetailsData(dailyLog, userTargets) {
  const totali = computeTotali(dailyLog || []);
  const na = safeNum(totali.na);
  const k = safeNum(totali.k);

  const waterBalance = buildWaterBalance(na, k, userTargets);

  const minerals = MINERAL_KEYS.map(({ key, label, color, fallback }) => ({
    key,
    label,
    color,
    current: safeNum(totali[key]),
    target: resolveTarget(userTargets, key, fallback),
    unit: 'mg',
  }));

  return { waterBalance, minerals };
}

export const EMPTY_MINERALS_DETAILS_DATA = buildMineralsDetailsData([], null);
