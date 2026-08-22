import { FOOD_DB_SOURCE } from '../../../foodDbSource';
import { hasUsableOffKcal } from '../../../foodLoader';

const OFF_SEARCH_USER_AGENT = 'GhostApp/1.0 (KentuOS; food-search)';

/** Timeout rigido ricerca testuale OFF (ms). */
export const OFF_SEARCH_TIMEOUT_MS = 6000;

export const OFF_SEARCH_DEFAULT_PAGE_SIZE = 5;

const OFF_SEARCH_BASE_URL = 'https://it.openfoodfacts.org/cgi/search.pl';

function pickOffNutriment(nutriments, keys) {
  if (!nutriments || typeof nutriments !== 'object') return undefined;
  for (let i = 0; i < keys.length; i += 1) {
    const raw = nutriments[keys[i]];
    if (raw == null || raw === '') continue;
    const parsed = parseFloat(String(raw).replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Mappa un prodotto OFF (search API) nel formato riga Kentu per 100g.
 * @param {object} product
 * @returns {object|null}
 */
export function mapOffSearchProductToKentuRow(product) {
  if (!product || typeof product !== 'object') return null;

  const code = String(product.code || product._id || '').trim();
  const name = String(
    product.product_name_it
    || product.product_name
    || product.generic_name_it
    || product.generic_name
    || '',
  ).trim();
  if (!name) return null;

  const nut = product.nutriments || {};
  const energyKcal = pickOffNutriment(nut, [
    'energy-kcal_100g',
    'energy-kcal',
    'energy-kcal_value',
  ]);
  const energyKj = pickOffNutriment(nut, ['energy_100g', 'energy', 'energy-kj_100g']);
  const kcal = energyKcal ?? (energyKj != null ? energyKj / 4.184 : undefined);
  const prot = pickOffNutriment(nut, ['proteins_100g', 'proteins', 'protein_100g']);
  const carb = pickOffNutriment(nut, ['carbohydrates_100g', 'carbohydrates']);
  const fatTotal = pickOffNutriment(nut, ['fat_100g', 'fat']);
  const brand = String(product.brands || product.brand || '').trim();

  const row = {
    id: code || `off_${name.replace(/\s+/g, '_').slice(0, 48)}`,
    desc: name,
    name,
    kcal,
    cal: kcal,
    prot,
    carb,
    fat: fatTotal,
    fatTotal,
    fatTot: fatTotal,
    brand: brand || undefined,
    barcode: code || undefined,
    foodSource: 'OFF',
    source: FOOD_DB_SOURCE.OFF,
    _source: 'off',
  };

  if (!hasUsableOffKcal(row)) return null;
  return row;
}

function buildOffSearchUrl(query, pageSize) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(Math.max(1, Math.min(10, pageSize))),
  });
  return `${OFF_SEARCH_BASE_URL}?${params.toString()}`;
}

/**
 * Ricerca testuale Open Food Facts via REST (Livello 2 cloud).
 * Errori / timeout → array vuoto (silenzioso).
 *
 * @param {string} query
 * @param {{ limit?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<object[]>}
 */
export async function searchOpenFoodFactsApi(query, options = {}) {
  const term = String(query || '').trim();
  if (!term) return [];

  const pageSize = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : OFF_SEARCH_DEFAULT_PAGE_SIZE;

  if (options.signal?.aborted) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_SEARCH_TIMEOUT_MS);

  const onParentAbort = () => controller.abort();
  options.signal?.addEventListener?.('abort', onParentAbort);

  try {
    const res = await fetch(buildOffSearchUrl(term, pageSize), {
      headers: {
        'User-Agent': OFF_SEARCH_USER_AGENT,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) return [];

    const data = await res.json();
    const products = Array.isArray(data?.products) ? data.products : [];

    return products
      .map(mapOffSearchProductToKentuRow)
      .filter(Boolean)
      .slice(0, pageSize);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener?.('abort', onParentAbort);
  }
}
