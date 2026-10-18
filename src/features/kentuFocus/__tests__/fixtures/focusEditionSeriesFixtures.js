/**
 * Sette giornate consecutive sintetiche per verifica editoriale I3-bis.
 * analysisDate base: 2026-12-28 → 2027-01-03 (attraversamento anno).
 */

import { buildDayBrief } from '../../aggregate/buildDayBrief.js';
import { addCalendarDays } from '../../normalize/focusDateUtils.js';

export const SERIES_START_ANALYSIS = '2026-12-28';

/** @type {Array<{
 *  key: string,
 *  label: string,
 *  analysisDate: string,
 *  publicationDate: string,
 * }>} */
export const EDITION_SPECS = [
  {
    key: 'progress',
    label: 'Miglioramento documentato',
    analysisDate: '2026-12-28',
    publicationDate: '2026-12-29',
  },
  {
    key: 'ordinary',
    label: 'Giornata ordinaria',
    analysisDate: '2026-12-29',
    publicationDate: '2026-12-30',
  },
  {
    key: 'short_sleep',
    label: 'Sonno insufficiente',
    analysisDate: '2026-12-30',
    publicationDate: '2026-12-31',
  },
  {
    key: 'food_continuity',
    label: 'Buona continuità alimentare',
    analysisDate: '2026-12-31',
    publicationDate: '2027-01-01',
  },
  {
    key: 'workout',
    label: 'Allenamento registrato',
    analysisDate: '2027-01-01',
    publicationDate: '2027-01-02',
  },
  {
    key: 'incomplete',
    label: 'Dati incompleti',
    analysisDate: '2027-01-02',
    publicationDate: '2027-01-03',
  },
  {
    key: 'no_novelty',
    label: 'Senza novità significativa',
    analysisDate: '2027-01-03',
    publicationDate: '2027-01-04',
  },
];

/**
 * Storia di sfondo: 20 giorni prima di SERIES_START con sonno basso,
 * poi giorni della serie con sonno più alto → confronto d7 utile sulla prima edizione.
 */
export function buildBackgroundBriefsBeforeSeries() {
  const briefs = [];
  for (let i = 20; i >= 1; i -= 1) {
    const date = addCalendarDays(SERIES_START_ANALYSIS, -i);
    const sleepLow = i >= 8; // prev week vs current week around start
    briefs.push(buildDayBrief({
      date,
      dayNode: {
        data: date,
        log: [
          {
            type: 'food',
            id: `bg_food_${date}`,
            foodDbKey: 'db_yogurt',
            name: 'Yogurt greco',
            mealType: 'colazione',
            mealTime: 8,
            kcal: 220,
            prot: 18,
            carb: 12,
            fat: 8,
            fibre: 0,
          },
          {
            type: 'food',
            id: `bg_food2_${date}`,
            name: 'Pasta al pomodoro',
            mealType: 'pranzo',
            mealTime: 13,
            kcal: 650,
            prot: 22,
            carb: 95,
            fat: 16,
            fibre: 5,
          },
          {
            type: 'food',
            id: `bg_food3_${date}`,
            name: 'Pesce e verdure',
            mealType: 'cena',
            mealTime: 20.5,
            kcal: 580,
            prot: 40,
            carb: 35,
            fat: 22,
            fibre: 7,
          },
        ],
        manualNodes: [],
      },
      sleepNode: {
        data: addCalendarDays(date, 1),
        log: [{
          type: 'sleep',
          id: `bg_sleep_${date}`,
          hours: sleepLow ? 6.2 : 7.4,
          wakeTime: 7,
          quality: sleepLow ? 3 : 4,
          deepMin: 90,
          remMin: 100,
        }],
      },
      bodyWeightKg: i === 20 ? 78.8 : null,
    }));
  }
  return briefs;
}

/**
 * @param {string} key
 * @param {string} analysisDate
 */
