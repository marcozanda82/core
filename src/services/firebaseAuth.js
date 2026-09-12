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

const NATIVE_GOOGLE_SIGNIN_OPTS = { skipNativeAuth: true };

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
