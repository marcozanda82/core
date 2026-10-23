/**
 * Estrazione deterministica di candidati editoriali dal FocusDossier.
 * Nessun riempimento artificiale di rubriche.
 */

import { classifyFoodFrequencyHabit } from '../aggregate/foodFrequency.js';
import { FOCUS_PROVENANCE } from '../contracts/focusDossier.v1.js';
import { FOCUS_EDITION_KIND } from '../edition/editionCalendar.js';
import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { composeMonthCenterpieceCandidate } from './composeMonthCenterpiece.js';
import { composeSleepWeeklyRhythmCandidate } from './composeSleepRoutineEditorial.js';
import { composeWeekCenterpieceCandidate } from './composeWeekCenterpiece.js';
import {
  FOCUS_SCORE_THRESHOLDS,
  FOCUS_STORY_CLASS,
} from './focusEditorialConfig.js';
import { topicNoveltyFromMemory } from './focusEditorialMemory.js';

/**
 * @param {object} dossier
 * @param {object|null} memory
 * @returns {object[]}
 */
export function extractFocusSignals(dossier, memory = null) {
  if (!dossier || typeof dossier !== 'object') return [];

  /** @type {object[]} */
  const candidates = [];
  const push = (c) => {
    if (c) candidates.push(c);
  };

  push(signalProteinNearTarget(dossier, memory));
  push(signalSleepAdequate(dossier, memory));
  push(signalDocumentationDay(dossier, memory));
  push(signalWorkoutLogged(dossier, memory));
  push(signalHabitFoodEmerging(dossier, memory));
  push(signalKcalTrend(dossier, memory));
  push(signalSleepTrend(dossier, memory));
  push(signalDinnerBufferHypothesis(dossier, memory));
  push(signalSleepShortObservation(dossier, memory));
  push(signalBodyWeightIfPresent(dossier, memory));
  push(signalStrengthContinuity(dossier, memory));
  push(signalSleepWeeklyRhythm(dossier, memory));
  push(signalWeekCenterpiece(dossier, memory));
  push(signalMonthCenterpiece(dossier, memory));

  return candidates;
}

/**
 * @param {object} dossier
 * @param {object|null} memory
 */
function signalWeekCenterpiece(dossier, memory) {
  const kind = dossier.edition?.editionKind || dossier.meta?.editionKind;
  if (
    kind !== FOCUS_EDITION_KIND.sunday_plus
    && kind !== FOCUS_EDITION_KIND.sunday_month_plus
  ) {
    return null;
  }
  // Su sunday_month_plus il week è facoltativo: generiamo comunque; la select decide.
  const candidate = composeWeekCenterpieceCandidate(dossier.edition, memory, {
    publicationDate: dossier.meta?.publicationDate || null,
  });
  if (!candidate) return null;
  return { ...baseCandidate({}), ...candidate };
}

/**
 * @param {object} dossier
 * @param {object|null} memory
 */
function signalMonthCenterpiece(dossier, memory) {
  const kind = dossier.edition?.editionKind || dossier.meta?.editionKind;
  if (
    kind !== FOCUS_EDITION_KIND.month_plus
    && kind !== FOCUS_EDITION_KIND.sunday_month_plus
  ) {
    return null;
  }
  const candidate = composeMonthCenterpieceCandidate(dossier.edition, memory, {
    publicationDate: dossier.meta?.publicationDate || null,
  });
  if (!candidate) return null;
  return { ...baseCandidate({}), ...candidate };
}

/**
 * Un’unica storia sul ritmo settimanale (non tre doppioni).
 * @param {object} dossier
 * @param {object|null} memory
 */
function signalSleepWeeklyRhythm(dossier, memory) {
  const candidate = composeSleepWeeklyRhythmCandidate(
    dossier.sleepRoutine,
    memory,
    { publicationDate: dossier.meta?.publicationDate || null },
  );
  if (!candidate) return null;
  return {
    claimType: candidate.claimType,
    tone: candidate.tone,
    persistence: candidate.persistence,
    novelty: candidate.novelty,
    evidenceQuality: candidate.evidenceQuality,
    actionability: candidate.actionability ?? 0,
    limitations: candidate.limitations || [],
    doNotClaim: candidate.doNotClaim || [],
    metrics: candidate.metrics || [],
    refs: candidate.refs || [],
    coverage: candidate.coverage || null,
    ...candidate,
  };
}

