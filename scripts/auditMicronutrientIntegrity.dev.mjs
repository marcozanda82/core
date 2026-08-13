/**
 * Dry-run: integrità micronutrienti master USDA → chiavi tracker → widget Home.
 *
 * Uso locale (master DB):
 *   node scripts/auditMicronutrientIntegrity.dev.mjs
 *   node scripts/auditMicronutrientIntegrity.dev.mjs --search "sardine"
 *
 * Uso Firebase personale (incolla in DevTools console mentre sei loggato nell'app):
 *   vedi funzione `auditPersonalFoodDbSnippet()` stampata in fondo all'output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Chiavi canoniche usate da useBiochimico TARGETS / widget Home */
const WIDGET_KEYS = [
  'mg', 'k', 'na', 'ca', 'fe', 'zn', 'cu', 'p',
  'vitc', 'vitA', 'vitD', 'vitE', 'vitK', 'vitB2', 'vitB6', 'b9', 'vitB12',
  'omega3', 'omega6', 'fibre', 'fatSat', 'fatMono', 'fatPoly',
];

/** Alias presenti nel master USDA pre-importato */
const MASTER_ALIASES = {
  vitB2: ['b2'],
  vitB6: ['b6'],
  fibre: ['fibreTotali', 'fiber'],
  na: ['sale', 'sodium'],
  fatTotal: ['fatTot', 'fat'],
};

function loadMasterDb() {
  const file = path.join(ROOT, 'public', 'kentu_master_db.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(raw)) {
    const db = {};
    raw.forEach((row, i) => {
      const key = String(row.fdcId ?? row.id ?? row.dedupKey ?? i);
      db[key] = row;
    });
    return db;
  }
  return raw;
}

function readWithAliases(row, key) {
  const direct = row?.[key];
  if (direct != null && direct !== '' && Number.isFinite(Number(direct))) {
    return Number(direct);
  }
  for (const alias of MASTER_ALIASES[key] || []) {
    const v = row?.[alias];
    if (v != null && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function summarizeRow(row, label) {
  const out = { label, desc: row?.desc || row?.name || row?.italianName || '?' };
  for (const k of WIDGET_KEYS) {
    const v = readWithAliases(row, k);
    if (v != null && v !== 0) out[k] = v;
  }
  return out;
}

function coverageReport(db) {
  const keys = Object.keys(db);
  const total = keys.length;
  const counts = Object.fromEntries(WIDGET_KEYS.map((k) => [k, 0]));

  keys.forEach((id) => {
    const row = db[id];
    WIDGET_KEYS.forEach((k) => {
      const v = readWithAliases(row, k);
      if (v != null && v > 0) counts[k] += 1;
    });
  });

  return { total, counts };
}

function findBySearch(db, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return Object.entries(db)
    .filter(([, row]) => {
      const name = String(row.desc || row.name || row.italianName || '').toLowerCase();
      return name.includes(q);
    })
    .slice(0, 6)
    .map(([id, row]) => summarizeRow(row, id));
}

const DEFAULT_SAMPLES = [
  'whole-wheat bread',
  'sardine',
  'walnut',
  'spinach',
];

function main() {
  const args = process.argv.slice(2);
  const searchIdx = args.indexOf('--search');
  const search = searchIdx >= 0 ? args[searchIdx + 1] : null;

  const db = loadMasterDb();
  const coverage = coverageReport(db);

  console.log('\n=== Kentu Master DB (USDA offline) — coverage micronutrienti ===');
  console.log(`Foods: ${coverage.total}`);
  WIDGET_KEYS.forEach((k) => {
    const n = coverage.counts[k];
    const pct = ((n / coverage.total) * 100).toFixed(1);
    console.log(`  ${k.padEnd(8)} ${String(n).padStart(5)} / ${coverage.total} (${pct}%)`);
  });

  console.log('\n=== Campioni (alias b2→vitB2, fibreTotali→fibre, sale→na) ===');
  const samples = search ? findBySearch(db, search) : [];
  if (samples.length > 0) {
    samples.forEach((s) => console.log(JSON.stringify(s, null, 2)));
  } else {
    DEFAULT_SAMPLES.forEach((term) => {
      const hit = findBySearch(db, term)[0];
      if (hit) console.log(JSON.stringify(hit, null, 2));
    });
  }

  console.log('\n=== Simulazione clone catalogo (buildAcquirePayload) ===');
  console.log('Solo macro salvati su Firebase personale: kcal, prot, carb, fatTotal (+ barcode opz.)');
  console.log('→ saveFoodEntryPer100ToFoodDb riempie i micro mancanti con getDefaultNutrientValue (stima!)');

  console.log('\n=== Snippet DevTools — trackerFoodDatabase personale (Firebase) ===');
  console.log(`(${auditPersonalFoodDbSnippet.toString()})();`);
}

function auditPersonalFoodDbSnippet() {
  const db = window.__KENTU_FOOD_DB__ || window.foodDb;
  if (!db) {
    console.warn('Esponi foodDb su window (es. in SalaComandi) oppure incolla l\'oggetto da React DevTools.');
    return;
  }
  const terms = ['pane', 'sard', 'noc', 'spin'];
  const keys = Object.keys(db);
  console.table(
    keys
      .filter((k) => terms.some((t) => String(db[k]?.desc || '').toLowerCase().includes(t)))
      .slice(0, 8)
      .map((k) => ({
        key: k,
        desc: db[k]?.desc,
        mg: db[k]?.mg,
        k: db[k]?.k,
        vitc: db[k]?.vitc,
        omega3: db[k]?.omega3,
        vitB2: db[k]?.vitB2 ?? db[k]?.b2,
        fibre: db[k]?.fibre ?? db[k]?.fibreTotali,
      })),
  );
}

main();
