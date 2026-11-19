#!/usr/bin/env node
/**
 * Ricalcola voci di diario che puntano a una riga del DB personale (per 100 g × grammi).
 *
 * Default: DRY-RUN (sola lettura). Non scrive sull'account reale.
 *
 * Uso:
 *   node scripts/recalcPersonalFoodDiaryEntries.mjs
 *   node scripts/recalcPersonalFoodDiaryEntries.mjs --food-key food_1774101701317_Uovo_sodo
 *   node scripts/recalcPersonalFoodDiaryEntries.mjs --uid <uid>
 *
 * Apply (solo con conferma esplicita; non usare senza ok):
 *   node scripts/recalcPersonalFoodDiaryEntries.mjs --apply --i-understand-production
 *
 * Dopo --apply: i focus_day_scores dei giorni toccati vanno ricalcolati
 * (stesso dayTarget/snapshot del giorno; non ricalcolare il target).
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const DEFAULT_UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const DEFAULT_FOOD_KEY = 'food_1774101701317_Uovo_sodo';
const PROJECT = 'mio-tracker';

const COMPARE_KEYS = [
  'kcal', 'cal', 'prot', 'carb', 'fat', 'fatTotal',
  'fibre', 'fibreTotali', 'fibreSolubili', 'fibreInsolubili',
  'na', 'sale', 'zuccheri',
];

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function todayRome() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseArgs(argv) {
  const out = {
    uid: DEFAULT_UID,
    foodKey: DEFAULT_FOOD_KEY,
    apply: false,
    production: false,
    from: null,
    to: null,
    all: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--uid') out.uid = argv[++i];
    else if (a === '--food-key') out.foodKey = argv[++i];
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--to') out.to = argv[++i];
    else if (a === '--all') out.all = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--i-understand-production') out.production = true;
  }
  // Default: ultimi 120 giorni (usa --all per tutta la storia).
  if (!out.all && !out.from) out.from = addDaysIso(todayRome(), -119);
  if (!out.to) out.to = todayRome();
  return out;
}

function firebaseGet(path) {
  const r = spawnSync(
    'firebase',
    ['database:get', path, '--project', PROJECT],
    { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, shell: true, env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' } },
  );
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `firebase get failed ${path}`).toString().slice(0, 400));
  }
  const text = String(r.stdout || '').replace(/^\uFEFF/, '').trim();
  if (!text || text === 'null') return null;
  return JSON.parse(text);
}

function firebaseSet(path, value) {
  const tmp = `tmp_recalc_set_${Date.now()}.json`;
  writeFileSync(tmp, JSON.stringify(value));
  const r = spawnSync(
    'firebase',
    ['database:set', path, tmp, '--project', PROJECT, '--confirm'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, shell: true, env: { ...process.env, FIREBASE_DATABASE_EMULATOR_HOST: '', FIREBASE_AUTH_EMULATOR_HOST: '' } },
  );
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `firebase set failed ${path}`).toString().slice(0, 400));
  }
}

function num(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t || t.toLowerCase() === 'tr') return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function roundKcal(v) {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

function roundMacro(v) {
  const n = num(v);
  return n == null ? null : Math.round(n * 10) / 10;
}

function asArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function itemMatchesKey(item, foodKey) {
  const keys = [
    item?.foodDbKey,
    item?.matchedKey,
    item?.dbKey,
    item?.id,
  ].map((k) => String(k || '').trim()).filter(Boolean);
  return keys.includes(foodKey);
}

function readGrams(item) {
  return num(item?.grams ?? item?.qta ?? item?.weight ?? item?.qty);
}

/** Nutrienti porzione da riga personale (valori per 100 g). */
function nutrientsFromPersonalRow(row, grams) {
  const factor = grams / 100;
  if (!Number.isFinite(factor) || factor <= 0) return null;
  const out = {};

  const kcal100 = num(row.kcal ?? row.cal ?? row.baseKcal);
  if (kcal100 != null) {
    out.kcal = roundKcal(kcal100 * factor);
    out.cal = out.kcal;
  }
  const prot100 = num(row.prot ?? row.baseP ?? row.pro);
  if (prot100 != null) out.prot = roundMacro(prot100 * factor);
  const carb100 = num(row.carb ?? row.baseC ?? row.carbo);
  if (carb100 != null) out.carb = roundMacro(carb100 * factor);
  const fat100 = num(row.fatTotal ?? row.fat ?? row.baseF ?? row.fatTot);
  if (fat100 != null) {
    out.fat = roundMacro(fat100 * factor);
    out.fatTotal = out.fat;
  }

  const microKeys = [
    'fibre', 'fiber', 'fibreTotali', 'fibreSolubili', 'fibreInsolubili',
    'na', 'sale', 'zuccheri',
    'fatSat', 'fatMono', 'fatPoly', 'fatTrans',
    'omega3', 'omega6',
    'ca', 'fe', 'mg', 'k', 'p', 'zn', 'cu', 'se',
    'vitA', 'vitB1', 'vitB2', 'vitB3', 'vitB5', 'vitB6', 'vitB12', 'vitc', 'vitD', 'vitE', 'vitK', 'b9',
    'colest', 'leu', 'lys', 'met', 'phe', 'thr', 'trp', 'val', 'his', 'iso',
  ];
  for (const key of microKeys) {
    const per100 = num(row[key]);
    if (per100 == null) continue;
    if (key === 'fiber' && out.fibre == null) {
      out.fibre = roundMacro(per100 * factor);
      continue;
    }
    out[key === 'fiber' ? 'fibre' : key] = roundMacro(per100 * factor);
  }
  if (out.fibre == null && out.fibreTotali != null) out.fibre = out.fibreTotali;
  return out;
}

