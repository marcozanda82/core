/**
 * Normalizzatore puro allenamenti → day.activity.
 */

import {
  FOCUS_PROVENANCE,
  focusMetric,
  missingMetric,
} from '../contracts/focusDossier.v1.js';
import {
  dedupeById,
  finiteNumber,
  getLogArray,
  getManualNodesArray,
} from './logUtils.js';

const CARDIO_HINTS = [
  'camminat',
  'walking',
  'corsa',
  'run',
  'jog',
  'bike',
  'bici',
  'cicl',
  'nuoto',
  'swim',
  'cardio',
  'ellitt',
  'rowing',
  'remo',
];

/** @param {unknown} durationRaw */
export function durationToMinutes(durationRaw) {
  const dur = finiteNumber(durationRaw);
  if (dur == null || dur < 0) return null;
  // Allineato a coreEngine dayHasTrainingFromLogs: >5 → minuti, altrimenti ore.
  return dur > 5 ? dur : dur * 60;
}

/** @param {object} entry */
function workoutLabel(entry) {
  return String(entry?.name || entry?.desc || entry?.workoutType || entry?.label || '').trim();
}

/** @param {object} entry */
export function isCardioWorkout(entry) {
  const label = workoutLabel(entry).toLowerCase();
  if (!label) return false;
  return CARDIO_HINTS.some((h) => label.includes(h));
}

/** @param {object} entry */
function detailLevel(entry) {
  if (entry?.exercises || entry?.sets || entry?.structured === true) return 'structured';
  const note = String(entry?.note || entry?.notes || entry?.desc || '').trim();
  if (note || workoutLabel(entry)) return 'note';
  return 'none';
}

/**
 * @param {object|null|undefined} analysisDayNode
 */
export function normalizeWorkoutEvents(analysisDayNode) {
  const fromLog = getLogArray(analysisDayNode).filter((e) => e && e.type === 'workout');
  const fromManual = getManualNodesArray(analysisDayNode).filter((e) => e && e.type === 'workout');
  const merged = dedupeById([...fromLog, ...fromManual], (e) => e.id);

  let workoutKcalTotal = 0;
  let cardioMinutes = 0;
  let anyKcal = false;
  let anyCardio = false;

  const workouts = merged.map((entry) => {
    const durationMin = durationToMinutes(entry.duration ?? entry.durationMin ?? entry.minutes);
    const kcalBurn = finiteNumber(entry.kcal ?? entry.cal ?? entry.kcalBurn);
    if (kcalBurn != null) {
      anyKcal = true;
      workoutKcalTotal += kcalBurn;
    }
    if (isCardioWorkout(entry) && durationMin != null) {
      anyCardio = true;
      cardioMinutes += durationMin;
    }
    return {
      id: entry.id != null ? String(entry.id) : undefined,
      label: workoutLabel(entry) || undefined,
      durationMin: durationMin == null
        ? missingMetric()
        : focusMetric(Math.round(durationMin * 10) / 10, {
          unit: 'min',
          provenance: FOCUS_PROVENANCE.recorded,
        }),
      kcalBurn: kcalBurn == null
        ? missingMetric()
        : focusMetric(kcalBurn, {
          unit: 'kcal',
          provenance: FOCUS_PROVENANCE.recorded,
        }),
      detailLevel: detailLevel(entry),
    };
  });

  return {
    hasWorkout: workouts.length > 0,
    workoutIds: workouts.map((w) => w.id).filter(Boolean),
    activity: {
      workouts,
      workoutKcalTotal: workouts.length === 0
        ? missingMetric()
        : focusMetric(anyKcal ? Math.round(workoutKcalTotal * 10) / 10 : null, {
          provenance: anyKcal ? FOCUS_PROVENANCE.calculated : FOCUS_PROVENANCE.missing,
          source: 'normalizeWorkoutEvents',
        }),
      cardioMinutes: workouts.length === 0
        ? missingMetric()
        : focusMetric(anyCardio ? Math.round(cardioMinutes * 10) / 10 : 0, {
          unit: 'min',
          provenance: FOCUS_PROVENANCE.calculated,
          source: 'normalizeWorkoutEvents',
        }),
    },
  };
}
