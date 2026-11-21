/**
 * Applica le 14 patch CREA (na + sale) al DB personale via firebase CLI leaf set.
 *   node scripts/applyPersonalDbCreaSodium14.mjs
 *   node scripts/applyPersonalDbCreaSodium14.mjs --apply
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const apply = process.argv.includes('--apply');
const SALT = 393.4;
const round3 = (n) => Math.round(Number(n) * 1000) / 1000;

const plan = JSON.parse(readFileSync('./tmp-personal-na500-plan.json', 'utf8'));
const writable = plan.plan.filter((p) => p.writable);

delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

function quotePath(path) {
  // PowerShell/cmd: spazi nel path RTDB → quotare l'argomento.
  return `"${String(path).replace(/"/g, '')}"`;
}

function firebaseGet(path) {
  const r = spawnSync(
    'firebase',
    ['database:get', quotePath(path), '--project', PROJECT],
    {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
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

function firebaseSet(path, value) {
  const tmp = `tmp_leaf_${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
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

const results = [];
for (const row of writable) {
  const base = `/users/${UID}/tracker_data/trackerFoodDatabase/${row.key}`;
  const before = firebaseGet(base);
  const saleAfter = row.saleAfter != null
    ? row.saleAfter
    : round3(row.after / SALT);
  const entry = {
    key: row.key,
    beforeNa: before?.na ?? null,
    beforeSale: before?.sale ?? null,
    afterNa: row.after,
    afterSale: saleAfter,
    method: row.method,
  };
  if (!apply) {
    results.push({ ...entry, dryRun: true });
    continue;
  }
  firebaseSet(`${base}/na`, row.after);
  firebaseSet(`${base}/sale`, saleAfter);
  const after = firebaseGet(base);
  results.push({
    ...entry,
    apply: true,
    verifiedNa: after?.na ?? null,
    verifiedSale: after?.sale ?? null,
  });
}

const summary = {
  apply,
  count: results.length,
  results,
};
writeFileSync('./tmp-personal-crea14-result.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
