/**
 * Target metabolici per Shiftable Training Block.
 * Preferisce Wave Nutrition pre-calcolata sul giorno; altrimenti formule locali.
 *
 * Contratto calorico scisso:
 * - baseKcal  → TDEE di mantenimento (immutabile)
 * - deltaKcal → modificatore del blocco/giorno (surplus o deficit)
 * - targetKcal → netto finale (base + delta)
 */

export const TRAINING_BLOCK_FALLBACK_BASE_KCAL = 2400;

/** Moltiplicatori sul TDEE di mantenimento per macroGoal. */
export const MACRO_GOAL_MULTIPLIERS = Object.freeze({
  cut: 0.85,
  recomp: 0.95,
  maintain: 1.0,
  bulk: 1.12,
});

/** Aggiustamento giorno: rest leggermente sotto, workout invariato sul goal. */
export const DAY_TYPE_MULTIPLIERS = Object.freeze({
  rest: 0.92,
  pesi: 1.0,
  cardio: 1.0,
  hiit: 1.02,
});

/** Quota del delta spalmeta su CHO vs FAT (il resto sul partner). */
export const DELTA_CARB_SHARE = 0.5;
export const TARGET_BAND_KCAL = 80;
export const SURPLUS_MARGIN_KCAL = 140;

/**
 * Delta calorico suggerito per obiettivo blocco ↔ Calibrazione Target & Bilancio.
 * @type {Record<string, { suggestedDeltaKcal: number, energyBadgeLabel: string, ghostGoal: 'cut'|'maintain'|'bulk' }>}
 */
export const TRAINING_BLOCK_MACRO_GOAL_CALIBRATION = Object.freeze({
  cut: {
    suggestedDeltaKcal: -350,
    energyBadgeLabel: 'Deficit −350 kcal',
    ghostGoal: 'cut',
  },
  bulk: {
    suggestedDeltaKcal: 275,
    energyBadgeLabel: 'Surplus +275 kcal',
    ghostGoal: 'bulk',
  },
  recomp: {
    suggestedDeltaKcal: 0,
    energyBadgeLabel: 'Mantenimento · focus proteico',
    ghostGoal: 'maintain',
  },
  maintain: {
    suggestedDeltaKcal: 0,
    energyBadgeLabel: 'Mantenimento',
    ghostGoal: 'maintain',
  },
});

/**
 * @param {string | null | undefined} macroGoal
 * @returns {typeof TRAINING_BLOCK_MACRO_GOAL_CALIBRATION.maintain}
 */
export function resolveTrainingBlockMacroGoalCalibration(macroGoal) {
  const raw = String(macroGoal || 'maintain').trim().toLowerCase();
  if (raw === 'cut' || raw === 'deficit' || raw === 'dimagrimento') {
    return TRAINING_BLOCK_MACRO_GOAL_CALIBRATION.cut;
  }
  if (raw === 'bulk' || raw === 'surplus' || raw === 'massa') {
    return TRAINING_BLOCK_MACRO_GOAL_CALIBRATION.bulk;
  }
  if (raw === 'recomp' || raw === 'ricomposizione') {
    return TRAINING_BLOCK_MACRO_GOAL_CALIBRATION.recomp;
  }
  return TRAINING_BLOCK_MACRO_GOAL_CALIBRATION.maintain;
}

/**
 * @param {string | null | undefined} macroGoal
 * @param {number | null | undefined} [liveDeltaKcal]
 * @returns {string}
 */
export function formatTrainingBlockEnergyBadge(macroGoal, liveDeltaKcal = null) {
  const cal = resolveTrainingBlockMacroGoalCalibration(macroGoal);
  const live = Number(liveDeltaKcal);
  if (Number.isFinite(live) && Math.abs(live - cal.suggestedDeltaKcal) > 25) {
    if (live < -25) return `Deficit ${live} kcal`;
    if (live > 25) return `Surplus +${live} kcal`;
    return 'Mantenimento';
  }
  return cal.energyBadgeLabel;
}

/**
 * @param {{
 *   weight?: number,
 *   peso?: number,
 *   height?: number,
 *   age?: number,
 *   gender?: string,
 *   activityLevel?: string | number,
 * }} [profile]
 * @returns {number | null}
 */
