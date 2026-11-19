/**
 * Carica CREA, USDA e (opzionale) Open Food Facts.
 * - Dev/test: da public/ sotto root (default process.cwd()).
 * - Cloud Functions MCP: da options.dataDir (functions/data/), senza OFF.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const FILE_NAMES = Object.freeze({
  kentuIt: 'kentu_smart_master_db.json',
  global: 'kentu_smart_master_usda_FINAL.json',
  off: 'kentu_off_master_db.json',
});

/** @type {{ key: string, value: object }|null} */
let cached = null;

/**
 * @param {string} [root]
 * @param {{ includeOff?: boolean, dataDir?: string }} [options]
 */
export async function loadFocusCatalogsFromPublic(root = process.cwd(), options = {}) {
  const includeOff = options.includeOff !== false;
  const dataDir = options.dataDir ? String(options.dataDir) : null;
  const cacheKey = `${dataDir || root}|off:${includeOff ? 1 : 0}`;
  if (cached && cached.key === cacheKey) return cached.value;

  const resolveFile = (name) => (
    dataDir
      ? path.join(dataDir, name)
      : path.join(root, 'public', name)
  );

  const [kentuIt, globalDb, offDb] = await Promise.all([
    readIndex(resolveFile(FILE_NAMES.kentuIt), 'kentu_it'),
    readIndex(resolveFile(FILE_NAMES.global), 'global'),
    includeOff
      ? readIndex(resolveFile(FILE_NAMES.off), 'off')
      : Promise.resolve({}),
  ]);
  for (const key of Object.keys(kentuIt)) delete globalDb[key];
  const value = {
    personalDb: {},
    kentuItDb: kentuIt,
    globalDb,
    offDb,
    offReady: includeOff && Object.keys(offDb).length > 0,
  };
  cached = { key: cacheKey, value };
  return value;
}

export function clearFocusCatalogsCache() {
  cached = null;
}

export const FOCUS_CATALOG_FILE_NAMES = FILE_NAMES;

async function readIndex(absolutePath, source) {
  const json = JSON.parse(await readFile(absolutePath, 'utf8'));
  return indexRecords(extractRecords(json), source);
}

function extractRecords(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  for (const key of ['foods', 'items', 'data', 'records', 'entries']) {
    if (Array.isArray(json[key])) return json[key];
  }
  const values = Object.values(json);
  if (values.length > 0 && values.every((value) => value && typeof value === 'object')) return values;
  return [];
}

function indexRecords(records, source) {
  const db = {};
  records.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    if (source === 'off' && !hasUsableKcal(raw)) return;
    const key = recordKey(raw, index);
    if (!key || db[key]) return;
    db[key] = {
      ...raw,
      source,
      ...(source === 'off' ? { _source: 'off' } : {}),
    };
  });
  return db;
}

function recordKey(record, index) {
  const raw = record.dedupKey
    ?? record.id
    ?? record.fdcId
    ?? record.fdc_id
    ?? record.creaCode
    ?? record.food_code
    ?? record.code;
  if (raw != null && String(raw).trim()) return String(raw).trim();
  return `kentu_${index}`;
}

function hasUsableKcal(record) {
  const raw = record.kcal ?? record.cal ?? record.calories ?? record.energy_kcal ?? record.energy ?? record.kcalPer100g;
  if (raw == null || raw === '') return false;
  const parsed = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0;
}
