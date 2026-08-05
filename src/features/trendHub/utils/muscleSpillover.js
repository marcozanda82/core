/**
 * Spillover Biomeccanico — matrice e aggregazione stimolo muscolare.
 */

/** Soglia: gruppo considerato stimolato a sufficienza (direct + spillover). */
export const MUSCLE_STIMULUS_SUFFICIENT_TOTAL = 50;

/**
 * Matrice Spillover Biomeccanico — stimolo % su gruppi sinergici
 * quando si allena un primario multiarticolare.
 * Chiavi IT: petto, schiena, gambe, spalle, braccia, core.
 */
export const muscleSpilloverMatrix = Object.freeze({
  petto: Object.freeze({ petto: 100, spalle: 40, braccia: 50 }),
  schiena: Object.freeze({ schiena: 100, spalle: 30, braccia: 50 }),
  gambe: Object.freeze({ gambe: 100, core: 60 }),
  spalle: Object.freeze({ spalle: 100, braccia: 40, core: 20 }),
  braccia: Object.freeze({ braccia: 100 }),
  core: Object.freeze({ core: 100 }),
});

/** @typedef {'petto'|'schiena'|'gambe'|'spalle'|'braccia'|'core'} SpilloverMuscleKey */

/** @type {readonly SpilloverMuscleKey[]} */
export const SPILLOVER_MUSCLE_KEYS = Object.freeze([
  'petto',
  'schiena',
  'gambe',
  'spalle',
  'braccia',
  'core',
]);

/**
 * Bucket vuoto direct/indirect/total per ogni chiave spillover.
 * @returns {Record<SpilloverMuscleKey, { direct: number, indirect: number, total: number }>}
 */
export function createEmptyMuscleSpilloverStimulus() {
  /** @type {Record<string, { direct: number, indirect: number, total: number }>} */
  const out = {};
  for (const key of SPILLOVER_MUSCLE_KEYS) {
    out[key] = { direct: 0, indirect: 0, total: 0 };
  }
  return /** @type {Record<SpilloverMuscleKey, { direct: number, indirect: number, total: number }>} */ (out);
}

/**
 * Mappa chip/label workout → chiave primaria spillover (IT).
 * @param {string} label
 * @returns {SpilloverMuscleKey | 'total' | null}
 */
export function resolveSpilloverMuscleKey(label) {
  const key = String(label || '').trim().toLowerCase();
  if (!key) return null;
  if (key.includes('total') && key.includes('body')) return 'total';
  if (key === 'full body' || key === 'fullbody' || key === 'totalbody') return 'total';
  if (key === 'petto' || key === 'chest' || key === 'torace') return 'petto';
  if (key === 'schiena' || key === 'dorso' || key === 'back') return 'schiena';
  if (key === 'gambe' || key === 'legs' || key === 'lower') return 'gambe';
  if (key === 'spalle' || key === 'shoulders' || key === 'deltoid') return 'spalle';
  if (
    key === 'braccia'
    || key === 'arms'
    || key === 'bicipiti'
    || key === 'bicipite'
    || key === 'tricipiti'
    || key === 'tricipite'
    || key === 'avambracci'
    || key === 'avambraccio'
  ) return 'braccia';
  if (key === 'core' || key === 'abs' || key === 'addominali' || key === 'addome') return 'core';
  return null;
}

/**
 * Applica una sessione (insieme di primari allenati) allo stimolo accumulato.
 * @param {Record<string, { direct: number, indirect: number, total: number }>} stimulus
 * @param {Iterable<string>} primaryKeys
 */
