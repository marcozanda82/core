import { FOOD_DB_SOURCE } from './foodDbSource';
import { resolveIconTagId } from './features/mealBuilder/utils/FoodIcons';
import { enrichDbRowWithFoodUnits } from './foodUnits';
import { ensureMasterDbVersion } from './features/mealBuilder/utils/masterFoodResync';
import { KENTU_MASTER_DB_VERSION, USDA_DB_VERSION } from './constants/foodDbVersion';

const USDA_DB_FILENAME = 'kentu_smart_master_usda_FINAL.json';
const KENTU_IT_DB_URL = '/kentu_smart_master_db.json';
const GLOBAL_DB_URL = `/${USDA_DB_FILENAME}`;
/** Dump locale Open Food Facts (array di prodotti con barcode / kcal / macro). */
const OFF_DB_URL = '/kentu_off_master_db.json';

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (value == null) return 0;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Come toNumber ma restituisce null se assente/non numerico (no inventare 0). */
function pickFiniteOrNull(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized || normalized.toLowerCase() === 'tr') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** g sale / 100g → mg sodio (Na in NaCl). */
const SALT_G_TO_SODIUM_MG = 393.4;

function pickFirst(row, keys, fallback = '') {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && String(value).trim() !== '') {
      return value;
    }
  }
  return fallback;
}

function extractRecords(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];

  for (const key of ['foods', 'items', 'data', 'records', 'entries']) {
    if (Array.isArray(json[key])) return json[key];
  }

  const values = Object.values(json);
  if (values.length > 0 && values.every((value) => value && typeof value === 'object')) {
    return values;
  }

  return [];
}

function resolveItalianName(record) {
  return String(
    pickFirst(record, [
      'italianName',
      'name_it',
      'desc_it',
      'nome_it',
      'nome',
      'desc',
      'name',
      'food_name',
      'product_name',
      'description',
      'lowercaseDescription',
    ]),
  ).trim();
}

function resolveRecordKey(record, index) {
  const rawId = pickFirst(
    record,
    ['dedupKey', 'id', 'fdcId', 'fdc_id', 'creaCode', 'food_code', 'code'],
    '',
  );
  if (rawId) return String(rawId).trim();
  return `kentu_${index}`;
}

const SEMANTIC_TAG_KEYS = [
  'glycemicIndex',
  'novaGroup',
  'inflammation',
  'fodmap',
  'proteinQuality',
  'satiety',
  'timing',
  'allergens',
];

/**
 * Clona semanticTags dal JSON Smart DB (IG, NOVA, infiammazione, FODMAP, ecc.).
 * Non inventa chiavi: se il record non le ha, non le aggiunge.
 */
function preserveSemanticTags(record) {
  const tags = record?.semanticTags;
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return undefined;
  const next = {};
  SEMANTIC_TAG_KEYS.forEach((key) => {
    if (tags[key] === undefined) return;
    next[key] = key === 'allergens' && Array.isArray(tags[key])
      ? tags[key].slice()
      : tags[key];
  });
  Object.keys(tags).forEach((key) => {
    if (next[key] !== undefined) return;
    next[key] = tags[key];
  });
  return next;
}

/**
 * Normalizza alias di ricerca/visualizzazione senza rimuovere campi avanzati (micro, amminoacidi, ecc.).
 */