function metricRef(path, value, unit, provenance) {
  return { path, value, unit, provenance };
}

function baseCandidate(partial) {
  return {
    claimType: 'fact',
    tone: 'neutral',
    persistence: 'isolated',
    novelty: 'new',
    evidenceQuality: 'medium',
    actionability: 0,
    limitations: [],
    doNotClaim: [],
    metrics: [],
    refs: [],
    coverage: null,
    ...partial,
  };
}

function signalProteinNearTarget(dossier, memory) {
  const prot = dossier.day?.nutrition?.totals?.proteinG;
  const target = dossier.day?.nutrition?.targets?.proteinG;
  if (prot?.provenance === FOCUS_PROVENANCE.missing || prot?.value == null) return null;
  if (target?.provenance === FOCUS_PROVENANCE.missing || target?.value == null || target.value <= 0) {
    return null;
  }
  const ratio = prot.value / target.value;
  if (ratio < FOCUS_SCORE_THRESHOLDS.proteinNearTargetRatio) return null;

  const label = proteinTargetLabel(ratio);
  const topicId = 'protein_near_target';
  const targetSource = target.source
    || dossier.goals?.targets?.source
    || null;
  const targetRefDate = target.measuredOn
    || dossier.goals?.targets?.referenceDate
    || null;
  const refNote = [
    targetSource ? `fonte ${targetSource}` : null,
    targetRefDate ? `valido al ${targetRefDate}` : null,
  ].filter(Boolean).join(', ');
  const base = {
    id: 'sig_protein_near_target',
    topicId,
    domain: 'nutrition',
    typology: label.typology,
    tone: label.tone,
    storyClass: FOCUS_STORY_CLASS.routine_confirmation,
    claimType: 'calculated',
    evidenceQuality: 'high',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: label.headline,
    summarySeed: `Ieri circa ${prot.value} g di proteine su riferimento ${target.value} g`
      + ` (rapporto ${Math.round(ratio * 100)}%)`
      + (refNote ? `; ${refNote}` : '')
      + '.',
    refs: ['day.nutrition.totals.proteinG', 'day.nutrition.targets.proteinG'],
    metrics: [
      metricRef('day.nutrition.totals.proteinG', prot.value, 'g', prot.provenance),
      {
        ...metricRef('day.nutrition.targets.proteinG', target.value, 'g', target.provenance),
        source: targetSource,
        measuredOn: targetRefDate,
      },
    ],
    coverage: { day: true, proteinRatio: Math.round(ratio * 1000) / 1000 },
    provenance: FOCUS_PROVENANCE.calculated,
    doNotClaim: [
      'ottimizzazione metabolica',
      'miglioramento fisiologico',
      'eccesso proteico problematico',
    ],
  };
  // P6.7.1: sopra-target ordinario ≠ buona notizia (né allarme/successo fisiologico).
  if (label.typology === 'target_above') {
    return baseCandidate({
      ...base,
      publishable: false,
      omitReason: 'ordinary_above_target_not_newsworthy',
      preferredRoles: [],
      forbidRoles: ['good', 'feature', 'lead', 'concern'],
    });
  }
  // P6.7.2a: hit/near = conferma ordinaria → continuità/diario, non lead né good.
  return baseCandidate({
    ...base,
    storyClass: FOCUS_STORY_CLASS.routine_log,
    tone: 'neutral',
    preferredRoles: ['continuity'],
    forbidRoles: ['good', 'feature', 'lead', 'concern'],
  });
}

