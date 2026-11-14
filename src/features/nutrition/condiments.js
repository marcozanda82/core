/**
 * Condimenti suggeriti per i piatti che di solito si condiscono.
 *
 * Tabella dei valori predefiniti (olio extravergine, sale da cucina):
 * - pasta: un cucchiaio di olio (10 g), sale normale (1,5 g)
 * - riso: un cucchiaio di olio (10 g), sale normale (1,5 g)
 * - insalata: un cucchiaio di olio (10 g), sale poco (0,5 g)
 * - verdure cotte o crude: mezzo cucchiaio (5 g), sale poco (0,5 g)
 * - legumi: mezzo cucchiaio (5 g), sale normale (1,5 g)
 * - carne in padella o alla griglia: mezzo cucchiaio (5 g), sale normale (1,5 g)
 * - pesce in padella o alla griglia: mezzo cucchiaio (5 g), sale poco (0,5 g)
 *
 * Il sale è stimato in grammi di sale: niente 0, poco 0,5 g, normale 1,5 g.
 * Il sodio salvato è il 40% di quel peso (0 / 200 / 600 mg).
 * L'olio extravergine ha inflammationFactor -1. Gli altri oli restano neutri o +1.
 */

const MEMORY_KEY = 'kentu.condiment.last.v1';

export const OIL_GRAMS = Object.freeze([
  { id: '0', grams: 0, label: 'niente' },
  { id: '5', grams: 5, label: 'mezzo cucchiaio (5 g)' },
  { id: '10', grams: 10, label: 'un cucchiaio (10 g)' },
  { id: '20', grams: 20, label: 'due cucchiai (20 g)' },
]);

export const SALT_LEVELS = Object.freeze([
  { id: 'none', grams: 0, sodiumMg: 0, label: 'niente' },
  { id: 'little', grams: 0.5, sodiumMg: 200, label: 'poco' },
  { id: 'normal', grams: 1.5, sodiumMg: 600, label: 'normale' },
]);

export const OIL_TYPES = Object.freeze({
  evo: { id: 'evo', name: 'Olio extravergine', kcalPerG: 8.84, inflammationFactor: -1 },
  olive: { id: 'olive', name: 'Olio di oliva', kcalPerG: 8.84, inflammationFactor: 0 },
  seed: { id: 'seed', name: 'Olio di semi', kcalPerG: 8.84, inflammationFactor: 1 },
});

const CATEGORIES = Object.freeze([
  { id: 'pasta', test: /pasta|spaghetti|penne|fusilli|rigatoni|tagliatelle|fettuccine|linguine|maccheroni|couscous|cous cous/, oil: '10', salt: 'normal' },
  { id: 'riso', test: /\briso\b|basmati|risotto/, oil: '10', salt: 'normal' },
  { id: 'insalata', test: /insalata|lattuga|rucola|songino/, oil: '10', salt: 'little' },
  { id: 'legumi', test: /ceci|lenticchie|fagioli|legumi|piselli|fave|edamame/, oil: '5', salt: 'normal' },
  { id: 'verdure', test: /verdur|zucchin|broccoli|spinaci|carot|melanzan|peperon|cavol|finocch|asparag|pomodor|bietol|fagiolin|radicchio/, oil: '5', salt: 'little' },
  { id: 'pesce', test: /pesce|salmone|merluzzo|tonno|orata|branzino|sgombro|acciug|sogliola|gamber|calamar|seppia|trota|spigola/, oil: '5', salt: 'little' },
  { id: 'carne', test: /pollo|manzo|maiale|tacchino|bistecca|carne|hamburger|fettina|coscia|petto|agnello|vitello|salsiccia/, oil: '5', salt: 'normal' },
]);

const PAN_OR_GRILL = /padella|grigliat|griglia|piastra|saltat|brasat|scottat/;
const NOT_PAN = /lesso|bollit|vapore|al forno|forno|crudo/;
const SKIP_NAME = /olio\b|sale\b|aceto|sugo|pesto|pizza|lasagne|piadina|panino|biscott|merend|patatine|cracker|snack|bevanda|bibita|succo|caff|t[eè]\b|acqua|vino|birra|cola|frutta|mela|banana|arancia|pera|pesca|uva|fragol|kiwi|ananas|melone|confezion|già condit|piatto pronto/;

function foodLabel(food) {
  return String(food?.name || food?.foodName || food?.desc || food?.label || '').trim();
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function ingredientText(food) {
  const lists = [food?.ingredients, food?.recipeIngredients, food?.components];
  const parts = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      parts.push(typeof item === 'string' ? item : (item?.name || item?.desc || item?.label || ''));
    }
  }
  return parts.join(' ').toLowerCase();
}

function readMemory() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function rememberedCondiment(name) {
  const hit = readMemory()[normalizeName(name)];
  if (!hit || typeof hit !== 'object') return null;
  if (!OIL_GRAMS.some((item) => item.id === hit.oil)) return null;
  if (!SALT_LEVELS.some((item) => item.id === hit.salt)) return null;
  if (!OIL_TYPES[hit.oilType]) return null;
  return { oil: hit.oil, salt: hit.salt, oilType: hit.oilType };
}

