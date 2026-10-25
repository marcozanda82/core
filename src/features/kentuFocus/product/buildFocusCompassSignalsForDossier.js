/**
 * Segnali Bussola per dossier Focus AI — riuso formule dead-band + serie energetica Focus.
 *
 * Usa le stesse costanti/formule di metabolicDirectionEngine (via focusCompassDeadBandMath)
 * e costruisce la serie giornaliera dal diario Focus (getTrackerDayNode / normalize*),
 * perché metabolicCompassDailyHistory.js non è importabile in Node ESM (cat senza .js).
 * In UI Vite le due serie restano concettualmente allineate (intake − target operativo).
 *
 * Nessun quadrante, nessuno score.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { normalizeFoodEvents, collectDayLogForNutrition } from '../normalize/normalizeFoodEvents.js';
import { normalizeWorkoutEvents } from '../normalize/normalizeWorkoutEvents.js';
import { resolveMainNightSleep, sleepHoursFromEntry } from '../normalize/resolveMainNightSleep.js';
import { getLogArray } from '../normalize/logUtils.js';
import {
  applyEnergyDeadBandToKcalBalance,
  computeEnergyDeadBandHalfWidthKcal,
  computeMetabolicEngineTargetVec,
  computeOutsideEnergyDeadbandDayFraction,
  getMetabolicDirectionWindowSlice,
} from './focusCompassDeadBandMath.js';

/**
 * @param {string} periodId
 * @returns {'1d'|'7d'|'30d'}
 */
function timeframeForPeriod(periodId) {
  if (periodId === 'ieri') return '1d';
  if (periodId === 'mese') return '30d';
  return '7d';
}

/**
 * @param {number} xNorm
 * @param {boolean} deadBandAppliedOnMean
 */
function describeEnergyDirection(xNorm, deadBandAppliedOnMean) {
  if (deadBandAppliedOnMean || Math.abs(xNorm) < 0.08) {
    return {
      observedConduct: 'near_energy_neutral',
      labelIt: 'Bilancio energetico stimato vicino alla fascia neutra (dead-band).',
    };
  }
  if (xNorm > 0.08) {
    return {
      observedConduct: 'apparent_surplus_vs_target',
      labelIt: 'Condotta energetica osservata: apporto medio sopra il target operativo (dopo dead-band).',
    };
  }
  return {
    observedConduct: 'apparent_deficit_vs_target',
    labelIt: 'Condotta energetica osservata: apporto medio sotto il target operativo (dopo dead-band).',
  };
}

/**
 * Serie giornaliera compatibile Bussola: kcalBalance = intake − target operativo dichiarato.
 * trainingLoad ≈ durata allenamento (indice grezzo 0–100+), come proxy dello stimolo.
 *
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {number|null} kcalTarget
 * @param {number} maxDays
 */
