import fs from 'node:fs';

const csv = fs.readFileSync('public/crea_food_composition_tables.csv', 'utf8').split(/\r?\n/);
const hdr = parseRow(csv[0]);

function parseRow(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function trNum(v) {
  const t = String(v ?? '').trim();
  if (!t || t.toLowerCase() === 'tr') return 0;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

for (const code of ['181105', '181100', '120590']) {
  const line = csv.find((l) => {
    const cols = parseRow(l);
    return cols[hdr.indexOf('food_code')] === code;
  });
  if (!line) {
    console.log('missing', code);
    continue;
  }
  const cols = parseRow(line);
  const get = (n) => cols[hdr.indexOf(n)];
  console.log(JSON.stringify({
    code,
    name: get('name'),
    english: get('english_name'),
    kcal: trNum(get('energy_kcal')),
    prot: trNum(get('proteins')),
    fat: trNum(get('lipids')),
    carb: trNum(get('available_carbohydrates')),
    sugars: trNum(get('soluble_sugars')),
    fibre: trNum(get('total_fiber')),
    na: trNum(get('sodium')),
    chol: trNum(get('cholesterol')),
  }, null, 2));
}
