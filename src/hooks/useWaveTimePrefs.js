/**
 * Preferenze orarie Wave Planner (Tag + Ora Esatta) con auto-apprendimento.
 * Persistenza: localStorage + Firebase `users/{uid}/profile_targets/waveTimePrefs`.
 */
import { useCallback, useEffect, useState } from 'react';
import { onValue, ref, update } from 'firebase/database';
import {
  DEFAULT_WAVE_TIME_PREFS,
  sanitizeWaveTimePrefs,
} from '../features/training/waveTimePrefs';

const LOCAL_KEY = 'kentu_wave_time_prefs';

function readLocalPrefs() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return sanitizeWaveTimePrefs(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocalPrefs(prefs) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}

/**
 * @param {{
 *   db?: import('firebase/database').Database | null,
 *   userUid?: string | null,
 * }} [options]
 */
export default function useWaveTimePrefs(options = {}) {
  const { db = null, userUid = null } = options;
  const [prefs, setPrefs] = useState(() => readLocalPrefs() || { ...DEFAULT_WAVE_TIME_PREFS });

  useEffect(() => {
    const local = readLocalPrefs();
    if (local) setPrefs(local);

    if (!db || !userUid) return undefined;
    const prefsRef = ref(db, `users/${userUid}/profile_targets/waveTimePrefs`);
    const unsub = onValue(
      prefsRef,
      (snap) => {
        if (!snap.exists()) return;
        const next = sanitizeWaveTimePrefs(snap.val());
        setPrefs(next);
        writeLocalPrefs(next);
      },
      () => {},
    );
    return () => unsub();
  }, [db, userUid]);

  const persistPrefs = useCallback(
    (next) => {
      const safe = sanitizeWaveTimePrefs(next);
      setPrefs(safe);
      writeLocalPrefs(safe);
      if (db && userUid) {
        update(ref(db, `users/${userUid}/profile_targets`), {
          waveTimePrefs: safe,
        }).catch(() => {});
      }
    },
    [db, userUid],
  );

  /** Ora memorizzata per un tag (fallback default). */
  const getTimeForTag = useCallback(
    (tag) => {
      const safe = sanitizeWaveTimePrefs(prefs);
      const key = String(tag || '').toLowerCase();
      return safe[key] || DEFAULT_WAVE_TIME_PREFS.sera;
    },
    [prefs],
  );

  /**
   * Auto-apprendimento: aggiorna silenziosamente la preferenza del tag.
   * @param {string} tag
   * @param {string} exactTime HH:mm
   */
  const rememberTagTime = useCallback(
    (tag, exactTime) => {
      const key = String(tag || '').toLowerCase();
      if (!DEFAULT_WAVE_TIME_PREFS[key]) return;
      const time = String(exactTime || '').trim();
      if (!/^\d{2}:\d{2}$/.test(time)) return;
      const current = sanitizeWaveTimePrefs(prefs);
      if (current[key] === time) return;
      persistPrefs({ ...current, [key]: time });
    },
    [prefs, persistPrefs],
  );

  return {
    prefs: sanitizeWaveTimePrefs(prefs),
    getTimeForTag,
    rememberTagTime,
    setPrefs: persistPrefs,
  };
}
