/**
 * Segnali energetici / cena per Focus AI Coach (soglie assolute + quota giorno).
 */

/** Cena «abbondante»: soglia assoluta minima (kcal). */
export const HEAVY_LATE_MEAL_ABS_KCAL = 900;
/** Cena «abbondante»: frazione del target giornaliero come soglia assoluta alternativa. */
export const HEAVY_LATE_MEAL_ABS_TARGET_SHARE = 0.4;
/** Cena «abbondante»: quota minima sul totale del giorno. */
export const HEAVY_LATE_MEAL_DAY_SHARE = 0.45;

/** Giorno low-energy: sotto il target di oltre questo rapporto (es. 0.25 = −25%). */
export const ENERGY_LOW_DAY_DEFICIT_RATIO = 0.25;

/** Primo pasto «tardivo» (ora decimale, es. 13.0 = 13:00). */
export const LATE_FIRST_MEAL_HOUR = 13;

/** Sotto questa soglia kcal un pasto non conta come «primo pasto» sostanziale (es. solo caffè). */
export const SUBSTANTIAL_MEAL_MIN_KCAL = 50;

/**
 * @param {number|null|undefined} dinnerKcal
 * @param {number|null|undefined} dayKcal
 * @param {number|null|undefined} targetKcal
 * @returns {{
 *   active: boolean,
 *   dinnerKcal: number|null,
 *   dayIntakeKcal: number|null,
 *   targetKcal: number|null,
 *   shareOfDay: number|null,
 *   absoluteThresholdKcal: number|null,
 *   absoluteOk: boolean,
 *   shareOk: boolean,
 *   detail: string,
 *   inactiveReason: string|null,
 * }}
 */
export function assessHeavyLateMeal(dinnerKcal, dayKcal, targetKcal) {
  const dinner = Number(dinnerKcal);
  const day = Number(dayKcal);
  const target = Number(targetKcal);
  const hasDinner = Number.isFinite(dinner) && dinner > 0;
  const hasDay = Number.isFinite(day) && day > 0;
  const hasTarget = Number.isFinite(target) && target > 0;

  const shareOfDay = hasDinner && hasDay
    ? Math.round((dinner / day) * 1000) / 1000
    : null;
  const targetAbs = hasTarget
    ? Math.round(target * HEAVY_LATE_MEAL_ABS_TARGET_SHARE)
    : null;
  // Soglia assoluta: ≥900 kcal OPPURE ≥40% del target dichiarato.
  const absoluteOk = hasDinner && (
    dinner >= HEAVY_LATE_MEAL_ABS_KCAL
    || (targetAbs != null && dinner >= targetAbs)
  );
  const shareOk = shareOfDay != null && shareOfDay >= HEAVY_LATE_MEAL_DAY_SHARE;
  const active = Boolean(absoluteOk && shareOk);

  const absoluteThresholdKcal = hasTarget
    ? Math.min(
      HEAVY_LATE_MEAL_ABS_KCAL,
      targetAbs != null ? targetAbs : HEAVY_LATE_MEAL_ABS_KCAL,
    )
    : HEAVY_LATE_MEAL_ABS_KCAL;

  let detail;
  let inactiveReason = null;
  if (!hasDinner) {
    detail = 'Nessuna cena con kcal utilizzabili.';
    inactiveReason = 'no_dinner_kcal';
  } else if (active) {
    detail = `Cena abbondante: ${Math.round(dinner)} kcal`
      + (shareOfDay != null ? ` (${Math.round(shareOfDay * 100)}% del giorno)` : '')
      + ` — soglia assoluta ≥${HEAVY_LATE_MEAL_ABS_KCAL} kcal o ≥${Math.round(HEAVY_LATE_MEAL_ABS_TARGET_SHARE * 100)}% target`
      + ` e ≥${Math.round(HEAVY_LATE_MEAL_DAY_SHARE * 100)}% del totale giornaliero.`;
  } else if (!absoluteOk && shareOk) {
    detail = `Cena ${Math.round(dinner)} kcal è una quota ampia del giorno`
      + (shareOfDay != null ? ` (${Math.round(shareOfDay * 100)}%)` : '')
      + `, ma sotto la soglia assoluta (≥${HEAVY_LATE_MEAL_ABS_KCAL} kcal o ≥${Math.round(HEAVY_LATE_MEAL_ABS_TARGET_SHARE * 100)}% del target`
      + (targetAbs != null ? ` = ${targetAbs} kcal` : '')
      + '): non segnalata come abbondante.';
    inactiveReason = 'below_absolute_threshold';
  } else if (absoluteOk && !shareOk) {
    detail = `Cena ${Math.round(dinner)} kcal supera la soglia assoluta ma è sotto il ${Math.round(HEAVY_LATE_MEAL_DAY_SHARE * 100)}% del totale giornaliero.`;
    inactiveReason = 'below_day_share';
  } else {
    detail = `Cena ${Math.round(dinner)} kcal: né soglia assoluta né quota giorno (≥${Math.round(HEAVY_LATE_MEAL_DAY_SHARE * 100)}%).`;
    inactiveReason = 'below_thresholds';
  }

  return {
    active,
    dinnerKcal: hasDinner ? Math.round(dinner) : null,
    dayIntakeKcal: hasDay ? Math.round(day) : null,
    targetKcal: hasTarget ? Math.round(target) : null,
    shareOfDay,
    absoluteThresholdKcal,
    absoluteOk,
    shareOk,
    detail,
    inactiveReason,
  };
}

