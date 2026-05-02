import {
  computeDataDrivenTdeeWithCoach as computeDataDrivenTdeeWithCoachBase,
  goalFromProfile as goalFromProfileBase,
} from '../../../dataDrivenTdee';
import {
  applyCalorieStrategyToProfileKcal as applyCalorieStrategyToProfileKcalBase,
  getLogFromStoricoTree as getLogFromStoricoTreeBase,
} from '../../../coreEngine';
import { mergeDuplicateBiometrics as mergeDuplicateBiometricsBase } from '../../../biometricHistory';
import { recalculateUserTargets as recalculateUserTargetsBase } from '../../../targetsEngine';
import { computeTotali as computeTotaliBase } from '../../../useBiochimico';

export const computeDataDrivenTdeeWithCoach = computeDataDrivenTdeeWithCoachBase;
export const mergeDuplicateBiometrics = mergeDuplicateBiometricsBase;
export const recalculateUserTargets = recalculateUserTargetsBase;
export const goalFromProfile = goalFromProfileBase;
const getLogFromStoricoTree = getLogFromStoricoTreeBase;
const computeTotali = computeTotaliBase;
const applyCalorieStrategyToProfileKcal = applyCalorieStrategyToProfileKcalBase;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDateFromTimestamp(timestamp) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function isValidIsoDate(value) {
  if (typeof value !== 'string') return false;
  const iso = value.trim().slice(0, 10);
  if (!ISO_DATE_RE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === iso;
}

export function normalizeBodyMetricDate({ date, timestamp, fallbackDate }) {
  const candidateDate = typeof date === 'string' ? date.trim().slice(0, 10) : '';
  if (isValidIsoDate(candidateDate)) return candidateDate;

  const fromTimestamp = toIsoDateFromTimestamp(timestamp);
  if (fromTimestamp && isValidIsoDate(fromTimestamp)) return fromTimestamp;

  return isValidIsoDate(fallbackDate) ? fallbackDate : new Date().toISOString().slice(0, 10);
}

export function clampBodyMetricDateToToday({ date, todayDate }) {
  const safeToday = isValidIsoDate(todayDate) ? todayDate : new Date().toISOString().slice(0, 10);
  const safeDate = normalizeBodyMetricDate({
    date,
    timestamp: null,
    fallbackDate: safeToday,
  });
  if (safeDate > safeToday) return safeToday;
  return safeDate;
}

/**
 * Usiamo mezzogiorno UTC per evitare slittamenti di giorno con i fusi.
 */
export function bodyMetricTimestampFromDate(date) {
  const safeDate = normalizeBodyMetricDate({
    date,
    timestamp: null,
    fallbackDate: new Date().toISOString().slice(0, 10),
  });
  return new Date(`${safeDate}T12:00:00Z`).getTime();
}

export function normalizeBodyMetricsEntryForTimeline({ entry, fallbackDate }) {
  if (!entry || typeof entry !== 'object') return null;
  const normalizedDate = normalizeBodyMetricDate({
    date: entry.date,
    timestamp: entry.timestamp,
    fallbackDate,
  });
  return {
    ...entry,
    date: normalizedDate,
    timestamp: bodyMetricTimestampFromDate(normalizedDate),
  };
}

export function sortBodyMetricsHistoryByDateAsc(history = [], fallbackDate) {
  const safeHistory = Array.isArray(history) ? history : [];
  return safeHistory
    .map((entry) => normalizeBodyMetricsEntryForTimeline({ entry, fallbackDate }))
    .filter((entry) => Number.isFinite(Number(entry?.weight)) && Number(entry.weight) > 0)
    .filter(Boolean)
    .sort((a, b) => {
      const d = String(a.date || '').localeCompare(String(b.date || ''));
      if (d !== 0) return d;
      return (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0);
    });
}

/**
 * Deriva la metrica corporea corrente esclusivamente dallo storico residuo.
 * Ritorna l'entry più recente valida (o `null` se lo storico è vuoto/invalido).
 */
export function deriveCurrentBodyMetricsFromHistory(history = [], fallbackDate) {
  const sorted = sortBodyMetricsHistoryByDateAsc(history, fallbackDate);
  if (!sorted.length) return null;
  return sorted[sorted.length - 1] || null;
}

/**
 * Ritorna la pesata effettiva per una data: ultima entry con `entry.date <= date`.
 * Ignora entry eliminate/non valide (weight <= 0), mai usa pesate future.
 */
export function deriveEffectiveBodyMetricsForDate(history = [], date, fallbackDate) {
  const safeDate = normalizeBodyMetricDate({ date, timestamp: null, fallbackDate });
  const sorted = sortBodyMetricsHistoryByDateAsc(history, fallbackDate);
  if (!sorted.length) return null;
  let latest = null;
  for (let i = 0; i < sorted.length; i += 1) {
    const entry = sorted[i];
    if (String(entry?.date || '') > safeDate) break;
    latest = entry;
  }
  return latest;
}

const TARGET_TIMELINE_KEYS = ['kcal', 'prot', 'carb', 'fat', 'fatTotal', 'water', 'fibre'];

function pickTargetTimelinePayload(input) {
  const out = {};
  TARGET_TIMELINE_KEYS.forEach((key) => {
    const n = Number(input?.[key]);
    if (Number.isFinite(n)) out[key] = n;
  });
  return out;
}

function normalizeTargetTimelineEntry(entry, todayDate) {
  if (!entry || typeof entry !== 'object') return null;
  const effectiveDate = normalizeBodyMetricDate({
    date: entry.effectiveDate,
    timestamp: entry.timestamp,
    fallbackDate: todayDate,
  });
  const targets = pickTargetTimelinePayload(entry.targets ?? entry);
  if (Object.keys(targets).length === 0) return null;
  return {
    effectiveDate,
    timestamp: bodyMetricTimestampFromDate(effectiveDate),
    targets,
    source: typeof entry.source === 'string' ? entry.source : null,
  };
}

export function upsertTargetHistoryEntry({
  history = [],
  effectiveDate,
  targets,
  todayDate,
  source = null,
  seedPreviousTargets = null,
}) {
  const safeToday = isValidIsoDate(todayDate) ? todayDate : new Date().toISOString().slice(0, 10);
  const safeDate = normalizeBodyMetricDate({
    date: effectiveDate,
    timestamp: null,
    fallbackDate: safeToday,
  });
  const payload = pickTargetTimelinePayload(targets);
  if (Object.keys(payload).length === 0) {
    return Array.isArray(history) ? history : [];
  }

  const normalized = (Array.isArray(history) ? history : [])
    .map((entry) => normalizeTargetTimelineEntry(entry, safeToday))
    .filter(Boolean)
    .filter((entry) => entry.effectiveDate !== safeDate);

  if (normalized.length === 0 && seedPreviousTargets && typeof seedPreviousTargets === 'object') {
    const previousPayload = pickTargetTimelinePayload(seedPreviousTargets);
    if (Object.keys(previousPayload).length > 0) {
      const previousDate = '1970-01-01';
      normalized.push({
        effectiveDate: previousDate,
        timestamp: bodyMetricTimestampFromDate(previousDate),
        targets: previousPayload,
        source: 'seed-previous',
      });
    }
  }

  normalized.push({
    effectiveDate: safeDate,
    timestamp: bodyMetricTimestampFromDate(safeDate),
    targets: payload,
    source,
  });

  normalized.sort((a, b) => {
    const d = String(a.effectiveDate).localeCompare(String(b.effectiveDate));
    if (d !== 0) return d;
    return (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0);
  });

  return normalized;
}

export function resolveTargetConfigForDate({ targets, date, todayDate }) {
  const base = targets && typeof targets === 'object' ? { ...targets } : {};
  const safeToday = isValidIsoDate(todayDate) ? todayDate : new Date().toISOString().slice(0, 10);
  const safeDate = normalizeBodyMetricDate({
    date,
    timestamp: null,
    fallbackDate: safeToday,
  });
  const timeline = (Array.isArray(base.targetHistory) ? base.targetHistory : [])
    .map((entry) => normalizeTargetTimelineEntry(entry, safeToday))
    .filter(Boolean)
    .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));

  let resolved = { ...base };
  for (let i = 0; i < timeline.length; i += 1) {
    const entry = timeline[i];
    if (entry.effectiveDate > safeDate) break;
    resolved = { ...resolved, ...entry.targets };
  }
  return resolved;
}

