/**
 * Firebase Authentication — Google sign-in per KentuOS beta testers.
 */
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  deleteUser,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { remove, ref } from 'firebase/database';
import { auth, db } from '../firebaseConfig';
import { clearKentuLocalUserData } from '../utils/offlineCacheUtils';

export { auth };

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Accede con account Google (popup).
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

/**
 * Termina la sessione corrente e svuota la cache locale (privacy multi-utente).
 * @returns {Promise<void>}
 */
export async function logout() {
  await signOut(auth);
  clearKentuLocalUserData();
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
      await reauthenticateWithPopup(user, googleProvider);
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
