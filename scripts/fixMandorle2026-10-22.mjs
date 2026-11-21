import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { mergeDayNodeWrite } from '../src/utils/dayNodeWriteCore.js';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const date = '2026-10-22';
const path = `/users/${UID}/tracker_data/trackerStorico_${date}`;

delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

function quotePath(p) {
  return `"${String(p).replace(/"/g, '')}"`;
}

function firebaseGet(p) {
  const r = spawnSync(
    'firebase',
    ['database:get', quotePath(p), '--project', PROJECT],
    {
      encoding: 'utf8',
      shell: true,
      maxBuffer: 40 * 1024 * 1024,
      env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' },
    },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const t = String(r.stdout || '').replace(/^\uFEFF/, '').trim();
  return !t || t === 'null' ? null : JSON.parse(t);
}

function firebaseSet(p, value) {
  const tmp = 'tmp_fix_1022.json';
  writeFileSync(tmp, JSON.stringify(value));
  try {
    const r = spawnSync(
      'firebase',
      ['database:set', quotePath(p), tmp, '--project', PROJECT, '-f'],
      {
        encoding: 'utf8',
        shell: true,
        maxBuffer: 40 * 1024 * 1024,
        env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' },
      },
    );
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  } finally {
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

const current = firebaseGet(path);
const log = Array.isArray(current.log) ? current.log : Object.values(current.log || {});
const mealsPatch = [];
let touched = 0;
for (const meal of log) {
  let dirty = false;
  const nextItems = (meal.items || []).map((it) => {
    if (String(it.foodDbKey || '') !== 'mandorle') return it;
    const g = Number(it.grams ?? it.qta ?? it.weight) || 0;
    if (!(g > 0)) return it;
    const naAfter = Math.round(14 * (g / 100) * 100) / 100;
    const saleAfter = Math.round((naAfter / 393.4) * 100) / 100;
    dirty = true;
    touched += 1;
    return { ...it, na: naAfter, sale: saleAfter };
  });
  if (dirty) mealsPatch.push({ ...meal, items: nextItems });
}

const merged = mergeDayNodeWrite(
  current,
  { log: mealsPatch, data: date },
  {
    expectedRev: Number.isFinite(Number(current.rev)) ? Number(current.rev) : null,
    uid: UID,
    now: Date.now(),
  },
);
if (!merged.ok) throw new Error(`rev conflict ${merged.currentRev}`);
firebaseSet(path, merged.next);
const after = firebaseGet(path);
const alog = Array.isArray(after.log) ? after.log : Object.values(after.log || {});
const mandorle = [];
for (const meal of alog) {
  for (const it of meal.items || []) {
    if (String(it.foodDbKey || '') === 'mandorle') {
      mandorle.push({ na: it.na, g: it.grams, sale: it.sale });
    }
  }
}
console.log(JSON.stringify({ touched, rev: after.rev, mandorle }, null, 2));
