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

import { normalizeSearchText } from '../src/foodSearch.js';
import {
  ENERGY_DENSITY_CONFIRM_RATIO,
  classifyFoodMatchQuality,
  findStrongFoodMatchesInCatalog,
} from '../src/features/mealBuilder/utils/foodMatchQuality.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DB_URL = 'https://mio-tracker-default-rtdb.europe-west1.firebasedatabase.app';
const ASSISTED_SOURCES = new Set([
  'chat',
  'chat_draft',
  'voice',
  'mcdrive',
  'wizard',
  'sequential',
  'fast_path',
  'fastpath',
]);

const COMPOUND_CONNECTOR = /\b(?:di|con|al|alla|allo|ai|agli|alle|e|ed)\b/i;
const STOP_WORDS = new Set([
  'di', 'con', 'al', 'alla', 'allo', 'ai', 'agli', 'alle', 'e', 'ed',
  'un', 'una', 'uno', 'il', 'la', 'lo', 'i', 'gli', 'le', 'del', 'della',
  'dei', 'delle', 'degli', 'in', 'da', 'su', 'per', 'a', 'the', 'and',
  'fresh', 'raw', 'cooked', 'crudi', 'crude', 'cotti', 'cotta', 'surgelati',
  'ristorante', 'homemade', 'casa',
]);

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

/**
 * Normalizza una riga catalogo grezza CREA → campi usati dal matcher.
 * @param {Record<string, object>} raw
 */
function normalizeCatalog(raw) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const [id, row] of Object.entries(raw || {})) {
    if (!row || typeof row !== 'object') continue;
    const italianName = String(row.italianName || '').trim();
    const desc = String(row.desc || italianName || row.name || '').trim();
    out[id] = {
      ...row,
      id: row.id ?? id,
      fdcId: row.fdcId ?? id,
      italianName: italianName || undefined,
      desc,
      name: String(row.name || desc).trim(),
      kcal: Number(row.kcal ?? row.cal ?? row.energyKcal) || undefined,
    };
  }
  return out;
}

function isCompoundDishName(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  const words = normalizeSearchText(n).split(/\s+/).filter(Boolean);
  if (words.length >= 3) return true;
  if (COMPOUND_CONNECTOR.test(n)) return true;
  // due+ ingredienti tipici senza connettore esplicito
  return words.length >= 2 && /[,/+]/.test(n);
}

function isAssistedEntry(item) {
  const src = String(item?.entrySource || '').trim().toLowerCase();
  if (ASSISTED_SOURCES.has(src)) return true;
  if (item?.sourceText || item?.spokenFoodName) return true;
  const id = String(item?.id || '');
  if (/^mcdrive/i.test(id) || /wizard/i.test(id)) return true;
  return false;
}

function itemKcalPer100g(item) {
  const grams = Number(item?.grams ?? item?.qta ?? item?.weight ?? item?.qty);
  const kcal = Number(item?.kcal ?? item?.cal);
  if (Number.isFinite(grams) && grams > 0 && Number.isFinite(kcal) && kcal > 0) {
    return (kcal / grams) * 100;
  }
  // già per 100g se manca peso
  if (Number.isFinite(kcal) && kcal > 0 && kcal < 1200 && !(Number.isFinite(grams) && grams > 0)) {
    return kcal;
  }
  return null;
}

function catalogKcalPer100g(row) {
  const direct = Number(row?.kcal ?? row?.cal ?? row?.energyKcal);
  if (Number.isFinite(direct) && direct > 0 && direct < 1200) return direct;
  return null;
}

