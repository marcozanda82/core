import { Capacitor } from '@capacitor/core';

/**
 * Nasconde subito lo splash nativo Capacitor: l'animazione SVG React (KentuWebSplash)
 * copre il boot anche su AAB.
 */
export async function hideNativeSplashScreen() {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 0 });
  } catch {
    /* plugin assente o già nascosto */
  }
}
