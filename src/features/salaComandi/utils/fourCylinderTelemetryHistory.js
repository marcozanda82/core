import { addDays, getTodayString, getLogFromStoricoTree } from '../../../coreEngine';
import {
  clamp01,
  diffCalendarDaysUtc,
  DEFAULT_FOUR_CYLINDER_PARAMS,
  POOR_SLEEP_EFFICIENCY_THRESHOLD,
  OPTIMIZED_RECOVERY_EFFICIENCY_THRESHOLD,
  resolveCognitivePenaltyPerHour,
} from '../engines/fourCylinderEngine';

/** @typedef {'push' | 'pull' | 'legs'} MuscleCylinderKey */

const STIMULUS_SCAN_MAX_DAYS = 365;
const SLEEP_SCAN_MAX_DAYS = 7;
const NIGHT_SLEEP_MIN_HOURS = 3;
const COGNITIVE_WORKOUT_TYPES = new Set(['lavoro', 'studio', 'lavoro_pc']);

/**
 * @typedef {object} FourCylinderTelemetryPoint
 * @property {string} date ISO YYYY-MM-DD (asse X)
 * @property {number} push decay_push 0–1
 * @property {number} pull decay_pull 0–1
 * @property {number} legs decay_legs 0–1
 * @property {number} fatigue systemic_fatigue 0–1
 * @property {boolean} hasSnapshot true se almeno un log del giorno aveva fourCylinderSnapshot
 */

/**
 * Estrae la serie storica 4 cilindri da `fullHistory`.
 * Per ogni giorno usa l'ultimo `fourCylinderSnapshot.after` presente nel log (0 se assente).
 *
 * @param {object | null | undefined} fullHistory albero tracker_data
 * @param {{ daysBack?: number, endDate?: string }} [options]
 * @returns {FourCylinderTelemetryPoint[]}
 */
export function buildFourCylinderTelemetrySeries(fullHistory, options = {}) {
  const daysBack = Math.max(1, Math.min(90, Math.floor(Number(options.daysBack) || 30)));
  const endDate = String(options.endDate || getTodayString()).slice(0, 10);
  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};

  /** @type {FourCylinderTelemetryPoint[]} */
  const rows = [];

  for (let offset = daysBack - 1; offset >= 0; offset -= 1) {
    const date = addDays(endDate, -offset);
    const log = getLogFromStoricoTree(tree, date);

    let push = 0;
    let pull = 0;
    let legs = 0;
    let fatigue = 0;
    let hasSnapshot = false;

    for (const entry of log) {
      const after = entry?.fourCylinderSnapshot?.after;
      if (!after || typeof after !== 'object') continue;
      push = clamp01(after.decay_push);
      pull = clamp01(after.decay_pull);
      legs = clamp01(after.decay_legs);
      fatigue = clamp01(after.systemic_fatigue);
      hasSnapshot = true;
    }

    rows.push({
      date,
      push,
      pull,
      legs,
      fatigue,
      hasSnapshot,
    });
  }

  return rows;
}

/**
 * @param {FourCylinderTelemetryPoint[]} series
 * @returns {boolean}
 */
export function fourCylinderSeriesHasData(series) {
  return Array.isArray(series) && series.some((row) => row?.hasSnapshot);
}

/**
 * Stimolo positivo per cilindro da voce log (flat `decay_*` o nested).
 * @param {object | null | undefined} entry
 * @param {MuscleCylinderKey} cylinderKey
 * @returns {number}
 */
function readPositiveStimulusForCylinder(entry, cylinderKey) {
  const stimulus = entry?.fourCylinderSnapshot?.stimulus;
  if (!stimulus || typeof stimulus !== 'object') return 0;
  const flatKey = `decay_${cylinderKey}`;
  const flat = Number(stimulus[flatKey]);
  if (Number.isFinite(flat) && flat > 0) return flat;
  const nested = Number(stimulus[cylinderKey]);
  if (Number.isFinite(nested) && nested > 0) return nested;
  return 0;
}

/**
 * Giorni esatti dall'ultimo stimolo positivo per il cilindro (scan a ritroso da oggi).
 * Usa anche lo stato live `fourCylinder` (decay / lastStimulus) quando lo storico log non ha snapshot.
 *
 * @param {object | null | undefined} fullHistory albero tracker_data
 * @param {MuscleCylinderKey} cylinderKey push | pull | legs
 * @param {{ todayIso?: string, maxScanDays?: number, fourCylinder?: object | null }} [options]
 * @returns {number | '> 30' | '∞'}
 */
