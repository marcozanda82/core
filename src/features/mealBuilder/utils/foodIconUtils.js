import {
  getMealBuilderFoodIcon,
  resolveExplicitFoodEmoji,
  resolveExplicitFoodIconTag,
} from './mealBuilderFoodIcon.js';
import {
  NEUTRAL_FOOD_VISUAL_EMOJI,
  resolveFoodVisualEmoji,
  sanitizeFoodDisplayName,
} from '../../../utils/foodVisualResolver.js';

/**
 * @deprecated Preferire resolveFoodVisual / resolveFoodVisualEmoji.
 * Euristica sul nome → emoji granulare.
 */
export function getFoodEmoji(foodName) {
  return resolveFoodVisualEmoji(foodName);
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
 * Visuali meal builder: immagine/tag/emoji espliciti, altrimenti keyword sul nome.
 * @param {object} food
 * @param {object|null} personalDb
 */
export function resolveFoodVisual(food, personalDb) {
  const rawName = String(food?.desc || food?.name || food?.label || food?.foodName || 'Alimento').trim();
  const name = sanitizeFoodDisplayName(rawName);
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
  const explicitEmoji = iconInfo.emoji || resolveExplicitFoodEmoji(mergedForIcon);

  const categoryHint = pickVisualField(sources, 'foodCategory')
    || pickVisualField(sources, 'category')
    || pickVisualField(sources, 'iconKey');

  const nameEmoji = resolveFoodVisualEmoji(rawName, categoryHint);
  const hasSpecificNameEmoji = Boolean(nameEmoji && nameEmoji !== NEUTRAL_FOOD_VISUAL_EMOJI);

  // Priorità: foto → emoji esplicita → keyword sul nome → tag SVG categoria → neutro
  const customEmoji = explicitEmoji
    || (hasSpecificNameEmoji ? nameEmoji : null);

  const useNeutralIcon = !customImage && !customEmoji && !semanticIconTag;

  return {
    name,
    customImage,
    customEmoji,
    customIcon: pickVisualField(sources, 'customIcon'),
    iconOverride: pickVisualField(sources, 'iconOverride'),
    iconTag: hasSpecificNameEmoji || explicitEmoji ? null : semanticIconTag,
    semanticIconTag: hasSpecificNameEmoji || explicitEmoji ? null : semanticIconTag,
    fallbackEmoji: NEUTRAL_FOOD_VISUAL_EMOJI,
    useNeutralIcon,
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

export { getMealBuilderFoodIcon, resolveExplicitFoodIconTag, sanitizeFoodDisplayName };
