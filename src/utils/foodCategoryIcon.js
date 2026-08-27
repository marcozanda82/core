/**
 * Categorie alimento → icona (lavagna / costruttore pasti).
 * Bozza: placeholder neutro. Post-calcolo: emoji granulare da nome, altrimenti categoria.
 */

import {
  NEUTRAL_FOOD_VISUAL_EMOJI,
  resolveFoodVisualEmoji,
} from './foodVisualResolver.js';

export const FOOD_CATEGORY = Object.freeze({
  BREAD_GRAINS: 'bread_grains',
  MEAT_POULTRY: 'meat_poultry',
  FISH_SEAFOOD: 'fish_seafood',
  DAIRY_EGGS: 'dairy_eggs',
  FRUITS: 'fruits',
  VEGETABLES: 'vegetables',
  OILS_FATS: 'oils_fats',
  COFFEE_BEVERAGES: 'coffee_beverages',
  SWEETS_PASTRY: 'sweets_pastry',
  GENERIC: 'generic',
});

/** Placeholder neutro in bozza (prima di Calcola Valori / risoluzione). */
export const DRAFT_FOOD_ICON_EMOJI = '🍽️';

/** Fallback sicuro per piatti composti / ambigui (niente insalata). */
export const GENERIC_FOOD_ICON_EMOJI = NEUTRAL_FOOD_VISUAL_EMOJI;

/** @type {Readonly<Record<string, string>>} */
export const FOOD_CATEGORY_ICON = Object.freeze({
  [FOOD_CATEGORY.BREAD_GRAINS]: '🍞',
  [FOOD_CATEGORY.MEAT_POULTRY]: '🍗',
  [FOOD_CATEGORY.FISH_SEAFOOD]: '🐟',
  [FOOD_CATEGORY.DAIRY_EGGS]: '🥚',
  [FOOD_CATEGORY.FRUITS]: '🍎',
  [FOOD_CATEGORY.VEGETABLES]: '🥗',
  [FOOD_CATEGORY.OILS_FATS]: '🫒',
  [FOOD_CATEGORY.COFFEE_BEVERAGES]: '☕',
  [FOOD_CATEGORY.SWEETS_PASTRY]: '🥐',
  [FOOD_CATEGORY.GENERIC]: GENERIC_FOOD_ICON_EMOJI,
});

/**
 * Regole ordinate: match più specifici prima (es. fette biscottate prima di biscotti).
 * @type {ReadonlyArray<{ category: string, keywords: string[] }>}
 */
const CATEGORY_RULES = Object.freeze([
  {
    category: FOOD_CATEGORY.BREAD_GRAINS,
    keywords: [
      'fette biscottate', 'fetta biscottata', 'biscottate', 'biscottati',
      'cracker', 'gallett', 'grissin', 'pane', 'toast', 'focaccia', 'piadina',
      'pasta', 'spaghetti', 'penne', 'fusilli', 'rigatoni', 'lasagne', 'tagliatelle',
      'riso', 'risotto', 'cereali', 'avena', 'fiocchi', 'farro', 'orzo', 'quinoa',
      'couscous', 'cous cous', 'grano', 'cornflakes', 'muesli', 'bread', 'rice', 'noodle',
    ],
  },
  {
    category: FOOD_CATEGORY.SWEETS_PASTRY,
    keywords: [
      'cornetto', 'croissant', 'brioche', 'bombolone', 'krapfen',
      'biscott', 'cookie', 'torta', 'dolce', 'dessert', 'cioccolat', 'gelato',
      'muffin', 'brownie', 'crostat', 'panettone', 'colomba', 'cannolo',
    ],
  },
  {
    category: FOOD_CATEGORY.COFFEE_BEVERAGES,
    keywords: [
      'caff', 'espresso', 'cappuccino', 'macchiato', 'americano', 'cortado', 'mocaccino',
      'coffee', 'te ', 'tè', 'tea', 'tisana', 'infuso', 'succo', 'smoothie', 'shake',
      'bevanda', 'acqua', 'water', 'bibita',
    ],
  },
  {
    category: FOOD_CATEGORY.MEAT_POULTRY,
    keywords: [
      'pollo', 'tacchino', 'chicken', 'turkey', 'cotoletta', 'manzo', 'vitello', 'maiale',
      'carne', 'bistecca', 'prosciutto', 'bresaola', 'hamburger', 'beef', 'pork',
      'salsicc', 'wurstel', 'petto di',
    ],
  },
  {
    category: FOOD_CATEGORY.FISH_SEAFOOD,
    keywords: [
      'pesce', 'tonno', 'salmone', 'merluzzo', 'orata', 'branzino', 'gamber', 'calamar',
      'fish', 'tuna', 'salmon', 'sgombro', 'alici', 'sardine', 'cozze', 'vongole', 'sushi',
    ],
  },
  {
    category: FOOD_CATEGORY.DAIRY_EGGS,
    keywords: [
      'uovo', 'uova', 'albume', 'egg', 'latte', 'yogurt', 'kefir', 'skyr', 'formaggio',
      'mozzarella', 'parmigiano', 'ricotta', 'feta', 'cheese', 'milk', 'fiocchi di latte',
    ],
  },
  {
    category: FOOD_CATEGORY.FRUITS,
    keywords: [
      'mela', 'banana', 'arancia', 'pera', 'pesca', 'kiwi', 'uva', 'fragol', 'mirtill',
      'lampone', 'frutti di bosco', 'frutta', 'apple', 'orange', 'berry', 'fruit',
      'ananas', 'mango', 'anguria', 'melone',
    ],
  },
  {
    category: FOOD_CATEGORY.VEGETABLES,
    keywords: [
      'insalata', 'lattuga', 'verdura', 'verdure', 'spinac', 'broccoli', 'zucchina',
      'carota', 'peperone', 'melanzana', 'pomodoro', 'passata', 'cetriolo', 'finocchio',
      'cavolo', 'salad', 'tomato', 'vegetable',
    ],
  },
  {
    category: FOOD_CATEGORY.OILS_FATS,
    keywords: [
      'olio', 'burro', 'olive', 'oil', 'butter', 'noci', 'mandorl', 'nocciol', 'arachid',
      'pistacchi', 'anacardi', 'avocado', 'semi di', 'tahina', 'maionese',
    ],
  },
]);

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeFoodCategoryText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * @param {string} category
 * @returns {string}
 */
