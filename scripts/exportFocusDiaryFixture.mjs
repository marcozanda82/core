#!/usr/bin/env node
/**
 * Export diario Focus → fixture JSON anonimizzato (dev).
 *
 * Legge da RTDB (sola lettura REST + Firebase ID token):
 *   users/{uid}/tracker_data/trackerStorico_{date}  (giorno + 7 precedenti + giorno pubblicazione)
 *   users/{uid}/profile_targets
 *
 * Env (process only, mai argv/file):
 *   FOCUS_PILOT_UID
 *   FOCUS_ID_TOKEN
 *   FOCUS_EXPECTED_DATABASE_URL  (default mio-tracker europe-west1)
 *   FOCUS_FIXTURE_ANALYSIS_DATE  (default 2026-10-27)
 *   FOCUS_FIXTURE_OUT            (default src/features/kentuFocus/__tests__/fixtures/focusDiary.{date}.real.json)
 *
 * Uso:
 *   node scripts/exportFocusDiaryFixture.mjs
 */

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

import { addCalendarDays } from '../src/features/kentuFocus/normalize/focusDateUtils.js';

const DEFAULT_DB_URL = 'https://mio-tracker-default-rtdb.europe-west1.firebasedatabase.app';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function abort(reason, extra = {}) {
  console.error(JSON.stringify({ ok: false, reason, ...extra }, null, 2));
  process.exit(2);
}

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

/**
 * Rimuove uid / email / nomi persona; lascia nomi alimenti.
 * @param {unknown} value
 * @param {string} uid
 */
function anonymize(value, uid) {
  if (Array.isArray(value)) return value.map((v) => anonymize(v, uid));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && uid && value.includes(uid)) {
      return value.split(uid).join('fixture_user');
    }
    return value;
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const lk = k.toLowerCase();
    if (
      lk === 'uid'
      || lk === 'userid'
      || lk === 'email'
      || lk === 'displayname'
      || lk === 'photourl'
      || lk === 'phone'
      || lk === 'phonenumber'
    ) {
      out[k] = null;
      continue;
    }
    // Solo profilo persona: name top-level in profile, non foodName
    if (lk === 'name' && typeof v === 'string' && !('foodDbKey' in value) && !('grams' in value) && !('kcal' in value) && !('cal' in value)) {
      out[k] = null;
      continue;
    }
    if (lk === 'birthdate') {
      out[k] = null;
      continue;
    }
    out[k] = anonymize(v, uid);
  }
  return out;
}

async function main() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    abort('admin_credentials_present_refused');
  }

  const uid = String(process.env.FOCUS_PILOT_UID || '').trim();
  if (!uid || uid.length < 6) abort('focus_pilot_uid_missing');

  const idToken = String(process.env.FOCUS_ID_TOKEN || '').trim();
  if (!idToken || idToken.length < 20) abort('focus_id_token_missing');
  if (process.argv.some((a) => a.includes(idToken.slice(0, 12)))) {
    abort('token_must_not_appear_in_argv');
  }

  const databaseURL = String(
    process.env.FOCUS_EXPECTED_DATABASE_URL || DEFAULT_DB_URL,
  ).trim().replace(/\/$/, '');

  const analysisDate = String(process.env.FOCUS_FIXTURE_ANALYSIS_DATE || '2026-10-27').trim();
  const publicationDate = addCalendarDays(analysisDate, 1);

  /** @type {string[]} */
  const dates = [];
  for (let i = -7; i <= 1; i += 1) {
    dates.push(addCalendarDays(analysisDate, i));
  }

  /** @type {Record<string, object>} */
  const fullHistory = {};
  let reads = 0;
  for (const date of dates) {
    const key = `trackerStorico_${date}`;
    const url = `${databaseURL}/users/${uid}/tracker_data/${key}.json`;
    const node = await rtdbGetJson(url, idToken);
    reads += 1;
    if (node) fullHistory[key] = node;
  }

  const profileUrl = `${databaseURL}/users/${uid}/profile_targets.json`;
  const profileRaw = await rtdbGetJson(profileUrl, idToken);
  reads += 1;

  const fixture = anonymize({
    schema: 'kentu.focusDiaryFixture.v1',
    analysisDate,
    publicationDate,
    exportedAt: new Date().toISOString(),
    source: 'rtdb_rest_export',
    note: 'Anonimizzato: nessun uid/nome/email. Solo lettura RTDB.',
    profile_targets: profileRaw,
    fullHistory,
  }, uid);

  const outRel = String(
    process.env.FOCUS_FIXTURE_OUT
    || `src/features/kentuFocus/__tests__/fixtures/focusDiary.${analysisDate}.real.json`,
  ).trim();
  const outPath = path.isAbsolute(outRel) ? outRel : path.join(ROOT, outRel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    analysisDate,
    publicationDate,
    reads,
    daysExported: Object.keys(fullHistory).length,
    out: path.relative(ROOT, outPath).replace(/\\/g, '/'),
    bytes: fs.statSync(outPath).size,
  }, null, 2));
}

main().catch((err) => {
  abort(err?.message || 'export_failed', { httpStatus: err?.status ?? null });
});
