/**
 * Bonifica client-side di `trackerFoodDatabase` (Firebase Realtime Database).
 *
 * Strategie:
 * 1) Re-sync: match con master/CREA → nutrienti TARGETS dalla row ufficiale
 * 2) Sterilizza: niente match → rimuove vit/min/omega/amino inventati; tiene solo macro base
 *
 * Uso (DEV):
 *   await window.__KENTU_SANITIZE_FOOD_DB__({ dryRun: true })
 *   await window.__KENTU_SANITIZE_FOOD_DB__()
 */

import { get, ref, update } from 'firebase/database';
import { db as defaultDb } from '../../firebaseConfig';
import { TARGETS } from '../../useBiochimico';
import { buildPer100TargetNutrientsFromRow } from '../mealBuilder/utils/foodMacroUtils';
import { enrichCustomFoodsWithTags } from '../food/utils/semanticTagsMigration';

const ACCENT_REGEX = /[\u0300-\u036f]/g;
const UPDATE_CHUNK_SIZE = 40;

/** Macro / elettroliti preservati in sterilizzazione (mai inventati come “micro finti”). */
const PRESERVE_NUTRIENT_KEYS = new Set([
  'kcal',
  'cal',
  'prot',
  'carb',
  'fat',
  'fatTotal',
  'fatTot',
  'fibre',
  'fibreTotali',
  'fiber',
  'na',
  'sale',
  'sodium',
  'zuccheri',
  'sugars',
  'sugar',
]);

