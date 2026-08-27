/**
 * Resolver visivo granulare per catalogo / Registra Pasto.
 * Keyword sul nome normalizzato → emoji specifica; fallback 🍽️.
 */

/** @type {ReadonlyArray<{ emoji: string, keywords: string[] }>} */
const FOOD_VISUAL_RULES = Object.freeze([
  // Salse / conserve pomodoro (prima del pomodoro fresco)
  { emoji: '🥫', keywords: ['passata', 'passato', 'pelati', 'sugo', 'salsa di pomodoro', 'concentrato di pomodoro'] },
  { emoji: '🍅', keywords: ['pomodoro', 'pomodori', 'ciliegino', 'ciliegini', 'datterino', 'datterini', 'tomato'] },

  { emoji: '🍆', keywords: ['melanzana', 'melanzane', 'eggplant'] },
  { emoji: '🫑', keywords: ['peperone', 'peperoni', 'pepper'] },
  { emoji: '🥒', keywords: ['zucchina', 'zucchine', 'cetriolo', 'cetrioli', 'zucchini', 'cucumber'] },

  { emoji: '🥬', keywords: ['spinaci', 'spinacio', 'lattuga', 'rucola', 'biete', 'bietola', 'cicoria', 'radicchio', 'foglie'] },
  { emoji: '🥗', keywords: ['insalata', 'insalatone', 'verdura a foglia', 'misticanza', 'salad'] },

  { emoji: '🥕', keywords: ['carota', 'carote', 'carrot'] },
  { emoji: '🥦', keywords: ['broccolo', 'broccoli', 'cavolfiore', 'cavolfiori', 'broccolini'] },
  { emoji: '🍄', keywords: ['funghi', 'fungo', 'champignon', 'porcini', 'mushroom'] },
  { emoji: '🥔', keywords: ['patata', 'patate', 'potato', 'patatine'] },

  { emoji: '🦐', keywords: ['gamberi', 'gambero', 'gamberetti', 'calamari', 'calamaro', 'frutti di mare', 'cozze', 'vongole', 'seafood', 'shrimp'] },
  { emoji: '🐟', keywords: ['merluzzo', 'tonno', 'salmone', 'branzino', 'orata', 'pesce', 'sgombro', 'alici', 'sardine', 'trota', 'fish', 'tuna', 'salmon'] },

  { emoji: '🥩', keywords: ['manzo', 'bistecca', 'macinato', 'vitello', 'maiale', 'carne', 'hamburger', 'prosciutto', 'bresaola', 'beef', 'pork', 'steak'] },
  { emoji: '🍗', keywords: ['pollo', 'tacchino', 'coniglio', 'pollame', 'petto di pollo', 'chicken', 'turkey'] },

  { emoji: '🍳', keywords: ['omelette', 'frittata', 'uovo', 'uova', 'albume', 'egg', 'eggs'] },
  { emoji: '🥛', keywords: ['latte', 'yogurt', 'yoghurt', 'kefir', 'skyr', 'milk'] },
  { emoji: '🧀', keywords: ['formaggio', 'parmigiano', 'ricotta', 'mozzarella', 'feta', 'grana', 'pecorino', 'cheese'] },

  { emoji: '🍚', keywords: ['risotto', 'basmati', 'riso', 'rice'] },
  { emoji: '🍝', keywords: ['spaghetti', 'penne', 'fusilli', 'rigatoni', 'tagliatelle', 'lasagne', 'semola', 'pasta', 'noodle'] },

  { emoji: '🥖', keywords: ['bauletto', 'baguette', 'filone'] },
  { emoji: '🍞', keywords: ['pane', 'panino', 'toast', 'focaccia', 'piadina', 'bread'] },
  { emoji: '🍘', keywords: ['gallette', 'galletta', 'cracker', 'crackers', 'gallett'] },
  { emoji: '🥪', keywords: ['fette biscottate', 'fetta biscottata', 'biscottate'] },

  { emoji: '🥣', keywords: ['cereali', 'fiocchi', 'muesli', 'cornflakes', 'avena', 'porridge'] },
  { emoji: '🍪', keywords: ['biscotti', 'biscotto', 'frollini', 'frollino', 'cookie', 'cookies'] },
  { emoji: '🥐', keywords: ['croissant', 'cornetto', 'brioche', 'bombolone', 'krapfen'] },

  { emoji: '🫒', keywords: ['olio evo', 'olio extravergine', 'olio di oliva', 'olio', 'olive oil'] },
  { emoji: '🧈', keywords: ['burro', 'butter', 'margarina'] },

  { emoji: '🍎', keywords: ['mela', 'mele', 'apple'] },
  { emoji: '🍌', keywords: ['banana', 'banane'] },
  { emoji: '🍊', keywords: ['arancia', 'arance', 'mandarino', 'clementina', 'orange'] },
  { emoji: '🍓', keywords: ['fragole', 'fragola', 'strawberry'] },
  { emoji: '🥑', keywords: ['avocado'] },
  { emoji: '🍋', keywords: ['limone', 'limoni', 'lime', 'lemon'] },

  { emoji: '☕', keywords: ['cappuccino', 'espresso', 'macchiato', 'caffè', 'caffe', 'coffee'] },
]);

