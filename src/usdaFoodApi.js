/**
 * USDA FoodData Central — ricerca secondaria (non sostituisce CREA).
 * Debounce 400ms, GET /foods/search, errori → [].
 */

const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

/** Fallback se `VITE_USDA_API_KEY` non è impostata (preferire .env in produzione). */
const DEFAULT_USDA_API_KEY = 'KarVR2zdIgjvNPWbw7c2JO1Jux0UKEhZjrmDnkbT';

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

function nutrientValue(foodNutrients, nutrientId) {
  const list = Array.isArray(foodNutrients) ? foodNutrients : [];
  for (let i = 0; i < list.length; i += 1) {
    const n = list[i];
    const id = n?.nutrientId ?? n?.nutrient?.id
      ?? (n?.nutrientNumber != null ? Number(n.nutrientNumber) : undefined);
    if (Number(id) === Number(nutrientId)) {
      const v = Number(n?.value ?? n?.amount);
      return Number.isFinite(v) ? v : 0;
    }
  }
  return 0;
}

/** Nutrient IDs FDC: Energy 1008, Protein 1003, Carbs 1005, Fat 1004 */
function mapUsdaFoodToRow(food) {
  const fdcId = food?.fdcId ?? food?.id;
  const desc = String(food?.description || food?.lowercaseDescription || '').trim();
  if (!fdcId || !desc) return null;

  const nutrients = food?.foodNutrients || [];
  let kcal = nutrientValue(nutrients, 1008);
  if (!kcal) {
    const kj = nutrientValue(nutrients, 1062);
    if (kj) kcal = kj / 4.184;
  }
  const prot = nutrientValue(nutrients, 1003);
  const carb = nutrientValue(nutrients, 1005);
  const fat = nutrientValue(nutrients, 1004);

  return {
    id: `USDA_${fdcId}`,
    desc,
    name: desc,
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

/**
 * Ricerca USDA debounced (400ms). Query sotto 3 caratteri → [] immediato.
 * Nuove chiamate invalidano la Promise precedente (resolve([])).
 *
 * @param {string} query
 * @param {{ signal?: AbortSignal, pageSize?: number }} [opts]
 * @returns {Promise<Array<{ id: string, name: string, row: object }>>}
 */
export function searchUSDAFoods(query, opts = {}) {
  const q = String(query || '').trim();

  if (!q || q.length < 3) {
    clearUsdaDebounceTimer();
    settlePreviousUsdaWaiter();
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
      const url = `${FDC_SEARCH_URL}?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(q)}&pageSize=${pageSize}`;

      try {
        const res = await fetch(url, { method: 'GET', signal });
        if (usdaPendingResolve !== resolve) return;

        if (!res.ok) {
          usdaPendingResolve = null;
          // eslint-disable-next-line no-console
          console.log('[USDA] results:', 0);
          resolve([]);
          return;
        }

        const data = await res.json();
        if (usdaPendingResolve !== resolve) return;

        const foods = Array.isArray(data?.foods) ? data.foods : [];
        const out = [];

        for (let i = 0; i < foods.length; i += 1) {
          const row = mapUsdaFoodToRow(foods[i]);
          if (!row) continue;
          out.push({
            id: row.id,
            name: row.desc,
            row,
          });
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
