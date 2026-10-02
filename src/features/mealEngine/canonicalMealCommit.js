import { TARGETS } from '../../useBiochimico.js';
import { isUnresolvedMealDraftItem, INBOX_DRAFT_TYPE, UNASSIGNED_DRAFTS_TYPE } from '../../utils/mealDraftStatus.js';
import { sanitizeFoodDisplayName } from '../../utils/foodVisualResolver.js';

export const ALL_DIARY_NUTRIENT_KEYS = Object.values(TARGETS).flatMap((g) => Object.keys(g || {}));

const EXTRA_DIARY_NUTRIENT_KEYS = [
  'kcal',
  'cal',
  'fat',
  'fatTot',
  'fibreTotali',
  'fibreSolubili',
  'fibreInsolubili',
  'zuccheri',
  'sale',
  'sodium',
  'caffeineMg',
];

const UI_ONLY_KEYS = new Set([
  'row',
  'units',
  'defaultUnit',
  'multiplier',
  'selectedUnit',
  'qtyLabel',
  '_searchSource',
  'quantitySource',
  'estimateBasis',
  'alternatives',
  'matchCandidates',
  'candidates',
  'searchHits',
]);

function asFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundKcal(value) {
  const n = asFiniteNumber(value);
  if (n == null) return 0;
  return Math.round(n);
}

function roundMacro(value) {
  const n = asFiniteNumber(value);
  if (n == null) return 0;
  return Math.round(n * 10) / 10;
}

function readGrams(food, gramsOverride) {
  if (gramsOverride != null && gramsOverride !== '') {
    const fromArg = asFiniteNumber(gramsOverride);
    if (fromArg != null) return fromArg;
  }
  return asFiniteNumber(food?.grams ?? food?.qta ?? food?.weight ?? food?.qty ?? food?.qtyG);
}

function readName(food) {
  return sanitizeFoodDisplayName(
    food?.desc || food?.name || food?.foodName || food?.label || '',
    '',
  );
}

function readFoodDbKey(food) {
  const raw = food?.foodDbKey ?? food?.matchedKey ?? food?.dbKey ?? null;
  const key = raw != null ? String(raw).trim() : '';
  return key || null;
}

function isInboxLike(food) {
  const t = String(food?.type || '');
  return t === INBOX_DRAFT_TYPE || t === UNASSIGNED_DRAFTS_TYPE;
}

/**
 * Placeholder legacy (Inbox / grams:1) — non è una quantità reale confermata.
 * 1 g di un alimento DB risolto (es. sale) resta valido.
 */
export function isLegacyGrams1Placeholder(food, grams) {
  const g = grams != null ? asFiniteNumber(grams) : readGrams(food);
  if (g !== 1) return false;
  if (readFoodDbKey(food)) return false;
  if (isUnresolvedMealDraftItem(food) || isInboxLike(food)) return true;
  const kcal = asFiniteNumber(food?.kcal ?? food?.cal) || 0;
  const status = String(food?.status || '').toLowerCase();
  if (status && status !== 'resolved') return true;
  return kcal <= 0;
}

export function isCanonicalPersistableResolvedFood(food, grams) {
  if (!food || typeof food !== 'object') return false;
  if (isUnresolvedMealDraftItem(food)) return false;
  if (isInboxLike(food)) return false;
  const g = grams != null ? asFiniteNumber(grams) : readGrams(food);
  if (g == null || g <= 0) return false;
  if (isLegacyGrams1Placeholder(food, g)) return false;
  const name = readName(food);
  if (!name) return false;
  return true;
}

function parseRowNumeric(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t || t.toLowerCase() === 'tr') return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function nutrientsFromRow(row, grams) {
  if (!row || typeof row !== 'object') return {};
  const factor = grams / 100;
  if (!Number.isFinite(factor)) return {};
  const out = {};
  const kcalPer100 = parseRowNumeric(row.kcal ?? row.cal);
  if (kcalPer100 != null) {
    out.kcal = roundKcal(kcalPer100 * factor);
    out.cal = out.kcal;
  }
  const protPer100 = parseRowNumeric(row.prot ?? row.pro);
  if (protPer100 != null) out.prot = roundMacro(protPer100 * factor);
  const carbPer100 = parseRowNumeric(row.carb ?? row.carbo ?? row.cho);
  if (carbPer100 != null) out.carb = roundMacro(carbPer100 * factor);
  const fatPer100 = parseRowNumeric(row.fatTotal ?? row.fat ?? row.fatTot);
  if (fatPer100 != null) {
    out.fat = roundMacro(fatPer100 * factor);
    out.fatTotal = out.fat;
  }

  const keys = new Set([...ALL_DIARY_NUTRIENT_KEYS, ...EXTRA_DIARY_NUTRIENT_KEYS]);
  keys.forEach((key) => {
    if (key === 'kcal' || key === 'cal' || key === 'prot' || key === 'carb'
      || key === 'fat' || key === 'fatTotal' || key === 'fatTot') {
      return;
    }
    if (out[key] != null) return;
    const per100 = parseRowNumeric(row[key]);
    if (per100 == null) return;
    out[key] = roundMacro(per100 * factor);
  });
  const fibrePer100 = parseRowNumeric(row.fibre) ?? parseRowNumeric(row.fiber);
  if (fibrePer100 != null && out.fibre == null) {
    out.fibre = roundMacro(fibrePer100 * factor);
  }
  return out;
}