function toDayTimestamp(isoDate) {
  const iso = normalizeBodyMetricDate({ date: isoDate, timestamp: null, fallbackDate: isoDate });
  return new Date(`${iso}T00:00:00Z`).getTime();
}

function dayDiffInclusive(startIso, endIso) {
  const delta = toDayTimestamp(endIso) - toDayTimestamp(startIso);
  return Math.max(1, Math.round(delta / 86400000) + 1);
}

export function isWeightOutlier(prevWeight, currentWeight, daysDiff) {
  const prev = Number(prevWeight);
  const curr = Number(currentWeight);
  const dd = Math.max(1, Number(daysDiff) || 1);
  if (!Number.isFinite(prev) || prev <= 0 || !Number.isFinite(curr)) {
    return {
      isOutlier: false,
      reason: null,
      deltaKg: null,
      deltaPct: null,
      daysDiff: dd,
    };
  }
  const deltaKg = curr - prev;
  const absDeltaKg = Math.abs(deltaKg);
  const deltaPct = absDeltaKg / prev;

  if (absDeltaKg >= 10) {
    return { isOutlier: true, reason: 'absolute_delta', deltaKg, deltaPct, daysDiff: dd };
  }
  if (deltaPct >= 0.10) {
    return { isOutlier: true, reason: 'relative_delta', deltaKg, deltaPct, daysDiff: dd };
  }
  if (absDeltaKg > 2.5 && dd <= 2) {
    return { isOutlier: true, reason: 'short_term_delta', deltaKg, deltaPct, daysDiff: dd };
  }
  if (deltaPct > 0.03 && dd <= 3) {
    return { isOutlier: true, reason: 'short_term_pct', deltaKg, deltaPct, daysDiff: dd };
  }
  if (absDeltaKg > 5 && dd <= 7) {
    return { isOutlier: true, reason: 'weekly_delta', deltaKg, deltaPct, daysDiff: dd };
  }
  return { isOutlier: false, reason: null, deltaKg, deltaPct, daysDiff: dd };
}

