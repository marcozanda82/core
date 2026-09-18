import { useCallback, useEffect, useMemo, useState } from 'react';
import { onValue, ref, remove, set } from 'firebase/database';
import {
  recommendedSleepReferenceHours,
  snapSleepReferenceHours,
} from '../utils/sleepReference';

function preferencePath(uid) {
  return `users/${uid}/salute_preferences/sleepReferenceHours`;
}

/**
 * Preferenza Sonno isolata a `/salute`.
 * Non scrive su userTargets.sleepHours (Progressione) e non entra nel Longevity Score.
 */
export function useSaluteSleepReference({
  db = null,
  uid = null,
  age = null,
  enabled = false,
} = {}) {
  const [personalHours, setPersonalHours] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  const recommendedHours = useMemo(
    () => recommendedSleepReferenceHours(age),
    [age],
  );

  useEffect(() => {
    if (!enabled || !db || !uid) return undefined;

    let cancelled = false;
    const unsub = onValue(ref(db, preferencePath(uid)), (snap) => {
      if (cancelled) return;
      setPersonalHours(snapSleepReferenceHours(snap.val()));
      setHydrated(true);
    }, () => {
      if (cancelled) return;
      setPersonalHours(null);
      setHydrated(true);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [enabled, db, uid]);

  const isPersonal = enabled && personalHours != null;
  const effectiveHours = isPersonal ? personalHours : recommendedHours;

  const savePersonal = useCallback(async (hours) => {
    if (!db || !uid) return false;
    const next = snapSleepReferenceHours(hours);
    if (next == null) return false;
    setSaving(true);
    try {
      await set(ref(db, preferencePath(uid)), next);
      setPersonalHours(next);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, [db, uid]);

  const clearPersonal = useCallback(async () => {
    if (!db || !uid) return false;
    setSaving(true);
    try {
      await remove(ref(db, preferencePath(uid)));
      setPersonalHours(null);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, [db, uid]);

  return {
    hydrated,
    saving,
    recommendedHours,
    personalHours,
    effectiveHours,
    isPersonal,
    sourceLabel: isPersonal ? 'Riferimento personale' : 'Riferimento 7h',
    savePersonal,
    clearPersonal,
  };
}

export default useSaluteSleepReference;