export function iconForFoodCategory(category) {
  const key = String(category || '').trim();
  return FOOD_CATEGORY_ICON[key] || GENERIC_FOOD_ICON_EMOJI;
}

/**
 * Classifica un nome alimento. Match ambigui / piatti composti → generic.
 * @param {string} foodName
 * @param {{ foodCategory?: string|null, allowAmbiguous?: boolean }} [opts]
 * @returns {string} foodCategory key
 */
export function resolveFoodCategory(foodName, opts = {}) {
  const explicit = String(opts.foodCategory || '').trim();
  if (explicit && FOOD_CATEGORY_ICON[explicit]) return explicit;

  const n = normalizeFoodCategoryText(foodName);
  if (!n) return FOOD_CATEGORY.GENERIC;

  // Piatti composti tipici → non forzare una categoria fuorviante.
  if (
    /\b(sugo|rag[uù]|minestrone|zuppa|insalatona|piatto|ricetta|homemade|casaling)\b/.test(n)
    || /\s\+\s/.test(n)
    || / e /.test(n) && n.split(' e ').length > 2
  ) {
    return FOOD_CATEGORY.GENERIC;
  }

  /** @type {string[]} */
  const hits = [];
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => n.includes(normalizeFoodCategoryText(kw)))) {
      hits.push(rule.category);
      // Prima regola (più specifica nell’ordine) vince se unica famiglia
      break;
    }
  }

  if (hits.length === 1) return hits[0];
  return FOOD_CATEGORY.GENERIC;
}

/**
 * Icona post-risoluzione: prima keyword granulare sul nome, poi categoria.
 * @param {string} foodName
 * @param {{ foodCategory?: string|null, macros?: object|null }} [opts]
 * @returns {string} emoji
 */
export function getResolvedFoodCategoryIcon(foodName, opts = {}) {
  const granular = resolveFoodVisualEmoji(foodName, opts.foodCategory);
  if (granular && granular !== NEUTRAL_FOOD_VISUAL_EMOJI) return granular;
  const category = resolveFoodCategory(foodName, { foodCategory: opts.foodCategory });
  return iconForFoodCategory(category);
}

/**
 * Display icona per riga lavagna / draft.
 * @param {object|null|undefined} item
 * @param {{ isDraft?: boolean }} [opts]
 * @returns {string}
 */
export function resolveMealItemDisplayIcon(item, opts = {}) {
  if (opts.isDraft === true) return DRAFT_FOOD_ICON_EMOJI;

  const status = String(item?.status || '').toLowerCase();
  const isRawDraft = status === 'raw'
    || status === 'processing'
    || status === 'validating'
    || (opts.isDraft !== false
      && !item?.foodDbKey
      && !(Number(item?.kcal) > 0)
      && !item?.icon
      && !item?.foodCategory);

  if (isRawDraft) return DRAFT_FOOD_ICON_EMOJI;

  const stored = String(item?.icon || item?.emoji || '').trim();
  if (stored) return stored;

  const name = String(item?.foodName || item?.name || item?.desc || '').trim();
  return getResolvedFoodCategoryIcon(name, {
    foodCategory: item?.foodCategory || item?.iconKey || null,
    macros: {
      kcal: item?.kcal,
      prot: item?.pro ?? item?.prot,
      carb: item?.carbo ?? item?.carb,
      fat: item?.fat,
    },
  });
}

/**
 * Arricchisce un item risolto con foodCategory + icon.
 * @param {object} item
 * @returns {object}
 */
export function attachResolvedFoodIcon(item) {
  if (!item || typeof item !== 'object') return item;
  const name = String(item.foodName || item.name || item.desc || '').trim();
  const foodCategory = resolveFoodCategory(name, {
    foodCategory: item.foodCategory || item.iconKey || null,
  });
  const icon = String(item.icon || '').trim()
    || iconForFoodCategory(foodCategory);
  return {
    ...item,
    foodCategory,
    iconKey: foodCategory,
    icon,
  };
}
