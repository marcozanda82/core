/**
 * Dry-run: nutrienti = TARGETS/4 (o DEFAULT_TARGETS/4) su DB personale e diario 30g.
 *   node scripts/scanInventedNutrientDefaults.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { TARGETS, DEFAULT_TARGETS, ALL_NUTRIENT_KEYS } from '../src/utils/computeTotaliCore.js';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const DAYS = 30;
const END = '2026-11-21';
const TOL = 0.02; // tolleranza relativa/assoluta

delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

/** Macro dichiarati dall'utente: non trattarli come inventati se = target/4. */
const SKIP_KEYS = new Set(['prot', 'carb', 'fatTotal']);

function quarterMap() {
  /** @type {Map<string, number[]>} */
  const map = new Map();
  const add = (key, daily) => {
    if (!Number.isFinite(daily) || daily <= 0) return;
    if (SKIP_KEYS.has(key)) return;
    const q = daily / 4;
    if (!map.has(key)) map.set(key, []);
    const arr = map.get(key);
    if (!arr.some((v) => Math.abs(v - q) < 1e-9)) arr.push(q);
  };
  for (const group of Object.values(TARGETS)) {
    for (const [k, v] of Object.entries(group || {})) add(k, Number(v));
  }
  for (const [k, v] of Object.entries(DEFAULT_TARGETS)) add(k, Number(v));
  // Alias fibre
  if (map.has('fibre')) map.set('fibreTotali', [...map.get('fibre')]);
  return map;
}

const QUARTERS = quarterMap();

function matchesQuarter(key, value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const candidates = QUARTERS.get(key);
  if (!candidates) return null;
  for (const q of candidates) {
    const tol = Math.max(TOL, Math.abs(q) * TOL);
    if (Math.abs(n - q) <= tol) return q;
  }
  return null;
}

function quotePath(path) {
  return `"${String(path).replace(/"/g, '')}"`;
}

function firebaseGet(path) {
  const r = spawnSync(
    'firebase',
    ['database:get', quotePath(path), '--project', PROJECT],
    {
      encoding: 'utf8',
      maxBuffer: 40 * 1024 * 1024,
      shell: true,
      env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' },
    },
  );
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `get failed ${path}`).toString().slice(0, 400));
  }
  const text = String(r.stdout || '').replace(/^\uFEFF/, '').trim();
  if (!text || text === 'null') return null;
  return JSON.parse(text);
}

