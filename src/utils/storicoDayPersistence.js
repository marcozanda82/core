import { ref, set } from 'firebase/database';
import {
  TRACKER_STORICO_KEY,
  denormalizeLogForFirebase,
} from '../coreEngine';
import { stripUndefined } from './firebasePayloadUtils';

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
}) {
  if (!db || !uid || !dateStr) {
    throw new Error('saveDiaryLogForDate: parametri mancanti');
  }

  const logForFirebase = denormalizeLogForFirebase(log || []);
  const sanitizedLog = stripUndefined(logForFirebase);
  const sanitizedNodes = stripUndefined(manualNodes || []);
  const payload = stripUndefined({
    data: dateStr,
    log: sanitizedLog,
    mealTimes: mealTimes || {},
    manualNodes: sanitizedNodes,
    hasEditedNodes: true,
  });

  const dbPath = `users/${uid}/tracker_data/${TRACKER_STORICO_KEY(dateStr)}`;
  await set(ref(db, dbPath), payload);
  return payload;
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