/**
 * @param {number|null|undefined} dayKcal
 * @param {number|null|undefined} targetKcal
 * @param {{
 *   firstMealHour?: number|null,
 *   overnightFastHours?: number|null,
 *   longFastThresholdHours?: number,
 * }} [opts]
 * @returns {{
 *   active: boolean,
 *   dayIntakeKcal: number|null,
 *   targetKcal: number|null,
 *   deficitRatio: number|null,
 *   deficitKcal: number|null,
 *   thresholdRatio: number,
 *   firstMealHour: number|null,
 *   firstMealAfter13: boolean,
 *   overnightFastHours: number|null,
 *   overnightFastOver14h: boolean,
 *   preferMorningAction: boolean,
 *   detail: string,
 *   inactiveReason: string|null,
 * }}
 */
export function assessEnergyLowDay(dayKcal, targetKcal, opts = {}) {
  const day = Number(dayKcal);
  const target = Number(targetKcal);
  const hasDay = Number.isFinite(day) && day > 0;
  const hasTarget = Number.isFinite(target) && target > 0;
  const firstMealHour = Number.isFinite(Number(opts.firstMealHour))
    ? Number(opts.firstMealHour)
    : null;
  const overnightFastHours = Number.isFinite(Number(opts.overnightFastHours))
    ? Number(opts.overnightFastHours)
    : null;
  const longFastThreshold = Number.isFinite(Number(opts.longFastThresholdHours))
    ? Number(opts.longFastThresholdHours)
    : 14;

  const deficitKcal = hasDay && hasTarget ? Math.round(target - day) : null;
  const deficitRatio = hasDay && hasTarget && target > 0
    ? Math.round(((target - day) / target) * 1000) / 1000
    : null;
  const active = Boolean(
    deficitRatio != null && deficitRatio > ENERGY_LOW_DAY_DEFICIT_RATIO,
  );
  const firstMealAfter13 = firstMealHour != null && firstMealHour >= LATE_FIRST_MEAL_HOUR;
  const overnightFastOver14h = overnightFastHours != null
    && overnightFastHours > longFastThreshold;
  const preferMorningAction = Boolean(active && (firstMealAfter13 || overnightFastOver14h));

  let detail;
  let inactiveReason = null;
  if (!hasDay || !hasTarget) {
    detail = 'Introito o target non disponibili per energy_low_day.';
    inactiveReason = 'missing_intake_or_target';
  } else if (active) {
    detail = `Giorno sotto target di ${Math.round(deficitRatio * 100)}%`
      + ` (${Math.round(day)} vs ${Math.round(target)} kcal; soglia >${Math.round(ENERGY_LOW_DAY_DEFICIT_RATIO * 100)}%).`
      + (preferMorningAction
        ? ' Priorità azione sul primo pasto (digiuno lungo o primo pasto dopo le 13).'
        : '');
  } else {
    detail = `Introito ${Math.round(day)} kcal vs target ${Math.round(target)}`
      + ` (scostamento ${Math.round((deficitRatio || 0) * 100)}%, soglia >${Math.round(ENERGY_LOW_DAY_DEFICIT_RATIO * 100)}%).`;
    inactiveReason = 'within_energy_band';
  }

  return {
    active,
    dayIntakeKcal: hasDay ? Math.round(day) : null,
    targetKcal: hasTarget ? Math.round(target) : null,
    deficitRatio,
    deficitKcal,
    thresholdRatio: ENERGY_LOW_DAY_DEFICIT_RATIO,
    firstMealHour,
    firstMealAfter13,
    overnightFastHours,
    overnightFastOver14h,
    preferMorningAction,
    detail,
    inactiveReason,
  };
}
