import {
  computeDataDrivenTdeeWithCoach as computeDataDrivenTdeeWithCoachBase,
  goalFromProfile as goalFromProfileBase,
} from '../../../dataDrivenTdee';
import { mergeDuplicateBiometrics as mergeDuplicateBiometricsBase } from '../../../biometricHistory';
import { recalculateUserTargets as recalculateUserTargetsBase } from '../../../targetsEngine';

export const computeDataDrivenTdeeWithCoach = computeDataDrivenTdeeWithCoachBase;
export const mergeDuplicateBiometrics = mergeDuplicateBiometricsBase;
export const recalculateUserTargets = recalculateUserTargetsBase;
export const goalFromProfile = goalFromProfileBase;

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
