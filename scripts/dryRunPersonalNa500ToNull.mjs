/**
 * Dry-run: voci DB personale con na===500 senza patch CREA → na/sale null.
 *   node scripts/dryRunPersonalNa500ToNull.mjs
 *   node scripts/dryRunPersonalNa500ToNull.mjs --apply   (solo dopo OK utente)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const apply = process.argv.includes('--apply');

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
    throw new Error((r.stderr || r.stdout || `get failed`).toString().slice(0, 400));
  }
  const text = String(r.stdout || '').replace(/^\uFEFF/, '').trim();
  if (!text || text === 'null') return null;
  return JSON.parse(text);
}

function firebaseSet(path, value) {
  const tmp = `tmp_null_${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
  writeFileSync(tmp, JSON.stringify(value));
  try {
    const r = spawnSync(
      'firebase',
      ['database:set', quotePath(path), tmp, '--project', PROJECT, '-f'],
      {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        shell: true,
        env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' },
      },
    );
    if (r.status !== 0) {
      throw new Error((r.stderr || r.stdout || `set failed ${path}`).toString().slice(0, 400));
    }
  } finally {
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

const db = firebaseGet(`/users/${UID}/tracker_data/trackerFoodDatabase`);
const rows = [];
for (const [key, row] of Object.entries(db || {})) {
  if (creaKeys.has(key)) continue;
  const na = Number(row?.na);
  if (na !== 500) continue;
  rows.push({
    key,
    name: row.name || row.desc || key,
    category: row.category || null,
    beforeNa: row.na,
    beforeSale: row.sale ?? null,
    afterNa: null,
    afterSale: null,
    reason: 'na=500 default inventato (2000mg/4); senza CREA → dato mancante',
  });
}

rows.sort((a, b) => a.key.localeCompare(b.key));

const results = [];
if (apply) {
  for (const row of rows) {
    const base = `/users/${UID}/tracker_data/trackerFoodDatabase/${row.key}`;
    firebaseSet(`${base}/na`, null);
    firebaseSet(`${base}/sale`, null);
    const after = firebaseGet(base);
    results.push({
      key: row.key,
      verifiedNa: after?.na ?? null,
      verifiedSale: after?.sale ?? null,
    });
  }
}

const summary = {
  apply,
  count: rows.length,
  rows,
  results: apply ? results : undefined,
};
writeFileSync('./tmp-personal-na500-null-dryrun.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  apply,
  count: rows.length,
  sample: rows.slice(0, 15),
  keys: rows.map((r) => r.key),
}, null, 2));
if (!apply) console.log('Dry-run only. Attendi OK prima di --apply.');