/** @param {number} ratio */
export function proteinTargetLabel(ratio) {
  const near = FOCUS_SCORE_THRESHOLDS.proteinNearTargetRatio;
  const hit = FOCUS_SCORE_THRESHOLDS.proteinHitTargetRatio;
  const above = FOCUS_SCORE_THRESHOLDS.proteinAboveTargetRatio;
  if (ratio >= above) {
    return {
      typology: 'target_above',
      tone: 'neutral',
      headline: 'Oltre il riferimento proteico registrato',
    };
  }
  if (ratio >= hit) {
    return {
      typology: 'target_hit',
      tone: 'positive',
      headline: 'Proteine in linea con il riferimento registrato',
    };
  }
  if (ratio >= near) {
    return {
      typology: 'target_near',
      tone: 'positive',
      headline: 'Proteine vicine al riferimento registrato',
    };
  }
  return {
    typology: 'target_near',
    tone: 'positive',
    headline: 'Proteine vicine al riferimento registrato',
  };
}

function signalSleepAdequate(dossier, memory) {
  const hours = dossier.sleep?.hours;
  if (hours?.provenance === FOCUS_PROVENANCE.missing || hours?.value == null) return null;
  if (hours.value < FOCUS_SCORE_THRESHOLDS.sleepAdequateHours) return null;
  if (dossier.meta?.flags?.sleepPartial) {
    return null;
  }
  const topicId = 'sleep_hours_adequate';
  return baseCandidate({
    id: 'sig_sleep_hours_adequate',
    topicId,
    domain: 'sleep',
    typology: 'recovery_logged',
    tone: 'positive',
    storyClass: FOCUS_STORY_CLASS.routine_log,
    claimType: 'fact',
    evidenceQuality: 'high',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: 'Notte con ore di sonno adeguate',
    summarySeed: `Registrati circa ${hours.value} h di sonno nella notte successiva.`,
    refs: ['sleep.hours'],
    metrics: [metricRef('sleep.hours', hours.value, 'h', hours.provenance)],
    coverage: { sleepAvailable: true },
    provenance: FOCUS_PROVENANCE.recorded,
    limitations: ['Ore registrate ≠ qualità del recupero misurata'],
    doNotClaim: ['sonno ottimizzato', 'deep/REM'],
    preferredRoles: ['continuity'],
    forbidRoles: ['lead', 'good'],
  });
}

function signalDocumentationDay(dossier, memory) {
  const food = dossier.meta?.coverage?.analysisDayHasFood;
  const sleep = dossier.meta?.coverage?.sleepAvailable;
  const workout = dossier.meta?.coverage?.analysisDayHasWorkout;
  if (!food || !sleep) return null;
  const topicId = 'documentation_complete';
  return baseCandidate({
    id: 'sig_documentation_complete',
    topicId,
    domain: 'meta',
    typology: 'logging_completeness',
    tone: 'neutral',
    storyClass: FOCUS_STORY_CLASS.routine_log,
    claimType: 'fact',
    evidenceQuality: 'medium',
    novelty: topicNoveltyFromMemory(memory, topicId),
    persistence: 'isolated',
    headlineSeed: 'Giornata ben documentata',
    summarySeed: workout
      ? 'Cibo, sonno e allenamento risultano registrati per il periodo raccontato.'
      : 'Cibo e sonno risultano registrati per il periodo raccontato.',
    refs: [
      'meta.coverage.analysisDayHasFood',
      'meta.coverage.sleepAvailable',
      'meta.coverage.analysisDayHasWorkout',
    ],
    metrics: [],
    coverage: { food, sleep, workout: Boolean(workout) },
    provenance: FOCUS_PROVENANCE.recorded,
    doNotClaim: [
      'miglioramento metabolico',
      'aderenza perfetta',
      'progresso fisiologico',
      'metabolismo migliorato',
    ],
    preferredRoles: ['continuity'],
    forbidRoles: ['lead', 'good', 'feature'],
    openingModeHint: 'documentation',
  });
}