function candidateWordsFromDish(name) {
  return normalizeSearchText(name)
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

/**
 * Cerca alimento semplice (exact/prefix) nel catalogo per una parola del piatto.
 * @param {string} word
 * @param {Record<string, object>} catalog
 */
function findSimpleAlternative(word, catalog) {
  const hits = findStrongFoodMatchesInCatalog(word, catalog, { limit: 6 });
  const simple = hits.find((h) => {
    const q = classifyFoodMatchQuality(h.name, word);
    if (q !== 'exact' && q !== 'prefix') return false;
    const words = normalizeSearchText(h.name).split(/\s+/).filter(Boolean);
    // preferisci nomi corti (alimento base)
    return words.length <= 3;
  });
  return simple || null;
}

function iterDiaryItems(fullHistory) {
  /** @type {Array<{ date: string, meal: string, item: object }>} */
  const out = [];
  for (const [key, node] of Object.entries(fullHistory || {})) {
    const date = key.replace(/^trackerStorico_/, '');
    const log = Array.isArray(node?.log) ? node.log : [];
    for (const meal of log) {
      const mealLabel = String(meal?.desc || meal?.mealType || meal?.name || 'pasto').trim();
      const items = Array.isArray(meal?.items) ? meal.items : [];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        out.push({ date, meal: mealLabel, item });
      }
    }
  }
  return out;
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

function audit(fullHistory, catalogs, ratio) {
  const mergedCatalog = {};
  for (const cat of catalogs) {
    Object.assign(mergedCatalog, cat);
  }

  /** @type {object[]} */
  const suspects = [];
  const rows = iterDiaryItems(fullHistory);

  for (const { date, meal, item } of rows) {
    if (!isAssistedEntry(item)) continue;
    const recorded = String(item.foodName || item.desc || item.name || item.label || '').trim();
    if (!recorded || !isCompoundDishName(recorded)) continue;

    const recordedDensity = itemKcalPer100g(item);
    if (recordedDensity == null) continue;

    const words = candidateWordsFromDish(recorded);
    /** @type {object|null} */
    let best = null;
    for (const word of words) {
      const simple = findSimpleAlternative(word, mergedCatalog);
      if (!simple) continue;
      const simpleDensity = catalogKcalPer100g(simple.row || simple);
      if (simpleDensity == null || simpleDensity <= 0) continue;
      if (recordedDensity / simpleDensity <= ratio) continue;
      const deltaKcalPer100 = Math.round(recordedDensity - simpleDensity);
      const candidate = {
        date,
        meal,
        recorded,
        entrySource: item.entrySource || null,
        sourceText: item.sourceText || item.spokenFoodName || null,
        recordedKcalPer100g: Math.round(recordedDensity * 10) / 10,
        simpleAlternative: simple.name,
        simpleKcalPer100g: Math.round(simpleDensity * 10) / 10,
        densityRatio: Math.round((recordedDensity / simpleDensity) * 100) / 100,
        kcalDeltaPer100g: deltaKcalPer100,
        foodDbKey: item.foodDbKey || item.matchedKey || null,
        grams: item.grams ?? item.qta ?? null,
        recordedPortionKcal: item.kcal ?? item.cal ?? null,
      };
      if (!best || candidate.densityRatio > best.densityRatio) best = candidate;
    }
    if (best) suspects.push(best);
  }

  suspects.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.densityRatio || 0) - (a.densityRatio || 0);
  });
  return suspects;
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
  const catalogs = [normalizeCatalog(loadJson(masterPath))];
  if (process.env.AUDIT_PERSONAL_FOOD_DB) {
    catalogs.push(normalizeCatalog(loadJson(process.env.AUDIT_PERSONAL_FOOD_DB)));
  }

  const history = args.fixture
    ? loadHistoryFromFixture(args.fixture)
    : await loadHistoryFromRtdb(args.days);

  // Con fixture: non filtrare per 90gg (usa tutto il file); con RTDB già limitato a days.
  const suspects = audit(history.fullHistory, catalogs, args.ratio);

  const report = {
    ok: true,
    readOnly: true,
    source: history.source,
    reads: history.reads,
    daysRequested: args.days,
    ratio: args.ratio,
    catalogEntries: catalogs.reduce((n, c) => n + Object.keys(c).length, 0),
    diaryItemsScanned: iterDiaryItems(history.fullHistory).length,
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
