const EMOJI_RULES = [
  { keywords: ['pollo', 'tacchino', 'chicken', 'turkey', 'cotoletta', 'cotolette', 'cutlet', 'schnitzel', 'impanat'], emoji: '🍗' },
  { keywords: ['manzo', 'vitello', 'maiale', 'carne', 'bistecca', 'hamburger', 'beef', 'pork', 'costoletta'], emoji: '🥩' },
  { keywords: ['salmone', 'tonno', 'pesce', 'merluzzo', 'gamber', 'calam', 'fish', 'sushi'], emoji: '🐟' },
  { keywords: ['uovo', 'uova', 'egg'], emoji: '🥚' },
  { keywords: ['latte', 'yogurt', 'kefir', 'milk'], emoji: '🥛' },
  { keywords: ['formaggio', 'mozzarella', 'parmigiano', 'feta', 'cheese'], emoji: '🧀' },
  { keywords: ['pane', 'fetta', 'toast', 'grissino', 'bread'], emoji: '🍞' },
  { keywords: ['pasta', 'spaghetti', 'penne', 'rigatoni', 'lasagne', 'noodle'], emoji: '🍝' },
  { keywords: ['riso', 'risotto', 'rice'], emoji: '🍚' },
  { keywords: ['pizza'], emoji: '🍕' },
  { keywords: ['mela', 'apple'], emoji: '🍎' },
  { keywords: ['banana'], emoji: '🍌' },
  { keywords: ['arancia', 'agrume', 'orange'], emoji: '🍊' },
  { keywords: ['fragola', 'berry', 'mirtill'], emoji: '🍓' },
  { keywords: ['verdura', 'insalata', 'lattuga', 'spinac', 'broccol', 'zucchin', 'carota', 'salad'], emoji: '🥗' },
  { keywords: ['patata', 'potato'], emoji: '🥔' },
  { keywords: ['avocado'], emoji: '🥑' },
  { keywords: ['olio', 'olive'], emoji: '🫒' },
  { keywords: ['dolce', 'biscott', 'cookie', 'torta', 'cioccolat', 'gelato', 'dessert'], emoji: '🍪' },
  { keywords: ['caffè', 'espresso', 'coffee', 'cappuccino'], emoji: '☕' },
  { keywords: ['tè', 'tea'], emoji: '🍵' },
  { keywords: ['acqua', 'water'], emoji: '💧' },
  { keywords: ['birra', 'vino', 'wine', 'beer'], emoji: '🍷' },
  { keywords: ['proteine', 'whey', 'shake'], emoji: '🥤' },
  { keywords: ['noci', 'mandorl', 'nut', 'almond'], emoji: '🥜' },
];

const FALLBACK_EMOJI = '🍲';

export function getFoodEmoji(foodName) {
  const normalized = String(foodName || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!normalized) return FALLBACK_EMOJI;

  for (const rule of EMOJI_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.emoji;
    }
  }

  return FALLBACK_EMOJI;
}

function pickVisualField(sources, key) {
  for (let i = 0; i < sources.length; i += 1) {
    const value = sources[i]?.[key];
    if (value != null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return null;
}

export function resolveFoodVisual(food, personalDb) {
  const name = String(food?.desc || food?.name || food?.label || 'Alimento').trim();
  const dbKey = food?.foodDbKey ?? food?.key ?? food?.id;
  const dbEntry = dbKey && personalDb?.[dbKey] ? personalDb[dbKey] : null;
  const sources = [food, food?.row, dbEntry].filter(Boolean);

  const customImage = pickVisualField(sources, 'customImage');
  const customEmoji = pickVisualField(sources, 'customEmoji');
  const iconOverride = pickVisualField(sources, 'iconOverride');
  const iconTag = pickVisualField(sources, 'iconTag');
  const customIcon = pickVisualField(sources, 'customIcon');
  const semanticIconTag = iconOverride || iconTag || customIcon || null;

  return {
    name,
    customImage,
    customEmoji,
    customIcon,
    iconOverride,
    iconTag,
    semanticIconTag,
  };
}

export function formatMealSlotLabel(slot) {
  const raw = String(slot || 'pasto').split('_')[0].trim();
  if (!raw) return 'Pasto';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const MEAL_SLOT_GRAMMAR = {
  colazione: { gender: 'f', label: 'Colazione' },
  cena: { gender: 'f', label: 'Cena' },
  pranzo: { gender: 'm', label: 'Pranzo' },
  snack: { gender: 'm', label: 'Snack' },
};

function resolveMealSlotGrammar(slot) {
  const key = String(slot || 'pasto').split('_')[0].trim().toLowerCase();
  return MEAL_SLOT_GRAMMAR[key] ?? {
    gender: 'm',
    label: formatMealSlotLabel(slot),
  };
}

/** Titolo checkout: "Il tuo Pranzo", "La tua Colazione", … */
export function formatCheckoutMealTitle(slot) {
  const { gender, label } = resolveMealSlotGrammar(slot);
  const article = gender === 'f' ? 'La tua' : 'Il tuo';
  return `${article} ${label}`;
}

/** Etichetta mini-cart: "Vedi il tuo Pranzo", "Vedi la tua Colazione", … */
export function formatMiniCartMealLabel(slot) {
  const { gender, label } = resolveMealSlotGrammar(slot);
  const prefix = gender === 'f' ? 'Vedi la tua' : 'Vedi il tuo';
  return `${prefix} ${label}`;
}