export function computeMaintenanceTdeeFromProfile(profile) {
  const weight = Number(profile?.weight ?? profile?.peso);
  const height = Number(profile?.height);
  const age = Number(profile?.age);
  if (!(weight > 0) || !(height > 0) || !(age > 0)) return null;

  const gender = String(profile?.gender || 'M').toUpperCase();
  const isFemale = gender === 'F' || gender === 'FEMALE' || gender === 'DONNA';
  const activityRaw = Number(profile?.activityLevel);
  const activityFactor = Number.isFinite(activityRaw) && activityRaw > 0 ? activityRaw : 1.55;

  const bmr = (10 * weight) + (6.25 * height) - (5 * age) + (isFemale ? -161 : 5);
  const tdee = bmr * activityFactor;
  if (!Number.isFinite(tdee) || tdee <= 0) return null;
  const clamped = Math.min(5000, Math.max(1200, tdee));
  return Math.round(clamped / 10) * 10;
}

/**
 * Base kcal immutabile (mai userTargets.kcal giornalieri).
 *
 * @param {{
 *   userProfile?: object | null,
 *   fallback?: number,
 * }} [options]
 * @returns {number}
 */
export function resolveImmutableBaseKcal(options = {}) {
  const profile = options.userProfile && typeof options.userProfile === 'object'
    ? options.userProfile
    : {};
  const fallback = Number(options.fallback) > 0
    ? Math.round(Number(options.fallback))
    : TRAINING_BLOCK_FALLBACK_BASE_KCAL;

  for (const raw of [profile.baseKcal, profile.maintenanceKcal, profile.tdee, profile.tdeeKcal]) {
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n >= 1200 && n <= 5000) return n;
  }

  const fromBody = computeMaintenanceTdeeFromProfile(profile);
  if (fromBody != null) return fromBody;

  const profileTarget = Math.round(Number(profile.targetCalories));
  if (Number.isFinite(profileTarget) && profileTarget >= 1200 && profileTarget <= 5000) {
    return profileTarget;
  }

  return fallback;
}

/**
 * @param {string} macroGoal
 * @param {string} dayType
 * @returns {{ goalMult: number, dayMult: number }}
 */
export function resolveTrainingBlockMultipliers(macroGoal, dayType) {
  const goal = String(macroGoal || 'maintain').toLowerCase();
  const type = String(dayType || 'rest').toLowerCase();
  const goalMult = MACRO_GOAL_MULTIPLIERS[goal] ?? MACRO_GOAL_MULTIPLIERS.maintain;
  const dayMult = DAY_TYPE_MULTIPLIERS[type] ?? (type === 'rest' ? 0.92 : 1.0);
  return { goalMult, dayMult };
}

/**
 * Proteine fisse da peso corporeo (g).
 * @param {number} weightKg
 * @returns {number}
 */
export function resolveFixedProteinGrams(weightKg = 75) {
  const weight = Number.isFinite(Number(weightKg)) && Number(weightKg) > 0
    ? Number(weightKg)
    : 75;
  return Math.round(Math.max(weight * 2.0, weight * 1.8));
}

/**
 * Distribuisce un delta calorico su CHO/FAT (50/50 kcal), proteine invariate.
 *
 * @param {{
 *   baseKcal: number,
 *   deltaKcal: number,
 *   protGrams: number,
 *   weightKg?: number,
 * }} input
 * @returns {{ carb: number, fat: number, fatTotal: number }}
 */
export function distributeDeltaAcrossCarbFat({
  baseKcal,
  deltaKcal,
  protGrams,
  weightKg = 75,
}) {
  const base = Math.max(1200, Math.round(Number(baseKcal) || TRAINING_BLOCK_FALLBACK_BASE_KCAL));
  const delta = Math.round(Number(deltaKcal) || 0);
  const prot = Math.max(40, Math.round(Number(protGrams) || resolveFixedProteinGrams(weightKg)));
  const weight = Number.isFinite(Number(weightKg)) && Number(weightKg) > 0
    ? Number(weightKg)
    : 75;

  const protKcal = prot * 4;
  const fatBase = Math.round(Math.max(weight * 0.8, (base * 0.25) / 9));
  const fatBaseKcal = fatBase * 9;
  const carbBase = Math.max(80, Math.round((base - protKcal - fatBaseKcal) / 4));

  const carbShare = Math.min(1, Math.max(0, DELTA_CARB_SHARE));
  const deltaCarbGrams = (delta * carbShare) / 4;
  const deltaFatGrams = (delta * (1 - carbShare)) / 9;

  const carb = Math.max(50, Math.round(carbBase + deltaCarbGrams));
  const fat = Math.max(30, Math.round(fatBase + deltaFatGrams));

  return { carb, fat, fatTotal: fat };
}