function signalWorkoutLogged(dossier, memory) {
  if (!dossier.meta?.coverage?.analysisDayHasWorkout) return null;
  const workouts = dossier.day?.activity?.workouts || [];
  if (workouts.length === 0) return null;
  const kcal = dossier.day?.activity?.workoutKcalTotal;
  const strengthN = workouts.filter((w) => w?.activityKind?.value === 'strength').length;
  const topicId = 'workout_logged';
  return baseCandidate({
    id: 'sig_workout_logged',
    topicId,
    domain: 'activity',
    typology: 'workout_event',
    tone: 'positive',
    storyClass: FOCUS_STORY_CLASS.routine_log,
    claimType: 'fact',
    evidenceQuality: 'high',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: strengthN > 0
      ? 'Sessione di forza registrata ieri'
      : 'Allenamento registrato ieri',
    summarySeed: `${workouts.length} sessione/i in diario`
      + (strengthN > 0 ? ` (di cui ${strengthN} classificate come forza).` : '')
      + (kcal?.value != null ? ` Circa ${kcal.value} kcal annotate.` : ''),
    refs: ['day.activity.workouts', 'day.activity.workoutKcalTotal'],
    metrics: kcal?.value != null
      ? [metricRef('day.activity.workoutKcalTotal', kcal.value, 'kcal', kcal.provenance)]
      : [],
    coverage: { workoutLogged: true, strengthSessions: strengthN },
    provenance: FOCUS_PROVENANCE.recorded,
    limitations: [
      'Assenza di altri giorni con workout non implica inattività',
      'Assenza di minuti aerobici etichettati ≠ inattività fisica',
    ],
    doNotClaim: ['volume settimanale insufficiente', 'sedentarietà'],
    preferredRoles: ['continuity'],
    forbidRoles: ['lead', 'good'],
  });
}

function signalHabitFoodEmerging(dossier, memory) {
  const freq = dossier.habits?.foodFrequency || {};
  const items = freq.items || [];
  const windowDays = Number(freq.windowDays) || 0;
  const top = items.find(
    (i) => i.kind === 'food'
      && i.distinctDays >= FOCUS_SCORE_THRESHOLDS.habitEmergingDistinctDays
      && i.occasions >= FOCUS_SCORE_THRESHOLDS.habitEmergingOccasions
      && i.keyType !== 'unclassified',
  );
  if (!top) return null;

  const habitClass = classifyFoodFrequencyHabit(top, windowDays, {
    consolidatedDistinctDays: FOCUS_SCORE_THRESHOLDS.habitConsolidatedDistinctDays,
    consolidatedMinWindowDays: FOCUS_SCORE_THRESHOLDS.habitConsolidatedMinWindowDays,
    consolidatedMinDensity: FOCUS_SCORE_THRESHOLDS.habitConsolidatedMinDensity,
    emergingDistinctDays: FOCUS_SCORE_THRESHOLDS.habitEmergingDistinctDays,
    emergingOccasions: FOCUS_SCORE_THRESHOLDS.habitEmergingOccasions,
  });

  const topicId = `habit_food_${top.key}`;
  const label = top.label || top.key;
  const headlineSeed = habitClass === 'consolidated'
    ? `Frequenza consolidata: ${label}`
    : `Frequenza osservata: ${label}`;
  const persistence = habitClass === 'consolidated' ? 'consolidated' : 'isolated';

  // Sola frequenza senza confronto recente/precedente → dato descrittivo, non approfondimento.
  return baseCandidate({
    id: `sig_habit_food_${top.key.replace(/[^a-z0-9_]/gi, '_')}`,
    topicId,
    domain: 'habits',
    typology: 'food_frequency',
    tone: 'neutral',
    claimType: 'fact',
    evidenceQuality: 'medium',
    persistence,
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed,
    summarySeed: `${label} compare in ${top.distinctDays} giorni distinti`
      + ` (${top.occasions} occasioni) su una finestra di ${windowDays || '?'} giorni`
      + (freq.firstDate && freq.lastDate ? ` (${freq.firstDate}→${freq.lastDate})` : '')
      + '. Frequenza ≠ novità giornalistica né giudizio nutrizionale.',
    refs: ['habits.foodFrequency.items'],
    metrics: [
      metricRef('habits.foodFrequency.distinctDays', top.distinctDays, 'days', FOCUS_PROVENANCE.calculated),
      metricRef('habits.foodFrequency.occasions', top.occasions, 'count', FOCUS_PROVENANCE.calculated),
      metricRef('habits.foodFrequency.windowDays', windowDays, 'days', FOCUS_PROVENANCE.calculated),
    ],
    coverage: {
      windowDays,
      firstDate: freq.firstDate || null,
      lastDate: freq.lastDate || null,
      habitClass,
    },
    provenance: FOCUS_PROVENANCE.calculated,
    limitations: [
      'Frequenza ≠ giudizio nutrizionale',
      'Senza confronto con periodo precedente non si afferma novità o emergenza',
    ],
    doNotClaim: ['mangi troppo', 'alimento sano/non sano', 'abitudine emergente'],
    preferredRoles: [],
    forbidRoles: ['lead', 'good', 'feature', 'concern'],
    publishable: false,
    omitReason: 'descriptive_habit_no_novelty',
  });
}