export function buildScenarioDayInput(key, analysisDate) {
  const publicationDate = addCalendarDays(analysisDate, 1);
  const baseTargets = { kcal: 2300, proteinG: 150 };

  switch (key) {
    case 'progress':
      return {
        analysisDate,
        publicationDate,
        targets: baseTargets,
        bodyWeightKg: 78.5,
        analysisDayNode: {
          data: analysisDate,
          log: [
            food('colazione', 8, 'Yogurt greco', 'db_yogurt', 420, 35, 40, 12, 4),
            food('pranzo', 13, 'Pollo e riso', null, 780, 55, 70, 22, 6),
            food('cena', 20, 'Pesce e verdure', null, 650, 48, 40, 24, 8),
            workout('Pesi full body', 50, 300),
          ],
          manualNodes: [{ type: 'water', id: 'w', ml: 2000 }],
        },
        publicationDayNode: sleepNode(publicationDate, 7.6, 7, 4),
      };
    case 'ordinary':
      return {
        analysisDate,
        publicationDate,
        targets: baseTargets,
        analysisDayNode: {
          data: analysisDate,
          log: [
            food('colazione', 8.5, 'Toast', null, 320, 12, 45, 10, 2),
            food('pranzo', 13.2, 'Insalata mista', null, 520, 28, 40, 22, 6),
            food('cena', 21, 'Pasta al pomodoro', null, 700, 22, 100, 18, 5),
          ],
          manualNodes: [],
        },
        publicationDayNode: sleepNode(publicationDate, 6.5, 7.25, 3),
      };
    case 'short_sleep':
      return {
        analysisDate,
        publicationDate,
        targets: baseTargets,
        analysisDayNode: {
          data: analysisDate,
          log: [
            food('colazione', 9, 'Yogurt greco', 'db_yogurt', 300, 25, 20, 8, 0),
            food('pranzo', 14, 'Panino', null, 600, 30, 55, 20, 3),
            food('cena', 22.5, 'Pizza', null, 900, 35, 95, 35, 4),
          ],
          manualNodes: [],
        },
        publicationDayNode: sleepNode(publicationDate, 5.0, 8, 2),
      };
    case 'food_continuity':
      return {
        analysisDate,
        publicationDate,
        targets: baseTargets,
        analysisDayNode: {
          data: analysisDate,
          log: [
            food('colazione', 8, 'Yogurt greco', 'db_yogurt', 280, 22, 18, 8, 0),
            food('pranzo', 13, 'Yogurt greco', 'db_yogurt', 280, 22, 18, 8, 0),
            food('cena', 20.2, 'Bowl proteica', 'recipe_bowl', 600, 45, 50, 18, 9),
            {
              type: 'recipe',
              id: `recipe_${analysisDate}`,
              foodDbKey: 'recipe_bowl',
              name: 'Bowl proteica',
              mealType: 'snack',
              mealTime: 17,
              kcal: 200,
              prot: 15,
              carb: 20,
              fat: 6,
              fibre: 3,
            },
          ],
          manualNodes: [],
        },
        publicationDayNode: sleepNode(publicationDate, 7.1, 7, 4),
      };
    case 'workout':
      return {
        analysisDate,
        publicationDate,
        targets: baseTargets,
        analysisDayNode: {
          data: analysisDate,
          log: [
            food('colazione', 8, 'Omelette', null, 380, 28, 8, 26, 1),
            food('pranzo', 13, 'Riso e legumi', null, 720, 32, 95, 14, 12),
            food('cena', 20, 'Pesce', null, 550, 42, 20, 22, 3),
            workout('Camminata', 0.75, 180),
            workout('Pesi', 40, 260),
          ],
          manualNodes: [],
        },
        publicationDayNode: sleepNode(publicationDate, 7.0, 6.75, 4),
      };
    case 'incomplete':
      return {
        analysisDate,
        publicationDate,
        targets: baseTargets,
        analysisDayNode: {
          data: analysisDate,
          log: [],
          manualNodes: [],
        },
        publicationDayNode: sleepNode(publicationDate, 7.2, 7, 4),
      };
    case 'no_novelty':
      return {
        analysisDate,
        publicationDate,
        // niente target → niente lead proteine / coach protein
        targets: undefined,
        analysisDayNode: {
          data: analysisDate,
          log: [
            food('pranzo', 13.5, 'Piatto misto', null, 650, 25, 70, 20, 4),
          ],
          manualNodes: [],
        },
        // 6.5h: né short (<6) né adequate (≥7)
        publicationDayNode: sleepNode(publicationDate, 6.5, 7.5, 3),
      };
    default:
      throw new Error(`scenario sconosciuto: ${key}`);
  }
}

function food(mealType, mealTime, name, foodDbKey, kcal, prot, carb, fat, fibre) {
  return {
    type: 'food',
    id: `f_${mealType}_${mealTime}_${name}`.replace(/\s+/g, '_'),
    mealType,
    mealTime,
    name,
    foodDbKey: foodDbKey || undefined,
    kcal,
    prot,
    carb,
    fat,
    fibre,
  };
}

function workout(name, duration, kcal) {
  return {
    type: 'workout',
    id: `w_${name}`.replace(/\s+/g, '_'),
    name,
    duration,
    kcal,
  };
}

function sleepNode(publicationDate, hours, wakeTime, quality) {
  return {
    data: publicationDate,
    log: [{
      type: 'sleep',
      id: `sleep_${publicationDate}`,
      hours,
      wakeTime,
      quality,
      deepMin: 60,
      remMin: 60,
    }],
  };
}

/**
 * Brief della giornata scenario (per accumulo history).
 */
export function briefFromScenarioInput(input) {
  return buildDayBrief({
    date: input.analysisDate,
    dayNode: input.analysisDayNode,
    sleepNode: input.publicationDayNode,
    sleepStorageDate: input.publicationDate,
    bodyWeightKg: input.bodyWeightKg ?? null,
  });
}
