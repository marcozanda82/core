import { useEffect, useSyncExternalStore } from 'react';

// 🔥 FIX UX: Store singleton per coordinare splash screen con caricamento dati
let isReady = false;
const listeners = new Set();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function setAppReady(ready) {
  if (isReady === ready) return;
  isReady = ready;
  notifyListeners();
}

export function getAppReady() {
  return isReady;
}

/**
 * Hook per leggere lo stato ready dell'app (sincronizzato tra componenti).
 * SalaComandi chiama setAppReady(true) quando i dati sono caricati.
 * App.jsx legge questo hook per controllare il splash screen.
 */
export function useAppReadyState() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getAppReady,
    getAppReady,
  );
}

/**
 * Hook per componenti che vogliono segnalare quando sono pronti.
 * Chiama setAppReady(true) quando ready diventa true.
 */
export function useSignalAppReady(ready) {
  useEffect(() => {
    if (ready) {
      setAppReady(true);
    }
  }, [ready]);
}
