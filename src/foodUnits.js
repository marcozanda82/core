/**
 * Porzioni per alimento: unità comuni (g) + default da uso ripetuto (localStorage).
 */

export const FOOD_UNIT_USAGE_STORAGE_KEY = 'food_unit_usage_v1';

const FRUIT_UNIT_GRAMS = [
  [/banana/i, 120],
  [/mela|apple/i, 150],
  [/aranci/i, 150],
  [/pera/i, 150],
  [/pesca|nettarina/i, 130],
  [/kiwi/i, 100],
  [/albicocca|prugna/i, 45],
  [/fragol/i, 150],
  [/uva/i, 120],
  [/anguria|melone|cocomero/i, 200],
  [/ciliegi/i, 100],
  [/ananas/i, 150],
  [/limone/i, 60],
  [/mango/i, 200],
  [/pompelm|mandarin/i, 130],
];

function loadUsageRoot() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FOOD_UNIT_USAGE_STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function persistUsageRoot(root) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FOOD_UNIT_USAGE_STORAGE_KEY, JSON.stringify(root));
    }
  } catch (_) {}
}

function getUsageCountsForFood(foodDbKey) {
  const key = String(foodDbKey || '').trim();
  if (!key) return {};
  const root = loadUsageRoot();
  const bucket = root[key];
  return bucket && typeof bucket === 'object' ? { ...bucket } : {};
}

/**
 * @param {string} foodDbKey
 * @param {number} actualGrams — peso salvato (qta/weight)
 * @param {Array<{ label: string, grams: number }>} units
 */
export function recordFoodUnitUsage(foodDbKey, actualGrams, units) {
  const key = String(foodDbKey || '').trim();
  const g = Number(actualGrams);
  if (!key || !Number.isFinite(g) || g <= 0 || !Array.isArray(units) || units.length === 0) return;

  let best = units[0];
  let bestScore = Infinity;
  units.forEach((u) => {
    const ug = Number(u?.grams);
    if (!Number.isFinite(ug) || ug <= 0) return;
    const score = Math.abs(Math.log(g / ug));
    if (score < bestScore) {
      bestScore = score;
      best = u;
    }
  });
  const gramKey = String(Math.round(Number(best.grams) || 0));
  if (!gramKey || gramKey === '0') return;

  const root = loadUsageRoot();
  if (!root[key] || typeof root[key] !== 'object') root[key] = {};
  root[key][gramKey] = (Number(root[key][gramKey]) || 0) + 1;
  persistUsageRoot(root);
}

/**
 * Registra uso porzione per ogni voce pasto con match su foodDb.
 * @param {Array<object>} mealItems
 * @param {Record<string, object>} foodDb
 * @param {(q: string, db: object) => string | null | undefined} findBestFoodMatchFn
 */
export function recordMealFoodUnitUsageFromItems(mealItems, foodDb, findBestFoodMatchFn) {
  if (!Array.isArray(mealItems) || !foodDb || typeof foodDb !== 'object') return;
  mealItems.forEach((f) => {
    if (!f || f.type === 'recipe' || f.isRecipe === true) return;
    const desc = String(f.desc ?? f.name ?? '').trim();
    if (!desc) return;
    const dbKey =
      f.foodDbKey != null && foodDb[f.foodDbKey] != null
        ? String(f.foodDbKey)
        : (typeof findBestFoodMatchFn === 'function' ? findBestFoodMatchFn(desc, foodDb) : null);
    if (!dbKey) return;
    const row = foodDb[dbKey];
    if (!row || typeof row !== 'object' || row.isRecipe === true || row.type === 'recipe') return;
    const { units } = buildFoodUnits(row, dbKey);
    const grams = Number(f.qta ?? f.weight) || 0;
    if (grams > 0) recordFoodUnitUsage(dbKey, grams, units);
  });
}

export function estimateFruitUnitGrams(desc) {
  const s = String(desc || '').toLowerCase();
  for (let i = 0; i < FRUIT_UNIT_GRAMS.length; i += 1) {
    const [re, g] = FRUIT_UNIT_GRAMS[i];
    if (re.test(s)) return g;
  }
  return 120;
}

/** Profilo semantico da nome (IT) per regole porzione. */
export function detectFoodSemanticKind(desc) {
  const s = String(desc || '').toLowerCase();
  if (/\b(yogurt|yoghurt)\b/i.test(s)) return 'yogurt';
  if (/\bolio\b|\boil\b/i.test(s) || /^olio\b/i.test(s)) return 'oil';
  if (/\btonno\b|tonno\s|skipjack/i.test(s)) return 'tuna';
  if (/pasta|spaghetti|penne|fusilli|rigatoni|tagliatelle|orecchiette|lasagne|gnocch|\briso\b|risotto|cous|orzo\b|farro\b|fregola/i.test(s)) {
    return 'pasta_rice';
  }
  if (/pane|fette biscottate|focaccia|brioche|toast|pagnotta|bagel|grissin|focacc/i.test(s)) return 'bread';
  if (/mela|banana|aranci|fragol|kiwi|pesca|pera|uva|melone|anguria|ciliegi|albicocca|prugna|limone|mango|ananas|frutta|pompelm|mandarin/i.test(s)) {
    return 'fruit';
  }
  return 'generic';
}

