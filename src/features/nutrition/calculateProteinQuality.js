import { TARGETS } from '../../useBiochimico';
import { readItemProteinGrams, hasAminoAcidProfile } from './calculateProteinReliability';

const EAA_KEYS = Object.keys(TARGETS.amino);

/** Categorie esplicite nel DB CREA/USDA. */
const NOBLE_CATEGORY_TOKENS = new Set([
  'carne',
  'carni',
  'pesce',
  'pesci',
  'uova',
  'uovo',
  'latte',
  'latticini',
  'formaggio',
  'formaggi',
  'caseario',
  'latticino',
  'pollame',
  'soia',
  'tofu',
  'animali',
  'animal',
  'dairy',
  'egg',
  'fish',
  'meat',
  'whey',
]);

const NOBLE_NAME_PATTERN =
  /carne|pollo|tacchino|manzo|maiale|agnell|vitel|bovin|suin|pesce|salmone|tonno|merluzz|sardine|gamber|gamberett|calam|seppia|uov|albume|tuorlo|latte|yogurt|kefir|formagg|ricott|mozzarella|parmig|feta|casein|whey|proteine del siero|soia|tofu|tempeh|edamame/i;

/**
 * @param {unknown} value
 * @returns {number}
 */
function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
function collectCategoryText(item) {
  const parts = [
    item.category,
    item.categoria,
    item.group,
    item.foodGroup,
    item.gruppo,
    item.row && typeof item.row === 'object' ? item.row.category : null,
    item.row && typeof item.row === 'object' ? item.row.gruppo : null,
    item.name,
    item.desc,
    item.label,
  ];
  return parts
    .filter(Boolean)
    .map((p) => String(p).toLowerCase())
    .join(' ');
}

/**
 * @param {Record<string, unknown>} item
 * @returns {boolean}
 */
export function matchesNobleCategory(item) {
  const text = collectCategoryText(item);
  if (!text) return false;
  if (NOBLE_NAME_PATTERN.test(text)) return true;
  return [...NOBLE_CATEGORY_TOKENS].some((token) => text.includes(token));
}

/**
 * Profilo EAA minimo: leucina + lisina sopra soglia per grammi di proteina.
 *
 * @param {Record<string, unknown>} item
 * @returns {boolean}
 */
export function meetsEaaMinimumProfile(item) {
  const proteinG = readItemProteinGrams(item);
  if (proteinG <= 0 || !hasAminoAcidProfile(item)) return false;

  const leu = safeNum(item.leu);
  const lys = safeNum(item.lys);
  if (leu <= 0 || lys <= 0) return false;

  const leuMin = proteinG * 5.5;
  const lysMin = proteinG * 5.1;
  return leu >= leuMin * 0.7 && lys >= lysMin * 0.7;
}

/**
 * Proteina completa (nobile) se categoria animale/latticini/uova/soia OPPURE EAA adeguati.
 *
 * @param {Record<string, unknown>} item
 * @returns {boolean}
 */
export function isNobleProtein(item) {
  if (readItemProteinGrams(item) <= 0) return false;
  if (matchesNobleCategory(item)) return true;
  if (meetsEaaMinimumProfile(item)) return true;
  return false;
}

/**
 * @param {number} value
 * @returns {number}
 */
function round1(value) {
  return Math.round(safeNum(value) * 10) / 10;
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} dailyLog
 * @returns {{
 *   totalProtein: number,
 *   noble: { grams: number, percentage: number },
 *   incomplete: { grams: number, percentage: number },
 * }}
 */
export function calculateProteinQuality(dailyLog) {
  let totalProtein = 0;
  let nobleGrams = 0;

  (dailyLog || []).forEach((raw) => {
    if (raw == null || typeof raw !== 'object') return;
    const item = /** @type {Record<string, unknown>} */ (raw);
    if (item.type !== 'food' && item.type !== 'recipe') return;

    const protein = readItemProteinGrams(item);
    if (protein <= 0) return;

    totalProtein += protein;
    if (isNobleProtein(item)) {
      nobleGrams += protein;
    }
  });

  const incompleteGrams = Math.max(0, totalProtein - nobleGrams);
  const noblePct = totalProtein > 0 ? round1((nobleGrams / totalProtein) * 100) : 0;
  const incompletePct = totalProtein > 0 ? round1((incompleteGrams / totalProtein) * 100) : 0;

  return {
    totalProtein: round1(totalProtein),
    noble: { grams: round1(nobleGrams), percentage: noblePct },
    incomplete: { grams: round1(incompleteGrams), percentage: incompletePct },
  };
}

export { EAA_KEYS as PROTEIN_EAA_KEYS };
