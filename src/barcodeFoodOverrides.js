/**
 * Override locali per prodotti Open Food Facts (per EAN): nome e macro /100g corretti dall'utente.
 * Chiave: localStorage `ghost_off_barcode_overrides_v1`
 */

const STORAGE_KEY = 'ghost_off_barcode_overrides_v1';

function readRaw() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return {};
    const o = JSON.parse(s);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function writeRaw(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* noop */
  }
}

/**
 * @param {string} barcode
 * @returns {{ desc?: string, kcal?: number, prot?: number, carb?: number, fat?: number } | null}
 */
export function getBarcodeNutritionOverride(barcode) {
  const b = String(barcode ?? '').trim();
  if (!b) return null;
  const raw = readRaw()[b];
  if (!raw || typeof raw !== 'object') return null;
  return {
    desc: raw.desc != null ? String(raw.desc).trim() : undefined,
    kcal: toOptNum(raw.kcal),
    prot: toOptNum(raw.prot),
    carb: toOptNum(raw.carb),
    fat: toOptNum(raw.fat ?? raw.fatTotal),
  };
}

function toOptNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * @param {string} barcode
 * @param {{ desc?: string, kcal?: number, prot?: number, carb?: number, fat?: number }} patch
 */
export function setBarcodeNutritionOverride(barcode, patch) {
  const b = String(barcode ?? '').trim();
  if (!b) return;
  const all = readRaw();
  const prev = all[b] && typeof all[b] === 'object' ? all[b] : {};
  all[b] = {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  };
  writeRaw(all);
}
