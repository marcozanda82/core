import {
  KENTU_MASTER_DB_VERSION,
  LS_CATALOG_SERVING_OVERRIDES_KEY,
  LS_MASTER_DB_VERSION_KEY,
} from '../../../constants/foodDbVersion';
import {
  buildPer100TargetNutrientsFromRow,
  readCanonicalNutrient,
} from './foodMacroUtils';
import { USER_FOOD_OVERRIDES_KEY } from '../../../userFoodOverrides';

const ACCENT_REGEX = /[\u0300-\u036f]/g;

/** Minerali corretti nel master — priorità resync. */
export const MASTER_RESYNC_NUTRIENT_KEYS = ['mg', 'k', 'ca', 'fe', 'na', 'zn', 'p', 'cu'];

function normalizeLabel(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function pickMasterDbs(masterContext = {}) {
  const kentuItDb = masterContext.kentuItDb ?? masterContext.unifiedDb ?? {};
  const globalDb = masterContext.globalDb ?? masterContext.masterDb ?? masterContext.usdaDb ?? {};
  return { kentuItDb, globalDb };
}

/** Indice label normalizzata → row (costruito una volta per riferimento DB). */
const masterLabelIndexCache = new WeakMap();

function getMasterLabelIndex(db) {
  if (!db || typeof db !== 'object') return null;
  let index = masterLabelIndexCache.get(db);
  if (!index) {
    index = new Map();
    Object.values(db).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const norm = normalizeLabel(entry.desc || entry.name || entry.italianName);
      if (norm && !index.has(norm)) index.set(norm, entry);
    });
    masterLabelIndexCache.set(db, index);
  }
  return index;
}

