/**
 * SSOT target kcal del giorno — Home, Meal Engine, Focus, salvavita, AI, baseline.
 *
 * total = base + burnCounted + strategy + compensation + autopilot
 * Lookback Autopilota: base + burnCounted (senza compensazione/autopilota).
 *
 * Affidabilità burn:
 *   device (Health Connect, futuro) → 100%
 *   user (inserite) → 75%
 *   estimated (default / chat / AI / legacy senza fonte) → 50%
 */

import { computeEffectiveDailyTargetKcal } from './computeEffectiveDailyTargetKcal.js';
import { resolveTargetsForAnalysisDate } from '../kentuFocus/server/reader/resolveFocusProfileData.js';

export const DAY_TARGET_RULES_VERSION = 'dtr-1';

/** Allineato a lastWorkoutMemory.DEFAULT_WORKOUT_KCAL (evita import pesanti nei test puri). */
export const DEFAULT_WORKOUT_KCAL = 300;

export const KCAL_SOURCE = Object.freeze({
  DEVICE: 'device',
  USER: 'user',
  ESTIMATED: 'estimated',
});

/** Fattori di conteggio sul burn grezzo. */
export const KCAL_SOURCE_FACTOR = Object.freeze({
  [KCAL_SOURCE.DEVICE]: 1,
  [KCAL_SOURCE.USER]: 0.75,
  [KCAL_SOURCE.ESTIMATED]: 0.5,
});

const WORKOUTISH = new Set(['workout', 'cognitive', 'work']);

function roundKcal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Inferisce la fonte. Oggi non distinguiamo in modo affidabile «inserite» vs «stimate AI»
 * sullo storico: senza `kcalSource` esplicito → estimated.
 * @param {object|null|undefined} workout
 * @returns {'device'|'user'|'estimated'}
 */
export function inferKcalSource(workout) {
  const raw = String(workout?.kcalSource || workout?.kcal_source || '').trim().toLowerCase();
  if (raw === KCAL_SOURCE.DEVICE || raw === 'health_connect' || raw === 'healthconnect') {
    return KCAL_SOURCE.DEVICE;
  }
  if (raw === KCAL_SOURCE.USER || raw === 'manual' || raw === 'entered') {
    return KCAL_SOURCE.USER;
  }
  if (raw === KCAL_SOURCE.ESTIMATED || raw === 'estimate' || raw === 'ai' || raw === 'default') {
    return KCAL_SOURCE.ESTIMATED;
  }
  // Legacy / chat / default 300: non c'è segnale affidabile di edit manuale.
  return KCAL_SOURCE.ESTIMATED;
}

/**
 * @param {'device'|'user'|'estimated'|string} source
 * @returns {number}
 */
export function kcalSourceFactor(source) {
  const key = String(source || '').trim().toLowerCase();
  if (key === KCAL_SOURCE.DEVICE) return KCAL_SOURCE_FACTOR[KCAL_SOURCE.DEVICE];
  if (key === KCAL_SOURCE.USER) return KCAL_SOURCE_FACTOR[KCAL_SOURCE.USER];
  return KCAL_SOURCE_FACTOR[KCAL_SOURCE.ESTIMATED];
}

/**
 * @param {object|null|undefined} workout
 * @returns {{ raw: number, counted: number, source: string, factor: number }}
 */
export function countWorkoutBurnKcal(workout) {
  const raw = Math.max(0, roundKcal(workout?.kcal ?? workout?.cal ?? workout?.estimatedKcal));
  const source = inferKcalSource(workout);
  const factor = kcalSourceFactor(source);
  return {
    raw,
    counted: Math.max(0, Math.round(raw * factor)),
    source,
    factor,
  };
}

/**
 * @param {Iterable<object>|null|undefined} log
 * @returns {{
 *   burnRaw: number,
 *   burnCounted: number,
 *   sessions: Array<{ id: string, raw: number, counted: number, source: string }>,
 *   dominantSource: string,
 * }}
 */