function unit(label, grams) {
  const g = Math.round(Number(grams)) || 0;
  if (g <= 0) return null;
  return { label: String(label), grams: g };
}

/**
 * @param {object} row — riga DB per 100g (desc, kcal, …)
 * @param {string} [foodDbKey] — per statistiche uso locale
 * @returns {{ units: Array<{ label: string, grams: number }>, defaultUnit: { label: string, grams: number } }}
 */
export function buildFoodUnits(row, foodDbKey = '') {
  const desc = String(row?.desc ?? row?.name ?? '').trim();
  const kind = detectFoodSemanticKind(desc);
  const list = [];

  const u100 = unit('100 g', 100);
  if (u100) list.push(u100);

  switch (kind) {
    case 'bread':
      list.push(unit('1 fetta (~25 g)', 25));
      break;
    case 'pasta_rice':
      list.push(unit('1 porzione (~70 g)', 70));
      break;
    case 'oil':
      list.push(unit('1 cucchiaio (~10 g)', 10));
      break;
    case 'yogurt':
      list.push(unit('1 vasetto (~125 g)', 125));
      break;
    case 'tuna':
      list.push(unit('1 scatoletta (~56 g)', 56));
      break;
    case 'fruit': {
      const fg = estimateFruitUnitGrams(desc);
      list.push(unit(`1 unità (~${fg} g)`, fg));
      break;
    }
    default:
      break;
  }

  const byGrams = new Map();
  list.forEach((u) => {
    if (!u) return;
    if (!byGrams.has(u.grams)) byGrams.set(u.grams, u);
  });
  const units = [...byGrams.values()].sort((a, b) => a.grams - b.grams);

  const usage = foodDbKey ? getUsageCountsForFood(foodDbKey) : {};
  let defaultUnit = pickDefaultFromUsage(units, usage) || pickHeuristicDefault(units, kind);
  if (!defaultUnit) defaultUnit = units.find((u) => u.grams === 100) || units[0];

  return { units, defaultUnit };
}

function pickDefaultFromUsage(units, usage) {
  const entries = Object.entries(usage || {});
  if (entries.length === 0) return null;
  let bestG = null;
  let bestC = -1;
  entries.forEach(([gStr, c]) => {
    const n = Number(c) || 0;
    if (n > bestC) {
      bestC = n;
      bestG = Number(gStr);
    }
  });
  if (bestG == null || !Number.isFinite(bestG) || bestC < 1) return null;
  const exact = units.find((u) => u.grams === bestG);
  if (exact) return { ...exact };
  let best = units[0];
  let dist = Infinity;
  units.forEach((u) => {
    const d = Math.abs(u.grams - bestG);
    if (d < dist) {
      dist = d;
      best = u;
    }
  });
  return best ? { ...best } : null;
}

function pickHeuristicDefault(units, kind) {
  const pick = (g) => units.find((u) => u.grams === g);
  switch (kind) {
    case 'yogurt':
      return pick(125) || pick(100);
    case 'oil':
      return pick(10) || pick(100);
    case 'tuna':
      return pick(56) || pick(100);
    case 'bread':
      return pick(25) || pick(100);
    case 'pasta_rice':
      return pick(70) || pick(100);
    case 'fruit':
      return units.find((u) => /1 unità/i.test(u.label)) || pick(100);
    default:
      return pick(100) || units[0];
  }
}

/**
 * Aggiunge `units` e `defaultUnit` a una riga DB (per 100g) prima del salvataggio Firebase.
 */
export function enrichDbRowWithFoodUnits(row, foodDbKey) {
  if (!row || typeof row !== 'object') return row;
  if (row.isRecipe === true || row.type === 'recipe') return row;
  const { units, defaultUnit } = buildFoodUnits(row, foodDbKey);
  return { ...row, units, defaultUnit };
}

/**
 * Arricchisce voce in coda (porzione) con unità da riga DB.
 */
export function enrichPortionItemWithDbUnits(foodItem, dbRowPer100, foodDbKey) {
  if (!foodItem || typeof foodItem !== 'object') return foodItem;
  if (!dbRowPer100 || typeof dbRowPer100 !== 'object') return foodItem;
  if (dbRowPer100.isRecipe === true || dbRowPer100.type === 'recipe') return foodItem;
  const key = String(foodDbKey || '').trim();
  const { units, defaultUnit } = buildFoodUnits(dbRowPer100, key);
  return { ...foodItem, units, defaultUnit, foodDbKey: foodItem.foodDbKey || key };
}
