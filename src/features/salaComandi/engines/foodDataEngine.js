import { TARGETS } from '../../../useBiochimico';
import { buildFoodUnits, enrichPortionItemWithDbUnits } from '../../../foodUnits';
import {
  getFoodUsageCount,
  MATCH_TIER_RANK,
  normalizeSearchText,
  normalizeSearchKeywords,
  searchFoodsDetailed,
  searchFoodsWithKeywords,
} from '../../../foodSearch.js';

export const FOOD_RESOLUTION_STATUS = Object.freeze({
  RESOLVED: 'RESOLVED',
  NEEDS_RESOLUTION: 'NEEDS_RESOLUTION',
});

const DB_META_KEYS = new Set([
  'id', 'isRecipe', 'type', 'desc', 'name', 'ingredients', 'units', 'defaultUnit',
  'category', 'foodDbKey', 'unitStep', 'defaultQty', 'barcode', 'image', 'row',
  // Health / NOVA labels (non sono nutrienti /100g)
  'novaScore', 'inflammationFactor', 'hasSaturatedFats',
]);

/**
 * Legge un numero dal DB (/100g). `0` è valido. `undefined` = chiave assente o non numerica.
 */
export function parseDbNumeric(raw) {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t || t.toLowerCase() === 'tr') return undefined;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Copia nutrienti DB → porzione. Restituisce le chiavi esplicitamente fornite (incluso fibre: 0).
 */
export function applyDbNutrientsToPortionItem(item, dbRow, qta) {
  const provided = new Set();
  if (!item || !dbRow || typeof dbRow !== 'object') return provided;
  const factor = Number(qta) / 100;
  if (!Number.isFinite(factor)) return provided;

  const assignPer100 = (canonKey, per100) => {
    if (per100 === undefined) return;
    item[canonKey] = per100 * factor;
    provided.add(canonKey);
    if (canonKey === 'fat' || canonKey === 'fatTotal') {
      provided.add('fat');
      provided.add('fatTotal');
    }
    if (canonKey === 'kcal' || canonKey === 'cal') {
      provided.add('kcal');
      provided.add('cal');
    }
  };

  Object.keys(dbRow).forEach((k) => {
    if (DB_META_KEYS.has(k)) return;
    assignPer100(k, parseDbNumeric(dbRow[k]));
  });

  const fibrePer100 = parseDbNumeric(dbRow.fibre) ?? parseDbNumeric(dbRow.fiber);
  if (fibrePer100 !== undefined) {
    assignPer100('fibre', fibrePer100);
  }

  return provided;
}

/**
 * Stima euristica per 100g — SOLO per flussi espliciti di stima utente (form manuale / provisional).
 * NON usata da estraiDatiFoodDb / resolver automatico (tolleranza zero).
 */
export function getAverageEstimate({ nutrientKey, foodDesc = '', fullHistory }) {
  void fullHistory;
  const desc = String(foodDesc || '').toLowerCase();
  const isProteico = /pollo|carne|pesce|tonno|salmone|manzo|petto|bresaola|prosciutto|uovo|tofu|legum|fagiol|ceci|lenticch|proteina|merluzz|nasello|baccal/.test(desc);
  const isCarboidrato = /pasta|pane|riso|patata|cereal|pizza|biscott|dolce|zucchero|miele|frutta|banana|mela/.test(desc);
  const isGrasso = /olio|avocado|frutta secca|mandorla|noci|semi|burro/.test(desc);
  if (nutrientKey === 'prot') return isProteico ? 18 : (isCarboidrato ? 6 : 10);
  if (nutrientKey === 'carb') return isCarboidrato ? 45 : (isProteico ? 2 : 15);
  if (nutrientKey === 'fatTotal' || nutrientKey === 'fat') return isGrasso ? 15 : (isProteico ? 5 : 8);
  if (nutrientKey === 'kcal' || nutrientKey === 'cal') {
    const p = getAverageEstimate({ nutrientKey: 'prot', foodDesc, fullHistory });
    const c = getAverageEstimate({ nutrientKey: 'carb', foodDesc, fullHistory });
    const f = getAverageEstimate({ nutrientKey: 'fatTotal', foodDesc, fullHistory });
    return Math.round((p * 4 + c * 4 + f * 9)) || 120;
  }
  if (nutrientKey === 'fibre' || nutrientKey === 'fiber') {
    return isCarboidrato ? 3 : 0;
  }
  if (nutrientKey === 'omega3') return isProteico ? 0.5 : 0.3;
  if (nutrientKey === 'mg') return 25;
  return 0;
}

/**
 * Chiavi TARGETS mancanti → 0 (niente stime automatiche).
 */
function zeroFillMissingNutrients(item, dbProvidedKeys) {
  if (!item) return;
  Object.keys(TARGETS).forEach((g) => {
    Object.keys(TARGETS[g] || {}).forEach((k) => {
      if (dbProvidedKeys?.has(k)) return;
      if (item[k] !== undefined && item[k] !== null) return;
      item[k] = 0;
    });
  });
  if (item.kcal == null) item.kcal = item.cal ?? 0;
  if (item.cal == null) item.cal = item.kcal ?? 0;
  if (item.fat == null && item.fatTotal != null) item.fat = item.fatTotal;
  if (item.fatTotal == null && item.fat != null) item.fatTotal = item.fat;
}

