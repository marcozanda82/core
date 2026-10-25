/**
 * Client Firebase (modular) contro Auth+RTDB emulator — due app distinte = due «dispositivi».
 * Solo test. Nessuna scrittura su produzione.
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, set, get } from 'firebase/database';
import { createEmulatorAdminApp, getFocusEmulatorHost, getFocusEmulatorProjectId } from './createEmulatorAdmin.js';
import { createFirebaseFocusAiAnalysisStore } from '../../product/focusAiAnalysisPersistence.js';

/**
 * @param {string} uid
 * @param {string} [appName]
 */
export async function createEmulatorAuthedFocusAiStore(uid, appName = `focus-ai-${uid}-${Date.now()}`) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  const projectId = getFocusEmulatorProjectId();
  const [dbHost, dbPortStr] = getFocusEmulatorHost().split(':');
  const dbPort = Number(dbPortStr) || 9000;
  const [authHost, authPortStr] = String(process.env.FIREBASE_AUTH_EMULATOR_HOST).split(':');
  const authPort = Number(authPortStr) || 9099;

  const app = initializeApp(
    {
      apiKey: 'fake-api-key',
      projectId,
      databaseURL: `http://${dbHost}:${dbPort}?ns=${projectId}`,
    },
    appName,
  );

  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });

  const rtdb = getDatabase(app);
  connectDatabaseEmulator(rtdb, dbHost, dbPort);

  const { admin } = createEmulatorAdminApp();
  const customToken = await admin.auth().createCustomToken(String(uid));
  await signInWithCustomToken(auth, customToken);

  const store = createFirebaseFocusAiAnalysisStore({
    db: rtdb,
    ref,
    set,
    get,
  });

  return {
    kind: 'firebase_emulator_client',
    uid,
    app,
    auth,
    db: rtdb,
    store,
    async dispose() {
      try {
        await auth.signOut();
      } catch {
        /* ignore */
      }
      await deleteApp(app);
    },
  };
}
