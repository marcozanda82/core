/**
 * Inizializza firebase-admin contro RTDB emulator (solo locale).
 * Usa il firebase-admin già presente in functions/ (nessuna nuova dipendenza root).
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../../');
const require = createRequire(path.join(ROOT, 'functions', 'package.json'));

const PROJECT_ID = process.env.GCLOUD_PROJECT
  || process.env.GOOGLE_CLOUD_PROJECT
  || 'demo-kentu-focus';

const EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';

/**
 * @returns {{
 *   admin: typeof import('firebase-admin'),
 *   db: import('firebase-admin/database').Database,
 *   projectId: string,
 *   databaseURL: string,
 *   emulatorHost: string,
 * }}
 */
export function createEmulatorAdminApp() {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = EMULATOR_HOST;

  const admin = require('firebase-admin');
  const databaseURL = `http://${EMULATOR_HOST}?ns=${PROJECT_ID}`;

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: PROJECT_ID,
      databaseURL,
    });
  }

  const db = admin.database();
  return {
    admin,
    db,
    projectId: PROJECT_ID,
    databaseURL,
    emulatorHost: EMULATOR_HOST,
  };
}

/** Chiude l'app Admin per far terminare il process Node nei test. */
export async function deleteEmulatorAdminApp() {
  const admin = require('firebase-admin');
  await Promise.all(admin.apps.map((a) => a.delete()));
}

export function getFocusEmulatorProjectId() {
  return PROJECT_ID;
}

export function getFocusEmulatorHost() {
  return EMULATOR_HOST;
}
