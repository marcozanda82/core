/**
 * Lettura unica di una sessione di diario.
 * Il tipo (workoutType) decide. L'etichetta serve solo se il tipo non dice niente.
 * La durata esplicita (durationMinutes) vince. Altrimenti vale la regola storica:
 * un numero sopra 5 è già in minuti, altrimenti è in ore.
 */

import { normalizeMuscleGroupArray } from '../../../activityCatalog.js';
import { resolveSpilloverMuscleKey } from '../../trendHub/utils/muscleSpillover.js';

export const VIGOROUS_EQUIVALENT_FACTOR = 2;

const WALK_TYPE_IDS = new Set([
  'camminata',
  'walking',
  'passi',
  'walk',
  'passeggio',
  'liss',
  'zona2',
  'z2',
]);

const VIGOROUS_TYPE_IDS = new Set([
  'corsa',
  'running',
  'run',
  'jog',
  'jogging',
  'bici',
  'bike',
  'cycling',
  'ciclismo',
  'cyclette',
  'spinning',
  'indoor_bike',
  'nuoto',
  'swim',
  'swimming',
  'cardio',
  'hiit',
  'ellittica',
  'elliptical',
  'remo',
  'rowing',
  'rower',
  'tapis',
  'tapis_roulant',
  'treadmill',
]);

const STRENGTH_TYPE_IDS = new Set([
  'pesi',
  'corpo_libero',
  'elastici',
  'lavori_pesanti',
  'scale',
  'alzate_sedia',
  'spinta',
  'trazione',
  'gambe',
  'push',
  'pull',
  'legs',
  'strength',
  'hypertrophy',
  'ipertrofia',
  'forza',
]);

/** Senza muscoli registrati, scale e alzate restano sulle gambe. */
const STRENGTH_TYPE_PRIMARIES = Object.freeze({
  scale: ['gambe'],
  alzate_sedia: ['gambe'],
});

const STRENGTH_LABEL = /(?:^|[^a-z0-9àèéìòù])(pesi|palestra|squat|corpo libero|elastici|lavori pesanti|scale|alzate|bicipit|tricipit|sollevamento|manubri|bilanciere|strength|ipertrof|forza)(?:[^a-z0-9àèéìòù]|$)/i;
const WALK_LABEL = /(?:^|[^a-z0-9àèéìòù])(camminat\p{L}*|passeggiat\p{L}*|walking|walk)(?=[^a-z0-9àèéìòù]|$)/iu;
const VIGOROUS_LABEL = /(?:^|[^a-z0-9àèéìòù])(hiit|corsa|running|jog\p{L}*|bici|bike|cicl\p{L}*|nuoto|swim\p{L}*|ellitt\p{L}*|cardio|remo|rowing|rower|tapis|treadmill|cyclette|spinning)(?=[^a-z0-9àèéìòù]|$)/iu;

/**
 * Minuti da un numero grezzo. Sopra 5 sono minuti, altrimenti ore.
 * @param {unknown} amount
 * @returns {number}
 */
export function durationAmountToMinutes(amount) {
  const dur = Number(amount);
  if (!Number.isFinite(dur) || dur <= 0) return 0;
  return dur > 5 ? dur : dur * 60;
}

/**
 * Minuti di una sessione. durationMinutes (o durationMin) vince sul campo duration.
 * @param {object | number | null | undefined} entry
 * @returns {number}
 */
export function resolveWorkoutDurationMinutes(entry) {
  if (typeof entry === 'number') return durationAmountToMinutes(entry);
  if (!entry || typeof entry !== 'object') return 0;
  const explicit = Number(entry.durationMinutes ?? entry.durationMin);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return durationAmountToMinutes(entry.duration ?? entry.minutes ?? entry.hours);
}

/**
 * @param {object | null | undefined} entry
 * @returns {string}
 */
export function workoutTypeId(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const candidates = [entry.workoutType, entry.subType, entry.activityType];
  if (typeof entry.activity === 'string') candidates.push(entry.activity);
  for (const raw of candidates) {
    const id = String(raw || '').trim().toLowerCase();
    if (id && id !== 'workout' && id !== 'activity') return id;
  }
  return '';
}

function workoutLabel(entry) {
  return String(entry?.name || entry?.desc || entry?.label || entry?.title || '').trim();
}

/**
 * @param {object | null | undefined} entry
 * @returns {{ kind: 'walk' | 'vigorous' | 'strength' | 'other', typeId: string, source: 'workoutType' | 'label' | 'none' }}
 */
export function classifyWorkoutByType(entry) {
  const typeId = workoutTypeId(entry);
  if (WALK_TYPE_IDS.has(typeId)) return { kind: 'walk', typeId, source: 'workoutType' };
  if (VIGOROUS_TYPE_IDS.has(typeId)) return { kind: 'vigorous', typeId, source: 'workoutType' };
  if (STRENGTH_TYPE_IDS.has(typeId)) return { kind: 'strength', typeId, source: 'workoutType' };

  const label = workoutLabel(entry);
  if (!label) return { kind: 'other', typeId, source: 'none' };
  if (STRENGTH_LABEL.test(label)) return { kind: 'strength', typeId, source: 'label' };
  if (WALK_LABEL.test(label)) return { kind: 'walk', typeId, source: 'label' };
  if (VIGOROUS_LABEL.test(label)) return { kind: 'vigorous', typeId, source: 'label' };
  return { kind: 'other', typeId, source: 'label' };
}

/**
 * Minuti aerobici equivalenti: camminata ×1, vigoroso ×2, pesi esclusi.
 * @param {object | null | undefined} entry
 * @returns {number}
 */
export function equivalentAerobicMinutes(entry) {
  const minutes = resolveWorkoutDurationMinutes(entry);
  if (!(minutes > 0)) return 0;
  const kind = classifyWorkoutByType(entry).kind;
  if (kind === 'walk') return minutes;
  if (kind === 'vigorous') return minutes * VIGOROUS_EQUIVALENT_FACTOR;
  return 0;
}

/**
 * Primari dello stimolo (chiavi spillover) di una sessione di forza.
 * Una camminata o una corsa non alimentano i distretti.
 * @param {object | null | undefined} entry
 * @returns {string[]}
 */
export function strengthSessionPrimaries(entry) {
  if (classifyWorkoutByType(entry).kind !== 'strength') return [];
  const raw = entry?.muscles ?? entry?.muscleGroups ?? entry?.groups ?? [];
  const labels = normalizeMuscleGroupArray(Array.isArray(raw) ? raw : [raw]);
  const primaries = [];
  for (const label of labels) {
    const key = resolveSpilloverMuscleKey(label);
    if (key) primaries.push(key);
  }
  if (primaries.length > 0) return [...new Set(primaries)];
  const fallback = STRENGTH_TYPE_PRIMARIES[workoutTypeId(entry)];
  return fallback ? [...fallback] : [];
}
