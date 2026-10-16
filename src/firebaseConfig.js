import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

/**
 * Config Firebase — override via VITE_FIREBASE_* (Vercel / .env).
 * I fallback mantengono il progetto legacy funzionante senza .env.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA5pSzpfq1aGZ1wjNV5-eXnIqWL6brl424',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'mio-tracker.firebaseapp.com',
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL
    || 'https://mio-tracker-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'mio-tracker',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'mio-tracker.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '382993217593',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:382993217593:web:f0780aa061c23f9503f5e8',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export { app, firebaseConfig };
export const auth = getAuth(app);
export const db = getDatabase(app);
/** Firestore — diario salute / eccezioni terapia (motore diabete). */
export const firestore = getFirestore(app);
/** Cloud Functions (BFF AI) — stessa region del backend legacy. */
export const functions = getFunctions(app, 'europe-west1');
