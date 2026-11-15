/**
 * @deprecated mm-1 / Costanza — non usare per nuovi calcoli.
 * Thin compat: livelli pilastro da costanza; triage labels ancora usati in UI legacy.
 *
 * Preferire: `src/features/kentuFocus/costanza/`.
 */

import { computeCostanzaPillarLevels01 } from '../features/kentuFocus/costanza/costanzaForza.js';

/** @deprecated */
export const HYPERTROPHY_SESSION_BOOST = 65;
/** @deprecated */
export const HYPERTROPHY_STIMULUS_CAP = 100;
/** @deprecated */
export const HYPERTROPHY_DAILY_DECAY = Object.freeze([5, 9, 13, 14, 12, 8, 4]);
/** @deprecated */
export const HYPERTROPHY_DECAY_HORIZON_DAYS = HYPERTROPHY_DAILY_DECAY.length;
export const HYPERTROPHY_TRIAGE_STIMULATE_MAX = 15;
export const HYPERTROPHY_TRIAGE_RECOVERY_MAX = 80;

/** @type {readonly string[]} */
export const HYPERTROPHY_PILLAR_IDS = Object.freeze([
  'legs',
  'chest',
  'back_shoulders',
  'arms',
  'core',
]);

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

function warnDeprecated(fn) {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(`[hypertrophyMath] ${fn} is deprecated — use costanza mm-1`);
  }
}

/**
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number | null}
 */
export function hypertrophyDiffCalendarDays(fromIso, toIso) {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fromIso || '').slice(0, 10));
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(toIso || '').slice(0, 10));
  if (!a || !b) return null;
  const fromMs = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const toMs = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((toMs - fromMs) / 86400000);
}

/** @deprecated residuo +65 — non SSOT; ritorna 0 fuori orizzonte per non rompere import. */
export function hypertrophySessionResidual(daysElapsed) {
  warnDeprecated('hypertrophySessionResidual');
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

/** @deprecated */
export function computePillarStimulusPercent(sessionDates, asOfDate) {
  warnDeprecated('computePillarStimulusPercent');
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
 * Livelli 0–1: ora Costanza mm-1 (non più +65/7gg).
 * Accetta ancora la firma legacy (Map sessioni, asOf) ma se `fullHistory` è passato
 * come primo argomento oggetto plain senza Map, usa costanza direttamente.
 *
 * @param {Map|Record|object} sessionPrimariesByDateOrHistory
 * @param {string} [asOfDate]
 * @returns {{ legs: number, chest: number, back_shoulders: number, arms: number, core: number }}
 */
export function computeHypertrophyLevels01(sessionPrimariesByDateOrHistory, asOfDate) {
  warnDeprecated('computeHypertrophyLevels01');
  const asOf = String(asOfDate || '').slice(0, 10);

  // Path Costanza: se sembra un fullHistory (chiavi trackerStorico_*)
  if (
    sessionPrimariesByDateOrHistory
    && typeof sessionPrimariesByDateOrHistory === 'object'
    && !(sessionPrimariesByDateOrHistory instanceof Map)
  ) {
    const keys = Object.keys(sessionPrimariesByDateOrHistory);
    if (keys.some((k) => k.startsWith('trackerStorico_'))) {
      return computeCostanzaPillarLevels01({
        fullHistory: sessionPrimariesByDateOrHistory,
        asOfDate: asOf,
      });
    }
  }

  // Compat Map sessioni → ricostruisce livelli grezzi da primari (status-like)
  /** @type {Record<string, number>} */
  const hits = {
    legs: 0,
    chest: 0,
    back_shoulders: 0,
    arms: 0,
    core: 0,
  };
  const entries = sessionPrimariesByDateOrHistory instanceof Map
    ? sessionPrimariesByDateOrHistory.entries()
    : Object.entries(sessionPrimariesByDateOrHistory || {});

  for (const [dateRaw, daySessions] of entries) {
    const date = String(dateRaw || '').slice(0, 10);
    const elapsed = hypertrophyDiffCalendarDays(date, asOf);
    if (elapsed == null || elapsed < 0 || elapsed > 6) continue;
    for (const primaries of daySessions || []) {
      const pillars = mapSessionPrimariesToPillars(primaries);
      for (const pillar of pillars) {
        if (hits[pillar] != null) {
          hits[pillar] = Math.max(hits[pillar], elapsed === 0 ? 1 : 0.4);
        }
      }
    }
  }
  return hits;
}

export function hypertrophyTriageLabel(percent) {
  const p = Math.round(Number(percent) || 0);
  if (p > HYPERTROPHY_TRIAGE_RECOVERY_MAX) return 'STIMOLO OTTIMALE';
  if (p > HYPERTROPHY_TRIAGE_STIMULATE_MAX) return 'IN RECUPERO';
  return 'DA STIMOLARE';
}

export function hypertrophyTriageTone(percent0to100) {
  const p = Math.round(Number(percent0to100) || 0);
  if (p > HYPERTROPHY_TRIAGE_RECOVERY_MAX) return 'good';
  if (p > HYPERTROPHY_TRIAGE_STIMULATE_MAX) return 'warning';
  return 'critical';
}

export { computeCostanzaPillarLevels01 };
