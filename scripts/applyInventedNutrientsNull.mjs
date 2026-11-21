/**
 * F: null selettivo dei campi = TARGETS/4 (solo voci con ≥3 match classici).
 * Backup intenzionale → DB update → diario merge-by-id.
 *
 *   node scripts/applyInventedNutrientsNull.mjs
 *   node scripts/applyInventedNutrientsNull.mjs --apply
 */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { mergeDayNodeWrite } from '../src/utils/dayNodeWriteCore.js';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const apply = process.argv.includes('--apply');
const CHUNK = 15;

const CLASSIC = new Set([
  'fibre', 'fibreTotali',
  'vitB1', 'vitB2', 'vitB3', 'vitB5', 'vitB6', 'b2', 'b6',
  'se', 'colest',
]);

/** Mai toccare (anche se per caso = quarter). */
const PROTECTED = new Set([
  'kcal', 'cal', 'prot', 'carb', 'fatTotal', 'fat',
  'grams', 'qta', 'weight', 'qty',
]);

delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

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
    throw new Error((r.stderr || r.stdout || `get failed ${path}`).toString().slice(0, 500));
  }
  const text = String(r.stdout || '').replace(/^\uFEFF/, '').trim();
  if (!text || text === 'null') return null;
  return JSON.parse(text);
}