export function getDaysSinceLastStimulus(fullHistory, cylinderKey, options = {}) {
  const today = String(options.todayIso || getTodayString()).slice(0, 10);
  const key = String(cylinderKey || '').trim();
  if (!['push', 'pull', 'legs'].includes(key)) return '∞';

  const fourCylinder = options.fourCylinder && typeof options.fourCylinder === 'object'
    ? options.fourCylinder
    : null;

  if (fourCylinder) {
    const liveLevel = clamp01(fourCylinder.decay?.[key]);
    if (liveLevel > 0) {
      const applied = Number(fourCylinder.lastStimulus?.applied?.[key]) || 0;
      const stimulusDate = String(fourCylinder.lastStimulus?.date || '').slice(0, 10);
      if (applied > 0 && /^\d{4}-\d{2}-\d{2}$/.test(stimulusDate)) {
        const diff = diffCalendarDaysUtc(stimulusDate, today);
        if (diff != null && diff >= 0) return diff;
      }
      const refDate = String(
        fourCylinder.lastUpdatedIso || fourCylinder.lastProcessedDate || today,
      ).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(refDate)) {
        const diff = diffCalendarDaysUtc(refDate, today);
        if (diff != null && diff >= 0) return diff;
      }
      return 0;
    }
  }

  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};
  const maxScan = Math.max(
    1,
    Math.min(STIMULUS_SCAN_MAX_DAYS, Math.floor(Number(options.maxScanDays) || STIMULUS_SCAN_MAX_DAYS)),
  );

  for (let back = 0; back <= maxScan; back += 1) {
    const date = addDays(today, -back);
    const log = getLogFromStoricoTree(tree, date);
    for (const entry of log) {
      if (readPositiveStimulusForCylinder(entry, key) <= 0) continue;
      const diff = diffCalendarDaysUtc(date, today);
      return diff != null && diff >= 0 ? diff : 0;
    }
  }

  return maxScan >= 30 ? '> 30' : '∞';
}

/**
 * @param {number | '> 30' | '∞'} daysSince
 * @returns {string}
 */
export function formatInactivityDaysLabel(daysSince) {
  if (daysSince === '∞') return '∞';
  if (daysSince === '> 30') return '> 30';
  const n = Number(daysSince);
  if (!Number.isFinite(n) || n < 0) return '—';
  return String(Math.floor(n));
}

/**
 * @param {number | '> 30' | '∞'} daysSince
 * @returns {string}
 */
export function formatInactivitySuffix(daysSince) {
  if (daysSince === '∞' || daysSince === '> 30') return 'GIORNI';
  const n = Number(daysSince);
  if (n === 1) return 'GIORNO';
  return 'GIORNI';
}

/**
 * @typedef {object} LastSleepSnapshot
 * @property {string | null} date ISO YYYY-MM-DD dell'ultimo log sonno
 * @property {number} hours ore dormite
 * @property {number} efficiency 0–1 efficienza recupero
 * @property {boolean} optimizedRecovery
 * @property {boolean} isPoorSleep
 * @property {number | null} daysSince giorni di calendario dall'ultimo log (null se assente)
 * @property {number} recoverySystemic |delta| systemic da fourCylinderSnapshot.recovery
 * @property {boolean} found true se trovato entro la finestra di scan
 */

/**
 * Ore sonno da entry log (ore decimali o minuti > 36).
 * @param {object | null | undefined} entry
 * @returns {number}
 */
function readSleepHoursFromEntry(entry) {
  let h = Number(
    entry?.hours
      ?? entry?.duration
      ?? entry?.sleepHours
      ?? entry?.sleepDuration
      ?? entry?.totalSleep
      ?? entry?.sleep,
  );
  if (!Number.isFinite(h) || h <= 0) return 0;
  if (h > 36) h /= 60;
  if (h > 24) h /= 60;
  if (!Number.isFinite(h) || h <= 0 || h > 24) return 0;
  return h;
}

/**
 * Efficienza recupero: campi espliciti → snapshot 4 cilindri → euristica ore.
 * @param {object} entry
 * @returns {number} 0–1
 */
