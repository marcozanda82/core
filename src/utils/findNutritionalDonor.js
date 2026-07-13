function toSafeString(value) {
  return String(value ?? '').trim();
}

function normalizeToken(value) {
  return toSafeString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeName(value) {
  const t = normalizeToken(value);
  if (!t) return [];
  return t
    .split(' ')
    .map((x) => x.trim())
    .filter((x) => x.length >= 3 && !['per', 'con', 'senza', 'alla', 'allo', 'della', 'dello', 'dei', 'del'].includes(x));
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

function isFinitePositive(n) {
  return Number.isFinite(Number(n)) && Number(n) > 0;
}

function withinPct(candidateValue, refValue, pct = 0.15) {
  const c = Number(candidateValue);
  const r = Number(refValue);
  if (!Number.isFinite(c) || !Number.isFinite(r) || r <= 0) return false;
  const diff = Math.abs(c - r) / r;
  return diff <= pct;
}

const MACRO_KEYS = ['kcal', 'prot', 'carb', 'fatTotal'];
const META_KEYS = new Set([
  'id', 'type', 'desc', 'name', 'ingredients', 'units', 'defaultUnit',
  'category', 'foodDbKey', 'unitStep', 'defaultQty', 'barcode', 'image', 'row',
  'isRecipe', 'createdAt', 'updatedAt',
]);

/**
 * Trova un "donatore" nel foodDatabase con nome simile e macro compatibili (±15%).
 *
 * @param {{ desc?: string, kcal?: number|null, prot?: number|null, carb?: number|null, fatTotal?: number|null }} extractedFood
 * @param {Record<string, any>} foodDatabase
 * @returns {null | { key: string, donorName: string, score: number, donorRow: any }}
 */
export function findNutritionalDonor(extractedFood, foodDatabase) {
  const db = foodDatabase && typeof foodDatabase === 'object' ? foodDatabase : {};
  const name = toSafeString(extractedFood?.desc);
  const nameTokens = tokenizeName(name);

  const hasAnyMacro = MACRO_KEYS.some((k) => extractedFood?.[k] != null && isFinitePositive(extractedFood[k]));
  if (!name || nameTokens.length === 0 || !hasAnyMacro) return null;

  let best = null;

  Object.entries(db).forEach(([key, row]) => {
    if (!row || typeof row !== 'object') return;
    if (row.isRecipe === true || row.type === 'recipe') return;

    const donorName = toSafeString(row.desc || row.name);
    const donorTokens = tokenizeName(donorName);
    const nameScore = jaccard(nameTokens, donorTokens);
    if (nameScore < 0.18) return;

    // Macro compatibility: check only macros that were actually extracted (non-null).
    for (const mk of MACRO_KEYS) {
      const ref = extractedFood?.[mk];
      if (ref == null || !isFinitePositive(ref)) continue;
      const cand = row[mk] ?? (mk === 'fatTotal' ? row.fat : undefined);
      if (!withinPct(cand, ref, 0.15)) return;
    }

    const macroCount = MACRO_KEYS.filter((mk) => extractedFood?.[mk] != null && isFinitePositive(extractedFood[mk])).length;
    const macroStrength = macroCount / MACRO_KEYS.length;
    const score = nameScore * 0.75 + macroStrength * 0.25;

    if (!best || score > best.score) {
      best = { key, donorName: donorName || key, score, donorRow: row };
    }
  });

  return best;
}

/**
 * Eredita micronutrienti dal donatore: copia tutte le chiavi numeriche non macro/non meta.
 *
 * @param {any} extractedPer100 - oggetto per100 creato da Vision
 * @param {any} donorRow - riga db per100 del donatore
 * @returns {any}
 */
export function inheritMicrosFromDonor(extractedPer100, donorRow) {
  const out = { ...(extractedPer100 || {}) };
  if (!donorRow || typeof donorRow !== 'object') return out;

  Object.keys(donorRow).forEach((k) => {
    if (META_KEYS.has(k)) return;
    if (MACRO_KEYS.includes(k)) return;
    if (k === 'fat' || k === 'cal') return;
    const v = donorRow[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    }
  });

  // Fibre è spesso un micro ma utile: se Vision non l'ha estratta e il donatore ce l'ha, copiala.
  if ((out.fibre == null || !Number.isFinite(Number(out.fibre))) && typeof donorRow.fibre === 'number') {
    out.fibre = donorRow.fibre;
  }

  return out;
}

