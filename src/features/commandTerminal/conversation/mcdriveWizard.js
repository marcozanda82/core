import {
  parseConsumedMealFromNaturalText,
  extractBareFoodNamesFromText,
} from './mealLogIntent.js';
import { findSemanticKentuMatches } from '../../mealBuilder/utils/SemanticMatchmaker.js';
import {
  computeMacrosForWeight,
  getPer100Macros,
} from '../../mealBuilder/utils/foodMacroUtils.js';

export const MCDRIVE_FINISH_CHIP = Object.freeze({
  label: '🏁 Termina e Salva',
  intent: 'FINISH_MCDRIVE_WIZARD',
});

export const MCDRIVE_CANCEL_CHIP = Object.freeze({
  label: '❌ Annulla',
  intent: 'CANCEL_MCDRIVE_WIZARD',
});

/** Messaggio di avvio lavagna (Guidami / Inserimento Guidato). */
export const MCDRIVE_START_MESSAGE =
  'Modalità inserimento guidato attivata. Cosa ti preparo come primo alimento?';

export const EMPTY_MCDRIVE_TOTALS = Object.freeze({
  kcal: 0,
  pro: 0,
  carbo: 0,
  fat: 0,
});

const DEFAULT_GRAMS = 100;
const VALID_CONFIDENCE = new Set(['high', 'medium']);

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isMcdriveFinishCommand(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  if (/termina\s+e\s+salva/i.test(t)) return true;
  return /^(?:basta|fine|finito|termina(?:re)?|salva)\b/i.test(t);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isMcdriveCancelCommand(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  return /^(?:annulla|cancel|stop)\b/i.test(t);
}

/**
 * @returns {object[]}
 */
export function createEmptyMcDriveDraft() {
  return [];
}

/**
 * Un alimento per ciclo (es. «100g sardine»).
 * @param {string} userText
 * @returns {{ foodName: string, grams: number, isEstimated: boolean } | null}
 */
export function parseMcdriveFoodInput(userText) {
  const text = String(userText || '').trim();
  if (!text) return null;

  const parsed = parseConsumedMealFromNaturalText(text);
  if (parsed?.items?.length) {
    const item = parsed.items[0];
    const grams = Math.max(1, Math.round(Number(item.grams) || DEFAULT_GRAMS));
    return {
      foodName: String(item.foodName || '').trim(),
      grams,
      isEstimated: !Number.isFinite(Number(item.grams)) || Number(item.grams) <= 0,
    };
  }

  const bare = extractBareFoodNamesFromText(text);
  if (bare.length > 0) {
    return {
      foodName: String(bare[0] || '').trim(),
      grams: DEFAULT_GRAMS,
      isEstimated: true,
    };
  }

  return null;
}

/**
 * @param {object[]} [items]
 * @returns {{ kcal: number, pro: number, carbo: number, fat: number }}
 */
export function sumMcDriveDraftTotals(items = []) {
  const list = Array.isArray(items) ? items : [];
  return list.reduce(
    (acc, item) => ({
      kcal: acc.kcal + (Number(item?.kcal) || 0),
      pro: acc.pro + (Number(item?.pro ?? item?.prot) || 0),
      carbo: acc.carbo + (Number(item?.carbo ?? item?.carb) || 0),
      fat: acc.fat + (Number(item?.fat ?? item?.fatTotal) || 0),
    }),
    { ...EMPTY_MCDRIVE_TOTALS },
  );
}

/**
 * @param {object[]} [items]
 * @returns {{ items: object[], totals: { kcal: number, pro: number, carbo: number, fat: number } }}
 */
export function buildLiveMealTrayPayload(items = []) {
  const list = Array.isArray(items) ? items : [];
  const totals = sumMcDriveDraftTotals(list);
  return {
    items: list.map((item) => ({ ...item })),
    totals: {
      kcal: Math.round(Number(totals.kcal) || 0),
      pro: Math.round((Number(totals.pro) || 0) * 10) / 10,
      carbo: Math.round((Number(totals.carbo) || 0) * 10) / 10,
      fat: Math.round((Number(totals.fat) || 0) * 10) / 10,
    },
  };
}

/**
 * @param {string} foodName
 * @returns {string}
 */
export function buildMcdriveItemAddedMessage(foodName) {
  const name = String(foodName || 'Alimento').trim();
  if (!name) return 'Aggiunto al vassoio. Vuoi inserire altro?';
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return `${cap} aggiunto al vassoio. Vuoi inserire altro?`;
}

/**
 * @param {Array<object>} matches
 * @returns {object | null}
 */
export function pickValidSemanticMatch(matches = []) {
  const list = Array.isArray(matches) ? matches.filter((m) => m?.row) : [];
  const valid = list.find((m) => VALID_CONFIDENCE.has(String(m.confidence || '').toLowerCase()));
  return valid || null;
}

/**
 * Costruisce una riga vassoio da un match Kentu/personale.
 * @param {string} spokenName
 * @param {number} grams
 * @param {object} match
 * @param {string} [source]
 * @param {{ isEstimated?: boolean }} [extra]
 */
export function buildMcDriveItemFromMatch(spokenName, grams, match, source = 'kentu', extra = {}) {
  const row = match?.row && typeof match.row === 'object' ? match.row : {};
  const officialName = String(match?.name || row.desc || row.name || spokenName || '').trim();
  const foodDbKey = String(match?.fdcId || row.id || row.foodDbKey || '').trim() || null;
  const weight = Math.max(1, Math.round(Number(grams) || DEFAULT_GRAMS));
  const per100 = getPer100Macros({ row });
  const macros = computeMacrosForWeight(per100, weight);

  return {
    foodName: officialName || String(spokenName || '').trim(),
    spokenFoodName: String(spokenName || officialName).trim(),
    grams: weight,
    kcal: Math.round(Number(macros.kcal) || 0),
    pro: Number(macros.prot) || 0,
    carbo: Number(macros.carb) || 0,
    fat: Number(macros.fat) || 0,
    foodDbKey,
    source,
    isEstimated: extra.isEstimated === true,
    ...(Object.keys(row).length > 0 ? { row } : {}),
  };
}

/**
 * Ricalcola i macro di una riga vassoio dopo cambio grammi.
 * @param {object} item
 * @param {number} newGrams
 * @returns {object}
 */
export function rescaleMcDriveItemGrams(item, newGrams) {
  if (!item || typeof item !== 'object') return item;
  const grams = Math.max(1, Math.round(Number(newGrams) || 0));
  if (!Number.isFinite(grams) || grams <= 0) return item;

  const row = item.row && typeof item.row === 'object' ? item.row : null;
  if (row) {
    const per100 = getPer100Macros({ row });
    const macros = computeMacrosForWeight(per100, grams);
    return {
      ...item,
      grams,
      kcal: Math.round(Number(macros.kcal) || 0),
      pro: Number(macros.prot) || 0,
      carbo: Number(macros.carb) || 0,
      fat: Number(macros.fat) || 0,
      isEstimated: false,
    };
  }

  const oldGrams = Math.max(1, Math.round(Number(item.grams) || 0));
  const ratio = grams / oldGrams;
  return {
    ...item,
    grams,
    kcal: Math.round((Number(item.kcal) || 0) * ratio),
    pro: Math.round(((Number(item.pro ?? item.prot) || 0) * ratio) * 10) / 10,
    carbo: Math.round(((Number(item.carbo ?? item.carb) || 0) * ratio) * 10) / 10,
    fat: Math.round(((Number(item.fat ?? item.fatTotal) || 0) * ratio) * 10) / 10,
    isEstimated: false,
  };
}

/**
 * Personal DB prima, poi Kentu DB. Solo match high/medium.
 * @param {string} foodName
 * @param {{ personalDb?: object|null, kentuItDb?: object|null, signal?: AbortSignal }} ctx
 * @returns {Promise<{ match: object, source: 'personal'|'kentu' } | null>}
 */
export async function resolveMcdriveFoodViaSemanticMatchmaker(foodName, ctx = {}) {
  const name = String(foodName || '').trim();
  if (!name) return null;

  const signal = ctx.signal;
  const personalDb = ctx.personalDb && typeof ctx.personalDb === 'object' ? ctx.personalDb : null;
  const kentuItDb = ctx.kentuItDb && typeof ctx.kentuItDb === 'object' ? ctx.kentuItDb : null;

  if (personalDb && Object.keys(personalDb).length > 0) {
    const personalMatches = await findSemanticKentuMatches(name, {
      personalDb,
      kentuItDb: null,
    }, { signal });
    const personalHit = pickValidSemanticMatch(personalMatches);
    if (personalHit) return { match: personalHit, source: 'personal' };
  }

  if (kentuItDb && Object.keys(kentuItDb).length > 0) {
    const kentuMatches = await findSemanticKentuMatches(name, {
      kentuItDb,
      personalDb: null,
    }, { signal });
    const kentuHit = pickValidSemanticMatch(kentuMatches);
    if (kentuHit) return { match: kentuHit, source: 'kentu' };
  }

  return null;
}
