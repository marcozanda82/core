import { getHealthSnapshot } from '../../adapters/getHealthSnapshot.js';

export const TYPICAL_DATE_STR = '2026-09-13';
export const TYPICAL_NOW_MS = Date.parse('2026-09-13T22:00:00');

/**
 * Mock trackerStorico dello Step 1: 7.5 h sonno, buffer cena→sonno 3 h.
 */
export function buildTypicalTrackerStorico() {
  return {
    trackerStoricoDay: {
      data: TYPICAL_DATE_STR,
      mealTimes: {
        colazione: 8,
        pranzo: 13.25,
        cena: 20.5,
      },
      log: [
        {
          type: 'sleep',
          id: 'sleep_manual_1',
          hours: 7.5,
          duration: 7.5,
          sleepHours: 7.5,
          wakeTime: 7,
          sleepEnd: 7,
          quality: 4,
        },
        {
          type: 'food',
          id: 'food_colazione',
          mealType: 'colazione',
          mealTime: 8,
          kcal: 420,
          prot: 32,
          fibre: 6,
        },
        {
          type: 'food',
          id: 'food_pranzo',
          mealType: 'pranzo',
          mealTime: 13.25,
          kcal: 710,
          prot: 48,
          fibre: 11,
        },
        {
          type: 'food',
          id: 'food_cena',
          mealType: 'cena',
          mealTime: 20.5,
          kcal: 650,
          prot: 45,
          fibre: 9,
        },
        {
          type: 'workout',
          id: 'workout_walk',
          workoutType: 'camminata',
          name: 'Camminata',
          duration: 0.5,
          time: 18,
        },
      ],
      manualNodes: [],
    },
    trackerStoricoWeek: {
      'trackerStorico_2026-09-07': {
        data: '2026-09-07',
        log: [
          { type: 'sleep', id: 'sleep_7', hours: 7, wakeTime: 6.5, quality: 3 },
          { type: 'food', mealType: 'cena', mealTime: 21, kcal: 500, prot: 40, fibre: 8 },
        ],
      },
      'trackerStorico_2026-09-08': {
        data: '2026-09-08',
        log: [
          { type: 'sleep', id: 'sleep_8', hours: 8, wakeTime: 7.25, quality: 5 },
          {
            type: 'workout',
            id: 'run_8',
            workoutType: 'corsa',
            duration: 0.4,
            time: 7.5,
          },
        ],
      },
      'trackerStorico_2026-09-09': {
        data: '2026-09-09',
        log: [
          { type: 'sleep', id: 'sleep_9', hours: 6.5, wakeTime: 7, quality: 2 },
          { type: 'food', mealType: 'pranzo', mealTime: 13, kcal: 800, prot: 55, fibre: 12 },
        ],
      },
      'trackerStorico_2026-09-10': {
        data: '2026-09-10',
        log: [{ type: 'sleep', id: 'sleep_10', hours: 7.25, wakeTime: 6.75, quality: 4 }],
      },
      'trackerStorico_2026-09-11': {
        data: '2026-09-11',
        log: [
          { type: 'sleep', id: 'sleep_11', hours: 7.75, wakeTime: 7.5, quality: 4 },
          { type: 'food', mealType: 'colazione', mealTime: 8, kcal: 380, prot: 28, fibre: 5 },
        ],
      },
      'trackerStorico_2026-09-12': {
        data: '2026-09-12',
        log: [
          { type: 'sleep', id: 'sleep_12', hours: 7, wakeTime: 7, quality: 3 },
          { type: 'food', mealType: 'cena', mealTime: 21.25, kcal: 620, prot: 42, fibre: 7 },
        ],
      },
    },
    kineticsData: {
      glycemicPenalty: 1.08,
      fastingHoursCurrent: 1.5,
      currentPhase: 'ABSORPTION',
    },
    fourCylinderData: {
      engineVersion: 2,
      systemic_fatigue: 0.22,
      decay: {
        legs: 0.5,
        chest: 0.04,
        back_shoulders: 0.12,
        arms: 0,
        core: 0.08,
      },
      lastStimulus: {
        workoutId: 'workout_walk',
        date: TYPICAL_DATE_STR,
        at: Date.parse('2026-09-13T18:00:00'),
        workoutType: 'camminata',
      },
    },
    userTargets: {
      kcal: 2300,
      prot: 160,
      fibre: 32,
    },
    nowMs: TYPICAL_NOW_MS,
    dateStr: TYPICAL_DATE_STR,
  };
}

export function buildTypicalHealthSnapshot() {
  return getHealthSnapshot(buildTypicalTrackerStorico());
}
