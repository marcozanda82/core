/**
 * Mappa chip → muscoli (peso 1 allenato, 0.5 coinvolto) — mm-1.
 * Puro: nessun I/O.
 */

import { normalizeMuscleGroupArray } from '../../../activityCatalog.js';
import { classifyWorkoutByType, workoutTypeId } from '../../commandTerminal/context/workoutMovement.js';
import { MUSCLE_IDS, MUSCLE_MAP_VERSION } from './muscleIds.mm-1.js';

export { MUSCLE_MAP_VERSION };

/**
 * @typedef {{ muscleId: string, weight: number }} MuscleWeight
 */

/** Chip catalogo (id normalizzati) → contributi. */
const CHIP_MAP = Object.freeze({
  Petto: Object.freeze([
    { muscleId: 'pettorali', weight: 1 },
    { muscleId: 'tricipiti', weight: 0.5 },
    { muscleId: 'deltoidi_anteriori', weight: 0.5 },
  ]),
  Dorso: Object.freeze([
    { muscleId: 'dorsali', weight: 1 },
    { muscleId: 'trapezi_romboidi', weight: 1 },
    { muscleId: 'bicipiti', weight: 0.5 },
    { muscleId: 'deltoidi_posteriori', weight: 0.5 },
    { muscleId: 'avambracci', weight: 0.5 },
    { muscleId: 'lombari', weight: 0.5 },
  ]),
  Spalle: Object.freeze([
    { muscleId: 'deltoidi_anteriori', weight: 1 },
    { muscleId: 'deltoidi_laterali', weight: 1 },
    { muscleId: 'deltoidi_posteriori', weight: 1 },
    { muscleId: 'tricipiti', weight: 0.5 },
    { muscleId: 'trapezi_romboidi', weight: 0.5 },
  ]),
  Gambe: Object.freeze([
    { muscleId: 'quadricipiti', weight: 1 },
    { muscleId: 'glutei', weight: 1 },
    { muscleId: 'femorali', weight: 0.5 },
    { muscleId: 'adduttori', weight: 0.5 },
    { muscleId: 'polpacci', weight: 0.5 },
    { muscleId: 'lombari', weight: 0.5 },
  ]),
  bicipiti: Object.freeze([
    { muscleId: 'bicipiti', weight: 1 },
    { muscleId: 'avambracci', weight: 0.5 },
  ]),
  tricipiti: Object.freeze([
    { muscleId: 'tricipiti', weight: 1 },
  ]),
  avambracci: Object.freeze([
    { muscleId: 'avambracci', weight: 1 },
  ]),
  abs: Object.freeze([
    { muscleId: 'addominali', weight: 1 },
    { muscleId: 'obliqui', weight: 1 },
  ]),
  Core: Object.freeze([
    { muscleId: 'addominali', weight: 1 },
    { muscleId: 'obliqui', weight: 1 },
    { muscleId: 'lombari', weight: 1 },
    { muscleId: 'glutei', weight: 0.5 },
  ]),
  'Total Body': Object.freeze(
    MUSCLE_IDS.map((muscleId) => Object.freeze({ muscleId, weight: 0.5 })),
  ),
});

/** Tipi strength senza chip → chip Gambe (stessa mappa). */
const TYPE_FALLBACK_CHIPS = Object.freeze({
  scale: ['Gambe'],
  alzate_sedia: ['Gambe'],
});

/**
 * Contributi di un singolo chip catalogo.
 * @param {string} chipId
 * @returns {readonly MuscleWeight[]}
 */
export function mapChipToMuscles(chipId) {
  const id = String(chipId || '').trim();
  if (!id) return Object.freeze([]);
  const hit = CHIP_MAP[id];
  if (hit) return hit;
  // Alias già normalizzati da activityCatalog; Schiena → Dorso
  if (/^schiena$/i.test(id)) return CHIP_MAP.Dorso;
  return Object.freeze([]);
}

/**
 * Merge pesi: se allenato e coinvolto nella stessa sessione, vale 1.
 * @param {Iterable<MuscleWeight>} contributions
 * @returns {Record<string, number>}
 */
export function mergeMuscleWeights(contributions) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const row of contributions || []) {
    const id = String(row?.muscleId || '').trim();
    const w = Number(row?.weight);
    if (!id || !Number.isFinite(w) || w <= 0) continue;
    const prev = out[id] || 0;
    out[id] = Math.max(prev, w >= 1 ? 1 : w);
  }
  for (const id of Object.keys(out)) {
    if (out[id] > 1) out[id] = 1;
  }
  return out;
}

/**
 * Chip effettivi di una sessione (muscoli registrati o fallback tipo).
 * @param {object | null | undefined} entry
 * @returns {string[]}
 */
export function resolveSessionChips(entry) {
  if (!entry || typeof entry !== 'object') return [];
  if (classifyWorkoutByType(entry).kind !== 'strength') return [];
  const raw = entry.muscles ?? entry.muscleGroups ?? entry.groups ?? [];
  const chips = normalizeMuscleGroupArray(Array.isArray(raw) ? raw : [raw]);
  if (chips.length > 0) return chips;
  const typeId = workoutTypeId(entry);
  const fallback = TYPE_FALLBACK_CHIPS[typeId];
  return fallback ? [...fallback] : [];
}

/**
 * Pesi muscolari di una sessione di forza (mm-1).
 * @param {object | null | undefined} entry
 * @returns {Record<string, number>}
 */
export function sessionMuscleWeights(entry) {
  const chips = resolveSessionChips(entry);
  if (chips.length === 0) return {};
  /** @type {MuscleWeight[]} */
  const rows = [];
  for (const chip of chips) {
    for (const row of mapChipToMuscles(chip)) rows.push(row);
  }
  return mergeMuscleWeights(rows);
}

/**
 * Lista muscoli allenati (peso === 1) in una sessione.
 * @param {object | null | undefined} entry
 * @returns {string[]}
 */
export function sessionTrainedMuscleIds(entry) {
  const weights = sessionMuscleWeights(entry);
  return Object.keys(weights).filter((id) => weights[id] >= 1).sort();
}

/** Snapshot per test: tutti i chip mappati. */
export function __chipMapKeysForTests() {
  return Object.keys(CHIP_MAP).sort();
}
