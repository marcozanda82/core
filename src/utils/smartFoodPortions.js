/**
 * Porzioni default intelligenti: bevande / pezzi vs alimenti sfusi (100g).
 */

import {
  findCoffeeShopProductByName,
  coffeeShopProductToCatalogRow,
} from '../constants/coffeeShopDatabase.js';

/** Heuristiche pezzi/unità quando non c'è match coffee shop. */
const PIECE_PORTION_RULES = Object.freeze([
  { keywords: ['fetta biscottata', 'fette biscottate', 'biscottata'], grams: 8, label: '1 fetta', kind: 'piece' },
  { keywords: ['cracker', 'galletta', 'gallette'], grams: 10, label: '1 pezzo', kind: 'piece' },
  { keywords: ['uovo', 'uova'], grams: 60, label: '1 uovo', kind: 'piece' },
  { keywords: ['banana', 'banane'], grams: 120, label: '1 banana', kind: 'piece' },
  { keywords: ['mela', 'mele'], grams: 180, label: '1 mela', kind: 'piece' },
  { keywords: ['arancia', 'arance'], grams: 150, label: '1 arancia', kind: 'piece' },
  { keywords: ['pane', 'panino', 'bauletto'], grams: 50, label: '1 fetta', kind: 'piece' },
  { keywords: ['yogurt'], grams: 125, label: '1 vasetto', kind: 'piece' },
]);

const BULK_KEYWORDS = Object.freeze([
  'pasta', 'spaghetti', 'penne', 'riso', 'risotto', 'farro', 'orzo', 'quinoa',
  'petto di pollo', 'pollo', 'manzo', 'macinato', 'carne', 'tonno fresco',
  'passata', 'olio', 'farina',
]);

function normalizePortionText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} foodName
 * @returns {{
 *   grams: number,
 *   servingLabel: string,
 *   kind: 'coffee'|'pastry'|'piece'|'bulk',
 *   isEstimated: boolean,
 *   coffeeShopProductId?: string|null,
 *   product?: object|null,
 *   row?: object|null,
 * }}
 */
export function resolveSmartDefaultPortion(foodName) {
  const name = String(foodName || '').trim();
  const product = findCoffeeShopProductByName(name);
  if (product) {
    const grams = Number(product.servingGrams) > 0 ? Number(product.servingGrams) : 50;
    const row = coffeeShopProductToCatalogRow(product);
    return {
      grams,
      servingLabel: String(product.servingLabel || '1 porzione'),
      kind: product.kind === 'pastry' ? 'pastry' : 'coffee',
      isEstimated: false,
      coffeeShopProductId: product.id,
      product,
      row,
    };
  }

  const n = normalizePortionText(name);
  if (!n) {
    return {
      grams: 100,
      servingLabel: '100 g',
      kind: 'bulk',
      isEstimated: true,
      coffeeShopProductId: null,
      product: null,
      row: null,
    };
  }

  for (const rule of PIECE_PORTION_RULES) {
    if (rule.keywords.some((kw) => n.includes(normalizePortionText(kw)))) {
      return {
        grams: rule.grams,
        servingLabel: rule.label,
        kind: 'piece',
        isEstimated: true,
        coffeeShopProductId: null,
        product: null,
        row: null,
      };
    }
  }

  const isBulk = BULK_KEYWORDS.some((kw) => n.includes(normalizePortionText(kw)));
  return {
    grams: isBulk ? 100 : 100,
    servingLabel: '100 g',
    kind: 'bulk',
    isEstimated: true,
    coffeeShopProductId: null,
    product: null,
    row: null,
  };
}

/**
 * Default grammi per draft / lavagna (no 100g cieco su caffè/croissant).
 * @param {string} foodName
 * @param {number} [fallback=100]
 * @returns {number}
 */
export function resolveSmartDefaultGrams(foodName, fallback = 100) {
  const portion = resolveSmartDefaultPortion(foodName);
  return Math.max(1, Math.round(Number(portion.grams) || fallback));
}
