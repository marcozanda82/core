import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const MICRO = [
  'fibre', 'fibreTotali', 'vitB1', 'vitB2', 'vitB3', 'vitB5', 'vitB6',
  'se', 'colest', 'omega3', 'ca', 'fe', 'mg', 'k', 'na', 'vitc', 'sale',
];
const QUARTERS = {
  fibre: 7.5, vitB1: 0.3, vitB2: 0.325, vitB3: 4, vitB5: 1.25, vitB6: 0.325,
  se: 13.75, colest: 75, ca: 250, fe: 4.5, mg: 105, k: 850, na: 500, vitc: 22.5, omega3: 0.5,
};

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

const db = firebaseGet(`/users/${UID}/tracker_data/trackerFoodDatabase`) || {};

const targets = [
  { label: 'uovo sodo', preds: ['uovo sodo', 'uovo', 'uova'] },
  { label: 'ceci Selex', preds: ['ceci lessati in barattolo selex', 'ceci'] },
  { label: 'merluzzo', preds: ['filetti di merluzzo', 'merluzzo'] },
];

function looksInvented(key, value) {
  const q = QUARTERS[key];
  if (q == null || value == null || !Number.isFinite(Number(value))) return false;
  return Math.abs(Number(value) - q) <= Math.max(0.02, Math.abs(q) * 0.02);
}

const report = [];
for (const t of targets) {
  const keys = Object.keys(db).filter((k) => {
    const row = db[k];
    const n = String(row?.name || row?.desc || k).toLowerCase();
    const kk = k.toLowerCase();
    return t.preds.some((p) => kk.includes(p) || n.includes(p));
  });
  // Prefer exact-ish first
  keys.sort((a, b) => {
    const score = (k) => {
      const n = String(db[k]?.name || db[k]?.desc || k).toLowerCase();
      if (n.includes(t.preds[0]) || k.toLowerCase().includes(t.preds[0])) return 0;
      return 1;
    };
    return score(a) - score(b);
  });
  const pick = keys[0];
  if (!pick) {
    report.push({ label: t.label, error: 'not_found' });
    continue;
  }
  const row = db[pick];
  const micros = {};
  const inventedLeft = [];
  for (const m of MICRO) {
    const v = row[m];
    micros[m] = v === undefined ? '(absent)' : v;
    if (looksInvented(m, v)) inventedLeft.push(`${m}=${v}`);
  }
  report.push({
    label: t.label,
    key: pick,
    name: row.name || row.desc,
    macros: {
      kcal: row.kcal,
      prot: row.prot,
      carb: row.carb,
      fat: row.fatTotal ?? row.fat,
    },
    micros,
    inventedLeft,
    ok: inventedLeft.length === 0,
  });
}

writeFileSync('./tmp-verify-three-foods-micros.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