/**
 * Tra più chiavi candidate sceglie quella con usageCount più alto.
 * @param {object} foodDb
 * @param {string[]} keys
 * @returns {string | null}
 */
function pickKeyByUsageCount(foodDb, keys) {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  let bestKey = keys[0];
  let bestCount = getFoodUsageCount(foodDb?.[bestKey]);
  for (let i = 1; i < keys.length; i += 1) {
    const key = keys[i];
    const count = getFoodUsageCount(foodDb?.[key]);
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey;
}

/**
 * Match DB: preferredKey → search ranked (exact/includes/fuzzy) → max usageCount.
 * Tra più risultati per la stessa parola chiave vince sempre usageCount (abitudini).
 * @returns {string | null}
 */
export function findFoodDbKey(foodDb, nome, preferredDbKey = null, searchKeywords = null) {
  if (preferredDbKey != null && foodDb?.[preferredDbKey] != null) {
    return preferredDbKey;
  }

  const needle = normalizeSearchText(nome);
  if (!needle || !foodDb || typeof foodDb !== 'object') return null;

  const keywords = normalizeSearchKeywords(nome, searchKeywords);
  const hits = keywords.length > 1
    ? searchFoodsWithKeywords(foodDb, keywords, {
      limit: 24,
      includeUserHistory: false,
      enableFuzzy: true,
    })
    : searchFoodsDetailed(foodDb, nome, {
      limit: 24,
      includeUserHistory: false,
      enableFuzzy: true,
    });
  if (!hits.length) return null;

  // Accetta match forti (exact/prefix/word ≥75) oppure fuzzy (Levenshtein 1–2 → 85–90).
  // Accetta anche substring “forte” (≥50) se è l’unico candidato e la query è una parola intera nel nome.
  const acceptable = hits.filter((hit) => {
    const tier = String(hit.matchTier || '');
    const score = Number(hit.strictScore) || 0;
    if (tier === 'exact' || tier === 'prefix') return true;
    if (tier === 'fuzzy') return score >= 85;
    if (tier === 'word_boundary') return score >= 75;
    return score >= 75;
  });
  if (acceptable.length === 0 && hits.length > 0) {
    // Ultimo fallback: miglior hit lessicale (NO usage ranking su top-5 eterogenei).
    const best = hits[0];
    const bestScore = Number(best?.strictScore) || 0;
    if (best && needle.length >= 4 && bestScore >= 50) {
      return best.id;
    }
    return null;
  }
  if (acceptable.length === 0) return null;

  // Preferisci uguaglianza esatta sul nome, poi il tier lessicale migliore.
  // usageCount è solo spareggio DENTRO lo stesso tier (mai "pane" → "pane integrale…" per abitudine).
  const exactNameHits = acceptable.filter(
    (hit) => normalizeSearchText(hit?.name || hit?.desc || '') === needle,
  );
  const pool = exactNameHits.length > 0 ? exactNameHits : acceptable;
  let bestTierRank = 0;
  for (let i = 0; i < pool.length; i += 1) {
    const rank = MATCH_TIER_RANK[String(pool[i]?.matchTier || 'none')] || 0;
    if (rank > bestTierRank) bestTierRank = rank;
  }
  const topTier = pool.filter(
    (hit) => (MATCH_TIER_RANK[String(hit?.matchTier || 'none')] || 0) === bestTierRank,
  );
  const topKeys = topTier.map((hit) => hit.id);
  return pickKeyByUsageCount(foodDb, topKeys) || topKeys[0] || acceptable[0].id;
}

/**
 * Cascata allineata alla ricerca manuale UniversalSearch:
 * 1) DB personale (trackerFoodDatabase)
 * 2) Kentu DB IT (CREA)
 * 3) Kentu DB 🌐 globale
 *
 * @returns {{ key: string, foodDb: object, source: 'personal' | 'kentu_it' | 'global' } | null}
 */
export function findFoodDbMatchCascading({
  personalDb = null,
  kentuItDb = null,
  globalDb = null,
  nome,
  preferredDbKey = null,
  searchKeywords = null,
} = {}) {
  const layers = [
    { db: personalDb, source: 'personal' },
    { db: kentuItDb, source: 'kentu_it' },
    { db: globalDb, source: 'global' },
  ].filter((layer) => layer.db && typeof layer.db === 'object');

  if (preferredDbKey != null) {
    for (let i = 0; i < layers.length; i += 1) {
      const layer = layers[i];
      if (layer.db[preferredDbKey] != null) {
        return { key: preferredDbKey, foodDb: layer.db, source: layer.source };
      }
    }
  }

  const query = String(nome || '').trim();
  if (!query) return null;

  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    const key = findFoodDbKey(layer.db, query, null, searchKeywords);
    if (key != null && layer.db[key] != null) {
      return { key, foodDb: layer.db, source: layer.source };
    }
  }

  return null;
}