function firebaseSet(path, value) {
  const tmp = `tmp_inv_set_${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
  writeFileSync(tmp, JSON.stringify(value));
  try {
    const r = spawnSync(
      'firebase',
      ['database:set', quotePath(path), tmp, '--project', PROJECT, '-f'],
      {
        encoding: 'utf8',
        maxBuffer: 40 * 1024 * 1024,
        shell: true,
        env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' },
      },
    );
    if (r.status !== 0) {
      throw new Error((r.stderr || r.stdout || `set failed ${path}`).toString().slice(0, 500));
    }
  } finally {
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function firebaseUpdate(path, value) {
  const tmp = `tmp_inv_upd_${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
  writeFileSync(tmp, JSON.stringify(value));
  try {
    const r = spawnSync(
      'firebase',
      ['database:update', quotePath(path), tmp, '--project', PROJECT, '-f'],
      {
        encoding: 'utf8',
        maxBuffer: 40 * 1024 * 1024,
        shell: true,
        env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' },
      },
    );
    if (r.status !== 0) {
      throw new Error((r.stderr || r.stdout || `update failed ${path}`).toString().slice(0, 800));
    }
  } finally {
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

const dry = JSON.parse(readFileSync('./tmp-invented-nutrients-dryrun.json', 'utf8'));

function classicCount(invented) {
  return invented.filter((x) => CLASSIC.has(x.key)).length;
}

function nullableFields(invented) {
  return invented.filter((x) => !PROTECTED.has(x.key));
}

const dbHits = dry.personalDbHits
  .filter((h) => classicCount(h.invented) >= 3)
  .map((h) => ({
    ...h,
    nullKeys: nullableFields(h.invented).map((x) => x.key),
  }))
  .filter((h) => h.nullKeys.length > 0);

const diaryHits = dry.diaryHits
  .filter((h) => classicCount(h.invented) >= 3)
  .map((h) => ({
    ...h,
    nullKeys: nullableFields(h.invented).map((x) => x.key),
  }))
  .filter((h) => h.nullKeys.length > 0);

const diaryDates = [...new Set(diaryHits.map((h) => h.date))].sort();

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join('backups', `invented-nutrients-${stamp}`);
mkdirSync(backupDir, { recursive: true });
mkdirSync(join(backupDir, 'foodDb'), { recursive: true });
mkdirSync(join(backupDir, 'diary'), { recursive: true });

const foodDbBase = `/users/${UID}/tracker_data/trackerFoodDatabase`;
const liveDb = firebaseGet(foodDbBase) || {};

// --- Backup DB rows ---
const dbBackup = {};
for (const hit of dbHits) {
  const row = liveDb[hit.foodKey];
  if (!row) continue;
  dbBackup[hit.foodKey] = row;
  writeFileSync(join(backupDir, 'foodDb', `${hit.foodKey.replace(/[\\/:*?"<>|]/g, '_')}.json`), JSON.stringify(row, null, 2));
}
writeFileSync(join(backupDir, 'foodDb-index.json'), JSON.stringify({
  count: Object.keys(dbBackup).length,
  keys: Object.keys(dbBackup),
}, null, 2));

// --- Backup diary days ---
const diaryBackupIndex = [];
for (const date of diaryDates) {
  const path = `/users/${UID}/tracker_data/trackerStorico_${date}`;
  const day = firebaseGet(path);
  if (!day) continue;
  writeFileSync(join(backupDir, 'diary', `${date}.json`), JSON.stringify(day, null, 2));
  diaryBackupIndex.push({ date, rev: day.rev ?? null });
}
writeFileSync(join(backupDir, 'diary-index.json'), JSON.stringify({
  count: diaryBackupIndex.length,
  days: diaryBackupIndex,
}, null, 2));

writeFileSync(join(backupDir, 'plan.json'), JSON.stringify({
  apply,
  dbHits: dbHits.length,
  diaryHits: diaryHits.length,
  diaryDates,
  sampleDb: dbHits.slice(0, 10),
  sampleDiary: diaryHits.slice(0, 10),
}, null, 2));

console.log(JSON.stringify({
  backupDir,
  dbBackedUp: Object.keys(dbBackup).length,
  diaryDaysBackedUp: diaryBackupIndex.length,
  dbHits: dbHits.length,
  diaryHits: diaryHits.length,
  apply,
}, null, 2));

if (!apply) {
  console.log('Backup fatto. Dry-run: ripeti con --apply.');
  process.exit(0);
}

// --- Apply personal DB ---
const dbResults = [];
for (let i = 0; i < dbHits.length; i += CHUNK) {
  const chunk = dbHits.slice(i, i + CHUNK);
  const patch = {};
  for (const hit of chunk) {
    const prev = liveDb[hit.foodKey];
    if (!prev) {
      dbResults.push({ key: hit.foodKey, error: 'missing' });
      continue;
    }
    const next = { ...prev };
    const cleared = [];
    for (const k of hit.nullKeys) {
      if (PROTECTED.has(k)) continue;
      if (next[k] == null) continue;
      next[k] = null;
      cleared.push(k);
    }
    // alias fibre
    if (hit.nullKeys.includes('fibre') && next.fibreTotali != null) {
      // only if fibreTotali also in invented list
      const also = hit.invented.some((x) => x.key === 'fibreTotali');
      if (also) {
        next.fibreTotali = null;
        cleared.push('fibreTotali');
      }
    }
    patch[hit.foodKey] = next;
    dbResults.push({ key: hit.foodKey, cleared });
  }
  if (Object.keys(patch).length > 0) firebaseUpdate(foodDbBase, patch);
  console.log(JSON.stringify({ dbChunk: i / CHUNK + 1, size: Object.keys(patch).length }));
}

// --- Apply diary merge-by-id ---
/** @type {Map<string, Map<string, object>>} */
const byDate = new Map();
for (const hit of diaryHits) {
  if (!byDate.has(hit.date)) byDate.set(hit.date, new Map());
  byDate.get(hit.date).set(hit.itemId, hit);
}

const diaryResults = [];
for (const date of [...byDate.keys()].sort()) {
  const itemMap = byDate.get(date);
  const path = `/users/${UID}/tracker_data/trackerStorico_${date}`;
  // Prefer backed-up file if present (consistent), else live get
  const backupPath = join(backupDir, 'diary', `${date}.json`);
  const current = existsSync(backupPath)
    ? JSON.parse(readFileSync(backupPath, 'utf8'))
    : firebaseGet(path);
  if (!current) {
    diaryResults.push({ date, error: 'missing' });
    continue;
  }
  const log = Array.isArray(current.log) ? current.log : Object.values(current.log || {});
  const mealsPatch = [];
  let itemsTouched = 0;
  const fieldsCleared = [];
  for (const meal of log) {
    if (!meal || typeof meal !== 'object') continue;
    const items = Array.isArray(meal.items) ? meal.items : [];
    let dirty = false;
    const nextItems = items.map((it) => {
      const hit = itemMap.get(it.id);
      if (!hit) return it;
      dirty = true;
      itemsTouched += 1;
      const next = { ...it };
      for (const k of hit.nullKeys) {
        if (PROTECTED.has(k)) continue;
        if (next[k] == null) continue;
        next[k] = null;
        fieldsCleared.push(`${hit.name}.${k}`);
      }
      return next;
    });
    if (dirty) mealsPatch.push({ ...meal, items: nextItems });
  }
  if (!mealsPatch.length) {
    diaryResults.push({ date, itemsTouched: 0, skipped: true });
    continue;
  }
  const expectedRev = Number.isFinite(Number(current.rev)) ? Number(current.rev) : null;
  const merged = mergeDayNodeWrite(
    current,
    { log: mealsPatch, data: date },
    { expectedRev, uid: UID, now: Date.now() },
  );
  if (!merged.ok) {
    diaryResults.push({ date, error: 'rev_conflict', currentRev: merged.currentRev });
    continue;
  }
  firebaseSet(path, merged.next);
  diaryResults.push({
    date,
    itemsTouched,
    fieldsCleared: fieldsCleared.length,
    rev: merged.next.rev,
  });
  console.log(JSON.stringify({
    date,
    itemsTouched,
    fieldsCleared: fieldsCleared.length,
    rev: merged.next.rev,
  }));
}

const report = {
  backupDir,
  apply: true,
  personalDb: {
    rows: dbResults.length,
    fieldsCleared: dbResults.reduce((s, r) => s + (r.cleared?.length || 0), 0),
    results: dbResults,
  },
  diary: {
    days: diaryResults.length,
    itemsTouched: diaryResults.reduce((s, r) => s + (r.itemsTouched || 0), 0),
    results: diaryResults,
  },
};
writeFileSync('./tmp-invented-nutrients-apply-result.json', JSON.stringify(report, null, 2));
writeFileSync(join(backupDir, 'apply-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  backupDir,
  dbRows: report.personalDb.rows,
  dbFields: report.personalDb.fieldsCleared,
  diaryItems: report.diary.itemsTouched,
  diaryDays: report.diary.days,
}, null, 2));
