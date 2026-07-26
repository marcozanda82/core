import {
  getLogFromStoricoTree,
  getTodayString,
  TRACKER_STORICO_KEY,
} from '../../../coreEngine';
import { getHoursSinceLastMeal } from './metabolicStateEngine';
import { isDayIntentionalFast } from '../../../utils/dayTrackingStatus';

/** Fallback proteine (g) se target profilo assente. */
export const DEFAULT_PROTEIN_TARGET_G = 130;

/** Soglia ore digiuno → allenamento considered "fasted". */
export const FASTED_WORKOUT_HOURS_THRESHOLD = 14;

/**
 * Somma proteine da un log giorno (flat food/recipe o meal.items).
 * @param {unknown} log
 * @returns {number}
 */
export function sumDayProteinGrams(log) {
  const list = Array.isArray(log) ? log : [];
  let total = 0;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'meal' && Array.isArray(entry.items)) {
      for (const item of entry.items) {
        total += Number(item?.prot ?? item?.protein ?? item?.proteine) || 0;
      }
      continue;
    }
    if (entry.type === 'food' || entry.type === 'recipe') {
      total += Number(entry.prot ?? entry.protein ?? entry.proteine) || 0;
    }
  }
  return total;
}

/**
 * Target proteico effettivo (g).
 * @param {unknown} proteinTarget
 * @returns {number}
 */
export function resolveEffectiveProteinTarget(proteinTarget) {
  const n = Number(proteinTarget);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_PROTEIN_TARGET_G;
}

/**
 * Scansiona `fullHistory` e costruisce la mappa ISO date → proteinTargetHit.
 *
 * @param {object | null | undefined} fullHistory albero tracker_data
 * @param {number | null | undefined} proteinTarget target g (fallback 130)
 * @param {{ activeLog?: Array|null, anchorDate?: string }} [options]
 *   Se `activeLog` è passato, sovrascrive/arricchisce il giorno `anchorDate` (oggi live).
 * @returns {Object.<string, boolean>}
 */
export function buildDailyNutritionMap(fullHistory, proteinTarget, options = {}) {
  const effectiveTarget = resolveEffectiveProteinTarget(proteinTarget);
  /** @type {Object.<string, boolean>} */
  const map = {};
  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};

  for (const key of Object.keys(tree)) {
    const m = /(\d{4}-\d{2}-\d{2})/.exec(String(key));
    if (!m) continue;
    const date = m[1];
    const log = getLogFromStoricoTree(tree, date);
    map[date] = sumDayProteinGrams(log) >= effectiveTarget;
  }

  const activeLog = options.activeLog;
  if (Array.isArray(activeLog)) {
    const anchor = String(options.anchorDate || getTodayString()).slice(0, 10);
    map[anchor] = sumDayProteinGrams(activeLog) >= effectiveTarget;
  }

  return map;
}

/**
 * True se digiuno intenzionale oppure > 14h dall'ultimo pasto.
 *
 * @param {Array | null | undefined} dailyLog log attivo del giorno
 * @param {{
 *   fullHistory?: object | null,
 *   anchorDate?: string,
 *   dayNode?: object | null,
 *   now?: Date,
 * }} [options]
 * @returns {boolean}
 */
export function isCurrentlyFasted(dailyLog, options = {}) {
  const anchorDate = String(options.anchorDate || getTodayString()).slice(0, 10);
  const fullHistory = options.fullHistory && typeof options.fullHistory === 'object'
    ? options.fullHistory
    : null;

  const dayNode =
    options.dayNode
    ?? (fullHistory ? fullHistory[TRACKER_STORICO_KEY(anchorDate)] : null);

  if (isDayIntentionalFast(dayNode)) return true;

  const hours = getHoursSinceLastMeal(fullHistory, dailyLog || [], {
    anchorDate,
    now: options.now instanceof Date ? options.now : new Date(),
  });

  if (hours == null || !Number.isFinite(hours)) return false;
  return hours > FASTED_WORKOUT_HOURS_THRESHOLD;
}

/**
 * @typedef {object} TodayNutritionSnapshot
 * @property {boolean} isFasted digiuno profondo / intenzionale
 * @property {number} todayProt grammi proteine oggi
 * @property {number} targetProt target g (fallback 130)
 * @property {boolean} shieldActive todayProt >= targetProt
 */

/**
 * Snapshot nutrizionale di oggi per DIAG / 3° pilastro.
 *
 * @param {Array | null | undefined} dailyLog log attivo (se assente → log oggi da fullHistory)
 * @param {object | null | undefined} fullHistory albero tracker_data
 * @param {number | null | undefined} proteinTarget
 * @param {{ todayIso?: string, now?: Date }} [options]
 * @returns {TodayNutritionSnapshot}
 */
export function getTodayNutritionSnapshot(dailyLog, fullHistory, proteinTarget, options = {}) {
  const todayIso = String(options.todayIso || getTodayString()).slice(0, 10);
  const targetProt = resolveEffectiveProteinTarget(proteinTarget);
  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};

  const log = Array.isArray(dailyLog)
    ? dailyLog
    : getLogFromStoricoTree(tree, todayIso);

  const todayProt = Math.round(sumDayProteinGrams(log) * 10) / 10;
  const shieldActive = todayProt >= targetProt;
  const isFasted = isCurrentlyFasted(log, {
    fullHistory: tree,
    anchorDate: todayIso,
    now: options.now instanceof Date ? options.now : new Date(),
  });

  return {
    isFasted,
    todayProt,
    targetProt,
    shieldActive,
  };
}
