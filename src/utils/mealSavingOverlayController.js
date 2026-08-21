/**
 * Controller imperativo per MealSavingOverlayHost (sopravvive allo smontaggio del logger).
 * Apre l'overlay chef come prima azione (flushSync) prima di qualsiasi await di salvataggio.
 */

import { flushSync } from 'react-dom';
import {
  MEAL_SAVE_OVERLAY_MIN_MS,
  runMealSaveWithMinDuration,
} from '../components/MealSavingOverlay';

/** @type {null | ((next: object | ((prev: object) => object)) => void)} */
let setterRef = null;
let mealSaveInFlight = false;

const DEFAULT_STATE = {
  open: false,
  success: false,
  message: 'Salvataggio in corso, attendere...',
  successMessage: 'Pasto registrato con successo!',
  toast: '',
};

export function registerMealSavingOverlaySetter(setter) {
  setterRef = typeof setter === 'function' ? setter : null;
  return () => {
    if (setterRef === setter) setterRef = null;
  };
}

function applyOverlay(patch, { sync = false } = {}) {
  if (typeof setterRef !== 'function') return;
  const run = () => {
    setterRef((prev) => ({
      ...DEFAULT_STATE,
      ...(prev && typeof prev === 'object' ? prev : {}),
      ...patch,
    }));
  };
  if (sync) {
    flushSync(run);
  } else {
    run();
  }
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Mostra subito overlay chef → salva in background (min duration) → chiude e toast.
 * @param {() => (void|Promise<unknown>)} saveFn
 * @param {{ message?: string, successMessage?: string, minMs?: number }} [opts]
 */
export async function withMealSavingOverlay(saveFn, opts = {}) {
  if (mealSaveInFlight) {
    return undefined;
  }
  mealSaveInFlight = true;

  const message = opts.message || 'Salvataggio in corso, attendere...';
  const successMessage = opts.successMessage || 'Pasto registrato con successo!';
  const minMs = opts.minMs ?? MEAL_SAVE_OVERLAY_MIN_MS;

  // Primissima azione: overlay visibile PRIMA di qualsiasi elaborazione.
  applyOverlay({
    open: true,
    success: false,
    message,
    successMessage,
    toast: '',
  }, { sync: true });
  await waitForNextPaint();

  try {
    const result = await runMealSaveWithMinDuration(saveFn, minMs);
    // Completamento: chiusura istantanea + toast (niente hold sul video).
    applyOverlay({
      open: false,
      success: false,
      message,
      successMessage,
      toast: successMessage,
    }, { sync: true });
    return result;
  } catch (error) {
    applyOverlay({
      open: false,
      success: false,
      message,
      successMessage,
      toast: '',
    }, { sync: true });
    throw error;
  } finally {
    mealSaveInFlight = false;
  }
}

/** Chiude solo il toast (usato dall'host dopo timeout). */
export function clearMealSavingToast() {
  applyOverlay({ toast: '' });
}
