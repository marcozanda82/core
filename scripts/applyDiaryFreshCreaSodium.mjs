/**
 * Ricalcola sodio diario (voci con foodDbKey patchabile CREA) via mergeDayNodeWrite + CLI.
 * Piano da Firebase live (niente cache stale).
 *
 *   node scripts/applyDiaryFreshCreaSodium.mjs
 *   node scripts/applyDiaryFreshCreaSodium.mjs --apply
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { mergeDayNodeWrite } from '../src/utils/dayNodeWriteCore.js';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const apply = process.argv.includes('--apply');
const SALT = 393.4;
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const DAYS = 30;
const END = '2026-11-21';

delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

const personalPlan = JSON.parse(readFileSync('./tmp-personal-na500-plan.json', 'utf8'));
const writable = new Map(
  personalPlan.plan.filter((p) => p.writable).map((p) => [p.key, p]),
);

function firebaseGet(path) {
  const r = spawnSync(
    'firebase',
    ['database:get', path, '--project', PROJECT],
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
  const tmp = `tmp_fresh_set_${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
  writeFileSync(tmp, JSON.stringify(value));
  try {
    const r = spawnSync(
      'firebase',
      ['database:set', path, tmp, '--project', PROJECT, '-f'],
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

const hits = [];
for (const date of datesBack(END, DAYS)) {
  const day = firebaseGet(`/users/${UID}/tracker_data/trackerStorico_${date}`);
  if (!day) continue;
  const log = Array.isArray(day.log) ? day.log : Object.values(day.log || {});
  for (const meal of log) {
    for (const it of meal.items || []) {
      const key = String(it.foodDbKey || it.matchedKey || '').trim();
      const wp = writable.get(key);
      if (!wp) continue;
      const grams = Number(it.grams ?? it.qta ?? it.weight);
      if (!(grams > 0)) continue;
      const na = Number(it.na);
      const naAfter = round2(wp.after * (grams / 100));
      const saleAfter = round2(naAfter / SALT);
      if (Number.isFinite(na) && Math.abs(na - naAfter) < 0.05) continue;
      hits.push({
        date,
        mealId: meal.mealId,
        itemId: it.id,
        name: it.name || it.desc,
        foodDbKey: key,
        grams,
        naBefore: Number.isFinite(na) ? na : null,
        naAfter,
        saleAfter,
        per100After: wp.after,
        method: wp.method,
      });
    }
  }
}

writeFileSync('./tmp-diary-fresh-na-plan-live.json', JSON.stringify({ hitCount: hits.length, hits }, null, 2));

/** @type {Map<string, Map<string, object>>} */
const byDate = new Map();
for (const h of hits) {
  if (!byDate.has(h.date)) byDate.set(h.date, new Map());
  byDate.get(h.date).set(h.itemId, h);
}

const results = [];
for (const date of [...byDate.keys()].sort()) {
  const itemMap = byDate.get(date);
  const path = `/users/${UID}/tracker_data/trackerStorico_${date}`;
  const current = firebaseGet(path);
  if (!current) {
    results.push({ date, error: 'missing' });
    continue;
  }
  const log = Array.isArray(current.log) ? current.log : Object.values(current.log || {});
  const mealsPatch = [];
  let itemsTouched = 0;
  for (const meal of log) {
    if (!meal || typeof meal !== 'object') continue;
    const items = Array.isArray(meal.items) ? meal.items : [];
    let dirty = false;
    const nextItems = items.map((it) => {
      const hit = itemMap.get(it.id);
      if (!hit) return it;
      dirty = true;
      itemsTouched += 1;
      const next = { ...it, na: hit.naAfter };
      if (it.sale != null || hit.saleAfter != null) {
        next.sale = hit.saleAfter;
      }
      return next;
    });
    if (dirty) mealsPatch.push({ ...meal, items: nextItems });
  }

  if (!mealsPatch.length) {
    results.push({ date, itemsTouched: 0, skipped: true });
    continue;
  }

  const expectedRev = Number.isFinite(Number(current.rev)) ? Number(current.rev) : null;
  const merged = mergeDayNodeWrite(
    current,
    { log: mealsPatch, data: date },
    { expectedRev, uid: UID, now: Date.now() },
  );
  if (!merged.ok) {
    results.push({ date, error: 'rev_conflict', currentRev: merged.currentRev });
    continue;
  }

  console.log(JSON.stringify({
    date,
    apply,
    beforeRev: current.rev ?? null,
    afterRev: merged.next.rev,
    meals: mealsPatch.map((m) => m.mealId),
    itemsTouched,
  }));

  if (!apply) {
    results.push({ date, itemsTouched, meals: mealsPatch.length, dryRun: true });
    continue;
  }

  firebaseSet(path, merged.next);
  results.push({
    date,
    itemsTouched,
    meals: mealsPatch.length,
    rev: merged.next.rev,
  });
}

const summary = {
  apply,
  hitCount: hits.length,
  daysPlanned: byDate.size,
  daysWritten: results.filter((r) => r.rev != null).length,
  itemsWritten: results.reduce((s, r) => s + (r.rev != null ? (r.itemsTouched || 0) : 0), 0),
  hits: hits.map((h) => ({
    date: h.date,
    name: h.name,
    g: h.grams,
    before: h.naBefore,
    after: h.naAfter,
    key: h.foodDbKey,
  })),
  results,
};
writeFileSync('./tmp-diary-fresh-apply-result.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (!apply) console.log('Dry-run. Ripeti con --apply.');
