import {
  TRACKER_STORICO_KEY,
  denormalizeLogForFirebase,
} from '../coreEngine';
import { stripUndefined } from './firebasePayloadUtils';
import { dayHasFoodLog } from './dayTrackingStatus';
import { withPreservedAutopilotCorrection } from './rollingCalorieBank';
import {
  fetchDayNode,
  sanitizeDayPatch,
  saveDayNodeWithRev,
} from './dayNodeWrite.js';

/**
 * Salva il log di un giorno specifico su Firebase (oggi o passato).
 * Usa una transazione: non cancella dayTargetSnapshot / customTargets / altri campi.
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
  expectedRev = null,
}) {
  if (!db || !uid || !dateStr) {
    throw new Error('saveDiaryLogForDate: parametri mancanti');
  }

  const logForFirebase = denormalizeLogForFirebase(log || []);
  const sanitizedLog = stripUndefined(logForFirebase);
  const sanitizedNodes = stripUndefined(manualNodes || []);

  let intentionalFlag = existingDayNode?.isIntentionalFast === true;
  if (typeof isIntentionalFast === 'boolean') {
    intentionalFlag = isIntentionalFast;
  }
  if (dayHasFoodLog(sanitizedLog)) {
    intentionalFlag = false;
  }

  const payload = stripUndefined(withPreservedAutopilotCorrection({
    data: dateStr,
    log: sanitizedLog,
    mealTimes: mealTimes || {},
    manualNodes: sanitizedNodes,
    hasEditedNodes: true,
    ...(intentionalFlag ? { isIntentionalFast: true } : {}),
  }, existingDayNode));

  const managed = sanitizeDayPatch(payload);
  if (!intentionalFlag) {
    managed.isIntentionalFast = null;
  }

  const revHint = expectedRev != null
    ? expectedRev
    : (existingDayNode?.rev ?? null);

  const { node } = await saveDayNodeWithRev({
    db,
    uid,
    dateStr,
    managedFields: managed,
    expectedRev: revHint,
  });
  return node;
}

/**
 * Imposta/rimuove il flag digiuno intenzionale 24h su un giorno.
 * Passa sempre dalla transazione con rev (niente update parziale senza rev).
 */
export async function setDayIntentionalFastFlag({
  db,
  uid,
  dateStr,
  value,
  existingDayNode = null,
  expectedRev = null,
}) {
  if (!db || !uid || !dateStr) {
    throw new Error('setDayIntentionalFastFlag: parametri mancanti');
  }

  const existing = existingDayNode && typeof existingDayNode === 'object'
    ? existingDayNode
    : (await fetchDayNode({ db, uid, dateStr })) || {};
  const nextFlag = Boolean(value);
  const revHint = expectedRev != null ? expectedRev : (existing.rev ?? null);

  if (!existing.log && !existing.data) {
    const { node } = await saveDayNodeWithRev({
      db,
      uid,
      dateStr,
      managedFields: stripUndefined({
        data: dateStr,
        log: [],
        mealTimes: {},
        manualNodes: [],
        hasEditedNodes: true,
        ...(nextFlag ? { isIntentionalFast: true } : { isIntentionalFast: null }),
      }),
      expectedRev: revHint,
    });
    return node;
  }

  const { node } = await saveDayNodeWithRev({
    db,
    uid,
    dateStr,
    managedFields: {
      isIntentionalFast: nextFlag ? true : null,
    },
    expectedRev: revHint,
  });
  return {
    ...node,
    isIntentionalFast: nextFlag || undefined,
  };
}

export function extractMealTimesFromLog(log) {
  return (Array.isArray(log) ? log : [])
    .filter((item) => item?.type === 'food' || item.type === 'recipe')
    .reduce((acc, food) => {
      const safeMealKey = String(food.mealType || 'pranzo').replace(/[.#$/[\]]/g, '_');
      const mealTime = Number(food.mealTime ?? food.time);
      if (Number.isFinite(mealTime)) {
        acc[safeMealKey] = mealTime;
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
