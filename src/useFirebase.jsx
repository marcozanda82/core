/**
 * useFirebase.jsx — Accesso Firebase condiviso (db + sessione utente da AuthContext).
 * La lettura/scrittura dati resta nel consumer (es. SalaComandi).
 */
import { useAuth } from './contexts/AuthContext';
import { app, auth, db } from './firebaseConfig';

export function useFirebase() {
  const { user, authReady, uid } = useAuth();
  return { app, auth, db, user, authReady, uid };
}
