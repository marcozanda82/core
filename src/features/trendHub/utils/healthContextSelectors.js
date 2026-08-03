import { addDays } from '../../../calendarDateUtils';
import { TRACKER_STORICO_KEY, normalizeLogData } from '../../../coreEngine';
import { sortHealthBiometricsAsc } from './healthBiometrics';

/** Ref stabili per evitare re-render a vuoto quando non c’è dato. */
export const EMPTY_DAY_LOG = Object.freeze([]);
export const EMPTY_FOOD_SLICE = Object.freeze({});
export const EMPTY_BODY_METRICS = Object.freeze([]);

/** Quante entry biometriche bastano a micro-trend (ultime + precedenti). */
export const HEALTH_RECENT_METRICS_LIMIT = 40;

/**
 * Data di analisi salute = giorno precedente rispetto a `todayDate`.
 * @param {string} todayDate
 * @returns {string}
 */
export function resolveHealthAnalysisDate(todayDate) {
  const safeToday = String(todayDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeToday)) return '';
  return addDays(safeToday, -1);
}

/**
 * Nodo storico RTDB per una data (`trackerStorico_YYYY-MM-DD`).
 * @param {object | null | undefined} fullHistory
 * @param {string} dateStr
 */
export function selectStoricoDayNode(fullHistory, dateStr) {
  if (!fullHistory || typeof fullHistory !== 'object' || !dateStr) return null;
  const node = fullHistory[TRACKER_STORICO_KEY(dateStr)];
  return node && typeof node === 'object' ? node : null;
}

/**
 * Log normalizzato da un singolo nodo storico (senza attraversare tutto fullHistory).
 * @param {object | null | undefined} dayNode
 * @returns {ReadonlyArray<Record<string, unknown>> | Array<Record<string, unknown>>}
 */
export function selectDayLogFromStoricoNode(dayNode) {
  if (!dayNode || typeof dayNode !== 'object') return EMPTY_DAY_LOG;
  const log = dayNode.log ?? dayNode?.dati?.log;
  const raw = log ?? [];
  const asArray = Array.isArray(raw) ? raw : Object.values(raw || {});
  const normalized = normalizeLogData(asArray);
  return normalized.length === 0 ? EMPTY_DAY_LOG : normalized;
}

/**
 * Log del giorno di analisi a partire da fullHistory (utility one-shot / test).
 * @param {object | null | undefined} fullHistory
 * @param {string} analysisDate
 */
export function selectYesterdayLog(fullHistory, analysisDate) {
  return selectDayLogFromStoricoNode(selectStoricoDayNode(fullHistory, analysisDate));
}

/**
 * Chiavi foodDb referenziate dallo scontrino del giorno (walk leggero, no engine IA).
 * @param {Array<Record<string, unknown>>} dayLog
 * @returns {string[]}
 */
export function collectFoodDbKeysFromDayLog(dayLog) {
  const keys = new Set();
  const visit = (item) => {
    if (!item || typeof item !== 'object') return;
    if (item.isGhost === true) return;
    const keyRaw = item.foodDbKey ?? item.matchedKey ?? item.dbKey ?? null;
    if (keyRaw != null && String(keyRaw).trim()) {
      keys.add(String(keyRaw).trim());
    }
    if (Array.isArray(item.items)) item.items.forEach(visit);
    if (Array.isArray(item.foods)) item.foods.forEach(visit);
  };
  (Array.isArray(dayLog) ? dayLog : []).forEach(visit);
  return [...keys];
}

/**
 * Sottoinsieme del foodDatabase limitato ai cibi dello scontrino (etichette + lazy patch).
 * @param {Record<string, unknown> | null | undefined} foodDatabase
 * @param {string[]} foodDbKeys
 */
export function selectRelevantFoodSlice(foodDatabase, foodDbKeys = []) {
  const db = foodDatabase && typeof foodDatabase === 'object' ? foodDatabase : null;
  if (!db || !Array.isArray(foodDbKeys) || foodDbKeys.length === 0) {
    return EMPTY_FOOD_SLICE;
  }
  const slice = {};
  let hit = 0;
  for (const key of foodDbKeys) {
    if (!key || !db[key]) continue;
    slice[key] = db[key];
    hit += 1;
  }
  return hit === 0 ? EMPTY_FOOD_SLICE : slice;
}

/**
 * Metriche recenti sufficienti alla card biometrica (peso/girovita + delta).
 * @param {Array<Record<string, unknown>> | null | undefined} bodyMetricsHistory
 * @param {{ maxEntries?: number }} [options]
 */
export function selectRecentBodyMetrics(bodyMetricsHistory, options = {}) {
  const maxEntries = Math.max(2, Number(options.maxEntries) || HEALTH_RECENT_METRICS_LIMIT);
  const sorted = sortHealthBiometricsAsc(bodyMetricsHistory);
  if (sorted.length === 0) return EMPTY_BODY_METRICS;
  if (sorted.length <= maxEntries) return sorted;
  return sorted.slice(-maxEntries);
}
