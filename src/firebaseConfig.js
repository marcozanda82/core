import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyA5pSzpfq1aGZ1wjNV5-eXnIqWL6brl424',
  authDomain: 'mio-tracker.firebaseapp.com',
  databaseURL: 'https://mio-tracker-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'mio-tracker',
  storageBucket: 'mio-tracker.firebasestorage.app',
  messagingSenderId: '382993217593',
  appId: '1:382993217593:web:f0780aa061c23f9503f5e8',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export { app, firebaseConfig };
export const auth = getAuth(app);
export const db = getDatabase(app);
/** Cloud Functions (BFF AI) — stessa region del backend legacy. */
export const functions = getFunctions(app, 'europe-west1');
