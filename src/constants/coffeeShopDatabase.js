/**
 * Catalogo caffetteria / colazione italiana (SSOT macro + caffeina + digiuno).
 * Usato da log caffè, Diario, chip «il solito» e prompt AI.
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   aliases?: string[],
 *   kcal: number,
 *   prot: number,
 *   carb: number,
 *   fat: number,
 *   caffeineMg: number,
 *   isFastingSafe: boolean,
 *   servingLabel?: string,
 *   servingGrams?: number,
 *   kind?: 'coffee' | 'pastry' | 'combo',
 * }} CoffeeShopProduct
 */

/** @type {ReadonlyArray<CoffeeShopProduct>} */
export const COFFEE_SHOP_PRODUCTS = Object.freeze([
  Object.freeze({
    id: 'espresso_amaro',
    name: 'Caffè espresso amaro',
    aliases: ['espresso amaro', 'caffè amaro', 'caffe amaro', 'espresso', 'caffè nero'],
    kcal: 0,
    prot: 0,
    carb: 0,
    fat: 0,
    caffeineMg: 75,
    isFastingSafe: true,
    servingLabel: '1 tazza',
    servingGrams: 30,
    kind: 'coffee',
  }),
  Object.freeze({
    id: 'americano',
    name: 'Caffè americano',
    aliases: ['americano', 'american coffee'],
    kcal: 2,
    prot: 0,
    carb: 0,
    fat: 0,
    caffeineMg: 120,
    isFastingSafe: true,
    servingLabel: '1 tazza',
    servingGrams: 240,
    kind: 'coffee',
  }),
  Object.freeze({
    id: 'espresso_zuccherato',
    name: 'Caffè zuccherato (1 bustina)',
    aliases: ['caffè zuccherato', 'caffe zuccherato', 'espresso zuccherato', 'caffè con zucchero'],
    kcal: 20,
    prot: 0,
    carb: 5,
    fat: 0,
    caffeineMg: 75,
    isFastingSafe: false,
    servingLabel: '1 tazza',
    servingGrams: 30,
    kind: 'coffee',
  }),
  Object.freeze({
    id: 'macchiato',
    name: 'Caffè macchiato',
    aliases: ['macchiato', 'espresso macchiato'],
    kcal: 15,
    prot: 0.5,
    carb: 1,
    fat: 0.5,
    caffeineMg: 75,
    isFastingSafe: false,
    servingLabel: '1 tazza',
    servingGrams: 40,
    kind: 'coffee',
  }),
  Object.freeze({
    id: 'cortado',
    name: 'Cortado',
    aliases: ['cortado'],
    kcal: 25,
    prot: 1,
    carb: 2,
    fat: 1.5,
    caffeineMg: 75,
    isFastingSafe: false,
    servingLabel: '1 tazza',
    servingGrams: 60,
    kind: 'coffee',
  }),
  Object.freeze({
    id: 'cappuccino',
    name: 'Cappuccino',
    aliases: ['cappuccino'],
    kcal: 100,
    prot: 4,
    carb: 6,
    fat: 4,
    caffeineMg: 75,
    isFastingSafe: false,
    servingLabel: '1 tazza',
    servingGrams: 180,
    kind: 'coffee',
  }),
  Object.freeze({
    id: 'mocaccino',
    name: 'Mocaccino',
    aliases: ['mocaccino', 'mocha', 'caffè mocha'],
    kcal: 140,
    prot: 4,
    carb: 15,
    fat: 6,
    caffeineMg: 75,
    isFastingSafe: false,
    servingLabel: '1 tazza',
    servingGrams: 200,
    kind: 'coffee',
  }),
  Object.freeze({
    id: 'croissant_vuoto',
    name: 'Croissant vuoto',
    aliases: ['croissant', 'cornetto vuoto', 'cornetto', 'brioche vuota', 'brioche'],
    kcal: 220,
    prot: 4,
    carb: 28,
    fat: 11,
    caffeineMg: 0,
    isFastingSafe: false,
    servingLabel: '1 pezzo',
    servingGrams: 55,
    kind: 'pastry',
  }),
]);