function datesBack(endIso, n) {
  const end = new Date(`${endIso}T12:00:00Z`);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const keysToScan = [
  ...ALL_NUTRIENT_KEYS,
  'fibreTotali',
  'fibreSolubili',
  'fibreInsolubili',
  'b2',
  'b6',
  'fat',
].filter((k, i, arr) => arr.indexOf(k) === i && !SKIP_KEYS.has(k));

// --- Personal DB ---
const db = firebaseGet(`/users/${UID}/tracker_data/trackerFoodDatabase`) || {};
/** @type {Array<object>} */
const dbHits = [];
/** @type {Record<string, number>} */
const dbByNutrient = {};

for (const [foodKey, row] of Object.entries(db)) {
  if (!row || typeof row !== 'object') continue;
  const invented = [];
  for (const nk of keysToScan) {
    const q = matchesQuarter(nk === 'fibreTotali' || nk === 'fibreSolubili' || nk === 'fibreInsolubili' ? 'fibre' : (nk === 'b2' ? 'vitB2' : nk === 'b6' ? 'vitB6' : nk === 'fat' ? 'fatTotal' : nk), row[nk]);
    // fibre aliases map to fibre quarters
    let matched = q;
    if (matched == null && (nk === 'fibre' || nk === 'fibreTotali' || nk === 'fibreSolubili' || nk === 'fibreInsolubili')) {
      matched = matchesQuarter('fibre', row[nk]);
    }
    if (matched == null && nk === 'b2') matched = matchesQuarter('vitB2', row[nk]);
    if (matched == null && nk === 'b6') matched = matchesQuarter('vitB6', row[nk]);
    if (matched == null) continue;
    invented.push({ key: nk, value: Number(row[nk]), quarter: matched });
    dbByNutrient[nk] = (dbByNutrient[nk] || 0) + 1;
  }
  if (invented.length === 0) continue;
  dbHits.push({
    foodKey,
    name: row.name || row.desc || foodKey,
    invented,
    after: Object.fromEntries(invented.map((x) => [x.key, null])),
  });
}

// --- Diary 30d: per-100 equivalent = value / (g/100) matches quarter ---
/** @type {Array<object>} */
const diaryHits = [];
/** @type {Record<string, number>} */
const diaryByNutrient = {};

for (const date of datesBack(END, DAYS)) {
  const day = firebaseGet(`/users/${UID}/tracker_data/trackerStorico_${date}`);
  if (!day) continue;
  const log = Array.isArray(day.log) ? day.log : Object.values(day.log || {});
  for (const meal of log) {
    for (const it of meal.items || []) {
      if (!it || (it.type && it.type !== 'food' && it.type !== 'recipe')) continue;
      const grams = Number(it.grams ?? it.qta ?? it.weight);
      if (!(grams > 0)) continue;
      const invented = [];
      for (const nk of keysToScan) {
        const raw = it[nk];
        if (raw == null || !Number.isFinite(Number(raw))) continue;
        const per100 = Number(raw) / (grams / 100);
        const canon = nk === 'fibreTotali' || nk === 'fibreSolubili' || nk === 'fibreInsolubili'
          ? 'fibre'
          : nk === 'b2'
            ? 'vitB2'
            : nk === 'b6'
              ? 'vitB6'
              : nk === 'fat'
                ? 'fatTotal'
                : nk;
        const matched = matchesQuarter(canon, per100) ?? matchesQuarter(canon, Number(raw));
        // Also: diary may store the quarter value as absolute portion when grams≈100
        if (matched == null) continue;
        // Prefer per100 match; if only absolute match and grams far from 100, skip unless per100 also close
        const per100Match = matchesQuarter(canon, per100);
        if (per100Match == null && Math.abs(grams - 100) > 15) continue;
        invented.push({
          key: nk,
          value: Number(raw),
          per100: Math.round(per100 * 1000) / 1000,
          quarter: per100Match ?? matched,
        });
        diaryByNutrient[nk] = (diaryByNutrient[nk] || 0) + 1;
      }
      if (invented.length === 0) continue;
      diaryHits.push({
        date,
        mealId: meal.mealId,
        itemId: it.id,
        name: it.name || it.desc,
        foodDbKey: it.foodDbKey || null,
        grams,
        invented,
        after: Object.fromEntries(invented.map((x) => [x.key, null])),
      });
    }
  }
}

const summary = {
  quarters: Object.fromEntries([...QUARTERS.entries()].map(([k, v]) => [k, v])),
  personalDb: {
    foodRowsHit: dbHits.length,
    byNutrient: dbByNutrient,
    sample: dbHits.slice(0, 25),
    allKeys: dbHits.map((h) => h.foodKey),
  },
  diary30d: {
    itemHits: diaryHits.length,
    byNutrient: diaryByNutrient,
    sample: diaryHits.slice(0, 25),
  },
};

writeFileSync('./tmp-invented-nutrients-dryrun.json', JSON.stringify({
  ...summary,
  personalDbHits: dbHits,
  diaryHits,
}, null, 2));

console.log(JSON.stringify({
  quartersChecked: Object.keys(summary.quarters).length,
  personalDbFoodRows: dbHits.length,
  personalDbByNutrient: dbByNutrient,
  diaryItemHits: diaryHits.length,
  diaryByNutrient,
  personalSample: dbHits.slice(0, 12).map((h) => ({
    key: h.foodKey,
    name: h.name,
    nutrients: h.invented.map((x) => `${x.key}=${x.value}(→${x.quarter})`).join(', '),
  })),
  diarySample: diaryHits.slice(0, 12).map((h) => ({
    date: h.date,
    name: h.name,
    g: h.grams,
    nutrients: h.invented.map((x) => `${x.key}=${x.value}`).join(', '),
  })),
}, null, 2));
