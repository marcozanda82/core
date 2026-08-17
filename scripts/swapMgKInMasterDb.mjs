/**
 * Swap mg ↔ k in public/kentu_master_db.json (minerali invertiti nel master USDA).
 *
 * Uso:
 *   node scripts/swapMgKInMasterDb.mjs
 *   node scripts/swapMgKInMasterDb.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'public', 'kentu_master_db.json');
const dryRun = process.argv.includes('--dry-run');

function isValidNumber(value) {
  if (value == null || value === '') return false;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n);
}

/** @returns {boolean} true se mg e k sono stati scambiati */
function swapMgK(row) {
  if (!row || typeof row !== 'object') return false;
  if (!isValidNumber(row.mg) || !isValidNumber(row.k)) return false;

  const tmp = row.mg;
  row.mg = row.k;
  row.k = tmp;
  return true;
}

function extractRows(json) {
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

function findSample(rows, fdcId) {
  return rows.find((row) => String(row?.fdcId ?? row?.id ?? '') === String(fdcId)) ?? null;
}

console.log(`[swapMgK] reading ${FILE}`);
const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const isArray = Array.isArray(raw);
const rows = extractRows(raw);

let swapped = 0;
for (const row of rows) {
  if (swapMgK(row)) swapped += 1;
}

console.log(`[swapMgK] rows total: ${rows.length}, swapped mg↔k: ${swapped}`);

const banana = findSample(rows, '173944') ?? findSample(rows, '173945');
if (banana) {
  console.log('[swapMgK] sample Bananas:', {
    fdcId: banana.fdcId ?? banana.id,
    desc: banana.desc ?? banana.name,
    mg: banana.mg,
    k: banana.k,
  });
}

if (dryRun) {
  console.log('[swapMgK] dry-run — file NOT written');
  process.exit(0);
}

fs.writeFileSync(FILE, `${JSON.stringify(isArray ? rows : raw, null, 2)}\n`, 'utf8');
console.log(`[swapMgK] wrote ${FILE}`);
