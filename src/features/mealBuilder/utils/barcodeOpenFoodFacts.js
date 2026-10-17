const OFF_USER_AGENT = 'GhostApp/1.0 (KentuOS; barcode-scanner)';

/** Timeout rigido lookup Open Food Facts (ms). */
export const OFF_FETCH_TIMEOUT_MS = 6000;

export const BARCODE_NO_MATCH_MESSAGE =
  'Prodotto non trovato online (o connessione lenta). Vuoi inserirlo manualmente?';

/** Cache runtime prodotti OFF trovati online (barcode digits → riga Kentu). */
const runtimeOffBarcodeCache = new Map();

/** Indice barcode → id su ciascun oggetto `offDb` (WeakMap = GC-friendly). */
const offBarcodeIndexByDb = new WeakMap();

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
 * Normalizza GTIN/EAN: 14 cifre con leading 0 → EAN-13.
 * @param {string} digits
 * @returns {string}
 */
export function normalizeGtinDigits(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 14 && d.startsWith('0')) return d.slice(1);
  return d;
}

/**
 * Estrae un EAN/GTIN da raw scanner (EAN numerico o QR GS1 Digital Link / URL).
 *
 * @param {unknown} rawValue
 * @returns {string} solo cifre (8–14) oppure ''
 */
export function extractBarcodeFromScan(rawValue) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return '';

  const compact = raw.replace(/[\s-]/g, '');
  if (/^\d{8,14}$/.test(compact)) {
    return normalizeGtinDigits(compact);
  }

  // Path-like GS1 senza schema: 01/8001234567890/...
  const bareGs1 = raw.match(/(?:^|[^\d])01\/(\d{8,14})(?:\/|$|[^\d])/);
  if (bareGs1) return normalizeGtinDigits(bareGs1[1]);

  let urlCandidate = raw;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && (raw.includes('/') || raw.includes('?'))) {
    urlCandidate = `https://scan.local/${raw.replace(/^\//, '')}`;
  }

  try {
    if (/^https?:\/\//i.test(urlCandidate) || urlCandidate.startsWith('https://scan.local/')) {
      const url = new URL(urlCandidate);
      const pathMatch = url.pathname.match(/(?:^|\/)01\/(\d{8,14})(?:\/|$)/);
      if (pathMatch) return normalizeGtinDigits(pathMatch[1]);

      for (const key of ['gtin', '01', 'barcode', 'ean', 'ean13', 'code']) {
        const v = url.searchParams.get(key);
        if (!v) continue;
        const d = normalizeGtinDigits(v);
        if (d.length >= 8 && d.length <= 14) return d;
      }

      // Alcuni Digital Link mettono GTIN come ultimo segmento numerico lungo.
      const segments = url.pathname.split('/').filter(Boolean);
      for (let i = 0; i < segments.length; i += 1) {
        if (segments[i] === '01' && segments[i + 1] && /^\d{8,14}$/.test(segments[i + 1])) {
          return normalizeGtinDigits(segments[i + 1]);
        }
      }
    }
  } catch {
    /* non è un URL valido */
  }

  // AI (Application Identifier) GS1 in stringa piatta: (01)XXXXXXXXXXXXX
  const aiParen = raw.match(/\(\s*01\s*\)\s*(\d{8,14})/);
  if (aiParen) return normalizeGtinDigits(aiParen[1]);

  // Qualsiasi EAN-13 isolato (es. URL con …80……………).
  const ean13 = raw.match(/(?<!\d)(\d{13})(?!\d)/);
  if (ean13) return ean13[1];

  const eanAny = raw.match(/(?<!\d)(\d{8,14})(?!\d)/);
  if (eanAny) return normalizeGtinDigits(eanAny[1]);

  return '';
}

/**
 * Indice O(1) barcode → food id per un `offDb` già indicizzato.
 * @param {Record<string, object>|null|undefined} offDb
 * @returns {Map<string, string>}
 */
export function getOffBarcodeIndex(offDb) {
  if (offDb == null || typeof offDb !== 'object' || Array.isArray(offDb)) {
    return new Map();
  }
  let idx = offBarcodeIndexByDb.get(offDb);
  if (idx) return idx;

  idx = new Map();
  const keys = Object.keys(offDb);
  for (let i = 0; i < keys.length; i += 1) {
    const id = keys[i];
    const row = offDb[id];
    if (!row || typeof row !== 'object') continue;

    const candidates = [
      row.barcode,
      row.code,
      id.startsWith('OFF_') ? id.slice(4) : null,
      id,
    ];
    for (let c = 0; c < candidates.length; c += 1) {
      const digits = normalizeGtinDigits(candidates[c]);
      if (digits.length < 8 || digits.length > 14) continue;
      if (!idx.has(digits)) idx.set(digits, id);
    }
  }
  offBarcodeIndexByDb.set(offDb, idx);
  return idx;
}

