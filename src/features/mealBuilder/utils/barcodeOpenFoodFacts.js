const OFF_USER_AGENT = 'GhostApp/1.0 (KentuOS; barcode-scanner)';

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

function mapOpenFoodFactsProduct(barcode, product) {
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

/** Risolve un barcode via Open Food Facts (v2 + v0). */
export async function fetchOpenFoodFactsByBarcode(barcode) {
  const code = String(barcode ?? '').trim();
  if (!code) return null;

  const requestOpts = {
    headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
  };

  const endpoints = [
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
  ];

  for (let i = 0; i < endpoints.length; i += 1) {
    const url = endpoints[i];
    try {
      const res = await fetch(url, requestOpts);
      if (!res.ok) continue;
      const data = await res.json();
      const product = data?.product;
      if (!product) continue;
      const mapped = mapOpenFoodFactsProduct(code, product);
      if (mapped) return mapped;
    } catch {
      /* try next endpoint */
    }
  }

  return null;
}

export const BARCODE_NO_MATCH_MESSAGE =
  'Nessuna corrispondenza trovata. Riprova la scansione o inserisci manualmente.';
