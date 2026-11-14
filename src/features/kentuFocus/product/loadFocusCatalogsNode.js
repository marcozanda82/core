/**
 * Carica CREA, USDA e Open Food Facts dai file in public/.
 * Le chiavi seguono foodLoader.resolveRecordKey, così il lookup del diario
 * trova la stessa riga che trova l'app. Niente enrich delle porzioni:
 * a Focus servono nome, kcal e semanticTags.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_FILES = Object.freeze({
  kentuIt: 'public/kentu_smart_master_db.json',
  global: 'public/kentu_smart_master_usda_FINAL.json',
  off: 'public/kentu_off_master_db.json',
});

let cached = null;

/**
 * @param {string} [root]
 */
export async function loadFocusCatalogsFromPublic(root = process.cwd()) {
  if (cached) return cached;
  const [kentuIt, globalDb, offDb] = await Promise.all([
    readIndex(root, PUBLIC_FILES.kentuIt, 'kentu_it'),
    readIndex(root, PUBLIC_FILES.global, 'global'),
    readIndex(root, PUBLIC_FILES.off, 'off'),
  ]);
  for (const key of Object.keys(kentuIt)) delete globalDb[key];
  cached = {
    personalDb: {},
    kentuItDb: kentuIt,
    globalDb,
    offDb,
    offReady: Object.keys(offDb).length > 0,
  };
  return cached;
}

async function readIndex(root, relativePath, source) {
  const json = JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
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
