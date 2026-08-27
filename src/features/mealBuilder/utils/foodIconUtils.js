import {
  getMealBuilderFoodIcon,
  resolveExplicitFoodEmoji,
  resolveExplicitFoodIconTag,
} from './mealBuilderFoodIcon.js';

/** Emoji neutra (nessuna euristica sul nome). */
const GENERIC_FOOD_ICON_EMOJI = '🍽️';

/**
 * @deprecated Preferire getMealBuilderFoodIcon / fallback Utensils.
 * Non indovina dal nome: restituisce solo emoji neutra.
 */
export function getFoodEmoji(_foodName) {
  void _foodName;
  return GENERIC_FOOD_ICON_EMOJI;
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

/**
 * Visuali meal builder: solo tag/emoji/immagine espliciti.
 * Nessuna euristica sul nome → semanticIconTag null → UI usa Utensils.
 * @param {object} food
 * @param {object|null} personalDb
 */
export function resolveFoodVisual(food, personalDb) {
  const name = String(food?.desc || food?.name || food?.label || food?.foodName || 'Alimento').trim();
  const dbKey = food?.foodDbKey ?? food?.key ?? food?.id;
  const dbEntry = dbKey && personalDb?.[dbKey] ? personalDb[dbKey] : null;
  const sources = [food, food?.row, dbEntry].filter(Boolean);

  const customImage = pickVisualField(sources, 'customImage')
    || pickVisualField(sources, 'imageUrl')
    || pickVisualField(sources, 'photoUrl');

  const mergedForIcon = {
    ...food,
    ...(dbEntry && typeof dbEntry === 'object' ? dbEntry : {}),
    row: food?.row || dbEntry || food?.row,
  };
  const iconInfo = getMealBuilderFoodIcon(mergedForIcon);
  const semanticIconTag = iconInfo.tag
    || resolveExplicitFoodIconTag(mergedForIcon);
  const customEmoji = iconInfo.emoji || resolveExplicitFoodEmoji(mergedForIcon);

  return {
    name,
    customImage,
    customEmoji,
    customIcon: pickVisualField(sources, 'customIcon'),
    iconOverride: pickVisualField(sources, 'iconOverride'),
    iconTag: semanticIconTag,
    semanticIconTag,
    fallbackEmoji: null,
    useNeutralIcon: !customImage && !semanticIconTag && !customEmoji,
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

export { getMealBuilderFoodIcon, resolveExplicitFoodIconTag };