function deriveSleepEfficiency(entry) {
  const snap = entry?.fourCylinderSnapshot;
  const explicit = Number(
    entry?.recoveryEfficiency
      ?? entry?.sleepEfficiency
      ?? entry?.efficiency
      ?? snap?.recoveryEfficiency,
  );
  if (Number.isFinite(explicit) && explicit >= 0) return clamp01(explicit);

  const beforeSys = Number(snap?.before?.systemic_fatigue);
  const afterSys = Number(snap?.after?.systemic_fatigue);
  const recoverySys = Number(
    snap?.recovery?.systemic_fatigue ?? snap?.recovery?.systemic,
  );
  const maxRec = Number(DEFAULT_FOUR_CYLINDER_PARAMS.maxSystemicRecoveryPerSleep) || 0.35;

  if (Number.isFinite(beforeSys) && Number.isFinite(afterSys)) {
    if (afterSys > beforeSys + 1e-6) {
      return clamp01(POOR_SLEEP_EFFICIENCY_THRESHOLD * 0.5);
    }
    if (Number.isFinite(recoverySys) && recoverySys > 0 && maxRec > 0) {
      return clamp01(recoverySys / maxRec);
    }
  }

  if (snap?.optimizedRecovery === true) return 0.85;

  const hours = readSleepHoursFromEntry(entry);
  if (hours > 0) return clamp01(hours / 8);
  return 0;
}

/**
 * @param {object} entry
 * @param {number} efficiency
 * @returns {boolean}
 */
function deriveIsPoorSleep(entry, efficiency) {
  const snap = entry?.fourCylinderSnapshot;
  if (snap?.isPoorSleep === true) return true;
  if (snap?.optimizedRecovery === true) return false;
  const beforeSys = Number(snap?.before?.systemic_fatigue);
  const afterSys = Number(snap?.after?.systemic_fatigue);
  if (Number.isFinite(beforeSys) && Number.isFinite(afterSys) && afterSys > beforeSys + 1e-6) {
    return true;
  }
  return efficiency < POOR_SLEEP_EFFICIENCY_THRESHOLD;
}

/**
 * Scansiona a ritroso `fullHistory` (max 7 giorni) e restituisce l'ultimo log `type === 'sleep'`.
 *
 * @param {object | null | undefined} fullHistory albero tracker_data
 * @param {{ todayIso?: string, maxScanDays?: number }} [options]
 * @returns {LastSleepSnapshot}
 */
export function getLastSleepSnapshot(fullHistory, options = {}) {
  const today = String(options.todayIso || getTodayString()).slice(0, 10);
  const maxScan = Math.max(
    1,
    Math.min(SLEEP_SCAN_MAX_DAYS, Math.floor(Number(options.maxScanDays) || SLEEP_SCAN_MAX_DAYS)),
  );
  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};

  /** @type {LastSleepSnapshot} */
  const empty = {
    date: null,
    hours: 0,
    efficiency: 0,
    optimizedRecovery: false,
    isPoorSleep: true,
    daysSince: null,
    recoverySystemic: 0,
    found: false,
  };

  for (let back = 0; back <= maxScan; back += 1) {
    const date = addDays(today, -back);
    const log = getLogFromStoricoTree(tree, date);
    const sleeps = [];
    for (const entry of log) {
      if (entry?.type === 'sleep') sleeps.push(entry);
    }
    if (sleeps.length === 0) continue;

    // Preferisci la notte principale (≥ 3 h); altrimenti l'ultima entry del giorno.
    let entry = sleeps[sleeps.length - 1];
    let bestHours = -1;
    for (const candidate of sleeps) {
      const h = readSleepHoursFromEntry(candidate);
      if (h >= NIGHT_SLEEP_MIN_HOURS && h > bestHours) {
        bestHours = h;
        entry = candidate;
      }
    }

    const hours = readSleepHoursFromEntry(entry);
    const efficiency = deriveSleepEfficiency(entry);
    const snap = entry?.fourCylinderSnapshot;
    const isPoorSleep = deriveIsPoorSleep(entry, efficiency);
    const optimizedRecovery =
      !isPoorSleep
      && (
        snap?.optimizedRecovery === true
        || efficiency > OPTIMIZED_RECOVERY_EFFICIENCY_THRESHOLD
      );
    const daysSince = diffCalendarDaysUtc(date, today);
    const recoverySystemic = clamp01(
      Number(snap?.recovery?.systemic_fatigue ?? snap?.recovery?.systemic) || 0,
    );

    return {
      date,
      hours,
      efficiency,
      optimizedRecovery,
      isPoorSleep,
      daysSince: daysSince != null && daysSince >= 0 ? daysSince : back,
      recoverySystemic,
      found: true,
    };
  }

  return empty;
}

