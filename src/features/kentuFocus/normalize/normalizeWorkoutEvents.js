/**
 * Normalizzatore puro allenamenti → day.activity.
 * Classificazione euristica (non etichetta utente): strength / aerobic / other_activity / unclassified.
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

/** @typedef {'strength'|'aerobic'|'other_activity'|'unclassified'} FocusActivityKind */

const STRENGTH_PATTERNS = [
  'pesi',
  'strength',
  'forza',
  'gym',
  'palestra',
  'squat',
  'deadlift',
  'panca',
  'bench',
  'hypertrophy',
  'ipertrof*',
  'powerlift*',
  'bodybuild*',
  'manubri',
  'bilanciere',
  'sollevamento',
  'bicipit*',
  'tricipit*',
  'avambracc*',
];

const AEROBIC_PATTERNS = [
  'camminat*',
  'passeggiat*',
  'walking',
  'walk',
  'corsa',
  'running',
  'run',
  'jog*',
  'bike',
  'bici',
  'ciclismo',
  'cicletta',
  'cycling',
  'nuoto',
  'swim*',
  'cardio',
  'ellitt*',
  'rowing',
  'remo',
  'rower',
];

const WALKING_PATTERNS = [
  'camminat*',
  'passeggiat*',
  'walking',
  'walk',
];

/** @param {string} s */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a parola intera o prefisso (pattern che termina con *).
 * Evita falsi positivi tipo bici ⊂ bicipiti.
 * @param {string} label
 * @param {string[]} patterns
 */
export function labelMatchesActivityPatterns(label, patterns) {
  const text = String(label || '').toLowerCase();
  if (!text) return false;
  for (const pattern of patterns) {
    const p = String(pattern || '').toLowerCase();
    if (!p) continue;
    if (p.endsWith('*')) {
      const stem = escapeRegExp(p.slice(0, -1));
      if (!stem) continue;
      const re = new RegExp(`(?:^|[^a-z0-9àèéìòù])${stem}[a-z0-9àèéìòù]*`, 'i');
      if (re.test(text)) return true;
    } else {
      const re = new RegExp(`(?:^|[^a-z0-9àèéìòù])${escapeRegExp(p)}(?:[^a-z0-9àèéìòù]|$)`, 'i');
      if (re.test(text)) return true;
    }
  }
  return false;
}

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

/**
 * @param {object} entry
 * @returns {{
 *   kind: FocusActivityKind,
 *   isWalking: boolean,
 *   provenance: string,
 *   source: string,
 * }}
 */
export function classifyFocusActivity(entry) {
  const label = workoutLabel(entry);
  if (!label) {
    return {
      kind: 'unclassified',
      isWalking: false,
      provenance: FOCUS_PROVENANCE.missing,
      source: 'no_label',
    };
  }

  if (labelMatchesActivityPatterns(label, STRENGTH_PATTERNS)) {
    return {
      kind: 'strength',
      isWalking: false,
      provenance: FOCUS_PROVENANCE.calculated,
      source: 'strength_patterns_precede_aerobic',
    };
  }

  const isWalking = labelMatchesActivityPatterns(label, WALKING_PATTERNS);
  if (labelMatchesActivityPatterns(label, AEROBIC_PATTERNS) || isWalking) {
    return {
      kind: 'aerobic',
      isWalking,
      provenance: FOCUS_PROVENANCE.calculated,
      source: isWalking ? 'walking_patterns' : 'aerobic_patterns',
    };
  }

  return {
    kind: 'other_activity',
    isWalking: false,
    provenance: FOCUS_PROVENANCE.calculated,
    source: 'label_present_no_forced_class',
  };
}

/**
 * Compat: true solo per kind aerobic (non forza).
 * @param {object} entry
 */
export function isCardioWorkout(entry) {
  return classifyFocusActivity(entry).kind === 'aerobic';
}

/**
 * Intensità moderata/vigorosa solo se esplicitamente supportata dai dati entry.
 * @param {object} entry
 * @param {number|null} durationMin
 */
