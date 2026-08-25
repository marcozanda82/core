/**
 * Spillover Biomeccanico + Tracker Stimolo Settimanale (ipertrofia / frequenza).
 *
 * Scala: 100% = target ipertrofico settimanale (≈ 2 sessioni sul gruppo).
 * Una sessione primaria ≈ +50%. Contributo soggetto a decadimento giornaliero
 * (≈ −18%/giorno di età della sessione) entro la finestra mobile.
 */

/** Finestra mobile: sessioni oltre 7 giorni non contano più. */
export const MUSCLE_STIMULUS_WINDOW_DAYS = 7;

/** Guadagno per sessione primaria (1ª volta ≈ 50%, 2ª ≈ 100%). */
export const MUSCLE_SESSION_STIMULUS_PERCENT = 50;

/**
 * Frazione di contributo persa per ogni giorno di età della sessione (0.18 = −18%/g).
 * Giorno 0 = 100%; giorno 2 ≈ 67%; oltre la finestra il contributo è escluso a monte.
 */
export const MUSCLE_STIMULUS_DAILY_DECAY_FACTOR = 0.18;

/** Soglia "almeno uno stimolo" (stimolo parziale). */
export const MUSCLE_STIMULUS_PARTIAL_TOTAL = 50;

/** Soglia target ipertrofico settimanale (2× frequenza). */
export const MUSCLE_STIMULUS_OPTIMAL_TOTAL = 100;

/**
 * @deprecated Usa MUSCLE_STIMULUS_PARTIAL_TOTAL — soglia “toccato almeno una volta”.
 * Storicamente era 50; resta 50 per compatibilità dashboard.
 */
export const MUSCLE_STIMULUS_SUFFICIENT_TOTAL = MUSCLE_STIMULUS_PARTIAL_TOTAL;

/**
 * Matrice Spillover — valori in % di una sessione (primario = 50, sinergie proporzionali).
 * Chiavi IT: petto, schiena, gambe, spalle, braccia, core.
 */
export const muscleSpilloverMatrix = Object.freeze({
  petto: Object.freeze({ petto: 50, spalle: 20, braccia: 25 }),
  schiena: Object.freeze({ schiena: 50, spalle: 15, braccia: 25 }),
  gambe: Object.freeze({ gambe: 50, core: 30 }),
  spalle: Object.freeze({ spalle: 50, braccia: 20, core: 10 }),
  braccia: Object.freeze({ braccia: 50 }),
  core: Object.freeze({ core: 50 }),
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
 * Moltiplicatore residuo per età sessione (giorni interi ≥ 0).
 * @param {unknown} daysAgo
 * @returns {number} 0–1
 */
export function muscleStimulusAgeScale(daysAgo) {
  const age = Math.max(0, Math.floor(Number(daysAgo) || 0));
  if (age <= 0) return 1;
  const factor = Math.max(0, Math.min(0.95, Number(MUSCLE_STIMULUS_DAILY_DECAY_FACTOR) || 0));
  return Math.pow(1 - factor, age);
}

/**
 * Etichetta triage sismografo da percentuale 0–100.
 * @param {number} percent
 * @returns {'DA STIMOLARE'|'STIMOLO PARZIALE'|'STIMOLO OTTIMALE'}
 */
export function muscleStimulusTriageLabel(percent) {
  const p = Math.round(Number(percent) || 0);
  if (p >= MUSCLE_STIMULUS_OPTIMAL_TOTAL) return 'STIMOLO OTTIMALE';
  if (p >= MUSCLE_STIMULUS_PARTIAL_TOTAL) return 'STIMOLO PARZIALE';
  return 'DA STIMOLARE';
}

/**
 * Fase corta per prompt / telemetry.
 * @param {number} percent0to100
 * @returns {'inattivo'|'parziale'|'ottimale'}
 */
export function muscleStimulusTriagePhase(percent0to100) {
  const p = Math.round(Number(percent0to100) || 0);
  if (p >= MUSCLE_STIMULUS_OPTIMAL_TOTAL) return 'ottimale';
  if (p >= MUSCLE_STIMULUS_PARTIAL_TOTAL) return 'parziale';
  return 'inattivo';
}

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
 * Ogni sessione primaria aggiunge ≈50% (non 100%): serve la 2ª nella finestra per il MAX.
 * Il contributo è scalato per età: −MUSCLE_STIMULUS_DAILY_DECAY_FACTOR per ogni giorno trascorso.
 *
 * @param {Record<string, { direct: number, indirect: number, total: number }>} stimulus
 * @param {Iterable<string>} primaryKeys
 * @param {number} [daysAgo=0] giorni di calendario dalla sessione (0 = oggi)
 */
export function applySpilloverSession(stimulus, primaryKeys, daysAgo = 0) {
  const scale = muscleStimulusAgeScale(daysAgo);
  if (!(scale > 0)) return;

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
      const amount = (Number(pct) || 0) * scale;
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
 * Quanti pilastri (max 5) hanno total >= soglia (default: stimolo parziale / 1 sessione).
 * @param {Record<string, { total?: number }> | null | undefined} pillarStimulus
 * @param {number} [threshold]
 * @returns {{ count: number, ids: string[] }}
 */
export function countSufficientlyStimulatedPillars(
  pillarStimulus,
  threshold = MUSCLE_STIMULUS_PARTIAL_TOTAL,
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
 * Accumula stimolo da liste di primari (una lista = una sessione) e folda ai 5 pilastri.
 * @param {Iterable<Iterable<string>>} sessionPrimaryLists
 * @param {Iterable<number>} [daysAgoList] età opzionale allineata 1:1 alle sessioni
 * @returns {Record<string, { direct: number, indirect: number, total: number }>}
 */
export function accumulateWeeklyStimulusFromSessions(sessionPrimaryLists, daysAgoList = null) {
  const stimulus = createEmptyMuscleSpilloverStimulus();
  const ages = daysAgoList != null ? Array.from(daysAgoList) : null;
  let idx = 0;
  for (const primaries of sessionPrimaryLists || []) {
    if (!primaries) {
      idx += 1;
      continue;
    }
    const age = ages && Number.isFinite(Number(ages[idx])) ? Number(ages[idx]) : 0;
    applySpilloverSession(stimulus, primaries, age);
    idx += 1;
  }
  finalizeMuscleSpilloverTotals(stimulus);
  return foldSpilloverStimulusToPillars(stimulus);
}

/**
 * Pilastri % → livelli 0–1 per telemetria / sismografi (SSOT).
 * @param {Record<string, { total?: number }> | null | undefined} pillars
 * @returns {{ legs: number, chest: number, back_shoulders: number, arms: number, core: number }}
 */
export function pillarsStimulusToLevels01(pillars) {
  const map = pillars && typeof pillars === 'object' ? pillars : {};
  const to01 = (id) => {
    const total = Math.max(0, Math.min(100, Number(map[id]?.total) || 0));
    return Math.round(total) / 100;
  };
  return {
    legs: to01('legs'),
    chest: to01('chest'),
    back_shoulders: to01('back_shoulders'),
    arms: to01('arms'),
    core: to01('core'),
  };
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
