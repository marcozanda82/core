/**
 * Longevity dashboard: risk matrix, payload motore score, history chunked.
 */

import { useEffect, useMemo, useState } from 'react';
import { useDeferredMemo } from '../useDeferredMemo';
import { computeTotali, DEFAULT_TARGETS } from '../../useBiochimico';
import {
  TRACKER_STORICO_KEY,
  getLogFromStoricoTree,
  getTodayString,
  addDays,
  computeRiskMatrix,
  computeLongevityMasterScoreFromMatrix,
  computeLongevityScore,
  buildLongevityExplanation,
  computeMetabolicStress,
  DEFAULT_NO_SLEEP_ENERGY,
} from '../../coreEngine';

/**
 * @param {{
 *   fullHistory?: object|null,
 *   userTargets?: object|null,
 *   longevityDays?: number,
 *   activeLog?: object[],
 *   totali?: object|null,
 *   chartData?: object[],
 *   targetKcal?: number,
 *   energySimulation?: object|null,
 *   activeWaterIntake?: number,
 *   dailyWaterGoal?: number,
 *   sleepStatus?: string|null,
 *   currentTrackerDate?: string|null,
 * }} params
 */
export function useLongevityDashboardData({
  fullHistory = null,
  userTargets = null,
  longevityDays = 7,
  activeLog = [],
  totali = null,
  chartData = [],
  targetKcal = 0,
  energySimulation = null,
  activeWaterIntake = 0,
  dailyWaterGoal = 2500,
  sleepStatus = null,
  currentTrackerDate = null,
} = {}) {
  const longevityData = useDeferredMemo(() => {
    if (!fullHistory || !userTargets) return null;
    if (Object.keys(fullHistory || {}).length === 0) return null;

    console.time('[perf] longevityData');
    const matrix = computeRiskMatrix(fullHistory, userTargets, longevityDays);
    const weightedRisk = (matrix.metabolic.score * 0.30) + (matrix.neuro.score * 0.30) + (matrix.inflammatory.score * 0.20) + (matrix.cardio.score * 0.20);
    const masterScore = Math.max(0, Math.min(100, Math.round(100 - weightedRisk)));

    let color = '#00e5ff';
    if (masterScore < 60) color = '#f44336';
    else if (masterScore < 85) color = '#ffb300';

    console.timeEnd('[perf] longevityData');
    return { ...matrix, masterScore, color };
  }, [fullHistory, userTargets, longevityDays], null);

  const longevityPayload = useMemo(() => {
    const nutritionTotals =
      totali && typeof totali === 'object'
        ? {
            ...totali,
            fat: totali.fat != null && totali.fat > 0 ? totali.fat : (totali.fatTotal ?? 0),
          }
        : computeTotali(activeLog || []);

    const stressPts = (chartData || [])
      .map((p) => computeMetabolicStress(p))
      .filter((v) => typeof v === 'number' && !Number.isNaN(v));
    const metabolicStressVal = stressPts.length
      ? Math.round(stressPts.reduce((a, b) => a + b, 0) / stressPts.length)
      : undefined;

    const riskBadness =
      longevityData != null && typeof longevityData.masterScore === 'number'
        ? Math.max(0, Math.min(100, 100 - longevityData.masterScore))
        : undefined;

    const sleepEntry = (activeLog || []).find((e) => e?.type === 'sleep');
    const sleepHoursRaw = sleepEntry
      ? Number(sleepEntry.hours ?? sleepEntry.duration ?? sleepEntry.sleepHours ?? NaN)
      : NaN;
    const sleepHours = !Number.isNaN(sleepHoursRaw) ? sleepHoursRaw : undefined;

    const payload = {
      totals: nutritionTotals,
      nutrition: nutritionTotals,
      targets: {
        kcal: targetKcal,
        prot: userTargets?.prot ?? DEFAULT_TARGETS.prot,
        carb: userTargets?.carb ?? DEFAULT_TARGETS.carb,
        fat: userTargets?.fat ?? userTargets?.fatTotal ?? DEFAULT_TARGETS.fatTotal,
      },
      metabolicStress: metabolicStressVal,
      stress: metabolicStressVal,
      risk: riskBadness ?? 50,
      hydration: activeWaterIntake,
      hydrationTarget: dailyWaterGoal,
      energySeries: (chartData || []).map((p) => p.energy).filter((v) => typeof v === 'number' && !Number.isNaN(v)),
    };

    if (sleepHours !== undefined) {
      payload.sleepHours = sleepHours;
    } else {
      payload.sleepScore =
        sleepStatus === 'OK'
          ? 80
          : sleepStatus === 'NIGHT_PENDING'
            ? 45
            : sleepStatus === 'NO_DATA'
              ? DEFAULT_NO_SLEEP_ENERGY
              : 55;
    }

    return payload;
  }, [
    activeLog,
    userTargets,
    targetKcal,
    totali,
    energySimulation,
    activeWaterIntake,
    dailyWaterGoal,
    sleepStatus,
    longevityData,
    chartData,
  ]);

  const longevityEngineScore = useMemo(
    () => computeLongevityScore(longevityPayload),
    [longevityPayload],
  );

  const longevityExplanation = useMemo(
    () => buildLongevityExplanation(longevityEngineScore),
    [longevityEngineScore],
  );

  const [longevityScoreHistory, setLongevityScoreHistory] = useState([]);
  useEffect(() => {
    if (!fullHistory || !userTargets) { setLongevityScoreHistory([]); return; }
    const histKeys = Object.keys(fullHistory);
    if (histKeys.length === 0) { setLongevityScoreHistory([]); return; }

    let cancelled = false;
    const anchor = currentTrackerDate || getTodayString();
    const maxLookback = 120;
    const CHUNK = 10;
    const out = [];

    const processChunk = (startK) => {
      if (cancelled) return;
      const endK = Math.min(startK + CHUNK, maxLookback);
      console.time(`[perf] longevityScoreHistory chunk ${startK}-${endK}`);
      for (let k = startK; k < endK; k++) {
        const dStr = addDays(anchor, -k);
        const log = getLogFromStoricoTree(fullHistory, dStr) || [];
        const dayNode = fullHistory[TRACKER_STORICO_KEY(dStr)];
        const mn = Array.isArray(dayNode?.manualNodes) ? dayNode.manualNodes : [];
        if (log.length === 0 && mn.length === 0) continue;
        const matrix = computeRiskMatrix(fullHistory, userTargets, 1, addDays(dStr, 1));
        const score = computeLongevityMasterScoreFromMatrix(matrix);
        if (score == null || Number.isNaN(score)) continue;
        out.push({ date: dStr, score, timestamp: new Date(`${dStr}T12:00:00`).getTime() });
      }
      console.timeEnd(`[perf] longevityScoreHistory chunk ${startK}-${endK}`);

      if (endK < maxLookback) {
        setTimeout(() => processChunk(endK), 0);
      } else if (!cancelled) {
        setLongevityScoreHistory(out.sort((a, b) => a.date.localeCompare(b.date)));
      }
    };

    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) processChunk(1);
      });
    });

    return () => { cancelled = true; cancelAnimationFrame(rafId); };
  }, [fullHistory, userTargets, currentTrackerDate]);

  const longevityTodayScore = useMemo(() => {
    if (!fullHistory || !userTargets) return 0;
    if (currentTrackerDate === getTodayString()) {
      const s = longevityEngineScore?.score;
      if (typeof s === 'number' && !Number.isNaN(s)) return s;
    }
    const matrix = computeRiskMatrix(fullHistory, userTargets, 1, addDays(currentTrackerDate, 1));
    const m = computeLongevityMasterScoreFromMatrix(matrix);
    return typeof m === 'number' && !Number.isNaN(m) ? m : 0;
  }, [currentTrackerDate, longevityEngineScore, fullHistory, userTargets]);

  return {
    longevityData,
    longevityPayload,
    longevityEngineScore,
    longevityExplanation,
    longevityScoreHistory,
    longevityTodayScore,
  };
}

export default useLongevityDashboardData;