function nutrientsFromPortionItem(food) {
  const out = {};
  const kcal = asFiniteNumber(food?.kcal ?? food?.cal ?? food?.estKcal);
  if (kcal != null) {
    out.kcal = roundKcal(kcal);
    out.cal = out.kcal;
  }
  const prot = asFiniteNumber(food?.prot ?? food?.pro ?? food?.estPro ?? food?.proteine);
  if (prot != null) out.prot = roundMacro(prot);
  const carb = asFiniteNumber(food?.carb ?? food?.carbo ?? food?.cho ?? food?.estCar ?? food?.carboidrati);
  if (carb != null) out.carb = roundMacro(carb);
  const fat = asFiniteNumber(food?.fatTotal ?? food?.fat ?? food?.fatTot ?? food?.estFat ?? food?.grassi);
  if (fat != null) {
    out.fat = roundMacro(fat);
    out.fatTotal = out.fat;
  }
  const keys = new Set([...ALL_DIARY_NUTRIENT_KEYS, ...EXTRA_DIARY_NUTRIENT_KEYS]);
  keys.forEach((key) => {
    if (out[key] != null) return;
    const n = asFiniteNumber(food?.[key]);
    if (n == null) return;
    out[key] = key === 'kcal' || key === 'cal' ? roundKcal(n) : roundMacro(n);
  });
  return out;
}

/**
 * Nutrienti porzione: se c'è `row` /100g usa lo stesso arrotondamento del Manuale
 * (`Math.round` kcal, 1 decimale macro). Altrimenti copia i valori già calcolati sul draft.
 * Non ricalcola via AI e non stima porzioni.
 */
export function collectCanonicalPortionNutrients(food, grams) {
  const fromRow = nutrientsFromRow(food?.row, grams);
  const fromItem = nutrientsFromPortionItem(food);
  const merged = { ...fromItem, ...fromRow };
  if (merged.kcal == null && merged.cal != null) merged.kcal = merged.cal;
  if (merged.cal == null && merged.kcal != null) merged.cal = merged.kcal;
  if (merged.fat == null && merged.fatTotal != null) merged.fat = merged.fatTotal;
  if (merged.fatTotal == null && merged.fat != null) merged.fatTotal = merged.fat;
  if (merged.kcal == null) merged.kcal = 0;
  if (merged.cal == null) merged.cal = merged.kcal;
  if (merged.prot == null) merged.prot = 0;
  if (merged.carb == null) merged.carb = 0;
  if (merged.fat == null) merged.fat = 0;
  if (merged.fatTotal == null) merged.fatTotal = merged.fat;
  return merged;
}

export function pickCanonicalNutrientFields(item) {
  if (!item || typeof item !== 'object') return {};
  const out = {};
  const keys = new Set([...ALL_DIARY_NUTRIENT_KEYS, ...EXTRA_DIARY_NUTRIENT_KEYS]);
  keys.forEach((key) => {
    const n = asFiniteNumber(item[key]);
    if (n == null) return;
    out[key] = n;
  });
  return out;
}

export function canonicalNutritionFingerprint(item) {
  const nutrients = pickCanonicalNutrientFields(item);
  const grams = asFiniteNumber(item?.qta ?? item?.weight ?? item?.grams ?? item?.qty);
  return {
    foodDbKey: readFoodDbKey(item),
    grams,
    type: item?.type === 'recipe' ? 'recipe' : 'food',
    nutrients,
  };
}

export function nutritionPayloadEquals(a, b) {
  const fa = canonicalNutritionFingerprint(a);
  const fb = canonicalNutritionFingerprint(b);
  if (fa.foodDbKey !== fb.foodDbKey) return false;
  if (fa.grams !== fb.grams) return false;
  if (fa.type !== fb.type) return false;
  const keys = new Set([
    ...Object.keys(fa.nutrients),
    ...Object.keys(fb.nutrients),
  ]);
  for (const key of keys) {
    const va = asFiniteNumber(fa.nutrients[key]) ?? 0;
    const vb = asFiniteNumber(fb.nutrients[key]) ?? 0;
    if (va !== vb) return false;
  }
  return true;
}

/**
 * Alimento già risolto → voce diario (schema esistente). Puro.
 * Rifiuta unresolved, inbox e placeholder `grams: 1` senza foodDbKey.
 */
