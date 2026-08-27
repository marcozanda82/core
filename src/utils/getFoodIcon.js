/**
 * Icona emoji + stime macro standard per alimenti senza match DB.
 * Icone specifiche: solo post-risoluzione via foodCategory (vedi foodCategoryIcon.js).
 * In bozza lavagna usare DRAFT_FOOD_ICON_EMOJI / resolveMealItemDisplayIcon.
 */

import {
  DRAFT_FOOD_ICON_EMOJI,
  GENERIC_FOOD_ICON_EMOJI,
  attachResolvedFoodIcon,
  getResolvedFoodCategoryIcon,
  resolveFoodCategory,
} from './foodCategoryIcon.js';

function normalizeFoodText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function includesAny(text, keywords) {
  return keywords.some((kw) => text.includes(kw));
}

/**
 * Icona post-calcolo / risoluzione (categoria affidabile o utensils).
 * Non usare durante digitazione bozza — preferire DRAFT_FOOD_ICON_EMOJI.
 * @param {string} foodName
 * @param {{ kcal?: number, prot?: number, carb?: number, fat?: number } | null} [macros]
 * @returns {string} emoji
 */
export function getFoodIcon(foodName, macros = null) {
  void macros; // non usare hint macro per forzare categorie (evita falsi positivi)
  const n = normalizeFoodText(foodName);
  if (!n) return GENERIC_FOOD_ICON_EMOJI;
  return getResolvedFoodCategoryIcon(foodName);
}

export { DRAFT_FOOD_ICON_EMOJI, GENERIC_FOOD_ICON_EMOJI, resolveFoodCategory, attachResolvedFoodIcon };

/**
 * Macro indicative per 100g quando manca un match DB fedele.
 * @param {string} foodName
 * @returns {{ kcal: number, prot: number, carb: number, fat: number }}
 */
export function estimateStandardMacrosPer100g(foodName) {
  const n = normalizeFoodText(foodName);

  if (includesAny(n, ['olio', 'oil'])) return { kcal: 884, prot: 0, carb: 0, fat: 100 };
  if (includesAny(n, ['burro', 'butter'])) return { kcal: 717, prot: 0.9, carb: 0.1, fat: 81 };
  if (includesAny(n, ['noci', 'mandorl', 'nocciol', 'arachid', 'semi di'])) {
    return { kcal: 600, prot: 18, carb: 15, fat: 52 };
  }
  if (includesAny(n, ['pollo', 'tacchino', 'petti'])) return { kcal: 120, prot: 23, carb: 0, fat: 2.5 };
  if (includesAny(n, ['carne', 'manzo', 'vitello', 'maiale', 'bistecca'])) {
    return { kcal: 180, prot: 22, carb: 0, fat: 10 };
  }
  if (includesAny(n, ['pesce', 'tonno', 'salmone', 'merluzzo'])) return { kcal: 130, prot: 22, carb: 0, fat: 4 };
  if (includesAny(n, ['uovo', 'uova'])) return { kcal: 143, prot: 13, carb: 1, fat: 10 };
  if (includesAny(n, ['formaggio', 'parmigiano', 'mozzarella'])) return { kcal: 300, prot: 22, carb: 2, fat: 23 };
  if (includesAny(n, ['yogurt', 'latte'])) return { kcal: 60, prot: 4, carb: 5, fat: 2 };
  if (includesAny(n, ['fette biscott', 'biscottate', 'cracker'])) return { kcal: 400, prot: 10, carb: 72, fat: 7 };
  if (includesAny(n, ['pane'])) return { kcal: 265, prot: 9, carb: 49, fat: 3 };
  if (includesAny(n, ['pasta', 'spaghetti', 'penne'])) return { kcal: 350, prot: 12, carb: 72, fat: 1.5 };
  if (includesAny(n, ['riso', 'risotto'])) return { kcal: 350, prot: 7, carb: 78, fat: 0.6 };
  if (includesAny(n, ['cous cous', 'couscous', 'farro', 'quinoa', 'orzo'])) {
    return { kcal: 160, prot: 6, carb: 28, fat: 1.5 };
  }
  if (includesAny(n, ['fagiol', 'ceci', 'lenticch', 'legum'])) return { kcal: 120, prot: 8, carb: 18, fat: 1 };
  if (includesAny(n, ['pomodoro', 'passata', 'passato'])) return { kcal: 30, prot: 1.5, carb: 5, fat: 0.2 };
  if (includesAny(n, ['insalata', 'verdura', 'spinac', 'zucchina', 'carota'])) {
    return { kcal: 25, prot: 1.5, carb: 4, fat: 0.2 };
  }
  if (includesAny(n, ['mela', 'banana', 'arancia', 'frutta', 'pera'])) {
    return { kcal: 55, prot: 0.5, carb: 13, fat: 0.2 };
  }

  // Generico misto (piatto / multi-ingrediente senza match)
  return { kcal: 150, prot: 8, carb: 15, fat: 5 };
}

/**
 * Voce McDrive / draft custom temporanea (niente foodDbKey forzato).
 * Icona assegnata solo perché lo status è già resolved (post-stima).
 * @param {string} spokenName
 * @param {number} [grams]
 * @param {object} [extra]
 */
export function buildProvisionalCustomFoodItem(spokenName, grams = 100, extra = {}) {
  const name = String(spokenName || 'Alimento').trim() || 'Alimento';
  const weight = Math.max(1, Math.round(Number(grams) || 100));
  const per100 = estimateStandardMacrosPer100g(name);
  const factor = weight / 100;
  const kcal = Math.round(per100.kcal * factor);
  const prot = Math.round(per100.prot * factor * 10) / 10;
  const carb = Math.round(per100.carb * factor * 10) / 10;
  const fat = Math.round(per100.fat * factor * 10) / 10;

  return attachResolvedFoodIcon({
    ...(extra?.id ? { id: extra.id } : {}),
    foodName: name,
    spokenFoodName: name,
    name,
    grams: weight,
    kcal,
    pro: prot,
    prot,
    carbo: carb,
    carb,
    fat,
    foodDbKey: null,
    source: 'custom_provisional',
    status: 'resolved',
    isEstimated: true,
    isCustom: true,
    alternatives: [],
  });
}
