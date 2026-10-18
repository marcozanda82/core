/** Fixture sintetiche FocusDossier I1 — nessuna lettura Firebase. */

export const ANALYSIS_DATE = '2026-10-16';
export const PUBLICATION_DATE = '2026-10-17';

/** Giornata completa: pasti, workout, acqua, stimolante; sonno notte successiva con wrap. */
export function buildFullDayFixture() {
  return {
    analysisDate: ANALYSIS_DATE,
    publicationDate: PUBLICATION_DATE,
    targets: { kcal: 2300, proteinG: 150 },
    bodyWeightKg: 78.4,
    bodyMeasuredOn: '2026-10-15',
    analysisDayNode: {
      data: ANALYSIS_DATE,
      mealTimes: { colazione: 8, pranzo: 13.5, cena: 21.25 },
      log: [
        {
          type: 'food',
          id: 'food_colazione',
          mealType: 'colazione',
          mealTime: 8,
          name: 'Yogurt e avena',
          kcal: 420,
          prot: 32,
          carb: 48,
          fat: 12,
          fibre: 6,
        },
        {
          type: 'food',
          id: 'food_pranzo',
          mealType: 'pranzo',
          mealTime: 13.5,
          name: 'Pollo e riso',
          kcal: 780,
          prot: 55,
          carb: 70,
          fat: 22,
          fibre: 8,
        },
        {
          type: 'food',
          id: 'food_cena',
          mealType: 'cena',
          mealTime: 21.25,
          name: 'Pesce e verdure',
          kcal: 690,
          prot: 48,
          carb: 40,
          fat: 28,
          fibre: 9,
        },
        // Duplicato evidente (stesso id) — deve essere scartato.
        {
          type: 'food',
          id: 'food_cena',
          mealType: 'cena',
          mealTime: 21.25,
          name: 'Pesce e verdure DUPLICATO',
          kcal: 690,
          prot: 48,
          carb: 40,
          fat: 28,
          fibre: 9,
        },
        {
          type: 'workout',
          id: 'workout_1',
          name: 'Pesi full body',
          duration: 55,
          kcal: 320,
        },
        {
          type: 'workout',
          id: 'workout_walk',
          name: 'Camminata',
          duration: 0.5,
          kcal: 120,
        },
      ],
      manualNodes: [
        { type: 'water', id: 'w1', ml: 1000 },
        { type: 'water', id: 'w2', ml: 800 },
        { type: 'stimulant', id: 'caf1', name: 'Caffè' },
        { type: 'stimulant', id: 'caf2', name: 'Tè' },
      ],
    },
    publicationDayNode: {
      data: PUBLICATION_DATE,
      log: [
        {
          type: 'sleep',
          id: 'sleep_main',
          hours: 7.2,
          wakeTime: 7.0,
          // bedtime omesso → calcolato con wrap (≈ 23.8)
          quality: 4,
          deepMin: 60,
          remMin: 60,
        },
      ],
    },
  };
}

/** Nessun pasto; solo acqua. */
export function buildNoMealsFixture() {
  const base = buildFullDayFixture();
  return {
    ...base,
    analysisDayNode: {
      data: ANALYSIS_DATE,
      log: [
        {
          type: 'workout',
          id: 'workout_only',
          name: 'Mobilità',
          duration: 20,
        },
      ],
      manualNodes: [{ type: 'water', id: 'w1', ml: 500 }],
    },
  };
}

/** Sonno parziale: ore presenti, wake assente. */
export function buildPartialSleepFixture() {
  const base = buildFullDayFixture();
  return {
    ...base,
    publicationDayNode: {
      data: PUBLICATION_DATE,
      log: [
        {
          type: 'sleep',
          id: 'sleep_partial',
          hours: 6.5,
          quality: 3,
          // no wakeTime / bedtime
        },
      ],
    },
  };
}

/** Valori mancanti: nodi vuoti. */
export function buildMissingValuesFixture() {
  return {
    analysisDate: ANALYSIS_DATE,
    publicationDate: PUBLICATION_DATE,
    analysisDayNode: { data: ANALYSIS_DATE, log: [], manualNodes: [] },
    publicationDayNode: { data: PUBLICATION_DATE, log: [] },
  };
}

/** Attraversamento mezzanotte: wake 6:30, 8h → bedtime 22:30; oppure wake 7, 8h → 23. */
export function buildMidnightCrossingFixture() {
  return {
    analysisDate: ANALYSIS_DATE,
    publicationDate: PUBLICATION_DATE,
    analysisDayNode: {
      data: ANALYSIS_DATE,
      log: [
        {
          type: 'food',
          id: 'food_late',
          mealType: 'cena',
          mealTime: 22.5,
          name: 'Cena tarda',
          kcal: 500,
          prot: 30,
          carb: 40,
          fat: 18,
          fibre: 4,
        },
      ],
      manualNodes: [],
    },
    publicationDayNode: {
      data: PUBLICATION_DATE,
      log: [
        {
          type: 'sleep',
          id: 'sleep_wrap',
          hours: 8,
          wakeTime: 6.5,
          // bedtime calcolato = 22.5
          quality: 5,
          deepMin: 90,
          remMin: 110,
        },
      ],
    },
  };
}

/** REM/deep predefiniti 60/60 senza wearable → estimated. */
export function buildUnreliableStagesFixture() {
  const base = buildFullDayFixture();
  return {
    ...base,
    publicationDayNode: {
      data: PUBLICATION_DATE,
      log: [
        {
          type: 'sleep',
          id: 'sleep_defaults',
          hours: 7,
          wakeTime: 7,
          quality: 4,
          deepMin: 60,
          remMin: 60,
        },
      ],
    },
  };
}

/** Stessi stage 60/60 ma con hr wearable → recorded. */
export function buildWearableStagesFixture() {
  const base = buildUnreliableStagesFixture();
  return {
    ...base,
    publicationDayNode: {
      data: PUBLICATION_DATE,
      log: [
        {
          type: 'sleep',
          id: 'sleep_wearable',
          hours: 7,
          wakeTime: 7,
          quality: 4,
          deepMin: 60,
          remMin: 60,
          hr: 52,
          source: 'wearable',
        },
      ],
    },
  };
}
