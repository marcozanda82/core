/**
 * Dry-run: personal DB na===500 or fresh produce na>50, map CREA after.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SALT = 393.4;
const round3 = (n) => Math.round(Number(n) * 1000) / 1000;
const db = JSON.parse(readFileSync('./tmp-fooddb.json', 'utf8'));

/** Parse CREA CSV → name → sodium mg */
function loadCrea() {
  const text = readFileSync('./public/crea_food_composition_tables.csv', 'utf8');
  const lines = text.split(/\r?\n/);
  const hdr = parseCsvLine(lines[0]);
  const naIdx = hdr.indexOf('sodium');
  const map = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    const name = cols[0];
    const code = cols[2];
    const na = Number(cols[naIdx]);
    if (!name || !Number.isFinite(na)) continue;
    map.push({ name, code, na, key: normalize(name) });
  }
  return map;
}

function parseCsvLine(line) {
  const cols = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === ',' && !q) {
      cols.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const FRESH_RE =
  /\b(mela|mele|kiwi|pera|pere|banana|arancia|limone|pesca|pesche|fragol|uva|anguria|cocomero|avocado|pomodor|melanzan|peperon|zucchina|zucchine|carota|carote|fagiolin|spinaci|insalata|lattuga|cetriol|bieta|carciof|patate|cipoll|aglio|sedano|finocchi|rucola|radicchio|mandorl|noci|nocciole|pistacch)\b/;

/** Explicit CREA matches for known corrupted fresh keys */
const EXPLICIT = {
  fagiolini: { after: 2, method: 'CREA Fagiolini freschi 004310 Na 2' },
  'fagiolini fini surgelati': { after: 8, method: 'CREA Fagiolini surgelati cotti bolliti 004325 Na 8' },
  peperoni: { after: 2, method: 'CREA Peperoni crudi 005600 Na 2' },
  'peperone rosso': { after: 16, method: 'CREA Peperoni rossi crudi 005630 Na 16' },
  pesca: { after: 3, method: 'CREA Pesche fresche senza buccia 007280 Na 3' },
  avocado: { after: 2, method: 'CREA Avocado fresco 007490 Na 2' },
  patate: { after: 7, method: 'CREA Patate crude 006500 Na 7' },
  'patate lesse': { after: 7, method: 'CREA Patate senza buccia bollite 006515 Na 7' },
  'food_1781713043433_Cocomero__fresco': { after: 3, method: 'CREA Cocomero fresco 007040 Na 3' },
  'food_1780951288487_Pesche__fresche__con_buccia': { after: 3, method: 'CREA Pesche fresche senza buccia 007280 Na 3 (proxy)' },
  'food_1781039889587_Zucchine_chiare__cotte__al_vapore': { after: 1, method: 'CREA Zucchine chiare cotte al vapore 005741 Na 1' },
  'food_1775248196820_Carciofi': { after: 133, method: 'CREA Carciofi crudi 005120 Na 133' },
  'food_1777924611418_Bieta_erbetta_a_cubetti': { after: 10, method: 'CREA Bieta cruda 005080 Na 10' },
  'anelli di cipolla': { after: null, method: 'processato/fritto — non CREA fresco; skip' },
  mandorle: { after: 14, method: 'CREA Mandorle dolci secche 008540 Na 14' },
  peperoni: { after: 2, method: 'CREA Peperoni crudi 005600 Na 2' },
  'peperone rosso': { after: 16, method: 'CREA Peperoni rossi crudi 005630 Na 16' },
};

const crea = loadCrea();

function matchCrea(name) {
  const n = normalize(name);
  // prefer exact-ish includes
  let best = null;
  for (const row of crea) {
    if (row.key === n) return row;
    if (n && row.key.includes(n) && n.length >= 5) {
      if (!best || row.key.length < best.key.length) best = row;
    }
  }
  return best;
}

const plan = [];
for (const [key, row] of Object.entries(db)) {
  const na = Number(row.na);
  const name = row.name || row.desc || key;
  const cat = String(row.category || '');
  const freshLike =
    /fruit|frutta|vegetable|verdura|ortagg/i.test(cat) || FRESH_RE.test(normalize(name));
  const hit500 = na === 500;
  const hitHighFresh = freshLike && Number.isFinite(na) && na > 50;
  if (!hit500 && !hitHighFresh) continue;

  const explicit = EXPLICIT[key];
  const creaHit = matchCrea(name);
  let after = explicit?.after ?? null;
  let method = explicit?.method || '';
  if (after == null && creaHit && freshLike) {
    after = creaHit.na;
    method = `CREA ${creaHit.name} (${creaHit.code}) Na ${creaHit.na}`;
  }
  if (after == null && hit500 && freshLike && creaHit) {
    after = creaHit.na;
    method = `CREA ${creaHit.name} (${creaHit.code}) Na ${creaHit.na}`;
  }

  plan.push({
    key,
    name,
    category: cat || null,
    before: na,
    after,
    saleAfter: after != null ? round3(after / SALT) : null,
    method: method || (hit500 ? 'na=500 artefatto; senza CREA 1:1 — non auto-fix' : 'fresco >50 senza CREA'),
    freshLike,
    hit500,
    writable: after != null && Number.isFinite(after) && after !== na,
  });
}

plan.sort((a, b) => Number(b.writable) - Number(a.writable) || a.key.localeCompare(b.key));

writeFileSync(
  './tmp-personal-na500-plan.json',
  JSON.stringify(
    {
      total: plan.length,
      writable: plan.filter((p) => p.writable).length,
      needManual: plan.filter((p) => !p.writable).length,
      plan,
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      total: plan.length,
      writable: plan.filter((p) => p.writable).length,
      freshWritable: plan.filter((p) => p.writable && p.freshLike).slice(0, 40),
      other500writable: plan.filter((p) => p.writable && !p.freshLike).slice(0, 20),
      needManualSample: plan.filter((p) => !p.writable).slice(0, 15),
    },
    null,
    2,
  ),
);
