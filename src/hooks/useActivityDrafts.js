import { useCallback, useEffect, useRef, useState } from 'react';
import { get, onValue, ref, set } from 'firebase/database';
import { getTodayString } from '../coreEngine';
import {
  activityDraftsDbPath,
  createActivityDraft,
  draftsToFirebaseMap,
  listActivityDraftsFromSnapshot,
} from '../features/workout/activityDrafts';

export function useActivityDrafts({
  db = null,
  userUid = null,
  todayIso = null,
  isSimulationMode = false,
} = {}) {
  const [activityDrafts, setActivityDrafts] = useState([]);
  const draftsRef = useRef([]);
  const dateRef = useRef(String(todayIso || getTodayString()).slice(0, 10));

  useEffect(() => {
    draftsRef.current = activityDrafts;
  }, [activityDrafts]);

  const dayKey = String(todayIso || getTodayString()).slice(0, 10);
  dateRef.current = dayKey;

  useEffect(() => {
    if (isSimulationMode || !db || !userUid || !dayKey) {
      if (!isSimulationMode) setActivityDrafts([]);
      return undefined;
    }
    const path = activityDraftsDbPath(userUid, dayKey);
    const unsubscribe = onValue(ref(db, path), (snap) => {
      setActivityDrafts(listActivityDraftsFromSnapshot(snap?.val()));
    }, (error) => {
      console.warn('[useActivityDrafts] listen failed', error);
    });
    return () => unsubscribe();
  }, [db, userUid, dayKey, isSimulationMode]);

  const persist = useCallback(async (nextList, dateIso) => {
    const day = String(dateIso || dateRef.current || getTodayString()).slice(0, 10);
    if (isSimulationMode || !db || !userUid || !day) return;
    try {
      await set(ref(db, activityDraftsDbPath(userUid, day)), draftsToFirebaseMap(nextList));
    } catch (error) {
      console.warn('[useActivityDrafts] persist failed', error);
    }
  }, [db, userUid, isSimulationMode]);

  const addActivityDraft = useCallback((workoutPayload, meta = {}) => {
    const date = String(meta.date || getTodayString()).slice(0, 10);
    const draft = createActivityDraft(workoutPayload, {
      date,
      source: meta.source || 'ai-chat',
      id: meta.id || null,
    });
    if (date !== dateRef.current) {
      if (!isSimulationMode && db && userUid) {
        void get(ref(db, activityDraftsDbPath(userUid, date))).then((snap) => {
          const existing = listActivityDraftsFromSnapshot(snap?.val());
          const next = [...existing.filter((item) => item.id !== draft.id), draft];
          return persist(next, date);
        }).catch((error) => {
          console.warn('[useActivityDrafts] merge persist failed', error);
        });
      }
      return draft;
    }
    const next = [...draftsRef.current.filter((item) => item.id !== draft.id), draft];
    draftsRef.current = next;
    setActivityDrafts(next);
    void persist(next, date);
    return draft;
  }, [persist, db, userUid, isSimulationMode]);

  const removeActivityDraft = useCallback((draftId) => {
    const id = String(draftId || '').trim();
    if (!id) return;
    const next = draftsRef.current.filter((item) => String(item.id) !== id);
    draftsRef.current = next;
    setActivityDrafts(next);
    void persist(next, dateRef.current);
  }, [persist]);

  const updateActivityDraft = useCallback((draftId, patch = {}) => {
    const id = String(draftId || '').trim();
    if (!id) return null;
    let updated = null;
    const next = draftsRef.current.map((item) => {
      if (String(item.id) !== id) return item;
      updated = {
        ...item,
        ...patch,
        payload: {
          ...(item.payload && typeof item.payload === 'object' ? item.payload : {}),
          ...(patch.payload && typeof patch.payload === 'object' ? patch.payload : {}),
        },
        id: item.id,
        kind: 'activity-draft',
        isGhost: true,
      };
      return updated;
    });
    if (!updated) return null;
    draftsRef.current = next;
    setActivityDrafts(next);
    void persist(next, dateRef.current);
    return updated;
  }, [persist]);

  return {
    activityDrafts,
    addActivityDraft,
    removeActivityDraft,
    updateActivityDraft,
  };
}

export default useActivityDrafts;
