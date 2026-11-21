/**
 * Ricalcola sodio (solo corrotti ~500 mg/100g) via mergeDayNodeWrite, poi
 * persistenza con firebase CLI (stesso protocollo rev/writeProtocol).
 *
 *   node scripts/applyDiarySodiumCorrupt30d.mjs --apply
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { mergeDayNodeWrite } from '../src/utils/dayNodeWriteCore.js';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const apply = process.argv.includes('--apply');
const SALT = 393.4;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

const plan = JSON.parse(readFileSync('./tmp-diary-na-plan.json', 'utf8'));
const corrupt = plan.hits.filter(
  (h) => h.per100Before != null && Math.abs(h.per100Before - 500) < 20,
);

/** @type {Map<string, Map<string, object>>} */
const byDate = new Map();
for (const h of corrupt) {
  if (!byDate.has(h.date)) byDate.set(h.date, new Map());
  byDate.get(h.date).set(h.itemId, h);
}

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
  const tmp = `tmp_na_set_${Date.now()}_${Math.random().toString(16).slice(2)}.json`;
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

function fingerprintItem(it) {
  if (!it || typeof it !== 'object') return null;
  return {
    id: it.id,
    name: it.name || it.desc,
    foodDbKey: it.foodDbKey,
    grams: it.grams ?? it.qta ?? it.weight,
    na: it.na,
    sale: it.sale,
    kcal: it.kcal ?? it.cal,
    prot: it.prot,
    carb: it.carb,
    fat: it.fat ?? it.fatTotal,
  };
}

function stable(v) {
  return JSON.stringify(v);
}

const results = [];
let beforeNov20 = null;

for (const date of [...byDate.keys()].sort()) {
  const itemMap = byDate.get(date);
  const path = `/users/${UID}/tracker_data/trackerStorico_${date}`;
  const current = firebaseGet(path);
  if (!current) {
    results.push({ date, error: 'missing' });
    continue;
  }
  const log = Array.isArray(current.log) ? current.log : Object.values(current.log || {});

  if (date === '2026-11-20') {
    beforeNov20 = log.flatMap((m) =>
      (Array.isArray(m.items) ? m.items : []).map((it) => ({
        mealId: m.mealId,
        ...fingerprintItem(it),
      })),
    );
    writeFileSync('./tmp-day-2026-11-20-before-nafix.json', JSON.stringify(beforeNov20, null, 2));
  }

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
      if (it.sale != null) {
        next.sale = hit.saleAfterItem ?? round2(hit.naAfter / SALT);
      } else {
        // non aggiungere sale se assente: cambia solo na
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
  corruptHits: corrupt.length,
  daysPlanned: byDate.size,
  daysWritten: results.filter((r) => r.rev != null).length,
  itemsWritten: results.reduce((s, r) => s + (r.rev != null ? (r.itemsTouched || 0) : 0), 0),
  results,
};
writeFileSync('./tmp-diary-na-apply-result.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

if (!apply) {
  console.log('Dry-run. Ripeti con --apply.');
  process.exit(0);
}

// Verify 2026-11-20
const afterDay = firebaseGet(`/users/${UID}/tracker_data/trackerStorico_2026-11-20`);
const afterLog = Array.isArray(afterDay.log) ? afterDay.log : Object.values(afterDay.log || {});
const afterFp = afterLog.flatMap((m) =>
  (Array.isArray(m.items) ? m.items : []).map((it) => ({
    mealId: m.mealId,
    ...fingerprintItem(it),
  })),
);
writeFileSync('./tmp-day-2026-11-20-after-nafix.json', JSON.stringify(afterFp, null, 2));

const plannedIds = new Set([...(byDate.get('2026-11-20')?.keys() || [])]);
const beforeById = new Map((beforeNov20 || []).map((x) => [x.id, x]));
const afterById = new Map(afterFp.map((x) => [x.id, x]));

const mela = afterById.get('mcdrive_raw_1795196854922_nxppiry');
const kiwi = afterById.get('mcdrive_raw_1795196854922_8bg93vc');
const passata = afterById.get('mcdrive_raw_1795196832341_xuipe9p');

const unexpectedChanges = [];
for (const [id, b] of beforeById) {
  const a = afterById.get(id);
  if (!a) {
    unexpectedChanges.push({ id, issue: 'missing after' });
    continue;
  }
  if (plannedIds.has(id)) continue;
  if (stable(b) !== stable(a)) unexpectedChanges.push({ id, name: b.name, before: b, after: a });
}
for (const id of afterById.keys()) {
  if (!beforeById.has(id)) unexpectedChanges.push({ id, issue: 'new item' });
}

const verify = {
  mela: { na: mela?.na, expected: 3, ok: mela?.na === 3 },
  kiwi: { na: kiwi?.na, expected: 5, ok: kiwi?.na === 5 },
  passataPlannedCorrupt: { na: passata?.na, expected: 11.2, ok: passata?.na === 11.2 },
  itemCountBefore: beforeNov20?.length ?? 0,
  itemCountAfter: afterFp.length,
  unexpectedOtherItemChanges: unexpectedChanges,
};
console.log(JSON.stringify({ verify2026_11_20: verify }, null, 2));
process.exit(unexpectedChanges.length || !verify.mela.ok || !verify.kiwi.ok ? 2 : 0);
