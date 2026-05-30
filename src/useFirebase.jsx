/**
 * useFirebase.jsx — Inizializzazione Firebase e logica di autenticazione.
 * Espone app, auth, db, user e handleLogin. La lettura/scrittura dati resta nel consumer (es. SalaComandi).
 */
import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { app, auth, db } from './firebaseConfig';

export function useFirebase() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const handleLogin = async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  return { app, auth, db, user, authReady, handleLogin };
}
