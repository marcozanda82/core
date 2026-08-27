import {
  parseConsumedMealFromNaturalText,
  extractBareFoodNamesFromText,
} from './mealLogIntent.js';
import {
  computeMacrosForWeight,
  getPer100Macros,
} from '../../mealBuilder/utils/foodMacroUtils.js';
import { getDynamicMealTargets, toCanonicalMealType } from '../../../coreEngine.jsx';
import { getLastUsedQuantity } from './userRecentFoods.js';
import { resolveFoodAcrossDatabases } from './multiDbFoodResolver.js';
import { attachResolvedFoodIcon } from '../../../utils/foodCategoryIcon.js';
import {
  findCoffeeShopProductByName,
  getCoffeeShopProductById,
  coffeeShopProductToCatalogRow,
  coffeeShopExtrasFromProduct,
} from '../../../constants/coffeeShopDatabase.js';
import { resolveSmartDefaultPortion } from '../../../utils/smartFoodPortions.js';
import { resolveFoodVisualEmoji } from '../../../utils/foodVisualResolver.js';

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
  'Lavagna aperta. Digita gli alimenti (es. «un caffè zuccherato e un croissant» o «100g pasta»), poi tocca Calcola Valori.';

export const EMPTY_MCDRIVE_TOTALS = Object.freeze({
  kcal: 0,
  pro: 0,
  carbo: 0,
  fat: 0,
});

/** Margine relativo (±) per evidenziare macro «on target». */
export const MCDRIVE_TARGET_MARGIN_RATIO = 0.1;

const DEFAULT_GRAMS = 100;
/** Solo match ad alta confidenza: evita allucinazioni tipo «passata» → pizza. */
const VALID_CONFIDENCE = new Set(['high']);
const MCDRIVE_MEAL_TYPES = new Set(['colazione', 'snack', 'pranzo', 'cena']);
const MAX_ALTERNATIVES = 4;

/** Stati che richiedono la scheda di risoluzione alimento. */
export const MCDRIVE_DISAMBIGUATION_STATUSES = Object.freeze([
  'requires_disambiguation',
  'pending_enrichment',
]);

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
 * Più alimenti per messaggio (es. «un caffè zuccherato e un croissant»).
 * @param {string} userText
 * @returns {Array<{ foodName: string, grams: number, isEstimated: boolean, coffeeShopProductId?: string|null, servingLabel?: string|null }>}
 */
export function parseMcdriveFoodInputs(userText) {
  const text = String(userText || '').trim();
  if (!text) return [];

  /** @type {Array<{ foodName: string, grams: number, isEstimated: boolean, coffeeShopProductId?: string|null, servingLabel?: string|null }>} */
  const out = [];
  const seen = new Set();

  const pushItem = (foodName, gramsHint, estimatedHint) => {
    const name = String(foodName || '').trim();
    if (!name || name.length < 2) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const portion = resolveSmartDefaultPortion(name);
    const hasExplicitGrams = Number.isFinite(Number(gramsHint)) && Number(gramsHint) > 0;
    const grams = hasExplicitGrams
      ? Math.max(1, Math.round(Number(gramsHint)))
      : portion.grams;
    out.push({
      foodName: name,
      grams,
      isEstimated: hasExplicitGrams ? false : (estimatedHint !== false),
      coffeeShopProductId: portion.coffeeShopProductId || null,
      servingLabel: portion.servingLabel || null,
    });
  };

  const parsed = parseConsumedMealFromNaturalText(text);
  if (parsed?.items?.length) {
    parsed.items.forEach((item) => {
      pushItem(item.foodName, item.grams, false);
    });
  }

  if (out.length === 0) {
    const bare = extractBareFoodNamesFromText(text);
    bare.forEach((name) => pushItem(name, null, true));
  }

  return out;
}

/**
 * Un alimento (compat): primo hit di parseMcdriveFoodInputs.
 * @param {string} userText
 * @returns {{ foodName: string, grams: number, isEstimated: boolean, coffeeShopProductId?: string|null, servingLabel?: string|null } | null}
 */
