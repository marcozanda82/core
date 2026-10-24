/**
 * Dossier AI coach Kentu Focus — solo evidenze da sessione reale già coerente.
 * Nessun demo, nessun score, nessun dato inventato.
 */

import { FOCUS_PAGE_MODE } from './buildFocusPageSession.js';

/**
 * @param {unknown} value
 * @returns {string}
 */
function stableStringify(value) {
  return JSON.stringify(value);
}

/**
 * @param {string} text
 */
function shortHash(text) {
  let h = 2166136261;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * @param {object|null|undefined} session
 */
export function canBuildFocusAiCoachDossier(session) {
  if (!session || session.mode !== FOCUS_PAGE_MODE.real_diary) {
    return { ok: false, reason: 'session_not_real_diary' };
  }
  if (!session.uid || !session.periodId || !session.analysisDate || !session.publicationDate) {
    return { ok: false, reason: 'missing_session_identity' };
  }
  if (!session.wellness?.ok) {
    return { ok: false, reason: 'wellness_unavailable' };
  }
  return { ok: true, reason: null };
}

/**
 * @param {object} session — resolveFocusPageSession real_diary
 */
export function buildFocusAiCoachDossier(session) {
  const gate = canBuildFocusAiCoachDossier(session);
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason,
      dossier: null,
      dataVersion: null,
    };
  }

  const periodId = session.periodId;
  const nutrition = session.nutrition || null;
  const wellness = session.wellness;
  const pillarsById = wellness.pillarsById || {};

  /** @type {object[]} */
  const meals = [];
  if (periodId === 'ieri' && nutrition?.ieri?.hasFood) {
    for (const meal of nutrition.ieri.meals || []) {
      meals.push({
        mealLabel: meal.mealLabel || null,
        mealType: meal.mealType || null,
        clockLabel: meal.clockLabel || null,
        items: (meal.items || [])
          .map((item) => ({
            name: item.name || null,
            grams: item.grams ?? null,
            kcal: item.macros?.kcal ?? null,
            proteinG: item.macros?.proteinG ?? null,
            toVerify: (item.toVerify || []).map((f) => ({
              nutrient: f.nutrient || null,
              reason: f.reason || null,
            })),
          }))
          .filter((it) => it.name),
      });
    }
  }

  /** Nutrienti giorno — solo se usable */
  let usableMacros = null;
  let usableMicros = [];
  if (periodId === 'ieri' && nutrition?.ieri?.totals) {
    const t = nutrition.ieri.totals;
    usableMacros = {
      kcal: t.kcal?.usableForJudgement ? t.kcal.value : null,
      proteinG: t.proteinG?.usableForJudgement ? t.proteinG.value : null,
      carbG: t.carbG?.usableForJudgement ? t.carbG.value : null,
      fatG: t.fatG?.usableForJudgement ? t.fatG.value : null,
      fiberG: t.fiberG?.usableForJudgement ? t.fiberG.value : null,
    };
    const coachMicros = nutrition.ieri.coachEvidence?.micronutrients || {};
    for (const [key, m] of Object.entries(coachMicros)) {
      if (!m?.usableForObservation || m.value == null) continue;
      usableMicros.push({
        key,
        value: m.value,
        unit: m.unit || null,
        completenessRatio: m.completenessRatio ?? null,
      });
    }
  }

  const nutritionTrend = periodId !== 'ieri' && nutrition?.trends
    ? {
      daysWithFood: nutrition.trends.daysWithFood ?? null,
      daysInWindow: nutrition.trends.daysInWindow ?? null,
      averagesFromRecordedDaysOnly: nutrition.trends.averagesFromRecordedDaysOnly || null,
      note: nutrition.trends.note || null,
    }
    : null;

  const exercisePillar = pillarsById.exercise || null;
  const sleepPillar = pillarsById.sleep || null;
  const nutritionPillar = pillarsById.nutrition || null;

  const workouts = Array.isArray(exercisePillar?.workouts)
    ? exercisePillar.workouts.map((w) => ({
      date: w.date || (periodId === 'ieri' ? session.analysisDate : null),
      label: w.label || null,
      durationMin: w.durationMin ?? null,
      clockLabel: w.clockLabel || null,
      clockHour: w.clockHour ?? null,
      muscleGroups: Array.isArray(w.muscleGroups) ? w.muscleGroups : [],
      workoutTypeId: w.workoutTypeId || null,
      kindLabel: w.kindLabel || null,
      kind: w.kind || null,
      // Solo se registrato nel diario — mai inventato
      kcalBurn: w.kcalBurn ?? null,
    }))
    : [];

  const muscleGroupFrequency = Array.isArray(exercisePillar?.muscleGroupFrequency)
    ? exercisePillar.muscleGroupFrequency
    : [];

  const exerciseSeries = Array.isArray(exercisePillar?.series)
    ? exercisePillar.series
      .filter((r) => r.status === 'recorded')
      .map((r) => ({
        date: r.date,
        sessions: r.sessions,
        durationMinTotal: r.durationMinTotal ?? null,
        muscleGroups: Array.isArray(r.muscleGroups) ? r.muscleGroups : [],
      }))
    : [];

  const sleepDay = periodId === 'ieri'
    ? {
      available: Boolean(sleepPillar?.hasEvidence),
      hours: session.sleepNight?.hours ?? null,
      wakeTime: session.sleepNight?.wakeTime ?? null,
      bedtime: session.sleepNight?.bedtime ?? null,
      nightEndedOn: sleepPillar?.nightEndedOn || session.publicationDate,
      analysisDay: sleepPillar?.analysisDay || session.analysisDate,
      metrics: sleepPillar?.metrics || [],
    }
    : null;

  const sleepSeries = Array.isArray(sleepPillar?.series)
    ? sleepPillar.series
      .filter((r) => r.status === 'recorded')
      .map((r) => ({ date: r.date, wakeDate: r.wakeDate, hours: r.hours }))
    : [];

  const anomalies = [];
  if (periodId === 'ieri' && nutrition?.ieri?.toVerify) {
    for (const row of nutrition.ieri.toVerify) {
      anomalies.push({
        scope: row.scope || null,
        foodName: row.foodName || null,
        nutrient: row.nutrient || null,
        reason: row.reason || null,
      });
    }
  }
  const technicalNotes = periodId === 'ieri'
    ? (nutrition?.ieri?.comment?.technicalNotes || [])
    : [];

  const deterministicCoach = wellness.coach
    ? {
      wentWell: wellness.coach.wentWell || null,
      needsAttention: wellness.coach.needsAttention || null,
      concreteAction: wellness.coach.concreteAction || null,
      primaryPillarId: wellness.coach.primaryPillarId || null,
    }
    : null;

  const dossier = {
    schema: 'kentu.focusAiCoachDossier.v1',
    periodId,
    analysisDate: session.analysisDate,
    publicationDate: session.publicationDate,
    windowLabel: session.windowLabel || null,
    pillars: {
      nutrition: {
        primaryValue: nutritionPillar?.primaryValue || null,
        shortPhrase: nutritionPillar?.shortPhrase || null,
        hasEvidence: Boolean(nutritionPillar?.hasEvidence),
        attention: Boolean(nutritionPillar?.attention),
      },
      exercise: {
        primaryValue: exercisePillar?.primaryValue || null,
        shortPhrase: exercisePillar?.shortPhrase || null,
        hasEvidence: Boolean(exercisePillar?.hasEvidence),
        attention: Boolean(exercisePillar?.attention),
      },
      sleep: {
        primaryValue: sleepPillar?.primaryValue || null,
        shortPhrase: sleepPillar?.shortPhrase || null,
        hasEvidence: Boolean(sleepPillar?.hasEvidence),
        attention: Boolean(sleepPillar?.attention),
      },
    },
    nutrition: {
      meals,
      usableMacros,
      usableMicros,
      trend: nutritionTrend,
      privateComment: periodId === 'ieri' ? (nutrition?.ieri?.comment?.text || null) : null,
    },
    exercise: {
      workouts,
      muscleGroupFrequency,
      seriesRecorded: exerciseSeries,
      detailNote: exercisePillar?.detailNote || null,
      policy: {
        muscleGroupsAreNotExercises: true,
        noInventedSetsRepsLoads: true,
        noInventedIntensity: true,
        missingLogNotInactivity: true,
      },
    },
    sleep: {
      day: sleepDay,
      seriesRecorded: sleepSeries,
      detailNote: sleepPillar?.detailNote || null,
    },
    anomalies,
    technicalNotes,
    deterministicCoach,
    mealManeuver: session.mealManeuver
      ? {
        suggested: Boolean(session.mealManeuver.suggested),
        status: session.mealManeuver.status || null,
        message: session.mealManeuver.message || null,
        observation: session.mealManeuver.observation || null,
        suggestedChange: session.mealManeuver.suggestedChange || null,
        motivation: session.mealManeuver.motivation || null,
        watchNextDays: session.mealManeuver.watchNextDays || null,
        limits: session.mealManeuver.limits || [],
        simulation: session.mealManeuver.simulation
          ? {
            dailyKcalUnchanged: session.mealManeuver.simulation.dailyKcalUnchanged,
            dailyKcalBefore: session.mealManeuver.simulation.dailyKcalBefore,
            dailyKcalAfter: session.mealManeuver.simulation.dailyKcalAfter,
            item: session.mealManeuver.simulation.item || null,
          }
          : null,
      }
      : null,
    userTargets: session.userTargets
      ? {
        kcal: session.userTargets.kcal ?? null,
        prot: session.userTargets.prot ?? null,
      }
      : null,
    policy: {
      equalPillars: true,
      noHealthScore: true,
      noCausalClaims: true,
      noClinicalDiagnosis: true,
      missingNotZero: true,
      foodNamesFromDiaryOnly: true,
      mealManeuverSimulationOnly: true,
    },
  };

  const dataVersion = shortHash(stableStringify({
    uid: session.uid,
    periodId,
    analysisDate: session.analysisDate,
    publicationDate: session.publicationDate,
    pillars: dossier.pillars,
    meals: dossier.nutrition.meals,
    workouts: dossier.exercise.workouts,
    sleep: dossier.sleep,
    anomalies: dossier.anomalies,
  }));

  return {
    ok: true,
    reason: null,
    dossier,
    dataVersion,
    binding: {
      uid: session.uid,
      periodId,
      analysisDate: session.analysisDate,
      publicationDate: session.publicationDate,
      dataVersion,
    },
  };
}