export function resolveRecordedIntensityMinutes(entry, durationMin) {
  if (durationMin == null || !(durationMin > 0)) {
    return {
      moderateIntensityMinutes: null,
      vigorousIntensityMinutes: null,
      intensitySupported: false,
    };
  }

  const intensityRaw = String(
    entry?.intensity
      ?? entry?.effort
      ?? entry?.intensityZone
      ?? entry?.zone
      ?? '',
  ).trim().toLowerCase();
  const mets = finiteNumber(entry?.mets ?? entry?.MET ?? entry?.met);
  const hr = finiteNumber(entry?.hr ?? entry?.avgHr ?? entry?.heartRate);

  let band = null;
  if (intensityRaw.includes('vigor') || intensityRaw.includes('high') || intensityRaw === 'hard') {
    band = 'vigorous';
  } else if (
    intensityRaw.includes('moder')
    || intensityRaw === 'medium'
    || intensityRaw === 'tempo'
  ) {
    band = 'moderate';
  } else if (mets != null && mets >= 6) {
    band = 'vigorous';
  } else if (mets != null && mets >= 3) {
    band = 'moderate';
  } else if (hr != null && hr >= 150) {
    band = 'vigorous';
  } else if (hr != null && hr >= 110) {
    band = 'moderate';
  }

  if (!band) {
    return {
      moderateIntensityMinutes: null,
      vigorousIntensityMinutes: null,
      intensitySupported: false,
    };
  }

  return {
    moderateIntensityMinutes: band === 'moderate' ? durationMin : null,
    vigorousIntensityMinutes: band === 'vigorous' ? durationMin : null,
    intensitySupported: true,
  };
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
  let aerobicMinutes = 0;
  let walkingMinutes = 0;
  let moderateIntensityMinutes = 0;
  let vigorousIntensityMinutes = 0;
  let anyKcal = false;
  let anyAerobic = false;
  let anyWalking = false;
  let anyModerate = false;
  let anyVigorous = false;

  const workouts = merged.map((entry) => {
    const durationMin = durationToMinutes(entry.duration ?? entry.durationMin ?? entry.minutes);
    const kcalBurn = finiteNumber(entry.kcal ?? entry.cal ?? entry.kcalBurn);
    const classification = classifyFocusActivity(entry);
    const intensity = resolveRecordedIntensityMinutes(entry, durationMin);

    if (kcalBurn != null) {
      anyKcal = true;
      workoutKcalTotal += kcalBurn;
    }
    if (classification.kind === 'aerobic' && durationMin != null) {
      anyAerobic = true;
      aerobicMinutes += durationMin;
    }
    if (classification.isWalking && durationMin != null) {
      anyWalking = true;
      walkingMinutes += durationMin;
    }
    if (intensity.moderateIntensityMinutes != null) {
      anyModerate = true;
      moderateIntensityMinutes += intensity.moderateIntensityMinutes;
    }
    if (intensity.vigorousIntensityMinutes != null) {
      anyVigorous = true;
      vigorousIntensityMinutes += intensity.vigorousIntensityMinutes;
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
      activityKind: {
        value: classification.kind,
        provenance: classification.provenance,
        source: classification.source,
      },
      isWalking: focusMetric(classification.isWalking, {
        provenance: FOCUS_PROVENANCE.calculated,
        source: classification.source,
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
      /**
       * Minuti classificati come aerobici (hint label). Non implica intensità moderata verificata.
       * Alias storico: cardioMinutes.
       */
      aerobicMinutes: workouts.length === 0
        ? missingMetric()
        : focusMetric(anyAerobic ? Math.round(aerobicMinutes * 10) / 10 : 0, {
          unit: 'min',
          provenance: FOCUS_PROVENANCE.calculated,
          source: 'normalizeWorkoutEvents',
          certainty: 'low',
        }),
      cardioMinutes: workouts.length === 0
        ? missingMetric()
        : focusMetric(anyAerobic ? Math.round(aerobicMinutes * 10) / 10 : 0, {
          unit: 'min',
          provenance: FOCUS_PROVENANCE.calculated,
          source: 'normalizeWorkoutEvents',
          certainty: 'low',
        }),
      walkingMinutes: workouts.length === 0
        ? missingMetric()
        : focusMetric(anyWalking ? Math.round(walkingMinutes * 10) / 10 : 0, {
          unit: 'min',
          provenance: FOCUS_PROVENANCE.calculated,
          source: 'normalizeWorkoutEvents',
          certainty: 'low',
        }),
      moderateIntensityMinutes: workouts.length === 0
        ? missingMetric()
        : focusMetric(
          anyModerate ? Math.round(moderateIntensityMinutes * 10) / 10 : null,
          {
            unit: 'min',
            provenance: anyModerate ? FOCUS_PROVENANCE.recorded : FOCUS_PROVENANCE.missing,
            source: 'resolveRecordedIntensityMinutes',
          },
        ),
      vigorousIntensityMinutes: workouts.length === 0
        ? missingMetric()
        : focusMetric(
          anyVigorous ? Math.round(vigorousIntensityMinutes * 10) / 10 : null,
          {
            unit: 'min',
            provenance: anyVigorous ? FOCUS_PROVENANCE.recorded : FOCUS_PROVENANCE.missing,
            source: 'resolveRecordedIntensityMinutes',
          },
        ),
    },
  };
}
