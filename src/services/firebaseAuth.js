/**
 * Firebase Authentication — Google sign-in per KentuOS beta testers.
 *
 * Web/PWA: Firebase JS `signInWithPopup`.
 * Android/iOS Capacitor: Google Sign-In nativo (account picker di sistema)
 * poi `signInWithCredential` sul JS SDK, così onAuthStateChanged / RTDB restano invariati.
 */
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  deleteUser,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { remove, ref } from 'firebase/database';
import { auth, db } from '../firebaseConfig';
import { clearKentuLocalUserData } from '../utils/offlineCacheUtils';

export { auth };

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/** Web Client ID (OAuth client_type 3). Non usare gli ID Android (client_type 1). */
const GOOGLE_WEB_CLIENT_ID =
  '382993217593-ekmjfc66dh22su9qva0dmnj8nmle936j.apps.googleusercontent.com';

const NATIVE_GOOGLE_SIGNIN_OPTS = {
  skipNativeAuth: true,
  clientId: GOOGLE_WEB_CLIENT_ID,
  serverClientId: GOOGLE_WEB_CLIENT_ID,
};

function isNativeRuntime() {
  return Capacitor.isNativePlatform();
}

export function isAuthCancelled(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    message.includes('cancel')
  );
}

/**
 * Messaggio UI per errori Auth (email/password e Google).
 * @param {unknown} error
 * @returns {string}
 */
export function getAuthErrorMessage(error) {
  const code = String(error?.code || '');
  switch (code) {
    case 'auth/invalid-email':
      return 'Indirizzo email non valido.';
    case 'auth/user-not-found':
      return 'Nessun account associato a questa email.';
    case 'auth/wrong-password':
      return 'Password errata. Riprova.';
    case 'auth/invalid-credential':
      return 'Email o password non corretti.';
    case 'auth/email-already-in-use':
      return 'Questa email è già in uso. Accedi oppure usa un altro indirizzo.';
    case 'auth/weak-password':
      return 'La password deve avere almeno 6 caratteri.';
    case 'auth/missing-password':
      return 'Inserisci una password.';
    case 'auth/missing-email':
      return 'Inserisci un indirizzo email.';
    case 'auth/too-many-requests':
      return 'Troppi tentativi. Riprova tra qualche minuto.';
    case 'auth/network-request-failed':
      return 'Connessione assente. Verifica la rete e riprova.';
    case 'auth/operation-not-allowed':
      return 'Accesso email non abilitato. Contatta il supporto.';
    default:
      return 'Accesso non riuscito. Verifica i dati e riprova.';
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Account picker nativo → ID token Google → credential Firebase JS.
 * @returns {Promise<import('firebase/auth').AuthCredential>}
 */
async function nativeGoogleCredential() {
  const result = await FirebaseAuthentication.signInWithGoogle(NATIVE_GOOGLE_SIGNIN_OPTS);
  const idToken = result?.credential?.idToken;
  if (!idToken) {
    throw new Error('Google Sign-In nativo non ha restituito un idToken');
  }
  return GoogleAuthProvider.credential(idToken, result.credential?.accessToken);
}

async function signOutNativeGoogleSession() {
  if (!isNativeRuntime()) return;
  try {
    await FirebaseAuthentication.signOut();
  } catch {
    // skipNativeAuth: la sessione nativa Firebase può essere vuota.
  }
}

/**
 * Accede con account Google.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function loginWithGoogle() {
  if (isNativeRuntime()) {
    const credential = await nativeGoogleCredential();
    return signInWithCredential(auth, credential);
  }
  return signInWithPopup(auth, googleProvider);
}

/**
 * Accede con email e password Firebase.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function loginWithEmailPassword(email, password) {
  return signInWithEmailAndPassword(auth, normalizeEmail(email), String(password || ''));
}

/**
 * Crea un account email/password Firebase.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function createAccountWithEmailPassword(email, password) {
  return createUserWithEmailAndPassword(auth, normalizeEmail(email), String(password || ''));
}

/**
 * Termina la sessione corrente e svuota la cache locale (privacy multi-utente).
 * @returns {Promise<void>}
 */
export async function logout() {
  await signOutNativeGoogleSession();
  await signOut(auth);
  clearKentuLocalUserData();
}

async function reauthenticateCurrentUser(user) {
  if (isNativeRuntime()) {
    const credential = await nativeGoogleCredential();
    await reauthenticateWithCredential(user, credential);
    return;
  }
  await reauthenticateWithPopup(user, googleProvider);
}

/**
 * Elimina i dati RTDB dell'utente, l'account Auth e la cache locale (GDPR / store).
 * Richiede login recente; in caso di `auth/requires-recent-login` riesegue re-auth Google.
 * @returns {Promise<void>}
 */
export async function deleteAccountAndUserData() {
  const user = auth.currentUser;
  if (!user?.uid) {
    throw new Error('Nessun utente autenticato');
  }

  const uid = user.uid;

  await remove(ref(db, `users/${uid}`));
  clearKentuLocalUserData();

  try {
    await deleteUser(user);
  } catch (error) {
    if (error?.code === 'auth/requires-recent-login') {
      await reauthenticateCurrentUser(user);
      const refreshed = auth.currentUser;
      if (!refreshed) {
        throw new Error('Re-autenticazione non riuscita');
      }
      await remove(ref(db, `users/${refreshed.uid}`));
      clearKentuLocalUserData();
      await deleteUser(refreshed);
      return;
    }
    throw error;
  }
}

/**
 * Sottoscrive i cambi di stato auth Firebase.
 * @param {(user: import('firebase/auth').User | null) => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