/**
 * Lookup locale O(1) in dump OFF (+ cache runtime online).
 * @returns {{ id: string, row: object, fromCache?: boolean }|null}
 */
export function lookupOffByBarcode(offDb, barcode) {
  const code = normalizeGtinDigits(barcode);
  if (code.length < 8 || code.length > 14) return null;

  const cached = runtimeOffBarcodeCache.get(code);
  if (cached && typeof cached === 'object') {
    return { id: String(cached.id || `OFF_${code}`), row: cached, fromCache: true };
  }

  const idx = getOffBarcodeIndex(offDb);
  const id = idx.get(code);
  if (id && offDb?.[id]) {
    return { id, row: offDb[id], fromCache: false };
  }

  // Fallback leggero se l'indice non ha ancora la chiave (id grezzo).
  if (offDb && typeof offDb === 'object') {
    const direct = offDb[`OFF_${code}`] || offDb[code];
    if (direct && typeof direct === 'object') {
      return { id: String(direct.id || `OFF_${code}`), row: direct, fromCache: false };
    }
  }

  return null;
}

/**
 * Memorizza in cache runtime un prodotto OFF (prossime scan/ricerche istantanee).
 * Aggiorna anche l'indice WeakMap se `offDb` è lo stesso oggetto in memoria.
 */
export function cacheOffProductRow(barcode, row, offDb = null) {
  const code = normalizeGtinDigits(barcode);
  if (code.length < 8 || !row || typeof row !== 'object') return;

  const id = String(row.id || `OFF_${code}`).trim();
  const cached = {
    ...row,
    id,
    barcode: code,
    _source: 'off',
    foodSource: row.foodSource || 'OFF',
  };
  runtimeOffBarcodeCache.set(code, cached);

  if (offDb && typeof offDb === 'object' && !Array.isArray(offDb)) {
    if (!offDb[id]) {
      offDb[id] = cached;
    }
    let idx = offBarcodeIndexByDb.get(offDb);
    if (!idx) {
      idx = getOffBarcodeIndex(offDb);
    }
    idx.set(code, id);
  }
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
  const brand = String(product.brands || product.brand || '').trim();
  const code = normalizeGtinDigits(barcode || product.code || product._id);

  const entryPer100 = {
    desc:
      String(
        product.product_name_it
        || product.product_name
        || product.generic_name_it
        || product.generic_name
        || '',
      ).trim()
      || `Barcode ${code || barcode}`,
    name: String(
      product.product_name_it
      || product.product_name
      || product.generic_name
      || '',
    ).trim(),
    kcal,
    prot,
    carb,
    fatTotal,
    fat: fatTotal,
    fibre,
    ...(brand ? { brand } : {}),
    ...(code ? { barcode: code } : {}),
    foodSource: 'OFF',
    _source: 'off',
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
  const cleanCode = normalizeGtinDigits(barcode) || String(barcode ?? '').trim();
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
 * Cascata: cache runtime → dump locale offDb → API v2 live.
 * Se trovato online, popola la cache (e opzionalmente muta `offDb` in memoria).
 *
 * @param {string} barcode
 * @param {{ offDb?: object|null }} [options]
 * @returns {Promise<{ success: true, entry: object, source: 'cache'|'local'|'online' } | { success: false, reason: string }>}
 */
export async function resolveBarcodeCascade(barcode, options = {}) {
  const code = extractBarcodeFromScan(barcode) || normalizeGtinDigits(barcode);
  if (!code) return { success: false, reason: 'not_found' };

  const local = lookupOffByBarcode(options.offDb, code);
  if (local?.row) {
    return {
      success: true,
      entry: {
        ...local.row,
        barcode: code,
        desc: local.row.desc || local.row.name || `Barcode ${code}`,
      },
      source: local.fromCache ? 'cache' : 'local',
      id: local.id,
    };
  }

  const lookup = await searchBarcode(code);
  if (!lookup.success) {
    return { success: false, reason: lookup.reason || 'not_found' };
  }

  const mapped = mapOpenFoodFactsProduct(code, lookup.product);
  if (!mapped?.desc) {
    return { success: false, reason: 'not_found' };
  }

  const entry = {
    ...mapped,
    id: `OFF_${code}`,
    barcode: code,
  };
  cacheOffProductRow(code, entry, options.offDb ?? null);

  return { success: true, entry, source: 'online', id: entry.id };
}

/**
 * Risolve un barcode via Open Food Facts e mappa i macro / 100g.
 * Timeout rigido 6s — mai Promise appesa.
 * @param {string} barcode
 * @returns {Promise<object|null>}
 */
export async function fetchOpenFoodFactsByBarcode(barcode) {
  const result = await resolveBarcodeCascade(barcode, {});
  if (!result.success) return null;
  return result.entry;
}
