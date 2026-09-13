/**
 * Adapter puro: dati grezzi trackerStorico → HealthSnapshot immutabile.
 *
 * SSOT sonno: `trackerStoricoDay.log` dove `type === 'sleep'`.
 * Vietato leggere `users/{uid}/sleep_logs`.
 *
 * Nessun side-effect, nessun import da salaComandi / centroAnalisi / trendHub.
 */

import {
  CERTAINTY_LEVELS,
  SLEEP_SOURCES,
} from '../contracts/healthSnapshot.types.js';
import {
  circularStdevHours,
  cloneFourCylinders,
  cardioMinutesFromDaysAccurate,
  collectTodayWorkouts,
  computeDinnerSleepBuffer,
  extractMuscleDecay,
  findLastMeal,
  freezeDeep,
  inferSleepSource,
  lastWorkoutTimestamp,
  normalizePhaseId,
  normalizeSleepQuality,
  normalizeWeekDays,
  pickMainNightSleep,
  resolveCardioTarget,
  resolveDayDateStr,
  resolveGlycemicPenalty,
  resolveMetabolicPhase,
  resolveTargets,
  resolveWakeTime,
  round2,
  sleepHoursFromEntry,
  sumNutritionFromLog,
  toIsoDateStr,
  wrap24,
} from './healthSnapshotExtractors.js';

