import { ref, set, update } from 'firebase/database';
import {
  TRACKER_STORICO_KEY,
  denormalizeLogForFirebase,
} from '../coreEngine';
import { stripUndefined } from './firebasePayloadUtils';
import { dayHasFoodLog } from './dayTrackingStatus';

/**
 * Salva il log di un giorno specifico su Firebase (oggi o passato).
 */
export async function saveDiaryLogForDate({
  db,
  uid,
  dateStr,
  log,
  manualNodes = [],
  mealTimes = {},
  isIntentionalFast,
  existingDayNode = null,
}) {
  if (!db || !uid || !dateStr) {
    throw new Error('saveDiaryLogForDate: parametri mancanti');
  }

  const logForFirebase = denormalizeLogForFirebase(log || []);
  const sanitizedLog = stripUndefined(logForFirebase);
  const sanitizedNodes = stripUndefined(manualNodes || []);

  // Pasti reali annullano il digiuno intenzionale; altrimenti preserva il flag esistente.
  let intentionalFlag = existingDayNode?.isIntentionalFast === true;
  if (typeof isIntentionalFast === 'boolean') {
    intentionalFlag = isIntentionalFast;
  }
  if (dayHasFoodLog(sanitizedLog)) {
    intentionalFlag = false;
  }

  const payload = stripUndefined({
    data: dateStr,
    log: sanitizedLog,
    mealTimes: mealTimes || {},
    manualNodes: sanitizedNodes,
    hasEditedNodes: true,
    ...(intentionalFlag ? { isIntentionalFast: true } : {}),
  });

  const dbPath = `users/${uid}/tracker_data/${TRACKER_STORICO_KEY(dateStr)}`;
  await set(ref(db, dbPath), payload);
  return payload;
}

/**
 * Imposta/rimuove il flag digiuno intenzionale 24h su un giorno (anche senza pasti).
 */
export async function setDayIntentionalFastFlag({
  db,
  uid,
  dateStr,
  value,
  existingDayNode = null,
}) {
  if (!db || !uid || !dateStr) {
    throw new Error('setDayIntentionalFastFlag: parametri mancanti');
  }

  const dbPath = `users/${uid}/tracker_data/${TRACKER_STORICO_KEY(dateStr)}`;
  const existing = existingDayNode && typeof existingDayNode === 'object' ? existingDayNode : {};
  const nextFlag = Boolean(value);

  if (!existing.log && !existing.data) {
    const payload = stripUndefined({
      data: dateStr,
      log: [],
      mealTimes: {},
      manualNodes: [],
      hasEditedNodes: true,
      ...(nextFlag ? { isIntentionalFast: true } : {}),
    });
    await set(ref(db, dbPath), payload);
    return payload;
  }

  if (nextFlag) {
    await update(ref(db, dbPath), { isIntentionalFast: true });
  } else {
    await update(ref(db, dbPath), { isIntentionalFast: null });
  }

  return {
    ...existing,
    data: existing.data || dateStr,
    isIntentionalFast: nextFlag || undefined,
  };
}

export function extractMealTimesFromLog(log) {
  return (Array.isArray(log) ? log : [])
    .filter((item) => item?.type === 'food' || item?.type === 'recipe')
    .reduce((acc, food) => {
      const mealType = String(food.mealType || 'pranzo');
      const mealTime = Number(food.mealTime ?? food.time);
      if (Number.isFinite(mealTime)) {
        acc[mealType] = mealTime;
      }
      return acc;
    }, {});
}

export function normalizeDayLog(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (raw != null && typeof raw === 'object') return Object.values(raw).filter(Boolean);
  return [];
}

export function getLogForDateFromStorico(storicoTree, dateStr) {
  if (!storicoTree || !dateStr) return [];
  const node = storicoTree[TRACKER_STORICO_KEY(dateStr)];
  return normalizeDayLog(node?.log);
}
