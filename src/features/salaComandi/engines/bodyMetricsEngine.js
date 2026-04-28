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
    .filter(Boolean)
    .sort((a, b) => {
      const d = String(a.date || '').localeCompare(String(b.date || ''));
      if (d !== 0) return d;
      return (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0);
    });
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
