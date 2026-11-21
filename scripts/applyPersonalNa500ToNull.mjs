/**
 * Applica na/sale → null sulle voci DB personale con na===500 (no CREA).
 * Usa database:update sul parent (chiavi con % ok nel body JSON).
 *
 *   node scripts/applyPersonalNa500ToNull.mjs --apply
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const apply = process.argv.includes('--apply');
const CHUNK = 20;

delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

const plan = JSON.parse(readFileSync('./tmp-personal-na500-plan.json', 'utf8'));
const creaKeys = new Set(plan.plan.filter((p) => p.writable).map((p) => p.key));

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
    throw new Error((r.stderr || r.stdout || `get failed`).toString().slice(0, 500));
  }
  const text = String(r.stdout || '').replace(/^\uFEFF/, '').trim();
  if (!text || text === 'null') return null;
  return JSON.parse(text);
}

function firebaseUpdate(path, value) {
  const tmp = `tmp_upd_${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
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

const base = `/users/${UID}/tracker_data/trackerFoodDatabase`;
const db = firebaseGet(base) || {};
const rows = [];
for (const [key, row] of Object.entries(db)) {
  if (creaKeys.has(key)) continue;
  if (Number(row?.na) !== 500) continue;
  rows.push({
    key,
    name: row.name || row.desc || key,
    beforeNa: row.na,
    beforeSale: row.sale ?? null,
  });
}
rows.sort((a, b) => a.key.localeCompare(b.key));

if (!apply) {
  const summary = { apply: false, count: rows.length, keys: rows.map((r) => r.key) };
  writeFileSync('./tmp-personal-na500-null-apply.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const results = [];
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const patch = {};
  for (const row of chunk) {
    const prev = db[row.key] || {};
    const next = { ...prev, na: null, sale: null };
    delete next.sodium;
    patch[row.key] = next;
  }
  firebaseUpdate(base, patch);
  for (const row of chunk) {
    results.push({ key: row.key, ok: true });
    console.log(JSON.stringify({ key: row.key, apply: true }));
  }
}

const summary = { apply: true, count: rows.length, keys: rows.map((r) => r.key), results };
writeFileSync('./tmp-personal-na500-null-apply.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ apply: true, count: rows.length }, null, 2));
