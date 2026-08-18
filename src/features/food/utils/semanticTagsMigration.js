/**
 * Arricchimento locale di semanticTags per il database personale.
 * Nessuna API esterna: match master DB + euristica sui macro.
 */

const ACCENT_REGEX = /[\u0300-\u036f]/g;

function normalizeName(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function readNumber(food, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const value = food?.[keys[i]];
    if (value == null || value === '') continue;
    const parsed = Number(String(value).replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function cloneSemanticTags(tags) {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return null;
  return {
    ...tags,
    allergens: Array.isArray(tags.allergens) ? tags.allergens.slice() : [],
  };
}

function buildMasterLookup(masterDb) {
  const byCreaCode = new Map();
  const byFdcId = new Map();
  const byName = new Map();

  const rows = Array.isArray(masterDb)
    ? masterDb
    : Object.values(masterDb || {});

  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;

    const creaCode = row.creaCode != null ? String(row.creaCode).trim() : '';
    if (creaCode) byCreaCode.set(creaCode.toLowerCase(), row);

    const fdcId = row.fdcId != null ? String(row.fdcId).trim() : '';
    if (fdcId) byFdcId.set(fdcId, row);

    [row.name, row.italianName, row.desc, row.description].forEach((label) => {
      const norm = normalizeName(label);
      if (norm && !byName.has(norm)) byName.set(norm, row);
    });
  });

  return { byCreaCode, byFdcId, byName };
}

function findMasterRow(food, personalKey, lookup) {
  if (!food || typeof food !== 'object' || !lookup) return null;

  const creaCode = food.creaCode != null ? String(food.creaCode).trim() : '';
  if (creaCode) {
    const hit = lookup.byCreaCode.get(creaCode.toLowerCase());
    if (hit) return hit;
  }

  const fdcId = food.fdcId != null ? String(food.fdcId).trim() : '';
  if (fdcId) {
    const hit = lookup.byFdcId.get(fdcId);
    if (hit) return hit;
  }

  const nameCandidates = [food.name, food.desc, food.italianName, personalKey];
  for (let i = 0; i < nameCandidates.length; i += 1) {
    const norm = normalizeName(nameCandidates[i]);
    if (!norm) continue;
    const hit = lookup.byName.get(norm);
    if (hit) return hit;
  }

  return null;
}

/**
 * Genera semanticTags euristici dai macro per alimenti/ricette senza match master.
 * @param {Record<string, unknown>} food
 */
export function calculateHeuristicTags(food) {
  const carb = readNumber(food, ['carb', 'carbs', 'carboidrati']);
  const prot = readNumber(food, ['prot', 'protein', 'proteine']);
  const fatTot = readNumber(food, ['fatTot', 'fatTotal', 'fat', 'grassi']);
  const fibre = readNumber(food, ['fibreTotali', 'fibre', 'fiber']);
  const zuccheri = readNumber(food, ['zuccheri', 'sugars', 'sugar']);
  const fatSat = readNumber(food, ['fatSat', 'grassi_saturi', 'saturatedFat']);
  const omega3 = readNumber(food, ['omega3']);
  const omega6 = readNumber(food, ['omega6']);

  let glycemicIndex = 'IG_MED';
  if (carb < 5 || (carb > 0 && fibre / carb > 0.2)) {
    glycemicIndex = 'IG_LOW';
  } else if (zuccheri > 15 && fibre < 2) {
    glycemicIndex = 'IG_HIGH';
  }

  const proteinQuality = prot > 15 ? 'COMPLETE' : 'INCOMPLETE';
  const satiety = prot > 10 || fibre > 5 ? 'HIGH_SATIETY' : 'LOW_SATIETY';

  let inflammation = 'NEUTRAL';
  if (fatSat > 5 || zuccheri > 20) {
    inflammation = 'PRO';
  } else if ((omega3 > 0 && omega6 > 0 && omega3 > omega6) || fibre > 8) {
    inflammation = 'ANTI';
  }

  let novaGroup = 3;
  if (zuccheri > 15 && fatTot > 15) {
    novaGroup = 4;
  } else if (carb > 0 && prot < 5 && fatTot < 2) {
    novaGroup = 1;
  }

  let timing = 'ANY';
  if (prot > 20) {
    timing = 'POST_WORKOUT';
  } else if (carb > 30 && fatTot < 5) {
    timing = 'PRE_WORKOUT';
  }

  return {
    glycemicIndex,
    novaGroup,
    inflammation,
    fodmap: 'FODMAP_LOW',
    proteinQuality,
    satiety,
    timing,
    allergens: [],
  };
}

/**
 * Arricchisce il database personale con semanticTags (match master → euristica).
 * @param {Record<string, object> | object[] | null | undefined} personalFoods
 * @param {Record<string, object> | object[] | null | undefined} masterDb
 * @returns {{ foods: Record<string, object> | object[], stats: { total: number, masterMatched: number, heuristic: number } }}
 */
export function enrichCustomFoodsWithTags(personalFoods, masterDb) {
  const emptyStats = { total: 0, masterMatched: 0, heuristic: 0 };

  if (!personalFoods || typeof personalFoods !== 'object') {
    return { foods: personalFoods || {}, stats: emptyStats };
  }

  const isArray = Array.isArray(personalFoods);
  const entries = isArray
    ? personalFoods.map((food, index) => [String(food?.id || food?.key || index), food])
    : Object.entries(personalFoods);

  const lookup = buildMasterLookup(masterDb);
  let masterMatched = 0;
  let heuristic = 0;

  const enrichedEntries = entries.map(([key, food]) => {
    if (!food || typeof food !== 'object') return [key, food];

    const masterRow = findMasterRow(food, key, lookup);
    const masterTags = cloneSemanticTags(masterRow?.semanticTags);

    if (masterTags) {
      masterMatched += 1;
      return [key, { ...food, semanticTags: masterTags }];
    }

    heuristic += 1;
    return [key, { ...food, semanticTags: calculateHeuristicTags(food) }];
  });

  const foods = isArray
    ? enrichedEntries.map(([, food]) => food)
    : Object.fromEntries(enrichedEntries);

  return {
    foods,
    stats: {
      total: entries.length,
      masterMatched,
      heuristic,
    },
  };
}
