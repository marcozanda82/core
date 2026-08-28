const OFF_USER_AGENT = 'GhostApp/1.0 (KentuOS; barcode-scanner)';

/** Timeout rigido lookup Open Food Facts (ms). */
export const OFF_FETCH_TIMEOUT_MS = 6000;

export const BARCODE_NO_MATCH_MESSAGE =
  'Prodotto non trovato online (o connessione lenta). Vuoi inserirlo manualmente?';

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

export function mapOpenFoodFactsProduct(barcode, product) {
  if (!product || typeof product !== 'object') return null;
  const nut = product.nutriments || {};
  const energyKcal = pickOffNutriment(nut, [
    'energy-kcal_100g',
    'energy-kcal',
    'energy-kcal_value',
    'energy-kcal_serving',
  ]);
  const energyKj = pickOffNutriment(nut, ['energy_100g', 'energy', 'energy_value', 'energy-kj_100g']);
  const kcal = energyKcal ?? (energyKj != null ? energyKj / 4.184 : undefined);
  const prot = pickOffNutriment(nut, ['proteins_100g', 'proteins', 'proteins_value', 'protein_100g']);
  const carb = pickOffNutriment(nut, ['carbohydrates_100g', 'carbohydrates', 'carbohydrates_value']);
  const fatTotal = pickOffNutriment(nut, ['fat_100g', 'fat', 'fat_value']);
  const fibre = pickOffNutriment(nut, ['fiber_100g', 'fiber', 'fibre_100g', 'fibre']);

  const entryPer100 = {
    desc:
      String(product.product_name || product.product_name_it || product.generic_name || '').trim()
      || `Barcode ${barcode}`,
    kcal,
    prot,
    carb,
    fatTotal,
    fat: fatTotal,
    fibre,
  };

  [
    'sugars_100g',
    'saturated-fat_100g',
    'salt_100g',
    'sodium_100g',
    'calcium_100g',
    'iron_100g',
    'potassium_100g',
    'vitamin-c_100g',
    'vitamin-d_100g',
  ].forEach((key, i) => {
    const our = ['zuccheri', 'fatSat', 'sale', 'na', 'ca', 'fe', 'k', 'vitc', 'vitD'][i];
    const val = pickOffNutriment(nut, [key, key.replace('_100g', ''), `${key}_value`]);
    if (our && val != null) entryPer100[our] = val;
  });

  const hasMacro = ['kcal', 'prot', 'carb', 'fatTotal'].some((k) =>
    Number.isFinite(Number(entryPer100[k])),
  );
  if (!hasMacro) return null;

  return entryPer100;
}

/**
 * Lookup barcode Open Food Facts (v2) con AbortController e timeout 6s.
 * @param {string} barcode
 * @returns {Promise<{ success: true, product: object } | { success: false, reason: 'not_found'|'timeout'|'network_error' }>}
 */
export async function searchBarcode(barcode) {
  const cleanCode = String(barcode ?? '').trim();
  if (!cleanCode) return { success: false, reason: 'not_found' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OFF_FETCH_TIMEOUT_MS);
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanCode)}.json`;

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': OFF_USER_AGENT,
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();

    if (Number(data?.status) === 1 && data.product) {
      return { success: true, product: data.product };
    }
    return { success: false, reason: 'not_found' };
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('Errore o timeout ricerca barcode:', err);
    return {
      success: false,
      reason: err?.name === 'AbortError' ? 'timeout' : 'network_error',
    };
  }
}

/**
 * Risolve un barcode via Open Food Facts e mappa i macro / 100g.
 * Timeout rigido 6s — mai Promise appesa.
 * @param {string} barcode
 * @returns {Promise<object|null>}
 */
export async function fetchOpenFoodFactsByBarcode(barcode) {
  const code = String(barcode ?? '').trim();
  if (!code) return null;
  const result = await searchBarcode(code);
  if (!result.success) return null;
  return mapOpenFoodFactsProduct(code, result.product);
}
