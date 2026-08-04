import { addDays, getTodayString, getLogFromStoricoTree } from '../../../coreEngine';
import {
  clamp01,
  diffCalendarDaysUtc,
  DEFAULT_FOUR_CYLINDER_PARAMS,
  fourCylinderFromPhysiologyModel,
  inflateFlatLevelsToDecay,
  muscleDecaySum,
  MUSCLE_CYLINDER_IDS,
  POOR_SLEEP_EFFICIENCY_THRESHOLD,
  OPTIMIZED_RECOVERY_EFFICIENCY_THRESHOLD,
  resolveCognitivePenaltyPerHour,
} from '../engines/fourCylinderEngine';

/** @typedef {import('../engines/fourCylinderEngine').MuscleCylinderId} MuscleCylinderKey */

const STIMULUS_SCAN_MAX_DAYS = 365;
const SLEEP_SCAN_MAX_DAYS = 7;
const NIGHT_SLEEP_MIN_HOURS = 3;
const COGNITIVE_WORKOUT_TYPES = new Set(['lavoro', 'studio', 'lavoro_pc']);
const VALID_CYLINDER_KEYS = new Set(MUSCLE_CYLINDER_IDS);

/**
 * @typedef {object} FourCylinderTelemetryPoint
 * @property {string} date ISO YYYY-MM-DD (asse X)
 * @property {number} legs
 * @property {number} chest
 * @property {number} back_shoulders
 * @property {number} arms
 * @property {number} core
 * @property {number} fatigue systemic_fatigue 0–1
 * @property {boolean} hasSnapshot true se snapshot significativo (energia > 0)
 * @property {boolean} [isLive] true se il punto usa lo stato live del motore
 * @property {boolean} [isCarry] true se sintetico (carry/decadimento a ore)
 */

/**
 * @param {{ legs?: number, chest?: number, back_shoulders?: number, arms?: number, core?: number, fatigue?: number } | null | undefined} levels
 * @returns {number}
 */
function telemetryEnergySum(levels) {
  if (!levels) return 0;
  return muscleDecaySum(levels) + clamp01(levels.fatigue);
}

/**
 * Decadimento proporzionale alle ore reali (rate giornaliere motore × ore/24).
 * @param {{ legs: number, chest: number, back_shoulders: number, arms: number, core: number, fatigue: number }} prev
 * @param {number} hours
 */
function applyTelemetryDecayByHours(prev, hours) {
  const dayFrac = Math.max(0, Number(hours) || 0) / 24;
  const rates = DEFAULT_FOUR_CYLINDER_PARAMS.decayPerDay;
  const systemicRecovery = DEFAULT_FOUR_CYLINDER_PARAMS.systemicRecoveryPerDay;
  return {
    legs: clamp01(prev.legs - rates.legs * dayFrac),
    chest: clamp01(prev.chest - rates.chest * dayFrac),
    back_shoulders: clamp01(prev.back_shoulders - rates.back_shoulders * dayFrac),
    arms: clamp01(prev.arms - rates.arms * dayFrac),
    core: clamp01(prev.core - rates.core * dayFrac),
    fatigue: clamp01(prev.fatigue - systemicRecovery * dayFrac),
  };
}

/**
 * Ore tra un instante e ora. ISO giorno → mezzogiorno locale (evita skew UTC midnight).
 * @param {number | string | null | undefined} fromAt epoch ms oppure YYYY-MM-DD
 * @returns {number}
 */
function hoursElapsedSince(fromAt) {
  let thenMs = NaN;
  if (typeof fromAt === 'number' && Number.isFinite(fromAt) && fromAt > 0) {
    thenMs = fromAt;
  } else {
    const iso = String(fromAt || '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (m) {
      thenMs = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0).getTime();
    }
  }
  if (!Number.isFinite(thenMs)) return 0;
  const hours = (Date.now() - thenMs) / 3600000;
  if (!Number.isFinite(hours) || hours < 0) return 0;
  return Math.min(hours, 24 * 90);
}

/**
 * Ultimo snapshot significativo del giorno (ignora after tutti-zero — causa del cliff).
 * Dual-read robusto per ogni cilindro (nested + flat + legacy push→chest).
 * @param {Array} log
 * @returns {{ legs: number, chest: number, back_shoulders: number, arms: number, core: number, fatigue: number, capturedAt: number | null } | null}
 */
