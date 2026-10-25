/**
 * Contesto di lettura editoriale per il dossier Focus AI.
 * Non ricalcola Pilota/Bussola: riusa serie compass + pasti/allenamenti già nel dossier.
 * Serve a distinguere episodio giornaliero vs media recente e a proporre manovre concrete.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { buildFocusCompassDailyHistoryFromDiary } from './buildFocusCompassSignalsForDossier.js';

/**
 * @param {object[]} meals — dossier.nutrition.meals
 */
function summarizeMealTiming(meals) {
  if (!Array.isArray(meals) || meals.length === 0) {
    return { available: false, mealsWithClock: 0, latestMealHour: null, latestMealLabel: null };
  }
  let latestHour = null;
  let latestLabel = null;
  let withClock = 0;
  for (const m of meals) {
    const h = m?.clockHour;
    if (h == null || !Number.isFinite(Number(h))) continue;
    withClock += 1;
    const hour = Number(h);
    if (latestHour == null || hour > latestHour) {
      latestHour = hour;
      latestLabel = m.mealLabel || m.mealType || null;
    }
  }
  return {
    available: withClock > 0,
    mealsWithClock: withClock,
    latestMealHour: latestHour,
    latestMealLabel: latestLabel,
    lateDinnerLikely: latestHour != null && latestHour >= 21.5,
  };
}

/**
 * @param {object[]} workouts — dossier.exercise.workouts
 */
function summarizeWorkoutTiming(workouts) {
  if (!Array.isArray(workouts) || workouts.length === 0) {
    return { available: false, earliestHour: null, morningTraining: false };
  }
  let earliest = null;
  for (const w of workouts) {
    const t = w?.time ?? w?.clockHour ?? null;
    if (t == null || !Number.isFinite(Number(t))) continue;
    const hour = Number(t);
    if (earliest == null || hour < earliest) earliest = hour;
  }
  return {
    available: earliest != null,
    earliestHour: earliest,
    morningTraining: earliest != null && earliest < 12,
  };
}

/**
 * Candidati redistribuzione: alimenti con nome+grammi da pasti documentati.
 * @param {object[]} meals
 */
function collectRedistributionCandidates(meals) {
  /** @type {object[]} */
  const out = [];
  for (const meal of meals || []) {
    for (const it of meal.items || []) {
      if (!it?.name) continue;
      const grams = it.grams != null && Number.isFinite(Number(it.grams)) ? Number(it.grams) : null;
      if (grams == null || grams <= 0) continue;
      out.push({
        foodName: it.name,
        grams,
        fromMeal: meal.mealLabel || meal.mealType || null,
        mealClockHour: meal.clockHour ?? null,
        kcal: it.kcal ?? null,
        carbG: it.carbG ?? null,
        proteinG: it.proteinG ?? null,
      });
    }
  }
  return out.slice(0, 12);
}

/**
 * @param {{
 *   periodId: string,
 *   analysisDate: string,
 *   publicationDate?: string|null,
 *   fullHistory?: object|null,
 *   userTargets?: object|null,
 *   meals?: object[],
 *   workouts?: object[],
 *   dayIntakeKcal?: number|null,
 *   compassSignals?: object|null,
 * }} input
 */
