import { useEffect, useState } from 'react';
import MealSavingOverlay from './MealSavingOverlay';
import {
  clearMealSavingToast,
  registerMealSavingOverlaySetter,
} from '../utils/mealSavingOverlayController';

const TOAST_HOLD_MS = 2200;

/**
 * Host globale: montato una volta in App così l'overlay chef resta a schermo
 * anche quando FastMealLogger / LiveMealTray vengono smontati a fine save.
 */
export default function MealSavingOverlayHost() {
  const [state, setState] = useState({
    open: false,
    success: false,
    message: 'Salvataggio in corso, attendere...',
    successMessage: 'Pasto registrato con successo!',
    toast: '',
  });

  useEffect(() => registerMealSavingOverlaySetter(setState), []);

  // Precarica video + poster chef così al click l'overlay non parte a nero.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const base = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = `${base}Chef2animazione.mp4`;
    video.load();
    const img = new Image();
    img.src = `${base}Chef2.png`;
    return undefined;
  }, []);

  useEffect(() => {
    const toast = String(state.toast || '').trim();
    if (!toast) return undefined;
    const timer = window.setTimeout(() => {
      clearMealSavingToast();
    }, TOAST_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [state.toast]);

  return (
    <>
      <MealSavingOverlay
        open={state.open}
        message={state.message || 'Salvataggio in corso, attendere...'}
      />
      {state.toast ? (
        <div
          className="pointer-events-none fixed bottom-8 left-1/2 z-[100210] max-w-[90vw] -translate-x-1/2 rounded-full border border-emerald-400/40 bg-slate-950/95 px-4 py-2.5 text-sm font-semibold text-emerald-100 shadow-lg backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          ✓ {state.toast}
        </div>
      ) : null}
    </>
  );
}