function normalizeRecordForDb(record, source) {
  const italianName = resolveItalianName(record);
  const englishName = String(
    pickFirst(record, ['name', 'description', 'name_en', 'englishName'], ''),
  ).trim();
  const rawIconTag = pickFirst(record, ['iconTag', 'icon_tag'], '');
  const resolvedIconTag = rawIconTag ? resolveIconTagId(rawIconTag) : null;
  const brand = String(pickFirst(record, ['brand', 'brands', 'marca'], '')).trim();
  const semanticTags = preserveSemanticTags(record);

  const normalized = {
    ...record,
    desc: italianName || englishName || String(record.desc || record.name || '').trim() || 'Alimento',
    name: italianName || englishName || String(record.name || record.desc || '').trim() || 'Alimento',
    ...(englishName && italianName && englishName !== italianName
      ? { nameEn: englishName }
      : {}),
    ...(resolvedIconTag ? { iconTag: resolvedIconTag } : {}),
    ...(brand ? { brand } : {}),
    ...(semanticTags ? { semanticTags } : {}),
    source,
    ...(source === FOOD_DB_SOURCE.OFF || record?._source === 'off'
      ? { _source: 'off' }
      : {}),
  };

  if (normalized.kcal == null) {
    normalized.kcal = toNumber(
      pickFirst(record, ['kcal', 'cal', 'calories', 'energy_kcal', 'energy', 'kcalPer100g']),
    );
  }
  if (normalized.cal == null && normalized.kcal != null) {
    normalized.cal = normalized.kcal;
  }
  if (normalized.prot == null) {
    normalized.prot = toNumber(pickFirst(record, ['prot', 'proteins', 'protein']));
  }
  if (normalized.carb == null) {
    normalized.carb = toNumber(
      pickFirst(record, ['carb', 'carbohydrates', 'available_carbohydrates', 'carbs']),
    );
  }

  const fatValue = toNumber(
    pickFirst(record, ['fatTot', 'fat', 'fats', 'fatTotal', 'lipids']),
  );
  if (normalized.fat == null || normalized.fat === 0) {
    normalized.fat = fatValue;
  }
  if (normalized.fatTotal == null || normalized.fatTotal === 0) {
    normalized.fatTotal = fatValue || normalized.fat;
  }
  if (normalized.fatTot == null && normalized.fatTotal != null) {
    normalized.fatTot = normalized.fatTotal;
  }

  const servingGrams = toNumber(
    pickFirst(record, ['servingSize', 'serving_size', 'defaultQty', 'portionGrams', 'defaultGrams']),
  );
  if (normalized.servingSize == null || normalized.servingSize === '') {
    normalized.servingSize = servingGrams > 0 ? servingGrams : 100;
  }
  if (servingGrams > 0 && normalized.defaultQty == null) {
    normalized.defaultQty = servingGrams;
  }

  applyCanonicalNutrientKeys(normalized, record);

  if (normalized.zuccheri == null) {
    normalized.zuccheri = toNumber(
      pickFirst(record, ['zuccheri', 'sugars', 'soluble_sugars', 'sugar']),
    );
  }
  if (normalized.k == null) {
    normalized.k = toNumber(pickFirst(record, ['k', 'potassium']));
  }
  if (!normalized.foodSource) {
    if (source === FOOD_DB_SOURCE.KENTU_IT) normalized.foodSource = 'CREA';
    else if (source === FOOD_DB_SOURCE.OFF) normalized.foodSource = 'OFF';
    else normalized.foodSource = 'KENTU';
  }

  return normalized;
}

/**
 * Allinea chiavi legacy USDA/CREA → canonico TARGETS (in memoria).
 */
function applyCanonicalNutrientKeys(normalized, record) {
  const vitB2 = pickFiniteOrNull(record.b2) ?? pickFiniteOrNull(record.vitB2);
  if (vitB2 != null) normalized.vitB2 = vitB2;

  const vitB6 = pickFiniteOrNull(record.b6) ?? pickFiniteOrNull(record.vitB6);
  if (vitB6 != null) normalized.vitB6 = vitB6;

  const fibre =
    pickFiniteOrNull(record.fibreTotali)
    ?? pickFiniteOrNull(record.fibre)
    ?? pickFiniteOrNull(record.fiber);
  if (fibre != null) normalized.fibre = fibre;

  let na = pickFiniteOrNull(record.na) ?? pickFiniteOrNull(record.sodium);
  if (na == null) {
    const saleG = pickFiniteOrNull(record.sale);
    if (saleG != null) {
      na = Math.round(saleG * SALT_G_TO_SODIUM_MG * 100) / 100;
    }
  }
  if (na != null) normalized.na = na;
}

/**
 * @param {object[]} records
 * @param {string} source
 * @param {{ enrichUnits?: boolean }} [options]
 *   OFF: niente enrichUnits a index-time (213k× buildFoodUnits congela il main thread).
 *   Enrich on-demand in barcode/selezione (già previsto).
 */
function indexRecords(records, source, { enrichUnits = true } = {}) {
  const db = {};

  records.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;

    // OFF: solo prodotti con kcal reali (no null/0/undefined) — evita AI e UI a 0 kcal.
    if (source === FOOD_DB_SOURCE.OFF && !hasUsableOffKcal(raw)) return;

    const key = resolveRecordKey(raw, index);
    if (db[key]) return;

    const row = normalizeRecordForDb(raw, source);
    if (source === FOOD_DB_SOURCE.OFF && !hasUsableOffKcal(row)) return;

    db[key] = enrichUnits ? enrichDbRowWithFoodUnits(row, key) : row;
  });

  return db;
}

/**
 * Index a chunked per non bloccare input durante OFF in background.
 * @param {object[]} records
 * @param {string} source
 * @param {{ enrichUnits?: boolean, chunkSize?: number }} [options]
 */
