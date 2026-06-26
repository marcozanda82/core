import { resolveIconTagId } from './features/mealBuilder/utils/FoodIcons';
import { enrichDbRowWithFoodUnits } from './foodUnits';

const UNIFIED_DB_URL = '/kentu_unified_master_db.json';
const USDA_DB_URL = '/kentu_master_db.json';

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

function resolveRecordKey(record, index, foodSource) {
  if (foodSource === 'CREA') {
    const creaCode = pickFirst(record, ['creaCode', 'food_code', 'code', 'id', 'dedupKey'], '');
    if (creaCode) return String(creaCode).trim();
  }

  if (foodSource === 'USDA') {
    const fdcId = pickFirst(record, ['fdcId', 'fdc_id', 'id', 'dedupKey'], '');
    if (fdcId) {
      const raw = String(fdcId).trim().replace(/^USDA_/i, '');
      return raw ? `USDA_${raw}` : '';
    }
  }

  const rawId = pickFirst(record, ['dedupKey', 'id', 'food_code', 'code', 'fdcId', 'creaCode'], '');
  let key = String(rawId).trim();

  if (foodSource === 'USDA' && key && !key.startsWith('USDA_')) {
    key = `USDA_${key}`;
  }

  if (key) return key;
  return `${foodSource === 'USDA' ? 'USDA' : 'food'}_${index}`;
}

function normalizeRecordForDb(record, foodSource) {
  const italianName = resolveItalianName(record);
  const englishName = String(pickFirst(record, ['name', 'description'], '')).trim();
  const rawIconTag = pickFirst(record, ['iconTag', 'icon_tag'], '');
  const resolvedIconTag = rawIconTag ? resolveIconTagId(rawIconTag) : null;

  const normalized = {
    ...record,
    desc: italianName || englishName || `Alimento ${foodSource}`,
    name: italianName || englishName || `Alimento ${foodSource}`,
    ...(englishName && italianName && englishName !== italianName
      ? { nameEn: englishName }
      : {}),
    ...(resolvedIconTag ? { iconTag: resolvedIconTag } : {}),
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
    pickFirst(record, ['fat', 'fatTotal', 'fatTot', 'lipids']),
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
    normalized.na = toNumber(pickFirst(record, ['na', 'sodium']));
  }
  if (normalized.k == null) {
    normalized.k = toNumber(pickFirst(record, ['k', 'potassium']));
  }
  if (!normalized.foodSource) {
    normalized.foodSource = foodSource;
  }

  if (foodSource === 'CREA' && record.creaCode) {
    normalized.creaCode = String(record.creaCode).trim();
  }
  if (foodSource === 'USDA' && record.fdcId) {
    normalized.fdcId = String(record.fdcId).trim();
  }

  return normalized;
}

function indexRecords(records, foodSource) {
  const db = {};

  records.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;

    const key = resolveRecordKey(raw, index, foodSource);
    if (db[key]) return;

    const row = normalizeRecordForDb(raw, foodSource);
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
 * Carica i cataloghi master KentuOS (ex-CREA unified + ex-USDA locale).
 * Gli array sorgente vengono indicizzati per chiave O(1) prima del ritorno.
 *
 * @returns {Promise<{ unifiedDb: Record<string, object>, usdaDb: Record<string, object> }>}
 */
export async function loadKentuDatabases() {
  try {
    const [unifiedJson, usdaJson] = await Promise.all([
      fetchKentuJson(UNIFIED_DB_URL),
      fetchKentuJson(USDA_DB_URL),
    ]);

    const unifiedRecords = extractRecords(unifiedJson);
    const usdaRecords = extractRecords(usdaJson);

    const unifiedDb = indexRecords(unifiedRecords, 'CREA');
    const usdaDb = indexRecords(usdaRecords, 'USDA');

    console.log('[foodLoader] loaded Kentu master DBs', {
      unified: Object.keys(unifiedDb).length,
      usda: Object.keys(usdaDb).length,
      sampleUnified: unifiedRecords[0]
        ? {
            key: resolveRecordKey(unifiedRecords[0], 0, 'CREA'),
            desc: resolveItalianName(unifiedRecords[0]),
            iconTag: unifiedRecords[0].iconTag,
          }
        : null,
    });

    return { unifiedDb, usdaDb };
  } catch (error) {
    console.error('[foodLoader] failed to load Kentu master databases', error);
    return { unifiedDb: {}, usdaDb: {} };
  }
}
