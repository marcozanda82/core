import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Gestisce il tasto Indietro hardware su Android (Capacitor).
 * Web/PWA: no-op.
 */
export default function NativeAndroidBackHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    let listenerHandle = null;
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || cancelled) return;

        const { App: CapacitorApp } = await import('@capacitor/app');
        listenerHandle = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) {
            navigate(-1);
            return;
          }
          void CapacitorApp.exitApp();
        });
      } catch (error) {
        console.warn('[NativeAndroidBackHandler] setup failed', error);
      }
    })();

    return () => {
      cancelled = true;
      listenerHandle?.remove?.();
    };
  }, [navigate]);

  return null;
}
