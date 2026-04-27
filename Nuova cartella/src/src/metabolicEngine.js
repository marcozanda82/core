import { addDays } from './calendarDateUtils';
import { computeTotali } from './useBiochimico';
import { TRACKER_STORICO_KEY, getLogFromStoricoTree } from './coreEngine';

/** kcal approssimative per ~1 kg di variazione di massa (deficit/surplus cumulato). */
export const KCAL_PER_KG_BODY_MASS = 7700;

/**
 * Data di calendario YYYY-MM-DD da una voce pesata (campo `date` o `timestamp`).
 */
export function bodyMetricCalendarDate(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    return entry.date;
  }
  const ts = Number(entry.timestamp);
  if (Number.isFinite(ts)) {
    const d = new Date(ts);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 10);
  }
  return null;
}

function combinedDayEntriesForTotals(trackerData, dateStr) {
  if (!trackerData || !dateStr) return [];
  const log = getLogFromStoricoTree(trackerData, dateStr) || [];
  const node = trackerData[TRACKER_STORICO_KEY(dateStr)];
  const manual = Array.isArray(node?.manualNodes) ? node.manualNodes : [];
  return [...log, ...manual];
}

/**
 * Giorni [pesataOld.date, pesataNew.date) per il bilancio calorico (include il giorno della prima pesata, esclude quello della nuova).
 */
function calendarDaysForCaloricBalance(oldDateStr, newDateStr) {
  const days = [];
  let d = oldDateStr;
  const lastInclusive = addDays(newDateStr, -1);
  if (lastInclusive < oldDateStr) return days;
  while (d <= lastInclusive) {
    days.push(d);
    d = addDays(d, 1);
  }
  return days;
}

function calendarDaysSpan(oldDateStr, newDateStr) {
  const t0 = new Date(`${oldDateStr}T12:00:00`).getTime();
  const t1 = new Date(`${newDateStr}T12:00:00`).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return 0;
  return Math.max(0, Math.round((t1 - t0) / 86400000));
}

/**
 * Digital twin — confronto variazione di peso reale vs attesa da deficit/surplus cumulato.
 * Con `bodyFat` su entrambe le ultime pesate: scompone FM/FFM e confronta il Δ grasso col Δ teorico.
 *
 * @param {Array} bodyMetricsHistory — voci con `weight`, `timestamp` e/o `date`
 * @param {object|null} fullHistory — albero tracker_data (come in SalaComandi)
 * @param {number} currentTDEE — fabbisogno giornaliero di riferimento (es. userTargets.kcal)
 * @returns {object|null} — include `actualFatDelta` / `actualLeanDelta` (null se manca bodyFat su una delle due pesate)
 */
export function calculateMetabolicVariance(bodyMetricsHistory, fullHistory, currentTDEE) {
  const tdee =
    typeof currentTDEE === 'number' && Number.isFinite(currentTDEE) && currentTDEE > 0
      ? currentTDEE
      : null;
  if (tdee == null || !fullHistory || typeof fullHistory !== 'object') return null;

  if (!Array.isArray(bodyMetricsHistory) || bodyMetricsHistory.length < 2) return null;

  const enriched = bodyMetricsHistory
    .map((e) => {
      const dateStr = bodyMetricCalendarDate(e);
      const w = Number(e.weight);
      if (!dateStr || !Number.isFinite(w) || w <= 0) return null;
      const ts = Number(e.timestamp);
      return {
        entry: e,
        dateStr,
        weight: w,
        sortTs: Number.isFinite(ts) ? ts : new Date(`${dateStr}T12:00:00`).getTime(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
      return a.sortTs - b.sortTs;
    });

  if (enriched.length < 2) return null;

  const rowOld = enriched[enriched.length - 2];
  const rowNew = enriched[enriched.length - 1];
  const pesataOld = rowOld.entry;
  const pesataNew = rowNew.entry;
  const oldD = rowOld.dateStr;
  const newD = rowNew.dateStr;

  const actualWeightDelta = rowNew.weight - rowOld.weight;

  const balanceDays = calendarDaysForCaloricBalance(oldD, newD);
  let cumulativeCaloricDelta = 0;
  for (const dStr of balanceDays) {
    const combined = combinedDayEntriesForTotals(fullHistory, dStr);
    const totali = computeTotali(combined);
    const kcalIn = Number(totali?.kcal) || 0;
    cumulativeCaloricDelta += kcalIn - tdee;
  }

  const theoreticalWeightDelta = cumulativeCaloricDelta / KCAL_PER_KG_BODY_MASS;

  const rawBfOld = pesataOld?.bodyFat;
  const rawBfNew = pesataNew?.bodyFat;
  const bfOld = Number(rawBfOld);
  const bfNew = Number(rawBfNew);
  const hasBodyFatOnBoth =
    rawBfOld != null &&
    rawBfOld !== '' &&
    rawBfNew != null &&
    rawBfNew !== '' &&
    Number.isFinite(bfOld) &&
    Number.isFinite(bfNew) &&
    bfOld >= 0 &&
    bfNew >= 0;

  let actualFatDelta = null;
  let actualLeanDelta = null;
  if (hasBodyFatOnBoth) {
    const oldFM = rowOld.weight * (bfOld / 100);
    const newFM = rowNew.weight * (bfNew / 100);
    actualFatDelta = newFM - oldFM;
    const oldLBM = rowOld.weight - oldFM;
    const newLBM = rowNew.weight - newFM;
    actualLeanDelta = newLBM - oldLBM;
  }

  const variance =
    actualFatDelta != null
      ? actualFatDelta - theoreticalWeightDelta
      : actualWeightDelta - theoreticalWeightDelta;

  const daysBetween = calendarDaysSpan(oldD, newD);

  return {
    pesataOld,
    pesataNew,
    actualWeightDelta,
    theoreticalWeightDelta,
    variance,
    actualFatDelta,
    actualLeanDelta,
    daysBetween,
    cumulativeCaloricDelta,
  };
}