/**
 * Soglie Minimal HUD derivate da base/delta/target reali.
 *
 * @param {{
 *   baseKcal: number,
 *   deltaKcal?: number,
 *   targetKcal: number,
 *   targetBandKcal?: number,
 *   surplusMarginKcal?: number,
 * }} input
 */
export function buildMetabolicMapThresholdsFromSplit({
  baseKcal,
  deltaKcal,
  targetKcal,
  targetBandKcal = TARGET_BAND_KCAL,
  surplusMarginKcal = SURPLUS_MARGIN_KCAL,
}) {
  const base = Math.max(0, Math.round(Number(baseKcal) || 0));
  const target = Math.max(0, Math.round(Number(targetKcal) || base));
  const delta = Math.round(
    Number.isFinite(Number(deltaKcal)) ? Number(deltaKcal) : (target - base),
  );
  const band = Math.max(20, Math.round(Number(targetBandKcal) || TARGET_BAND_KCAL));
  const margin = Math.max(40, Math.round(Number(surplusMarginKcal) || SURPLUS_MARGIN_KCAL));

  if (delta < 0) {
    // Cut: viola = obiettivo deficit, rosso = rientro sul TDEE (mantenimento)
    const targetEnd = target;
    const targetStart = Math.max(0, targetEnd - band);
    let deficit = targetEnd;
    if (deficit <= targetStart) deficit = Math.max(0, targetStart - 20);
    const surplus = Math.max(base, targetEnd + margin);
    return {
      deficitKcal: deficit,
      targetStartKcal: targetStart,
      targetEndKcal: targetEnd,
      surplusKcal: surplus,
      maxScaleKcal: Math.max(base + 500, targetEnd + 500, surplus + 150, 2000),
    };
  }

  // Bulk / maintain: viola = TDEE, fascia verde/arancio intorno al target netto
  const deficit = base > 0 ? base : Math.max(0, target - band - 40);
  let targetEnd = target;
  let targetStart = Math.max(deficit + 20, targetEnd - band);
  if (targetStart >= targetEnd) {
    targetStart = Math.max(0, targetEnd - band);
  }
  const surplus = targetEnd + margin;
  return {
    deficitKcal: deficit,
    targetStartKcal: targetStart,
    targetEndKcal: targetEnd,
    surplusKcal: surplus,
    maxScaleKcal: Math.max(targetEnd + 500, surplus + 150, 2000),
  };
}

/**
 * Calcola i macro giornalieri dal macroGoal del blocco e dal tipo sessione corrente.
 * Espone baseKcal / deltaKcal / targetKcal distinti (niente fusione opaca).
 *
 * @param {{
 *   baseKcal: number,
 *   weightKg?: number,
 *   macroGoal?: string,
 *   dayType?: string,
 * }} input
 * @returns {{
 *   kcal: number,
 *   targetKcal: number,
 *   baseKcal: number,
 *   deltaKcal: number,
 *   prot: number,
 *   carb: number,
 *   fat: number,
 *   fatTotal: number,
 *   goalMult: number,
 *   dayMult: number,
 *   metabolicMapThresholds: object,
 *   source?: string,
 * }}
 */
export function computeTrainingBlockDailyTargets({
  baseKcal,
  weightKg = 75,
  macroGoal = 'maintain',
  dayType = 'rest',
}) {
  const base = Number.isFinite(Number(baseKcal)) && Number(baseKcal) > 0
    ? Math.round(Number(baseKcal))
    : TRAINING_BLOCK_FALLBACK_BASE_KCAL;
  const weight = Number.isFinite(Number(weightKg)) && Number(weightKg) > 0
    ? Number(weightKg)
    : 75;

  const { goalMult, dayMult } = resolveTrainingBlockMultipliers(macroGoal, dayType);
  const targetKcal = Math.max(1200, Math.round(base * goalMult * dayMult));
  const deltaKcal = targetKcal - base;

  const prot = resolveFixedProteinGrams(weight);
  const { carb, fat, fatTotal } = distributeDeltaAcrossCarbFat({
    baseKcal: base,
    deltaKcal,
    protGrams: prot,
    weightKg: weight,
  });

  const metabolicMapThresholds = buildMetabolicMapThresholdsFromSplit({
    baseKcal: base,
    deltaKcal,
    targetKcal,
  });

  return {
    kcal: targetKcal,
    targetKcal,
    baseKcal: base,
    deltaKcal,
    prot,
    carb,
    fat,
    fatTotal,
    goalMult,
    dayMult,
    metabolicMapThresholds,
    source: 'formula',
  };
}