function todayIsoFromClock(nowMs) {
  const d = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hoursSinceMs(thenMs, nowMs) {
  if (thenMs == null || !Number.isFinite(thenMs) || thenMs <= 0) return null;
  const delta = (nowMs - thenMs) / 3600000;
  if (!Number.isFinite(delta)) return null;
  return Math.max(0, round2(delta));
}

/**
 * @param {import('../contracts/healthSnapshot.types.js').HealthSnapshotSourceData} sourceData
 * @returns {import('../contracts/healthSnapshot.types.js').HealthSnapshot}
 */
export function getHealthSnapshot(sourceData = {}) {
  const {
    trackerStoricoDay = null,
    trackerStoricoWeek = null,
    kineticsData = null,
    fourCylinderData = null,
    userTargets = null,
    nowMs: nowMsRaw = null,
    dateStr: dateStrRaw = null,
  } = sourceData && typeof sourceData === 'object' ? sourceData : {};

  const nowMs = Number.isFinite(Number(nowMsRaw)) ? Number(nowMsRaw) : Date.now();
  const dateStr =
    toIsoDateStr(dateStrRaw)
    || resolveDayDateStr(trackerStoricoDay)
    || todayIsoFromClock(nowMs);

  const dayLog = Array.isArray(trackerStoricoDay?.log)
    ? trackerStoricoDay.log
    : (trackerStoricoDay?.log && typeof trackerStoricoDay.log === 'object'
      ? Object.values(trackerStoricoDay.log)
      : []);
  const mealTimes = trackerStoricoDay?.mealTimes && typeof trackerStoricoDay.mealTimes === 'object'
    ? trackerStoricoDay.mealTimes
    : {};
  const manualNodes = Array.isArray(trackerStoricoDay?.manualNodes)
    ? trackerStoricoDay.manualNodes
    : [];

  const weekDays = normalizeWeekDays(trackerStoricoWeek, trackerStoricoDay, dateStr);
  const todayNutrition = sumNutritionFromLog(dayLog);
  const targets = resolveTargets(userTargets);
  const lastMeal = findLastMeal(dayLog, mealTimes, dateStr);

  const historyDays = weekDays.map((day) => {
    const totals = sumNutritionFromLog(day.log);
    const hasFood = totals.calories > 0 || totals.proteinGrams > 0 || totals.fiberGrams > 0;
    return {
      dateStr: day.dateStr,
      calories: totals.calories,
      proteinGrams: totals.proteinGrams,
      fiberGrams: totals.fiberGrams,
      hasFood,
    };
  });
  const loggedNutritionDays = historyDays.filter((d) => d.hasFood);
  const avg = (key) => {
    if (loggedNutritionDays.length === 0) return 0;
    const sum = loggedNutritionDays.reduce((acc, d) => acc + d[key], 0);
    return round2(sum / loggedNutritionDays.length);
  };

  const sleepEntry = pickMainNightSleep(dayLog);
  const hasSleepData = Boolean(sleepEntry && sleepHoursFromEntry(sleepEntry) > 0);
  const hours = hasSleepData ? round2(sleepHoursFromEntry(sleepEntry)) : 0;
  const wakeResolved = hasSleepData ? resolveWakeTime(sleepEntry, hours) : null;
  const wakeTime = wakeResolved != null ? wakeResolved : 0;
  const bedtimeCalculated = hasSleepData && wakeResolved != null
    ? wrap24(wakeTime - hours)
    : 0;
  const quality = hasSleepData
    ? normalizeSleepQuality(sleepEntry?.quality ?? sleepEntry?.sleepQuality)
    : 0;
  const sourceInfo = hasSleepData
    ? inferSleepSource(sleepEntry)
    : { source: SLEEP_SOURCES.MANUAL, certainty: CERTAINTY_LEVELS.ESTIMATED };

  const dinnerSleepBuffer = hasSleepData && wakeResolved != null
    ? computeDinnerSleepBuffer(bedtimeCalculated, lastMeal.lastMealDecimalHour)
    : null;

  const sleepHoursSeries = weekDays
    .map((day) => {
      const night = pickMainNightSleep(day.log);
      return night ? sleepHoursFromEntry(night) : 0;
    })
    .filter((h) => h > 0);
  const wakeSeries = weekDays
    .map((day) => {
      const night = pickMainNightSleep(day.log);
      if (!night) return null;
      const h = sleepHoursFromEntry(night);
      return resolveWakeTime(night, h);
    })
    .filter((h) => h != null);

  const todayWorkoutsRaw = collectTodayWorkouts(dayLog, manualNodes);
  const todayWorkouts = todayWorkoutsRaw.map((w) => ({
    type: w.type,
    durationMin: w.durationMin,
  }));
  const cardioMinutes7d = cardioMinutesFromDaysAccurate(weekDays);
  const cardioTarget = resolveCardioTarget(kineticsData, userTargets);
  const muscleDecay = extractMuscleDecay(fourCylinderData);
  const fourCylinders = cloneFourCylinders(fourCylinderData);
  const hasCylinder = fourCylinders != null;
  const systemicFatigueRaw = Number(
    fourCylinders?.systemic_fatigue ?? fourCylinders?.systemicFatigue,
  );
  const systemicFatigue = Number.isFinite(systemicFatigueRaw)
    ? Math.max(0, Math.min(1, systemicFatigueRaw))
    : 0;

  const kineticsFasting = Number(kineticsData?.fastingHoursCurrent ?? kineticsData?.hoursSinceLastMeal);
  const computedFasting = hoursSinceMs(lastMeal.lastMealTimestamp, nowMs);
  const hasMeal = lastMeal.lastMealTimestamp != null || Number.isFinite(kineticsFasting);
  let fastingHoursCurrent = 0;
  let fastingCertainty = CERTAINTY_LEVELS.ESTIMATED;
  if (Number.isFinite(kineticsFasting) && kineticsFasting >= 0) {
    fastingHoursCurrent = round2(kineticsFasting);
    fastingCertainty = CERTAINTY_LEVELS.CALCULATED;
  } else if (computedFasting != null) {
    fastingHoursCurrent = computedFasting;
    fastingCertainty = CERTAINTY_LEVELS.CALCULATED;
  }

  const kineticsPhase = normalizePhaseId(kineticsData?.currentPhase ?? kineticsData?.phase);
  const currentPhase = kineticsPhase
    || resolveMetabolicPhase(
      Number.isFinite(kineticsFasting) ? kineticsFasting : computedFasting,
      hasMeal,
    );
  const phaseCertainty = kineticsPhase
    ? CERTAINTY_LEVELS.CALCULATED
    : (hasMeal ? CERTAINTY_LEVELS.INFERRED : CERTAINTY_LEVELS.ESTIMATED);

  const glycemic = resolveGlycemicPenalty(kineticsData);
  const lastWorkoutTs = lastWorkoutTimestamp(weekDays, dateStr, fourCylinderData);

  const snapshot = {
    timestamp: nowMs,
    dateStr,
    nutrition: {
      calories: todayNutrition.calories,
      targetCalories: targets.targetCalories,
      proteinGrams: todayNutrition.proteinGrams,
      targetProteinGrams: targets.targetProteinGrams,
      fiberGrams: todayNutrition.fiberGrams,
      targetFiberGrams: targets.targetFiberGrams,
      lastMealTimestamp: lastMeal.lastMealTimestamp,
      history7d: {
        avgCalories: avg('calories'),
        avgProteinGrams: avg('proteinGrams'),
        avgFiberGrams: avg('fiberGrams'),
        daysLogged: loggedNutritionDays.length,
        days: historyDays.map(({ dateStr: d, calories, proteinGrams, fiberGrams }) => ({
          dateStr: d,
          calories,
          proteinGrams,
          fiberGrams,
        })),
      },
      certainty: {
        calories: todayNutrition.calories > 0 ? CERTAINTY_LEVELS.MEASURED : CERTAINTY_LEVELS.ESTIMATED,
        targets: targets.certainty,
        lastMealTimestamp: lastMeal.lastMealTimestamp != null
          ? CERTAINTY_LEVELS.CALCULATED
          : CERTAINTY_LEVELS.ESTIMATED,
        history7d: loggedNutritionDays.length > 0
          ? CERTAINTY_LEVELS.MEASURED
          : CERTAINTY_LEVELS.ESTIMATED,
      },
    },
    sleep: {
      hours,
      wakeTime,
      bedtimeCalculated,
      quality,
      source: sourceInfo.source,
      dinnerSleepBuffer,
      hasSleepData,
      history7d: {
        avgHours: sleepHoursSeries.length > 0
          ? round2(sleepHoursSeries.reduce((a, b) => a + b, 0) / sleepHoursSeries.length)
          : 0,
        wakeTimeVariability: circularStdevHours(wakeSeries),
      },
      certainty: {
        hours: hasSleepData ? CERTAINTY_LEVELS.MEASURED : CERTAINTY_LEVELS.ESTIMATED,
        wakeTime: hasSleepData && wakeResolved != null
          ? CERTAINTY_LEVELS.MEASURED
          : CERTAINTY_LEVELS.ESTIMATED,
        bedtimeCalculated: hasSleepData && wakeResolved != null
          ? CERTAINTY_LEVELS.CALCULATED
          : CERTAINTY_LEVELS.ESTIMATED,
        quality: hasSleepData && quality > 0
          ? CERTAINTY_LEVELS.MEASURED
          : CERTAINTY_LEVELS.ESTIMATED,
        source: sourceInfo.certainty,
        dinnerSleepBuffer: dinnerSleepBuffer != null
          ? CERTAINTY_LEVELS.CALCULATED
          : CERTAINTY_LEVELS.ESTIMATED,
        history7d: sleepHoursSeries.length > 0
          ? CERTAINTY_LEVELS.MEASURED
          : CERTAINTY_LEVELS.ESTIMATED,
      },
    },
    activity: {
      cardioMinutes7d,
      cardioTarget7d: cardioTarget.value,
      muscleDecay,
      lastWorkoutTimestamp: lastWorkoutTs,
      todayWorkouts,
      certainty: {
        cardioMinutes7d: cardioMinutes7d > 0 ? CERTAINTY_LEVELS.MEASURED : CERTAINTY_LEVELS.ESTIMATED,
        cardioTarget7d: cardioTarget.certainty,
        muscleDecay: hasCylinder ? CERTAINTY_LEVELS.MEASURED : CERTAINTY_LEVELS.ESTIMATED,
        lastWorkoutTimestamp: lastWorkoutTs != null
          ? CERTAINTY_LEVELS.CALCULATED
          : CERTAINTY_LEVELS.ESTIMATED,
      },
    },
    metabolic: {
      fastingHoursCurrent,
      glycemicPenalty: glycemic.value,
      currentPhase,
      certainty: {
        fastingHoursCurrent: fastingCertainty,
        glycemicPenalty: glycemic.certainty,
        currentPhase: phaseCertainty,
      },
    },
    systemic: {
      fourCylinders,
      systemicFatigue,
      certainty: {
        fourCylinders: hasCylinder ? CERTAINTY_LEVELS.MEASURED : CERTAINTY_LEVELS.ESTIMATED,
        systemicFatigue: hasCylinder && Number.isFinite(systemicFatigueRaw)
          ? CERTAINTY_LEVELS.MEASURED
          : CERTAINTY_LEVELS.ESTIMATED,
      },
    },
  };

  return freezeDeep(snapshot);
}

export default getHealthSnapshot;
