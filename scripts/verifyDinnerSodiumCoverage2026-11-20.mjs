/**
 * Verifica copertura sodio cena 2026-11-20 (dopo deploy kentuMcp).
 * Uso: node scripts/verifyDinnerSodiumCoverage2026-11-20.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { buildDayMealsDetail, buildEvenings } from '../functions/mcp/dayDetail.js';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const DATE = '2026-11-20';

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
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const t = String(r.stdout || '').replace(/^\uFEFF/, '').trim();
  return !t || t === 'null' ? null : JSON.parse(t);
}

const node = firebaseGet(`/users/${UID}/tracker_data/trackerStorico_${DATE}`);
if (!node) {
  console.error('Giorno mancante', DATE);
  process.exit(1);
}

const fullHistory = { [`trackerStorico_${DATE}`]: node };
const detail = buildDayMealsDetail(fullHistory, DATE);
const evenings = buildEvenings(fullHistory, DATE, DATE);
const row = evenings.evenings[0];

const dinnerMeals = detail.meals.filter((m) => {
  const slot = String(m.mealType || '').toLowerCase();
  return slot.startsWith('cena') || slot.startsWith('dinner') || (m.time != null && m.time >= 18);
});

const report = {
  date: DATE,
  dinnerFoods: dinnerMeals.map((m) => ({
    name: m.name,
    grams: m.grams,
    sodiumMg: m.sodiumMg,
    fibre: m.fibre,
  })),
  nutrientTotals: detail.totals,
  eveningRow: {
    dinnerSodiumMg: row.dinnerSodiumMg,
    dinnerSodiumCoverage: row.dinnerSodiumCoverage,
    dinnerSodiumIncomplete: row.dinnerSodiumIncomplete,
    dinnerSodiumNote: row.dinnerSodiumNote,
    dinnerFibreG: row.dinnerFibreG,
    dinnerFibreCoverage: row.dinnerFibreCoverage,
    dinnerFibreIncomplete: row.dinnerFibreIncomplete,
    dinnerFibreNote: row.dinnerFibreNote,
    eveningSodiumMg: row.eveningSodiumMg,
    eveningSodiumCoverage: row.eveningSodiumCoverage,
    eveningSodiumIncomplete: row.eveningSodiumIncomplete,
    eveningSodiumNote: row.eveningSodiumNote,
  },
};

writeFileSync('./tmp-verify-dinner-sodium-2026-11-20.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.eveningRow, null, 2));

const ok = row.dinnerSodiumMg == null
  && row.dinnerSodiumIncomplete === true
  && row.dinnerSodiumNote === 'dati insufficienti'
  && row.dinnerSodiumCoverage?.known >= 1
  && row.dinnerSodiumCoverage?.missing >= 1;

if (!ok) {
  console.error('FAIL: atteso dinnerSodiumMg=null con incomplete + dati insufficienti');
  process.exit(1);
}
console.log('OK: cena 20/11 non espone più un sodio parziale come totale.');