export function buildFocusCompassDailyHistoryFromDiary(
  fullHistory,
  analysisDate,
  kcalTarget,
  maxDays = 21,
) {
  if (!fullHistory || !isIsoDateString(analysisDate)) return [];
  const target = Number.isFinite(Number(kcalTarget)) && Number(kcalTarget) > 0
    ? Number(kcalTarget)
    : null;
  /** @type {object[]} */
  const out = [];
  for (let i = maxDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) continue;
    const foodPack = normalizeFoodEvents(node);
    const items = collectDayLogForNutrition(node);
    let intake = 0;
    let foodCount = 0;
    for (const it of items) {
      if (it?.type && it.type !== 'food' && it.type !== 'recipe') continue;
      const k = Number(it.kcal);
      if (Number.isFinite(k)) {
        intake += k;
        foodCount += 1;
      }
    }
    const workoutPack = normalizeWorkoutEvents(node);
    const workouts = workoutPack?.activity?.workouts || [];
    const durationMin = workouts.reduce((s, w) => {
      const v = w?.durationMin?.value ?? w?.durationMin;
      return s + (Number.isFinite(Number(v)) ? Number(v) : 0);
    }, 0);
    const trainingLoad = Math.min(120, durationMin * 1.1);

    const wakeDate = addCalendarDays(date, 1);
    const wakeNode = getTrackerDayNode(fullHistory, wakeDate);
    let sleepHours = null;
    if (wakeNode) {
      try {
        const sleepEntries = getLogArray(wakeNode).filter((e) => e && e.type === 'sleep');
        const night = resolveMainNightSleep(sleepEntries);
        if (night?.status === 'selected' && night?.entry) {
          sleepHours = sleepHoursFromEntry(night.entry);
        }
      } catch {
        sleepHours = null;
      }
    }

    if (foodCount === 0 && durationMin === 0 && sleepHours == null) continue;

    if (foodCount === 0 || target == null) {
      out.push({
        date,
        kcalBalance: null,
        trainingLoad: durationMin > 0 ? trainingLoad : null,
        sleepHours,
        skipEnergyAverage: true,
        intakeKcal: foodCount > 0 ? Math.round(intake) : null,
      });
      continue;
    }

    out.push({
      date,
      kcalBalance: Math.round(intake - target),
      trainingLoad,
      sleepHours,
      skipEnergyAverage: false,
      intakeKcal: Math.round(intake),
      operationalTargetKcal: target,
    });
  }
  return out;
}

/**
 * @param {{
 *   fullHistory?: object|null,
 *   analysisDate?: string|null,
 *   periodId?: string,
 *   userTargets?: object|null,
 *   publicationDate?: string|null,
 * }} input
 */
