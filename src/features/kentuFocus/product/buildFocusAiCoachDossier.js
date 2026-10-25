/**
 * Dossier AI interpretativo Kentu Focus — evidenze ricche + traiettoria Bussola.
 * Nessun demo, nessuno score, nessun dato inventato.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { normalizeFoodEvents, collectDayLogForNutrition } from '../normalize/normalizeFoodEvents.js';
import { normalizeStimuliEvents } from '../normalize/normalizeStimuliEvents.js';
import { FOCUS_PAGE_MODE } from './buildFocusPageSession.js';
import { buildFocusCompassSignalsForDossier } from './buildFocusCompassSignalsForDossier.js';
import { buildFocusKentuEnginesForDossier } from './buildFocusKentuEnginesForDossier.js';
import { buildFocusEditorialReadingContext } from './buildFocusEditorialReadingContext.js';

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

function foodName(item) {
  return String(item?.name || item?.desc || item?.label || item?.foodName || '').trim();
}

function readNova(tags) {
  if (!tags || typeof tags !== 'object') return null;
  const n = Number(tags.novaGroup ?? tags.nova ?? null);
  return Number.isFinite(n) ? n : null;
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
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {number} windowDays
 */
function collectFoodFrequency(fullHistory, analysisDate, windowDays) {
  /** @type {Map<string, { name: string, days: Set<string>, occasions: number, nova: number|null }>} */
  const map = new Map();
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) continue;
    const pack = normalizeFoodEvents(node);
    if (!pack.hasFood) continue;
    for (const item of collectDayLogForNutrition(node)) {
      if (item?.type && item.type !== 'food' && item.type !== 'recipe') continue;
      const name = foodName(item);
      if (!name) continue;
      const key = name.toLowerCase();
      let row = map.get(key);
      if (!row) {
        row = { name, days: new Set(), occasions: 0, nova: readNova(item.semanticTags) };
        map.set(key, row);
      }
      row.days.add(date);
      row.occasions += 1;
      if (row.nova == null) row.nova = readNova(item.semanticTags);
    }
  }
  return [...map.values()]
    .map((r) => ({
      name: r.name,
      distinctDays: r.days.size,
      occasions: r.occasions,
      novaGroupDocumented: r.nova,
      persistentHabit: r.days.size >= 3,
    }))
    .sort((a, b) => b.occasions - a.occasions || b.distinctDays - a.distinctDays)
    .slice(0, 40);
}

/**
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {number} windowDays
 */
