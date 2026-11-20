/**
 * Sodio canonico in mg (per 100g sul catalogo, o sulla porzione nel diario).
 *
 * Unità dichiarata dal record (naUnit / sodiumUnit / nutrientUnits.na), non euristiche
 * tipo «na < 5 → ×1000» che gonfiano frutta a basso sodio (mela/kiwi).
 */

export const SALT_G_TO_SODIUM_MG = 393.4;

/**
 * @param {unknown} raw
 * @returns {'mg'|'g'|null}
 */
export function parseSodiumUnit(raw) {
  const u = String(raw ?? '').trim().toLowerCase();
  if (!u) return null;
  if (u === 'mg' || u === 'milligram' || u === 'milligrams' || u === 'mg/100g') return 'mg';
  if (u === 'g' || u === 'gram' || u === 'grams' || u === 'g/100g') return 'g';
  return null;
}

/**
 * Legge l’unità dichiarata su row/entry catalogo o voce diario.
 * @param {Record<string, unknown>|null|undefined} source
 * @returns {'mg'|'g'|null}
 */
export function readDeclaredSodiumUnit(source) {
  if (!source || typeof source !== 'object') return null;
  const direct = parseSodiumUnit(
    source.naUnit ?? source.sodiumUnit ?? source.na_unit ?? source.sodium_unit,
  );
  if (direct) return direct;
  const nested = source.nutrientUnits && typeof source.nutrientUnits === 'object'
    ? source.nutrientUnits
    : null;
  if (nested) {
    return parseSodiumUnit(nested.na ?? nested.sodium ?? nested.Na);
  }
  return null;
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Converte un valore sodio grezzo in mg usando l’unità dichiarata.
 * Senza unità → assume mg (unità TARGETS / diario Kentu).
 * @param {number} value
 * @param {'mg'|'g'|null|undefined} unit
 * @returns {number}
 */
export function sodiumValueToMg(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  if (unit === 'g') return Math.round(n * 1000 * 100) / 100;
  return Math.round(n * 100) / 100;
}

/**
 * Sodio mg / 100g da riga catalogo (o DB personale).
 * Preferisce `sale` (g sale) → Na mg; altrimenti na/sodium con unità dichiarata.
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {number|null}
 */
export function readSodiumMgPer100FromCatalogRow(row) {
  if (!row || typeof row !== 'object') return null;
  const unit = readDeclaredSodiumUnit(row);
  const na = finite(row.na ?? row.sodium ?? row.sodiumMg);
  const sale = finite(row.sale);

  if (na != null && na !== 0) {
    return sodiumValueToMg(na, unit);
  }
  if (sale != null && sale > 0) {
    return Math.round(sale * SALT_G_TO_SODIUM_MG * 100) / 100;
  }
  if (na === 0) return null;
  return null;
}

/**
 * Sodio mg della porzione (voce diario). Niente ×1000 cieco su na&lt;5.
 * @param {Record<string, unknown>|null|undefined} entry
 * @returns {{ value: number|null, reason: string|null }}
 */
export function readSodiumMgFromDiaryEntry(entry) {
  if (!entry || typeof entry !== 'object') return { value: null, reason: 'missing' };
  const unit = readDeclaredSodiumUnit(entry);
  const na = finite(entry.na ?? entry.sodium ?? entry.sodiumMg);
  const sale = finite(entry.sale);
  const fromSale = sale != null && sale > 0
    ? Math.round(sale * SALT_G_TO_SODIUM_MG * 10) / 10
    : null;

  if (na == null || na === 0) {
    if (fromSale != null) return { value: fromSale, reason: null };
    return { value: null, reason: 'missing' };
  }

  const asMg = sodiumValueToMg(na, unit);
  return { value: asMg, reason: null };
}
