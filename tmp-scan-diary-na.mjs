/**
 * Scan last 30 days diary for corrupted sodium items.
 * Match by foodDbKey, name, and suspicious na≈500mg/100g pattern for known foods.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const SALT = 393.4;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** na per 100g after DB fix */
const NA100 = {
  mela: 2,
  kiwi: 5,
  melanzana: 3,
  melanzane: 3,
  pomodoro: 3,
  'pomodorissimo la passata': 16,
  food_1777149590373_Barcode_053126161001: 775,
  recipe_1789662948410_Pane_integrale_con_sardine_e_pomodoro: 203.44,
  recipe_1789755622020_Insalatissime_Rio_Mare_Messicana: 169.71,
  recipe_1790517453430_Panino_pomodoro_e_sgombro: 243.49,
};

const NAME_TO_KEY = [
  { re: /^mela\b| mele\b/i, key: 'mela' },
  { re: /^kiwi\b/i, key: 'kiwi' },
  { re: /melanzan/i, key: 'melanzana' },
  { re: /pomodorissimo|passata/i, key: 'pomodorissimo la passata' },
  { re: /^pomodoro\b/i, key: 'pomodoro' },
  { re: /pizza.*speck|speck.*pizza|burrata.*speck/i, key: 'food_1777149590373_Barcode_053126161001' },
  { re: /sardine.*pomodoro|panino.*sardine/i, key: 'recipe_1789662948410_Pane_integrale_con_sardine_e_pomodoro' },
  { re: /insalatissime|rio mare messicana/i, key: 'recipe_1789755622020_Insalatissime_Rio_Mare_Messicana' },
  { re: /panino.*sgombro|sgombro.*pomodoro/i, key: 'recipe_1790517453430_Panino_pomodoro_e_sgombro' },
];

function firebaseGet(path, outFile) {
  const r = spawnSync(
    'firebase',
    ['database:get', path, '--project', PROJECT, '-o', outFile],
    { encoding: 'utf8', shell: true },
  );
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`get failed ${path}`);
  }
}

function resolveKey(item) {
  const k = String(item.foodDbKey || item.matchedKey || '').trim();
  if (k && NA100[k] != null) return k;
  const name = String(item.name || item.desc || item.foodName || item.label || '').trim();
  for (const { re, key } of NAME_TO_KEY) {
    if (re.test(name)) return key;
  }
  return null;
}

function impliedPer100(na, grams) {
  const g = Number(grams);
  const n = Number(na);
  if (!(g > 0) || !Number.isFinite(n)) return null;
  return n / (g / 100);
}

function isSuspicious(item, key) {
  const grams = Number(item.grams ?? item.qta ?? item.weight ?? item.qty);
  const na = Number(item.na);
  if (!Number.isFinite(na)) return false;
  const per100 = impliedPer100(na, grams);
  if (key && NA100[key] != null && Number.isFinite(per100)) {
    const target = NA100[key];
    // wrong if close to old 500 heuristic or far from target
    if (Math.abs(per100 - 500) < 15) return true;
    if (Math.abs(per100 - target) / Math.max(target, 1) > 0.25 && Math.abs(per100 - target) > 5) {
      return true;
    }
  }
  // name match already implies we care; flag if ~500/100g
  if (Number.isFinite(per100) && Math.abs(per100 - 500) < 15) return true;
  return false;
}

function expectedNa(key, grams) {
  const per100 = NA100[key];
  if (per100 == null || !(grams > 0)) return null;
  return round2(per100 * (grams / 100));
}

const end = new Date('2026-11-20T12:00:00Z');
const dates = [];
for (let i = 0; i < 30; i += 1) {
  const d = new Date(end);
  d.setUTCDate(end.getUTCDate() - i);
  dates.push(d.toISOString().slice(0, 10));
}

const hits = [];
const mealsToPatch = new Map(); // date -> Map(mealId -> meal clone plan)

