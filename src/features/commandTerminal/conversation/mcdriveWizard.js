import {
  parseConsumedMealFromNaturalText,
  extractBareFoodNamesFromText,
} from './mealLogIntent.js';
import { findSemanticKentuMatches, findExactLiteralFoodInDb } from '../../mealBuilder/utils/SemanticMatchmaker.js';
import {
  computeMacrosForWeight,
  getPer100Macros,
} from '../../mealBuilder/utils/foodMacroUtils.js';
import { getDynamicMealTargets, toCanonicalMealType } from '../../../coreEngine.jsx';
import { getLastUsedQuantity } from './userRecentFoods.js';

export const MCDRIVE_FINISH_CHIP = Object.freeze({
  label: '🔄 Calcola Valori',
  intent: 'FINISH_MCDRIVE_WIZARD',
});

export const MCDRIVE_CANCEL_CHIP = Object.freeze({
  label: '❌ Annulla',
  intent: 'CANCEL_MCDRIVE_WIZARD',
});

/** Conferma post-validazione sequenziale. */
export const MCDRIVE_SAVE_CONFIRM_CHIP = Object.freeze({
  label: '🏁 Salva nel Diario',
  intent: 'SAVE_MCDRIVE_MEAL',
});

export const MCDRIVE_ADD_MORE_CHIP = Object.freeze({
  label: '➕ Aggiungi ancora',
  intent: 'ADD_MORE_MCDRIVE',
});

export const MCDRIVE_SAVE_CONFIRM_MESSAGE =
  'Calcolo completato. Puoi salvare nel diario, aggiungere altro, o annullare.';

export const MCDRIVE_MEAL_TYPE_PROMPT =
  'Per quale pasto vuoi che ti guidi?';

export const MCDRIVE_MEAL_TYPE_QUICK_REPLIES = Object.freeze([
  { label: '🍳 Colazione', intent: 'SET_MCDRIVE_MEAL_TYPE', mealType: 'colazione' },
  { label: '🍎 Spuntino', intent: 'SET_MCDRIVE_MEAL_TYPE', mealType: 'snack' },
  { label: '🍽️ Pranzo', intent: 'SET_MCDRIVE_MEAL_TYPE', mealType: 'pranzo' },
  { label: '🌙 Cena', intent: 'SET_MCDRIVE_MEAL_TYPE', mealType: 'cena' },
]);

export const MCDRIVE_MEAL_TYPE_LABELS = Object.freeze({
  colazione: 'Colazione',
  snack: 'Spuntino',
  pranzo: 'Pranzo',
  cena: 'Cena',
});

export const MCDRIVE_SAVE_CONFIRM_QUICK_REPLIES = Object.freeze([
  { label: MCDRIVE_CANCEL_CHIP.label, intent: MCDRIVE_CANCEL_CHIP.intent },
  { label: MCDRIVE_ADD_MORE_CHIP.label, intent: MCDRIVE_ADD_MORE_CHIP.intent },
  { label: MCDRIVE_SAVE_CONFIRM_CHIP.label, intent: MCDRIVE_SAVE_CONFIRM_CHIP.intent, variant: 'primary' },
]);

/** Messaggio di avvio lavagna (dopo scelta pasto). */
export const MCDRIVE_START_MESSAGE =
  'Lavagna aperta. Digita gli alimenti pure grezzi (es. «100g pasta»), poi tocca Calcola Valori.';

export const EMPTY_MCDRIVE_TOTALS = Object.freeze({
  kcal: 0,
  pro: 0,
  carbo: 0,
  fat: 0,
});

/** Margine relativo (±) per evidenziare macro «on target». */
export const MCDRIVE_TARGET_MARGIN_RATIO = 0.1;

const DEFAULT_GRAMS = 100;
const VALID_CONFIDENCE = new Set(['high', 'medium']);
const MCDRIVE_MEAL_TYPES = new Set(['colazione', 'snack', 'pranzo', 'cena']);
const MAX_ALTERNATIVES = 4;

