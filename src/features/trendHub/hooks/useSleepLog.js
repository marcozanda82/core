import { useCallback, useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import {
  normalizeSleepLogEntry,
  saveSleepMetrics,
} from '../utils/sleepLogs';

/**
 * Subscribe + save per `users/{uid}/sleep_logs/{date}`.
 */
export function useSleepLog({
  db = null,
  uid = null,
  date = '',
  enabled = true,
} = {}) {
  const [entry, setEntry] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const dateKey = String(date || '').slice(0, 10);

  useEffect(() => {
    if (!enabled || !db || !uid || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      setEntry(null);
      setHydrated(false);
      return undefined;
    }
    setHydrated(false);
    const unsub = onValue(ref(db, `users/${uid}/sleep_logs/${dateKey}`), (snap) => {
      setEntry(normalizeSleepLogEntry(snap.val()));
      setHydrated(true);
    });
    return () => unsub();
  }, [enabled, db, uid, dateKey]);

  const save = useCallback(
    async ({ hours, quality }) => {
      if (!db || !uid || !dateKey) {
        setErrorMessage('Sessione non pronta per salvare il sonno.');
        return null;
      }
      setSaving(true);
      setErrorMessage(null);
      try {
        const payload = await saveSleepMetrics({
          db,
          uid,
          date: dateKey,
          hours,
          quality,
        });
        setEntry(payload);
        return payload;
      } catch (err) {
        const msg = String(err?.message || err || 'Errore salvataggio sonno');
        setErrorMessage(msg);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [db, uid, dateKey],
  );

  return {
    entry,
    hydrated,
    saving,
    errorMessage,
    save,
    hasEntry: Boolean(entry),
  };
}

export default useSleepLog;
