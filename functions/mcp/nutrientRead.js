/**
 * Lettura nutrienti dal diario per MCP: niente inventati.
 * Preferisce fibreTotali; sodio via unità dichiarata (src/utils/sodiumUnits.js).
 */

import { readSodiumMgFromDiaryEntry } from '../../src/utils/sodiumUnits.js';

const ANIMAL_NO_FIBRE = /(?:^|[^a-z0-9àèéìòù])(merluzzo|pesce|filett|tonno|salmone|pollo|tacchino|manzo|vitello|maiale|carne|bresaola|prosciutto|speck|wurstel|wudy|salsicc|uovo|uova|egg|formaggio|mozzarella|parmigiano|grana|yogurt\s*greco|ricotta|burrata)(?=[^a-z0-9àèéìòù]|$)/iu;

export function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function looksLikeAnimalNoFibre(name) {
  return ANIMAL_NO_FIBRE.test(String(name || ''));
}

/**
 * Fibre in grammi della porzione. Se manca o è sospetta → null.
 * @returns {{ value: number|null, reason: string|null }}
 */
export function readFibreGrams(entry) {
  if (!entry || typeof entry !== 'object') return { value: null, reason: 'missing' };

  const totali = finite(entry.fibreTotali);
  const fibre = finite(entry.fibre ?? entry.fiber);
  const name = entry.name || entry.foodName || entry.desc || '';

  let value = null;

  if (totali != null) {
    value = totali;
  } else if (fibre != null) {
    value = fibre;
  } else {
    return { value: null, reason: 'missing' };
  }

  if (looksLikeAnimalNoFibre(name) && value > 0.05) {
    return { value: null, reason: 'animal_fibre_suspicious' };
  }

  if (value < 0) return { value: null, reason: 'missing' };
  return { value, reason: null };
}

/**
 * Sodio in mg della porzione (unità dichiarata; niente soglia na&lt;5).
 * @returns {{ value: number|null, reason: string|null }}
 */
export function readSodiumMg(entry) {
  return readSodiumMgFromDiaryEntry(entry);
}

export function readMacroGrams(entry, key) {
  if (!entry || typeof entry !== 'object') return null;
  if (key === 'prot') return finite(entry.prot ?? entry.protein ?? entry.proteins);
  if (key === 'carb') return finite(entry.carb ?? entry.carbs ?? entry.carbohydrates);
  if (key === 'fat') return finite(entry.fat ?? entry.fatTotal ?? entry.fatTot ?? entry.fats);
  return finite(entry[key]);
}
