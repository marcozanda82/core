/**
 * Estrazione deterministica di candidati editoriali dal FocusDossier.
 * Nessun riempimento artificiale di rubriche.
 */

import { FOCUS_PROVENANCE } from '../contracts/focusDossier.v1.js';
import { FOCUS_SCORE_THRESHOLDS } from './focusEditorialConfig.js';
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

  return candidates;
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

  const hit = ratio >= FOCUS_SCORE_THRESHOLDS.proteinHitTargetRatio;
  const topicId = 'protein_near_target';
  return baseCandidate({
    id: 'sig_protein_near_target',
    topicId,
    domain: 'nutrition',
    typology: hit ? 'target_hit' : 'target_near',
    tone: 'positive',
    claimType: 'calculated',
    evidenceQuality: 'high',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: hit ? 'Proteine in linea con il target' : 'Proteine vicine al target',
    summarySeed: `Ieri circa ${prot.value} g di proteine su target ${target.value} g.`,
    refs: ['day.nutrition.totals.proteinG', 'day.nutrition.targets.proteinG'],
    metrics: [
      metricRef('day.nutrition.totals.proteinG', prot.value, 'g', prot.provenance),
      metricRef('day.nutrition.targets.proteinG', target.value, 'g', target.provenance),
    ],
    coverage: { day: true },
    provenance: FOCUS_PROVENANCE.calculated,
    doNotClaim: ['ottimizzazione metabolica', 'miglioramento fisiologico'],
    preferredRoles: ['lead', 'good'],
  });
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
    preferredRoles: ['lead', 'good'],
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
    claimType: 'fact',
    evidenceQuality: 'high',
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
    preferredRoles: ['feature'],
    forbidRoles: ['lead'],
    openingModeHint: 'documentation',
  });
}

function signalWorkoutLogged(dossier, memory) {
  if (!dossier.meta?.coverage?.analysisDayHasWorkout) return null;
  const workouts = dossier.day?.activity?.workouts || [];
  if (workouts.length === 0) return null;
  const kcal = dossier.day?.activity?.workoutKcalTotal;
  const topicId = 'workout_logged';
  return baseCandidate({
    id: 'sig_workout_logged',
    topicId,
    domain: 'activity',
    typology: 'workout_event',
    tone: 'positive',
    claimType: 'fact',
    evidenceQuality: 'high',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: 'Allenamento registrato ieri',
    summarySeed: `${workouts.length} sessione/i in diario`
      + (kcal?.value != null ? ` (circa ${kcal.value} kcal annotate).` : '.'),
    refs: ['day.activity.workouts', 'day.activity.workoutKcalTotal'],
    metrics: kcal?.value != null
      ? [metricRef('day.activity.workoutKcalTotal', kcal.value, 'kcal', kcal.provenance)]
      : [],
    coverage: { workoutLogged: true },
    provenance: FOCUS_PROVENANCE.recorded,
    limitations: [
      'Assenza di altri giorni con workout non implica inattività',
    ],
    doNotClaim: ['volume settimanale insufficiente', 'sedentarietà'],
    preferredRoles: ['good', 'feature'],
  });
}

function signalHabitFoodEmerging(dossier, memory) {
  const items = dossier.habits?.foodFrequency?.items || [];
  const emerging = items.find(
    (i) => i.kind === 'food'
      && i.distinctDays >= FOCUS_SCORE_THRESHOLDS.habitEmergingDistinctDays
      && i.occasions >= FOCUS_SCORE_THRESHOLDS.habitEmergingOccasions
      && i.keyType !== 'unclassified',
  );
  if (!emerging) return null;
  const topicId = `habit_food_${emerging.key}`;
  return baseCandidate({
    id: `sig_habit_food_${emerging.key.replace(/[^a-z0-9_]/gi, '_')}`,
    topicId,
    domain: 'habits',
    typology: 'food_frequency',
    tone: 'neutral',
    claimType: 'fact',
    evidenceQuality: 'medium',
    persistence: 'emerging',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: `Abitudine emergente: ${emerging.label || emerging.key}`,
    summarySeed: `${emerging.label || 'Alimento'} compare in ${emerging.distinctDays} giorni distinti (${emerging.occasions} occasioni) nella finestra osservata.`,
    refs: ['habits.foodFrequency.items'],
    metrics: [
      metricRef('habits.foodFrequency.distinctDays', emerging.distinctDays, 'days', FOCUS_PROVENANCE.calculated),
      metricRef('habits.foodFrequency.occasions', emerging.occasions, 'count', FOCUS_PROVENANCE.calculated),
    ],
    coverage: dossier.meta?.coverage?.history?.d7?.nutrition || null,
    provenance: FOCUS_PROVENANCE.calculated,
    limitations: ['Frequenza ≠ giudizio nutrizionale'],
    doNotClaim: ['mangi troppo', 'alimento sano/non sano'],
    preferredRoles: ['feature'],
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
    summarySeed: `Buffer cena→sonno circa ${buffer.value} h: possibile elemento da osservare, da confermare su più notti.`,
    refs: ['sleep.dinnerSleepBufferH', 'day.nutrition.lastMealHour'],
    metrics: [
      metricRef('sleep.dinnerSleepBufferH', buffer.value, 'h', buffer.provenance),
    ],
    coverage: { sleepAvailable: dossier.meta?.coverage?.sleepAvailable },
    provenance: FOCUS_PROVENANCE.calculated,
    limitations: ['Associazione temporale, non causalità'],
    doNotClaim: ['la cena ha rovinato il sonno', 'diagnosi digestiva'],
    preferredRoles: ['feature'],
    /** hypothesis non può diventare concern accertata */
    forbidRoles: ['concern', 'lead'],
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
  const topicId = 'body_weight_logged';
  return baseCandidate({
    id: 'sig_body_weight_logged',
    topicId,
    domain: 'body',
    typology: 'body_metric',
    tone: 'neutral',
    claimType: 'fact',
    evidenceQuality: 'high',
    novelty: topicNoveltyFromMemory(memory, topicId),
    headlineSeed: 'Peso corporeo aggiornato',
    summarySeed: `Ultimo peso registrato: ${w.value} kg`
      + (w.measuredOn ? ` (misura del ${w.measuredOn}).` : '.'),
    refs: ['day.body.weightKg'],
    metrics: [metricRef('day.body.weightKg', w.value, 'kg', w.provenance)],
    coverage: { body: true },
    provenance: FOCUS_PROVENANCE.recorded,
    doNotClaim: ['progresso composizione corporea'],
    preferredRoles: ['feature'],
  });
}
