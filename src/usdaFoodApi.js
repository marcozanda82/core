/**
 * USDA FoodData Central — ricerca secondaria (non sostituisce CREA).
 * Usa POST /foods/search (formato ufficiale; GET può restituire risultati vuoti in alcuni contesti).
 * Debounce 400ms. `translationService` in console di solito è Chrome Traduci, non questo modulo.
 */

const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

/** Fallback se `VITE_USDA_API_KEY` non è impostata. */
const DEFAULT_USDA_API_KEY = 'KarVR2zdIgjvNPWbw7c2JO1Jux0UKEhZjrmDnkbT';

const USDA_DEBUG = Boolean(
  import.meta.env?.DEV
  || String(import.meta.env?.VITE_USDA_DEBUG || '').toLowerCase() === 'true'
);

let usdaDebounceTimer = null;
let usdaSearchSeq = 0;
let usdaPendingResolve = null;

function getApiKey() {
  try {
    const fromEnv = String(import.meta.env?.VITE_USDA_API_KEY || '').trim();
    return fromEnv || DEFAULT_USDA_API_KEY;
  } catch {
    return DEFAULT_USDA_API_KEY;
  }
}

function logUsdaDebug(label, payload) {
  if (!USDA_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(`[USDA:debug] ${label}`, payload);
}

/** Rimuove accenti (NFD) per query più stabile verso l’API. */
function stripAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Suggerimenti IT→EN per termini comuni (USDA è orientato all’inglese).
 * Sostituisce parole intere, case-insensitive.
 */
const IT_EN_FOOD_TERMS = {
  pomodoro: 'tomato',
  pomodori: 'tomato',
  riso: 'rice',
  pane: 'bread',
  pollo: 'chicken',
  manzo: 'beef',
  maiale: 'pork',
  pesce: 'fish',
  tonno: 'tuna',
  salmone: 'salmon',
  latte: 'milk',
  uova: 'egg',
  uovo: 'egg',
  olio: 'oil',
  mela: 'apple',
  mele: 'apple',
  banana: 'banana',
  pasta: 'pasta',
  spaghetti: 'spaghetti',
  formaggio: 'cheese',
  mozzarella: 'mozzarella',
  parmigiano: 'parmesan cheese',
  yogurt: 'yogurt',
  zucchina: 'zucchini',
  zucchine: 'zucchini',
  patata: 'potato',
  patate: 'potato',
  farina: 'flour',
  sale: 'salt',
  zucchero: 'sugar',
  acqua: 'water',
  vino: 'wine',
  birra: 'beer',
  insalata: 'salad',
  spinaci: 'spinach',
  carota: 'carrot',
  carote: 'carrot',
  melanzana: 'eggplant',
  peperone: 'bell pepper',
  cipolla: 'onion',
  aglio: 'garlic',
  legumi: 'legumes',
  fagioli: 'beans',
  lenticchie: 'lentils',
  ceci: 'chickpeas',
  mandorle: 'almonds',
  noci: 'walnuts',
  burro: 'butter',
  miele: 'honey',
};

export function normalizeQueryForUsda(raw) {
  const base = stripAccents(String(raw || '').trim()).replace(/\s+/g, ' ');
  if (!base) return '';

  const parts = base.split(' ').map((w) => {
    const key = w.toLowerCase();
    return IT_EN_FOOD_TERMS[key] || w;
  });
  const joined = parts.join(' ').trim();
  logUsdaDebug('query', { raw: String(raw || '').trim(), normalized: joined });
  return joined;
}

function nutrientMatches(n, nutrientId, nutrientNumberStr) {
  if (nutrientId != null && nutrientId !== '') {
    const nid = n?.nutrientId ?? n?.nutrient?.id;
    if (Number(nid) === Number(nutrientId)) return true;
  }
  if (nutrientNumberStr != null && String(nutrientNumberStr) !== '') {
    const nbr = String(n?.nutrientNumber ?? n?.nutrient?.number ?? '').trim();
    if (nbr === String(nutrientNumberStr)) return true;
  }
  return false;
}

function readNutrientAmount(n) {
  const v = Number(n?.value ?? n?.amount);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Estrae valore per nutrientId FDC (es. 1008) o nutrientNumber SR (es. "208" = Energy kcal).
 */
function nutrientByIdOrNumber(foodNutrients, nutrientId, nutrientNumberStr) {
  const list = Array.isArray(foodNutrients) ? foodNutrients : [];
  for (let i = 0; i < list.length; i += 1) {
    const n = list[i];
    if (nutrientMatches(n, nutrientId, nutrientNumberStr)) {
      return readNutrientAmount(n);
    }
  }
  return 0;
}

function energyKcalFromNutrients(nutrients) {
  let kcal = nutrientByIdOrNumber(nutrients, 1008, '208');
  if (kcal) return kcal;

  const list = Array.isArray(nutrients) ? nutrients : [];
  for (let i = 0; i < list.length; i += 1) {
    const n = list[i];
    const name = String(n?.nutrientName || '').toLowerCase();
    const unit = String(n?.unitName || '').toUpperCase();
    if (unit === 'KCAL' && (name.includes('energy') || n?.nutrientNumber === '208')) {
      const v = readNutrientAmount(n);
      if (v) return v;
    }
  }

  const kj = nutrientByIdOrNumber(nutrients, 1062);
  if (kj) return kj / 4.184;
  return 0;
}

function mapUsdaFoodToRow(food) {
  const fdcId = food?.fdcId ?? food?.id;
  if (fdcId == null || fdcId === '') return null;

  const desc = String(
    food?.description
    || food?.lowercaseDescription
    || [food?.brandName, food?.description].filter(Boolean).join(' ')
    || food?.ingredients
    || ''
  ).trim();

  const label = desc || `USDA food ${fdcId}`;

  const nutrients = food?.foodNutrients || [];
  const kcal = energyKcalFromNutrients(nutrients);
  const prot = nutrientByIdOrNumber(nutrients, 1003, '203');
  const carb = nutrientByIdOrNumber(nutrients, 1005, '205');
  const fat = nutrientByIdOrNumber(nutrients, 1004, '204');

  return {
    id: `USDA_${fdcId}`,
    desc: label,
    name: label,
    kcal: Math.round(kcal * 10) / 10,
    prot: Math.round(prot * 10) / 10,
    carb: Math.round(carb * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    gramsPerUnit: 100,
    defaultUnit: 'g',
    foodSource: 'USDA',
  };
}

function clearUsdaDebounceTimer() {
  if (usdaDebounceTimer != null) {
    clearTimeout(usdaDebounceTimer);
    usdaDebounceTimer = null;
  }
}

function settlePreviousUsdaWaiter() {
  if (typeof usdaPendingResolve === 'function') {
    const prev = usdaPendingResolve;
    usdaPendingResolve = null;
    prev([]);
  }
}

function summarizeUsdaResponse(data) {
  if (!data || typeof data !== 'object') return { shape: 'non-object' };
  const foods = data.foods;
  const first = Array.isArray(foods) && foods[0] ? foods[0] : null;
  return {
    keys: Object.keys(data),
    totalHits: data.totalHits,
    currentPage: data.currentPage,
    foodsLength: Array.isArray(foods) ? foods.length : `not-array:${typeof foods}`,
    error: data.error || data.errors || null,
    firstFoodKeys: first ? Object.keys(first).slice(0, 12) : null,
    firstFdcId: first?.fdcId ?? first?.id ?? null,
  };
}

/**
 * Ricerca USDA debounced (400ms). Query sotto 3 caratteri → [] immediato.
 * Nuove chiamate invalidano la Promise precedente (resolve([])).
 */
export function searchUSDAFoods(query, opts = {}) {
  const qRaw = String(query || '').trim();
  const q = qRaw;
  console.log("QUERY USDA:", q);

  if (!q || q.length < 3) {
    clearUsdaDebounceTimer();
    settlePreviousUsdaWaiter();
    logUsdaDebug('skip', { reason: 'short-query', qRaw, qLen: q.length });
    // eslint-disable-next-line no-console
    console.log('[USDA] results:', 0);
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    settlePreviousUsdaWaiter();
    usdaPendingResolve = resolve;

    const signal = opts.signal;
    const mySeq = (usdaSearchSeq += 1);

    const abortHandler = () => {
      if (usdaSearchSeq !== mySeq) return;
      clearUsdaDebounceTimer();
      if (usdaPendingResolve === resolve) {
        usdaPendingResolve = null;
        resolve([]);
      }
    };

    if (signal?.aborted) {
      usdaPendingResolve = null;
      resolve([]);
      return;
    }
    signal?.addEventListener('abort', abortHandler, { once: true });

    clearUsdaDebounceTimer();
    usdaDebounceTimer = setTimeout(async () => {
      usdaDebounceTimer = null;
      signal?.removeEventListener('abort', abortHandler);

      if (usdaSearchSeq !== mySeq || usdaPendingResolve !== resolve) {
        return;
      }

      if (signal?.aborted) {
        usdaPendingResolve = null;
        resolve([]);
        return;
      }

      const pageSize = Math.min(25, Math.max(5, Number(opts.pageSize) || 10));
      const key = getApiKey();
      const url = `${FDC_SEARCH_URL}?api_key=${encodeURIComponent(key)}`;

      logUsdaDebug('request', { method: 'POST', pageSize, query: q });

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            query: q,
            pageSize,
          }),
          signal,
        });
        
        const text = await res.text();
        console.log("STATUS:", res.status);
        console.log("RAW TEXT:", text);
        
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("JSON ERROR:", e);
          return [];
        }
        
        console.log("DATA:", data);
        
        if (usdaPendingResolve !== resolve) return;

        let responseData;
        try {
          responseData = JSON.parse(text);
        } catch (parseErr) {
          logUsdaDebug('json-parse-error', { status: res.status, textPreview: text.slice(0, 200) });
          usdaPendingResolve = null;
          // eslint-disable-next-line no-console
          console.log('[USDA] results:', 0);
          resolve([]);
          return;
        }

        logUsdaDebug('response', {
          httpOk: res.ok,
          status: res.status,
          summary: summarizeUsdaResponse(responseData),
        });

        if (!res.ok) {
          usdaPendingResolve = null;
          // eslint-disable-next-line no-console
          console.log('[USDA] results:', 0);
          resolve([]);
          return;
        }

        if (usdaPendingResolve !== resolve) return;

        let foods = Array.isArray(responseData?.foods) ? responseData.foods : [];
        if (foods.length === 0 && responseData?.foods != null && !Array.isArray(responseData.foods)) {
          logUsdaDebug('foods-not-array', { type: typeof responseData.foods });
        }

        const out = [];
        for (let i = 0; i < foods.length; i += 1) {
          const row = mapUsdaFoodToRow(foods[i]);
          if (!row) {
            logUsdaDebug('row-skip', { index: i, keys: foods[i] ? Object.keys(foods[i]).slice(0, 8) : null });
            continue;
          }
          out.push({
            id: row.id,
            name: row.desc,
            row,
          });
        }

        if (USDA_DEBUG && foods.length > 0 && out.length === 0) {
          logUsdaDebug('all-rows-filtered', { foodsIn: foods.length });
        }

        // eslint-disable-next-line no-console
        console.log('[USDA] results:', out.length);
        usdaPendingResolve = null;
        resolve(out);
      } catch (e) {
        console.error('USDA error', e);
        if (usdaPendingResolve === resolve) {
          usdaPendingResolve = null;
          // eslint-disable-next-line no-console
          console.log('[USDA] results:', 0);
          resolve([]);
        }
      }
    }, 400);
  });
}