export function toCanonicalDiaryFoodItem({
  food,
  grams,
  mealContext = {},
  sourceMetadata = {},
} = {}) {
  const g = readGrams(food, grams);
  if (!isCanonicalPersistableResolvedFood(food, g)) return null;

  const name = readName(food);
  const foodDbKey = readFoodDbKey(food);
  const nutrients = collectCanonicalPortionNutrients(food, g);
  const mealType = mealContext.mealType != null && String(mealContext.mealType).trim()
    ? mealContext.mealType
    : (food.mealType != null ? food.mealType : undefined);
  const mealTime = mealContext.mealTime != null
    ? mealContext.mealTime
    : (food.mealTime ?? food.time);
  const id = mealContext.id != null && String(mealContext.id).trim()
    ? String(mealContext.id).trim()
    : (food.id != null && String(food.id).trim() ? String(food.id).trim() : undefined);
  const entrySource = sourceMetadata.entrySource
    || food.entrySource
    || 'ui';

  const item = {
    type: food.type === 'recipe' || food.isRecipe === true ? 'recipe' : 'food',
    desc: name,
    name,
    label: name,
    foodName: name,
    qta: g,
    weight: g,
    grams: g,
    qty: g,
    ...nutrients,
    status: 'resolved',
    entrySource,
  };

  if (foodDbKey) {
    item.foodDbKey = foodDbKey;
    item.matchedKey = foodDbKey;
  }
  if (mealType != null) item.mealType = mealType;
  if (mealTime != null) item.mealTime = mealTime;
  if (mealTime != null) item.time = mealTime;
  if (id) item.id = id;
  if (mealContext.batchId) item.batchId = mealContext.batchId;
  if (food.isRecipe === true || item.type === 'recipe') item.isRecipe = true;
  if (Array.isArray(food.ingredients) && food.ingredients.length > 0) {
    item.ingredients = food.ingredients;
  }
  if (food.servingLabel) item.servingLabel = String(food.servingLabel);
  if (food.coffeeShopProductId) {
    item.coffeeShopProductId = String(food.coffeeShopProductId).trim();
    item.isCoffeeShopItem = true;
  }
  if (food.icon) item.icon = food.icon;
  if (food.spokenFoodName) item.spokenFoodName = String(food.spokenFoodName);
  if (typeof food.isFastingSafe === 'boolean') item.isFastingSafe = food.isFastingSafe;
  if (asFiniteNumber(food.caffeineMg) != null && item.caffeineMg == null) {
    item.caffeineMg = asFiniteNumber(food.caffeineMg);
  }

  Object.keys(item).forEach((key) => {
    if (UI_ONLY_KEYS.has(key)) delete item[key];
  });

  return item;
}

/**
 * Payload pasto puro: items già risolti → shape diario. Nessuna I/O, nessun resolver.
 * Non assegna slot id nuovi: propaga `slotId` così due spuntini restano distinti.
 */
export function buildCanonicalMealCommitPayload({
  resolvedItems,
  mealType = null,
  slotId = null,
  mealTime = null,
  timeString = null,
  sourceMetadata = {},
} = {}) {
  const list = Array.isArray(resolvedItems) ? resolvedItems : [];
  const items = [];
  list.forEach((food, index) => {
    const canonical = toCanonicalDiaryFoodItem({
      food,
      grams: food?.grams ?? food?.qta ?? food?.weight ?? food?.qty,
      mealContext: {
        mealType: slotId || food?.mealType || mealType,
        mealTime: mealTime ?? food?.mealTime ?? food?.time,
        id: food?.id,
        batchId: food?.batchId,
        index,
      },
      sourceMetadata,
    });
    if (canonical) items.push(canonical);
  });
  return {
    mealType: mealType || null,
    slotId: slotId || null,
    mealTime: mealTime ?? null,
    timeString: timeString || null,
    items,
    sourceMetadata: { ...sourceMetadata },
  };
}

export function toMcDriveUpsertItem(canonical) {
  if (!canonical) return null;
  const foodDbKey = readFoodDbKey(canonical);
  const nutrients = pickCanonicalNutrientFields(canonical);
  return {
    foodName: canonical.name || canonical.foodName,
    name: canonical.name || canonical.foodName,
    grams: canonical.qta,
    qty: canonical.qta,
    status: 'resolved',
    ...nutrients,
    pro: nutrients.prot,
    carbo: nutrients.carb,
    fat: nutrients.fat ?? nutrients.fatTotal,
    ...(canonical.id ? { id: canonical.id } : {}),
    ...(foodDbKey ? { foodDbKey, matchedKey: foodDbKey } : {}),
    ...(canonical.spokenFoodName ? { spokenFoodName: canonical.spokenFoodName } : {}),
    ...(canonical.servingLabel ? { servingLabel: canonical.servingLabel } : {}),
    ...(canonical.coffeeShopProductId
      ? { coffeeShopProductId: canonical.coffeeShopProductId }
      : {}),
    ...(canonical.icon ? { icon: canonical.icon } : {}),
  };
}
