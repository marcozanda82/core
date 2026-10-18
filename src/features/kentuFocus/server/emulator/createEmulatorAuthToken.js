/**
 * ID token utente via Auth Emulator + Admin customToken.
 * Nessuna nuova dipendenza; usa firebase-admin già in functions/.
 */

import http from 'node:http';
import { createEmulatorAdminApp, getFocusEmulatorProjectId } from './createEmulatorAdmin.js';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

/**
 * @param {string} uid
 * @returns {Promise<string>} idToken
 */
export async function createEmulatorIdToken(uid) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  const { admin } = createEmulatorAdminApp();

  // Su emulator non servono credenziali reali per custom tokens.
  const customToken = await admin.auth().createCustomToken(String(uid));

  const [hostname, portStr] = AUTH_HOST.split(':');
  const port = Number(portStr) || 9099;
  const projectId = getFocusEmulatorProjectId();
  const path = `/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`;
  const body = JSON.stringify({
    token: customToken,
    returnSecureToken: true,
  });

  const result = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname,
        port,
        path,
        method: 'POST',
        timeout: 10_000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          // Auth emulator richiede questo header per il project
          Authorization: `Bearer owner`,
          'x-goog-request-params': `project_id=${projectId}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data || '{}'), raw: data });
          } catch {
            reject(new Error(`auth token parse fail: ${data}`));
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('auth emulator timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (!result.json?.idToken) {
    // retry con query project
    const path2 = `/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key&projectId=${encodeURIComponent(projectId)}`;
    const result2 = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname,
          port,
          path: path2,
          method: 'POST',
          timeout: 10_000,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, json: JSON.parse(data || '{}'), raw: data });
            } catch {
              reject(new Error(`auth token parse fail: ${data}`));
            }
          });
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    if (!result2.json?.idToken) {
      throw new Error(`createEmulatorIdToken failed: ${result.raw || result2.raw}`);
    }
    return result2.json.idToken;
  }

  return result.json.idToken;
}
