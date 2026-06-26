import React from 'react';
import { FOOD_ICONS_LIBRARY, FoodIconVisual, getFoodIconEntry, resolveIconTagId } from '../features/mealBuilder/utils/FoodIcons';

export const DEFAULT_ICON_TAG = 'bowl';

const VALID_ICON_TAGS = new Set(FOOD_ICONS_LIBRARY.map((entry) => entry.id));

const ICON_TAG_RULES = [
  {
    tag: 'poultry',
    keywords: [
      'pollo', 'tacchino', 'chicken', 'turkey', 'cotoletta', 'cotolette', 'cutlet',
      'schnitzel', 'impanat', 'nugget', 'wings', 'drumstick',
    ],
  },
  {
    tag: 'meat',
    keywords: [
      'manzo', 'vitello', 'maiale', 'carne', 'bistecca', 'hamburger', 'beef', 'pork',
      'costoletta', 'salame', 'prosciutto', 'mortadella', 'bresaola', 'speck', 'wurstel',
      'sausage', 'ham', 'bacon', 'steak', 'meatball', 'ragu', 'ragù',
    ],
  },
  {
    tag: 'seafood',
    keywords: [
      'gamber', 'gambero', 'gamberetti', 'calam', 'seppia', 'polpo', 'cozze', 'vongole',
      'shrimp', 'prawn', 'squid', 'octopus', 'mussel', 'clam', 'shellfish', 'frutti di mare',
    ],
  },
  {
    tag: 'fish',
    keywords: [
      'salmone', 'tonno', 'pesce', 'merluzzo', 'fish', 'sushi', 'trota', 'sardina',
      'acciuga', 'branzino', 'orata', 'cod', 'tuna', 'salmon', 'trout',
    ],
  },
  {
    tag: 'eggs',
    keywords: ['uovo', 'uova', 'egg', 'omelette', 'frittata'],
  },
  {
    tag: 'cheese',
    keywords: [
      'formaggio', 'mozzarella', 'parmigiano', 'feta', 'cheese', 'grana', 'pecorino',
      'ricotta', 'stracchino', 'gorgonzola', 'emmental', 'cheddar',
    ],
  },
  {
    tag: 'dairy',
    keywords: [
      'latte', 'yogurt', 'yoghurt', 'kefir', 'milk', 'dairy', 'panna', 'cream',
      'bevanda vegetale', 'plant based drink',
    ],
  },
  {
    tag: 'bread',
    keywords: [
      'pane', 'fetta', 'toast', 'grissino', 'bread', 'cracker', 'grissini', 'focaccia',
      'piadina', 'wrap', 'tortilla', 'brioche', 'croissant', 'biscotto', 'cookie',
      'biscuit', 'cereal', 'cereali', 'muesli', 'granola',
    ],
  },
  {
    tag: 'pasta',
    keywords: [
      'pasta', 'spaghetti', 'penne', 'rigatoni', 'lasagne', 'noodle', 'noodles',
      'maccheroni', 'fusilli', 'ravioli', 'gnocchi', 'riso', 'risotto', 'rice',
    ],
  },
  {
    tag: 'fruit',
    keywords: [
      'mela', 'apple', 'banana', 'arancia', 'orange', 'fragola', 'berry', 'mirtill',
      'uva', 'pera', 'pesca', 'albicocca', 'kiwi', 'ananas', 'pineapple', 'frutta',
      'fruit', 'succo', 'juice', 'smoothie',
    ],
  },
  {
    tag: 'vegetables',
    keywords: [
      'verdura', 'insalata', 'lattuga', 'spinac', 'broccol', 'zucchin', 'carota', 'salad',
      'pomodoro', 'tomato', 'peperone', 'melanzana', 'legume', 'fagiol', 'lenticch',
      'ceci', 'chickpea', 'bean', 'vegetable', 'verdure',
    ],
  },
  {
    tag: 'oil',
    keywords: ['olio', 'olive', 'oil', 'extravergine', 'margarina', 'burro', 'butter'],
  },
  {
    tag: 'sweets',
    keywords: [
      'dolce', 'biscott', 'torta', 'cioccolat', 'gelato', 'dessert', 'candy', 'barrette',
      'snack', 'wafer', 'merendine', 'pasticceria', 'chocolate', 'sweet', 'honey', 'miele',
    ],
  },
  {
    tag: 'coffee',
    keywords: ['caffè', 'caffe', 'espresso', 'coffee', 'cappuccino', 'macchiato', 'caffeina'],
  },
  {
    tag: 'drinks',
    keywords: [
      'acqua', 'water', 'birra', 'vino', 'wine', 'beer', 'bevanda', 'drink', 'soda',
      'cola', 'energy drink', 'the', 'tè', 'tea', 'proteine', 'whey', 'shake',
    ],
  },
];

function normalizeSemanticText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Assegna un tag icona semantico (id di `FOOD_ICONS_LIBRARY`) da nome prodotto e hint opzionale.
 *
 * @param {string} name Nome/descrizione prodotto (es. da Open Food Facts)
 * @param {string} [categoryHint] Categoria o brands aggiuntivi
 * @returns {string} id icona (`meat`, `dairy`, …) oppure stringa vuota
 */
export function calculateAutoIconTag(name, categoryHint = '') {
  const haystack = normalizeSemanticText(`${name || ''} ${categoryHint || ''}`);
  if (!haystack) return '';

  for (const rule of ICON_TAG_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(normalizeSemanticText(keyword)))) {
      return VALID_ICON_TAGS.has(rule.tag) ? rule.tag : '';
    }
  }

  return VALID_ICON_TAGS.has('bowl') ? 'bowl' : '';
}

function resolveRenderableIconTag(tag) {
  const normalized = resolveIconTagId(tag);
  if (normalized) return normalized;
  return getFoodIconEntry(DEFAULT_ICON_TAG) ? DEFAULT_ICON_TAG : null;
}

/**
 * Renderizza un'icona vettoriale da tag semantico (`iconTag`, `iconOverride`, …).
 *
 * @param {string} tag id icona (es. `meat`, `dairy`)
 * @param {{ iconClassName?: string, wrapperClassName?: string, className?: string }} [options]
 * @returns {React.ReactElement|null}
 */
export function renderIconFromTag(tag, options = {}) {
  const iconId = resolveRenderableIconTag(tag);
  if (!iconId) return null;

  return (
    <FoodIconVisual
      iconId={iconId}
      iconClassName={options.iconClassName ?? 'h-6 w-6'}
      wrapperClassName={options.wrapperClassName ?? 'h-full w-full'}
      className={options.className ?? ''}
    />
  );
}