const RECAL_SMALL_DISCREPANCY_KG = 0.25;

function pickRecalibrationDiagnosis({
  latestIsOutlier: latestOut,
  outlierDetected: outDet,
  confidence,
  discrepancyAbs,
  validDays,
  dailyWindowReason,
  smallThresholdKg = RECAL_SMALL_DISCREPANCY_KG,
}) {
  if (latestOut || outDet) {
    return {
      diagnosisType: 'outlier',
      diagnosisMessage: 'Pesata anomala: non viene usata per calibrare i target.',
    };
  }
  if (confidence === 'low') {
    return {
      diagnosisType: 'low_confidence',
      diagnosisMessage: 'Dati insufficienti o instabili: meglio attendere altre pesate.',
    };
  }
  if (discrepancyAbs < smallThresholdKg) {
    return {
      diagnosisType: 'normal_variation',
      diagnosisMessage: 'Peso e bilancio energetico sono compatibili: nessuna correzione necessaria.',
    };
  }
  const weakCoverage =
    validDays < 10 ||
    dailyWindowReason === 'insufficient_logs' ||
    dailyWindowReason === 'missing_daily_logs';
  if (weakCoverage) {
    return {
      diagnosisType: 'intake_tracking_error',
      diagnosisMessage:
        'Il disallineamento potrebbe dipendere da tracking incompleto o stime alimentari imprecise.',
    };
  }
  return {
    diagnosisType: 'tdee_mismatch',
    diagnosisMessage:
      'Peso e bilancio energetico sono in conflitto: la stima energetica potrebbe essere da riallineare.',
  };
}

/**
 * Analisi trend energetico vs trend peso su finestra recente.
 * dailyLogs: Array<{ date: YYYY-MM-DD, kcalBalance: number }>
 */