function findMasterRowByLabel(labels, kentuItDb, globalDb) {
  for (const label of labels) {
    const norm = normalizeLabel(label);
    if (!norm) continue;
    for (const db of [kentuItDb, globalDb]) {
      const hit = getMasterLabelIndex(db)?.get(norm);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Invalida cache locale se il master è stato aggiornato.
 * @returns {boolean} true se la versione è cambiata e la cache è stata pulita
 */
export function ensureMasterDbVersion(
  currentVersion = KENTU_MASTER_DB_VERSION,
) {
  if (typeof localStorage === 'undefined') return false;
  try {
    const prev = localStorage.getItem(LS_MASTER_DB_VERSION_KEY);
    if (prev === currentVersion) return false;

    localStorage.setItem(LS_MASTER_DB_VERSION_KEY, currentVersion);
    localStorage.removeItem(USER_FOOD_OVERRIDES_KEY);
    localStorage.removeItem(LS_CATALOG_SERVING_OVERRIDES_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadCatalogServingOverrides() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const version = localStorage.getItem(LS_MASTER_DB_VERSION_KEY);
    if (version !== KENTU_MASTER_DB_VERSION) return {};
    const raw = localStorage.getItem(LS_CATALOG_SERVING_OVERRIDES_KEY);
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCatalogServingOverrides(overrides) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_MASTER_DB_VERSION_KEY, KENTU_MASTER_DB_VERSION);
    localStorage.setItem(
      LS_CATALOG_SERVING_OVERRIDES_KEY,
      JSON.stringify(overrides && typeof overrides === 'object' ? overrides : {}),
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearCatalogServingOverride(identityKey) {
  const key = String(identityKey || '').trim();
  if (!key) return;
  const prev = loadCatalogServingOverrides();
  if (!prev[key]) return;
  const next = { ...prev };
  delete next[key];
  saveCatalogServingOverrides(next);
}

/**
 * Trova la row ufficiale nel master (CREA IT → global).
 * @param {{ foodDbKey?: string, fdcId?: string, desc?: string, name?: string, row?: object }} item
 */
export function findMasterRowForFood(item, masterContext = {}) {
  const { kentuItDb, globalDb } = pickMasterDbs(masterContext);
  const row = item?.row && typeof item.row === 'object' ? item.row : {};
  const idCandidates = [
    item?.foodDbKey,
    item?.fdcId,
    row?.fdcId,
    row?.fdc_id,
    row?.id,
    row?.dedupKey,
    row?.creaCode,
    row?.foodDbKey,
  ]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);

  for (const id of idCandidates) {
    if (kentuItDb?.[id]) return kentuItDb[id];
    if (globalDb?.[id]) return globalDb[id];
  }

  const labels = [
    item?.desc,
    item?.name,
    row?.desc,
    row?.name,
    row?.italianName,
  ];
  return findMasterRowByLabel(labels, kentuItDb, globalDb);
}

/**
 * True se almeno un nutriente prioritario differisce tra personal e master (entrambi finiti).
 */
export function hasStaleNutrientsVsMaster(personalRow, masterRow, keys = MASTER_RESYNC_NUTRIENT_KEYS) {
  if (!personalRow || !masterRow) return false;
  return keys.some((key) => {
    const masterVal = readCanonicalNutrient(masterRow, key);
    const personalVal = readCanonicalNutrient(personalRow, key);
    if (masterVal == null) return false;
    if (personalVal == null) return false;
    return Math.abs(masterVal - personalVal) > 0.05;
  });
}

/**
 * Ricalcola nutrienti per 100g dal master; rimuove _manualOverride se stale.
 */
export function resyncRowNutrientsFromMaster(personalRow, masterRow, options = {}) {
  if (!masterRow || typeof masterRow !== 'object') return personalRow;
  const base = personalRow && typeof personalRow === 'object' ? { ...personalRow } : {};
  const nutrients = buildPer100TargetNutrientsFromRow(masterRow);

  const next = {
    ...base,
    ...nutrients,
    kcal: masterRow.kcal ?? masterRow.cal ?? base.kcal,
    cal: masterRow.cal ?? masterRow.kcal ?? base.cal,
    prot: masterRow.prot ?? base.prot,
    carb: masterRow.carb ?? base.carb,
    fat: masterRow.fatTotal ?? masterRow.fatTot ?? masterRow.fat ?? base.fat,
    fatTotal: masterRow.fatTotal ?? masterRow.fatTot ?? masterRow.fat ?? base.fatTotal,
  };

  if (masterRow.fdcId != null && base.fdcId == null) next.fdcId = masterRow.fdcId;

  const stale = hasStaleNutrientsVsMaster(base, masterRow, options.keys);
  const manual = base._manualOverride === true;

  if (stale || (manual && options.forceOnManual === true)) {
    delete next._manualOverride;
  }

  return next;
}

/**
 * Applica resync master su item catalog/draft se override stale o assente.
 */
export function applyMasterResyncToFoodItem(item, masterContext = {}) {
  if (!item || typeof item !== 'object') return item;
  const masterRow = findMasterRowForFood(item, masterContext);
  if (!masterRow) return item;

  const personalRow = item.row || item;
  const stale = hasStaleNutrientsVsMaster(personalRow, masterRow);
  const manual = item._manualOverride === true || personalRow._manualOverride === true;

  if (!stale && manual) return item;

  const syncedRow = resyncRowNutrientsFromMaster(personalRow, masterRow, {
    forceOnManual: !stale && manual ? false : true,
  });

  const next = {
    ...item,
    row: syncedRow,
  };

  if (!manual || stale) {
    delete next._manualOverride;
  }

  MASTER_RESYNC_NUTRIENT_KEYS.forEach((key) => {
    const v = readCanonicalNutrient(syncedRow, key);
    if (v != null) next[key] = v;
  });

  return next;
}

/**
 * Ripristino esplicito: solo master, niente override.
 */
export function restoreFoodItemFromMaster(item, masterContext = {}) {
  const masterRow = findMasterRowForFood(item, masterContext);
  if (!masterRow) return item;
  const syncedRow = resyncRowNutrientsFromMaster(item?.row || item, masterRow, {
    forceOnManual: true,
  });
  const next = {
    ...item,
    row: syncedRow,
  };
  delete next._manualOverride;
  return next;
}
