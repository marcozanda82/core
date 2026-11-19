/**
 * Sola lettura: plausibilità nutrienti ultimi 30 giorni.
 * Usa `firebase database:get` (CLI già autenticata).
 *
 * Uso: node scripts/auditMcpDiaryPlausibility.mjs [uid]
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const UID = process.argv[2] || 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const DAYS = 30;
const PROJECT = 'mio-tracker';

const ANIMAL = /(?:^|[^a-z0-9àèéìòù])(merluzzo|pesce|filett|tonno|salmone|pollo|tacchino|manzo|vitello|maiale|carne|bresaola|prosciutto|speck|wurstel|wudy|salsicc|uovo|uova|egg|formaggio|mozzarella|parmigiano|grana|ricotta|burrata)(?=[^a-z0-9àèéìòù]|$)/iu;
const PROCESSED = /(?:pesto|wurstel|wudy|salame|prosciutto|pane|crackers|biscott|pizza|sugo|passata|ketchup|maionese|formaggio|yogurt|barretta|snack)/i;

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

function firebaseGet(path) {
  const r = spawnSync(
    'firebase',
    ['database:get', path, '--project', PROJECT],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, shell: true },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `firebase get failed ${path}`);
  }
  const text = String(r.stdout || '').replace(/^\uFEFF/, '').trim();
  if (!text || text === 'null') return null;
  return JSON.parse(text);
}

function asArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function flatten(node) {
  const out = [];
  for (const entry of asArray(node?.log || node?.dati?.log)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'meal' && Array.isArray(entry.items)) {
      for (const item of entry.items) {
        if (item && typeof item === 'object') out.push(item);
      }
      continue;
    }
    out.push(entry);
  }
  return out;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function kcalPer100(entry) {
  const kcal = num(entry.kcal ?? entry.cal);
  const grams = num(entry.grams ?? entry.qta ?? entry.weight ?? entry.qty);
  if (kcal == null || !(grams > 0)) return null;
  return (kcal / grams) * 100;
}

function categoryRange(name) {
  const n = String(name || '').toLowerCase();
  if (/olio|burro|mayo|maionese/.test(n)) return [500, 950];
  if (/mandorl|noci|nocciol|pistacch|arachid|semi/.test(n)) return [450, 750];
  if (/formaggio|parmigiano|grana|cheddar/.test(n)) return [150, 550];
  if (/pane|pasta|riso|ceci|fagioli|lenticchie/.test(n)) return [50, 450];
  if (/passata|pomodor|verdura|insalata|zucchine|spinaci/.test(n)) return [5, 120];
  if (/uovo|egg/.test(n)) return [100, 220];
  if (/pesce|merluzzo|tonno|salmone|pollo|carne|filett/.test(n)) return [50, 320];
  if (/pesto|sugo/.test(n)) return [80, 550];
  if (/wudy|wurstel|salame/.test(n)) return [150, 450];
  return [20, 700];
}

const end = todayRome();
const start = addDaysIso(end, -(DAYS - 1));
const fibreBad = [];
const sodiumZeroProcessed = [];
const kcalOut = [];

for (let d = start; d <= end; d = addDaysIso(d, 1)) {
  process.stderr.write(`audit ${d}\n`);
  let node;
  try {
    node = firebaseGet(`/users/${UID}/tracker_data/trackerStorico_${d}`);
  } catch (err) {
    process.stderr.write(`skip ${d}: ${err.message}\n`);
    continue;
  }
  if (!node) continue;
  for (const entry of flatten(node)) {
    const type = String(entry.type || '').toLowerCase();
    if (type === 'water' || type === 'alcohol' || type === 'sleep' || type === 'workout') continue;
    if (!(entry.foodName || entry.name || entry.kcal != null)) continue;
    const name = entry.name || entry.foodName || entry.desc || '?';
    const grams = num(entry.grams ?? entry.qta ?? entry.weight);
    const fibre = num(entry.fibre ?? entry.fiber);
    const fibreTotali = num(entry.fibreTotali);
    const fibreShown = fibreTotali != null ? fibreTotali : fibre;
    const na = num(entry.na ?? entry.sodium);
    const sale = num(entry.sale);

    if (ANIMAL.test(name) && fibreShown != null && fibreShown > 0.05) {
      fibreBad.push({
        date: d,
        name,
        grams,
        fibre: fibreShown,
        fibreField: fibre,
        fibreTotali,
        foodDbKey: entry.foodDbKey || null,
      });
    }
    if (PROCESSED.test(name) && (na === 0 || na == null) && !(sale > 0)) {
      sodiumZeroProcessed.push({
        date: d,
        name,
        grams,
        na,
        sale,
        foodDbKey: entry.foodDbKey || null,
      });
    }
    const k100 = kcalPer100(entry);
    if (k100 != null) {
      const [lo, hi] = categoryRange(name);
      if (k100 < lo || k100 > hi) {
        kcalOut.push({
          date: d,
          name,
          grams,
          kcal100: Math.round(k100),
          range: [lo, hi],
          foodDbKey: entry.foodDbKey || null,
        });
      }
    }
  }
}

const report = {
  uid: UID,
  from: start,
  to: end,
  counts: {
    animalWithFibre: fibreBad.length,
    processedSodiumZero: sodiumZeroProcessed.length,
    kcalOutOfRange: kcalOut.length,
  },
  animalWithFibre: fibreBad,
  processedSodiumZero: sodiumZeroProcessed,
  kcalOutOfRange: kcalOut,
};

writeFileSync('tmp_audit_plausibility.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  counts: report.counts,
  animalWithFibre: fibreBad.slice(0, 25),
  processedSodiumZero: sodiumZeroProcessed.slice(0, 25),
  kcalOutOfRange: kcalOut.slice(0, 25),
}, null, 2));