function snapshotFields(item, keys = COMPARE_KEYS) {
  const out = {};
  for (const k of keys) {
    if (item[k] !== undefined) out[k] = item[k];
  }
  return out;
}

function diffFields(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes = {};
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    if (b === a) continue;
    if (num(b) != null && num(a) != null && Math.abs(num(b) - num(a)) < 0.05) continue;
    changes[k] = { before: b ?? null, after: a ?? null };
  }
  return changes;
}

function walkFoodItems(node, visit) {
  const log = asArray(node?.log || node?.dati?.log);
  for (let i = 0; i < log.length; i += 1) {
    const entry = log[i];
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'meal' && Array.isArray(entry.items)) {
      for (let j = 0; j < entry.items.length; j += 1) {
        const item = entry.items[j];
        if (item && typeof item === 'object') visit({ item, path: ['log', i, 'items', j], mealId: entry.mealId || null });
      }
      continue;
    }
    if (String(entry.type || '').toLowerCase() === 'food' || entry.foodName || entry.foodDbKey) {
      visit({ item: entry, path: ['log', i], mealId: entry.mealType || entry.mealId || null });
    }
  }
}

function setDeep(root, path, value) {
  let cur = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = value;
}

const args = parseArgs(process.argv);
if (args.apply && !args.production) {
  console.error('Rifiuto --apply senza --i-understand-production.');
  process.exit(2);
}
if (args.apply) {
  console.error('APPLY richiesto: non eseguo scrittura in questa sessione senza ok esplicito nel prompt.');
  console.error('Lo script è pronto; rilancialo solo quando confermi.');
  // Soft-block: still allow if both flags — user said no write without ok.
  // We exit unless they also set ALLOW_RECALC_APPLY=1
  if (process.env.ALLOW_RECALC_APPLY !== '1') {
    console.error('Imposta ALLOW_RECALC_APPLY=1 solo dopo conferma. Uscita (dry-run non avviato con --apply).');
    process.exit(3);
  }
}

delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
delete process.env.FIREBASE_AUTH_EMULATOR_HOST;

process.stderr.write(`Leggo DB personale ${args.foodKey}…\n`);
const personalRow = firebaseGet(
  `/users/${args.uid}/tracker_data/trackerFoodDatabase/${args.foodKey}`,
);
if (!personalRow) {
  console.error('Riga DB personale non trovata.');
  process.exit(1);
}

const per100 = {
  kcal: num(personalRow.kcal ?? personalRow.cal ?? personalRow.baseKcal),
  prot: num(personalRow.prot ?? personalRow.baseP),
  carb: num(personalRow.carb ?? personalRow.baseC),
  fat: num(personalRow.fatTotal ?? personalRow.fat ?? personalRow.baseF),
  fibre: num(personalRow.fibre ?? personalRow.fiber ?? personalRow.fibreTotali),
  na: num(personalRow.na),
  sale: num(personalRow.sale),
};

