import { useCallback, useEffect, useRef, useState } from 'react';
import { get, onValue, ref, remove, set } from 'firebase/database';
import { getTodayString } from '../coreEngine';
import {
  activityDraftsDbPath,
  activityDraftsRootPath,
  createActivityDraft,
  createAiProposalSeed,
  draftsToFirebaseMap,
  isAiProposalSeed,
  isStaleActivityDraft,
  isVisibleActivityDraft,
  listActivityDraftsFromSnapshot,
} from '../features/workout/activityDrafts';

export function useActivityDrafts({
  db = null,
  userUid = null,
  todayIso = null,
  isSimulationMode = false,
} = {}) {
  const [liveDay, setLiveDay] = useState(() => String(todayIso || getTodayString()).slice(0, 10));
  const [activityDrafts, setActivityDrafts] = useState([]);
  const draftsRef = useRef([]);
  const dateRef = useRef(liveDay);
  const purgeInFlightRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      const next = getTodayString();
      setLiveDay((prev) => (prev === next ? prev : next));
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const publishVisible = useCallback((nextList) => {
    const list = Array.isArray(nextList) ? nextList : [];
    draftsRef.current = list;
    setActivityDrafts(list.filter(isVisibleActivityDraft));
  }, []);

  const dayKey = liveDay || String(todayIso || getTodayString()).slice(0, 10);
  dateRef.current = dayKey;

  const persist = useCallback(async (nextList, dateIso) => {
    const day = String(dateIso || dateRef.current || getTodayString()).slice(0, 10);
    if (isSimulationMode || !db || !userUid || !day) return;
    try {
      await set(ref(db, activityDraftsDbPath(userUid, day)), draftsToFirebaseMap(nextList));
    } catch (error) {
      console.warn('[useActivityDrafts] persist failed', error);
    }
  }, [db, userUid, isSimulationMode]);

  const purgeStaleActivityDrafts = useCallback(async (calendarToday = '') => {
    const today = String(calendarToday || getTodayString()).slice(0, 10);
    if (isSimulationMode || !db || !userUid || !today) return;
    if (purgeInFlightRef.current) return;
    purgeInFlightRef.current = true;
    try {
      const snap = await get(ref(db, activityDraftsRootPath(userUid)));
      const tree = snap.exists() && snap.val() && typeof snap.val() === 'object'
        ? snap.val()
        : {};
      const staleDays = Object.keys(tree).filter((key) => {
        const day = String(key || '').slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(day) && day < today;
      });
      await Promise.all(staleDays.map((day) => (
        remove(ref(db, activityDraftsDbPath(userUid, day)))
      )));
      const todayRaw = listActivityDraftsFromSnapshot(tree[today], {
        todayIso: today,
        includeStale: true,
      });
      const todayList = todayRaw.filter((item) => !isStaleActivityDraft(item, today));
      if (todayList.length !== todayRaw.length) {
        await persist(todayList, today);
      }
      if (dateRef.current === today) {
        publishVisible(todayList);
      }
    } catch (error) {
      console.warn('[useActivityDrafts] purge stale failed', error);
    } finally {
      purgeInFlightRef.current = false;
    }
  }, [db, userUid, isSimulationMode, persist, publishVisible]);

  useEffect(() => {
    if (isSimulationMode || !db || !userUid || !dayKey) {
      if (!isSimulationMode) {
        draftsRef.current = [];
        setActivityDrafts([]);
      }
      return undefined;
    }
    const path = activityDraftsDbPath(userUid, dayKey);
    const unsubscribe = onValue(ref(db, path), (snap) => {
      publishVisible(listActivityDraftsFromSnapshot(snap?.val(), { todayIso: dayKey }));
    }, (error) => {
      console.warn('[useActivityDrafts] listen failed', error);
    });
    void purgeStaleActivityDrafts(getTodayString());
    return () => unsubscribe();
  }, [db, userUid, dayKey, isSimulationMode, publishVisible, purgeStaleActivityDrafts]);

  useEffect(() => {
    if (isSimulationMode || !db || !userUid) return undefined;
    const tick = () => {
      void purgeStaleActivityDrafts(getTodayString());
    };
    const id = window.setInterval(tick, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [db, userUid, isSimulationMode, purgeStaleActivityDrafts]);

  const addActivityDraft = useCallback((workoutPayload, meta = {}) => {
    const date = String(meta.date || getTodayString()).slice(0, 10);
    const draft = meta.raw && workoutPayload && typeof workoutPayload === 'object'
      ? {
        ...workoutPayload,
        id: meta.id || workoutPayload.id,
        date,
        createdAt: Number(workoutPayload.createdAt) || Date.now(),
        createdDate: workoutPayload.createdDate || date,
        source: meta.source || workoutPayload.source,
      }
      : createActivityDraft(workoutPayload, {
        date,
        source: meta.source || 'ai-chat',
        id: meta.id || null,
      });
    if (date !== dateRef.current) {
      if (!isSimulationMode && db && userUid) {
        void get(ref(db, activityDraftsDbPath(userUid, date))).then((snap) => {
          const existing = listActivityDraftsFromSnapshot(snap?.val(), { todayIso: date });
          const next = [...existing.filter((item) => item.id !== draft.id), draft];
          return persist(next, date);
        }).catch((error) => {
          console.warn('[useActivityDrafts] merge persist failed', error);
        });
      }
      return draft;
    }
    const next = [...draftsRef.current.filter((item) => item.id !== draft.id), draft];
    publishVisible(next);
    void persist(next, date);
    return draft;
  }, [persist, db, userUid, isSimulationMode, publishVisible]);

  const removeActivityDraft = useCallback((draftId) => {
    const id = String(draftId || '').trim();
    if (!id) return;
    const next = draftsRef.current.filter((item) => String(item.id) !== id);
    publishVisible(next);
    void persist(next, dateRef.current);
  }, [persist, publishVisible]);

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
        kind: item.kind || 'activity-draft',
        isGhost: item.isGhost !== false,
      };
      return updated;
    });
    if (!updated) return null;
    publishVisible(next);
    void persist(next, dateRef.current);
    return updated;
  }, [persist, publishVisible]);

  const markAiProposalSeed = useCallback((dateIso) => {
    const date = String(dateIso || dateRef.current || getTodayString()).slice(0, 10);
    if (draftsRef.current.some(isAiProposalSeed)) return;
    const seed = createAiProposalSeed(date);
    const next = [...draftsRef.current, seed];
    publishVisible(next);
    void persist(next, date);
  }, [persist, publishVisible]);

  const hasAiProposalSeed = draftsRef.current.some(isAiProposalSeed)
    || activityDrafts.some((item) => String(item.id || '').startsWith('ai_proposal_'));

  return {
    activityDrafts,
    addActivityDraft,
    removeActivityDraft,
    updateActivityDraft,
    purgeStaleActivityDrafts,
    markAiProposalSeed,
    hasAiProposalSeed,
  };
}

export default useActivityDrafts;