/** Chiavi nutriente da rimuovere (o riscrivere) oltre agli alias legacy. */
const STRIP_NUTRIENT_KEYS = new Set([
  ...Object.keys(TARGETS.amino || {}),
  ...Object.keys(TARGETS.vit || {}),
  ...Object.keys(TARGETS.min || {}).filter((k) => k !== 'na'),
  ...Object.keys(TARGETS.fat || {}),
  'b2',
  'b6',
  'fibreSolubili',
  'fibreInsolubili',
  'leucina',
  'isoleucina',
  'valina',
]);

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeFoodLabel(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(ACCENT_REGEX, '')
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * @param {Record<string, unknown> | null | undefined} entry
 * @returns {string}
 */
function entryPrimaryLabel(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(entry.desc || entry.name || entry.italianName || '').trim();
}

/**
 * Indici per match master: id, barcode, nome normalizzato.
 * @param {...Record<string, object> | null | undefined} dbsInPriorityOrder — primo DB = priorità match nome
 */
function buildMasterIndexes(...dbsInPriorityOrder) {
  /** @type {Map<string, { key: string, row: object }>} */
  const byId = new Map();
  /** @type {Map<string, { key: string, row: object }>} */
  const byBarcode = new Map();
  /** @type {Map<string, { key: string, row: object }>} */
  const byName = new Map();

  dbsInPriorityOrder.forEach((masterDb) => {
    if (!masterDb || typeof masterDb !== 'object') return;

    Object.entries(masterDb).forEach(([key, row]) => {
      if (!row || typeof row !== 'object') return;
      const hit = { key, row };

      byId.set(String(key), hit);
      const fdcId = row.fdcId ?? row.id ?? row.dedupKey ?? row.creaCode;
      if (fdcId != null && String(fdcId).trim() !== '') {
        byId.set(String(fdcId).trim(), hit);
      }

      const barcode = row.barcode ?? row.code;
      if (barcode != null && String(barcode).trim() !== '') {
        byBarcode.set(String(barcode).trim(), hit);
      }

      const labels = [
        row.desc,
        row.name,
        row.italianName,
        row.nameEn,
        row.description,
      ];
      labels.forEach((label) => {
        const norm = normalizeFoodLabel(label);
        if (!norm) return;
        if (!byName.has(norm)) byName.set(norm, hit);
      });
    });
  });

  return { byId, byBarcode, byName };
}

/**
 * @param {string} personalKey
 * @param {Record<string, unknown>} entry
 * @param {{ byId: Map, byBarcode: Map, byName: Map }} indexes
 * @returns {{ key: string, row: object } | null}
 */
function findMasterMatch(personalKey, entry, indexes) {
  if (!entry || typeof entry !== 'object') return null;

  const idCandidates = [
    entry.fdcId,
    entry.id,
    entry.masterId,
    entry.sourceId,
    entry.dedupKey,
    entry.creaCode,
    personalKey,
  ];
  for (let i = 0; i < idCandidates.length; i += 1) {
    const id = idCandidates[i];
    if (id == null || String(id).trim() === '') continue;
    const hit = indexes.byId.get(String(id).trim());
    if (hit) return hit;
  }

  const barcode = entry.barcode ?? entry.code;
  if (barcode != null && String(barcode).trim() !== '') {
    const hit = indexes.byBarcode.get(String(barcode).trim());
    if (hit) return hit;
  }

  const nameHit = indexes.byName.get(normalizeFoodLabel(entryPrimaryLabel(entry)));
  if (nameHit) return nameHit;

  return null;
}

const ALL_TARGET_NUTRIENT_KEYS = new Set(
  Object.values(TARGETS).flatMap((group) => Object.keys(group || {})),
);

/** Alias legacy nutriente — non preservare come meta. */
const LEGACY_NUTRIENT_ALIASES = new Set([
  'b2',
  'b6',
  'fibreTotali',
  'fiber',
  'sale',
  'sodium',
  'sugars',
  'sugar',
  'fatTot',
  'cal',
]);

/**
 * Meta personali da preservare (usage, immagini, unità, …).
 * @param {Record<string, unknown>} entry
 */
function pickPreservedMeta(entry) {
  const out = {};
  Object.keys(entry || {}).forEach((key) => {
    if (ALL_TARGET_NUTRIENT_KEYS.has(key)) return;
    if (STRIP_NUTRIENT_KEYS.has(key)) return;
    if (LEGACY_NUTRIENT_ALIASES.has(key)) return;
    out[key] = entry[key];
  });
  return out;
}

/**
 * @param {Record<string, unknown>} entry
 * @returns {Record<string, unknown>}
 */
function buildSterilizedEntry(entry) {
  const next = { ...pickPreservedMeta(entry) };

  PRESERVE_NUTRIENT_KEYS.forEach((key) => {
    if (entry[key] != null) next[key] = entry[key];
  });

  if (next.fatTotal == null && next.fat != null) next.fatTotal = next.fat;
  if (next.fat == null && next.fatTotal != null) next.fat = next.fatTotal;
  if (next.cal == null && next.kcal != null) next.cal = next.kcal;
  if (next.kcal == null && next.cal != null) next.kcal = next.cal;
  if (next.fibre == null && next.fibreTotali != null) next.fibre = next.fibreTotali;

  // Chiavi strip esplicitamente assenti (set con replace totale del nodo).
  STRIP_NUTRIENT_KEYS.forEach((key) => {
    delete next[key];
  });

  return next;
}

/**
 * @param {Record<string, unknown>} entry
 * @param {object} masterRow
 * @returns {Record<string, unknown>}
 */
function buildResyncedEntry(entry, masterRow) {
  const meta = pickPreservedMeta(entry);
  const nutrients = buildPer100TargetNutrientsFromRow(masterRow);

  const kcal = Number(masterRow.kcal ?? masterRow.cal);
  const prot = Number(masterRow.prot);
  const carb = Number(masterRow.carb);
  const fat = Number(masterRow.fatTotal ?? masterRow.fatTot ?? masterRow.fat);

  const next = {
    ...meta,
    desc: String(meta.desc || masterRow.desc || masterRow.name || entry.desc || '').trim() || 'Alimento',
    ...nutrients,
  };

  if (Number.isFinite(kcal)) {
    next.kcal = kcal;
    next.cal = kcal;
  }
  if (Number.isFinite(prot)) next.prot = prot;
  if (Number.isFinite(carb)) next.carb = carb;
  if (Number.isFinite(fat)) {
    next.fat = fat;
    next.fatTotal = fat;
  }

  if (masterRow.fdcId != null) next.fdcId = masterRow.fdcId;
  if (masterRow.barcode != null && next.barcode == null) next.barcode = masterRow.barcode;
  if (masterRow.source != null && next.source == null) next.source = masterRow.source;
  if (masterRow.foodSource != null && next.foodSource == null) {
    next.foodSource = masterRow.foodSource;
  }

  next._sanitizedAt = new Date().toISOString();
  next._sanitizeAction = 'resync';

  STRIP_NUTRIENT_KEYS.forEach((key) => {
    if (next[key] == null) delete next[key];
  });

  return next;
}

/**
 * @param {import('firebase/database').Database} database
 * @param {string} basePath
 * @param {Record<string, Record<string, unknown>>} patchByKey
 */
async function applyChunkedUpdates(database, basePath, patchByKey) {
  const keys = Object.keys(patchByKey);
  for (let i = 0; i < keys.length; i += UPDATE_CHUNK_SIZE) {
    const slice = keys.slice(i, i + UPDATE_CHUNK_SIZE);
    /** @type {Record<string, unknown>} */
    const multiPath = {};
    slice.forEach((foodKey) => {
      multiPath[`${basePath}/${foodKey}`] = patchByKey[foodKey];
    });
    await update(ref(database), multiPath);
    console.log(
      `[sanitizeHistoricalFoodDb] chunk scritto ${Math.min(i + UPDATE_CHUNK_SIZE, keys.length)}/${keys.length}`,
    );
  }
}

/**
 * @param {string} userId
 * @param {Record<string, object> | null | undefined} masterDb
 * @param {{
 *   db?: import('firebase/database').Database,
 *   dryRun?: boolean,
 *   personalFoodDb?: Record<string, object> | null,
 *   masterIndexes?: { byId: Map, byBarcode: Map, byName: Map },
 * }} [options]
 */
export async function sanitizeHistoricalFoodDb(userId, masterDb, options = {}) {
  const uid = String(userId || '').trim();
  if (!uid) {
    throw new Error('sanitizeHistoricalFoodDb: userId mancante');
  }

  const database = options.db || defaultDb;
  const dryRun = options.dryRun === true;
  const basePath = `users/${uid}/tracker_data/trackerFoodDatabase`;

  let personalDb = options.personalFoodDb;
  if (!personalDb || typeof personalDb !== 'object') {
    const snap = await get(ref(database, basePath));
    personalDb = snap.exists() ? snap.val() : {};
  }

  const entries = Object.entries(personalDb || {}).filter(
    ([, row]) => row && typeof row === 'object',
  );

  const indexes = options.masterIndexes || buildMasterIndexes(masterDb);

  /** @type {Record<string, Record<string, unknown>>} */
  const patchByKey = {};
  /** @type {Record<string, object>} */
  const nextFoodDb = { ...(personalDb || {}) };

  let resynced = 0;
  let sterilized = 0;
  let recipesSterilized = 0;

  const resyncSamples = [];
  const sterilizeSamples = [];

  for (let i = 0; i < entries.length; i += 1) {
    const [key, entry] = entries[i];

    // Ricette custom: sterilizza solo i micro aggregati, non toccare ingredients.
    if (entry.isRecipe === true || entry.type === 'recipe') {
      const sterilizedRecipe = buildSterilizedEntry(entry);
      sterilizedRecipe._sanitizedAt = new Date().toISOString();
      sterilizedRecipe._sanitizeAction = 'sterilize_recipe';
      if (Array.isArray(entry.ingredients)) {
        sterilizedRecipe.ingredients = entry.ingredients;
      }
      sterilizedRecipe.isRecipe = true;
      patchByKey[key] = sterilizedRecipe;
      nextFoodDb[key] = sterilizedRecipe;
      sterilized += 1;
      recipesSterilized += 1;
      if (sterilizeSamples.length < 5) {
        sterilizeSamples.push({ key, desc: entryPrimaryLabel(entry), reason: 'recipe' });
      }
      continue;
    }

    const match = findMasterMatch(key, entry, indexes);
    if (match) {
      const resyncedEntry = buildResyncedEntry(entry, match.row);
      resyncedEntry._masterKey = match.key;
      patchByKey[key] = resyncedEntry;
      nextFoodDb[key] = resyncedEntry;
      resynced += 1;
      if (resyncSamples.length < 8) {
        resyncSamples.push({
          key,
          desc: entryPrimaryLabel(entry),
          masterKey: match.key,
          masterDesc: entryPrimaryLabel(match.row),
          mg: resyncedEntry.mg ?? null,
          omega3: resyncedEntry.omega3 ?? null,
          vitB2: resyncedEntry.vitB2 ?? null,
        });
      }
      continue;
    }

    const sterilizedEntry = buildSterilizedEntry(entry);
    sterilizedEntry._sanitizedAt = new Date().toISOString();
    sterilizedEntry._sanitizeAction = 'sterilize';
    patchByKey[key] = sterilizedEntry;
    nextFoodDb[key] = sterilizedEntry;
    sterilized += 1;
    if (sterilizeSamples.length < 8) {
      sterilizeSamples.push({ key, desc: entryPrimaryLabel(entry), reason: 'no_master_match' });
    }
  }

  const { foods: taggedFoodDb, stats: tagStats } = enrichCustomFoodsWithTags(nextFoodDb, masterDb);
  nextFoodDb = taggedFoodDb;
  Object.keys(nextFoodDb).forEach((key) => {
    patchByKey[key] = nextFoodDb[key];
  });

  console.log('[sanitizeHistoricalFoodDb] semanticTags', tagStats);

  console.log('[sanitizeHistoricalFoodDb] riepilogo', {
    dryRun,
    total: entries.length,
    resynced,
    sterilized,
    recipesSterilized,
    masterIndexSize: {
      ids: indexes.byId.size,
      barcodes: indexes.byBarcode.size,
      names: indexes.byName.size,
    },
  });
  console.log('[sanitizeHistoricalFoodDb] sample re-sync', resyncSamples);
  console.log('[sanitizeHistoricalFoodDb] sample sterilize', sterilizeSamples);

  if (!dryRun && Object.keys(patchByKey).length > 0) {
    await applyChunkedUpdates(database, basePath, patchByKey);
    console.log('[sanitizeHistoricalFoodDb] Firebase aggiornato.');
  } else if (dryRun) {
    console.log('[sanitizeHistoricalFoodDb] dryRun: nessun write su Firebase.');
  }

  return {
    dryRun,
    total: entries.length,
    resynced,
    sterilized,
    recipesSterilized,
    tagStats,
    nextFoodDb,
    resyncSamples,
    sterilizeSamples,
  };
}

/**
 * Carica i DB Kentu e lancia la bonifica.
 * @param {string} userId
 * @param {{ dryRun?: boolean, db?: import('firebase/database').Database }} [options]
 */
export async function runSanitizeHistoricalFoodDbWithKentuCatalogs(userId, options = {}) {
  const { loadKentuDatabases } = await import('../../foodLoader.js');
  const catalogs = await loadKentuDatabases();
  const kentuItDb = catalogs.kentuItDb || {};
  const globalDb = catalogs.globalDb || {};
  const masterDb = { ...globalDb, ...kentuItDb };
  const masterIndexes = buildMasterIndexes(kentuItDb, globalDb);
  return sanitizeHistoricalFoodDb(userId, masterDb, { ...options, masterIndexes });
}

export const SANITIZE_FOOD_DB_STRIP_KEYS = [...STRIP_NUTRIENT_KEYS];
export const SANITIZE_FOOD_DB_PRESERVE_KEYS = [...PRESERVE_NUTRIENT_KEYS];