/** @type {Readonly<Record<string, CoffeeShopProduct>>} */
export const COFFEE_SHOP_BY_ID = Object.freeze(
  Object.fromEntries(COFFEE_SHOP_PRODUCTS.map((p) => [p.id, p])),
);

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeLookupKey(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {unknown} id
 * @returns {CoffeeShopProduct | null}
 */
export function getCoffeeShopProductById(id) {
  const key = String(id || '').trim();
  return COFFEE_SHOP_BY_ID[key] || null;
}

/**
 * Match per nome / alias (esatto o contenuto).
 * @param {string} rawName
 * @returns {CoffeeShopProduct | null}
 */
export function findCoffeeShopProductByName(rawName) {
  const needle = normalizeLookupKey(rawName);
  if (!needle) return null;

  for (const product of COFFEE_SHOP_PRODUCTS) {
    const candidates = [product.name, product.id, ...(product.aliases || [])];
    for (const cand of candidates) {
      if (normalizeLookupKey(cand) === needle) return product;
    }
  }

  for (const product of COFFEE_SHOP_PRODUCTS) {
    const candidates = [product.name, ...(product.aliases || [])];
    for (const cand of candidates) {
      const key = normalizeLookupKey(cand);
      if (key && (needle.includes(key) || key.includes(needle))) return product;
    }
  }

  return null;
}

/**
 * Risolve prodotto da tipo bevanda UI + variante amaro/zuccherato.
 * @param {string} [coffeeType]
 * @param {string} [coffeeVariant]
 * @returns {CoffeeShopProduct}
 */
export function resolveCoffeeShopProductForLog(coffeeType, coffeeVariant) {
  const type = String(coffeeType || 'espresso').toLowerCase().trim();
  const variant = String(coffeeVariant || 'amaro').toLowerCase().trim();
  const sweet = variant === 'zuccherato';

  if (type === 'cappuccino') return COFFEE_SHOP_BY_ID.cappuccino;
  if (type === 'cortado') return COFFEE_SHOP_BY_ID.cortado;
  if (type === 'mocaccino') return COFFEE_SHOP_BY_ID.mocaccino;
  if (type === 'macchiato') return COFFEE_SHOP_BY_ID.macchiato;
  if (type === 'americano') {
    return sweet ? COFFEE_SHOP_BY_ID.espresso_zuccherato : COFFEE_SHOP_BY_ID.americano;
  }
  return sweet ? COFFEE_SHOP_BY_ID.espresso_zuccherato : COFFEE_SHOP_BY_ID.espresso_amaro;
}

/**
 * Campi opzionali da propagare su item pasto/alimento.
 * @param {CoffeeShopProduct | null | undefined} product
 * @returns {{ caffeineMg?: number, isFastingSafe?: boolean }}
 */
export function coffeeShopExtrasFromProduct(product) {
  if (!product) return {};
  return {
    caffeineMg: Number(product.caffeineMg) || 0,
    isFastingSafe: product.isFastingSafe === true,
  };
}

/**
 * Payload ADD_FOOD con macro esatte dal catalogo (niente inventiva LLM).
 * @param {CoffeeShopProduct} product
 * @param {{ mealType?: string, mealTime?: number }} [opts]
 */
export function coffeeShopProductToFoodPayload(product, opts = {}) {
  if (!product) return null;
  const grams = Number(product.servingGrams) > 0 ? Number(product.servingGrams) : 50;
  return {
    foodName: product.name,
    grams,
    mealType: opts.mealType || 'colazione',
    ...(Number.isFinite(Number(opts.mealTime)) ? { mealTime: Number(opts.mealTime) } : {}),
    coffeeShopProductId: product.id,
    caffeineMg: Number(product.caffeineMg) || 0,
    isFastingSafe: product.isFastingSafe === true,
    userProvidedMacros: {
      kcal: Number(product.kcal) || 0,
      prot: Number(product.prot) || 0,
      carb: Number(product.carb) || 0,
      fat: Number(product.fat) || 0,
    },
  };
}

/**
 * Riga Diario da prodotto / nodo stimolante caffè.
 * @param {object} node
 * @returns {object}
 */
export function coffeeShopNodeToDiaryFoodRow(node) {
  const product = getCoffeeShopProductById(node?.coffeeShopProductId)
    || findCoffeeShopProductByName(node?.label || node?.desc || node?.name)
    || null;
  const kcal = Number(node?.kcal ?? product?.kcal ?? 0) || 0;
  const caffeineMg = Number(node?.caffeineMg ?? product?.caffeineMg ?? 0) || 0;
  const isFastingSafe = node?.isFastingSafe === true
    || (node?.isFastingSafe == null && product?.isFastingSafe === true)
    || (node?.breaksFast === false && kcal < 10);
  const name = String(node?.label || node?.desc || node?.name || product?.name || 'Caffè').trim();
  const time = Number(node?.time ?? node?.mealTime);
  const mealTime = Number.isFinite(time) ? time : 8;

  return {
    id: node?.id || `coffee_${Date.now()}`,
    type: node?.type === 'stimulant' ? 'stimulant' : 'food',
    desc: name,
    name,
    qta: product?.servingGrams ?? node?.qta ?? null,
    weight: product?.servingGrams ?? node?.weight ?? null,
    servingLabel: product?.servingLabel || '1 tazza',
    kcal,
    cal: kcal,
    prot: Number(node?.prot ?? product?.prot ?? 0) || 0,
    carb: Number(node?.carb ?? product?.carb ?? 0) || 0,
    fat: Number(node?.fat ?? product?.fat ?? 0) || 0,
    fatTotal: Number(node?.fat ?? product?.fat ?? 0) || 0,
    caffeineMg,
    isFastingSafe,
    coffeeShopProductId: product?.id || node?.coffeeShopProductId || null,
    mealType: node?.mealType || 'colazione',
    mealTime,
    isCoffeeShopItem: true,
  };
}

/**
 * Blocco testo per system prompt / Global State (valori esatti, no inventiva).
 * @returns {string}
 */
export function formatCoffeeShopDatabaseForPrompt() {
  const lines = COFFEE_SHOP_PRODUCTS.map((p) => (
    `- ${p.name} [id=${p.id}]: ${p.kcal} kcal, P ${p.prot}g, C ${p.carb}g, F ${p.fat}g, `
    + `caffeina ${p.caffeineMg}mg, isFastingSafe=${p.isFastingSafe}`
  ));
  return [
    '[COFFEE_SHOP_DATABASE] Catalogo interno caffetteria/colazione (USARE QUESTI VALORI ESATTI):',
    ...lines,
    'Se l\'utente dice «caffè», «il solito», «cappuccino», «croissant», ecc.: pesca da qui.',
    'VIETATO inventare macro/caffeina. Se isFastingSafe=true e kcal≈0 → digiuno NON interrotto.',
  ].join('\n');
}