/**
 * @param {string} raw
 * @returns {string|null}
 */
export function normalizeMcdriveMealType(raw) {
  const t = String(raw || '').trim().toLowerCase().split('_')[0];
  if (t === 'spuntino' || t === 'merenda') return 'snack';
  return MCDRIVE_MEAL_TYPES.has(t) ? t : null;
}

/**
 * @param {string} mealType
 * @returns {string}
 */
export function formatMcdriveMealTypeLabel(mealType) {
  const key = normalizeMcdriveMealType(mealType);
  return (key && MCDRIVE_MEAL_TYPE_LABELS[key]) || 'Pasto';
}

/**
 * Target macro del pasto corrente (stesso motore del Fast Logger).
 * @param {string|null} mealType
 * @param {object} [currentState]
 * @returns {{ kcal: number, pro: number, carbo: number, fat: number }}
 */
export function resolveMcdriveMealTargets(mealType, currentState = {}) {
  const canon = toCanonicalMealType(
    String(normalizeMcdriveMealType(mealType) || mealType || 'pranzo').split('_')[0],
  ) || 'pranzo';
  const userTargets = currentState?.userTargets && typeof currentState.userTargets === 'object'
    ? currentState.userTargets
    : {};
  const dailyLog = Array.isArray(currentState?.activeLog) ? currentState.activeLog : [];
  const dynamic = getDynamicMealTargets(canon, dailyLog, {
    kcal: Number(userTargets.kcal ?? currentState?.dynamicDailyKcal) || 2000,
    prot: Number(userTargets.prot) || 150,
    carb: Number(userTargets.carb) || 200,
    fat: Number(userTargets.fat ?? userTargets.fatTotal) || 60,
    fatTotal: Number(userTargets.fatTotal ?? userTargets.fat) || 60,
    fibre: Number(userTargets.fibre) || 30,
  }, {});
  return {
    kcal: Math.round(Number(dynamic?.kcal) || 0),
    pro: Math.round((Number(dynamic?.prot) || 0) * 10) / 10,
    carbo: Math.round((Number(dynamic?.carb) || 0) * 10) / 10,
    fat: Math.round((Number(dynamic?.fat ?? dynamic?.fatTotal) || 0) * 10) / 10,
  };
}

/**
 * @param {number} actual
 * @param {number} target
 * @param {number} [marginRatio]
 * @returns {'on-target'|'over'|'under'|'neutral'}
 */
