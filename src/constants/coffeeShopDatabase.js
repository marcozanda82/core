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
    aliases: ['espresso amaro', 'caffè amaro', 'caffe amaro', 'espresso', 'caffè nero', 'caffè', 'caffe', 'un caffè', 'un caffe'],
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
    aliases: ['caffè zuccherato', 'caffe zuccherato', 'espresso zuccherato', 'caffè con zucchero', 'caffe con zucchero'],
    kcal: 20,
    prot: 0,
    carb: 5,
    fat: 0,
    caffeineMg: 75,
    isFastingSafe: false,
    servingLabel: '1 tazzina (~5g zucchero)',
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
    name: 'Croissant / Cornetto (1 pezzo)',
    aliases: ['croissant', 'cornetto vuoto', 'cornetto', 'brioche vuota', 'brioche', 'croissant vuoto'],
    kcal: 220,
    prot: 4,
    carb: 28,
    fat: 11,
    caffeineMg: 0,
    isFastingSafe: false,
    servingLabel: '1 pezzo (50g)',
    servingGrams: 50,
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
 * Match per nome / alias (esatto o contenuto). Preferisce match esatto.
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

  // Preferisci alias più lunghi SOLO se contenuti nel needle (es. "caffè zuccherato"),
  // non se il needle corto matcha alias lunghi (evita "caffè" → zuccherato).
  /** @type {{ product: CoffeeShopProduct, keyLen: number }[]} */
  const partials = [];
  for (const product of COFFEE_SHOP_PRODUCTS) {
    const candidates = [product.name, ...(product.aliases || [])];
    for (const cand of candidates) {
      const key = normalizeLookupKey(cand);
      if (!key) continue;
      if (needle === key) {
        return product;
      }
      // Query contiene l'alias completo (es. "vorrei un caffè zuccherato")
      if (needle.includes(key) && key.length >= 4) {
        partials.push({ product, keyLen: key.length });
      }
    }
  }
  if (partials.length === 0) return null;
  partials.sort((a, b) => b.keyLen - a.keyLen);
  return partials[0].product;
}

/**
 * Ricerca testuale sul catalogo locale (più hit, ordinati per pertinenza).
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {CoffeeShopProduct[]}
 */
export function searchCoffeeShopProducts(query, opts = {}) {
  const needle = normalizeLookupKey(query);
  if (!needle) return [];
  const limit = Math.max(1, Math.floor(Number(opts.limit) || 8));
  const qTokens = needle.split(' ').filter(Boolean);

  /** @type {{ product: CoffeeShopProduct, score: number }[]} */
  const scored = [];
  for (const product of COFFEE_SHOP_PRODUCTS) {
    const candidates = [product.name, product.id, ...(product.aliases || [])]
      .map((c) => normalizeLookupKey(c))
      .filter(Boolean);
    let best = 0;
    for (const key of candidates) {
      if (key === needle) {
        best = Math.max(best, 1000);
        continue;
      }
      if (key.startsWith(needle) || needle.startsWith(key)) {
        best = Math.max(best, 920);
        continue;
      }
      if (key.includes(needle) || needle.includes(key)) {
        best = Math.max(best, 840);
        continue;
      }
      if (qTokens.length > 0 && qTokens.every((t) => key.includes(t))) {
        best = Math.max(best, 780);
      }
    }
    if (best > 0) scored.push({ product, score: best });
  }

  scored.sort((a, b) => b.score - a.score || a.product.name.length - b.product.name.length);
  const seen = new Set();
  const out = [];
  for (const entry of scored) {
    if (seen.has(entry.product.id)) continue;
    seen.add(entry.product.id);
    out.push(entry.product);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Riga catalogo compatibile meal builder / ricerca (macro per 100g derivate dalla porzione).
 * @param {CoffeeShopProduct} product
 * @returns {object}
 */
export function coffeeShopProductToCatalogRow(product) {
  if (!product) return null;
  const grams = Number(product.servingGrams) > 0 ? Number(product.servingGrams) : 50;
  const factor = 100 / grams;
  const unitLabel = String(product.servingLabel || (product.kind === 'pastry' ? '1 pezzo' : '1 tazzina')).trim();
  const unitId = unitLabel.toLowerCase().replace(/\s+/g, '_').slice(0, 48) || 'porzione';
  const icon = product.kind === 'pastry' ? '🥐' : '☕';

  return {
    id: `coffee_shop_${product.id}`,
    foodDbKey: `coffee_shop_${product.id}`,
    desc: product.name,
    name: product.name,
    kcal: Math.round((Number(product.kcal) || 0) * factor * 10) / 10,
    cal: Math.round((Number(product.kcal) || 0) * factor * 10) / 10,
    prot: Math.round((Number(product.prot) || 0) * factor * 100) / 100,
    carb: Math.round((Number(product.carb) || 0) * factor * 100) / 100,
    fat: Math.round((Number(product.fat) || 0) * factor * 100) / 100,
    fatTotal: Math.round((Number(product.fat) || 0) * factor * 100) / 100,
    defaultUnitWeight: grams,
    defaultServingWeight: grams,
    defaultUnit: { label: unitLabel, grams, id: unitId },
    units: [{ label: unitLabel, grams, id: unitId }, { label: 'g', grams: 1, id: 'g' }],
    servingLabel: unitLabel,
    servingGrams: grams,
    coffeeShopProductId: product.id,
    caffeineMg: Number(product.caffeineMg) || 0,
    isFastingSafe: product.isFastingSafe === true,
    isCoffeeShopItem: true,
    icon,
    emoji: icon,
    customEmoji: icon,
    foodCategory: product.kind === 'pastry' ? 'sweets_pastry' : 'coffee_beverages',
    source: 'coffee_shop',
    /** Macro assolute della porzione di servizio (non per 100g). */
    servingMacros: {
      kcal: Number(product.kcal) || 0,
      prot: Number(product.prot) || 0,
      carb: Number(product.carb) || 0,
      fat: Number(product.fat) || 0,
    },
  };
}

/**
 * Hit ricerca UniversalSearch / meal builder.
 * @param {CoffeeShopProduct} product
 * @param {{ matchScore?: number }} [meta]
 * @returns {object}
 */
export function coffeeShopProductToSearchResult(product, meta = {}) {
  const row = coffeeShopProductToCatalogRow(product);
  if (!row) return null;
  const score = Number(meta.matchScore) || 0.99;
  return {
    id: row.id,
    key: row.id,
    desc: row.desc,
    name: row.name,
    row,
    _source: 'coffee_shop',
    source: 'KENTU_IT',
    provenance: 'PERSONAL',
    matchScore: score,
    matchType: 'text',
    textScore: score,
    coffeeShopProductId: product.id,
    defaultUnitWeight: row.defaultUnitWeight,
    icon: row.icon,
    customEmoji: row.customEmoji,
  };
}

/**
 * Candidato multi-DB / McDrive da prodotto catalogo.
 * @param {CoffeeShopProduct} product
 * @returns {object}
 */
export function coffeeShopProductToResolverCandidate(product) {
  const row = coffeeShopProductToCatalogRow(product);
  if (!row) return null;
  return {
    fdcId: row.foodDbKey,
    name: product.name,
    confidence: 'high',
    confidenceScore: 1,
    reason: 'Catalogo caffetteria locale',
    source: 'coffee_shop',
    row,
    matchKind: 'exact',
  };
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
