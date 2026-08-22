/**
 * Fase 2 Offline-First: promuove alimenti da cataloghi esterni (Kentu ITA / USDA / OFF)
 * nel trackerFoodDatabase personale al salvataggio pasto.
 */

import { findFoodDbMatchCascading } from '../features/salaComandi/engines/foodDataEngine';
import { buildPer100TargetNutrientsFromRow } from '../features/mealBuilder/utils/foodMacroUtils';
import { withDefaultUsageStats } from '../features/mealBuilder/utils/timeSlotUtils';
import { enrichDbRowWithFoodUnits } from '../foodUnits';
import { buildLearnedFoodEntryPer100 } from '../services/userFoodLearning';

function normalizeFoodDesc(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugFromName(name) {
  return String(name || '')
    .replace(/[.$#[\]/\\\s]/g, '_')
    .replace(/[^\w\-]/g, '_')
    .slice(0, 40);
}

function itemDisplayName(item) {
  return String(item?.foodName || item?.name || item?.desc || '').trim();
}

function itemPreferredKey(item) {
  const key = item?.foodDbKey ?? item?.matchedKey ?? item?.dbKey ?? null;
  return key != null ? String(key).trim() : '';
}

function itemGrams(item) {
  return Math.max(1, Math.round(Number(item?.grams ?? item?.qty ?? item?.weight) || 0));
}

function portionMacrosFromItem(item) {
  const kcal = Number(item?.kcal ?? item?.cal ?? item?.estKcal);
  const pro = Number(item?.pro ?? item?.prot ?? item?.estPro);
  const carbo = Number(item?.carbo ?? item?.carb ?? item?.estCar);
  const fat = Number(item?.fat ?? item?.fatTotal ?? item?.estFat);
  const hasKcal = Number.isFinite(kcal) && kcal > 0;
  if (!hasKcal) return null;
  return {
    kcal,
    pro: Number.isFinite(pro) ? pro : 0,
    carbo: Number.isFinite(carbo) ? carbo : 0,
    fat: Number.isFinite(fat) ? fat : 0,
  };
}

function findPersonalKeyByDesc(personalDb, name) {
  if (!personalDb || typeof personalDb !== 'object') return null;
  const needle = normalizeFoodDesc(name);
  if (!needle) return null;

  for (const [key, row] of Object.entries(personalDb)) {
    if (!row || typeof row !== 'object' || row.isRecipe === true) continue;
    const rowNorm = normalizeFoodDesc(row.desc ?? row.name ?? '');
    if (rowNorm && rowNorm === needle) return key;
  }
  return null;
}

function resolveForeignCatalogRow(preferredKey, name, catalogs) {
  const { kentuItDb = null, globalDb = null, offDb = null } = catalogs;

  if (preferredKey) {
    const layers = [
      { db: kentuItDb, source: 'kentu_it' },
      { db: globalDb, source: 'global' },
      { db: offDb, source: 'off' },
    ];
    for (let i = 0; i < layers.length; i += 1) {
      const layer = layers[i];
      const row = layer.db?.[preferredKey];
      if (row && typeof row === 'object') {
        return { row, source: layer.source, catalogKey: preferredKey };
      }
    }
  }

  const match = findFoodDbMatchCascading({
    personalDb: null,
    kentuItDb,
    globalDb,
    offDb,
    nome: name,
    preferredDbKey: preferredKey || null,
  });

  if (!match || match.source === 'personal') return null;
  const row = match.foodDb?.[match.key];
  if (!row || typeof row !== 'object') return null;
  return { row, source: match.source, catalogKey: match.key };
}

function catalogRowToPromotionEntry(row, name, source, catalogKey) {
  const desc = itemDisplayName({ name, desc: row?.desc, foodName: row?.name })
    || String(row?.desc || row?.name || '').trim();
  if (!desc) return null;

  const kcal = Number(row?.kcal ?? row?.cal) || 0;
  if (!Number.isFinite(kcal) || kcal <= 0) return null;

  const fatVal = Number(row?.fatTotal ?? row?.fat) || 0;
  const entry = {
    desc,
    name: desc,
    kcal,
    cal: kcal,
    prot: Number(row?.prot) || 0,
    carb: Number(row?.carb) || 0,
    fat: fatVal,
    fatTotal: fatVal,
    isRecipe: false,
    promotedFrom: String(source || 'catalog'),
    promotedCatalogKey: String(catalogKey || ''),
    learnedSource: 'meal_auto_promotion',
    userLearned: true,
  };

  if (row?.brand) entry.brand = String(row.brand).trim();
  if (row?.barcode) entry.barcode = String(row.barcode).trim();
  if (row?.iconTag) entry.iconTag = row.iconTag;
  if (row?.semanticTags && typeof row.semanticTags === 'object') {
    entry.semanticTags = { ...row.semanticTags };
  }

  const canonical = buildPer100TargetNutrientsFromRow(row);
  Object.assign(entry, canonical);
  if (entry.fatTotal == null && entry.fat != null) entry.fatTotal = Number(entry.fat);
  if (entry.fat == null && entry.fatTotal != null) entry.fat = Number(entry.fatTotal);

  return entry;
}

function finalizePromotionRow(entry, foodDbKey) {
  return enrichDbRowWithFoodUnits(withDefaultUsageStats({ ...entry, isRecipe: false }), foodDbKey);
}

function remapItemKeys(item, personalKey) {
  const key = String(personalKey || '').trim();
  if (!key) return item;
  return {
    ...item,
    foodDbKey: key,
    matchedKey: key,
    dbKey: key,
  };
}

/**
 * @param {object} item
 * @param {Record<string, object>} personalDb
 * @returns {boolean}
 */
export function mealItemNeedsPersonalPromotion(item, personalDb) {
  const name = itemDisplayName(item);
  if (!name) return false;

  const preferredKey = itemPreferredKey(item);
  if (preferredKey && personalDb?.[preferredKey]) return false;

  if (findPersonalKeyByDesc(personalDb, name)) return true;
  if (preferredKey && !personalDb?.[preferredKey]) return true;

  return !preferredKey;
}

/**
 * Promuove alimenti "stranieri" nel DB personale (ottimistico, sync in RAM).
 *
 * @param {object[]} items
 * @param {{
 *   personalDb?: Record<string, object>,
 *   kentuItDb?: Record<string, object>|null,
 *   globalDb?: Record<string, object>|null,
 *   offDb?: Record<string, object>|null,
 * }} ctx
 * @returns {{
 *   items: object[],
 *   localPatch: Record<string, object>,
 *   mergedPersonalDb: Record<string, object>,
 *   firebasePayload: Record<string, object>,
 *   promotedCount: number,
 * }}
 */
export function promoteForeignMealItemsForSave(items, ctx = {}) {
  const personalDb = ctx.personalDb && typeof ctx.personalDb === 'object' ? ctx.personalDb : {};
  const catalogs = {
    kentuItDb: ctx.kentuItDb || null,
    globalDb: ctx.globalDb || null,
    offDb: ctx.offDb || null,
  };

  const list = Array.isArray(items) ? items : [];
  const localPatch = {};
  const workingDb = { ...personalDb };
  let promotedCount = 0;
  const baseTs = Date.now();

  const promotedItems = list.map((item, index) => {
    if (!item || typeof item !== 'object') return item;

    const name = itemDisplayName(item);
    if (!name) return item;

    const preferredKey = itemPreferredKey(item);
    if (preferredKey && workingDb[preferredKey]) {
      return remapItemKeys(item, preferredKey);
    }

    const existingByName = findPersonalKeyByDesc(workingDb, name);
    if (existingByName) {
      return remapItemKeys(item, existingByName);
    }

    if (!mealItemNeedsPersonalPromotion(item, workingDb)) {
      return item;
    }

    const catalogHit = resolveForeignCatalogRow(preferredKey, name, catalogs);
    const grams = itemGrams(item);
    let entry = null;

    if (catalogHit?.row) {
      entry = catalogRowToPromotionEntry(
        catalogHit.row,
        name,
        catalogHit.source,
        catalogHit.catalogKey,
      );
    }

    if (!entry) {
      const portion = portionMacrosFromItem(item);
      if (portion) {
        entry = buildLearnedFoodEntryPer100({
          foodName: name,
          grams,
          kcal: portion.kcal,
          pro: portion.pro,
          carbo: portion.carbo,
          fat: portion.fat,
          source: 'meal_auto_promotion',
        });
      }
    }

    if (!entry?.desc) return item;

    const slug = slugFromName(name);
    const newKey = `food_${baseTs + index}_${slug}`;
    const payload = finalizePromotionRow(entry, newKey);

    localPatch[newKey] = payload;
    workingDb[newKey] = payload;
    promotedCount += 1;

    return remapItemKeys(item, newKey);
  });

  return {
    items: promotedItems,
    localPatch,
    mergedPersonalDb: workingDb,
    firebasePayload: localPatch,
    promotedCount,
  };
}
