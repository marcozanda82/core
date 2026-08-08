/**
 * Modello ad Accumulo Dinamico — stimolo muscolare (sismografi + grafico linee).
 *
 * Single Source of Truth: boost sessione + decadimento non-lineare 7gg.
 * Nessun reset a mezzanotte: ogni hit decade lungo la curva fino a 0.
 */

/** Punti % aggiunti da una sessione su un pilastro. */
export const HYPERTROPHY_SESSION_BOOST = 65;

/** Cap assoluto dello stato muscolare. */
export const HYPERTROPHY_STIMULUS_CAP = 100;

/**
 * Sottrazioni giornaliere cumulative dopo l'allenamento (totale = 65).
 * Index 0 = Giorno 1 (−5), … index 6 = Giorno 7 (−4 → residuo 0).
 * @type {readonly number[]}
 */
export const HYPERTROPHY_DAILY_DECAY = Object.freeze([5, 9, 13, 14, 12, 8, 4]);

/** Giorni oltre i quali un hit non contribuisce più (lunghezza curva). */
export const HYPERTROPHY_DECAY_HORIZON_DAYS = HYPERTROPHY_DAILY_DECAY.length;

/** Soglia triage: ≤15 → DA STIMOLARE. */
export const HYPERTROPHY_TRIAGE_STIMULATE_MAX = 15;

/** Soglia triage: 16–80 → IN RECUPERO; >80 → STIMOLO OTTIMALE. */
export const HYPERTROPHY_TRIAGE_RECOVERY_MAX = 80;

/** @type {readonly string[]} */
export const HYPERTROPHY_PILLAR_IDS = Object.freeze([
  'legs',
  'chest',
  'back_shoulders',
  'arms',
  'core',
]);

/** Spillover IT / alias → pilastro cilindro. */
const SPILLOVER_TO_PILLAR = Object.freeze({
  petto: 'chest',
  chest: 'chest',
  gambe: 'legs',
  legs: 'legs',
  braccia: 'arms',
  arms: 'arms',
  core: 'core',
  abs: 'core',
  schiena: 'back_shoulders',
  spalle: 'back_shoulders',
  back_shoulders: 'back_shoulders',
  back: 'back_shoulders',
  shoulders: 'back_shoulders',
});

/**
 * @param {string} iso
 * @returns {{ y: number, m: number, d: number } | null}
 */
function parseIsoParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').slice(0, 10));
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/**
 * Giorni di calendario UTC tra due ISO (to − from).
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number | null}
 */
export function hypertrophyDiffCalendarDays(fromIso, toIso) {
  const a = parseIsoParts(fromIso);
  const b = parseIsoParts(toIso);
  if (!a || !b) return null;
  const fromMs = Date.UTC(a.y, a.m - 1, a.d);
  const toMs = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((toMs - fromMs) / 86400000);
}

/**
 * Residuo % di un singolo allenamento dopo `daysElapsed` giorni interi.
 * Giorno 0 (giorno sessione) = 65; dopo 7 giorni di curva = 0.
 *
 * @param {number} daysElapsed
 * @returns {number}
 */
export function hypertrophySessionResidual(daysElapsed) {
  const days = Math.floor(Number(daysElapsed));
  if (!Number.isFinite(days) || days < 0) return 0;
  if (days === 0) return HYPERTROPHY_SESSION_BOOST;
  if (days >= HYPERTROPHY_DECAY_HORIZON_DAYS) return 0;

  let value = HYPERTROPHY_SESSION_BOOST;
  for (let i = 0; i < days; i += 1) {
    value -= HYPERTROPHY_DAILY_DECAY[i];
  }
  return Math.max(0, value);
}

/**
 * Mappa primari spillover / label → set di pilastri (dedupe per sessione).
 * @param {Iterable<string> | null | undefined} primaryKeys
 * @returns {Set<string>}
 */