export function classifyMcdriveMacroVsTarget(actual, target, marginRatio = MCDRIVE_TARGET_MARGIN_RATIO) {
  const a = Number(actual) || 0;
  const t = Number(target) || 0;
  if (!(t > 0)) return 'neutral';
  const lo = t * (1 - marginRatio);
  const hi = t * (1 + marginRatio);
  if (a >= lo && a <= hi) return 'on-target';
  if (a > hi) return 'over';
  return 'under';
}

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
export function isMcdriveSaveConfirmCommand(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  if (/salva\s+pasto/i.test(t)) return true;
  return /^(?:salva|conferma(?:\s+salvataggio)?)\b/i.test(t);
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
 * Totali solo delle voci resolved (calibrazione).
 * @param {object[]} [items]
 */
export function sumMcDriveResolvedTotals(items = []) {
  const list = (Array.isArray(items) ? items : []).filter(
    (item) => String(item?.status || '').toLowerCase() === 'resolved'
      || (!isMcDriveRawItem(item) && Number(item?.kcal) > 0),
  );
  return sumMcDriveDraftTotals(list);
}

/**
 * @param {object[]} [items]
 * @returns {boolean}
 */
export function draftHasRawMcDriveItems(items = []) {
  return (Array.isArray(items) ? items : []).some((item) => {
    const status = String(item?.status || '').toLowerCase();
    return status === 'raw' || status === 'processing' || status === 'validating';
  });
}

/**
 * Chip contestuali sotto la lavagna.
 * @param {object[]} [items]
 * @returns {Array<object>}
 */
export function buildMcdriveActionQuickReplies(items = []) {
  const list = Array.isArray(items) ? items : [];
  if (draftHasRawMcDriveItems(list) || hasPendingMcDriveEnrichment(list)) {
    return [
      { label: MCDRIVE_CANCEL_CHIP.label, intent: MCDRIVE_CANCEL_CHIP.intent },
      { label: MCDRIVE_FINISH_CHIP.label, intent: MCDRIVE_FINISH_CHIP.intent, variant: 'primary' },
    ];
  }
  if (list.length === 0) {
    return [
      { label: MCDRIVE_CANCEL_CHIP.label, intent: MCDRIVE_CANCEL_CHIP.intent },
    ];
  }
  return [...MCDRIVE_SAVE_CONFIRM_QUICK_REPLIES];
}

/**
 * @param {object[]} [items]
 * @param {{ mealType?: string|null, currentState?: object|null }} [meta]
 * @returns {object}
 */
export function buildLiveMealTrayPayload(items = [], meta = {}) {
  const list = Array.isArray(items) ? items : [];
  const totals = sumMcDriveDraftTotals(list);
  const resolvedTotals = sumMcDriveResolvedTotals(list);
  const mealType = normalizeMcdriveMealType(meta?.mealType) || null;
  const mealTargets = resolveMcdriveMealTargets(mealType, meta?.currentState || {});
  return {
    items: list.map((item) => ({ ...item })),
    mealType,
    mealTypeLabel: formatMcdriveMealTypeLabel(mealType),
    hasRaw: draftHasRawMcDriveItems(list),
    mealTargets,
    totals: {
      kcal: Math.round(Number(totals.kcal) || 0),
      pro: Math.round((Number(totals.pro) || 0) * 10) / 10,
      carbo: Math.round((Number(totals.carbo) || 0) * 10) / 10,
      fat: Math.round((Number(totals.fat) || 0) * 10) / 10,
    },
    resolvedTotals: {
      kcal: Math.round(Number(resolvedTotals.kcal) || 0),
      pro: Math.round((Number(resolvedTotals.pro) || 0) * 10) / 10,
      carbo: Math.round((Number(resolvedTotals.carbo) || 0) * 10) / 10,
      fat: Math.round((Number(resolvedTotals.fat) || 0) * 10) / 10,
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
 * Candidati alternativi (escluso il top match), max 4.
 * @param {Array<object>} matches
 * @param {object|null} topMatch
 * @param {number} [limit]
 * @returns {Array<object>}
 */
export function buildMcDriveAlternatives(matches = [], topMatch = null, limit = MAX_ALTERNATIVES) {
  const list = Array.isArray(matches) ? matches.filter((m) => m?.row) : [];
  const topId = String(topMatch?.fdcId || topMatch?.row?.id || topMatch?.row?.foodDbKey || '').trim();
  const topName = String(topMatch?.name || topMatch?.row?.desc || '').trim().toLowerCase();
  const out = [];
  for (const m of list) {
    if (out.length >= Math.max(1, limit)) break;
    const id = String(m?.fdcId || m?.row?.id || m?.row?.foodDbKey || '').trim();
    const name = String(m?.name || m?.row?.desc || m?.row?.name || '').trim();
    if (topId && id && id === topId) continue;
    if (!topId && topName && name.toLowerCase() === topName) continue;
    out.push({
      foodDbKey: id || null,
      foodName: name,
      confidence: m?.confidence || null,
      row: m.row && typeof m.row === 'object' ? { ...m.row } : null,
    });
  }
  return out;
}

/**
 * Appunto grezzo sul vassoio (Sandbox): nessun match DB, nessun macro.
 * @param {{ foodName?: string, grams?: number, isEstimated?: boolean }} parsed
 * @returns {{ id: string, foodName: string, grams: number, status: 'raw', isEstimated: boolean }}
 */
export function buildMcDriveRawItem(parsed = {}) {
  const foodName = String(parsed?.foodName || '').trim();
  const grams = Math.max(1, Math.round(Number(parsed?.grams) || DEFAULT_GRAMS));
  const id = `mcdrive_raw_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    foodName,
    grams,
    status: 'raw',
    isEstimated: parsed?.isEstimated === true,
  };
}

/**
 * @param {object} item
 * @returns {boolean}
 */
export function isMcDriveRawItem(item) {
  if (!item || typeof item !== 'object') return false;
  const status = String(item.status || '').toLowerCase();
  if (status === 'resolved') return false;
  if (status === 'raw' || status === 'pending_enrichment' || status === 'skipped'
    || status === 'processing' || status === 'validating') {
    return true;
  }
  const hasMacros = Number.isFinite(Number(item.kcal)) && Number(item.kcal) > 0;
  return !hasMacros && !item.foodDbKey && !item.row;
}

/**
 * @param {object[]} [items]
 * @returns {number} indice primo raw, o -1
 */
export function findNextRawMcDriveIndex(items = []) {
  const list = Array.isArray(items) ? items : [];
  return list.findIndex((item) => String(item?.status || '').toLowerCase() === 'raw');
}

/**
 * @param {object[]} [items]
 * @returns {boolean}
 */
export function hasPendingMcDriveEnrichment(items = []) {
  return (Array.isArray(items) ? items : []).some(
    (item) => String(item?.status || '').toLowerCase() === 'pending_enrichment',
  );
}

/**
 * Costruisce una riga vassoio da un match Kentu/personale.
 * @param {string} spokenName
 * @param {number} grams
 * @param {object} match
 * @param {string} [source]
 * @param {{ isEstimated?: boolean, alternatives?: object[], id?: string }} [extra]
 */
export function buildMcDriveItemFromMatch(spokenName, grams, match, source = 'kentu', extra = {}) {
  const row = match?.row && typeof match.row === 'object' ? match.row : {};
  const officialName = String(match?.name || row.desc || row.name || spokenName || '').trim();
  const foodDbKey = String(match?.fdcId || row.id || row.foodDbKey || '').trim() || null;
  const weight = Math.max(1, Math.round(Number(grams) || DEFAULT_GRAMS));
  const per100 = getPer100Macros({ row });
  const macros = computeMacrosForWeight(per100, weight);
  const alternatives = Array.isArray(extra?.alternatives)
    ? extra.alternatives.map((alt) => ({ ...alt }))
    : [];

  return {
    ...(extra?.id ? { id: extra.id } : {}),
    foodName: officialName || String(spokenName || '').trim(),
    spokenFoodName: String(spokenName || officialName).trim(),
    grams: weight,
    kcal: Math.round(Number(macros.kcal) || 0),
    pro: Number(macros.prot) || 0,
    carbo: Number(macros.carb) || 0,
    fat: Number(macros.fat) || 0,
    foodDbKey,
    source,
    status: 'resolved',
    isEstimated: extra.isEstimated === true,
    alternatives,
    ...(Object.keys(row).length > 0 ? { row } : {}),
  };
}

/**
 * Risolve grammi: se stima (niente quantità nel testo), prova memoria storica.
 * @param {{ grams?: number, isEstimated?: boolean, foodName?: string }} itemOrParsed
 * @param {{ foodDbKey?: string|null, foodName?: string }} matchInfo
 * @param {object} [currentState]
 * @returns {number}
 */
export function resolveMcdriveGramsWithHistory(itemOrParsed, matchInfo = {}, currentState = {}) {
  const fallback = Math.max(1, Math.round(Number(itemOrParsed?.grams) || DEFAULT_GRAMS));
  if (itemOrParsed?.isEstimated !== true) return fallback;

  const keys = [
    matchInfo?.foodDbKey,
    matchInfo?.foodName,
    itemOrParsed?.foodName,
  ].map((k) => String(k || '').trim()).filter(Boolean);

  for (const key of keys) {
    const hist = getLastUsedQuantity(key, currentState);
    if (hist && hist > 0) return Math.max(1, Math.round(hist));
  }
  return fallback;
}

/**
 * Costruisce item McDrive da risultato UniversalSearchModal.
 * @param {object} searchResult
 * @param {number} grams
 * @param {{ id?: string, spokenFoodName?: string, alternatives?: object[] }} [extra]
 */
export function buildMcDriveItemFromSearchResult(searchResult, grams, extra = {}) {
  const row = searchResult?.row && typeof searchResult.row === 'object'
    ? searchResult.row
    : (searchResult && typeof searchResult === 'object' ? searchResult : {});
  const name = String(
    searchResult?.desc || searchResult?.name || row.desc || row.name || 'Alimento',
  ).trim();
  const foodDbKey = String(
    searchResult?.key
    || searchResult?.id
    || searchResult?.fdcId
    || row.id
    || row.foodDbKey
    || '',
  ).trim() || null;
  const source = String(searchResult?._source || 'search').trim() || 'search';
  return buildMcDriveItemFromMatch(
    extra.spokenFoodName || name,
    grams,
    { name, fdcId: foodDbKey, row: { ...row, ...(foodDbKey ? { id: foodDbKey, foodDbKey } : {}) } },
    source,
    {
      id: extra.id,
      isEstimated: false,
      alternatives: extra.alternatives || [],
    },
  );
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

  // Raw sandbox: solo grammi, niente macro.
  if (isMcDriveRawItem(item)) {
    return {
      ...item,
      grams,
      status: 'raw',
    };
  }

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
 * Personal DB prima, poi Kentu DB.
 * 1) Match letterale esatto (case/accenti) → resolved immediato, niente AI.
 * 2) Altrimenti Semantic Matchmaker (solo high/medium).
 * Restituisce anche alternatives (top 3–4 escluso il match).
 * @param {string} foodName
 * @param {{ personalDb?: object|null, kentuItDb?: object|null, signal?: AbortSignal }} ctx
 * @returns {Promise<{ match: object, source: 'personal'|'kentu', alternatives: object[] } | null>}
 */
export async function resolveMcdriveFoodViaSemanticMatchmaker(foodName, ctx = {}) {
  const name = String(foodName || '').trim();
  if (!name) return null;

  const signal = ctx.signal;
  const personalDb = ctx.personalDb && typeof ctx.personalDb === 'object' ? ctx.personalDb : null;
  const kentuItDb = ctx.kentuItDb && typeof ctx.kentuItDb === 'object' ? ctx.kentuItDb : null;

  // Gate letterale: priorità assoluta sul ranking semantico AI.
  if (personalDb && Object.keys(personalDb).length > 0) {
    const exactPersonal = findExactLiteralFoodInDb(name, personalDb);
    if (exactPersonal) {
      return {
        match: exactPersonal,
        source: 'personal',
        alternatives: [],
      };
    }
  }
  if (kentuItDb && Object.keys(kentuItDb).length > 0) {
    const exactKentu = findExactLiteralFoodInDb(name, kentuItDb);
    if (exactKentu) {
      return {
        match: exactKentu,
        source: 'kentu',
        alternatives: [],
      };
    }
  }

  if (personalDb && Object.keys(personalDb).length > 0) {
    const personalMatches = await findSemanticKentuMatches(name, {
      personalDb,
      kentuItDb: null,
    }, { signal });
    const personalHit = pickValidSemanticMatch(personalMatches);
    if (personalHit) {
      return {
        match: personalHit,
        source: 'personal',
        alternatives: buildMcDriveAlternatives(personalMatches, personalHit, MAX_ALTERNATIVES),
      };
    }
  }

  if (kentuItDb && Object.keys(kentuItDb).length > 0) {
    const kentuMatches = await findSemanticKentuMatches(name, {
      kentuItDb,
      personalDb: null,
    }, { signal });
    const kentuHit = pickValidSemanticMatch(kentuMatches);
    if (kentuHit) {
      return {
        match: kentuHit,
        source: 'kentu',
        alternatives: buildMcDriveAlternatives(kentuMatches, kentuHit, MAX_ALTERNATIVES),
      };
    }
  }

  return null;
}

export { getLastUsedQuantity };