function signalKcalTrend(dossier, memory) {
  const cmp = dossier.history?.comparisons?.d7_vs_prev7;
  if (!cmp?.available || !cmp.nutritionKcal?.comparable) return null;
  const delta = cmp.nutritionKcal.delta;
  if (delta == null || Math.abs(delta) < FOCUS_SCORE_THRESHOLDS.significantKcalDelta) return null;
  const up = delta > 0;
  const topicId = up ? 'kcal_trend_up_d7' : 'kcal_trend_down_d7';
  return baseCandidate({
    id: `sig_${topicId}`,
    topicId,
    domain: 'nutrition',
    typology: 'window_comparison',
    tone: 'neutral',
    storyClass: FOCUS_STORY_CLASS.significant_pattern,
    claimType: 'calculated',
    evidenceQuality: 'medium',
    persistence: 'emerging',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: up
      ? 'Media kcal degli ultimi 7 giorni più alta del periodo precedente'
      : 'Media kcal degli ultimi 7 giorni più bassa del periodo precedente',
    summarySeed: `Delta medio circa ${delta} kcal (d7 vs 7 giorni precedenti), con copertura sufficiente su entrambi i lati.`,
    refs: ['history.comparisons.d7_vs_prev7.nutritionKcal'],
    metrics: [
      metricRef('history.comparisons.d7_vs_prev7.nutritionKcal.delta', delta, 'kcal', FOCUS_PROVENANCE.calculated),
    ],
    coverage: {
      comparison: 'd7_vs_prev7',
      available: true,
    },
    provenance: FOCUS_PROVENANCE.calculated,
    limitations: ['Confronto su giorni con log alimentare, non su assunzione reale non registrata'],
    doNotClaim: ['devi mangiare di meno', 'devi mangiare di più'],
    preferredRoles: ['feature'],
  });
}

function signalSleepTrend(dossier, memory) {
  const cmp = dossier.history?.comparisons?.d7_vs_prev7;
  if (!cmp?.available || !cmp.sleepHours?.comparable) return null;
  const delta = cmp.sleepHours.delta;
  if (delta == null || Math.abs(delta) < FOCUS_SCORE_THRESHOLDS.significantSleepDeltaH) return null;
  if (delta <= 0) return null;
  const topicId = 'sleep_avg_improved_d7';
  return baseCandidate({
    id: 'sig_sleep_avg_improved_d7',
    topicId,
    domain: 'sleep',
    typology: 'window_comparison',
    tone: 'positive',
    storyClass: FOCUS_STORY_CLASS.significant_pattern,
    claimType: 'calculated',
    evidenceQuality: 'medium',
    persistence: 'emerging',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: 'Media ore di sonno in aumento sugli ultimi 7 giorni',
    summarySeed: `La media delle notti loggate è salita di circa ${delta} h rispetto ai 7 giorni precedenti.`,
    refs: ['history.comparisons.d7_vs_prev7.sleepHours'],
    metrics: [
      metricRef('history.comparisons.d7_vs_prev7.sleepHours.delta', delta, 'h', FOCUS_PROVENANCE.calculated),
    ],
    coverage: { comparison: 'd7_vs_prev7', available: true },
    provenance: FOCUS_PROVENANCE.calculated,
    doNotClaim: ['recupero clinicamente migliorato'],
    preferredRoles: ['lead', 'good'],
    openingModeHint: 'progress',
  });
}