export function mapSessionPrimariesToPillars(primaryKeys) {
  /** @type {Set<string>} */
  const pillars = new Set();
  for (const raw of primaryKeys || []) {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) continue;
    if (key === 'total' || key === 'full_body' || key === 'fullbody') {
      HYPERTROPHY_PILLAR_IDS.forEach((id) => pillars.add(id));
      continue;
    }
    const pillar = SPILLOVER_TO_PILLAR[key];
    if (pillar) pillars.add(pillar);
  }
  return pillars;
}

/**
 * Stimolo % per un pilastro: somma residui degli hit, cap 100.
 *
 * @param {Iterable<string>} sessionDates ISO YYYY-MM-DD (un entry = una sessione su quel pilastro)
 * @param {string} asOfDate
 * @returns {number} 0–100
 */
export function computePillarStimulusPercent(sessionDates, asOfDate) {
  const asOf = String(asOfDate || '').slice(0, 10);
  let total = 0;
  for (const raw of sessionDates || []) {
    const date = String(raw || '').slice(0, 10);
    const elapsed = hypertrophyDiffCalendarDays(date, asOf);
    if (elapsed == null || elapsed < 0) continue;
    total += hypertrophySessionResidual(elapsed);
  }
  return Math.min(HYPERTROPHY_STIMULUS_CAP, Math.round(total));
}

/**
 * Livelli 0–1 per i 5 pilastri alla data `asOfDate`.
 *
 * @param {Map<string, string[][]> | Record<string, string[][]>} sessionPrimariesByDate
 *   chiave = ISO giorno, valore = lista sessioni (ognuna = array primari spillover)
 * @param {string} asOfDate
 * @returns {{ legs: number, chest: number, back_shoulders: number, arms: number, core: number }}
 */
export function computeHypertrophyLevels01(sessionPrimariesByDate, asOfDate) {
  /** @type {Record<string, string[]>} */
  const hitsByPillar = {
    legs: [],
    chest: [],
    back_shoulders: [],
    arms: [],
    core: [],
  };

  const asOf = String(asOfDate || '').slice(0, 10);
  const entries = sessionPrimariesByDate instanceof Map
    ? sessionPrimariesByDate.entries()
    : Object.entries(sessionPrimariesByDate || {});

  for (const [dateRaw, daySessions] of entries) {
    const date = String(dateRaw || '').slice(0, 10);
    const elapsed = hypertrophyDiffCalendarDays(date, asOf);
    if (elapsed == null || elapsed < 0 || elapsed >= HYPERTROPHY_DECAY_HORIZON_DAYS) {
      continue;
    }
    for (const primaries of daySessions || []) {
      const pillars = mapSessionPrimariesToPillars(primaries);
      for (const pillar of pillars) {
        if (hitsByPillar[pillar]) hitsByPillar[pillar].push(date);
      }
    }
  }

  const pct = (id) => computePillarStimulusPercent(hitsByPillar[id], asOf);
  return {
    legs: pct('legs') / 100,
    chest: pct('chest') / 100,
    back_shoulders: pct('back_shoulders') / 100,
    arms: pct('arms') / 100,
    core: pct('core') / 100,
  };
}

/**
 * Etichetta triage dinamico (barre Progressione).
 * @param {number} percent 0–100
 * @returns {'DA STIMOLARE'|'IN RECUPERO'|'STIMOLO OTTIMALE'}
 */
export function hypertrophyTriageLabel(percent) {
  const p = Math.round(Number(percent) || 0);
  if (p > HYPERTROPHY_TRIAGE_RECOVERY_MAX) return 'STIMOLO OTTIMALE';
  if (p > HYPERTROPHY_TRIAGE_STIMULATE_MAX) return 'IN RECUPERO';
  return 'DA STIMOLARE';
}

/**
 * Tone triage allineato alle soglie % (0–15 / 16–80 / >80).
 * @param {number} percent0to100
 * @returns {'critical'|'warning'|'good'}
 */
export function hypertrophyTriageTone(percent0to100) {
  const p = Math.round(Number(percent0to100) || 0);
  if (p > HYPERTROPHY_TRIAGE_RECOVERY_MAX) return 'good';
  if (p > HYPERTROPHY_TRIAGE_STIMULATE_MAX) return 'warning';
  return 'critical';
}
