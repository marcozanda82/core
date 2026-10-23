/**
 * Serie grafiche prodotto Focus — solo metriche presenti in dossier/fixture.
 * Giorni assenti o senza eventi → status missing, value null (mai 0 inventato).
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';

/**
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {string[]}
 */
function enumerateDates(fromDate, toDate) {
  if (!isIsoDateString(fromDate) || !isIsoDateString(toDate) || fromDate > toDate) {
    return [];
  }
  /** @type {string[]} */
  const out = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    out.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return out;
}

/**
 * @param {object|null|undefined} dossier
 * @param {string} fromDate
 * @param {string} toDate
 */
function sleepSeriesFromDossier(dossier, fromDate, toDate) {
  const nights = Array.isArray(dossier?.sleepRoutine?.nights)
    ? dossier.sleepRoutine.nights
    : [];
  const byDate = new Map();
  for (const n of nights) {
    if (n?.nightEndedOn) byDate.set(n.nightEndedOn, n);
  }
  return enumerateDates(fromDate, toDate).map((date) => {
    const n = byDate.get(date);
    if (!n || !n.nodePresent) {
      return {
        date,
        status: 'missing',
        value: null,
        unit: 'h',
        provenance: 'missing',
        label: date.slice(5),
      };
    }
    if (!n.available || n.hours?.value == null || n.hours?.provenance === 'missing') {
      return {
        date,
        status: 'no_recording',
        value: null,
        unit: 'h',
        provenance: 'missing',
        label: date.slice(5),
      };
    }
    return {
      date,
      status: 'recorded',
      value: Number(n.hours.value),
      unit: 'h',
      provenance: n.hours.provenance || 'recorded',
      label: date.slice(5),
    };
  });
}

/**
 * @param {object|null|undefined} fullHistory
 * @param {string} fromDate
 * @param {string} toDate
 */
function nutritionAndActivityFromHistory(fullHistory, fromDate, toDate) {
  /** @type {object[]} */
  const protein = [];
  /** @type {object[]} */
  const workoutMin = [];

  for (const date of enumerateDates(fromDate, toDate)) {
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) {
      protein.push({
        date,
        status: 'missing',
        value: null,
        unit: 'g',
        provenance: 'missing',
        label: date.slice(5),
      });
      workoutMin.push({
        date,
        status: 'missing',
        value: null,
        unit: 'min',
        provenance: 'missing',
        label: date.slice(5),
      });
      continue;
    }

    const log = Array.isArray(node.log) ? node.log : [];
    let protSum = 0;
    let foodEvents = 0;
    let workoutMinutes = 0;
    let workoutEvents = 0;

    for (const entry of log) {
      const type = String(entry?.type || '');
      if (type === 'food' || type === 'recipe') {
        foodEvents += 1;
        const p = Number(entry?.prot ?? entry?.proteinG);
        if (Number.isFinite(p)) protSum += p;
      }
      if (type === 'workout') {
        workoutEvents += 1;
        const dur = Number(entry?.duration);
        if (Number.isFinite(dur)) {
          // duration < 3 tipicamente ore decimali (0.5 = 30 min); altrimenti minuti
          workoutMinutes += dur > 0 && dur < 3 ? Math.round(dur * 60) : Math.round(dur);
        }
      }
    }

    protein.push({
      date,
      status: foodEvents > 0 ? 'recorded' : 'no_recording',
      value: foodEvents > 0 ? Math.round(protSum * 10) / 10 : null,
      unit: 'g',
      provenance: foodEvents > 0 ? 'recorded' : 'missing',
      label: date.slice(5),
    });
    workoutMin.push({
      date,
      status: workoutEvents > 0 ? 'recorded' : 'no_recording',
      value: workoutEvents > 0 ? workoutMinutes : null,
      unit: 'min',
      provenance: workoutEvents > 0 ? 'recorded' : 'missing',
      label: date.slice(5),
    });
  }

  return { protein, workoutMin };
}

/**
 * @param {{
 *   periodId: string,
 *   dossier: object|null,
 *   fullHistory: object|null,
 *   dates: object,
 * }} input
 */
export function buildFocusProductChartSeries(input) {
  const dossier = input?.dossier || null;
  const fullHistory = input?.fullHistory || null;
  const dates = input?.dates || {};
  const periodId = String(input?.periodId || '');

  let fromDate = dates.analysisDate || null;
  let toDate = dates.analysisDate || null;
  let windowLabel = 'giorno di riferimento';

  if (periodId === 'settimana' && dates.weekWindow?.fromDate && dates.weekWindow?.toDate) {
    fromDate = dates.weekWindow.fromDate;
    toDate = dates.weekWindow.toDate;
    windowLabel = `settimana ${fromDate} → ${toDate}`;
  } else if (periodId === 'mese' && dates.monthWindow?.fromDate && dates.monthWindow?.toDate) {
    fromDate = dates.monthWindow.fromDate;
    toDate = dates.monthWindow.toDate;
    windowLabel = `mese ${fromDate} → ${toDate}`;
  } else if (periodId === 'ieri' && dates.analysisDate) {
    // Contesto breve (7 giorni che terminano sull'analisi) per rendere leggibile il grafico
    toDate = dates.analysisDate;
    fromDate = addCalendarDays(dates.analysisDate, -6);
    windowLabel = `ultimi 7 giorni fino a ${toDate}`;
  }

  if (!fromDate || !toDate) {
    return {
      ok: false,
      windowLabel: null,
      fromDate: null,
      toDate: null,
      charts: [],
    };
  }

  const sleepFrom = dates.weekWindow?.sleepWakeFrom
    || dates.monthWindow?.sleepWakeFrom
    || fromDate;
  const sleepTo = dates.weekWindow?.sleepWakeTo
    || dates.monthWindow?.sleepWakeTo
    || toDate;

  const sleepPoints = sleepSeriesFromDossier(dossier, sleepFrom, sleepTo);
  const { protein, workoutMin } = nutritionAndActivityFromHistory(
    fullHistory,
    fromDate,
    toDate,
  );

  const packChart = (id, title, domain, unit, points) => {
    const recorded = points.filter((p) => p.status === 'recorded' && p.value != null);
    return {
      id,
      title,
      domain,
      unit,
      windowLabel,
      fromDate,
      toDate,
      points,
      recordedCount: recorded.length,
      missingCount: points.filter((p) => p.status !== 'recorded').length,
      hasData: recorded.length > 0,
      emptyLabel: 'Nessun dato registrato in questa finestra.',
    };
  };

  return {
    ok: true,
    windowLabel,
    fromDate,
    toDate,
    charts: [
      packChart('sleep', 'Sonno (ore per notte)', 'sleep', 'h', sleepPoints),
      packChart('protein', 'Proteine dai pasti (g/giorno)', 'nutrition', 'g', protein),
      packChart('movement', 'Movimento registrato (min/giorno)', 'activity', 'min', workoutMin),
    ],
  };
}
