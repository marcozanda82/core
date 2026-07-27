/**
 * Target metabolici per Shiftable Training Block.
 * Preferisce Wave Nutrition pre-calcolata sul giorno; altrimenti formule locali.
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
 * Calcola i macro giornalieri dal macroGoal del blocco e dal tipo sessione corrente.
 *
 * @param {{
 *   baseKcal: number,
 *   weightKg?: number,
 *   macroGoal?: string,
 *   dayType?: string,
 * }} input
 * @returns {{
 *   kcal: number,
 *   prot: number,
 *   carb: number,
 *   fat: number,
 *   fatTotal: number,
 *   baseKcal: number,
 *   goalMult: number,
 *   dayMult: number,
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
  const kcal = Math.max(1200, Math.round(base * goalMult * dayMult));

  const prot = Math.round(Math.max(weight * 2.0, weight * 1.8));
  const fat = Math.round(Math.max(weight * 0.8, (kcal * 0.25) / 9));
  const protKcal = prot * 4;
  const fatKcal = fat * 9;
  const carb = Math.max(80, Math.round((kcal - protKcal - fatKcal) / 4));

  return {
    kcal,
    prot,
    carb,
    fat,
    fatTotal: fat,
    baseKcal: base,
    goalMult,
    dayMult,
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
  if (dayHasWaveNutritionTargets(session)) {
    const kcal = Math.round(Number(session.targetKcal));
    const prot = Math.round(Number(session.targetProt));
    const carb = Math.round(Number(session.targetCarb));
    const fat = Math.round(Number(session.targetFat));
    return {
      kcal,
      prot,
      carb,
      fat,
      fatTotal: fat,
      baseKcal: Number(fallbackCtx.baseKcal) || kcal,
      goalMult: 1,
      dayMult: 1,
      source: 'wave-nutrition',
    };
  }

  return computeTrainingBlockDailyTargets({
    baseKcal: fallbackCtx.baseKcal,
    weightKg: fallbackCtx.weightKg,
    macroGoal: fallbackCtx.macroGoal,
    dayType: session?.type || 'rest',
  });
}

/**
 * Fallback offline: TDEE piatto (±300 per bulk/cut) + prot 2g/kg, fat ~25%, carbo a riempimento.
 * Stessa forma di generatePeriodizedTargets → nutritionDays.
 *
 * @param {{
 *   tdee: number,
 *   macroGoal?: string,
 *   daysArray: Array<object>,
 *   weightKg?: number,
 * }} input
 * @returns {{ nutritionDays: Array<{ dayIndex: number, targetKcal: number, targetCarb: number, targetProt: number, targetFat: number }> }}
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
  let flatKcal = base;
  if (goal === 'bulk') flatKcal = base + 300;
  else if (goal === 'cut') flatKcal = base - 300;
  flatKcal = Math.min(5000, Math.max(1200, flatKcal));

  const weight = Number.isFinite(Number(weightKg)) && Number(weightKg) > 0
    ? Number(weightKg)
    : 75;
  const prot = Math.round(weight * 2.0);
  const fat = Math.round(Math.max(weight * 0.8, (flatKcal * 0.25) / 9));
  const carb = Math.max(80, Math.round((flatKcal - prot * 4 - fat * 9) / 4));

  const nutritionDays = (Array.isArray(daysArray) ? daysArray : []).map((d, i) => {
    const dayIndex = Number.isFinite(Number(d?.dayIndex))
      ? Math.floor(Number(d.dayIndex))
      : i;
    return {
      dayIndex,
      targetKcal: flatKcal,
      targetProt: prot,
      targetCarb: carb,
      targetFat: fat,
    };
  });

  return { nutritionDays };
}
