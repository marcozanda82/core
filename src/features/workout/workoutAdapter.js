import {
  getWorkoutActivityLogDescription,
  getWorkoutActivityTypeDef,
  getCognitiveMetForActivity,
  resolveWorkoutActivityTypeId,
} from '../../activityCatalog';
import { workoutActivityRequiresStrengthDetailNote } from '../../drawers/vistas/WorkoutView';

const CARDIO_KEYWORD_PATTERN =
  /\b(corsa|correre|running|run|bike|cicl|spinning|nuot|swim|remier|rowing|ellitt|tapis|walk|cammin|cardio)\b/i;

const LAVORO_PC_KEYWORD_PATTERN =
  /lavoro\s*(al\s*)?pc|smart\s*working|scrivania|desk|videocal|zoom|programm|coding|deep\s*work/i;
const STUDIO_KEYWORD_PATTERN = /\bstudio\b|studiare|esame|universit|ripass/i;
const LAVORO_KEYWORD_PATTERN = /\blavoro\b|meeting|riunione|ufficio\b|turno\b/;

/** Allineato a TRAINING_GOALS del questionario diario. */
const TRAINING_GOAL_ENTRIES = [
  { id: 'ipertrofia', labels: ['ipertrofia', 'hypertrophy'] },
  { id: 'forza', labels: ['forza', 'strength'] },
  { id: 'resistenza', labels: ['resistenza', 'endurance'] },
  { id: 'mantenimento', labels: ['mantenimento', 'maintenance'] },
  { id: 'junk', labels: ['junk', 'junk workout'] },
];

function asTrimmedString(value) {
  return String(value ?? '').trim();
}

/** Normalizza trainingGoal AI/UI → id questionario (ipertrofia|forza|…). */
export function normalizeTrainingGoalId(raw) {
  const s = asTrimmedString(raw).toLowerCase();
  if (!s) return '';
  const folded = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const exact = TRAINING_GOAL_ENTRIES.find(
    (g) => g.id === folded || g.id === s || g.labels.includes(folded) || g.labels.includes(s),
  );
  if (exact) return exact.id;
  if (folded.includes('ipertrof') || folded.includes('hypertroph')) return 'ipertrofia';
  if (folded.includes('forza') || folded.includes('strength')) return 'forza';
  if (folded.includes('resist') || folded.includes('endurance')) return 'resistenza';
  if (folded.includes('manten') || folded.includes('mainten')) return 'mantenimento';
  if (folded.includes('junk')) return 'junk';
  return '';
}

export function normalizeRpeValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 10) return null;
  return rounded;
}

function normalizeChatExercises(chatPayload) {
  const exercises = Array.isArray(chatPayload?.exercises) ? chatPayload.exercises : [];
  return exercises
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      exerciseName: asTrimmedString(item.exerciseName || item.name),
      sets: Number.isFinite(Number(item.sets)) && Number(item.sets) > 0
        ? Math.round(Number(item.sets))
        : null,
      reps: Number.isFinite(Number(item.reps)) && Number(item.reps) > 0
        ? Math.round(Number(item.reps))
        : null,
      weightKg: Number.isFinite(Number(item.weightKg ?? item.weight)) && Number(item.weightKg ?? item.weight) > 0
        ? Math.round(Number(item.weightKg ?? item.weight) * 10) / 10
        : null,
    }))
    .filter((item) => item.exerciseName);
}

/**
 * Formatta exercises[] nel formato workoutDetailNote nativo.
 * @param {Array<{ exerciseName: string, sets?: number|null, reps?: number|null, weightKg?: number|null }>} exercises
 * @returns {string}
 */