export function sumWorkoutBurnFromLog(log) {
  const sessions = [];
  let burnRaw = 0;
  let burnCounted = 0;
  const list = Array.isArray(log) ? log : [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const type = String(entry.type || '').trim().toLowerCase();
    if (type && !WORKOUTISH.has(type)) continue;
    // Solo sessioni con kcal/allenamento fisico: cognitive/work contano se hanno kcal.
    const hasKcal = entry.kcal != null || entry.cal != null || entry.estimatedKcal != null;
    if (type !== 'workout' && !hasKcal) continue;
    if (type !== 'workout' && type !== 'cognitive') continue;
    const counted = countWorkoutBurnKcal(entry);
    if (counted.raw <= 0 && type !== 'workout') continue;
    burnRaw += counted.raw;
    burnCounted += counted.counted;
    sessions.push({
      id: String(entry.id || ''),
      raw: counted.raw,
      counted: counted.counted,
      source: counted.source,
    });
  }
  let dominantSource = KCAL_SOURCE.ESTIMATED;
  if (sessions.some((s) => s.source === KCAL_SOURCE.DEVICE)) dominantSource = KCAL_SOURCE.DEVICE;
  else if (sessions.some((s) => s.source === KCAL_SOURCE.USER)) dominantSource = KCAL_SOURCE.USER;
  return { burnRaw, burnCounted, sessions, dominantSource };
}

function dayNode(fullHistory, date) {
  if (!fullHistory || typeof fullHistory !== 'object' || !date) return null;
  return fullHistory[`trackerStorico_${date}`] || null;
}

function dayLog(fullHistory, date) {
  const node = dayNode(fullHistory, date);
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node.log)) return node.log;
  if (node.dati && typeof node.dati === 'object' && Array.isArray(node.dati.log)) return node.dati.log;
  return [];
}

function readSnapshot(fullHistory, date) {
  const node = dayNode(fullHistory, date);
  const snap = node?.dayTargetSnapshot;
  if (!snap || typeof snap !== 'object') return null;
  if (!Number.isFinite(Number(snap.total))) return null;
  return snap;
}

/**
 * Target del giorno senza compensazione Autopilota (per lookback banca calorie).
 * = base + burnCounted (+ strategy se presente).
 */
export function resolveLookbackDayTargetKcal(input = {}) {
  const resolved = resolveDayTargetKcal({
    ...input,
    includeAutopilot: false,
    includeCompensation: false,
  });
  return resolved.total;
}

/**
 * Base impostazioni storica per una data: solo targetHistory datata ≤ date.
 * Nessun merge da targets.baseKcal/kcal «correnti» e nessun fallback numerico.
 * @param {{
 *   date?: string|null,
 *   settingsBaseKcal?: number|null,
 *   userTargets?: object|null,
 *   profile_targets?: object|null,
 *   targets?: object|null,
 * }} input
 * @returns {{ base: number|null, source: string|null }}
 */
export function resolveSettingsBaseKcalForDate(input = {}) {
  const explicit = roundKcal(input.settingsBaseKcal);
  if (explicit > 0) {
    return { base: explicit, source: 'settingsBaseKcal' };
  }
  const date = String(input.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { base: null, source: null };
  }
  const targetsNode = input.targets
    || input.profile_targets?.targets
    || (input.userTargets?.targetHistory ? input.userTargets : null)
    || null;
  const { resolved, timelineApplied, lastEffectiveDate } = resolveTargetsForAnalysisDate(
    targetsNode,
    date,
  );
  if (timelineApplied > 0) {
    // Allineato ai keyFact score: «base» = kcal storica (non targets.baseKcal corrente).
    const fromHistory = roundKcal(resolved.kcal ?? resolved.targetKcal);
    if (fromHistory > 0) {
      return {
        base: fromHistory,
        source: `targetHistory.kcal@${lastEffectiveDate || date}`,
      };
    }
  }
  return { base: null, source: null };
}

/**
 * @param {{
 *   date?: string|null,
 *   fullHistory?: object|null,
 *   settingsBaseKcal?: number|null,
 *   userTargets?: object|null,
 *   profile_targets?: object|null,
 *   targets?: object|null,
 *   strategyDeltaKcal?: number|null,
 *   compensationKcal?: number|null,
 *   autopilotKcal?: number|null,
 *   includeAutopilot?: boolean,
 *   includeCompensation?: boolean,
 *   preferSnapshot?: boolean,
 *   liveLog?: Array|null,
 * }} [input]
 */