export function parseMcdriveFoodInput(userText) {
  const items = parseMcdriveFoodInputs(userText);
  return items[0] || null;
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
    exactTime: meta?.exactTime ?? null,
    timeString: meta?.timeString ?? null,
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
 * Appunto grezzo sul vassoio (Sandbox): nessun match DB remoto.
 * Se match coffee shop locale → grammi/unità/icona già corretti.
 * @param {{ foodName?: string, grams?: number, isEstimated?: boolean, coffeeShopProductId?: string|null, servingLabel?: string|null }} parsed
 */
export function buildMcDriveRawItem(parsed = {}) {
  const foodName = String(parsed?.foodName || '').trim();
  const portion = resolveSmartDefaultPortion(foodName);
  const product = portion.product
    || (parsed?.coffeeShopProductId
      ? findCoffeeShopProductByName(foodName)
      : findCoffeeShopProductByName(foodName));
  const grams = Math.max(
    1,
    Math.round(
      Number(parsed?.grams)
      || portion.grams
      || DEFAULT_GRAMS,
    ),
  );
  const id = `mcdrive_raw_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const icon = product
    ? (product.kind === 'pastry' ? '🥐' : '☕')
    : resolveFoodVisualEmoji(foodName);

  return {
    id,
    foodName: product?.name || foodName,
    spokenFoodName: foodName,
    grams,
    status: 'raw',
    isEstimated: parsed?.isEstimated === true && !product,
    servingLabel: parsed?.servingLabel || portion.servingLabel || null,
    coffeeShopProductId: product?.id || parsed?.coffeeShopProductId || null,
    icon,
    emoji: icon,
    ...(product ? coffeeShopExtrasFromProduct(product) : {}),
  };
}

/**
 * @param {object} item
 * @returns {boolean}
 */
/**
 * @param {string|object} statusOrItem
 * @returns {boolean}
 */
export function isMcDriveDisambiguationStatus(statusOrItem) {
  const status = typeof statusOrItem === 'object'
    ? String(statusOrItem?.status || '').toLowerCase()
    : String(statusOrItem || '').toLowerCase();
  return MCDRIVE_DISAMBIGUATION_STATUSES.includes(status);
}

export function isMcDriveRawItem(item) {
  if (!item || typeof item !== 'object') return false;
  const status = String(item.status || '').toLowerCase();
  if (status === 'resolved') return false;
  if (status === 'raw' || status === 'pending_enrichment' || status === 'requires_disambiguation'
    || status === 'skipped' || status === 'processing' || status === 'validating') {
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
 * True quando la validazione sequenziale McDrive è al penultimo alimento o oltre
 * (sblocca il video header oltre i primi 3 secondi).
 * @param {object[]} [items]
 * @returns {boolean}
 */
export function isMcDriveValidationPenultimateOrLater(items = []) {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  if (total === 0) return true;
  if (total <= 2) return true;

  const processingIdx = list.findIndex(
    (item) => String(item?.status || '').toLowerCase() === 'processing',
  );
  if (processingIdx >= 0 && processingIdx >= total - 2) {
    return true;
  }

  const awaitingCount = list.filter((item) => {
    const status = String(item?.status || '').toLowerCase();
    return status === 'raw' || status === 'processing' || status === 'validating';
  }).length;
  if (awaitingCount <= 2) {
    return true;
  }

  const nextRawIdx = findNextRawMcDriveIndex(list);
  if (nextRawIdx < 0 && !draftHasRawMcDriveItems(list)) {
    return true;
  }

  return false;
}

/**
 * @param {object[]} [items]
 * @returns {boolean}
 */
export function hasPendingMcDriveEnrichment(items = []) {
  return (Array.isArray(items) ? items : []).some((item) => isMcDriveDisambiguationStatus(item));
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
  const coffeeId = row.coffeeShopProductId || extra.coffeeShopProductId || null;
  const product = (coffeeId ? getCoffeeShopProductById(coffeeId) : null)
    || findCoffeeShopProductByName(spokenName)
    || findCoffeeShopProductByName(officialName);

  const servingGrams = Number(product?.servingGrams || row.servingGrams || row.defaultUnitWeight) || 0;
  const weight = Math.max(
    1,
    Math.round(Number(grams) || servingGrams || DEFAULT_GRAMS),
  );

  let kcal;
  let pro;
  let carbo;
  let fat;

  if (product && row.servingMacros) {
    const baseG = Math.max(1, Number(product.servingGrams) || servingGrams || weight);
    const ratio = weight / baseG;
    kcal = Math.round((Number(product.kcal) || 0) * ratio);
    pro = Math.round(((Number(product.prot) || 0) * ratio) * 10) / 10;
    carbo = Math.round(((Number(product.carb) || 0) * ratio) * 10) / 10;
    fat = Math.round(((Number(product.fat) || 0) * ratio) * 10) / 10;
  } else if (row.servingMacros && servingGrams > 0) {
    const ratio = weight / servingGrams;
    kcal = Math.round((Number(row.servingMacros.kcal) || 0) * ratio);
    pro = Math.round(((Number(row.servingMacros.prot) || 0) * ratio) * 10) / 10;
    carbo = Math.round(((Number(row.servingMacros.carb) || 0) * ratio) * 10) / 10;
    fat = Math.round(((Number(row.servingMacros.fat) || 0) * ratio) * 10) / 10;
  } else {
    const per100 = getPer100Macros({ row });
    const macros = computeMacrosForWeight(per100, weight);
    kcal = Math.round(Number(macros.kcal) || 0);
    pro = Number(macros.prot) || 0;
    carbo = Number(macros.carb) || 0;
    fat = Number(macros.fat) || 0;
  }

  const alternatives = Array.isArray(extra?.alternatives)
    ? extra.alternatives.map((alt) => ({ ...alt }))
    : [];

  const icon = product
    ? (product.kind === 'pastry' ? '🥐' : '☕')
    : (row.icon || row.emoji || resolveFoodVisualEmoji(officialName || spokenName));

  const catalogRow = product ? coffeeShopProductToCatalogRow(product) : null;

  return attachResolvedFoodIcon({
    ...(extra?.id ? { id: extra.id } : {}),
    foodName: officialName || String(spokenName || '').trim(),
    spokenFoodName: String(spokenName || officialName).trim(),
    grams: weight,
    kcal,
    pro,
    carbo,
    fat,
    foodDbKey: foodDbKey || (catalogRow?.foodDbKey ?? null),
    source: product ? 'coffee_shop' : source,
    status: 'resolved',
    isEstimated: extra.isEstimated === true && !product,
    alternatives,
    icon,
    emoji: icon,
    servingLabel: product?.servingLabel || row.servingLabel || null,
    coffeeShopProductId: product?.id || coffeeId || null,
    ...(product ? coffeeShopExtrasFromProduct(product) : {}),
    ...(catalogRow || Object.keys(row).length > 0
      ? { row: catalogRow || { ...row } }
      : {}),
  });
}

/**
 * Risolve grammi: se stima (niente quantità nel testo), prova memoria storica.
 * @param {{ grams?: number, isEstimated?: boolean, foodName?: string }} itemOrParsed
 * @param {{ foodDbKey?: string|null, foodName?: string }} matchInfo
 * @param {object} [currentState]
 * @returns {number}
 */
export function resolveMcdriveGramsWithHistory(itemOrParsed, matchInfo = {}, currentState = {}) {
  const foodName = String(
    itemOrParsed?.foodName || matchInfo?.foodName || '',
  ).trim();
  const smart = resolveSmartDefaultPortion(foodName);
  const fallback = Math.max(
    1,
    Math.round(
      Number(itemOrParsed?.grams)
      || smart.grams
      || DEFAULT_GRAMS,
    ),
  );

  // Catalogo locale / porzione pezzo: non sovrascrivere con 100g storici sbagliati.
  if (smart.coffeeShopProductId || smart.kind === 'piece' || smart.kind === 'pastry' || smart.kind === 'coffee') {
    if (itemOrParsed?.isEstimated === true || !Number(itemOrParsed?.grams)) {
      return smart.grams;
    }
  }

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
    const servingGrams = Number(row.servingGrams || row.defaultUnitWeight) || 0;
    if (row.servingMacros && servingGrams > 0) {
      const ratio = grams / servingGrams;
      return {
        ...item,
        grams,
        kcal: Math.round((Number(row.servingMacros.kcal) || 0) * ratio),
        pro: Math.round(((Number(row.servingMacros.prot) || 0) * ratio) * 10) / 10,
        carbo: Math.round(((Number(row.servingMacros.carb) || 0) * ratio) * 10) / 10,
        fat: Math.round(((Number(row.servingMacros.fat) || 0) * ratio) * 10) / 10,
        isEstimated: false,
      };
    }
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
 * Pipeline multi-DB gerarchica: Personale → CREA/Kentu IT → USDA → OFF.
 * Auto-accetta solo confidenza ≥ 0.85; altrimenti needsDisambiguation + candidati.
 * @param {string} foodName
 * @param {{
 *   personalDb?: object|null,
 *   kentuItDb?: object|null,
 *   globalDb?: object|null,
 *   offDb?: object|null,
 *   signal?: AbortSignal,
 * }} ctx
 * @returns {Promise<{
 *   match: object|null,
 *   source: string|null,
 *   alternatives: object[],
 *   candidates: object[],
 *   confidenceScore: number,
 *   needsDisambiguation: boolean,
 * }>}
 */
export async function resolveMcdriveFoodViaSemanticMatchmaker(foodName, ctx = {}) {
  const name = String(foodName || '').trim();
  if (!name) {
    return {
      match: null,
      source: null,
      alternatives: [],
      candidates: [],
      confidenceScore: 0,
      needsDisambiguation: true,
      searchLevel: 1,
      needsExternalSearch: true,
    };
  }

  // L1 subito; L2 deferito alla UI di disambiguazione (feedback + Interrompi).
  const decision = await resolveFoodAcrossDatabases(name, {
    personalDb: ctx.personalDb,
    kentuItDb: ctx.kentuItDb,
    globalDb: ctx.globalDb,
    offDb: ctx.offDb,
    userFoodAliases: ctx.userFoodAliases,
    signal: ctx.signal,
    deferExternalSearch: ctx.deferExternalSearch !== false,
    onProgress: ctx.onProgress,
  });

  if (!decision.needsDisambiguation && decision.match) {
    const label = String(decision.match.confidence || '').toLowerCase();
    if (label && !VALID_CONFIDENCE.has(label) && Number(decision.confidenceScore) < 0.8) {
      return {
        ...decision,
        match: null,
        needsDisambiguation: true,
      };
    }
  }

  return decision;
}

export { getLastUsedQuantity };
