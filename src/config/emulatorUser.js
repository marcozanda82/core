/**
 * Utente finto, solo per Auth Emulator locale.
 * Non è un account reale e non va usato sul progetto di produzione.
 */
export const EMULATOR_PROJECT_ID = 'demo-kentu-focus';

export const EMULATOR_USER = Object.freeze({
  email: 'prova.locale@kentu.test',
  password: 'emulatore-locale',
  displayName: 'Prova Locale',
});

export function isFirebaseEmulatorMode() {
  const env = import.meta.env ?? {};
  return env.VITE_USE_FIREBASE_EMULATOR === '1';
}

/** Chiave solo sul segreto locale delle Functions. Il client non la vede. */
export function isEmulatorRealAiEnabled() {
  const env = import.meta.env ?? {};
  return env.VITE_EMULATOR_REAL_AI === '1';
}