export function resolveDayTargetKcal(input = {}) {
  const date = String(input.date || '').slice(0, 10);
  const preferSnapshot = input.preferSnapshot !== false;
  if (preferSnapshot && date) {
    const snap = readSnapshot(input.fullHistory, date);
    if (snap) {
      return {
        ...normalizeSnapshot(snap),
        fromSnapshot: true,
        frozen: true,
        baseMissing: false,
        baseSource: 'dayTargetSnapshot',
      };
    }
  }

  const resolvedBase = resolveSettingsBaseKcalForDate(input);
  const settingsBaseKcal = resolvedBase.base;
  const log = Array.isArray(input.liveLog) && input.liveLog.length > 0
    ? input.liveLog
    : dayLog(input.fullHistory, date);
  const burn = sumWorkoutBurnFromLog(log);
  const strategyDeltaKcal = roundKcal(input.strategyDeltaKcal);
  const includeCompensation = input.includeCompensation !== false;
  const includeAutopilot = input.includeAutopilot !== false;
  const compensationKcal = includeCompensation ? roundKcal(input.compensationKcal) : 0;
  let autopilotKcal = includeAutopilot ? roundKcal(input.autopilotKcal) : 0;
  if (includeAutopilot && input.autopilotKcal == null && date) {
    const node = dayNode(input.fullHistory, date);
    if (node && node.autopilotCorrection != null) {
      autopilotKcal = roundKcal(node.autopilotCorrection);
    }
  }

  if (!(settingsBaseKcal > 0)) {
    return {
      base: null,
      burnRaw: burn.burnRaw,
      burnCounted: burn.burnCounted,
      kcalSource: burn.dominantSource,
      sessions: burn.sessions,
      strategy: strategyDeltaKcal,
      compensation: compensationKcal,
      autopilot: autopilotKcal,
      total: null,
      rulesVersion: DAY_TARGET_RULES_VERSION,
      fromSnapshot: false,
      frozen: false,
      baseMissing: true,
      baseSource: null,
    };
  }

  const total = computeEffectiveDailyTargetKcal({
    settingsBaseKcal,
    burnKcal: burn.burnCounted,
    strategyDeltaKcal,
    compensationKcal,
    autopilotKcal,
  });

  return {
    base: settingsBaseKcal,
    burnRaw: burn.burnRaw,
    burnCounted: burn.burnCounted,
    kcalSource: burn.dominantSource,
    sessions: burn.sessions,
    strategy: strategyDeltaKcal,
    compensation: compensationKcal,
    autopilot: autopilotKcal,
    total,
    rulesVersion: DAY_TARGET_RULES_VERSION,
    fromSnapshot: false,
    frozen: false,
    baseMissing: false,
    baseSource: resolvedBase.source,
  };
}

function normalizeSnapshot(snap) {
  return {
    base: roundKcal(snap.base),
    burnRaw: roundKcal(snap.burnRaw),
    burnCounted: roundKcal(snap.burnCounted),
    kcalSource: inferKcalSource({ kcalSource: snap.kcalSource }),
    sessions: Array.isArray(snap.sessions) ? snap.sessions : [],
    strategy: roundKcal(snap.strategy),
    compensation: roundKcal(snap.compensation),
    autopilot: roundKcal(snap.autopilot),
    total: roundKcal(snap.total),
    rulesVersion: String(snap.rulesVersion || DAY_TARGET_RULES_VERSION),
  };
}

/**
 * Snapshot da congelare alla chiusura del giorno.
 * @param {object} resolved output di resolveDayTargetKcal
 */
export function buildDayTargetSnapshot(resolved) {
  const r = resolved && typeof resolved === 'object' ? resolved : {};
  return {
    base: roundKcal(r.base),
    burnRaw: roundKcal(r.burnRaw),
    burnCounted: roundKcal(r.burnCounted),
    kcalSource: inferKcalSource({ kcalSource: r.kcalSource }),
    autopilot: roundKcal(r.autopilot),
    strategy: roundKcal(r.strategy),
    compensation: roundKcal(r.compensation),
    total: roundKcal(r.total),
    rulesVersion: String(r.rulesVersion || DAY_TARGET_RULES_VERSION),
  };
}