export function analyzeEnergyVsWeightTrend({
  bodyMetricsHistory,
  dailyLogs,
  fullHistory,
  userTargets,
  calorieStrategy = null,
  daysWindow = 14,
}) {
  const safeWindow = Math.max(7, Math.min(60, Number(daysWindow) || 14));
  const hardBlockLatestWeighIn = ({ latestEntry: le, previousValidEntry: pve }) => {
    console.log('[OutlierHardBlock]', { latestEntry: le, previousValidEntry: pve, triggered: true });
    return {
      avgKcalBalance: 0,
      weightDelta: 0,
      expectedWeightDelta: 0,
      discrepancy: 0,
      confidence: 'low',
      confidenceScore: 0,
      latestIsOutlier: true,
      outlierDetected: true,
      blockRecalibration: true,
      latestEntryIsOutlier: true,
      hardBlockOutlier: true,
      validDays: 0,
      sampleDays: [],
      dailyWindowReason: null,
      diagnosisType: 'outlier',
      diagnosisMessage: 'Pesata anomala: non viene usata per calibrare i target.',
      suggestion: {
        type: 'no_change',
        kcalAdjustment: 0,
        explanation: 'Pesata anomala: non viene usata per calibrare i target.',
      },
      explanation: {
        summary: 'Pesata anomala',
        reason: 'La variazione di peso è troppo grande per essere usata come calibrazione.',
        flags: {
          latestIsOutlier: true,
          outlierDetected: true,
          lowConfidence: true,
        },
      },
    };
  };
  const isSameWeighInRecord = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    const ida = a.id != null ? String(a.id) : '';
    const idb = b.id != null ? String(b.id) : '';
    if (ida && idb && ida === idb) return true;
    if (String(a.date) !== String(b.date)) return false;
    const tsa = Number(a.timestamp);
    const tsb = Number(b.timestamp);
    if (Number.isFinite(tsa) && Number.isFinite(tsb)) return tsa === tsb;
    if (!Number.isFinite(tsa) && !Number.isFinite(tsb)) return Number(a.weight) === Number(b.weight);
    return false;
  };
  const normalizedHistory = sortBodyMetricsHistoryByDateAsc(bodyMetricsHistory, new Date().toISOString().slice(0, 10));
  if (normalizedHistory.length < 2) {
    const flags = {
      outlierDetected: false,
      lowConfidence: true,
      insufficientData: true,
    };
    return {
      avgKcalBalance: 0,
      weightDelta: 0,
      expectedWeightDelta: 0,
      discrepancy: 0,
      confidence: 'low',
      confidenceScore: 0,
      outlierDetected: false,
      latestIsOutlier: false,
      blockRecalibration: false,
      latestEntryIsOutlier: false,
      suggestion: {
        type: 'no_change',
        kcalAdjustment: 0,
        explanation: 'Dati insufficienti o instabili: meglio attendere altre pesate.',
      },
      explanation: {
        summary: 'Dati pesate insufficienti',
        reason: 'insufficient_weigh_ins',
        flags,
      },
      diagnosisType: 'low_confidence',
      diagnosisMessage: 'Dati insufficienti o instabili: meglio attendere altre pesate.',
    };
  }

  const latestEntry = normalizedHistory[normalizedHistory.length - 1];
  const historyBeforeLatest = normalizedHistory.slice(0, -1);
  const nonOutlierBeforeLatest = [historyBeforeLatest[0]];
  for (let i = 1; i < historyBeforeLatest.length; i += 1) {
    const current = historyBeforeLatest[i];
    const prev = nonOutlierBeforeLatest[nonOutlierBeforeLatest.length - 1];
    const daysDiff = Math.max(
      1,
      Math.round((toDayTimestamp(current.date) - toDayTimestamp(prev.date)) / 86400000),
    );
    const outlierResult = isWeightOutlier(prev.weight, current.weight, daysDiff);
    console.log('[WeightOutlierCheck]', {
      prevWeight: prev.weight,
      currentWeight: current.weight,
      daysDiff,
      result: outlierResult,
    });
    if (outlierResult.isOutlier) continue;
    nonOutlierBeforeLatest.push(current);
  }
  const previousValidEntry = nonOutlierBeforeLatest[nonOutlierBeforeLatest.length - 1] || null;
  let latestIsOutlier = false;
  if (previousValidEntry) {
    const daysLatestEntryVsPrevValid = Math.max(
      1,
      Math.round(
        (toDayTimestamp(latestEntry.date) - toDayTimestamp(previousValidEntry.date)) / 86400000,
      ),
    );
    const latestCheck = isWeightOutlier(previousValidEntry.weight, latestEntry.weight, daysLatestEntryVsPrevValid);
    latestIsOutlier = latestCheck.isOutlier;
  }
  if (latestIsOutlier) {
    return hardBlockLatestWeighIn({ latestEntry, previousValidEntry });
  }

  const latestDateRaw = latestEntry.date;
  const minDateTs = toDayTimestamp(latestDateRaw) - ((safeWindow - 1) * 86400000);
  const windowHistoryRaw = normalizedHistory.filter((entry) => toDayTimestamp(entry.date) >= minDateTs);
  if (windowHistoryRaw.length < 2) {
    const flags = {
      outlierDetected: false,
      lowConfidence: true,
      insufficientData: true,
    };
    return {
      avgKcalBalance: 0,
      weightDelta: 0,
      expectedWeightDelta: 0,
      discrepancy: 0,
      confidence: 'low',
      confidenceScore: 0,
      outlierDetected: false,
      latestIsOutlier: false,
      blockRecalibration: false,
      latestEntryIsOutlier: false,
      suggestion: {
        type: 'no_change',
        kcalAdjustment: 0,
        explanation: 'Dati insufficienti o instabili: meglio attendere altre pesate.',
      },
      explanation: {
        summary: 'Finestra pesate insufficiente',
        reason: 'insufficient_weigh_ins',
        flags,
      },
      diagnosisType: 'low_confidence',
      diagnosisMessage: 'Dati insufficienti o instabili: meglio attendere altre pesate.',
    };
  }

  const nonOutlierSequence = [windowHistoryRaw[0]];
  const outlierEntries = [];
  for (let i = 1; i < windowHistoryRaw.length; i += 1) {
    const current = windowHistoryRaw[i];
    const prev = nonOutlierSequence[nonOutlierSequence.length - 1];
    const daysDiff = Math.max(
      1,
      Math.round((toDayTimestamp(current.date) - toDayTimestamp(prev.date)) / 86400000)
    );
    const outlierResult = isWeightOutlier(prev.weight, current.weight, daysDiff);
    console.log('[WeightOutlierCheck]', {
      prevWeight: prev.weight,
      currentWeight: current.weight,
      daysDiff,
      result: outlierResult,
    });
    if (outlierResult.isOutlier) {
      outlierEntries.push({ ...current, outlierReason: outlierResult.reason });
      continue;
    }
    nonOutlierSequence.push(current);
  }
  const outlierDetected = outlierEntries.length > 0;
  const latestValidEntry = nonOutlierSequence[nonOutlierSequence.length - 1] || null;
  const latestEntryIsOutlier = false;
  const rawLatestEntry = normalizedHistory[normalizedHistory.length - 1];
  const seqLatestEntry = nonOutlierSequence[nonOutlierSequence.length - 1] || null;
  const latestWeighInDroppedFromCleanSequence =
    !!seqLatestEntry && !!rawLatestEntry && !isSameWeighInRecord(seqLatestEntry, rawLatestEntry);
  if (latestWeighInDroppedFromCleanSequence) {
    return hardBlockLatestWeighIn({ latestEntry: rawLatestEntry, previousValidEntry: seqLatestEntry });
  }
  if (nonOutlierSequence.length < 2) {
    const flags = {
      outlierDetected,
      lowConfidence: true,
      insufficientData: true,
    };
    const dm = outlierDetected
      ? {
          diagnosisType: 'outlier',
          diagnosisMessage: 'Pesata anomala: non viene usata per calibrare i target.',
        }
      : {
          diagnosisType: 'low_confidence',
          diagnosisMessage: 'Dati insufficienti o instabili: meglio attendere altre pesate.',
        };
    return {
      avgKcalBalance: 0,
      weightDelta: 0,
      expectedWeightDelta: 0,
      discrepancy: 0,
      confidence: 'low',
      confidenceScore: 0,
      outlierDetected,
      latestIsOutlier: latestEntryIsOutlier,
      blockRecalibration: false,
      latestEntryIsOutlier,
      ...dm,
      suggestion: {
        type: 'no_change',
        kcalAdjustment: 0,
        explanation: dm.diagnosisMessage,
      },
      explanation: {
        summary: 'Sequenza pesate instabile',
        reason: 'outlier_detected',
        flags,
      },
    };
  }

  const latest = latestValidEntry;
  const latestDate = latest.date;
  const windowHistory = nonOutlierSequence;
  const oldest = windowHistory[0];
  const spanDays = dayDiffInclusive(oldest.date, latestDate);

  const deriveDailyLogsFromTracker = () => {
    if (!fullHistory || typeof fullHistory !== 'object' || Object.keys(fullHistory).length === 0) {
      return { rows: [], reason: 'missing_daily_logs' };
    }
    const out = [];
    const todayDate = new Date().toISOString().slice(0, 10);
    let cursor = oldest.date;
    while (cursor <= latestDate) {
      if (cursor > todayDate) break;
      const log = getLogFromStoricoTree(fullHistory, cursor) || [];
      if (Array.isArray(log) && log.length > 0) {
        const totals = computeTotali(log);
        const consumedKcal = Number(totals?.kcal);
        const workoutKcal = Number(totals?.workout);
        const targetsForDay = resolveTargetConfigForDate({
          targets: userTargets || {},
          date: cursor,
          todayDate,
        });
        let baseTargetKcal = Number(targetsForDay?.kcal);
        if (Number.isFinite(baseTargetKcal) && calorieStrategy) {
          baseTargetKcal = applyCalorieStrategyToProfileKcal(baseTargetKcal, calorieStrategy);
        }
        if (Number.isFinite(consumedKcal) && Number.isFinite(baseTargetKcal) && baseTargetKcal > 0) {
          const workoutBonus = Number.isFinite(workoutKcal) && workoutKcal > 0 ? workoutKcal : 0;
          const effectiveTargetKcal = baseTargetKcal + workoutBonus;
          out.push({
            date: cursor,
            kcalIn: consumedKcal,
            workoutKcal: workoutBonus,
            effectiveTargetKcal,
            kcalBalance: consumedKcal - effectiveTargetKcal,
          });
        }
      }
      const next = new Date(`${cursor}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      cursor = next.toISOString().slice(0, 10);
    }
    if (out.length === 0) return { rows: [], reason: 'missing_daily_logs' };
    if (out.length < 7) return { rows: out, reason: 'insufficient_logs' };
    return { rows: out, reason: null };
  };

  const providedDailyLogs = (Array.isArray(dailyLogs) ? dailyLogs : [])
    .filter((row) => row && isValidIsoDate(row.date) && Number.isFinite(Number(row.kcalBalance)))
    .filter((row) => row.date >= oldest.date && row.date <= latestDate);
  const fromTracker = deriveDailyLogsFromTracker();
  const validDailyLogs = providedDailyLogs.length > 0 ? providedDailyLogs : fromTracker.rows;
  const dailyWindowReason = providedDailyLogs.length > 0 ? null : fromTracker.reason;
  const validDays = validDailyLogs.length;
  const sampleDays = validDailyLogs.slice(Math.max(0, validDailyLogs.length - 3));

  if (validDailyLogs.length === 0) {
    const flags = {
      outlierDetected,
      lowConfidence: true,
      insufficientData: true,
    };
    const dm = outlierDetected
      ? {
          diagnosisType: 'outlier',
          diagnosisMessage: 'Pesata anomala: non viene usata per calibrare i target.',
        }
      : {
          diagnosisType: 'low_confidence',
          diagnosisMessage: 'Dati insufficienti o instabili: meglio attendere altre pesate.',
        };
    return {
      avgKcalBalance: 0,
      weightDelta: Number(latest.weight) - Number(oldest.weight),
      expectedWeightDelta: 0,
      discrepancy: Number(latest.weight) - Number(oldest.weight),
      confidence: 'low',
      confidenceScore: 0,
      outlierDetected,
      latestIsOutlier: latestEntryIsOutlier,
      blockRecalibration: false,
      latestEntryIsOutlier,
      ...dm,
      validDays: 0,
      sampleDays: [],
      dailyWindowReason: dailyWindowReason || 'missing_daily_logs',
      suggestion: {
        type: 'no_change',
        kcalAdjustment: 0,
        explanation: dm.diagnosisMessage,
      },
      explanation: {
        summary: 'Storico energetico assente',
        reason: dailyWindowReason || 'missing_daily_logs',
        flags,
      },
    };
  }

  const avgKcalBalance =
    validDailyLogs.reduce((sum, row) => sum + Number(row.kcalBalance), 0) / validDailyLogs.length;
  const weightDelta = Number(latest.weight) - Number(oldest.weight);
  const expectedWeightDelta = (avgKcalBalance * spanDays) / 7700;
  const discrepancy = weightDelta - expectedWeightDelta;
  const discrepancyAbs = Math.abs(discrepancy);

  const variance =
    validDailyLogs.reduce((acc, row) => {
      const d = Number(row.kcalBalance) - avgKcalBalance;
      return acc + (d * d);
    }, 0) / Math.max(1, validDailyLogs.length);
  const stdDev = Math.sqrt(variance);

  const normalizedWeightRate = [];
  for (let i = 1; i < windowHistory.length; i += 1) {
    const prev = windowHistory[i - 1];
    const curr = windowHistory[i];
    const dd = Math.max(1, Math.round((toDayTimestamp(curr.date) - toDayTimestamp(prev.date)) / 86400000));
    const dkg = Number(curr.weight) - Number(prev.weight);
    if (Number.isFinite(dkg)) normalizedWeightRate.push(dkg / dd);
  }
  const absAvgWeightRate =
    normalizedWeightRate.length > 0
      ? normalizedWeightRate.reduce((s, v) => s + Math.abs(v), 0) / normalizedWeightRate.length
      : 0;
  const highWeightVolatility = absAvgWeightRate > 0.6;

  const penalties = {
    weighIns: windowHistory.length < 3 ? 0.3 : 0,
    logs: validDays < 7 ? 0.3 : 0,
    outliers: outlierDetected ? 0.4 : 0,
    volatility: highWeightVolatility ? 0.2 : 0,
  };
  const rawScore = 1 - (penalties.weighIns + penalties.logs + penalties.outliers + penalties.volatility);
  let confidenceScore = Math.max(0, Math.min(1, rawScore));
  if (outlierDetected) {
    confidenceScore = Math.min(0.3, confidenceScore);
  }
  console.log('[ConfidenceScore]', {
    score: confidenceScore,
    penalties,
  });

  let confidence = 'high';
  if (confidenceScore <= 0.7) confidence = 'medium';
  if (confidenceScore < 0.4) confidence = 'low';
  if (outlierDetected) {
    confidence = 'low';
  }

  const smallThresholdKg = RECAL_SMALL_DISCREPANCY_KG;
  const flags = {
    outlierDetected,
    lowConfidence: confidence === 'low',
    insufficientData: windowHistory.length < 3 || validDays < 7,
  };

  if (confidence === 'low') {
    const { diagnosisType, diagnosisMessage } = pickRecalibrationDiagnosis({
      latestIsOutlier: latestEntryIsOutlier,
      outlierDetected,
      confidence,
      discrepancyAbs,
      validDays,
      dailyWindowReason,
      smallThresholdKg,
    });
    return {
      avgKcalBalance,
      weightDelta,
      expectedWeightDelta,
      discrepancy,
      confidence,
      confidenceScore,
      outlierDetected,
      latestIsOutlier: latestEntryIsOutlier,
      blockRecalibration: false,
      latestEntryIsOutlier,
      diagnosisType,
      diagnosisMessage,
      validDays,
      sampleDays,
      dailyWindowReason,
      suggestion: {
        type: 'no_change',
        kcalAdjustment: 0,
        explanation: diagnosisMessage,
      },
      explanation: {
        summary: 'Analisi sospesa per stabilita dati',
        reason: 'low_confidence',
        flags,
      },
    };
  }

  if (discrepancyAbs < smallThresholdKg) {
    return {
      avgKcalBalance,
      weightDelta,
      expectedWeightDelta,
      discrepancy,
      confidence,
      confidenceScore,
      outlierDetected,
      latestIsOutlier: latestEntryIsOutlier,
      blockRecalibration: false,
      latestEntryIsOutlier,
      diagnosisType: 'normal_variation',
      diagnosisMessage:
        'Peso e bilancio energetico sono compatibili: nessuna correzione necessaria.',
      validDays,
      sampleDays,
      dailyWindowReason,
      suggestion: {
        type: 'no_change',
        kcalAdjustment: 0,
        explanation: diagnosisMessage,
      },
      explanation: {
        summary: 'Trend allineato',
        reason: 'no_change',
        flags,
      },
    };
  }

  const kcalPerDayFromDiscrepancy = Math.round((discrepancyAbs * 7700) / Math.max(1, spanDays));
  const boundedAdjustment = Math.max(40, Math.min(260, kcalPerDayFromDiscrepancy));

  let type = 'no_change';
  let signedAdjustment = 0;
  let explanation = 'Dati non conclusivi, meglio mantenere i target attuali.';

  if ((avgKcalBalance < 0 && weightDelta > 0) || (avgKcalBalance > 0 && weightDelta < 0)) {
    type = 'increase_tdee';
    signedAdjustment = boundedAdjustment;
    explanation = 'Peso e bilancio energetico sono in conflitto: conviene riallineare la stima energetica verso l’alto.';
  } else if (weightDelta > expectedWeightDelta + smallThresholdKg) {
    type = 'decrease_tdee';
    signedAdjustment = -boundedAdjustment;
    explanation = 'Il peso sale piu del previsto: meglio ridurre il target calorico corrente.';
  } else if (weightDelta < expectedWeightDelta - smallThresholdKg) {
    type = 'increase_tdee';
    signedAdjustment = boundedAdjustment;
    explanation = 'Il peso scende piu del previsto: meglio aumentare il target calorico corrente.';
  }

  const { diagnosisType, diagnosisMessage } = pickRecalibrationDiagnosis({
    latestIsOutlier: latestEntryIsOutlier,
    outlierDetected,
    confidence,
    discrepancyAbs,
    validDays,
    dailyWindowReason,
    smallThresholdKg,
  });

  let finalType = type;
  let finalSigned = signedAdjustment;
  let finalExplanation = explanation;
  if (diagnosisType === 'intake_tracking_error') {
    finalType = 'no_change';
    finalSigned = 0;
    finalExplanation = diagnosisMessage;
  }

  return {
    avgKcalBalance,
    weightDelta,
    expectedWeightDelta,
    discrepancy,
    confidence,
    confidenceScore,
    outlierDetected,
    latestIsOutlier: latestEntryIsOutlier,
    blockRecalibration: false,
    latestEntryIsOutlier,
    diagnosisType,
    diagnosisMessage,
    validDays,
    sampleDays,
    dailyWindowReason,
    suggestion: {
      type: finalType,
      kcalAdjustment: finalSigned,
      explanation: finalExplanation,
    },
    explanation: {
      summary: 'Proposta di ricalibrazione disponibile',
      reason: finalType,
      flags,
    },
  };
}

/**
 * Autopilota metabolico: prot fisse, delta kcal su CHO/FAT 50/50.
 * Mantiene formula e limiti originali.
 */
export function buildTdeeTargetsFromRequest({ newKcal, userTargets, protOverride }) {
  const requested = Math.round(Number(newKcal));
  if (!Number.isFinite(requested) || requested < 800 || requested > 12000) {
    return { error: 'Valore kcal non valido.' };
  }

  const oldKcal = userTargets?.kcal ?? 2000;
  const deltaKcal = requested - oldKcal;
  const newPro =
    protOverride != null && Number.isFinite(Number(protOverride))
      ? Math.round(Number(protOverride))
      : Math.round(userTargets?.prot ?? userTargets?.pro ?? 150);
  const deltaChoGrams = (deltaKcal * 0.5) / 4;
  const deltaFatGrams = (deltaKcal * 0.5) / 9;
  const baseCarb = userTargets?.carb ?? userTargets?.cho ?? 200;
  const baseFat = userTargets?.fatTotal ?? userTargets?.fat ?? 70;
  const newCho = Math.max(50, Math.round(baseCarb + deltaChoGrams));
  const newFat = Math.max(30, Math.round(baseFat + deltaFatGrams));
  const finalKcal = Math.round(newPro * 4 + newCho * 4 + newFat * 9);

  return { requested, finalKcal, newPro, newCho, newFat };
}

export function mergeHistoryWithLatestWeigh({ bodyMetricsHistory, weighDate, payload, metricEntryToIsoDay }) {
  const list = Array.isArray(bodyMetricsHistory) ? [...bodyMetricsHistory] : [];
  const filtered = list.filter((e) => metricEntryToIsoDay(e) !== weighDate);
  filtered.push(payload);
  return filtered;
}

export function normalizePredictiveCalibrationState(v) {
  if (!v || typeof v !== 'object') {
    return { errors: [] };
  }
  return {
    errors: Array.isArray(v.errors) ? v.errors : [],
    updatedAt: v.updatedAt,
  };
}

export function removeBodyMetricsEntry({ history, entryId }) {
  if (!Array.isArray(history)) return [];
  if (entryId == null || entryId === '') return history;

  const asString = String(entryId);
  const hasIdMatch = history.some((entry) => String(entry?.id ?? '') === asString);
  if (hasIdMatch) {
    return history.filter((entry) => String(entry?.id ?? '') !== asString);
  }

  const asNumber = Number(entryId);
  if (Number.isFinite(asNumber)) {
    const hasTimestampMatch = history.some((entry) => Number(entry?.timestamp) === asNumber);
    if (hasTimestampMatch) {
      return history.filter((entry) => Number(entry?.timestamp) !== asNumber);
    }
  }

  return history;
}