function readMeaningfulSnapshotFromLog(log) {
  let best = null;
  for (const entry of log || []) {
    const snap = entry?.fourCylinderSnapshot;
    const after = snap?.after;
    if (!after || typeof after !== 'object') continue;
    const decay = readDecayLevelsFromAfter(after);
    const fatigue = clamp01(after.systemic_fatigue);
    const levels = { ...decay, fatigue };
    if (telemetryEnergySum(levels) <= 0) continue;
    const capturedAt = Number(snap.capturedAt);
    best = {
      ...levels,
      capturedAt: Number.isFinite(capturedAt) && capturedAt > 0 ? capturedAt : null,
    };
  }
  return best;
}

/**
 * Estrae i 5 livelli da uno snapshot.after (v2 flat/nested + legacy push/pull).
 * @param {object} after
 * @returns {{ legs: number, chest: number, back_shoulders: number, arms: number, core: number }}
 */
function readDecayLevelsFromAfter(after) {
  const inflated = inflateFlatLevelsToDecay(after);
  /** @type {Record<string, number>} */
  const out = {};
  for (const id of MUSCLE_CYLINDER_IDS) {
    const nested = Number(after?.[id]);
    const flat = Number(after?.[`decay_${id}`]);
    let v = Number.isFinite(nested) ? nested : NaN;
    if (!Number.isFinite(v)) v = Number.isFinite(flat) ? flat : NaN;
    if (!Number.isFinite(v)) v = Number(inflated[id]);
    // Legacy tipico: petto solo come push / decay_push
    if ((!Number.isFinite(v) || v <= 0) && id === 'chest') {
      const push = Number(after?.push ?? after?.decay_push);
      if (Number.isFinite(push) && push > 0) v = push;
    }
    out[id] = clamp01(Number.isFinite(v) ? v : 0);
  }
  return {
    legs: out.legs,
    chest: out.chest,
    back_shoulders: out.back_shoulders,
    arms: out.arms,
    core: out.core,
  };
}

/**
 * Per-cilindro: non lasciare che uno snapshot/live a chest=0 azzeri un residuo ancora vivo.
 * @param {object} base
 * @param {object} incoming
 */
function mergeCylinderLevelsPreferResidual(base, incoming) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const id of MUSCLE_CYLINDER_IDS) {
    out[id] = Math.max(clamp01(base?.[id]), clamp01(incoming?.[id]));
  }
  return {
    legs: out.legs,
    chest: out.chest,
    back_shoulders: out.back_shoulders,
    arms: out.arms,
    core: out.core,
    fatigue: Math.max(clamp01(base?.fatigue), clamp01(incoming?.fatigue)),
  };
}

/**
 * Estrae la serie storica cilindri da `fullHistory` (dual-read snapshot v1/v2).
 * Snapshot a energia 0 non spezzano la curva. Ultimo punto: residuo a ore reali.
 * Merge per-cilindro: evita cliff isolati (es. chest=0 su uno snap gambe mentre il petto ha ancora residuo).
 *
 * @param {object | null | undefined} fullHistory albero tracker_data
 * @param {{ daysBack?: number, endDate?: string, fourCylinder?: object | null }} [options]
 * @returns {FourCylinderTelemetryPoint[]}
 */
