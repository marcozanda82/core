import { computeTotali } from '../../useBiochimico';
import { getTodayString } from '../../coreEngine';

const TRACKER_STORICO_PREFIX = 'trackerStorico_';
const VAULT_KEYS = ['vitA', 'vitD', 'vitE', 'vitK', 'vitB12'];

/**
 * @param {string} anchorIso
 * @param {number} daysBack
 * @returns {string}
 */
function dateOffsetIso(anchorIso, daysBack) {
  const base = new Date(`${anchorIso}T12:00:00`);
  base.setDate(base.getDate() - daysBack);
  return base.toISOString().slice(0, 10);
}

/**
 * @param {unknown} raw
 * @returns {Array<Record<string, unknown>> | null}
 */
function normalizeLogArray(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return Object.values(raw);
  return null;
}

/**
 * @param {string} dateStr
 * @returns {Array<Record<string, unknown>> | null}
 */
function readLogFromLocalStorage(dateStr) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(`${TRACKER_STORICO_PREFIX}${dateStr}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeLogArray(parsed?.log ?? parsed?.dati?.log);
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} fullHistory
 * @param {string} dateStr
 * @returns {Array<Record<string, unknown>> | null}
 */
function readLogFromHistoryTree(fullHistory, dateStr) {
  if (!fullHistory || typeof fullHistory !== 'object') return null;
  const node = fullHistory[`${TRACKER_STORICO_PREFIX}${dateStr}`];
  if (!node || typeof node !== 'object') return null;
  return normalizeLogArray(node.log ?? node.dati?.log);
}

/**
 * Somma liposolubili + B12 sugli ultimi 7 giorni (incluso oggi).
 * Legge prima `localStorage` (`trackerStorico_YYYY-MM-DD`), poi opzionalmente `fullHistory` Firebase.
 *
 * @param {{
 *   anchorDate?: string,
 *   todayLog?: Array<Record<string, unknown>> | null,
 *   fullHistory?: Record<string, unknown> | null,
 * }} [options]
 * @returns {{
 *   vitA: number,
 *   vitD: number,
 *   vitE: number,
 *   vitK: number,
 *   vitB12: number,
 *   daysWithData: number,
 *   daysInWindow: number,
 * }}
 */
export function calculateWeeklyVitamins(options = {}) {
  const anchorDate = String(options.anchorDate || getTodayString()).slice(0, 10);
  const todayLog = Array.isArray(options.todayLog) ? options.todayLog : null;
  const fullHistory = options.fullHistory ?? null;

  /** @type {Record<string, number>} */
  const totals = Object.fromEntries(VAULT_KEYS.map((key) => [key, 0]));
  let daysWithData = 0;

  for (let i = 0; i < 7; i += 1) {
    const dateStr = dateOffsetIso(anchorDate, i);
    let log =
      i === 0 && todayLog && todayLog.length > 0
        ? todayLog
        : readLogFromLocalStorage(dateStr);

    if ((!log || log.length === 0) && fullHistory) {
      log = readLogFromHistoryTree(fullHistory, dateStr);
    }

    if (i === 0 && (!log || log.length === 0) && todayLog) {
      log = todayLog;
    }

    if (!log || log.length === 0) continue;

    const dayTotals = computeTotali(log);
    let hasNutrient = false;

    VAULT_KEYS.forEach((key) => {
      const value = Number(dayTotals[key]) || 0;
      if (value > 0) hasNutrient = true;
      totals[key] += value;
    });

    if (hasNutrient || log.some((e) => e?.type === 'food' || e?.type === 'recipe')) {
      daysWithData += 1;
    }
  }

  VAULT_KEYS.forEach((key) => {
    totals[key] = Math.round(totals[key] * 10) / 10;
  });

  return {
    ...totals,
    daysWithData,
    daysInWindow: 7,
  };
}
