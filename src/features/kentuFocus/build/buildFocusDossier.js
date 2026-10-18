/**
 * Assemblaggio FocusDossier v1 da nodi tracker sintetici/normalizzati.
 * Nessuna I/O Firebase, nessuna AI.
 */

import {
  buildHistoryWindows,
  deriveHistoryThinFlags,
} from '../aggregate/historyWindows.js';
import { buildFoodFrequency } from '../aggregate/foodFrequency.js';
import {
  createEmptyFocusDossier,
  focusMetric,
  FOCUS_PROVENANCE,
  missingMetric,
} from '../contracts/focusDossier.v1.js';
import { assertPublicationFollowsAnalysis, isIsoDateString } from '../normalize/focusDateUtils.js';
import { normalizeFoodEvents } from '../normalize/normalizeFoodEvents.js';
import { normalizeSleepNight } from '../normalize/normalizeSleepNight.js';
import { normalizeStimuliEvents } from '../normalize/normalizeStimuliEvents.js';
import { normalizeWorkoutEvents } from '../normalize/normalizeWorkoutEvents.js';
import { finiteNumber } from '../normalize/logUtils.js';

/**
 * @param {{
 *   uid?: string,
 *   analysisDate: string,
 *   publicationDate: string,
 *   analysisDayNode?: object|null,
 *   publicationDayNode?: object|null,
 *   targets?: { kcal?: number, proteinG?: number },
 *   bodyWeightKg?: number|null,
 *   bodyMeasuredOn?: string|null,
 *   generatedAt?: string,
 *   historyDayBriefs?: object[],
 * }} input
 */
export function buildFocusDossier(input) {
  const {
    uid = '',
    analysisDate,
    publicationDate,
    analysisDayNode = null,
    publicationDayNode = null,
    targets,
    bodyWeightKg = null,
    bodyMeasuredOn = null,
    generatedAt = new Date().toISOString(),
    historyDayBriefs = null,
  } = input || {};

  if (!isIsoDateString(analysisDate) || !isIsoDateString(publicationDate)) {
    throw new Error('buildFocusDossier: analysisDate/publicationDate devono essere YYYY-MM-DD');
  }
  const relation = assertPublicationFollowsAnalysis(analysisDate, publicationDate);
  if (!relation.ok) {
    throw new Error(`buildFocusDossier: ${relation.reason}`);
  }

  const food = normalizeFoodEvents(analysisDayNode, { targets });
  const activity = normalizeWorkoutEvents(analysisDayNode);
  const stimuli = normalizeStimuliEvents(analysisDayNode);
  const lastMealHour = food.nutrition.lastMealHour?.value ?? null;
  const sleepPack = normalizeSleepNight(publicationDayNode, {
    publicationDate,
    lastMealHour,
  });

  const dossier = createEmptyFocusDossier({
    analysisDate,
    publicationDate,
    uid,
    generatedAt,
    engines: [
      { id: 'computeTotali', role: 'day_nutrition' },
      { id: 'normalizeFoodEvents', role: 'day_nutrition_meals' },
      { id: 'normalizeWorkoutEvents', role: 'day_activity' },
      { id: 'normalizeStimuliEvents', role: 'day_stimuli' },
      { id: 'normalizeSleepNight', role: 'sleep' },
      { id: 'buildHistoryWindows', role: 'history' },
      { id: 'buildFoodFrequency', role: 'food_frequency' },
    ],
  });

  dossier.day.nutrition = food.nutrition;
  dossier.day.activity = activity.activity;
  dossier.day.stimuli = stimuli.stimuli;

  const weightRaw = finiteNumber(bodyWeightKg);
  // Nessun peso ≤ 0 (fallback zero vietato)
  const weight = weightRaw != null && weightRaw > 0 ? weightRaw : null;
  dossier.day.body.weightKg = weight == null
    ? missingMetric('kg')
    : focusMetric(weight, {
      unit: 'kg',
      provenance: FOCUS_PROVENANCE.recorded,
      measuredOn: bodyMeasuredOn ?? null,
    });

  dossier.sleep = sleepPack.sleep;

  dossier.meta.coverage.analysisDayHasFood = food.hasFood;
  dossier.meta.coverage.analysisDayHasWorkout = activity.hasWorkout;
  dossier.meta.coverage.sleepAvailable = sleepPack.sleepAvailable;
  dossier.meta.coverage.bodyMetricsInWindow = weight != null;

  dossier.meta.flags.incompleteDay = !food.hasFood && !activity.hasWorkout;
  dossier.meta.flags.sleepPartial = sleepPack.sleepPartial;
  dossier.meta.flags.sleepAmbiguous = Boolean(sleepPack.sleepAmbiguous);
  dossier.meta.flags.sleepMainNightStatus = sleepPack.sleepSelection?.status
    || sleepPack.sleep?.mainNightStatus
    || null;
  dossier.meta.flags.nutritionDedupeRemovedDuplicates = (food.quality?.duplicatesRemoved ?? 0) > 0;
  dossier.meta.flags.nutritionTotalsAffectedByDedupe = Boolean(
    food.quality?.nutritionTotalsAffectedByDedupe,
  );
  dossier.meta.quality = {
    nutritionDedupe: food.quality || {
      duplicatesRemoved: 0,
      duplicateIds: [],
      nutritionTotalsAffectedByDedupe: false,
    },
  };

  if (Array.isArray(historyDayBriefs) && historyDayBriefs.length > 0) {
    const history = buildHistoryWindows(historyDayBriefs, { analysisDate });
    dossier.history = history;
    dossier.meta.coverage.history = {
      d7: history.d7.coverage,
      d30: history.d30.coverage,
      d90: history.d90.coverage,
    };
    const thin = deriveHistoryThinFlags(history);
    dossier.meta.flags.historyThin30 = thin.historyThin30;
    dossier.meta.flags.historyThin90 = thin.historyThin90;

    const allFoodItems = historyDayBriefs.flatMap((b) => b.foodItems || []);
    dossier.habits.foodFrequency = buildFoodFrequency(allFoodItems);
  } else {
    // Solo giorno analisi: frequenza sul giorno corrente; history resta guscio.
    dossier.habits.foodFrequency = buildFoodFrequency(
      (food.foodItemsForFrequency || []).map((item) => ({ ...item, date: analysisDate })),
    );
    dossier.meta.flags.historyThin30 = true;
    dossier.meta.flags.historyThin90 = true;
  }

  return dossier;
}