/**
 * True se il giorno ha target Wave Nutrition pre-calcolati validi.
 * @param {object | null | undefined} day
 */
export function dayHasWaveNutritionTargets(day) {
  if (!day || typeof day !== 'object') return false;
  const kcal = Math.round(Number(day.targetKcal));
  const prot = Math.round(Number(day.targetProt));
  const carb = Math.round(Number(day.targetCarb));
  const fat = Math.round(Number(day.targetFat));
  return [kcal, prot, carb, fat].every((n) => Number.isFinite(n) && n >= 0) && kcal >= 1200;
}

/**
 * Preferisce i target AI/fallback salvati sul giorno; altrimenti formula classica.
 *
 * @param {object | null | undefined} session
 * @param {{
 *   baseKcal?: number,
 *   weightKg?: number,
 *   macroGoal?: string,
 * }} [fallbackCtx]
 */
export function resolveTargetsFromTrainingBlockDay(session, fallbackCtx = {}) {
  const baseKcal = Number.isFinite(Number(fallbackCtx.baseKcal)) && Number(fallbackCtx.baseKcal) > 0
    ? Math.round(Number(fallbackCtx.baseKcal))
    : TRAINING_BLOCK_FALLBACK_BASE_KCAL;

  if (dayHasWaveNutritionTargets(session)) {
    const targetKcal = Math.round(Number(session.targetKcal));
    const prot = Math.round(Number(session.targetProt));
    const carb = Math.round(Number(session.targetCarb));
    const fat = Math.round(Number(session.targetFat));
    const deltaKcal = targetKcal - baseKcal;
    const metabolicMapThresholds = buildMetabolicMapThresholdsFromSplit({
      baseKcal,
      deltaKcal,
      targetKcal,
    });
    return {
      kcal: targetKcal,
      targetKcal,
      baseKcal,
      deltaKcal,
      prot,
      carb,
      fat,
      fatTotal: fat,
      goalMult: 1,
      dayMult: 1,
      metabolicMapThresholds,
      source: 'wave-nutrition',
    };
  }

  return computeTrainingBlockDailyTargets({
    baseKcal,
    weightKg: fallbackCtx.weightKg,
    macroGoal: fallbackCtx.macroGoal,
    dayType: session?.type || 'rest',
  });
}

/**
 * Fallback offline: TDEE piatto (±300 per bulk/cut) + prot 2g/kg, delta su CHO/FAT.
 * Stessa forma di generatePeriodizedTargets → nutritionDays.
 *
 * @param {{
 *   tdee: number,
 *   macroGoal?: string,
 *   daysArray: Array<object>,
 *   weightKg?: number,
 * }} input
 * @returns {{ nutritionDays: Array<object> }}
 */
export function buildEmergencyWaveNutritionDays({
  tdee,
  macroGoal = 'maintain',
  daysArray = [],
  weightKg = 75,
}) {
  const base = Number.isFinite(Number(tdee)) && Number(tdee) > 0
    ? Math.round(Number(tdee))
    : TRAINING_BLOCK_FALLBACK_BASE_KCAL;
  const goal = String(macroGoal || 'maintain').trim().toLowerCase();
  let deltaKcal = 0;
  if (goal === 'bulk') deltaKcal = 300;
  else if (goal === 'cut') deltaKcal = -300;

  const targetKcal = Math.min(5000, Math.max(1200, base + deltaKcal));
  const weight = Number.isFinite(Number(weightKg)) && Number(weightKg) > 0
    ? Number(weightKg)
    : 75;
  const prot = resolveFixedProteinGrams(weight);
  const { carb, fat } = distributeDeltaAcrossCarbFat({
    baseKcal: base,
    deltaKcal: targetKcal - base,
    protGrams: prot,
    weightKg: weight,
  });

  const nutritionDays = (Array.isArray(daysArray) ? daysArray : []).map((d, i) => {
    const dayIndex = Number.isFinite(Number(d?.dayIndex))
      ? Math.floor(Number(d.dayIndex))
      : i;
    return {
      dayIndex,
      targetKcal,
      targetProt: prot,
      targetCarb: carb,
      targetFat: fat,
      baseKcal: base,
      deltaKcal: targetKcal - base,
    };
  });

  return { nutritionDays };
}
