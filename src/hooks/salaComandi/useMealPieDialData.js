/**
 * Quadrante Home (pie pasti + telemetria kcal): stato dial, dati torta e HUD.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  buildMealPieData,
  buildMealPieDisplayData,
} from '../../features/salaComandi/utils/mealPieData';
import { resolveKcalDialTelemetry, resolveKcalZoneHudLabel } from '../../utils/kcalDialTelemetry';
import { safeNum } from '../../utils/salaComandiUtils';

export const MEAL_PIE_DIAL_MODES = Object.freeze(['kcal', 'pro', 'cho', 'fat']);

/**
 * @param {{
 *   activeLog?: object[],
 *   userTargets?: object|null,
 *   homeCalorieSplit?: object|null,
 *   dynamicDailyKcal?: number,
 *   baseKcal?: number,
 *   userProfileKcalBase?: number,
 *   dogmaticTargetKcal?: number,
 *   dogmaticSettingsBaseKcal?: number,
 *   dogmaticDeltaKcal?: number,
 *   dogmaticCompensationKcal?: number,
 *   profileTdeeKcal?: number|null,
 *   totali?: object|null,
 *   hasPlannedBlock?: boolean,
 *   selectedMealCenter?: object|null,
 * }} params
 */
export function useMealPieDialData({
  activeLog = [],
  userTargets = null,
  homeCalorieSplit = null,
  dynamicDailyKcal = 0,
  baseKcal = 0,
  userProfileKcalBase = 0,
  dogmaticTargetKcal = 0,
  dogmaticSettingsBaseKcal = 0,
  dogmaticDeltaKcal = 0,
  dogmaticCompensationKcal = 0,
  profileTdeeKcal = null,
  totali = null,
  hasPlannedBlock = false,
  selectedMealCenter = null,
} = {}) {
  const [activeDialMode, setActiveDialMode] = useState('kcal');

  const cycleDialMode = useCallback(() => {
    setActiveDialMode((prev) => {
      const i = MEAL_PIE_DIAL_MODES.indexOf(prev);
      const next = MEAL_PIE_DIAL_MODES[(i >= 0 ? i + 1 : 0) % MEAL_PIE_DIAL_MODES.length];
      return next;
    });
  }, []);

  const mealPieData = useMemo(() => {
    const dailyTargetKcal =
      Math.round(
        safeNum(homeCalorieSplit?.targetKcal)
        || safeNum(dynamicDailyKcal)
        || safeNum(baseKcal)
        || safeNum(userProfileKcalBase)
        || safeNum(userTargets?.kcal)
        || 2000,
      ) || 2000;
    return buildMealPieData({
      activeLog,
      dailyTargetKcal,
    });
  }, [
    activeLog,
    userTargets?.kcal,
    dynamicDailyKcal,
    baseKcal,
    userProfileKcalBase,
    homeCalorieSplit?.targetKcal,
  ]);

  const mealPieDisplayData = useMemo(() => buildMealPieDisplayData({
    mealPieData,
    activeDialMode,
    userTargets,
  }), [mealPieData, activeDialMode, userTargets?.prot, userTargets?.carb, userTargets?.fat, userTargets?.fatTotal]);

  const homeKcalDialTelemetry = useMemo(() => {
    const split = homeCalorieSplit || {};
    const dailyTarget = Math.round(
      Number(split.targetKcal)
      || Number(dynamicDailyKcal)
      || Number(dogmaticTargetKcal)
      || Number(baseKcal)
      || Number(userProfileKcalBase)
      || Number(userTargets?.kcal)
      || 2500,
    );
    const thresholdOverrides = split.metabolicMapThresholds ?? null;
    return resolveKcalDialTelemetry({
      tdeeKcal: split.baseKcal || dogmaticSettingsBaseKcal || profileTdeeKcal,
      dailyTargetKcal: dailyTarget,
      consumedKcal: Number(totali?.kcal) || 0,
      plannedDelta: split.deltaKcal,
      thresholds: thresholdOverrides,
    });
  }, [
    homeCalorieSplit,
    dynamicDailyKcal,
    dogmaticTargetKcal,
    dogmaticSettingsBaseKcal,
    baseKcal,
    userProfileKcalBase,
    userTargets?.kcal,
    profileTdeeKcal,
    totali?.kcal,
  ]);

  const selectedMealCenterIndex = selectedMealCenter
    ? mealPieDisplayData.findIndex((e) => e.id === selectedMealCenter.id)
    : -1;

  const dialHud = useMemo(() => {
    const targetProt = userTargets?.prot ?? 150;
    const targetCarb = userTargets?.carb ?? 200;
    const targetFat = userTargets?.fatTotal ?? userTargets?.fat ?? 65;
    const dialPlannedDelta = dogmaticDeltaKcal + dogmaticCompensationKcal;
    const dialDailyTargetKcal = Math.round(
      Number(dogmaticTargetKcal)
      || Number(dynamicDailyKcal)
      || Number(homeCalorieSplit?.targetKcal)
      || 0,
    );
    const dialConsumedKcal = Math.round(Number(totali?.kcal) || 0);
    const dialKcalSurplus =
      dialConsumedKcal > dialDailyTargetKcal ? dialConsumedKcal - dialDailyTargetKcal : 0;
    const dialKcalRemaining = Math.max(0, dialDailyTargetKcal - dialConsumedKcal);
    const dialKcalRestLabel =
      dialKcalSurplus > 0 ? 'OLTRE IL TARGET' : 'KCAL RESTANTI';
    const showKcalTelemetryRings = activeDialMode === 'kcal' && !selectedMealCenter;
    const telemetry = homeKcalDialTelemetry;
    const zoneHud = resolveKcalZoneHudLabel(telemetry);
    const showMaintenanceMarker =
      activeDialMode === 'kcal'
      && hasPlannedBlock
      && dialDailyTargetKcal > 0
      && !showKcalTelemetryRings;
    const maintenanceMarkerRatio = showMaintenanceMarker && profileTdeeKcal != null
      ? profileTdeeKcal / dialDailyTargetKcal
      : 0;
    const maintenanceMarkerIsDeficit = dialPlannedDelta < 0;

    return {
      targetProt,
      targetCarb,
      targetFat,
      dialPlannedDelta,
      dialDailyTargetKcal,
      dialConsumedKcal,
      dialKcalSurplus,
      dialKcalRemaining,
      dialKcalRestLabel,
      showKcalTelemetryRings,
      telemetry,
      zoneHud,
      showMaintenanceMarker,
      maintenanceMarkerRatio,
      maintenanceMarkerIsDeficit,
    };
  }, [
    userTargets?.prot,
    userTargets?.carb,
    userTargets?.fatTotal,
    userTargets?.fat,
    dogmaticDeltaKcal,
    dogmaticCompensationKcal,
    dogmaticTargetKcal,
    dynamicDailyKcal,
    homeCalorieSplit?.targetKcal,
    totali?.kcal,
    activeDialMode,
    selectedMealCenter,
    homeKcalDialTelemetry,
    hasPlannedBlock,
    profileTdeeKcal,
  ]);

  return {
    activeDialMode,
    setActiveDialMode,
    cycleDialMode,
    mealPieData,
    mealPieDisplayData,
    homeKcalDialTelemetry,
    selectedMealCenterIndex,
    dialHud,
  };
}

export default useMealPieDialData;
