/**
 * Pacchetto motori Kentu per dossier Focus — riuso risultati già in sessione/compass,
 * senza ricopiare formule di Pilota/Bussola/Stimolo.
 */

import { buildFocusKentuDeepLinks } from './focusKentuDeepLinks.js';

/**
 * @param {{
 *   session?: object|null,
 *   compassSignals?: object|null,
 *   habitCompass?: object|null,
 * }} input
 */
export function buildFocusKentuEnginesForDossier(input) {
  const session = input.session || {};
  const compass = input.compassSignals || null;
  const habit = input.habitCompass || session.habitCompass || null;
  const wellness = session.wellness || {};
  const exercise = wellness.pillarsById?.exercise || null;
  const nutrition = session.nutrition || null;
  const targets = session.userTargets || null;
  const periodId = session.periodId || 'ieri';

  const cardio = exercise?.cardio || null;
  const aerobicDoc = cardio?.aerobicMinutesDocumented ?? cardio?.aerobicMinutes ?? null;
  const moderate = cardio?.moderateMinutes ?? null;
  const vigorous = cardio?.vigorousMinutes ?? null;
  const intensityDocumented = Boolean(cardio?.intensityDocumented);
  const classifiableEquiv = intensityDocumented && (moderate != null || vigorous != null)
    ? Math.round(((Number(moderate) || 0) + (Number(vigorous) || 0) * 2) * 10) / 10
    : null;

  /** Nota esplicita se le due metriche cardio non sono confrontabili 1:1 */
  const cardioMetricNote = [
    'aerobicMinutesDocumented = minuti di attività etichettata aerobica/camminata (anche senza intensità), finestra Focus (7g settimana / 30g mese) su analysisDate.',
    'moderate/vigorous = solo se intensità documentata nel log; altrimenti null (non zero).',
    'Il cruscotto Salute «Cardio · X min / 14gg» usa buildSaluteLongevityWindow.cardioMinutesTotal (14 giorni fino a oggi, classificazione isCardioWorkoutEntry): NON è la stessa metrica né la stessa finestra di Focus.',
    'Un cruscotto che mostra «minuti totali allenamento» NON è la stessa metrica dei minuti cardio classificabili.',
  ];
  if (
    aerobicDoc != null
    && classifiableEquiv != null
    && Math.abs(Number(aerobicDoc) - Number(classifiableEquiv)) >= 10
  ) {
    cardioMetricNote.push(
      `In questa finestra: aerobici documentati ${aerobicDoc} min vs equivalente classificabile ${classifiableEquiv} min — non riconciliare inventando; sono definizioni diverse.`,
    );
  }

  const intakeKcal = periodId === 'ieri'
    ? (nutrition?.ieri?.totals?.kcal?.usableForJudgement
      ? nutrition.ieri.totals.kcal.value
      : null)
    : (nutrition?.trends?.averagesFromRecordedDaysOnly?.kcal ?? null);

  const energyPilot = {
    available: Boolean(targets?.kcal != null || compass?.available),
    source: 'userTargets + compassSignals (Focus) · significato allineato a Pilota/Bussola',
    declaredTargetKcal: targets?.kcal ?? null,
    declaredProteinG: targets?.prot ?? null,
    intakeKcalUsable: intakeKcal,
    intakeIsNotTdee: true,
    targetIsNotMeasuredTdee: true,
    observedEnergy: compass?.observedTrajectory || null,
    declaredGoal: compass?.declaredGoal || null,
    signalStrength: compass?.signalStrength || null,
    /** Su Ieri: timeframe Bussola = 1d (episodio). La media recente sta in editorialReadingContext. */
    timeframeNote: periodId === 'ieri'
      ? 'observedEnergy su Ieri è l’episodio del giorno di analisi (timeframe 1d), non la media settimanale.'
      : periodId === 'mese'
        ? 'observedEnergy su Mese usa finestra ~30g.'
        : 'observedEnergy su Settimana usa finestra ~7g.',
    uncertainty: compass?.limits || [
      'Bilancio = introito − target operativo dichiarato, non TDEE misurato.',
    ],
    meaning: {
      deficitObserved: 'Apporto sotto il target operativo (dopo dead-band) — condotta, non volontà di cut.',
      surplusObserved: 'Apporto sopra il target operativo — condotta, non volontà di bulk.',
      nearNeutral: 'Dentro la dead-band energetica rispetto al target dichiarato.',
      singleDayIsNotTrajectory: true,
    },
    deepLinkId: 'pilotaEnergetico',
  };

  const strengthN = exercise?.strengthSessionCount ?? null;
  const muscleStimulus = {
    available: Boolean(exercise?.hasEvidence),
    source: 'buildFocusWellnessPillars (normalizeWorkoutEvents)',
    strengthSessionCount: strengthN,
    workouts: (exercise?.workouts || []).slice(0, 24).map((w) => ({
      date: w.date || null,
      label: w.label || null,
      kind: w.kind || null,
      durationMin: w.durationMin ?? null,
      muscleGroups: w.muscleGroups || [],
      intensityDocumented: Boolean(w.intensityDocumented),
    })),
    muscleGroupFrequency: exercise?.muscleGroupFrequency || [],
    meaning: {
      muscleGroups: 'Gruppi dal diario, non esercizi singoli né volume serie×rep se assente.',
      missingLogNotInactivity: true,
      strengthOnlyIfLogged: true,
    },
    habitEvaluation: (habit?.evaluations || []).find((e) => e.id === 'strength_stimulus') || null,
    deepLinkId: 'stimoloMuscolare',
  };

  const bussola = {
    available: Boolean(compass?.available),
    source: compass?.evidence?.source || 'buildFocusCompassSignalsForDossier',
    observedTrajectory: compass?.observedTrajectory || null,
    declaredGoal: compass?.declaredGoal || null,
    signalStrength: compass?.signalStrength || null,
    evidenceSample: compass?.evidence?.sampleDays || null,
    limits: compass?.limits || [],
    policy: compass?.policy || { noQuadrantCopy: true, noMetabolicScore: true },
    deepLinkId: 'bussola',
  };

  const cardioEngine = {
    available: Boolean(exercise?.hasEvidence) || aerobicDoc != null || intensityDocumented,
    source: 'wellness.exercise.cardio',
    aerobicMinutesDocumented: aerobicDoc,
    moderateMinutes: moderate,
    vigorousMinutes: vigorous,
    intensityDocumented,
    equivalentModerateMinutesClassifiable: classifiableEquiv,
    missingLogNotSedentary: true,
    metricDefinitions: cardioMetricNote,
    habitEvaluation: (habit?.evaluations || []).find((e) => e.id === 'cardio_volume') || null,
    deepLinkId: 'cardio',
  };

  const deepLinks = buildFocusKentuDeepLinks({
    analysisDate: session.analysisDate,
    periodId,
  });

  return {
    schema: 'kentu.focusKentuEngines.v1',
    energyPilot,
    muscleStimulus,
    bussola,
    cardio: cardioEngine,
    deepLinks,
    coherenceNotes: cardioMetricNote,
  };
}