/** Fallback neutro elegante. */
export const NEUTRAL_FOOD_VISUAL_EMOJI = '🍽️';

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeFoodVisualText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Pulisce titoli DB con parentesi rotte / refusi (es. "pomodoro ) ) (1 100 g)").
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeFoodDisplayName(raw) {
  let s = String(raw || '').trim();
  if (!s) return 'Alimento';

  s = s.replace(/\s+/g, ' ');
  // Collassa parentesi chiuse ripetute: ") )" / "))"
  s = s.replace(/\)\s*\)+/g, ')');
  // Spazi orfani prima di ")" → ")"
  s = s.replace(/\s+\)/g, ')');
  // Parentesi vuote
  s = s.replace(/\(\s*\)/g, '');
  // "(1 100 g)" / "(100 g)" / "(100 grams)" → "(100g)"
  s = s.replace(/\(\s*(?:\d+\s+)?(\d+(?:[.,]\d+)?)\s*g(?:rams?|rammi)?\s*\)/gi, '($1g)');
  // Rimuovi ")" orfane finali senza "(" corrispondente
  {
    let open = 0;
    let cleaned = '';
    for (const ch of s) {
      if (ch === '(') {
        open += 1;
        cleaned += ch;
      } else if (ch === ')') {
        if (open > 0) {
          open -= 1;
          cleaned += ch;
        }
      } else {
        cleaned += ch;
      }
    }
    s = cleaned.replace(/\(\s*$/g, '').trim();
  }
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return 'Alimento';

  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Associa emoji al nome (e opzionalmente a una categoria grezza come hint debole).
 * @param {string} foodName
 * @param {string|null|undefined} [category]
 * @returns {string} emoji
 */
export function resolveFoodVisualEmoji(foodName, category = null) {
  const n = normalizeFoodVisualText(foodName);
  if (n) {
    for (const rule of FOOD_VISUAL_RULES) {
      if (rule.keywords.some((kw) => n.includes(normalizeFoodVisualText(kw)))) {
        return rule.emoji;
      }
    }
  }

  // Hint debole da categoria esplicita (mai sovrascrive match nome)
  const cat = normalizeFoodVisualText(category);
  if (cat) {
    if (/(fish|seafood|pesce)/.test(cat)) return '🐟';
    if (/(meat|carne|poultry|pollo)/.test(cat)) return /poultry|pollo|chicken/.test(cat) ? '🍗' : '🥩';
    if (/(dairy|latte|cheese|formaggio)/.test(cat)) return /cheese|formaggio/.test(cat) ? '🧀' : '🥛';
    if (/(egg)/.test(cat)) return '🍳';
    if (/(fruit)/.test(cat)) return '🍎';
    if (/(vegetable|verdura)/.test(cat)) return '🥬';
    if (/(bread|grain|pasta|riso|rice)/.test(cat)) return /pasta/.test(cat) ? '🍝' : '🍞';
    if (/(oil|fat|olio)/.test(cat)) return '🫒';
    if (/(coffee|caff)/.test(cat)) return '☕';
    if (/(sweet|dessert)/.test(cat)) return '🍪';
  }

  return NEUTRAL_FOOD_VISUAL_EMOJI;
}

/**
 * API compatta: nome + categoria → simbolo visivo.
 * @param {string} foodName
 * @param {string|null|undefined} [category]
 * @returns {string}
 */
export function resolveFoodVisual(foodName, category) {
  return resolveFoodVisualEmoji(foodName, category);
}
