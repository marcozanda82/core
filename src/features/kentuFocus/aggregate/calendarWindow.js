/**
 * Finestre a giorni di calendario (non “ultimi N brief ricevuti”).
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';

/**
 * @param {string} date
 */
export function createEmptyDayBrief(date) {
  return {
    date,
    hasFood: false,
    hasWorkout: false,
    sleepAvailable: false,
    nutrition: {
      kcal: null,
      proteinG: null,
      carbG: null,
      fatG: null,
      fiberG: null,
    },
    sleep: { hours: null },
    activity: {
      workoutKcal: null,
      cardioMinutes: null,
      workoutCount: 0,
    },
    body: { weightKg: null },
    foodItems: [],
    /** Giorno di calendario senza brief in input */
    calendarPlaceholder: true,
  };
}

/**
 * Allinea i brief a una finestra di calendario che termina in `endDate` (inclusa).
 * Giorni assenti → placeholder (nessuna registrazione alimentare / sonno / workout).
 *
 * @param {object[]} dayBriefs
 * @param {string} endDate YYYY-MM-DD
 * @param {number} windowDays
 */
export function alignBriefsToCalendarWindow(dayBriefs, endDate, windowDays) {
  if (!isIsoDateString(endDate)) {
    throw new Error(`alignBriefsToCalendarWindow: endDate non ISO: ${endDate}`);
  }
  const n = Math.max(1, Number(windowDays) || 1);
  const byDate = new Map();
  for (const brief of Array.isArray(dayBriefs) ? dayBriefs : []) {
    if (brief?.date && isIsoDateString(brief.date)) {
      byDate.set(brief.date, { ...brief, calendarPlaceholder: false });
    }
  }

  const out = [];
  let briefsReceived = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(endDate, -i);
    const existing = byDate.get(date);
    if (existing) {
      briefsReceived += 1;
      out.push(existing);
    } else {
      out.push(createEmptyDayBrief(date));
    }
  }

  return {
    briefs: out,
    calendarDays: n,
    briefsReceived,
    startDate: out[0]?.date,
    endDate,
  };
}
