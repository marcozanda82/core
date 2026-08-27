/**
 * Risoluzione icona per meal builder / inserimento manuale.
 * Solo category/iconKey/iconTag espliciti → icona mappata.
 * Nessuna euristica regex sul nome: fallback neutro Utensils.
 */

import { Utensils } from 'lucide-react';
import { resolveIconTagId } from './FoodIcons';

/** Alias espliciti (DB / foodCategory) → id libreria FoodIcons. */
export const FOOD_ICON_KEY_ALIASES = Object.freeze({
  bread: 'bread',
  bread_grains: 'bread',
  grains: 'bread',
  wheat: 'bread',
  pasta: 'pasta',
  poultry: 'poultry',
  chicken: 'poultry',
  meat: 'meat',
  meat_poultry: 'meat',
  beef: 'meat',
  pork: 'meat',
  fish: 'fish',
  fish_seafood: 'fish',
  seafood: 'seafood',
  fruit: 'fruit',
  fruits: 'fruit',
  vegetable: 'vegetables',
  vegetables: 'vegetables',
  dairy: 'dairy',
  dairy_eggs: 'dairy',
  milk: 'dairy',
  cheese: 'cheese',
  egg: 'eggs',
  eggs: 'eggs',
  oil: 'oil',
  oils_fats: 'oil',
  coffee: 'coffee',
  coffee_beverages: 'coffee',
  drink: 'drinks',
  drinks: 'drinks',
  sweet: 'sweets',
  sweets: 'sweets',
  sweets_pastry: 'sweets',
  dessert: 'sweets',
  bowl: 'bowl',
  generic: null,
});

/**
 * Estrae un tag icona SOLO da proprietà esplicite sull'item/row.
 * @param {object|null|undefined} item
 * @returns {string|null} id libreria oppure null
 */
export function resolveExplicitFoodIconTag(item) {
  if (!item || typeof item !== 'object') return null;
  const row = item.row && typeof item.row === 'object' ? item.row : null;
  const candidates = [
    item.iconOverride,
    item.iconTag,
    item.iconKey,
    item.semanticIconTag,
    item.category,
    item.foodCategory,
    row?.iconOverride,
    row?.iconTag,
    row?.iconKey,
    row?.category,
    row?.foodCategory,
  ];

  for (const raw of candidates) {
    const key = String(raw || '').trim().toLowerCase();
    if (!key || key === 'generic' || key === 'unknown' || key === 'other') continue;
    if (Object.prototype.hasOwnProperty.call(FOOD_ICON_KEY_ALIASES, key)) {
      const aliased = FOOD_ICON_KEY_ALIASES[key];
      if (!aliased) continue;
      const resolved = resolveIconTagId(aliased);
      if (resolved) return resolved;
    }
    const resolved = resolveIconTagId(key);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * Emoji esplicita salvata sull'item (non dedotta dal nome).
 * @param {object|null|undefined} item
 * @returns {string|null}
 */
export function resolveExplicitFoodEmoji(item) {
  if (!item || typeof item !== 'object') return null;
  const row = item.row && typeof item.row === 'object' ? item.row : null;
  for (const raw of [item.customEmoji, item.emoji, row?.customEmoji, row?.emoji]) {
    const s = String(raw || '').trim();
    if (s) return s;
  }
  // `icon` solo se è emoji (non un tag testuale tipo "bread")
  for (const raw of [item.icon, row?.icon]) {
    const s = String(raw || '').trim();
    if (!s) continue;
    if (/^[\p{Extended_Pictographic}\uFE0F\u200D]+$/u.test(s)) return s;
  }
  return null;
}

/**
 * Helper display: tag esplicito oppure null (→ fallback neutro UI).
 * @param {object|null|undefined} item
 * @returns {{ tag: string|null, emoji: string|null, useNeutral: boolean }}
 */
export function getMealBuilderFoodIcon(item) {
  const tag = resolveExplicitFoodIconTag(item);
  const emoji = resolveExplicitFoodEmoji(item);
  return {
    tag,
    emoji: tag ? null : emoji,
    useNeutral: !tag && !emoji,
  };
}

export const NEUTRAL_FOOD_ICON = Utensils;
