import { useMemo } from 'react';
import { getTodayString } from '../../coreEngine';
import {
  calculateCardioStatus,
  CARDIO_WEEKLY_TARGET_MINUTES,
} from '../../features/commandTerminal/context/cardioCylinderStatus.js';
import { collectRecentWorkoutLogs } from '../../features/commandTerminal/context/kentuGlobalState.js';
import { computeStrengthScore } from '../../components/MuscleStimulusWidget';

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampProgressionScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

/**
 * Quale widget mostrare sulla Home.
 * Forza vince solo se strettamente maggiore; parità e 0–0 → Cardio.
 *
 * @param {unknown} strengthScore
 * @param {unknown} cardioScore
 * @returns {{ mode: 'cardio' | 'strength', strengthScore: number, cardioScore: number }}
 */
export function pickHomeProgressionMode(strengthScore, cardioScore) {
  const strength = clampProgressionScore(strengthScore);
  const cardio = clampProgressionScore(cardioScore);
  return {
    strengthScore: strength,
    cardioScore: cardio,
    mode: strength > cardio ? 'strength' : 'cardio',
  };
}

/**
 * Stesso pool di `CardioProgressBar`: finestra ancorata a oggi, activeLog solo se si guarda oggi.
 *
 * @param {object | null | undefined} fullHistory
 * @param {Array | null | undefined} activeLog
 * @param {string} viewerDate
 * @param {string} liveDay
 * @returns {object}
 */
function resolveCardioBundle(fullHistory, activeLog, viewerDate, liveDay) {
  try {
    const todayIso = String(liveDay || getTodayString()).slice(0, 10);
    const viewed = String(viewerDate || '').slice(0, 10);
    const mergeActiveLog = !viewed || viewed === todayIso;
    const pools = collectRecentWorkoutLogs(
      fullHistory || {},
      mergeActiveLog && Array.isArray(activeLog) ? activeLog : [],
      todayIso,
    );
    return calculateCardioStatus(pools.cardioLogs, pools.workoutLogs, {
      nowMs: Date.now(),
    });
  } catch (error) {
    console.warn('[useHomeProgressionSwap] cardio score failed', error);
    return {
      fillPercent: 0,
      accumulatedMinutes: 0,
      weeklyTargetMinutes: CARDIO_WEEKLY_TARGET_MINUTES,
    };
  }
}

/**
 * Quale widget di progressione mostrare sulla Home.
 * Parità o entrambi a zero → Cardio prevale (`cardioScore >= strengthScore`).
 *
 * @param {{
 *   fourCylinder?: object | null,
 *   fullHistory?: object | null,
 *   activeLog?: Array | null,
 *   todayIso?: string | null,
 * }} [params]
 * @returns {{
 *   mode: 'cardio' | 'strength',
 *   strengthScore: number,
 *   cardioScore: number,
 *   strengthPeakLabel: string,
 *   cardioStatus: object,
 *   dayKey: string,
 * }}
 */
export default function useHomeProgressionSwap({
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  todayIso = null,
} = {}) {
  const dayKey = String(todayIso || getTodayString()).slice(0, 10);
  const liveDay = getTodayString();

  const strength = useMemo(
    () => computeStrengthScore(fourCylinder, fullHistory, dayKey),
    [fourCylinder, fullHistory, dayKey],
  );

  const cardioBundle = useMemo(
    () => resolveCardioBundle(fullHistory, activeLog, dayKey, liveDay),
    [fullHistory, activeLog, dayKey, liveDay],
  );

  const picked = pickHomeProgressionMode(strength.percent, cardioBundle.fillPercent);

  return {
    ...picked,
    strengthPeakLabel: strength.peakLabel || '—',
    cardioStatus: cardioBundle,
    dayKey,
  };
}
