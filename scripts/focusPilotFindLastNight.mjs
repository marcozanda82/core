#!/usr/bin/env node
/**
 * P2 — Ultima notte principale valida (sola lettura REST RTDB).
 *
 * Eseguire nella PowerShell dove sono già impostati (solo Process, non User/Machine):
 *   FOCUS_PILOT_UID
 *   FOCUS_ID_TOKEN   ← Firebase ID token sessione app (non CLI/Admin)
 *
 * Opzionali:
 *   FOCUS_EXPECTED_PROJECT   default mio-tracker
 *   FOCUS_EXPECTED_DATABASE_URL  default https://mio-tracker-default-rtdb.europe-west1.firebasedatabase.app
 *
 * Nessuna scrittura. Nessun Gemini. Nessun Admin/CLI.
 * Token: solo env di processo; mai argv; mai file.
 *
 * Uso:
 *   node scripts/focusPilotFindLastNight.mjs
 */

import https from 'node:https';
import { URL } from 'node:url';

import { addCalendarDays } from '../src/features/kentuFocus/normalize/focusDateUtils.js';
import { getLogArray } from '../src/features/kentuFocus/normalize/logUtils.js';
import {
  MAIN_NIGHT_STATUS,
  resolveMainNightSleep,
} from '../src/features/kentuFocus/normalize/resolveMainNightSleep.js';
import { maskFocusAdminUid } from '../src/features/kentuFocus/server/admin/runFocusAdminEdition.js';

const DEFAULT_PROJECT = 'mio-tracker';
const DEFAULT_DB_URL = 'https://mio-tracker-default-rtdb.europe-west1.firebasedatabase.app';
const MAX_DATES = 14;

function localIsoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function abort(reason, extra = {}) {
  console.log(JSON.stringify({
    ok: false,
    block: reason,
    ...extra,
    writes: 0,
  }, null, 2));
  process.exit(2);
}

function assertNoAdminOrCliCreds() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    abort('admin_credentials_present_refused');
  }
  if (process.env.FIREBASE_TOKEN) {
    abort('firebase_cli_token_present_refused');
  }
  if (process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    abort('emulator_host_set_refused_for_prod_read');
  }
}

/**
 * GET JSON RTDB con Authorization Bearer (niente token in query string).
 * @param {string} absoluteUrl
 * @param {string} idToken
 */
function rtdbGetJson(absoluteUrl, idToken) {
  return new Promise((resolve, reject) => {
    const u = new URL(absoluteUrl);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: 'application/json',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode || 0;
          if (status === 401 || status === 403) {
            reject(Object.assign(new Error('rtdb_unauthorized'), { status }));
            return;
          }
          if (status < 200 || status >= 300) {
            reject(Object.assign(new Error('rtdb_http_error'), { status }));
            return;
          }
          if (!raw || raw === 'null') {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error('rtdb_json_parse_error'));
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function sleepEntriesFromDayNode(node) {
  return getLogArray(node).filter((e) => e && e.type === 'sleep');
}

async function main() {
  assertNoAdminOrCliCreds();

  const uid = String(process.env.FOCUS_PILOT_UID || '').trim();
  if (!uid || uid.length < 6) {
    abort('focus_pilot_uid_missing');
  }

  const allow = String(process.env.FOCUS_ADMIN_ALLOWED_UIDS || '').trim();
  if (allow) {
    const list = allow.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length !== 1 || list[0] !== uid) {
      abort('allowlist_mismatch_or_not_singleton');
    }
  }

  const projectId = String(
    process.env.FOCUS_EXPECTED_PROJECT || DEFAULT_PROJECT,
  ).trim();
  if (projectId !== 'mio-tracker') {
    abort('project_not_authorized', { projectId: projectId ? '(set)' : '(empty)' });
  }

  const databaseURL = String(
    process.env.FOCUS_EXPECTED_DATABASE_URL || DEFAULT_DB_URL,
  ).trim().replace(/\/$/, '');
  if (databaseURL !== DEFAULT_DB_URL) {
    abort('database_url_mismatch');
  }

  const idToken = String(process.env.FOCUS_ID_TOKEN || '').trim();
  if (!idToken || idToken.length < 20) {
    abort('focus_id_token_missing');
  }
  // Rifiuta se qualcuno ha passato il token via argv per errore
  if (process.argv.some((a) => a.includes(idToken.slice(0, 12)))) {
    abort('token_must_not_appear_in_argv');
  }

  const startDate = localIsoToday();
  let datesChecked = 0;
  let reads = 0;
  /** @type {{ date: string, status: string, reason: string }[]} */
  const ambiguous = [];

  for (let i = 0; i < MAX_DATES; i += 1) {
    const date = addCalendarDays(startDate, -i);
    datesChecked += 1;
    const path = `users/${uid}/tracker_data/trackerStorico_${date}.json`;
    const url = `${databaseURL}/${path}`;

    let node;
    try {
      node = await rtdbGetJson(url, idToken);
      reads += 1;
    } catch (err) {
      abort(err?.message || 'rtdb_read_failed', {
        datesChecked,
        reads,
        httpStatus: err?.status ?? null,
        subject: maskFocusAdminUid(uid),
      });
    }

    const selection = resolveMainNightSleep(sleepEntriesFromDayNode(node));

    if (selection.status === MAIN_NIGHT_STATUS.selected) {
      const publicationDate = date;
      const analysisDate = addCalendarDays(publicationDate, -1);
      console.log(JSON.stringify({
        ok: true,
        projectId,
        databaseHost: 'mio-tracker-default-rtdb.europe-west1.firebasedatabase.app',
        subject: maskFocusAdminUid(uid),
        publicationDate,
        analysisDate,
        nightStatus: 'main_night_valid',
        nightReason: selection.reason,
        datesChecked,
        reads,
        ambiguousCount: ambiguous.length,
        ambiguousStatuses: ambiguous.map((a) => ({
          // solo esito diagnostico, nessuna data se preferisci privacy stretta:
          // includiamo la data calendario (non è PII del diario)
          date: a.date,
          status: a.status,
          reason: a.reason,
        })),
        writes: 0,
        authMode: 'rtdb_rest_bearer_id_token',
      }, null, 2));
      process.exit(0);
    }

    if (selection.status === MAIN_NIGHT_STATUS.ambiguous) {
      ambiguous.push({
        date,
        status: selection.status,
        reason: selection.reason,
      });
    }
  }

  console.log(JSON.stringify({
    ok: false,
    projectId,
    subject: maskFocusAdminUid(uid),
    publicationDate: null,
    analysisDate: null,
    nightStatus: 'no_valid_main_night_in_window',
    datesChecked,
    reads,
    ambiguousCount: ambiguous.length,
    ambiguousStatuses: ambiguous.map((a) => ({
      date: a.date,
      status: a.status,
      reason: a.reason,
    })),
    block: 'expand_search_requires_authorization',
    writes: 0,
    authMode: 'rtdb_rest_bearer_id_token',
  }, null, 2));
  process.exit(1);
}

main().catch((err) => {
  console.log(JSON.stringify({
    ok: false,
    block: 'unhandled',
    // niente messaggio grezzo che possa contenere path/token
    errorCode: String(err?.message || 'error').slice(0, 64),
    writes: 0,
  }, null, 2));
  process.exit(1);
});