export function applySpilloverSession(stimulus, primaryKeys) {
  const primaries = new Set();
  for (const raw of primaryKeys) {
    const resolved = resolveSpilloverMuscleKey(raw);
    const key = resolved
      || (SPILLOVER_MUSCLE_KEYS.includes(/** @type {SpilloverMuscleKey} */ (raw)) ? raw : null);
    if (!key) continue;
    if (key === 'total') {
      SPILLOVER_MUSCLE_KEYS.forEach((k) => primaries.add(k));
    } else {
      primaries.add(key);
    }
  }

  for (const primary of primaries) {
    const row = muscleSpilloverMatrix[primary];
    if (!row) continue;
    for (const [target, pct] of Object.entries(row)) {
      const amount = Number(pct) || 0;
      if (!(amount > 0) || !stimulus[target]) continue;
      if (target === primary) {
        stimulus[target].direct += amount;
      } else {
        stimulus[target].indirect += amount;
      }
    }
  }
}

/**
 * Ricalcola total = min(100, direct + indirect) su ogni bucket.
 * @param {Record<string, { direct: number, indirect: number, total: number }>} stimulus
 */
export function finalizeMuscleSpilloverTotals(stimulus) {
  for (const key of Object.keys(stimulus)) {
    const bucket = stimulus[key];
    if (!bucket) continue;
    const direct = Math.max(0, Number(bucket.direct) || 0);
    const indirect = Math.max(0, Number(bucket.indirect) || 0);
    bucket.direct = Math.min(100, Math.round(direct * 10) / 10);
    bucket.indirect = Math.min(100, Math.round(indirect * 10) / 10);
    bucket.total = Math.min(100, Math.round((bucket.direct + bucket.indirect) * 10) / 10);
  }
  return stimulus;
}

/**
 * Fold 6 chiavi IT → 5 pilastri cilindro (schiena+spalle → back_shoulders).
 * @param {Record<string, { direct: number, indirect: number, total: number }>} stimulus
 * @returns {Record<string, { direct: number, indirect: number, total: number }>}
 */
export function foldSpilloverStimulusToPillars(stimulus = {}) {
  const s = stimulus && typeof stimulus === 'object' ? stimulus : {};
  const empty = () => ({ direct: 0, indirect: 0, total: 0 });
  const petto = s.petto || empty();
  const gambe = s.gambe || empty();
  const braccia = s.braccia || empty();
  const core = s.core || empty();
  const schiena = s.schiena || empty();
  const spalle = s.spalle || empty();

  const back = {
    direct: (Number(schiena.direct) || 0) + (Number(spalle.direct) || 0),
    indirect: (Number(schiena.indirect) || 0) + (Number(spalle.indirect) || 0),
    total: 0,
  };

  const pillars = {
    chest: { ...petto },
    legs: { ...gambe },
    arms: { ...braccia },
    core: { ...core },
    back_shoulders: back,
  };
  return finalizeMuscleSpilloverTotals(pillars);
}

/**
 * Quanti pilastri (max 5) hanno total >= soglia.
 * @param {Record<string, { total?: number }> | null | undefined} pillarStimulus
 * @param {number} [threshold]
 * @returns {{ count: number, ids: string[] }}
 */
export function countSufficientlyStimulatedPillars(
  pillarStimulus,
  threshold = MUSCLE_STIMULUS_SUFFICIENT_TOTAL,
) {
  const ids = [];
  const map = pillarStimulus && typeof pillarStimulus === 'object' ? pillarStimulus : {};
  for (const id of ['legs', 'chest', 'back_shoulders', 'arms', 'core']) {
    const total = Number(map[id]?.total) || 0;
    if (total >= threshold) ids.push(id);
  }
  return { count: ids.length, ids };
}

/**
 * Quote barra (direct pieno + indirect opaco) che non superano 100%.
 * @param {{ direct?: number, indirect?: number, total?: number } | null | undefined} bucket
 * @returns {{ directPercent: number, indirectPercent: number, totalPercent: number }}
 */
export function muscleStimulusBarSegments(bucket) {
  const direct = Math.max(0, Number(bucket?.direct) || 0);
  const indirect = Math.max(0, Number(bucket?.indirect) || 0);
  const directPercent = Math.min(100, Math.round(direct));
  const indirectPercent = Math.min(100 - directPercent, Math.round(indirect));
  const totalPercent = Math.min(100, directPercent + indirectPercent);
  return { directPercent, indirectPercent, totalPercent };
}