export function formatExercisesToWorkoutDetailNote(exercises = []) {
  return (Array.isArray(exercises) ? exercises : [])
    .map((exercise) => {
      const name = asTrimmedString(exercise?.exerciseName);
      if (!name) return '';
      const metricParts = [];
      const sets = Number(exercise?.sets);
      const reps = Number(exercise?.reps);
      const weightKg = Number(exercise?.weightKg);
      if (Number.isFinite(sets) && sets > 0 && Number.isFinite(reps) && reps > 0) {
        metricParts.push(`${sets}x${reps}`);
      } else if (Number.isFinite(sets) && sets > 0) {
        metricParts.push(`${sets} serie`);
      } else if (Number.isFinite(reps) && reps > 0) {
        metricParts.push(`${reps} reps`);
      }
      if (Number.isFinite(weightKg) && weightKg > 0) {
        metricParts.push(`${weightKg}kg`);
      }
      return metricParts.length ? `${name}: ${metricParts.join(' ')}` : name;
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Inferisce workoutType dal payload chat.
 * @param {object} chatPayload
 * @param {ReturnType<typeof normalizeChatExercises>} exercises
 * @returns {string}
 */
export function inferWorkoutTypeFromChatPayload(chatPayload, exercises = []) {
  const chatCylinder = String(chatPayload?.workoutType || '').trim().toLowerCase();
  if (['spinta', 'trazione', 'gambe', 'cardio', 'altro'].includes(chatCylinder)) {
    if (chatCylinder === 'altro') return 'misto';
    return chatCylinder;
  }

  const explicit = resolveWorkoutActivityTypeId(
    chatPayload?.workoutType ?? chatPayload?.activityType ?? chatPayload?.subType,
  );
  if (explicit) return explicit;

  const haystack = [
    chatPayload?.workoutName,
    ...exercises.map((item) => item.exerciseName),
  ]
    .map(asTrimmedString)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b(gambe|legs|lower|squat|leg\s*day)\b/.test(haystack)) return 'gambe';
  if (/\b(spinta|push|petto|spalle|tricipit|panca)\b/.test(haystack)) return 'spinta';
  if (/\b(trazione|pull|dorso|schiena|bicipit|trazioni)\b/.test(haystack)) return 'trazione';

  const hasStrengthMetrics = exercises.some(
    (item) => (item.sets != null && item.sets > 0)
      || (item.reps != null && item.reps > 0)
      || (item.weightKg != null && item.weightKg > 0),
  );
  if (hasStrengthMetrics) return 'pesi';

  // Carico cognitivo / lavoro prima delle euristiche fisiche.
  if (LAVORO_PC_KEYWORD_PATTERN.test(haystack)) return 'lavoro_pc';
  if (STUDIO_KEYWORD_PATTERN.test(haystack)) return 'studio';
  if (LAVORO_KEYWORD_PATTERN.test(haystack)) return 'lavoro';

  if (/\bhiit\b|circuito/i.test(haystack)) return 'hiit';
  if (CARDIO_KEYWORD_PATTERN.test(haystack)) return 'cardio';
  return 'misto';
}

/**
 * Converte il payload ADD_WORKOUT della chat nel formato nativo (log + timeline).
 * @param {object} chatPayload
 * @param {number} currentTimeDecimal — ora decimale (es. 18.25)
 * @returns {{ logItem: object, timelineNode: object }}
 */
export function mapChatWorkoutToNativePayload(chatPayload, currentTimeDecimal) {
  const exercises = normalizeChatExercises(chatPayload);
  const workoutName = asTrimmedString(chatPayload?.workoutName)
    || exercises.map((item) => item.exerciseName).join(', ')
    || 'Allenamento';

  const durationMinutes = Math.max(1, Math.round(Number(chatPayload?.durationMinutes) || 45));
  const duration = Math.max(0.25, Math.min(24, durationMinutes / 60));

  const parsedKcal = Number(chatPayload?.estimatedKcal);
  const kcal = Number.isFinite(parsedKcal) && parsedKcal >= 0
    ? Math.round(parsedKcal)
    : Math.round(durationMinutes * 6);

  const workoutType = inferWorkoutTypeFromChatPayload(chatPayload, exercises);
  const workoutDetailNote = formatExercisesToWorkoutDetailNote(exercises);
  const cylinderMuscles = {
    spinta: ['Petto', 'Spalle', 'Tricipiti'],
    trazione: ['Dorso', 'Bicipiti'],
    gambe: ['Gambe'],
  };
  const muscles = Array.isArray(cylinderMuscles[workoutType])
    ? [...cylinderMuscles[workoutType]]
    : [];
  const baseDesc = getWorkoutActivityLogDescription(
    ['spinta', 'trazione', 'gambe'].includes(workoutType) ? 'pesi' : workoutType,
    muscles,
  );
  const detailInline = workoutDetailNote.replace(/\n/g, '; ');
  let desc = baseDesc;
  if (workoutType === 'spinta' || workoutType === 'trazione' || workoutType === 'gambe') {
    desc = asTrimmedString(chatPayload?.workoutName) || `Allenamento ${workoutType}`;
  } else if (workoutType === 'misto' || workoutType === 'cardio' || workoutType === 'hiit') {
    desc = workoutName;
  } else if (workoutDetailNote && workoutActivityRequiresStrengthDetailNote(workoutType)) {
    desc = `${baseDesc} — ${detailInline}`;
  }

  const def = getWorkoutActivityTypeDef(
    ['spinta', 'trazione', 'gambe'].includes(workoutType) ? 'pesi' : workoutType,
  );
  const nodeKind = def?.nodeKind ?? 'workout';
  const isWork = nodeKind === 'work';
  const isCognitive = nodeKind === 'cognitive';
  const cognitiveKcal = isCognitive
    ? Math.round(getCognitiveMetForActivity(workoutType) * 70 * duration)
    : null;
  const finalKcal = isCognitive && cognitiveKcal != null ? cognitiveKcal : kcal;

  const id = isWork
    ? `cmd_work_${Date.now()}`
    : isCognitive
      ? `cmd_cognitive_${Date.now()}`
      : `cmd_workout_${Date.now()}`;
  const time = Number(currentTimeDecimal);
  if (!Number.isFinite(time)) {
    throw new Error('currentTimeDecimal non valido');
  }

  const trainingGoal = normalizeTrainingGoalId(
    chatPayload?.trainingGoal ?? chatPayload?.workoutGoal,
  );
  const rpe = normalizeRpeValue(chatPayload?.rpe);
  const progressionNote = asTrimmedString(
    chatPayload?.progressionNote ?? chatPayload?.notes,
  );

  const structuredPatch = {
    ...(trainingGoal
      ? {
          trainingGoal,
          workoutGoal: trainingGoal,
          questionnaire: {
            goal: trainingGoal,
            rpe: rpe ?? null,
            notes: progressionNote,
          },
        }
      : {}),
    ...(rpe != null ? { rpe } : {}),
    ...(progressionNote
      ? {
          progressionNote,
          note: progressionNote,
          details: progressionNote,
        }
      : {}),
  };

  // Se c'è solo RPE/note senza goal, aggiorna comunque questionnaire parziale.
  if (!trainingGoal && (rpe != null || progressionNote)) {
    structuredPatch.questionnaire = {
      goal: null,
      rpe: rpe ?? null,
      notes: progressionNote,
    };
  }

  const logItem = {
    id,
    type: 'workout',
    workoutType,
    desc,
    name: isCognitive ? desc : isWork ? 'Lavoro' : desc,
    kcal: finalKcal,
    cal: finalKcal,
    duration,
    ...(workoutDetailNote ? { workoutDetailNote } : {}),
    ...(exercises.length ? { exercises } : {}),
    ...structuredPatch,
  };

  const timelineNode = {
    id,
    type: isCognitive ? 'cognitive' : isWork ? 'work' : 'workout',
    time,
    duration,
    kcal: finalKcal,
    icon: isCognitive ? (def?.icon || '📚') : isWork ? '💼' : (def?.icon || '🏋️'),
    subType: workoutType,
    muscles,
    ...(workoutDetailNote ? { workoutDetailNote } : {}),
    ...structuredPatch,
  };

  return { logItem, timelineNode };
}