function signalDinnerBufferHypothesis(dossier, memory) {
  const buffer = dossier.sleep?.dinnerSleepBufferH;
  if (buffer?.provenance === FOCUS_PROVENANCE.missing || buffer?.value == null) return null;
  if (buffer.value >= FOCUS_SCORE_THRESHOLDS.dinnerBufferShortH) return null;
  const topicId = 'dinner_sleep_buffer_short';
  return baseCandidate({
    id: 'sig_dinner_sleep_buffer_short',
    topicId,
    domain: 'sleep',
    typology: 'timing_association',
    tone: 'caution',
    claimType: 'hypothesis',
    evidenceQuality: 'low',
    persistence: 'isolated',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: 'Cena e sonno vicini nel tempo',
    summarySeed: `Buffer cena→sonno circa ${buffer.value} h: ipotesi isolata su una notte, evidenza insufficiente per un approfondimento o un consiglio.`,
    refs: ['sleep.dinnerSleepBufferH', 'day.nutrition.lastMealHour'],
    metrics: [
      metricRef('sleep.dinnerSleepBufferH', buffer.value, 'h', buffer.provenance),
    ],
    coverage: { sleepAvailable: dossier.meta?.coverage?.sleepAvailable },
    provenance: FOCUS_PROVENANCE.calculated,
    limitations: ['Associazione temporale, non causalità', 'Evidenza low: non riempire gli spazi'],
    doNotClaim: ['la cena ha rovinato il sonno', 'diagnosi digestiva'],
    preferredRoles: [],
    /** Ipotesi low: non lead/concern/feature per riempimento. */
    forbidRoles: ['concern', 'lead', 'feature', 'good'],
    publishable: false,
    omitReason: 'insufficient_evidence',
  });
}

function signalSleepShortObservation(dossier, memory) {
  const hours = dossier.sleep?.hours;
  if (hours?.provenance === FOCUS_PROVENANCE.missing || hours?.value == null) return null;
  if (hours.value >= FOCUS_SCORE_THRESHOLDS.sleepShortHours) return null;
  const topicId = 'sleep_hours_short';
  return baseCandidate({
    id: 'sig_sleep_hours_short',
    topicId,
    domain: 'sleep',
    typology: 'recovery_logged',
    tone: 'caution',
    claimType: 'fact',
    evidenceQuality: 'high',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: 'Notte con poche ore registrate',
    summarySeed: `Sonno registrato circa ${hours.value} h.`,
    refs: ['sleep.hours'],
    metrics: [metricRef('sleep.hours', hours.value, 'h', hours.provenance)],
    coverage: { sleepAvailable: true },
    provenance: FOCUS_PROVENANCE.recorded,
    limitations: ['Una notte non definisce un pattern'],
    doNotClaim: ['insonnia', 'debito di sonno cronico'],
    preferredRoles: ['concern'],
    forbidRoles: ['lead', 'good'],
    persistence: 'isolated',
  });
}

