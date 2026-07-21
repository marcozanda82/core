import { FOOD_DB_SOURCE } from './foodDbSource';
import { resolveIconTagId } from './features/mealBuilder/utils/FoodIcons';
import { enrichDbRowWithFoodUnits } from './foodUnits';

const KENTU_IT_DB_URL = '/crea_gold_standard.json';
const GLOBAL_DB_URL = '/kentu_master_db.json';

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

  const normalized = {
    ...record,
    desc: italianName || englishName || String(record.desc || record.name || '').trim() || 'Alimento',
    name: italianName || englishName || String(record.name || record.desc || '').trim() || 'Alimento',
    ...(englishName && italianName && englishName !== italianName
      ? { nameEn: englishName }
      : {}),
    ...(resolvedIconTag ? { iconTag: resolvedIconTag } : {}),
    source,
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
    pickFirst(record, ['fatTot', 'fat', 'fatTotal', 'lipids']),
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

  if (normalized.fibre == null && normalized.fibreTotali != null) {
    normalized.fibre = toNumber(normalized.fibreTotali);
  }
  if (normalized.zuccheri == null) {
    normalized.zuccheri = toNumber(
      pickFirst(record, ['zuccheri', 'sugars', 'soluble_sugars', 'sugar']),
    );
  }
  if (normalized.na == null) {
    normalized.na = toNumber(pickFirst(record, ['na', 'sodium', 'sale']));
  }
  if (normalized.k == null) {
    normalized.k = toNumber(pickFirst(record, ['k', 'potassium']));
  }
  if (!normalized.foodSource) {
    normalized.foodSource = source === FOOD_DB_SOURCE.KENTU_IT ? 'CREA' : 'KENTU';
  }

  return normalized;
}

function indexRecords(records, source) {
  const db = {};

  records.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;

    const key = resolveRecordKey(raw, index);
    if (db[key]) return;

    const row = normalizeRecordForDb(raw, source);
    db[key] = enrichDbRowWithFoodUnits(row, key);
  });

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
 * Carica i due pilastri del database KentuOS:
 * - Kentu DB IT (CREA): `/public/crea_gold_standard.json`
 * - Kentu DB 🌐: `/public/kentu_master_db.json`
 *
 * Ogni record è marcato con `source: "KENTU_IT" | "GLOBAL"`.
 * In caso di chiavi duplicate tra i due DB, prevale Kentu DB IT.
 *
 * @returns {Promise<{ kentuItDb: Record<string, object>, globalDb: Record<string, object>, masterDb: Record<string, object> }>}
 */
let kentuDatabasesPromise = null;

async function loadKentuDatabasesUncached() {
  const empty = { kentuItDb: {}, globalDb: {}, masterDb: {} };

  try {
    const [kentuItJson, globalJson] = await Promise.all([
      fetchKentuJson(KENTU_IT_DB_URL).catch((error) => {
        console.warn('[foodLoader] Kentu DB IT unavailable', error);
        return null;
      }),
      fetchKentuJson(GLOBAL_DB_URL).catch((error) => {
        console.warn('[foodLoader] Kentu DB global unavailable', error);
        return null;
      }),
    ]);

    // Yield so first paint / dashboard interactions aren't blocked by index work.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const kentuItRecords = kentuItJson != null ? extractRecords(kentuItJson) : [];
    const globalRecords = globalJson != null ? extractRecords(globalJson) : [];

    const kentuItDb = indexRecords(kentuItRecords, FOOD_DB_SOURCE.KENTU_IT);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const globalDbRaw = indexRecords(globalRecords, FOOD_DB_SOURCE.GLOBAL);

    const globalDb = { ...globalDbRaw };
    Object.keys(kentuItDb).forEach((key) => {
      delete globalDb[key];
    });

    console.log('[foodLoader] loaded Kentu databases', {
      kentuIt: Object.keys(kentuItDb).length,
      global: Object.keys(globalDb).length,
    });

    return {
      kentuItDb,
      globalDb,
      masterDb: globalDb,
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