export function rememberCondiment(name, choice) {
  const key = normalizeName(name);
  if (!key || !choice) return;
  if (typeof localStorage === 'undefined') return;
  const all = readMemory();
  all[key] = { oil: choice.oil, salt: choice.salt, oilType: choice.oilType || 'evo' };
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(all));
  } catch {
    /* la scelta resta sul piatto anche se la memoria è piena */
  }
}

/**
 * @returns {null | { category: string, defaults: { oil: string, salt: string, oilType: string } }}
 */
export function classifyCondiment(food) {
  if (!food || food.condimentKind) return null;
  const name = normalizeName(foodLabel(food));
  if (!name) return null;
  if (SKIP_NAME.test(name)) return null;
  if (/bevanda|drink|beverage/.test(String(food.type || food.category || '').toLowerCase())) return null;
  const ingredients = ingredientText(food);
  if (/\bolio\b/.test(ingredients)) return null;
  if (Number(food.novaScore) === 4 && /pronto|sugo|pesto|condit|surgelat/.test(name)) return null;

  for (const category of CATEGORIES) {
    if (!category.test.test(name)) continue;
    if (category.id === 'carne' || category.id === 'pesce') {
      if (!PAN_OR_GRILL.test(name) || NOT_PAN.test(name)) return null;
    }
    return {
      category: category.id,
      defaults: { oil: category.oil, salt: category.salt, oilType: 'evo' },
    };
  }
  return null;
}

export function resolveCondimentChoice(food) {
  const offer = classifyCondiment(food);
  if (!offer) return null;
  const stored = food?.condiment && rememberedShape(food.condiment)
    ? rememberedShape(food.condiment)
    : rememberedCondiment(foodLabel(food));
  return stored || offer.defaults;
}

function rememberedShape(choice) {
  if (!choice) return null;
  if (!OIL_GRAMS.some((item) => item.id === choice.oil)) return null;
  if (!SALT_LEVELS.some((item) => item.id === choice.salt)) return null;
  return { oil: choice.oil, salt: choice.salt, oilType: OIL_TYPES[choice.oilType] ? choice.oilType : 'evo' };
}

function oilEntry(parent, choice) {
  const level = OIL_GRAMS.find((item) => item.id === choice.oil);
  if (!level || !(level.grams > 0)) return null;
  const type = OIL_TYPES[choice.oilType] || OIL_TYPES.evo;
  const grams = level.grams;
  return {
    id: `${parent.id}::olio`,
    type: 'food',
    condimentOf: parent.id,
    condimentKind: 'oil',
    estimated: true,
    stimato: true,
    name: type.name,
    foodName: type.name,
    desc: `${type.name} (stimato)`,
    grams,
    qta: grams,
    kcal: Math.round(type.kcalPerG * grams),
    prot: 0,
    carb: 0,
    fat: grams,
    fatTotal: grams,
    inflammationFactor: type.inflammationFactor,
    novaScore: 1,
    mealType: parent.mealType,
    mealTime: parent.mealTime ?? parent.time,
    time: parent.mealTime ?? parent.time,
  };
}

function saltEntry(parent, choice) {
  const level = SALT_LEVELS.find((item) => item.id === choice.salt);
  if (!level || !(level.grams > 0)) return null;
  return {
    id: `${parent.id}::sale`,
    type: 'food',
    condimentOf: parent.id,
    condimentKind: 'salt',
    estimated: true,
    stimato: true,
    name: 'Sale',
    foodName: 'Sale',
    desc: 'Sale (stimato)',
    grams: level.grams,
    qta: level.grams,
    kcal: 0,
    prot: 0,
    carb: 0,
    fat: 0,
    salt: level.grams,
    salt_100g: 100,
    na: level.sodiumMg,
    sodium: level.sodiumMg,
    sodiumMg: level.sodiumMg,
    mealType: parent.mealType,
    mealTime: parent.mealTime ?? parent.time,
    time: parent.mealTime ?? parent.time,
  };
}

export function buildCondimentEntries(parent, choice) {
  if (!parent?.id || !choice) return [];
  return [oilEntry(parent, choice), saltEntry(parent, choice)].filter(Boolean);
}

export function condimentEntriesFor(food) {
  const choice = resolveCondimentChoice(food);
  if (!choice || !food?.id) return [];
  return buildCondimentEntries({ ...food, condiment: choice }, choice);
}

export function applyCondimentToFoods(foods, parent, choice) {
  const list = Array.isArray(foods) ? foods : [];
  const id = parent?.id;
  if (!id) return list;
  rememberCondiment(foodLabel(parent), choice);
  const without = list.filter((item) => item?.condimentOf !== id);
  const next = without.map((item) => (item?.id === id ? { ...item, condiment: choice } : item));
  const host = next.find((item) => item?.id === id);
  if (!host) return next;
  const extras = buildCondimentEntries(host, choice);
  const index = next.findIndex((item) => item?.id === id);
  return [...next.slice(0, index + 1), ...extras, ...next.slice(index + 1)];
}

/** Aggancia olio e sale stimati ai piatti appena confermati, senza duplicare. */
export function withCondiments(items) {
  const list = Array.isArray(items) ? items : [];
  const linked = new Set(list.map((item) => item?.condimentOf).filter(Boolean));
  const out = [];
  for (const item of list) {
    out.push(item);
    if (!item || item.condimentKind || linked.has(item.id)) continue;
    const extras = condimentEntriesFor(item);
    for (const extra of extras) {
      linked.add(item.id);
      out.push(extra);
    }
  }
  return out;
}
