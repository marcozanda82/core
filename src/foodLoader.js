import { FOOD_DB_SOURCE } from './foodDbSource';
import { resolveIconTagId } from './features/mealBuilder/utils/FoodIcons';
import { enrichDbRowWithFoodUnits } from './foodUnits';

const KENTU_IT_DB_URL = '/crea_gold_standard.json';
const GLOBAL_DB_URL = '/kentu_master_db.json';
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
  const rawId = pickFirst(record, ['dedupKey', 'id', 'fdcId', 'creaCode', 'food_code', 'code'], '');
  if (rawId) return String(rawId).trim();
  return `kentu_${index}`;
}

/**
 * Normalizza alias di ricerca/visualizzazione senza rimuovere campi avanzati (micro, amminoacidi, ecc.).
 */
function normalizeRecordForDb(record, source) {
  const italianName = resolveItalianName(record);
  const englishName = String(pickFirst(record, ['name', 'description'], '')).trim();
  const rawIconTag = pickFirst(record, ['iconTag', 'icon_tag'], '');
  const resolvedIconTag = rawIconTag ? resolveIconTagId(rawIconTag) : null;
  const brand = String(pickFirst(record, ['brand', 'brands', 'marca'], '')).trim();

  const normalized = {
    ...record,
    desc: italianName || englishName || String(record.desc || record.name || '').trim() || 'Alimento',
    name: italianName || englishName || String(record.name || record.desc || '').trim() || 'Alimento',
    ...(englishName && italianName && englishName !== italianName
      ? { nameEn: englishName }
      : {}),
    ...(resolvedIconTag ? { iconTag: resolvedIconTag } : {}),
    ...(brand ? { brand } : {}),
    source,
    ...(source === FOOD_DB_SOURCE.OFF || record?._source === 'off'
      ? { _source: 'off' }
      : {}),
  };

  if (normalized.kcal == null) {
    normalized.kcal = toNumber(
      pickFirst(record, ['kcal', 'cal', 'energy_kcal', 'energy', 'kcalPer100g']),
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

function indexRecords(records, source) {
  const db = {};

  records.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;

    // OFF: solo prodotti con kcal reali (no null/0/undefined) — evita AI e UI a 0 kcal.
    if (source === FOOD_DB_SOURCE.OFF && !hasUsableOffKcal(raw)) return;

    const key = resolveRecordKey(raw, index);
    if (db[key]) return;

    const row = normalizeRecordForDb(raw, source);
    if (source === FOOD_DB_SOURCE.OFF && !hasUsableOffKcal(row)) return;

    db[key] = enrichDbRowWithFoodUnits(row, key);
  });

  return db;
}

/** Kcal utilizzabili (> 0) per record OFF grezzo o normalizzato. */
export function hasUsableOffKcal(record) {
  if (!record || typeof record !== 'object') return false;
  const raw = record.kcal ?? record.cal ?? record.energy_kcal ?? record.energy ?? record.kcalPer100g;
  if (raw == null || raw === '') return false;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0;
}

/**
 * Index OFF a chunk: yield periodici per non congelare il main thread.
 * @param {object[]} records
 * @returns {Promise<Record<string, object>>}
 */
async function indexOffRecordsAsync(records) {
  const db = {};
  const list = Array.isArray(records) ? records : [];
  const CHUNK = 4000;

  for (let i = 0; i < list.length; i += 1) {
    if (i > 0 && i % CHUNK === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const raw = list[i];
    if (!raw || typeof raw !== 'object') continue;
    if (!hasUsableOffKcal(raw)) continue;

    const key = resolveRecordKey(raw, i);
    if (db[key]) continue;

    const row = normalizeRecordForDb(raw, FOOD_DB_SOURCE.OFF);
    if (!hasUsableOffKcal(row)) continue;

    db[key] = enrichDbRowWithFoodUnits(row, key);
  }

  return db;
}

async function fetchKentuJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }
  return res.json();
}

/**
 * Carica i pilastri del database KentuOS:
 * - Kentu DB IT (CREA): `/crea_gold_standard.json`
 * - Kentu DB 🌐: `/kentu_master_db.json`
 * - Open Food Facts: `/kentu_off_master_db.json` (graceful se assente)
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
let kentuDatabasesPromise = null;

async function loadKentuDatabasesUncached() {
  const empty = {
    kentuItDb: {},
    globalDb: {},
    masterDb: {},
    offDb: {},
    unifiedDb: {},
    usdaDb: {},
  };

  try {
    const [kentuItJson, globalJson, offJson] = await Promise.all([
      fetchKentuJson(KENTU_IT_DB_URL).catch((error) => {
        console.warn('[foodLoader] Kentu DB IT unavailable', error);
        return null;
      }),
      fetchKentuJson(GLOBAL_DB_URL).catch((error) => {
        console.warn('[foodLoader] Kentu DB global unavailable', error);
        return null;
      }),
      fetchKentuJson(OFF_DB_URL).catch((error) => {
        console.warn('[foodLoader] Open Food Facts DB unavailable — using empty offDb', error);
        return null;
      }),
    ]);

    // Yield so first paint / dashboard interactions aren't blocked by index work.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const kentuItRecords = kentuItJson != null ? extractRecords(kentuItJson) : [];
    const globalRecords = globalJson != null ? extractRecords(globalJson) : [];
    const offRecords = offJson != null ? extractRecords(offJson) : [];

    const kentuItDb = indexRecords(kentuItRecords, FOOD_DB_SOURCE.KENTU_IT);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const globalDbRaw = indexRecords(globalRecords, FOOD_DB_SOURCE.GLOBAL);

    const globalDb = { ...globalDbRaw };
    Object.keys(kentuItDb).forEach((key) => {
      delete globalDb[key];
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const offDb = offJson != null
      ? await indexOffRecordsAsync(offRecords)
      : {};

    console.log('[foodLoader] loaded Kentu databases', {
      kentuIt: Object.keys(kentuItDb).length,
      global: Object.keys(globalDb).length,
      off: Object.keys(offDb).length,
      offSkippedNoKcal: offRecords.length - Object.keys(offDb).length,
    });

    return {
      kentuItDb,
      globalDb,
      masterDb: globalDb,
      offDb,
      // Alias Fase 4 / legacy naming
      unifiedDb: kentuItDb,
      usdaDb: globalDb,
    };
  } catch (error) {
    console.error('[foodLoader] failed to load Kentu databases', error);
    return empty;
  }
}

export function loadKentuDatabases() {
  if (!kentuDatabasesPromise) {
    kentuDatabasesPromise = loadKentuDatabasesUncached().catch((error) => {
      kentuDatabasesPromise = null;
      throw error;
    });
  }
  return kentuDatabasesPromise;
}
