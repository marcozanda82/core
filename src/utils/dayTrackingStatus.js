import { TRACKER_STORICO_KEY, normalizeLogData } from '../coreEngine';

const FOOD_TYPES = new Set(['food', 'recipe', 'meal', 'single']);

/** Allineato a FASTING_BREAK_THRESHOLDS in metabolicPhaseColors. */
const FASTING_BREAK = { kcal: 10, carbs: 1, protein: 1 };

function isFastingBreakerItem(item) {
  if (!item || typeof item !== 'object') return false;
  const t = String(item.type || '').toLowerCase();
  if (!(t === 'food' || t === 'recipe' || t === 'meal' || t === 'single' || !t)) return false;
  if (t === 'meal' && Array.isArray(item.items)) {
    return item.items.some((sub) => isFastingBreakerItem({ ...sub, type: sub.type || 'food' }));
  }
  const kcal = Number(item.kcal ?? item.cal) || 0;
  const carbs = Number(item.carb ?? item.carbs ?? item.carboidrati) || 0;
  const protein = Number(item.prot ?? item.protein ?? item.proteine) || 0;
  return (
    kcal > FASTING_BREAK.kcal
    || carbs > FASTING_BREAK.carbs
    || protein > FASTING_BREAK.protein
  );
}

/**
 * @param {unknown} log
 * @returns {Array}
 */
export function normalizeTrackerDayLog(log) {
  if (Array.isArray(log)) return log.filter(Boolean);
  if (log != null && typeof log === 'object') return Object.values(log).filter(Boolean);
  return [];
}

/**
 * True se il giorno ha almeno un log alimentare (pasto/alimento).
 * @param {unknown} log
 */
export function dayHasFoodLog(log) {
  const list = normalizeTrackerDayLog(log);
  return list.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const t = String(item.type || '').toLowerCase();
    if (t === 'meal' && Array.isArray(item.items) && item.items.length > 0) return true;
    if (FOOD_TYPES.has(t)) return true;
    // Legacy: voci senza type ma con desc/kcal alimentari
    if (!t && (item.desc || item.name) && (item.kcal != null || item.cal != null || item.prot != null)) {
      return true;
    }
    return false;
  });
}

/**
 * @param {object | null | undefined} dayNode — nodo trackerStorico_*
 */
export function isDayIntentionalFast(dayNode) {
  return dayNode?.isIntentionalFast === true;
}

/**
 * Giorno “tracciato” per medie: ha pasti OPPURE digiuno intenzionale (conta come 0 kcal).
 * I giorni Null (né pasti né flag) vanno esclusi dal divisore.
 * @param {object | null | undefined} dayNode
 * @param {unknown} [logOverride]
 */
export function isDayTrackableForAverages(dayNode, logOverride) {
  const log = logOverride !== undefined ? logOverride : dayNode?.log;
  if (dayHasFoodLog(log)) return true;
  return isDayIntentionalFast(dayNode);
}

/**
 * @param {string} dateStr YYYY-MM-DD
 * @param {number} deltaDays
 */
export function shiftDateStr(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + deltaDays);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Ultimo orario pasto (breaker) in un giorno storico.
 * @returns {number | null}
 */
export function getDayLastMealTime(dayNode) {
  if (!dayNode) return null;
  const log = normalizeLogData(normalizeTrackerDayLog(dayNode.log));
  let maxT = -1;
  for (const item of log) {
    if (!isFastingBreakerItem(item)) continue;
    let hour = Number(item?.mealTime ?? item?.time);
    if (!Number.isFinite(hour) && item?.mealType != null) {
      hour = Number(dayNode.mealTimes?.[item.mealType]);
    }
    if (!Number.isFinite(hour)) hour = 20;
    if (hour > maxT) maxT = hour;
  }
  return maxT >= 0 ? maxT : null;
}

/**
 * Carry-over digiuno notturno con protezione giorni Null.
 *
 * - Ieri con pasti → usa ultimo pasto ieri
 * - Giorni vuoti con isIntentionalFast attraversabili (sommano +24h ciascuno)
 * - Giorno vuoto SENZA flag → spezza la catena (null)
 *
 * @param {object | null | undefined} fullHistory
 * @param {string} anchorDateStr — giorno di riferimento (oggi / giorno visualizzato)
 * @param {{ maxLookbackDays?: number }} [options]
 * @returns {{ lastMealTime: number, intentionalEmptyDays: number, sourceDate: string } | null}
 */
export function resolveOvernightCarryMeal(fullHistory, anchorDateStr, options = {}) {
  if (!fullHistory || !anchorDateStr) return null;
  const maxLookback = Math.max(1, Number(options.maxLookbackDays) || 7);

  let dateStr = shiftDateStr(anchorDateStr, -1);
  let intentionalEmptyDays = 0;

  for (let i = 0; i < maxLookback && dateStr; i += 1) {
    const node = fullHistory[TRACKER_STORICO_KEY(dateStr)];
    const lastMeal = getDayLastMealTime(node);

    if (lastMeal != null) {
      return {
        lastMealTime: lastMeal,
        intentionalEmptyDays,
        sourceDate: dateStr,
      };
    }

    // Nessun pasto: solo i digiuni intenzionali prolungano la catena.
    if (isDayIntentionalFast(node)) {
      intentionalEmptyDays += 1;
      dateStr = shiftDateStr(dateStr, -1);
      continue;
    }

    // Giorno Null (mancante o vuoto senza flag) → interrompi.
    return null;
  }

  return null;
}

/**
 * Ore di digiuno a `referenceHour` con protezione Null / digiuno intenzionale.
 * @returns {{ hoursFasted: number, insufficientData: boolean, fromCarry: boolean }}
 */
export function computeProtectedHoursFasted({
  referenceHour,
  todayMealTimes = [],
  fullHistory = null,
  anchorDateStr = null,
} = {}) {
  const hour =
    typeof referenceHour === 'number' && Number.isFinite(referenceHour)
      ? Math.max(0, Math.min(24, referenceHour))
      : 0;

  const today = (todayMealTimes || []).filter(
    (t) => typeof t === 'number' && Number.isFinite(t) && t <= hour + 1e-6,
  );
  if (today.length > 0) {
    const last = Math.max(...today);
    return {
      hoursFasted: Math.max(0, hour - last),
      insufficientData: false,
      fromCarry: false,
    };
  }

  const carry = resolveOvernightCarryMeal(fullHistory, anchorDateStr);
  if (!carry) {
    return { hoursFasted: 0, insufficientData: true, fromCarry: false };
  }

  const hoursFasted =
    Math.max(0, (24 - carry.lastMealTime) + hour)
    + carry.intentionalEmptyDays * 24;

  return {
    hoursFasted,
    insufficientData: false,
    fromCarry: true,
  };
}