async function indexRecordsChunked(records, source, { enrichUnits = true, chunkSize = 2500 } = {}) {
  const db = {};
  const list = Array.isArray(records) ? records : [];
  const size = Math.max(200, Number(chunkSize) || 2500);

  for (let start = 0; start < list.length; start += size) {
    const end = Math.min(start + size, list.length);
    for (let index = start; index < end; index += 1) {
      const raw = list[index];
      if (!raw || typeof raw !== 'object') continue;
      if (source === FOOD_DB_SOURCE.OFF && !hasUsableOffKcal(raw)) continue;
      const key = resolveRecordKey(raw, index);
      if (db[key]) continue;
      const row = normalizeRecordForDb(raw, source);
      if (source === FOOD_DB_SOURCE.OFF && !hasUsableOffKcal(row)) continue;
      db[key] = enrichUnits ? enrichDbRowWithFoodUnits(row, key) : row;
    }
    if (end < list.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return db;
}

function emptyCatalogs() {
  return {
    kentuItDb: {},
    globalDb: {},
    masterDb: {},
    offDb: {},
    unifiedDb: {},
    usdaDb: {},
  };
}

function foodDbPerfMark(name, detail = undefined) {
  if (!import.meta.env.DEV || typeof performance === 'undefined') return;
  try {
    performance.mark(name);
    if (detail != null) {
      // eslint-disable-next-line no-console
      console.info(`[FoodDBPerf] ${name}`, detail);
    }
  } catch {
    /* ignore */
  }
}

/** Kcal utilizzabili (> 0) per record OFF grezzo o normalizzato. */
export function hasUsableOffKcal(record) {
  if (!record || typeof record !== 'object') return false;
  const raw = record.kcal ?? record.cal ?? record.calories ?? record.energy_kcal ?? record.energy ?? record.kcalPer100g;
  if (raw == null || raw === '') return false;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0;
}

function withDbCacheBust(url, version) {
  const cacheVersion = version || KENTU_MASTER_DB_VERSION;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(cacheVersion)}`;
}

async function fetchKentuJson(url, { cacheBust = false, version } = {}) {
  const fetchUrl = cacheBust ? withDbCacheBust(url, version) : url;
  const res = await fetch(fetchUrl);
  if (!res.ok) {
    throw new Error(`Failed to load ${fetchUrl}: ${res.status}`);
  }
  return res.json();
}

/**
 * Carica i pilastri del database KentuOS:
 * - Kentu DB IT (CREA unificato): `/kentu_smart_master_db.json`
 * - Kentu DB USDA arricchito: `/kentu_smart_master_usda_FINAL.json`
 * - Open Food Facts locale: `/kentu_off_master_db.json` (graceful se assente)
 *
 * @returns {Promise<{
 *   kentuItDb: Record<string, object>,
 *   globalDb: Record<string, object>,
 *   masterDb: Record<string, object>,
 *   offDb: Record<string, object>,
 *   unifiedDb: Record<string, object>,
 *   usdaDb: Record<string, object>,
 * }>}
 */
/** Promise core (CREA+USDA) — sblocca primo alimento. */
let kentuCorePromise = null;
/** Promise OFF in background (non blocca loadKentuDatabases). */
let kentuOffPromise = null;
/** Snapshot più recente (core e/o OFF). */
let kentuDatabasesSnapshot = null;
/** @type {Set<(snap: object) => void>} */
const kentuDatabasesListeners = new Set();

function emitKentuDatabasesSnapshot(snapshot) {
  kentuDatabasesSnapshot = snapshot;
  kentuDatabasesListeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (err) {
      console.warn('[foodLoader] listener error', err);
    }
  });
}

/**
 * Aggiornamenti progressivi (core → +OFF). useFoodDb si iscrive per non attendere OFF.
 * @param {(snap: object) => void} fn
 * @returns {() => void}
 */
export function subscribeKentuDatabases(fn) {
  if (typeof fn !== 'function') return () => {};
  kentuDatabasesListeners.add(fn);
  if (kentuDatabasesSnapshot) {
    try {
      fn(kentuDatabasesSnapshot);
    } catch {
      /* ignore */
    }
  }
  return () => {
    kentuDatabasesListeners.delete(fn);
  };
}

export function peekKentuDatabasesSnapshot() {
  return kentuDatabasesSnapshot;
}

async function loadOffDatabaseBackground(coreSnapshot) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  foodDbPerfMark('fooddb-off-fetch-start');
  const offJson = await fetchKentuJson(OFF_DB_URL).catch((error) => {
    console.warn('[foodLoader] Open Food Facts DB unavailable — using empty offDb', error);
    return null;
  });
  foodDbPerfMark('fooddb-off-fetch-done', {
    ms: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : null,
    bytesApprox: offJson == null ? 0 : null,
  });

  if (offJson == null) {
    const next = { ...coreSnapshot, offDb: {} };
    emitKentuDatabasesSnapshot(next);
    return next;
  }

  const offRecords = extractRecords(offJson);
  foodDbPerfMark('fooddb-off-index-start', { records: offRecords.length });
  const tIndex = typeof performance !== 'undefined' ? performance.now() : 0;
  // Nessun enrichUnits: 200k× porzioni congelerebbe l’UI. Enrich in selezione/barcode.
  const offDb = await indexRecordsChunked(offRecords, FOOD_DB_SOURCE.OFF, {
    enrichUnits: false,
    chunkSize: 2500,
  });
  foodDbPerfMark('fooddb-off-index-done', {
    ms: typeof performance !== 'undefined' ? Math.round(performance.now() - tIndex) : null,
    keys: Object.keys(offDb).length,
  });

  const next = {
    ...coreSnapshot,
    offDb,
  };
  emitKentuDatabasesSnapshot(next);
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info('[foodLoader] OFF ready (background)', {
      off: Object.keys(offDb).length,
      totalMs: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : null,
    });
  }
  return next;
}

async function loadKentuCoreDatabasesUncached() {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  foodDbPerfMark('fooddb-core-start');
  ensureMasterDbVersion();

  try {
    // Critico: NON attendere OFF (≈35MB / ~200k record) prima del primo alimento.
    const [kentuItJson, globalJson] = await Promise.all([
      fetchKentuJson(KENTU_IT_DB_URL).catch((error) => {
        console.warn('[foodLoader] Kentu DB IT unavailable', error);
        return null;
      }),
      fetchKentuJson(GLOBAL_DB_URL, { cacheBust: true, version: USDA_DB_VERSION }).catch((error) => {
        console.warn('[foodLoader] Kentu DB global unavailable', error);
        return null;
      }),
    ]);
    foodDbPerfMark('fooddb-core-fetched', {
      ms: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : null,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const kentuItRecords = kentuItJson != null ? extractRecords(kentuItJson) : [];
    const globalRecords = globalJson != null ? extractRecords(globalJson) : [];

    console.time('[perf] foodLoader:indexKentuIt');
    const kentuItDb = indexRecords(kentuItRecords, FOOD_DB_SOURCE.KENTU_IT);
    console.timeEnd('[perf] foodLoader:indexKentuIt');

    await new Promise((resolve) => setTimeout(resolve, 0));

    console.time('[perf] foodLoader:indexGlobal');
    const globalDbRaw = indexRecords(globalRecords, FOOD_DB_SOURCE.GLOBAL);
    console.timeEnd('[perf] foodLoader:indexGlobal');

    const globalDb = { ...globalDbRaw };
    Object.keys(kentuItDb).forEach((key) => {
      delete globalDb[key];
    });

    const core = {
      kentuItDb,
      globalDb,
      masterDb: globalDb,
      offDb: {},
      unifiedDb: kentuItDb,
      usdaDb: globalDb,
      coreReady: true,
      offReady: false,
    };
    emitKentuDatabasesSnapshot(core);
    foodDbPerfMark('fooddb-core-ready', {
      ms: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : null,
      kentuIt: Object.keys(kentuItDb).length,
      global: Object.keys(globalDb).length,
    });

    console.log('[foodLoader] core catalogs ready (OFF in background)', {
      kentuIt: Object.keys(kentuItDb).length,
      global: Object.keys(globalDb).length,
      coreMs: typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : null,
    });

    if (!kentuOffPromise) {
      kentuOffPromise = loadOffDatabaseBackground(core).catch((error) => {
        console.warn('[foodLoader] OFF background failed', error);
        kentuOffPromise = null;
        return { ...core, offDb: {}, offReady: false };
      });
    }

    return core;
  } catch (error) {
    console.error('[foodLoader] failed to load Kentu core databases', error);
    const empty = emptyCatalogs();
    emitKentuDatabasesSnapshot(empty);
    return empty;
  }
}

/**
 * Risolve quando CREA+USDA sono pronti (primo alimento / ricerca tipica).
 * OFF prosegue in background; usare subscribeKentuDatabases o whenKentuOffReady.
 */
export function loadKentuDatabases() {
  if (!kentuCorePromise) {
    kentuCorePromise = loadKentuCoreDatabasesUncached().catch((error) => {
      kentuCorePromise = null;
      throw error;
    });
  }
  return kentuCorePromise;
}

/** Attende OFF (barcode / ricerca mega completa). Idempotente. */
export function whenKentuOffReady() {
  return loadKentuDatabases().then(() => {
    if (kentuOffPromise) return kentuOffPromise;
    return kentuDatabasesSnapshot || emptyCatalogs();
  });
}

/** Solo test: reset singleton cache. */
export function __resetKentuDatabasesForTests() {
  kentuCorePromise = null;
  kentuOffPromise = null;
  kentuDatabasesSnapshot = null;
  kentuDatabasesListeners.clear();
}
