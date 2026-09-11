import { useCallback, useEffect, useRef, useState } from 'react';
import { get, onValue, ref, remove, set } from 'firebase/database';
import {
  denormalizeLogForFirebase,
  getLogFromStoricoTree,
  TRACKER_STORICO_KEY,
} from '../../coreEngine';
import { stripUndefined } from '../../utils/firebasePayloadUtils';
import { removeLogItemsByIds } from '../../utils/mealDraftStatus';
import {
  buildTrashMealRecord,
  collectExpiredTrashIds,
  listFreshTrashMeals,
  MEAL_TRASH_TOAST_MS,
  mealTrashDbPath,
  trashFoodIds,
} from '../../utils/mealTrash';

function mergeFoodsWithoutDuplicates(log, foods) {
  const existing = new Set(
    (Array.isArray(log) ? log : [])
      .map((item) => (item?.id != null ? String(item.id) : ''))
      .filter(Boolean),
  );
  const incoming = (Array.isArray(foods) ? foods : []).filter((food) => {
    const id = food?.id != null ? String(food.id) : '';
    return id && !existing.has(id);
  });
  if (incoming.length === 0) return Array.isArray(log) ? [...log] : [];
  return [...(Array.isArray(log) ? log : []), ...incoming];
}

export function useMealTrash({
  db,
  userUid,
  isSimulationMode,
  currentTrackerDate,
  dailyLogRef,
  commitDiaryLogWrite,
  setSimulatedLog,
  getFoodItemsForMealSlot,
  setFullHistory,
  onRemoveLiveMealIds = null,
}) {
  const [trashMeals, setTrashMeals] = useState([]);
  const [trashToast, setTrashToast] = useState(null);
  const rawTrashRef = useRef({});
  const toastRef = useRef({ token: 0, timer: null, lastId: null });
  const onRemoveLiveMealIdsRef = useRef(onRemoveLiveMealIds);
  onRemoveLiveMealIdsRef.current = onRemoveLiveMealIds;

  const clearTrashToast = useCallback(() => {
    if (toastRef.current.timer) {
      window.clearTimeout(toastRef.current.timer);
      toastRef.current.timer = null;
    }
    toastRef.current.token = 0;
    setTrashToast(null);
  }, []);

  const armTrashToast = useCallback((message, lastId) => {
    const token = Date.now();
    toastRef.current.token = token;
    toastRef.current.lastId = lastId || null;
    setTrashToast({ token, message });
    if (toastRef.current.timer) window.clearTimeout(toastRef.current.timer);
    toastRef.current.timer = window.setTimeout(() => {
      if (toastRef.current.token === token) {
        toastRef.current.token = 0;
        setTrashToast(null);
      }
    }, MEAL_TRASH_TOAST_MS);
  }, []);

  const persistTrashRecord = useCallback(async (record) => {
    if (!record?.id) return false;
    rawTrashRef.current = { ...rawTrashRef.current, [record.id]: record };
    setTrashMeals(listFreshTrashMeals(rawTrashRef.current));
    if (isSimulationMode || !userUid || !db) return true;
    await set(ref(db, `${mealTrashDbPath(userUid)}/${record.id}`), stripUndefined(record));
    return true;
  }, [db, isSimulationMode, userUid]);

  const deleteTrashRecord = useCallback(async (trashId) => {
    const id = String(trashId || '').trim();
    if (!id) return;
    const next = { ...rawTrashRef.current };
    delete next[id];
    rawTrashRef.current = next;
    setTrashMeals(listFreshTrashMeals(next));
    if (isSimulationMode || !userUid || !db) return;
    await remove(ref(db, `${mealTrashDbPath(userUid)}/${id}`));
  }, [db, isSimulationMode, userUid]);

  useEffect(() => {
    if (!userUid || !db || isSimulationMode) return undefined;
    const trashRef = ref(db, mealTrashDbPath(userUid));
    const unsub = onValue(trashRef, (snap) => {
      const raw = snap.exists() ? snap.val() : {};
      rawTrashRef.current = raw && typeof raw === 'object' ? raw : {};
      setTrashMeals(listFreshTrashMeals(rawTrashRef.current));
      const expiredIds = collectExpiredTrashIds(rawTrashRef.current);
      expiredIds.forEach((id) => {
        remove(ref(db, `${mealTrashDbPath(userUid)}/${id}`)).catch(() => {});
      });
    });
    return () => unsub();
  }, [db, isSimulationMode, userUid]);

  useEffect(() => () => {
    if (toastRef.current.timer) window.clearTimeout(toastRef.current.timer);
  }, []);

  const writeCurrentDayLog = useCallback((nextLog) => {
    dailyLogRef.current = nextLog;
    if (isSimulationMode) {
      setSimulatedLog(nextLog);
      return;
    }
    commitDiaryLogWrite(nextLog);
  }, [commitDiaryLogWrite, dailyLogRef, isSimulationMode, setSimulatedLog]);

  const restoreFoodsToDate = useCallback(async (date, foods) => {
    const targetDate = String(date || currentTrackerDate || '').trim();
    if (!targetDate) return false;
    if (targetDate === String(currentTrackerDate || '')) {
      const nextLog = mergeFoodsWithoutDuplicates(dailyLogRef.current || [], foods);
      writeCurrentDayLog(nextLog);
      return true;
    }
    if (!userUid || !db) return false;
    const storicoKey = TRACKER_STORICO_KEY(targetDate);
    const path = `users/${userUid}/tracker_data/${storicoKey}`;
    const snap = await get(ref(db, path));
    const node = snap.exists() ? snap.val() : { data: targetDate, log: [], mealTimes: {}, manualNodes: [] };
    const tree = { [storicoKey]: node };
    const existingLog = getLogFromStoricoTree(tree, targetDate);
    const nextLog = mergeFoodsWithoutDuplicates(existingLog, foods);
    const mealTimes = (nextLog || [])
      .filter((item) => item?.type === 'food' || item.type === 'recipe')
      .reduce((acc, food) => ({ ...acc, [food.mealType]: food.mealTime ?? 12 }), { ...(node.mealTimes || {}) });
    const payload = stripUndefined({
      ...node,
      data: targetDate,
      log: denormalizeLogForFirebase(nextLog),
      mealTimes,
      manualNodes: node.manualNodes || [],
      hasEditedNodes: true,
    });
    await set(ref(db, path), payload);
    setFullHistory?.((prev) => ({ ...(prev || {}), [storicoKey]: payload }));
    return true;
  }, [currentTrackerDate, dailyLogRef, db, setFullHistory, userUid, writeCurrentDayLog]);

  const trashMeal = useCallback(async (meal) => {
    if (!meal) return false;
    const slotKey = String(meal.slotKey || meal.slotId || '').trim();
    const logSnap = dailyLogRef.current || [];
    let foods = slotKey ? getFoodItemsForMealSlot(logSnap, slotKey) : [];
    if (!foods.length && Array.isArray(meal.foods) && meal.foods.length > 0) {
      foods = meal.foods.filter((item) => item && (item.type === 'food' || item.type === 'recipe' || !item.type));
    }
    if (!foods.length) return false;
    const record = buildTrashMealRecord({
      foods,
      slotKey,
      mealType: meal.mealType || foods[0]?.mealType || '',
      mealTime: meal.mealTime ?? foods[0]?.mealTime ?? 12,
      label: meal.label || meal.title || 'Pasto',
      date: currentTrackerDate,
      deletedAt: Date.now(),
    });
    if (!record) return false;
    const ids = trashFoodIds(record);
    try {
      await persistTrashRecord(record);
    } catch (err) {
      console.error('[trashMeal] persist failed', err);
      await deleteTrashRecord(record.id);
      return false;
    }
    writeCurrentDayLog(removeLogItemsByIds(logSnap, ids));
    onRemoveLiveMealIdsRef.current?.(ids);
    armTrashToast('Pasto spostato nel cestino', record.id);
    return true;
  }, [
    armTrashToast,
    currentTrackerDate,
    dailyLogRef,
    deleteTrashRecord,
    getFoodItemsForMealSlot,
    persistTrashRecord,
    writeCurrentDayLog,
  ]);

  const restoreTrashMeal = useCallback(async (entryOrId) => {
    const id = typeof entryOrId === 'string' ? entryOrId : String(entryOrId?.id || '');
    const entry = typeof entryOrId === 'object' && entryOrId?.foods
      ? entryOrId
      : (rawTrashRef.current[id] || trashMeals.find((item) => String(item.id) === id));
    if (!entry?.foods?.length) return false;
    await restoreFoodsToDate(entry.date || currentTrackerDate, entry.foods);
    await deleteTrashRecord(entry.id);
    if (toastRef.current.lastId === String(entry.id)) clearTrashToast();
    return true;
  }, [clearTrashToast, currentTrackerDate, deleteTrashRecord, restoreFoodsToDate, trashMeals]);

  const purgeTrashMeal = useCallback(async (entryOrId) => {
    const id = typeof entryOrId === 'string' ? entryOrId : String(entryOrId?.id || '');
    if (!id) return;
    await deleteTrashRecord(id);
    if (toastRef.current.lastId === id) clearTrashToast();
  }, [clearTrashToast, deleteTrashRecord]);

  const undoLastTrash = useCallback(async () => {
    const lastId = toastRef.current.lastId;
    clearTrashToast();
    if (!lastId) return;
    await restoreTrashMeal(lastId);
  }, [clearTrashToast, restoreTrashMeal]);

  return {
    trashMeals,
    trashToast,
    trashMeal,
    restoreTrashMeal,
    purgeTrashMeal,
    undoLastTrash,
    clearTrashToast,
  };
}
