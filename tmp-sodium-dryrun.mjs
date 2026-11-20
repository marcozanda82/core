import { readFileSync, writeFileSync } from 'node:fs';

const SALT = 393.4;
const round = (n) => Math.round(Number(n) * 100) / 100;

const db = JSON.parse(readFileSync('./tmp-fooddb.json', 'utf8'));

/** Direct CREA Na mg/100g from public/crea_food_composition_tables.csv (or USDA where noted). */
const TARGETS = {
  mela: { after: 2, method: 'CREA Mele, fresche (Na ~2 mg/100g; sale×393.4≈1.97 → arrot. 2)' },
  kiwi: { after: 5, method: 'CREA Kiwi (Na ~5 mg/100g; sale 0.013 → 5.11 → arrot. 5)' },
  melanzana: { after: 3, method: 'CREA Melanzane, crude cod.005500 Na 3 mg/100g' },
  melanzane: { after: 3, method: 'CREA Melanzane, crude cod.005500 Na 3 mg/100g' },
  pomodoro: { after: 3, method: 'CREA Pomodori da insalata freschi cod.006600 Na 3 mg/100g' },
  'pomodorissimo la passata': {
    after: 16,
    method: 'CREA Pomodori, passata cod.006670 Na 16 mg/100g',
  },
  food_1777149590373_Barcode_053126161001: {
    after: 775,
    method: 'CREA Pizza con pomodoro e mozzarella cod.000720 Na 775 mg/100g (proxy speck/burrata)',
    note: 'proxy CREA pizza mozzarella; etichetta prodotto meglio se disponibile',
  },
};

/** Ingredient Na overrides (CREA) when personal row is missing/corrupted (na=500). */
const ING_NA = {
  pomodoro: 3,
  peperoni: 2,
  carote: 95,
  "tonno all'olio di oliva": 316, // CREA Tonno sott'olio sgocciolato 123610
  "filetti di sgombro al naturale": 130, // CREA Sgombro 123000 (fresco; al naturale senza sale aggiunto)
  'olio di arachidi': 0,
  "sardine all'olio di oliva": 285, // keep personal row (sale 0.7 → 275; row na 285)
};

function naFromRow(row, key) {
  if (ING_NA[key] != null) return ING_NA[key];
  if (!row) return null;
  const sale = Number(row.sale);
  const na = Number(row.na ?? row.sodium);
  if (Number.isFinite(sale) && sale > 0) {
    if (na === 500 || !Number.isFinite(na)) return round(sale * SALT);
    // trust sale when na looks like corrupted heuristic
    if (na >= 400 && sale * SALT < 100) return round(sale * SALT);
    return round(sale * SALT);
  }
  if (Number.isFinite(na) && na >= 0 && na !== 500) return na;
  return null;
}

function recipeNa(r) {
  const ings = Array.isArray(r.ingredients) ? r.ingredients : [];
  let totalG = 0;
  let totalNa = 0;
  const detail = [];
  let skipped = 0;
  for (const ing of ings) {
    const g = Number(ing.weight ?? ing.qta ?? ing.grams) || 0;
    if (g <= 0) continue;
    const key = String(ing.foodDbKey || ing.key || '').trim();
    const row = db[key] || ing.row || null;
    const per100 = naFromRow(row, key);
    if (per100 == null) {
      skipped += 1;
      detail.push({ key, g, per100: null });
      continue;
    }
    totalNa += per100 * (g / 100);
    totalG += g;
    detail.push({ key, g, per100 });
  }
  if (totalG <= 0 || skipped > 0) {
    // still compute if we have partial? prefer fail if any missing
    if (totalG <= 0) return { after: null, detail, skipped };
  }
  // if some skipped, still report partial with note
  const after = totalG > 0 ? round(totalNa / (totalG / 100)) : null;
  return { after, detail, skipped, totalG, totalNa: round(totalNa) };
}

const keys = [
  'mela',
  'kiwi',
  'melanzana',
  'melanzane',
  'pomodoro',
  'pomodorissimo la passata',
  'food_1777149590373_Barcode_053126161001',
  'recipe_1789662948410_Pane_integrale_con_sardine_e_pomodoro',
  'recipe_1789755622020_Insalatissime_Rio_Mare_Messicana',
  'recipe_1790517453430_Panino_pomodoro_e_sgombro',
];

const plan = [];
for (const key of keys) {
  const r = db[key];
  if (!r) {
    plan.push({ key, missing: true });
    continue;
  }
  const before = Number(r.na);
  if (TARGETS[key]) {
    plan.push({
      key,
      name: r.name || r.desc || key,
      before,
      after: TARGETS[key].after,
      method: TARGETS[key].method,
      note: TARGETS[key].note || '',
      alsoSetSale: TARGETS[key].after != null ? round(TARGETS[key].after / SALT) : null,
    });
    continue;
  }
  const { after, detail, skipped, totalG } = recipeNa(r);
  plan.push({
    key,
    name: r.name || r.desc || key,
    before,
    after,
    method: 'ricalcolo da ingredients (mg Na / 100 g ricetta)',
    note: skipped ? `${skipped} ingredienti senza Na (vedi detail)` : '',
    alsoSetSale: after != null ? round(after / SALT) : null,
    detail,
    totalG,
  });
}

// dump ingredient rows used
const ingKeys = [
  'pane integrale con semi e noci',
  "sardine all'olio di oliva",
  "tonno all'olio di oliva",
  'fagioli a vapore rossi',
  'food_1787861182371_Mais',
  'olio di arachidi',
  'carote',
  'peperoni',
  "filetti di sgombro al naturale",
  'pomodoro',
];
const ingDump = {};
for (const k of ingKeys) {
  const r = db[k];
  ingDump[k] = r
    ? { na: r.na, sale: r.sale, name: r.name || r.desc, resolved: naFromRow(r, k) }
    : { missing: true, resolved: naFromRow(null, k) };
}

writeFileSync('./tmp-sodium-plan.json', JSON.stringify({ plan, ingDump }, null, 2));
console.log(JSON.stringify({ plan, ingDump }, null, 2));
