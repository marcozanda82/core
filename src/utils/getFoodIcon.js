/**
 * Icona emoji + stime macro standard per alimenti senza match DB.
 */

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
 * @param {string} foodName
 * @param {{ kcal?: number, prot?: number, carb?: number, fat?: number } | null} [macros]
 * @returns {string} emoji
 */
export function getFoodIcon(foodName, macros = null) {
  const n = normalizeFoodText(foodName);
  if (!n) return '🍽️';

  if (includesAny(n, ['pomodoro', 'passata', 'passato', 'tomato'])) return '🍅';
  if (includesAny(n, ['insalata', 'salad', 'lattuga', 'verdura', 'verdure', 'spinac', 'zucchina', 'carota', 'peperone', 'melanzana', 'broccoli'])) {
    return '🥗';
  }
  if (includesAny(n, ['riso', 'rice', 'risotto'])) return '🍚';
  if (includesAny(n, ['pasta', 'spaghetti', 'penne', 'fusilli', 'cous cous', 'couscous', 'farro', 'orzo', 'avena', 'cereali', 'quinoa', 'grano'])) {
    return '🌾';
  }
  if (includesAny(n, ['fagiol', 'ceci', 'lenticch', 'legum', 'piselli', 'edamame'])) return '🫘';
  if (includesAny(n, ['pollo', 'tacchino', 'chicken', 'turkey', 'cotoletta'])) return '🍗';
  if (includesAny(n, ['carne', 'manzo', 'vitello', 'maiale', 'bistecca', 'prosciutto', 'bresaola', 'hamburger', 'beef', 'pork'])) {
    return '🥩';
  }
  if (includesAny(n, ['pesce', 'tonno', 'salmone', 'merluzzo', 'orata', 'branzino', 'fish', 'tuna', 'salmon'])) {
    return '🐟';
  }
  if (includesAny(n, [
    'mela', 'banana', 'arancia', 'fragola', 'pera', 'pesca', 'kiwi', 'uva', 'frutta',
    'apple', 'orange', 'berry', 'fruit',
  ])) {
    return '🍎';
  }
  if (includesAny(n, ['uovo', 'uova', 'egg'])) return '🥚';
  if (includesAny(n, ['latte', 'yogurt', 'formaggio', 'mozzarella', 'parmigiano', 'cheese', 'milk'])) return '🧀';
  if (includesAny(n, ['pane', 'toast', 'focaccia', 'brioche', 'bread'])) return '🍞';
  if (includesAny(n, ['olio', 'burro', 'olive', 'oil', 'butter'])) return '🫒';

  // Hint dai macro se il nome è generico
  const kcal = Number(macros?.kcal);
  const prot = Number(macros?.prot ?? macros?.pro);
  const carb = Number(macros?.carb ?? macros?.carbo);
  const fat = Number(macros?.fat);
  if (Number.isFinite(prot) && Number.isFinite(carb) && Number.isFinite(fat)) {
    if (prot >= 15 && prot >= carb && prot >= fat) return '🥩';
    if (carb >= 20 && carb >= prot) return '🌾';
    if (fat >= 15 && fat >= prot && fat >= carb) return '🫒';
  }
  if (Number.isFinite(kcal) && kcal < 40) return '🥗';

  return '🍽️';
}

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
  const icon = getFoodIcon(name, { kcal: per100.kcal, prot: per100.prot, carb: per100.carb, fat: per100.fat });

  return {
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
    icon,
    alternatives: [],
  };
}