for (const date of dates) {
  const out = `tmp-day-${date}.json`;
  if (!existsSync(out) || date === '2026-11-20') {
    firebaseGet(`/users/${UID}/tracker_data/trackerStorico_${date}`, out);
  }
  let day;
  try {
    const raw = readFileSync(out, 'utf8').trim();
    if (!raw || raw === 'null') continue;
    day = JSON.parse(raw);
  } catch {
    continue;
  }
  if (!day || typeof day !== 'object') continue;
  const log = Array.isArray(day.log) ? day.log : Object.values(day.log || {});
  for (const meal of log) {
    if (!meal || typeof meal !== 'object') continue;
    const items = Array.isArray(meal.items) ? meal.items : [];
    let mealDirty = false;
    const nextItems = items.map((it) => ({ ...it }));
    for (let idx = 0; idx < items.length; idx += 1) {
      const it = items[idx];
      const key = resolveKey(it);
      if (!key) continue;
      if (!isSuspicious(it, key) && Number(it.na) !== expectedNa(key, Number(it.grams ?? it.qta ?? it.weight))) {
        // still include if na wrong vs expected
        const grams = Number(it.grams ?? it.qta ?? it.weight ?? it.qty);
        const after = expectedNa(key, grams);
        if (after == null) continue;
        if (Math.abs(Number(it.na) - after) < 0.5) continue;
      } else if (!isSuspicious(it, key)) {
        const grams = Number(it.grams ?? it.qta ?? it.weight ?? it.qty);
        const after = expectedNa(key, grams);
        if (after == null || Math.abs(Number(it.na) - after) < 0.5) continue;
      }
      const grams = Number(it.grams ?? it.qta ?? it.weight ?? it.qty);
      const after = expectedNa(key, grams);
      if (after == null) continue;
      if (Math.abs(Number(it.na) - after) < 0.5) continue;

      const hit = {
        date,
        mealId: meal.mealId,
        mealDesc: meal.desc,
        itemId: it.id,
        name: it.name || it.desc,
        foodDbKey: it.foodDbKey || null,
        matchedKey: it.matchedKey || null,
        resolvedKey: key,
        grams,
        naBefore: Number(it.na),
        naAfter: after,
        per100Before: round2(impliedPer100(it.na, grams)),
        per100After: NA100[key],
        saleAfter: round2(after / SALT * (100 / grams) ) // sale on item? usually portion na only
      };
      // item sale if present: sale for portion = (naAfter/393.4) roughly? Actually diary often stores absolute na mg for portion.
      // Also update sale on item if field exists: sale g for portion = na_mg/393.4
      hit.saleBefore = it.sale ?? null;
      hit.saleAfterItem = round2(after / SALT);
      hits.push(hit);

      nextItems[idx] = {
        ...nextItems[idx],
        na: after,
        ...(it.sale != null || true ? { sale: hit.saleAfterItem } : {}),
      };
      mealDirty = true;
    }
    if (mealDirty) {
      if (!mealsToPatch.has(date)) mealsToPatch.set(date, []);
      mealsToPatch.get(date).push({
        mealId: meal.mealId,
        type: meal.type || 'meal',
        desc: meal.desc,
        items: nextItems,
        // keep other meal fields from original for merge safety
        ...Object.fromEntries(
          Object.entries(meal).filter(([k]) => !['items'].includes(k)),
        ),
        items: nextItems,
      });
    }
  }
}

const plan = {
  hitCount: hits.length,
  hits,
  datesAffected: [...mealsToPatch.keys()],
  mealsByDate: Object.fromEntries(
    [...mealsToPatch.entries()].map(([d, meals]) => [
      d,
      meals.map((m) => ({
        mealId: m.mealId,
        itemIds: (m.items || [])
          .filter((it) => hits.some((h) => h.date === d && h.itemId === it.id))
          .map((it) => it.id),
      })),
    ]),
  ),
};

writeFileSync('./tmp-diary-na-plan.json', JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ hitCount: hits.length, hits }, null, 2));
