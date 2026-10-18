/**
 * Carica database.rules.focus.local.json nell'emulatore RTDB via REST.
 * Non tocca le regole di produzione su database.rules.json.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFocusEmulatorHost, getFocusEmulatorProjectId } from './createEmulatorAdmin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../../');
const LOCAL_RULES = path.join(ROOT, 'database.rules.focus.local.json');

/**
 * @param {string} [rulesPath]
 */
export async function loadFocusLocalRules(rulesPath = LOCAL_RULES) {
  const rulesJson = fs.readFileSync(rulesPath, 'utf8');
  // L'API emulator vuole il documento rules grezzo
  const body = rulesJson;
  const host = getFocusEmulatorHost();
  const [hostname, portStr] = host.split(':');
  const port = Number(portStr) || 9000;
  const ns = getFocusEmulatorProjectId();

  await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname,
        port,
        path: `/.settings/rules.json?ns=${encodeURIComponent(ns)}`,
        method: 'PUT',
        headers: {
          Authorization: 'Bearer owner',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data });
          } else {
            reject(new Error(`loadFocusLocalRules failed: ${res.statusCode} ${data}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Lettura client-simulata via REST emulator.
 * @param {string} absolutePath path senza leading slash, es. kentu_focus/uidA/jobs
 * @param {{ uid?: string|null, idToken?: string|null }} [auth]
 */
export async function emulatorRestGet(absolutePath, auth = {}) {
  const host = getFocusEmulatorHost();
  const [hostname, portStr] = host.split(':');
  const port = Number(portStr) || 9000;
  const ns = getFocusEmulatorProjectId();
  let authParam = '';
  if (auth.idToken) {
    authParam = `&auth=${encodeURIComponent(auth.idToken)}`;
  } else if (auth.uid) {
    // fallback legacy (non affidabile su emulator 4.x)
    authParam = `&auth=${encodeURIComponent(JSON.stringify({ uid: auth.uid }))}`;
  } else {
    authParam = '';
  }
  const pathUrl = `/${absolutePath.replace(/^\//, '')}.json?ns=${encodeURIComponent(ns)}${authParam}`;

  return new Promise((resolve, reject) => {
    const req = http.get({ hostname, port, path: pathUrl, timeout: 10_000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch {
          parsed = data;
        }
        const denied = res.statusCode === 401 || res.statusCode === 403
          || (typeof parsed === 'string' && /permission\s*denied/i.test(parsed))
          || (typeof parsed === 'object' && parsed && parsed.error);
        resolve({
          statusCode: res.statusCode,
          body: parsed,
          raw: data,
          denied: Boolean(denied),
        });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`emulatorRestGet timeout: ${absolutePath}`));
    });
    req.on('error', reject);
  });
}

/**
 * @param {string} absolutePath
 * @param {unknown} value
 * @param {{ uid?: string|null, idToken?: string|null }} [auth]
 */
export async function emulatorRestPut(absolutePath, value, auth = {}) {
  const host = getFocusEmulatorHost();
  const [hostname, portStr] = host.split(':');
  const port = Number(portStr) || 9000;
  const ns = getFocusEmulatorProjectId();
  let authParam = '';
  if (auth.idToken) {
    authParam = `&auth=${encodeURIComponent(auth.idToken)}`;
  } else if (auth.uid) {
    authParam = `&auth=${encodeURIComponent(JSON.stringify({ uid: auth.uid }))}`;
  } else {
    authParam = '';
  }
  const body = JSON.stringify(value);
  const pathUrl = `/${absolutePath.replace(/^\//, '')}.json?ns=${encodeURIComponent(ns)}${authParam}`;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname,
        port,
        path: pathUrl,
        method: 'PUT',
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
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = data;
          }
          const denied = res.statusCode === 401 || res.statusCode === 403
            || (typeof parsed === 'string' && /permission\s*denied/i.test(String(parsed)))
            || /permission\s*denied/i.test(data)
            || (typeof parsed === 'object' && parsed && parsed.error);
          resolve({
            statusCode: res.statusCode,
            body: parsed,
            raw: data,
            denied: Boolean(denied),
          });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`emulatorRestPut timeout: ${absolutePath}`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export { LOCAL_RULES };