function buildUnresolvedFoodItem({ nome, qta, pastoType }) {
  const foodItem = Object.assign(
    {
      id: Date.now() + Math.random(),
      type: 'food',
      mealType: pastoType,
      desc: nome,
      name: nome,
      qta,
      weight: qta,
      kcal: 0,
      cal: 0,
      prot: 0,
      carb: 0,
      fat: 0,
      fatTotal: 0,
      foodDbKey: null,
      status: FOOD_RESOLUTION_STATUS.NEEDS_RESOLUTION,
    },
    ...Object.keys(TARGETS).flatMap((g) => Object.keys(TARGETS[g]).map((k) => ({ [k]: 0 }))),
  );
  const { units, defaultUnit, category } = buildFoodUnits({ desc: nome }, '');
  return { ...foodItem, units, defaultUnit, category };
}

/**
 * Estrazione dati alimento da DB. Tolleranza zero: niente stime medie automatiche.
 * Cascata: personale → Kentu IT → Kentu globale. Match assente → NEEDS_RESOLUTION.
 */
export function estraiDatiFoodDb({
  nome,
  qta,
  pastoType,
  preferredDbKey,
  foodDb,
  kentuItDb = null,
  globalDb = null,
  fullHistory,
}) {
  void fullHistory;
  const match = findFoodDbMatchCascading({
    personalDb: foodDb,
    kentuItDb,
    globalDb,
    nome,
    preferredDbKey,
  });
  if (!match) {
    return buildUnresolvedFoodItem({ nome, qta, pastoType });
  }

  const dbKey = match.key;
  const resolvedFoodDb = match.foodDb;
  const dbF = resolvedFoodDb[dbKey];
  if (dbF.isRecipe && Array.isArray(dbF.ingredients) && dbF.ingredients.length > 0) {
    const factor = qta / 100;
    const ingredients = dbF.ingredients.map((ing) => {
      const w0 = Number(ing.weight) || 0;
      const wf = w0 > 0 ? Math.max(5, Math.round(w0 * factor)) / w0 : factor;
      return {
        ...ing,
        weight: Math.max(5, Math.round(w0 * factor)),
        kcal: Math.max(0, Math.round((Number(ing.kcal) || 0) * wf)),
        prot: Math.max(0, Math.round((Number(ing.prot) || 0) * wf * 10) / 10),
        carb: Math.max(0, Math.round((Number(ing.carb) || 0) * wf * 10) / 10),
        fat: Math.max(0, Math.round((Number(ing.fat) || 0) * wf * 10) / 10),
      };
    });
    const recipeItem = {
      id: `recipe_${Date.now()}`,
      type: 'recipe',
      mealType: pastoType,
      desc: dbF.desc || nome,
      name: dbF.desc || nome,
      qta,
      weight: qta,
      unitStep: 50,
      kcal: ((Number(dbF.kcal) || 0) * qta) / 100,
      cal: ((Number(dbF.kcal) || 0) * qta) / 100,
      prot: ((Number(dbF.prot) || 0) * qta) / 100,
      carb: ((Number(dbF.carb) || 0) * qta) / 100,
      fat: ((Number(dbF.fatTotal) || Number(dbF.fat) || 0) * qta) / 100,
      fatTotal: ((Number(dbF.fatTotal) || Number(dbF.fat) || 0) * qta) / 100,
      ingredients,
      foodDbKey: dbKey,
      dbSource: match.source,
      status: FOOD_RESOLUTION_STATUS.RESOLVED,
      isRecipe: true,
    };
    const dbProvided = applyDbNutrientsToPortionItem(recipeItem, dbF, qta);
    zeroFillMissingNutrients(recipeItem, dbProvided);
    return recipeItem;
  }

  const foodItem = Object.assign(
    {
      id: Date.now() + Math.random(),
      type: 'food',
      mealType: pastoType,
      desc: nome,
      qta,
      weight: qta,
      kcal: 0,
      cal: 0,
      foodDbKey: dbKey,
      dbSource: match.source,
      status: FOOD_RESOLUTION_STATUS.RESOLVED,
    },
    ...Object.keys(TARGETS).flatMap((g) => Object.keys(TARGETS[g]).map((k) => ({ [k]: undefined }))),
  );
  const dbProvided = applyDbNutrientsToPortionItem(foodItem, dbF, qta);
  zeroFillMissingNutrients(foodItem, dbProvided);
  // Se il chiamante ha già scelto la chiave (vassoio / proposal), conserva il nome mostrato.
  const callerName = String(nome || '').trim();
  if (preferredDbKey != null && callerName) {
    foodItem.desc = callerName;
    foodItem.name = callerName;
  } else {
    foodItem.desc = dbF.desc || foodItem.desc || nome;
    foodItem.name = dbF.desc || dbF.name || nome;
  }
  return enrichPortionItemWithDbUnits(foodItem, dbF, dbKey);
}
