#!/usr/bin/env node
/**
 * Audit storico (sola lettura) — piatti composti sospetti vs alimento semplice catalogo.
 *
 * Segnala voci degli ultimi 90 giorni (wizard/chat/voce) dove:
 *  - il nome sembra un piatto composto (più ingredienti / di|con|al|alla|allo|ai|agli|alle);
 *  - esiste nei cataloghi un alimento semplice il cui nome coincide con una parola del piatto;
 *  - densità energetica (kcal/100g) del registrato > 3× quella dell'alimento semplice.
 *
 * Non modifica il diario.
 *
 * Fonti:
 *  A) RTDB live (env FOCUS_PILOT_UID + FOCUS_ID_TOKEN) — GET users/{uid}/tracker_data/trackerStorico_{date}
 *  B) Fixture locale: --fixture path/to/focusDiary*.json
 *
 * Cataloghi (sola lettura file):
 *  - public/kentu_smart_master_db.json (CREA / Kentu IT)
 *  - opzionale AUDIT_PERSONAL_FOOD_DB=path.json
 *
 * Uso:
 *   node scripts/auditCompoundFoodMatches.mjs
 *   node scripts/auditCompoundFoodMatches.mjs --fixture src/features/kentuFocus/__tests__/fixtures/focusDiary.2026-10-27.real.json
 *   node scripts/auditCompoundFoodMatches.mjs --days 90 --out tmp/compound-audit.json
 */

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

import {
  ENERGY_DENSITY_CONFIRM_RATIO,
  auditCompoundFoodMatches,
  iterDiaryItemsForCompoundAudit,
  normalizeAuditCatalog,
} from '../src/features/kentuFocus/product/auditCompoundFoodMatchesCore.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DB_URL = 'https://mio-tracker-default-rtdb.europe-west1.firebasedatabase.app';

function abort(reason, extra = {}) {
  console.error(JSON.stringify({ ok: false, reason, ...extra }, null, 2));
  process.exit(2);
}

function parseArgs(argv) {
  /** @type {{ fixture: string|null, days: number, out: string|null, ratio: number }} */
  const out = { fixture: null, days: 90, out: null, ratio: ENERGY_DENSITY_CONFIRM_RATIO };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--fixture') out.fixture = String(argv[++i] || '').trim() || null;
    else if (a === '--days') out.days = Math.max(1, Number(argv[++i]) || 90);
    else if (a === '--out') out.out = String(argv[++i] || '').trim() || null;
    else if (a === '--ratio') out.ratio = Math.max(1.1, Number(argv[++i]) || ENERGY_DENSITY_CONFIRM_RATIO);
  }
  return out;
}

function addCalendarDays(isoDate, delta) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function todayIsoLocal() {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

function loadJson(relOrAbs) {
  const p = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function loadHistoryFromRtdb(days) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    abort('admin_credentials_present_refused');
  }
  const uid = String(process.env.FOCUS_PILOT_UID || '').trim();
  if (!uid || uid.length < 6) abort('focus_pilot_uid_missing_or_use_fixture');
  const idToken = String(process.env.FOCUS_ID_TOKEN || '').trim();
  if (!idToken || idToken.length < 20) abort('focus_id_token_missing_or_use_fixture');

  const databaseURL = String(
    process.env.FOCUS_EXPECTED_DATABASE_URL || DEFAULT_DB_URL,
  ).trim().replace(/\/$/, '');

  const end = todayIsoLocal();
  /** @type {Record<string, object>} */
  const fullHistory = {};
  let reads = 0;
  for (let i = 0; i < days; i += 1) {
    const date = addCalendarDays(end, -i);
    const key = `trackerStorico_${date}`;
    const url = `${databaseURL}/users/${uid}/tracker_data/${key}.json`;
    // eslint-disable-next-line no-await-in-loop
    const node = await rtdbGetJson(url, idToken);
    reads += 1;
    if (node) fullHistory[key] = node;
  }
  return { fullHistory, reads, source: 'rtdb' };
}

function loadHistoryFromFixture(fixturePath) {
  const raw = loadJson(fixturePath);
  const fullHistory = raw.fullHistory && typeof raw.fullHistory === 'object'
    ? raw.fullHistory
    : raw;
  return { fullHistory, reads: 0, source: `fixture:${fixturePath}` };
}

function printTable(suspects) {
  if (suspects.length === 0) {
    console.log('Nessuna voce sospetta trovata.');
    return;
  }
  console.log(`\nVoci sospette: ${suspects.length}\n`);
  console.log(
    [
      'data'.padEnd(12),
      'pasto'.padEnd(14),
      'registrato'.padEnd(36),
      'semplice'.padEnd(22),
      'Δkcal/100g'.padStart(10),
      'ratio'.padStart(6),
    ].join(' '),
  );
  console.log('-'.repeat(110));
  for (const s of suspects) {
    console.log(
      [
        String(s.date).padEnd(12),
        String(s.meal).slice(0, 14).padEnd(14),
        String(s.recorded).slice(0, 36).padEnd(36),
        String(s.simpleAlternative).slice(0, 22).padEnd(22),
        String(s.kcalDeltaPer100g).padStart(10),
        String(s.densityRatio).padStart(6),
      ].join(' '),
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const masterPath = process.env.AUDIT_KENTU_DB
    || 'public/kentu_smart_master_db.json';
  const catalogs = [normalizeAuditCatalog(loadJson(masterPath))];
  if (process.env.AUDIT_PERSONAL_FOOD_DB) {
    catalogs.push(normalizeAuditCatalog(loadJson(process.env.AUDIT_PERSONAL_FOOD_DB)));
  }

  const history = args.fixture
    ? loadHistoryFromFixture(args.fixture)
    : await loadHistoryFromRtdb(args.days);

  // Con fixture: non filtrare per 90gg (usa tutto il file); con RTDB già limitato a days.
  const suspects = auditCompoundFoodMatches(history.fullHistory, catalogs, args.ratio);

  const report = {
    ok: true,
    readOnly: true,
    source: history.source,
    reads: history.reads,
    daysRequested: args.days,
    ratio: args.ratio,
    catalogEntries: catalogs.reduce((n, c) => n + Object.keys(c).length, 0),
    diaryItemsScanned: iterDiaryItemsForCompoundAudit(history.fullHistory).length,
    suspectCount: suspects.length,
    suspects,
  };

  printTable(suspects);

  if (args.out) {
    const outPath = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`\nReport scritto: ${path.relative(ROOT, outPath).replace(/\\/g, '/')}`);
  } else {
    console.log(`\n${JSON.stringify({
      ok: true,
      suspectCount: suspects.length,
      diaryItemsScanned: report.diaryItemsScanned,
      source: report.source,
    }, null, 2)}`);
  }
}

main().catch((err) => {
  abort(err?.message || 'audit_failed', { httpStatus: err?.status ?? null });
});
