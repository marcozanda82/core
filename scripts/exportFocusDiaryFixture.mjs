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
 *   FOCUS_FIXTURE_ANALYSIS_DATE  (default 2026-10-27) — ignorata se FROM e TO sono entrambi presenti
 *   FOCUS_FIXTURE_FROM           (YYYY-MM-DD, insieme a TO: finestra richiesta)
 *   FOCUS_FIXTURE_TO             (YYYY-MM-DD)
 *   FOCUS_FIXTURE_LOOKBACK_DAYS  (default 30: giorni prima di FROM, per le finestre di forza e cardio)
 *   FOCUS_FIXTURE_OUT            (default src/features/kentuFocus/__tests__/fixtures/focusDiary.{date}.real.json)
 *   FOCUS_FIXTURE_INGEST_PORT    (se presente, non legge RTDB: riceve il diario già letto dalla sessione e lo anonimizza)
 *
 * Uso:
 *   node scripts/exportFocusDiaryFixture.mjs
 */

import fs from 'node:fs';
import http from 'node:http';
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
    // Nome di persona nel profilo. I nomi di cibi e di sedute restano.
    const entryType = String(value.type || '').toLowerCase();
    const keepsActivityName = ('foodDbKey' in value)
      || ('grams' in value)
      || ('kcal' in value)
      || ('cal' in value)
      || ('muscles' in value)
      || ('workoutType' in value)
      || ('mealType' in value)
      || entryType === 'workout'
      || entryType === 'food'
      || entryType === 'recipe'
      || entryType === 'meal'
      || entryType === 'sleep';
    if (lk === 'name' && typeof v === 'string' && !keepsActivityName) {
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

function eachDate(from, to) {
  const dates = [];
  let cursor = from;
  while (cursor <= to && dates.length < 400) {
    dates.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return dates;
}

function writeFixture(fixture, outRel) {
  const outPath = path.isAbsolute(outRel) ? outRel : path.join(ROOT, outRel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  return outPath;
}

/**
 * Il diario arriva già letto (sessione dell'app). Si anonimizza con la stessa funzione e si scrive.
 * @param {number} port
 */
function serveIngest(port) {
  const outRel = String(
    process.env.FOCUS_FIXTURE_OUT
    || 'src/features/kentuFocus/__tests__/fixtures/focusDiary.ingest.real.json',
  ).trim();
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const from = String(body.from || '').trim();
        const to = String(body.to || '').trim();
        const historyFrom = String(body.historyFrom || from).trim();
        const historyTo = String(body.historyTo || to).trim();
        const fixture = anonymize({
          schema: 'kentu.focusDiaryFixture.v1',
          analysisDate: to,
          publicationDate: addCalendarDays(to, 1),
          range: { from, to, historyFrom, historyTo },
          exportedAt: new Date().toISOString(),
          source: 'rtdb_session_export',
          note: 'Anonimizzato: nessun uid/nome/email. Diario letto dalla sessione già aperta, scritto in locale.',
          profile_targets: body.profile_targets || null,
          day_status: body.day_status || {},
          fullHistory: body.fullHistory || {},
        }, String(body.uid || ''));
        const outPath = writeFixture(fixture, outRel);
        const payload = {
          ok: true,
          from,
          to,
          daysExported: Object.keys(fixture.fullHistory || {}).length,
          dayStatusDays: Object.keys(fixture.day_status || {}).length,
          out: path.relative(ROOT, outPath).replace(/\\/g, '/'),
          bytes: fs.statSync(outPath).size,
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        console.log(JSON.stringify(payload, null, 2));
        server.close();
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, reason: err?.message || 'ingest_failed' }));
      }
    });
  });
  server.listen(port, '127.0.0.1');
}

async function main() {
  const ingestPort = Number(process.env.FOCUS_FIXTURE_INGEST_PORT || 0);
  if (ingestPort > 0) {
    serveIngest(ingestPort);
    return;
  }

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

  const from = String(process.env.FOCUS_FIXTURE_FROM || '').trim();
  const to = String(process.env.FOCUS_FIXTURE_TO || '').trim();
  const analysisDate = String(process.env.FOCUS_FIXTURE_ANALYSIS_DATE || '2026-10-27').trim();
  const ranged = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
  const lookback = Number(process.env.FOCUS_FIXTURE_LOOKBACK_DAYS || 30);
  const historyFrom = ranged ? addCalendarDays(from, -lookback) : addCalendarDays(analysisDate, -7);
  const historyTo = ranged ? addCalendarDays(to, 1) : addCalendarDays(analysisDate, 1);
  const publicationDate = ranged ? addCalendarDays(to, 1) : addCalendarDays(analysisDate, 1);
  const dates = eachDate(historyFrom, historyTo);

  /** @type {Record<string, object>} */
  const fullHistory = {};
  /** @type {Record<string, object>} */
  const dayStatus = {};
  let reads = 0;
  for (const date of dates) {
    const key = `trackerStorico_${date}`;
    const url = `${databaseURL}/users/${uid}/tracker_data/${key}.json`;
    const node = await rtdbGetJson(url, idToken);
    reads += 1;
    if (node) fullHistory[key] = node;
    const statusUrl = `${databaseURL}/users/${uid}/day_status/${date}.json`;
    const statusNode = await rtdbGetJson(statusUrl, idToken);
    reads += 1;
    if (statusNode) dayStatus[date] = statusNode;
  }

  const profileUrl = `${databaseURL}/users/${uid}/profile_targets.json`;
  const profileRaw = await rtdbGetJson(profileUrl, idToken);
  reads += 1;

  const fixture = anonymize({
    schema: 'kentu.focusDiaryFixture.v1',
    analysisDate: ranged ? to : analysisDate,
    publicationDate,
    range: ranged ? { from, to, historyFrom, historyTo } : undefined,
    exportedAt: new Date().toISOString(),
    source: 'rtdb_rest_export',
    note: 'Anonimizzato: nessun uid/nome/email. Solo lettura RTDB.',
    profile_targets: profileRaw,
    day_status: dayStatus,
    fullHistory,
  }, uid);

  const outRel = String(
    process.env.FOCUS_FIXTURE_OUT
    || `src/features/kentuFocus/__tests__/fixtures/focusDiary.${ranged ? to : analysisDate}.real.json`,
  ).trim();
  const outPath = writeFixture(fixture, outRel);

  console.log(JSON.stringify({
    ok: true,
    analysisDate: ranged ? to : analysisDate,
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
