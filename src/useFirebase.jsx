/**
 * useFirebase.jsx — Inizializzazione Firebase e logica di autenticazione.
 * Espone app, auth, db, user e handleLogin. La lettura/scrittura dati resta nel consumer (es. SalaComandi).
 */
import { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyA5pSzpfq1aGZ1wjNV5-eXnIqWL6brl424",
  authDomain: "mio-tracker.firebaseapp.com",
  databaseURL: "https://mio-tracker-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mio-tracker",
  storageBucket: "mio-tracker.firebasestorage.app",
  messagingSenderId: "382993217593",
  appId: "1:382993217593:web:f0780aa061c23f9503f5e8"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getDatabase(app);

export function useFirebase() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsub();
  }, []);

  const handleLogin = async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  return { app, auth, db, user, handleLogin };
}