export function buildFocusEditorialReadingContext(input) {
  const periodId = String(input.periodId || 'ieri').toLowerCase();
  const analysisDate = input.analysisDate;
  const target = input.userTargets?.kcal != null && Number.isFinite(Number(input.userTargets.kcal))
    ? Number(input.userTargets.kcal)
    : null;

  const mealTiming = summarizeMealTiming(input.meals || []);
  const workoutTiming = summarizeWorkoutTiming(input.workouts || []);
  const redistributionCandidates = collectRedistributionCandidates(input.meals || []);

  /** @type {object|null} */
  let dayVersusRecent = null;

  if (
    periodId === 'ieri'
    && input.fullHistory
    && isIsoDateString(analysisDate)
  ) {
    const history = buildFocusCompassDailyHistoryFromDiary(
      input.fullHistory,
      analysisDate,
      target,
      14,
    );
    const dayRow = history.find((d) => d.date === analysisDate && !d.skipEnergyAverage);
    const recent = history.filter((d) => {
      if (!d || d.skipEnergyAverage || !Number.isFinite(Number(d.intakeKcal))) return false;
      if (d.date === analysisDate) return false;
      // ultimi 7 giorni di calendario prima dell’analisi
      const min = addCalendarDays(analysisDate, -7);
      return d.date >= min && d.date < analysisDate;
    });

    const dayIntake = dayRow?.intakeKcal != null
      ? Number(dayRow.intakeKcal)
      : (input.dayIntakeKcal != null ? Number(input.dayIntakeKcal) : null);
    const dayBalance = dayRow?.kcalBalance != null
      ? Number(dayRow.kcalBalance)
      : (dayIntake != null && target != null ? Math.round(dayIntake - target) : null);

    let recentMeanIntake = null;
    let recentMeanBalance = null;
    if (recent.length > 0) {
      recentMeanIntake = Math.round(
        recent.reduce((s, d) => s + Number(d.intakeKcal), 0) / recent.length,
      );
      if (target != null) {
        recentMeanBalance = Math.round(recentMeanIntake - target);
      }
    }

    const dayFarFromTarget = dayBalance != null && Math.abs(dayBalance) >= 250;
    const recentNearTarget = recentMeanBalance != null && Math.abs(recentMeanBalance) <= 120;

    dayVersusRecent = {
      analysisDate,
      declaredTargetKcal: target,
      day: {
        intakeKcal: dayIntake != null && Number.isFinite(dayIntake) ? Math.round(dayIntake) : null,
        balanceVsTargetKcal: dayBalance,
        role: 'episode',
        note: 'Singolo giorno di analisi — NON è la traiettoria Bussola settimanale.',
      },
      recent7dExcludingAnalysisDay: {
        recordedDays: recent.length,
        meanIntakeKcal: recentMeanIntake,
        meanBalanceVsTargetKcal: recentMeanBalance,
        role: 'recent_context',
        note: 'Media introito sui giorni registrati nei 7 giorni precedenti (escluso il giorno di analisi).',
      },
      readingHint: dayFarFromTarget && recentNearTarget
        ? 'Episodio giornaliero lontano dal target, ma media recente vicina al riferimento: privilegia il contrasto episodio/traiettoria nel titolo, non lo scostamento isolato come verdetto.'
        : dayFarFromTarget
          ? 'Giorno lontano dal target: contestualizza sempre con la media recente se disponibile; non chiamare «traiettoria» un solo giorno.'
          : 'Confronta comunque giorno e contesto recente prima del titolo.',
      bussolaTimeframeOnIeri: input.compassSignals?.observedTrajectory?.timeframe || '1d',
      bussolaNote: 'Su Ieri la Bussola nel dossier usa timeframe 1d: è l’episodio. La media recente qui è contesto editoriale, non un secondo motore.',
    };
  }

  const readingMandate = [
    'Prima del titolo: confronta fatto giornaliero e contesto recente (se presente).',
    'Titolo umano, specifico, comprensibile — niente gergo da relazione tecnica.',
    'Cerca una scoperta o un’apparente contraddizione interessante (anche positiva).',
    'Pilota/Bussola: non chiamare traiettoria lo scostamento di un solo giorno.',
    'Sonno: non affermare compromissione del sonno profondo o fisiologia individuale non misurata.',
    'Manovra alimentare: preferisci alimenti+grammi+orari già nel diario; distingui redistribuzione (kcal giorno ~invariate) da riduzione.',
    'Non forzare un capitolo per ogni motore; non ripetere sempre la stessa raccomandazione sulla cena.',
  ];

  return {
    schema: 'kentu.focusEditorialReadingContext.v1',
    periodId,
    dayVersusRecent,
    mealTiming,
    workoutTiming,
    trainingThenEating: Boolean(
      workoutTiming.available
      && mealTiming.available
      && workoutTiming.earliestHour != null
      && mealTiming.latestMealHour != null
      && workoutTiming.earliestHour < mealTiming.latestMealHour,
    ),
    redistributionCandidates,
    readingMandate,
    voice: {
      role: 'divulgatore_intelligente_del_diario_personale',
      avoid: [
        'titoli da laboratorio/report tecnico',
        'certezze su sonno profondo / termogenesi individuale non misurate',
        'proposte vaghe («una frazione dell’introito») senza alimento verificabile',
      ],
    },
  };
}