export function buildFocusCompassSignalsForDossier(input) {
  const periodId = String(input.periodId || 'ieri').toLowerCase();
  const fullHistory = input.fullHistory;
  const analysisDate = input.analysisDate;
  const targets = input.userTargets && typeof input.userTargets === 'object'
    ? input.userTargets
    : null;

  if (!fullHistory || !analysisDate) {
    return {
      available: false,
      reason: 'missing_history_or_date',
      declaredGoal: null,
      observedTrajectory: null,
      evidence: null,
      limits: ['Serie Bussola non calcolabile senza diario e data di analisi.'],
    };
  }

  const declaredKcal = targets?.kcal != null && Number.isFinite(Number(targets.kcal))
    ? Number(targets.kcal)
    : null;

  /** @type {string[]} */
  const limits = [
    'Il target calorico dichiarato non è una misura certa del TDEE.',
    'Deficit/surplus osservati ≠ volontà dichiarata di cut/bulk.',
    'Nessuno score Bussola né etichetta di quadrante inclusa.',
    'Serie energetica Focus: intake giornaliero − target operativo dichiarato (stesse dead-band di metabolicDirectionEngine).',
  ];

  const dailyHistory = buildFocusCompassDailyHistoryFromDiary(
    fullHistory,
    analysisDate,
    declaredKcal,
    periodId === 'mese' ? 35 : 21,
  );

  const timeframe = timeframeForPeriod(periodId);
  // publicationDate spesso = "oggi" rispetto all’analisi; escludi se presente in serie
  const excludeDate = input.publicationDate && input.publicationDate !== analysisDate
    ? input.publicationDate
    : null;
  const slice = getMetabolicDirectionWindowSlice(dailyHistory, timeframe, excludeDate);
  const usableDays = (slice || []).filter(
    (d) => d && Number.isFinite(Number(d.kcalBalance)) && !d.skipEnergyAverage,
  );

  if (usableDays.length === 0) {
    return {
      available: false,
      reason: 'insufficient_energy_days',
      declaredGoal: declaredKcal != null
        ? {
          kcalTargetDeclared: declaredKcal,
          note: 'Obiettivo dichiarato dall’utente (se presente in sessione).',
        }
        : null,
      observedTrajectory: null,
      evidence: { daysInSeries: dailyHistory.length, usableEnergyDays: 0, timeframe },
      limits: [...limits, 'Giorni energetici insufficienti nella finestra Focus.'],
    };
  }

  const refTdee = declaredKcal && declaredKcal > 0 ? declaredKcal : 2000;
  const halfWidth = computeEnergyDeadBandHalfWidthKcal(refTdee);
  const meanBalance = usableDays.reduce((s, d) => s + Number(d.kcalBalance), 0) / usableDays.length;
  const dead = applyEnergyDeadBandToKcalBalance(meanBalance, refTdee);
  const persistFrac = computeOutsideEnergyDeadbandDayFraction(
    dailyHistory,
    timeframe,
    refTdee,
    excludeDate,
  );
  const vec = computeMetabolicEngineTargetVec(dailyHistory, timeframe, refTdee, excludeDate);
  const meanLoad = usableDays.reduce((s, d) => s + (Number(d.trainingLoad) || 0), 0) / usableDays.length;
  const energyDir = describeEnergyDirection(vec?.x ?? 0, dead.deadBandApplied);

  const declaredGoal = {
    kcalTargetDeclared: declaredKcal,
    proteinTargetDeclared: targets?.prot != null ? Number(targets.prot) : null,
    note: 'Obiettivo dichiarato (se disponibile). Non equivale a fase bulk/cut certa né a TDEE misurato.',
  };

  const observedTrajectory = {
    timeframe,
    energyDirection: energyDir.observedConduct,
    energyDirectionLabelIt: energyDir.labelIt,
    meanKcalBalanceVsOperationalTarget: Math.round(meanBalance),
    meanKcalBalanceAfterDeadBand: Math.round(dead.adjusted),
    deadBandAppliedOnMean: dead.deadBandApplied,
    deadBandHalfWidthKcal: halfWidth,
    fractionDaysOutsideDeadBand: persistFrac == null
      ? null
      : Math.round(Number(persistFrac) * 1000) / 1000,
    meanTrainingLoadIndex: Math.round(meanLoad * 10) / 10,
    engineVectorNormalized: vec
      ? { x: Math.round(vec.x * 1000) / 1000, y: Math.round(vec.y * 1000) / 1000 }
      : null,
    coherenceNote: declaredKcal == null
      ? 'Senza target dichiarato non confronto obiettivo vs condotta.'
      : energyDir.observedConduct === 'near_energy_neutral'
        ? 'Condotta energetica osservata allineata alla fascia neutra rispetto al target dichiarato (dopo dead-band).'
        : 'Possibile incoerenza fra target dichiarato e condotta energetica media osservata — da interpretare, non da etichettare come “vuole fare cut/bulk”.',
  };

  const evidence = {
    usableEnergyDays: usableDays.length,
    sampleDays: usableDays.slice(-5).map((d) => ({
      date: d.date,
      kcalBalance: Math.round(Number(d.kcalBalance)),
      intakeKcal: d.intakeKcal ?? null,
      trainingLoad: Number(d.trainingLoad) || 0,
      sleepHours: d.sleepHours ?? null,
    })),
    source: 'Focus diary series + focusCompassDeadBandMath (= formule metabolicDirectionEngine)',
    reusedConcepts: [
      'energy dead-band',
      'persistence outside dead-band',
      'normalized energy×load vector',
      'declared goal vs observed conduct',
    ],
  };

  const signalStrength = persistFrac != null && persistFrac < 0.35
    ? 'weak'
    : persistFrac != null && persistFrac >= 0.52
      ? 'persistent'
      : 'moderate';

  if (signalStrength === 'weak') {
    limits.push('Segnale energetico debole/poco persistente: attenua le conclusioni di fase.');
  }

  return {
    available: true,
    reason: null,
    declaredGoal,
    observedTrajectory,
    evidence,
    signalStrength,
    limits,
    policy: {
      noQuadrantCopy: true,
      noMetabolicScore: true,
      deadBandReused: true,
      targetIsNotTdee: true,
    },
  };
}