/**
 * @typedef {object} TodayCognitiveSnapshot
 * @property {string} date ISO YYYY-MM-DD scansionato (oggi)
 * @property {number} totalHours somma ore lavoro/studio di oggi
 * @property {number} totalStressBump somma delta systemic (0–∞ grezzo, tipicamente ≤ N×0.30)
 * @property {number} sessionCount quante sessioni cognitive/lavoro
 * @property {boolean} hasLoad totalHours > 0
 * @property {boolean} isElevated carico neurale elevato (ore > 5 o bump > 0.15)
 */

/**
 * True se la voce è lavoro/cognitivo (workoutType, type dedicato, o snapshot.stress).
 * @param {object | null | undefined} entry
 * @returns {boolean}
 */
function isCognitiveOrWorkLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const stress = entry.fourCylinderSnapshot?.stress;
  if (stress && typeof stress === 'object') return true;
  if (entry.type === 'work' || entry.type === 'cognitive') return true;
  if (entry.type === 'workout') {
    const wt = String(entry.workoutType || entry.subType || '').trim();
    return COGNITIVE_WORKOUT_TYPES.has(wt);
  }
  return false;
}

/**
 * Ore sessione da entry lavoro/cognitivo.
 * @param {object} entry
 * @returns {number}
 */
function readCognitiveHoursFromEntry(entry) {
  const h = Number(entry?.duration ?? entry?.hours ?? entry?.sleepHours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Math.max(0, Math.min(24, h));
}

/**
 * Delta stress di una sessione: da snapshot.stress oppure duration × penalty (cap maxCognitiveBump).
 * @param {object} entry
 * @returns {number}
 */
function readCognitiveStressBumpFromEntry(entry) {
  const snapStress = entry?.fourCylinderSnapshot?.stress;
  const fromSnap = Number(snapStress?.systemic_fatigue ?? snapStress?.systemic);
  if (Number.isFinite(fromSnap) && fromSnap >= 0) return clamp01(fromSnap);

  const duration = readCognitiveHoursFromEntry(entry);
  const workoutType = String(entry?.workoutType || entry?.subType || '').trim();
  const penalty = resolveCognitivePenaltyPerHour(workoutType, DEFAULT_FOUR_CYLINDER_PARAMS);
  const maxBump = clamp01(DEFAULT_FOUR_CYLINDER_PARAMS.maxCognitiveBump);
  return Math.min(maxBump, duration * penalty);
}

/**
 * Aggrega il carico cognitivo/lavoro **solo di oggi** (non cerca giorni passati).
 *
 * @param {object | null | undefined} fullHistory albero tracker_data
 * @param {{ todayIso?: string }} [options]
 * @returns {TodayCognitiveSnapshot}
 */
export function getTodayCognitiveSnapshot(fullHistory, options = {}) {
  const today = String(options.todayIso || getTodayString()).slice(0, 10);
  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};
  const log = getLogFromStoricoTree(tree, today);

  let totalHours = 0;
  let totalStressBump = 0;
  let sessionCount = 0;

  for (const entry of log) {
    if (!isCognitiveOrWorkLogEntry(entry)) continue;
    const hours = readCognitiveHoursFromEntry(entry);
    const bump = readCognitiveStressBumpFromEntry(entry);
    totalHours += hours;
    totalStressBump += bump;
    sessionCount += 1;
  }

  const hasLoad = totalHours > 0 || sessionCount > 0;
  const isElevated = totalHours > 5 || totalStressBump > 0.15;

  return {
    date: today,
    totalHours: Math.round(totalHours * 100) / 100,
    totalStressBump: Math.round(totalStressBump * 1000) / 1000,
    sessionCount,
    hasLoad,
    isElevated,
  };
}

