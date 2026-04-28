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