function signalBodyWeightIfPresent(dossier, memory) {
  const w = dossier.day?.body?.weightKg;
  if (w?.provenance === FOCUS_PROVENANCE.missing || w?.value == null) return null;
  if (!(Number(w.value) > 0)) return null;
  const analysisDate = dossier.meta?.analysisDate;
  const measuredOn = typeof w.measuredOn === 'string' ? w.measuredOn.slice(0, 10) : null;
  const freshness = classifyBodyWeightFreshness(measuredOn, analysisDate);
  // Solo misurazione del giorno analizzato → notizia di aggiornamento.
  // Valori storici/stale: nessun articolo (evita “aggiornato” su misure vecchie).
  if (freshness !== 'new_measurement') {
    return null;
  }
  const topicId = 'body_weight_logged';
  return baseCandidate({
    id: 'sig_body_weight_logged',
    topicId,
    domain: 'body',
    typology: 'body_metric',
    tone: 'neutral',
    storyClass: FOCUS_STORY_CLASS.routine_confirmation,
    claimType: 'fact',
    evidenceQuality: 'high',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: 'Nuova misurazione del peso',
    summarySeed: `Peso registrato il ${measuredOn}: ${w.value} kg.`,
    refs: ['day.body.weightKg'],
    metrics: [metricRef('day.body.weightKg', w.value, 'kg', w.provenance)],
    coverage: { body: true, freshness, measuredOn },
    provenance: FOCUS_PROVENANCE.recorded,
    doNotClaim: [
      'progresso composizione corporea',
      'situazione corporea attuale da misura non odierna',
    ],
    preferredRoles: ['feature', 'good'],
    forbidRoles: ['lead'],
  });
}

/**
 * @param {string|null} measuredOn
 * @param {string|null|undefined} analysisDate
 * @returns {'new_measurement'|'last_available'|'stale'|'unknown'}
 */
export function classifyBodyWeightFreshness(measuredOn, analysisDate) {
  if (!measuredOn || !isIsoDateString(measuredOn)) return 'unknown';
  if (!isIsoDateString(analysisDate)) return 'unknown';
  if (measuredOn === analysisDate) return 'new_measurement';
  const staleCutoff = addCalendarDays(analysisDate, -30);
  if (measuredOn < staleCutoff) return 'stale';
  return 'last_available';
}

function signalStrengthContinuity(dossier, memory) {
  const d30 = dossier.history?.d30?.activity;
  const strengthDays = d30?.strengthDaysLogged;
  if (strengthDays == null || !Number.isFinite(strengthDays)) return null;
  const minDays = FOCUS_SCORE_THRESHOLDS.strengthContinuityMinDaysD30;
  if (strengthDays < minDays) return null;
  const coverage = dossier.meta?.coverage?.history?.d30?.activity;
  if (coverage && coverage.trendComparable === false && (coverage.daysWithData || 0) < minDays) {
    return null;
  }
  const topicId = 'strength_continuity_d30';
  // P6.7.1: un solo totale d30 non dimostra distribuzione/andamento → non «Approfondimento».
  // Resta consultabile come continuità (routine_log); niente nuove metriche inventate.
  return baseCandidate({
    id: 'sig_strength_continuity_d30',
    topicId,
    domain: 'activity',
    typology: 'window_comparison',
    tone: 'neutral',
    storyClass: FOCUS_STORY_CLASS.routine_log,
    claimType: 'calculated',
    evidenceQuality: 'medium',
    persistence: 'emerging',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: 'Continuità della forza negli ultimi 30 giorni',
    summarySeed: `${strengthDays} giorni con sessioni di forza registrate nella finestra d30. `
      + 'L’assenza di minuti aerobici etichettati non implica inattività fisica.',
    refs: ['history.d30.activity.strengthDaysLogged'],
    metrics: [
      metricRef(
        'history.d30.activity.strengthDaysLogged',
        strengthDays,
        'days',
        FOCUS_PROVENANCE.calculated,
      ),
    ],
    coverage: {
      strengthDaysLogged: strengthDays,
      workoutDaysLogged: d30?.workoutDaysLogged ?? null,
      aerobicMinutesTotal: d30?.aerobicMinutesTotal ?? null,
      note: d30?.noAerobicMinutesMeans || null,
      thinCountOnly: true,
    },
    provenance: FOCUS_PROVENANCE.calculated,
    limitations: [
      'Classificazione strength euristica sui label',
      'Assenza aerobica documentata ≠ sedentarietà',
      'Il solo conteggio totale non dimostra distribuzione o continuità senza interruzioni',
    ],
    doNotClaim: ['inattività fisica', 'sedentarietà', 'volume insufficiente'],
    preferredRoles: ['continuity'],
    forbidRoles: ['feature', 'lead', 'good', 'concern'],
  });
}
