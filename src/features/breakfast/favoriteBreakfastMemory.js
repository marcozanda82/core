/**
 * Memoria «il solito» — ultima colazione/caffè preferita (LocalStorage).
 */

import {
  getCoffeeShopProductById,
  findCoffeeShopProductByName,
  coffeeShopProductToFoodPayload,
} from '../../constants/coffeeShopDatabase.js';

export const FAVORITE_BREAKFAST_LS_KEY = 'kentu_favorite_breakfast';

/**
 * @typedef {{
 *   productId?: string | null,
 *   name: string,
 *   coffeeType?: string | null,
 *   coffeeVariant?: string | null,
 *   kind?: 'coffee' | 'pastry' | 'combo',
 *   caffeineMg?: number,
 *   isFastingSafe?: boolean,
 *   kcal?: number,
 *   prot?: number,
 *   carb?: number,
 *   fat?: number,
 *   savedAt?: string,
 * }} FavoriteBreakfast
 */

/**
 * @param {unknown} raw
 * @returns {FavoriteBreakfast | null}
 */
export function sanitizeFavoriteBreakfast(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || raw.label || '').trim();
  if (!name) return null;
  const productId = String(raw.productId || raw.coffeeShopProductId || '').trim() || null;
  const product = productId
    ? getCoffeeShopProductById(productId)
    : findCoffeeShopProductByName(name);
  return {
    productId: product?.id || productId,
    name: product?.name || name,
    coffeeType: raw.coffeeType != null ? String(raw.coffeeType) : null,
    coffeeVariant: raw.coffeeVariant != null ? String(raw.coffeeVariant) : null,
    kind: product?.kind || raw.kind || 'coffee',
    caffeineMg: Number(raw.caffeineMg ?? product?.caffeineMg) || 0,
    isFastingSafe: raw.isFastingSafe === true || product?.isFastingSafe === true,
    kcal: Number(raw.kcal ?? product?.kcal) || 0,
    prot: Number(raw.prot ?? product?.prot) || 0,
    carb: Number(raw.carb ?? product?.carb) || 0,
    fat: Number(raw.fat ?? product?.fat) || 0,
    savedAt: String(raw.savedAt || '').trim() || new Date().toISOString(),
  };
}

/**
 * @returns {FavoriteBreakfast | null}
 */
export function readFavoriteBreakfast() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(FAVORITE_BREAKFAST_LS_KEY);
    if (!raw) return null;
    return sanitizeFavoriteBreakfast(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {FavoriteBreakfast | null}
 */
export function writeFavoriteBreakfast(value) {
  const next = sanitizeFavoriteBreakfast({
    ...(value && typeof value === 'object' ? value : {}),
    savedAt: new Date().toISOString(),
  });
  if (!next) return null;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FAVORITE_BREAKFAST_LS_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore quota / private mode
  }
  return next;
}

/**
 * Aggiorna il solito da un nodo stimolante caffè.
 * @param {object} node
 * @returns {FavoriteBreakfast | null}
 */
export function rememberFavoriteFromCoffeeNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (String(node.type || '').toLowerCase() !== 'stimulant') return null;
  const subtype = String(node.subtype || '').toLowerCase();
  if (subtype && subtype !== 'caffè' && subtype !== 'caffe') return null;
  return writeFavoriteBreakfast({
    productId: node.coffeeShopProductId,
    name: node.label || node.name,
    coffeeType: node.coffeeType,
    coffeeVariant: node.coffeeVariant,
    kind: 'coffee',
    caffeineMg: node.caffeineMg,
    isFastingSafe: node.isFastingSafe,
    kcal: node.kcal,
    prot: node.prot,
    carb: node.carb,
    fat: node.fat,
  });
}

/**
 * Aggiorna il solito da un item pasto (es. croissant / colazione caffetteria).
 * @param {object} item
 * @returns {FavoriteBreakfast | null}
 */
export function rememberFavoriteFromFoodItem(item) {
  if (!item || typeof item !== 'object') return null;
  const name = String(item.desc || item.name || item.foodName || '').trim();
  if (!name) return null;
  const product = getCoffeeShopProductById(item.coffeeShopProductId)
    || findCoffeeShopProductByName(name);
  if (!product && !(Number(item.caffeineMg) > 0) && item.isFastingSafe == null) {
    // Solo voci caffetteria / esplicitamente taggate.
    return null;
  }
  return writeFavoriteBreakfast({
    productId: product?.id || item.coffeeShopProductId,
    name: product?.name || name,
    kind: product?.kind || 'pastry',
    caffeineMg: item.caffeineMg ?? product?.caffeineMg,
    isFastingSafe: item.isFastingSafe ?? product?.isFastingSafe,
    kcal: item.kcal ?? item.cal ?? product?.kcal,
    prot: item.prot ?? product?.prot,
    carb: item.carb ?? product?.carb,
    fat: item.fat ?? item.fatTotal ?? product?.fat,
  });
}

/**
 * Testo chip predittiva.
 * @param {FavoriteBreakfast | null | undefined} fav
 * @returns {string | null}
 */
export function formatUsualBreakfastChipLabel(fav) {
  const name = String(fav?.name || '').trim();
  if (!name) return null;
  return `☕ Il tuo solito: ${name}`;
}

/**
 * Opzioni per rieseguire il solito (caffè stimolante vs ADD_FOOD).
 * @param {FavoriteBreakfast | null | undefined} fav
 * @returns {{ mode: 'coffee' | 'food', coffeeType?: string, coffeeVariant?: string, foodPayload?: object } | null}
 */
export function resolveUsualBreakfastAction(fav) {
  const clean = sanitizeFavoriteBreakfast(fav);
  if (!clean) return null;
  const product = getCoffeeShopProductById(clean.productId)
    || findCoffeeShopProductByName(clean.name);

  if (product?.kind === 'coffee' || clean.kind === 'coffee' || clean.coffeeType) {
    const typeFromId = (() => {
      const id = String(product?.id || '');
      if (id.startsWith('americano')) return 'americano';
      if (id.startsWith('macchiato')) return 'macchiato';
      if (id.startsWith('cappuccino')) return 'cappuccino';
      if (id.startsWith('cortado')) return 'cortado';
      if (id.startsWith('mocaccino')) return 'mocaccino';
      return 'espresso';
    })();
    return {
      mode: 'coffee',
      coffeeType: clean.coffeeType || typeFromId,
      coffeeVariant: clean.coffeeVariant
        || (product?.id === 'espresso_zuccherato' ? 'zuccherato' : 'amaro'),
      product,
    };
  }

  if (product) {
    return {
      mode: 'food',
      foodPayload: coffeeShopProductToFoodPayload(product, { mealType: 'colazione' }),
      product,
    };
  }

  return {
    mode: 'food',
    foodPayload: {
      foodName: clean.name,
      grams: 50,
      mealType: 'colazione',
      caffeineMg: clean.caffeineMg,
      isFastingSafe: clean.isFastingSafe,
      userProvidedMacros: {
        kcal: clean.kcal,
        prot: clean.prot,
        carb: clean.carb,
        fat: clean.fat,
      },
    },
  };
}
