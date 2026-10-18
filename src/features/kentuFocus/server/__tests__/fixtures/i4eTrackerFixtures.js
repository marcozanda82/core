/**
 * Fixture RTDB sintetiche per pipeline I4-E (nessun dato reale utente).
 */

import { addCalendarDays } from '../../../normalize/focusDateUtils.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
  buildMissingValuesFixture,
} from '../../../__tests__/fixtures/focusDayFixtures.js';
import { trackerDayPath } from '../../paths/trackerRtdbPaths.js';

export { ANALYSIS_DATE, PUBLICATION_DATE };

/**
 * @param {object} dayNode
 * @param {string} date
 */
function stampDate(dayNode, date) {
  if (!dayNode) return null;
  return { ...dayNode, data: date };
}

/**
 * Mappa date → nodi per giornata completa + sonno successivo.
 */
export function buildFullTrackerDayMap(opts = {}) {
  const analysisDate = opts.analysisDate || ANALYSIS_DATE;
  const publicationDate = opts.publicationDate || PUBLICATION_DATE;
  const fixture = buildFullDayFixture();
  const map = {
    [analysisDate]: stampDate(fixture.analysisDayNode, analysisDate),
    [publicationDate]: stampDate(fixture.publicationDayNode, publicationDate),
  };

  const historyDays = opts.historyDays ?? 20;
  for (let i = 1; i < historyDays; i += 1) {
    const d = addCalendarDays(analysisDate, -i);
    const sleepD = addCalendarDays(d, 1);
    if (!map[d]) {
      map[d] = {
        data: d,
        log: [
          {
            type: 'food',
            id: `food_${d}`,
            mealType: 'pranzo',
            mealTime: 13,
            name: opts.foodName || 'Pasta al pomodoro',
            kcal: 600 + (i % 5) * 20,
            prot: 25,
            carb: 70,
            fat: 18,
            fibre: 5,
          },
          {
            type: 'workout',
            id: `w_${d}`,
            name: 'Camminata',
            duration: 30,
            kcal: 120,
          },
        ],
        manualNodes: [{ type: 'water', id: `wtr_${d}`, ml: 1000 }],
      };
    }
    if (!map[sleepD]) {
      map[sleepD] = {
        data: sleepD,
        log: [
          {
            type: 'sleep',
            id: `sleep_${sleepD}`,
            hours: 7 + (i % 3) * 0.2,
            wakeTime: 7,
            quality: 4,
            deepMin: 70,
            remMin: 80,
          },
        ],
      };
    }
  }
  return map;
}

/** Solo analysis + publication senza sonno. */
export function buildNoSleepTrackerMap() {
  const fixture = buildFullDayFixture();
  return {
    [ANALYSIS_DATE]: stampDate(fixture.analysisDayNode, ANALYSIS_DATE),
    [PUBLICATION_DATE]: {
      data: PUBLICATION_DATE,
      log: [], // no sleep
    },
  };
}

/** Due notti comparabili → ambiguità. */
export function buildAmbiguousSleepTrackerMap() {
  const fixture = buildFullDayFixture();
  return {
    [ANALYSIS_DATE]: stampDate(fixture.analysisDayNode, ANALYSIS_DATE),
    [PUBLICATION_DATE]: {
      data: PUBLICATION_DATE,
      log: [
        {
          type: 'sleep',
          id: 'sleep_a',
          hours: 7.0,
          wakeTime: 7,
          bedtime: 0,
          quality: 4,
        },
        {
          type: 'sleep',
          id: 'sleep_b',
          hours: 7.2,
          wakeTime: 7.5,
          bedtime: 0.3,
          quality: 3,
        },
      ],
    },
  };
}

/** Correzione stesso ID + nap. */
export function buildDedupSleepTrackerMap() {
  const fixture = buildFullDayFixture();
  return {
    [ANALYSIS_DATE]: stampDate(fixture.analysisDayNode, ANALYSIS_DATE),
    [PUBLICATION_DATE]: {
      data: PUBLICATION_DATE,
      log: [
        {
          type: 'sleep',
          id: 'sleep_main',
          hours: 5,
          wakeTime: 6,
          quality: 2,
          updatedAt: 1,
        },
        {
          type: 'sleep',
          id: 'nap1',
          hours: 1.5,
          wakeTime: 15,
        },
        {
          type: 'sleep',
          id: 'sleep_main',
          hours: 7.5,
          wakeTime: 7,
          bedtime: 23.5,
          quality: 4,
          updatedAt: 2,
        },
      ],
    },
  };
}

/** Giornata scarsa. */
export function buildSparseTrackerMap() {
  const fixture = buildMissingValuesFixture();
  return {
    [ANALYSIS_DATE]: stampDate(fixture.analysisDayNode, ANALYSIS_DATE),
    [PUBLICATION_DATE]: {
      data: PUBLICATION_DATE,
      log: [
        {
          type: 'sleep',
          id: 'sleep_only',
          hours: 6.5,
          wakeTime: 7,
          quality: 3,
        },
      ],
    },
  };
}

/** Storico discontinuo: pochi giorni sparsi. */
export function buildDiscontinuousHistoryMap() {
  const map = buildSparseTrackerMap();
  for (const offset of [3, 10, 25]) {
    const d = addCalendarDays(ANALYSIS_DATE, -offset);
    const sleepD = addCalendarDays(d, 1);
    map[d] = {
      data: d,
      log: [{
        type: 'food', id: `f_${d}`, mealType: 'cena', mealTime: 20,
        name: 'Insalata', kcal: 400, prot: 20, carb: 30, fat: 15, fibre: 8,
      }],
    };
    map[sleepD] = {
      data: sleepD,
      log: [{ type: 'sleep', id: `s_${sleepD}`, hours: 7, wakeTime: 7, quality: 4 }],
    };
  }
  return map;
}

/** Attraversamento anno. */
export function buildYearBoundaryMap() {
  const analysisDate = '2025-12-31';
  const publicationDate = '2026-01-01';
  const base = buildFullTrackerDayMap({
    analysisDate,
    publicationDate,
    historyDays: 10,
  });
  return { map: base, analysisDate, publicationDate };
}

/** Vicino a cambio ora legale EU (2026-03-29). */
export function buildDstBoundaryMap() {
  const analysisDate = '2026-03-28';
  const publicationDate = '2026-03-29';
  const base = buildFullTrackerDayMap({
    analysisDate,
    publicationDate,
    historyDays: 14,
  });
  return { map: base, analysisDate, publicationDate };
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 * @param {Record<string, object>} dayMap
 */
export async function seedTrackerMap(db, uid, dayMap) {
  const updates = {};
  for (const [date, node] of Object.entries(dayMap)) {
    updates[trackerDayPath(uid, date)] = node;
  }
  await db.ref().update(updates);
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 */
export async function clearUserFocusAndTracker(db, uid) {
  await db.ref(`kentu_focus/${uid}`).set(null);
  // Intero ramo utente di test (tracker + profile_targets + body_metrics)
  await db.ref(`users/${uid}`).set(null);
}
