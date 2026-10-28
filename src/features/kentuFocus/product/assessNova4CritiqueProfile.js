/**
 * Un NOVA 4 entra in summary.toImprove solo con profilo nutrizionale sfavorevole.
 * - Nutri-Score D/E (OFF) se presente
 * - altrimenti zuccheri ≥ 15 g o grassi saturi ≥ 5 g per porzione consumata
 * Eccezione favorevole: cioccolato fondente ≥ 70% (non criticato; resta escluso dai sostituti).
 */

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object|null|undefined} row
 * @returns {'a'|'b'|'c'|'d'|'e'|null}
 */
export function readNutriScoreGrade(row) {
  if (!row || typeof row !== 'object') return null;
  const raw = row.nutriscore_grade
    ?? row.nutrition_grades
    ?? row.nutriscoreGrade
    ?? row.nutritionGrade
    ?? row.nutriments?.['nutrition-score-fr']
    ?? null;
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  const letter = s.replace(/^en:/, '').charAt(0);
  if ('abcde'.includes(letter)) return /** @type {'a'|'b'|'c'|'d'|'e'} */ (letter);
  return null;
}

/**
 * g/100g da riga OFF/CREA.
 * @param {object|null|undefined} row
 * @param {string[]} keys
 * @returns {number|null}
 */
function nutrientPer100g(row, keys) {
  if (!row || typeof row !== 'object') return null;
  const nutriments = row.nutriments && typeof row.nutriments === 'object' ? row.nutriments : null;
  for (const k of keys) {
    const direct = finiteOrNull(row[k]);
    if (direct != null) return direct;
    if (nutriments) {
      const n = finiteOrNull(nutriments[k] ?? nutriments[`${k}_100g`]);
      if (n != null) return n;
    }
  }
  return null;
}

/**
 * @param {string|null|undefined} name
 * @returns {boolean}
 */
export function isDarkChocolateGe70(name) {
  const n = String(name || '');
  if (!/\b(cioccolat\w*|chocolate|cacao|excellence|lindt|fondente|dark)\b/i.test(n)) return false;
  return /\b(7[0-9]|8[0-9]|9[0-9]|100)\s*%/.test(n);
}

/**
 * @param {{
 *   name?: string|null,
 *   grams?: number|null,
 *   catalogRow?: object|null,
 *   sugarsG?: number|null,
 *   satFatG?: number|null,
 * }} input
 * @returns {{
 *   critiqueWorthy: boolean,
 *   reason: string,
 *   nutriScoreGrade: string|null,
 *   sugarsGPortion: number|null,
 *   satFatGPortion: number|null,
 *   favorableDarkChocolate: boolean,
 * }}
 */
export function assessNova4CritiqueProfile(input) {
  const name = String(input?.name || '').trim();
  const favorableDarkChocolate = isDarkChocolateGe70(name);
  if (favorableDarkChocolate) {
    return {
      critiqueWorthy: false,
      reason: 'favorable_dark_chocolate_ge_70',
      nutriScoreGrade: readNutriScoreGrade(input?.catalogRow),
      sugarsGPortion: null,
      satFatGPortion: null,
      favorableDarkChocolate: true,
    };
  }

  const grade = readNutriScoreGrade(input?.catalogRow);
  if (grade === 'd' || grade === 'e') {
    return {
      critiqueWorthy: true,
      reason: `nutri_score_${grade}`,
      nutriScoreGrade: grade,
      sugarsGPortion: null,
      satFatGPortion: null,
      favorableDarkChocolate: false,
    };
  }

  const grams = finiteOrNull(input?.grams);
  let sugarsPortion = finiteOrNull(input?.sugarsG);
  let satPortion = finiteOrNull(input?.satFatG);

  if (sugarsPortion == null && input?.catalogRow && grams != null && grams > 0) {
    const per100 = nutrientPer100g(input.catalogRow, [
      'sugars', 'sugars_100g', 'sugar', 'zuccheri',
    ]);
    if (per100 != null) sugarsPortion = Math.round((per100 * grams) / 100 * 10) / 10;
  }
  if (satPortion == null && input?.catalogRow && grams != null && grams > 0) {
    const per100 = nutrientPer100g(input.catalogRow, [
      'saturated-fat', 'saturated_fat', 'saturated-fat_100g', 'fatSat', 'grassi_saturi',
    ]);
    if (per100 != null) satPortion = Math.round((per100 * grams) / 100 * 10) / 10;
  }

  if (sugarsPortion != null && sugarsPortion >= 15) {
    return {
      critiqueWorthy: true,
      reason: 'sugars_ge_15g_portion',
      nutriScoreGrade: grade,
      sugarsGPortion: sugarsPortion,
      satFatGPortion: satPortion,
      favorableDarkChocolate: false,
    };
  }
  if (satPortion != null && satPortion >= 5) {
    return {
      critiqueWorthy: true,
      reason: 'sat_fat_ge_5g_portion',
      nutriScoreGrade: grade,
      sugarsGPortion: sugarsPortion,
      satFatGPortion: satPortion,
      favorableDarkChocolate: false,
    };
  }

  return {
    critiqueWorthy: false,
    reason: grade
      ? `nutri_score_${grade}_not_adverse`
      : (sugarsPortion == null && satPortion == null
        ? 'insufficient_profile_data'
        : 'profile_not_adverse'),
    nutriScoreGrade: grade,
    sugarsGPortion: sugarsPortion,
    satFatGPortion: satPortion,
    favorableDarkChocolate: false,
  };
}
