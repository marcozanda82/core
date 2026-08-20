/**
 * Firebase Authentication — Google sign-in per KentuOS beta testers.
 */
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../firebaseConfig';

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
 * Termina la sessione corrente.
 * @returns {Promise<void>}
 */
export async function logout() {
  return signOut(auth);
}

/**
 * Sottoscrive i cambi di stato auth Firebase.
 * @param {(user: import('firebase/auth').User | null) => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