export function buildFourCylinderTelemetrySeries(fullHistory, options = {}) {
  const daysBack = Math.max(1, Math.min(90, Math.floor(Number(options.daysBack) || 30)));
  const endDate = String(options.endDate || getTodayString()).slice(0, 10);
  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};
  const liveRaw = options.fourCylinder && typeof options.fourCylinder === 'object'
    ? options.fourCylinder
    : null;

  /** @type {FourCylinderTelemetryPoint[]} */
  const rows = [];
  /** @type {(FourCylinderTelemetryPoint & { capturedAt?: number | null }) | null} */
  let carry = null;
  /** Ultimo picco per cilindro (ancora temporale del residuo a ore). */
  /** @type {(FourCylinderTelemetryPoint & { capturedAt?: number | null }) | null} */
  let lastPeak = null;

  for (let offset = daysBack - 1; offset >= 0; offset -= 1) {
    const date = addDays(endDate, -offset);
    const isLast = offset === 0;
    const log = getLogFromStoricoTree(tree, date);
    const snap = readMeaningfulSnapshotFromLog(log);

    /** @type {FourCylinderTelemetryPoint & { capturedAt?: number | null }} */
    let point;

    if (snap) {
      let merged = {
        legs: snap.legs,
        chest: snap.chest,
        back_shoulders: snap.back_shoulders,
        arms: snap.arms,
        core: snap.core,
        fatigue: snap.fatigue,
      };
      // Se lo snap azzera un distretto (es. petto) ma il carry ha ancora residuo, conserva il decadimento.
      if (carry) {
        const hoursFromCarry = isLast
          ? hoursElapsedSince(lastPeak?.capturedAt ?? lastPeak?.date ?? carry.date)
          : 24;
        const decayedCarry = applyTelemetryDecayByHours(carry, hoursFromCarry);
        merged = mergeCylinderLevelsPreferResidual(decayedCarry, merged);
      }
      point = {
        date,
        ...merged,
        hasSnapshot: true,
        capturedAt: snap.capturedAt,
      };
      // lastPeak: aggiorna cilindri stimolati; gli altri restano dal picco precedente decaduto fino a `date`
      if (lastPeak) {
        const peakDate = String(lastPeak.date || '').slice(0, 10);
        const daysFromPeak = diffCalendarDaysUtc(peakDate, date);
        const hoursFromPeak = isLast
          ? hoursElapsedSince(lastPeak.capturedAt ?? lastPeak.date)
          : Math.max(0, daysFromPeak == null ? 1 : daysFromPeak) * 24;
        const decayedPeak = applyTelemetryDecayByHours(lastPeak, hoursFromPeak);
        const peakMerged = mergeCylinderLevelsPreferResidual(decayedPeak, snap);
        lastPeak = {
          date,
          ...peakMerged,
          hasSnapshot: true,
          // Timestamp: se lo snap ha alzato un cilindro usa capturedAt snap, senno conserva il vecchio
          capturedAt: telemetryEnergySum(snap) > telemetryEnergySum(decayedPeak)
            ? (snap.capturedAt || lastPeak.capturedAt)
            : (lastPeak.capturedAt || snap.capturedAt),
        };
      } else {
        lastPeak = point;
      }
    } else if (carry) {
      let hours = 24;
      let source = carry;
      if (isLast && lastPeak) {
        hours = hoursElapsedSince(lastPeak.capturedAt ?? lastPeak.date);
        source = lastPeak;
      }
      const decayed = applyTelemetryDecayByHours(source, hours);
      point = {
        date,
        ...decayed,
        hasSnapshot: false,
        isCarry: true,
        capturedAt: null,
      };
    } else {
      point = {
        date,
        legs: 0,
        chest: 0,
        back_shoulders: 0,
        arms: 0,
        core: 0,
        fatigue: 0,
        hasSnapshot: false,
        capturedAt: null,
      };
    }

    // Live: merge per-cilindro (live.chest===0 non deve precipitare la curva petto).
    if (isLast && liveRaw) {
      const live = fourCylinderFromPhysiologyModel({ fourCylinder: liveRaw }, endDate);
      const liveLevels = {
        legs: clamp01(live.decay.legs),
        chest: clamp01(live.decay.chest),
        back_shoulders: clamp01(live.decay.back_shoulders),
        arms: clamp01(live.decay.arms),
        core: clamp01(live.decay.core),
        fatigue: clamp01(live.systemic_fatigue),
      };
      const mergedLive = mergeCylinderLevelsPreferResidual(point, liveLevels);
      if (telemetryEnergySum(mergedLive) > 0) {
        point = {
          date,
          ...mergedLive,
          hasSnapshot: Boolean(snap) || point.hasSnapshot,
          isLive: true,
          isCarry: point.isCarry,
          capturedAt: Number(live.updatedAt) || point.capturedAt || null,
        };
      }
    }

    rows.push(point);
    if (telemetryEnergySum(point) > 0) {
      carry = point;
    }
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
 * Dual-read: su snapshot v1, mappa push/pull/legs → chiavi v2 via inflate.
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

  // Legacy v1 flat → inflate and read v2 key
  if (
    Object.prototype.hasOwnProperty.call(stimulus, 'decay_push')
    || Object.prototype.hasOwnProperty.call(stimulus, 'decay_pull')
  ) {
    const inflated = inflateFlatLevelsToDecay(stimulus);
    const v = Number(inflated[cylinderKey]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

/**
 * Giorni esatti dall'ultimo stimolo positivo per il cilindro (scan a ritroso da oggi).
 *
 * @param {object | null | undefined} fullHistory albero tracker_data
 * @param {MuscleCylinderKey} cylinderKey
 * @param {{ todayIso?: string, maxScanDays?: number, fourCylinder?: object | null }} [options]
 * @returns {number | '> 30' | '∞'}
 */
export function getDaysSinceLastStimulus(fullHistory, cylinderKey, options = {}) {
  const today = String(options.todayIso || getTodayString()).slice(0, 10);
  const key = String(cylinderKey || '').trim();
  if (!VALID_CYLINDER_KEYS.has(key)) return '∞';

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