/**
 * KeyFact alimentazione / riga unica Focus·MCP·Calorie di oggi.
 * Esempi:
 *   «2378 su 2516 (base 2456 + allenamento 120, contate 60)»
 *   «2772 su 2808 (base 2456 + allenamento 330, contate 165 + autopilota +187)»
 * Se burn grezzo = contato: «allenamento 400» senza «contate».
 *
 * @param {{
 *   intake?: number|null,
 *   total?: number|null,
 *   base?: number|null,
 *   burnRaw?: number|null,
 *   burnCounted?: number|null,
 *   autopilot?: number|null,
 *   strategy?: number|null,
 * }} parts
 */
export function formatEnergyDayKeyFact(parts = {}) {
  const intake = roundKcal(parts.intake);
  const total = roundKcal(parts.total);
  const base = roundKcal(parts.base);
  const burnRaw = roundKcal(parts.burnRaw);
  const burnCounted = roundKcal(parts.burnCounted);
  const autopilot = roundKcal(parts.autopilot);
  const strategy = roundKcal(parts.strategy);
  const bits = [`base ${base}`];
  if (burnRaw > 0) {
    bits.push(
      burnCounted !== burnRaw
        ? `allenamento ${burnRaw}, contate ${burnCounted}`
        : `allenamento ${burnRaw}`,
    );
  }
  if (strategy !== 0) bits.push(`strategia ${strategy > 0 ? '+' : ''}${strategy}`);
  if (autopilot !== 0) bits.push(`autopilota ${autopilot > 0 ? '+' : ''}${autopilot}`);
  return `${intake} su ${total} (${bits.join(' + ')})`;
}

/**
 * Etichetta Home: «Allenamento 400 (stimate, contate 200)».
 * @param {{ burnRaw: number, burnCounted: number, kcalSource?: string }} parts
 */
export function formatWorkoutBurnLabel(parts = {}) {
  const raw = roundKcal(parts.burnRaw);
  const counted = roundKcal(parts.burnCounted);
  if (raw <= 0) return 'Allenamento 0';
  const source = inferKcalSource({ kcalSource: parts.kcalSource });
  if (source === KCAL_SOURCE.DEVICE) {
    return counted === raw
      ? `Allenamento ${raw} (dispositivo)`
      : `Allenamento ${raw} (dispositivo, contate ${counted})`;
  }
  if (source === KCAL_SOURCE.USER) {
    return counted === raw
      ? `Allenamento ${raw} (inserite)`
      : `Allenamento ${raw} (inserite, contate ${counted})`;
  }
  return counted === raw
    ? `Allenamento ${raw} (stimate)`
    : `Allenamento ${raw} (stimate, contate ${counted})`;
}

/**
 * Decide kcalSource al salvataggio sessione.
 * Se l'utente ha modificato il valore rispetto al suggerimento → user.
 * Chat/AI/default → estimated. Health Connect (futuro) → device.
 *
 * @param {{
 *   explicitSource?: string|null,
 *   kcal?: number|null,
 *   suggestedKcal?: number|null,
 *   fromChat?: boolean,
 *   fromDevice?: boolean,
 * }} input
 */
export function resolveKcalSourceForSave(input = {}) {
  if (input.fromDevice) return KCAL_SOURCE.DEVICE;
  const explicit = String(input.explicitSource || '').trim().toLowerCase();
  if (explicit === KCAL_SOURCE.DEVICE || explicit === KCAL_SOURCE.USER || explicit === KCAL_SOURCE.ESTIMATED) {
    return explicit;
  }
  if (input.fromChat) return KCAL_SOURCE.ESTIMATED;
  const kcal = roundKcal(input.kcal);
  const suggested = roundKcal(input.suggestedKcal ?? DEFAULT_WORKOUT_KCAL);
  // Senza segnale chiaro di edit: estimated (non distinguiamo ancora AI vs digitato uguale al default).
  if (suggested > 0 && kcal > 0 && kcal !== suggested) return KCAL_SOURCE.USER;
  return KCAL_SOURCE.ESTIMATED;
}