function collectStimuliWindow(fullHistory, analysisDate, windowDays) {
  let stimulantEvents = 0;
  let alcoholEvents = 0;
  let waterMl = 0;
  let daysWithStimuli = 0;
  /** @type {object[]} */
  const byDay = [];
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) continue;
    const pack = normalizeStimuliEvents(node);
    const s = Number(pack.stimuli?.stimulantEvents?.value) || 0;
    const a = Number(pack.stimuli?.alcoholEvents?.value) || 0;
    const w = pack.stimuli?.waterMl?.provenance === 'recorded'
      ? Number(pack.stimuli.waterMl.value)
      : null;
    if (s > 0 || a > 0 || w != null) daysWithStimuli += 1;
    stimulantEvents += s;
    alcoholEvents += a;
    if (w != null) waterMl += w;
    if (s > 0 || a > 0) {
      byDay.push({ date, stimulantEvents: s, alcoholEvents: a, waterMl: w });
    }
  }
  return {
    available: daysWithStimuli > 0,
    stimulantEventsTotal: stimulantEvents,
    alcoholEventsTotal: alcoholEvents,
    waterMlTotalRecorded: waterMl > 0 ? waterMl : null,
    daysWithAny: byDay.slice(-14),
    note: daysWithStimuli > 0
      ? 'Stimolanti/alcol/acqua solo se tipizzati nel diario; orario caffeina spesso assente.'
      : 'Nessun evento stimolante/alcol/acqua tipizzato nel periodo.',
  };
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
  const fullHistory = session.fullHistory && typeof session.fullHistory === 'object'
    ? session.fullHistory
    : null;
  const windowDays = periodId === 'mese' ? 30 : periodId === 'settimana' ? 7 : 1;

  /** @type {object[]} */
  const meals = [];
  if (periodId === 'ieri' && nutrition?.ieri?.hasFood) {
    for (const meal of nutrition.ieri.meals || []) {
      meals.push({
        mealLabel: meal.mealLabel || null,
        mealType: meal.mealType || null,
        clockLabel: meal.clockLabel || null,
        clockHour: meal.clockHour ?? null,
        distribution: meal.distribution
          ? {
            kcal: meal.distribution.kcal ?? null,
            proteinG: meal.distribution.proteinG ?? null,
            carbG: meal.distribution.carbG ?? null,
            fatG: meal.distribution.fatG ?? null,
          }
          : null,
        items: (meal.items || [])
          .map((item) => ({
            name: item.name || null,
            grams: item.grams ?? null,
            kcal: item.macros?.kcal ?? null,
            proteinG: item.macros?.proteinG ?? null,
            carbG: item.macros?.carbG ?? null,
            fatG: item.macros?.fatG ?? null,
            fiberG: item.macros?.fiberG ?? null,
            micronutrients: item.micronutrients || null,
            novaGroupDocumented: readNova(item.semanticTags),
            toVerify: (item.toVerify || []).map((f) => ({
              nutrient: f.nutrient || null,
              reason: f.reason || null,
            })),
          }))
          .filter((it) => it.name),
      });
    }
  }

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
      seriesRecorded: (nutrition.trends.series || [])
        .filter((s) => s.status === 'recorded')
        .map((s) => ({
          date: s.date,
          kcal: s.kcal,
          proteinG: s.proteinG,
          fiberG: s.fiberG ?? null,
        })),
    }
    : null;

  const foodFrequency = fullHistory && isIsoDateString(session.analysisDate)
    ? collectFoodFrequency(fullHistory, session.analysisDate, Math.max(windowDays, 7))
    : [];

  const stimuli = fullHistory && isIsoDateString(session.analysisDate)
    ? collectStimuliWindow(fullHistory, session.analysisDate, Math.max(windowDays, 7))
    : { available: false, note: 'Diario non allegato alla sessione per stimolanti.' };

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
      isWalking: Boolean(w.isWalking),
      intensityDocumented: Boolean(w.intensityDocumented),
      intensityBand: w.intensityBand || null,
      kcalBurn: w.kcalBurn ?? null,
      setsRepsLoadsPresent: false,
      note: 'Serie/ripetizioni/carichi non esportati se non verificabili nella normalizzazione Focus.',
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
        aerobicMinutes: r.aerobicMinutes ?? null,
        moderateMinutes: r.moderateMinutes ?? null,
        vigorousMinutes: r.vigorousMinutes ?? null,
      }))
    : [];

  const cardio = exercisePillar?.cardio
    ? {
      ...exercisePillar.cardio,
      strengthSessionCount: exercisePillar.strengthSessionCount ?? null,
    }
    : null;

  const sleepDay = periodId === 'ieri'
    ? {
      available: Boolean(sleepPillar?.hasEvidence),
      hours: session.sleepNight?.hours ?? null,
      wakeTime: session.sleepNight?.wakeTime ?? null,
      bedtime: session.sleepNight?.bedtime ?? null,
      nightEndedOn: sleepPillar?.nightEndedOn || session.publicationDate,
      analysisDay: sleepPillar?.analysisDay || session.analysisDate,
      metrics: sleepPillar?.metrics || [],
      convention: 'notte_D_conclusa_al_risveglio_D_plus_1',
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

  const compass = buildFocusCompassSignalsForDossier({
    fullHistory,
    analysisDate: session.analysisDate,
    publicationDate: session.publicationDate,
    periodId,
    userTargets: session.userTargets,
  });

  const habitCompass = session.habitCompass?.available
    ? {
      title: session.habitCompass.title || null,
      reason: session.habitCompass.reason || null,
      cardio: session.habitCompass.cardio || null,
      highlights: session.habitCompass.highlights || null,
      evaluations: (session.habitCompass.evaluations || []).map((e) => ({
        id: e.id,
        pillarLabel: e.pillarLabel,
        directionLabel: e.directionLabel,
        habitObserved: e.habitObserved,
        motivation: e.motivation,
        proposal: e.proposal,
        limits: e.limits || [],
      })),
    }
    : null;

  const kentuEngines = buildFocusKentuEnginesForDossier({
    session,
    compassSignals: compass,
    habitCompass,
  });

  const horizonBrief = periodId === 'ieri'
    ? 'Orizzonte IERI: racconta la giornata nel contesto recente. Un giorno ≠ traiettoria. Nessun verdetto settimanale di forza.'
    : periodId === 'mese'
      ? 'Orizzonte MESE: andamento e comportamenti ricorrenti; asteniti se i dati non bastano.'
      : 'Orizzonte SETTIMANA: abitudini e persistenza (non un singolo pasto).';

  const editorialReadingContext = buildFocusEditorialReadingContext({
    periodId,
    analysisDate: session.analysisDate,
    publicationDate: session.publicationDate,
    fullHistory,
    userTargets: session.userTargets,
    meals,
    workouts,
    dayIntakeKcal: usableMacros?.kcal ?? null,
    compassSignals: compass,
  });

  const dossier = {
    schema: 'kentu.focusAiCoachDossier.v2',
    periodId,
    analysisDate: session.analysisDate,
    publicationDate: session.publicationDate,
    windowLabel: session.windowLabel || null,
    horizonBrief,
    editorialReadingContext,
    mandate: {
      doNotRestateCardNumbers: true,
      teachOrHypothesizeOrImproveDecision: true,
      distinguish: ['recorded_fact', 'general_knowledge', 'founded_inference', 'hypothesis_to_test'],
      declaredGoalVsObservedConduct: true,
      episodeVersusTrajectory: true,
      humanReadableHeadline: true,
      concreteFoodManeuverPreferred: true,
      noUnmeasuredSleepPhysiology: true,
    },
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
      foodFrequency,
      privateComment: periodId === 'ieri' ? (nutrition?.ieri?.comment?.text || null) : null,
      stimuli,
    },
    exercise: {
      workouts,
      muscleGroupFrequency,
      seriesRecorded: exerciseSeries,
      cardio,
      detailNote: exercisePillar?.detailNote || null,
      policy: {
        muscleGroupsAreNotExercises: true,
        noInventedSetsRepsLoads: true,
        noInventedIntensity: true,
        missingLogNotInactivity: true,
        strengthOnlyIfLogged: true,
        cardioForEveryone: true,
      },
    },
    sleep: {
      day: sleepDay,
      seriesRecorded: sleepSeries,
      detailNote: sleepPillar?.detailNote || null,
    },
    compassSignals: compass,
    habitCompass,
    kentuEngines,
    anomalies,
    technicalNotes,
    mealManeuver: session.mealManeuver
      ? {
        suggested: Boolean(session.mealManeuver.suggested),
        status: session.mealManeuver.status || null,
        message: session.mealManeuver.message || null,
        criticality: session.mealManeuver.criticality || null,
        objective: session.mealManeuver.objective || null,
        observation: session.mealManeuver.observation || null,
        suggestedChange: session.mealManeuver.suggestedChange || null,
        expectedAdvantage: session.mealManeuver.expectedAdvantage || null,
        tradeoffs: session.mealManeuver.tradeoffs || null,
        watchNextDays: session.mealManeuver.watchNextDays || null,
        limits: session.mealManeuver.limits || [],
        simulation: session.mealManeuver.simulation
          ? {
            dailyKcalUnchanged: session.mealManeuver.simulation.dailyKcalUnchanged,
            dailyKcalBefore: session.mealManeuver.simulation.dailyKcalBefore,
            dailyKcalAfter: session.mealManeuver.simulation.dailyKcalAfter,
            item: session.mealManeuver.simulation.item || null,
            addressesCriticality: session.mealManeuver.simulation.addressesCriticality || null,
          }
          : null,
      }
      : null,
    userTargets: session.userTargets
      ? {
        kcal: session.userTargets.kcal ?? null,
        prot: session.userTargets.prot ?? null,
        carb: session.userTargets.carb ?? null,
        fat: session.userTargets.fat ?? null,
      }
      : null,
    fallbackDeterministicCoach: wellness.coach
      ? {
        note: 'Fallback se AI assente — non è interpretazione approfondita.',
        wentWell: wellness.coach.wentWell || null,
        needsAttention: wellness.coach.needsAttention || null,
        concreteAction: wellness.coach.concreteAction || null,
      }
      : null,
    policy: {
      equalPillars: true,
      noHealthScore: true,
      noProvenCausalityRequired: true,
      allowPlausibleMechanisms: true,
      noClinicalDiagnosis: true,
      noInventedBodyInflammation: true,
      noInventedDII: true,
      missingNotZero: true,
      foodNamesFromDiaryOnly: true,
      mealManeuverSimulationOnly: true,
      noQuadrantCopy: true,
      targetIsNotTdee: true,
    },
  };

  const dataVersion = shortHash(stableStringify({
    uid: session.uid,
    periodId,
    analysisDate: session.analysisDate,
    publicationDate: session.publicationDate,
    pillars: dossier.pillars,
    meals: dossier.nutrition.meals,
    foodFrequency: dossier.nutrition.foodFrequency?.slice?.(0, 12),
    workouts: dossier.exercise.workouts,
    cardio: dossier.exercise.cardio,
    sleep: dossier.sleep,
    compass: dossier.compassSignals?.observedTrajectory || null,
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
      windowKey: session.analysisDate,
    },
  };
}