if (per100.kcal != null && per100.kcal >= 280 && /uovo/i.test(String(personalRow.desc || personalRow.name || args.foodKey))) {
  process.stderr.write(
    `ATTENZIONE: la riga personale ha ancora kcal/100g=${per100.kcal} (sembra non corretta). `
    + 'Correggila nell’app e rilancia il dry-run.\n',
  );
}

process.stderr.write('Elenco giorni tracker…\n');
const shallow = firebaseGet(`/users/${args.uid}/tracker_data`) || {};
const dayKeys = Object.keys(shallow)
  .filter((k) => k.startsWith('trackerStorico_'))
  .map((k) => k.slice('trackerStorico_'.length))
  .filter((d) => (!args.from || d >= args.from) && (!args.to || d <= args.to))
  .sort();

const hits = [];
const touchedDays = new Set();

for (const date of dayKeys) {
  process.stderr.write(`scan ${date}\n`);
  const node = firebaseGet(`/users/${args.uid}/tracker_data/trackerStorico_${date}`);
  if (!node) continue;
  let dayDirty = false;
  walkFoodItems(node, ({ item, path, mealId }) => {
    if (!itemMatchesKey(item, args.foodKey)) return;
    const grams = readGrams(item);
    if (!(grams > 0)) {
      hits.push({
        date,
        mealId,
        path: path.join('.'),
        name: item.name || item.foodName || item.desc || null,
        grams: grams,
        error: 'grams_missing',
      });
      return;
    }
    const afterNutrients = nutrientsFromPersonalRow(personalRow, grams);
    const before = snapshotFields(item);
    const merged = { ...item, ...afterNutrients, grams, qta: grams, weight: grams, qty: grams };
    const after = snapshotFields(merged);
    const changes = diffFields(before, after);
    hits.push({
      date,
      mealId,
      path: path.join('.'),
      itemId: item.id || null,
      name: item.name || item.foodName || item.desc || null,
      foodDbKey: item.foodDbKey || item.matchedKey || null,
      grams,
      before,
      after,
      changes,
      changed: Object.keys(changes).length > 0,
    });
    if (Object.keys(changes).length > 0) {
      dayDirty = true;
      setDeep(node, path, merged);
    }
  });
  if (dayDirty) {
    touchedDays.add(date);
    if (args.apply && args.production && process.env.ALLOW_RECALC_APPLY === '1') {
      firebaseSet(`/users/${args.uid}/tracker_data/trackerStorico_${date}`, node);
      process.stderr.write(`WRITTEN trackerStorico_${date}\n`);
    }
  }
}

const changedHits = hits.filter((h) => h.changed);
const report = {
  mode: args.apply ? 'APPLY' : 'DRY-RUN',
  uid: args.uid,
  foodKey: args.foodKey,
  personalRowPer100: per100,
  personalRowDesc: personalRow.desc || personalRow.name || null,
  scannedDays: dayKeys.length,
  matchingEntries: hits.length,
  entriesNeedingUpdate: changedHits.length,
  touchedDays: [...touchedDays].sort(),
  note: 'I focus_day_scores dei giorni in touchedDays vanno ricalcolati dopo apply, con lo stesso snapshot del target del giorno (non ricalcolare il target).',
  entries: hits,
};

writeFileSync('tmp_recalc_uovo_sodo_dryrun.json', `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  mode: report.mode,
  foodKey: report.foodKey,
  personalRowPer100: report.personalRowPer100,
  scannedDays: report.scannedDays,
  matchingEntries: report.matchingEntries,
  entriesNeedingUpdate: report.entriesNeedingUpdate,
  touchedDays: report.touchedDays,
  note: report.note,
  entries: hits.map((h) => ({
    date: h.date,
    mealId: h.mealId,
    name: h.name,
    grams: h.grams,
    changed: h.changed,
    changes: h.changes || h.error || null,
  })),
}, null, 2));

process.stderr.write(`Report completo: tmp_recalc_uovo_sodo_dryrun.json\n`);
