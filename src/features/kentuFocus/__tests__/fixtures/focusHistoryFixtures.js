import { addCalendarDays } from '../../normalize/focusDateUtils.js';
import { buildDayBrief } from '../../aggregate/buildDayBrief.js';
import { ANALYSIS_DATE } from './focusDayFixtures.js';

/**
 * Serie sintetica: `dayCount` giorni che terminano a analysisDate.
 * Pattern: cibo ogni giorno tranne gap; sonno a giorni alterni; workout ogni 3.
 */
export function buildHistoryBriefSeries({
  analysisDate = ANALYSIS_DATE,
  dayCount = 30,
  foodGapEvery = 0,
  skipSleep = false,
  includeRecipes = true,
} = {}) {
  const briefs = [];
  for (let i = dayCount - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const skipFood = foodGapEvery > 0 && i % foodGapEvery === 1;
    const hasWorkout = i % 3 === 0;
    const hasSleep = !skipSleep && i % 2 === 0;

    const log = [];
    if (!skipFood) {
      log.push({
        type: 'food',
        id: `food_${date}_a`,
        foodDbKey: 'db_yogurt',
        name: 'Yogurt greco',
        mealType: 'colazione',
        mealTime: 8,
        kcal: 200,
        prot: 20,
        carb: 10,
        fat: 5,
        fibre: 0,
      });
      log.push({
        type: 'food',
        id: `food_${date}_b`,
        name: 'Pasta al pomodoro',
        mealType: 'pranzo',
        mealTime: 13,
        kcal: 600,
        prot: 20,
        carb: 90,
        fat: 15,
        fibre: 4,
      });
      if (includeRecipes && i % 4 === 0) {
        log.push({
          type: 'recipe',
          id: `recipe_${date}`,
          foodDbKey: 'recipe_bowl',
          name: 'Bowl proteica',
          mealType: 'cena',
          mealTime: 20,
          kcal: 550,
          prot: 40,
          carb: 45,
          fat: 18,
          fibre: 8,
        });
      } else if (!includeRecipes) {
        log.push({
          type: 'food',
          id: `food_${date}_c`,
          name: 'Pesce',
          mealType: 'cena',
          mealTime: 20,
          kcal: 450,
          prot: 35,
          carb: 10,
          fat: 20,
          fibre: 2,
        });
      }
    }
    if (hasWorkout) {
      log.push({
        type: 'workout',
        id: `w_${date}`,
        name: i % 6 === 0 ? 'Camminata' : 'Pesi',
        duration: i % 6 === 0 ? 0.5 : 45,
        kcal: i % 6 === 0 ? 100 : 280,
      });
    }

    const sleepNode = hasSleep
      ? {
        data: addCalendarDays(date, 1),
        log: [{
          type: 'sleep',
          id: `sleep_${date}`,
          hours: 7 + (i % 3) * 0.25,
          wakeTime: 7,
          quality: 4,
          deepMin: 90,
          remMin: 100,
        }],
      }
      : { data: addCalendarDays(date, 1), log: [] };

    briefs.push(buildDayBrief({
      date,
      dayNode: { data: date, log, manualNodes: [] },
      sleepNode,
      bodyWeightKg: i === dayCount - 1 || i === 0 ? 78 + i * 0.01 : null,
    }));
  }
  return briefs;
}

/** Molti giorni mancanti: solo 3 giorni con cibo su 30. */
export function buildSparseHistoryBriefs() {
  return buildHistoryBriefSeries({
    dayCount: 30,
    foodGapEvery: 2,
    skipSleep: false,
  }).map((brief, idx) => {
    if (idx % 5 !== 0) {
      return {
        ...brief,
        hasFood: false,
        nutrition: {
          kcal: null,
          proteinG: null,
          carbG: null,
          fatG: null,
          fiberG: null,
        },
        foodItems: [],
      };
    }
    return brief;
  });
}
