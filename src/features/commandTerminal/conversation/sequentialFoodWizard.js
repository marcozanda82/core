/**
 * SequentialFoodWizard — inserimento pasti vocale item-per-item (coda).
 *
 * mealWizardState: { pendingItems, resolvedItems, current, mealType, exactTime }
 */

import { searchFoodsDetailed, normalizeSearchText, getFoodUsageCount, compareFoodSearchHits } from '../../../foodSearch.js';
import { lookupHabitualGrams } from './mealButlerProposal.js';

export const MEAL_WIZARD_STATE = 'AWAITING_MEAL_WIZARD_ITEM';
export const MEAL_WIZARD_CONFIRM = 'AWAITING_MEAL_WIZARD_CONFIRM';

const DEFAULT_GRAMS = 100;
const MAX_OPTIONS = 4;

/** Famiglie lessicali: «pane» deve proporre anche rosetta/bauletto/azzimo se presenti in DB. */
const FOOD_FAMILY_SYNONYMS = Object.freeze({
  pane: ['pane', 'rosetta', 'bauletto', 'azzimo', 'ciabatta', 'baguette', 'michetta', 'tortina'],
  pasta: ['pasta', 'spaghetti', 'penne', 'fusilli', 'rigatoni', 'mezze maniche', 'trofie'],
  riso: ['riso', 'basmati', 'arborio', 'venere'],
  yogurt: ['yogurt', 'yoghurt', 'skyr'],
  pomodoro: ['pomodoro', 'pomodori', 'passata', 'pelati'],
  latte: ['latte', 'latticino'],
  uova: ['uova', 'uovo', 'albume'],
  pollo: ['pollo', 'petti', 'petto'],
});

function expandSearchQueries(spokenName) {
  const needle = normalizeSearchText(spokenName);
  if (!needle) return [];
  const token = needle.split(' ').filter(Boolean)[0];
  const family = FOOD_FAMILY_SYNONYMS[token];
  if (family) return [...new Set([needle, ...family])];
  return [needle];
}

/**
 * @typedef {{ spokenName: string, gramsHint?: number|null }} WizardPendingItem
 * @typedef {{
 *   foodName: string,
 *   grams: number,
 *   foodDbKey?: string|null,
 *   spokenName?: string,
 *   isEstimated?: boolean,
 * }} WizardResolvedItem
 * @typedef {{
 *   id: string,
 *   name: string,
 *   usageCount: number,
 *   lastUsedAt: number,
 *   isLastUsed: boolean,
 *   proposedGrams: number,
 * }} WizardCandidate
 * @typedef {{
 *   pendingItems: WizardPendingItem[],
 *   resolvedItems: WizardResolvedItem[],
 *   current: null | {
 *     spokenName: string,
 *     candidates: WizardCandidate[],
 *     proposedGrams: number,
 *     proposedCandidateId: string|null,
 *   },
 *   mealType: string|null,
 *   exactTime: string|null,
 *   timeString: string|null,
 *   phase: 'item'|'confirm',
 * }} MealWizardState
 */

function getFoodLastUsedAt(food) {
  if (!food || typeof food !== 'object') return 0;
  const candidates = [
    food.lastUsedAt,
    food.lastUsed,
    food.updatedAt,
    food.timestamp,
  ].map((v) => Number(v));
  const valid = candidates.filter((n) => Number.isFinite(n) && n > 0);
  return valid.length ? Math.max(...valid) : 0;
}

/**
 * @param {string[]} names
 * @returns {WizardPendingItem[]}
 */
export function buildPendingQueueFromNames(names = []) {
  const seen = new Set();
  const out = [];
  (Array.isArray(names) ? names : []).forEach((raw) => {
    const spokenName = String(raw || '').trim();
    if (!spokenName) return;
    const key = normalizeSearchText(spokenName);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ spokenName, gramsHint: null });
  });
  return out;
}

/**
 * @param {Array<{foodName?: string, name?: string, grams?: number}>} items
 * @returns {WizardPendingItem[]}
 */
export function buildPendingQueueFromFoodItems(items = []) {
  const seen = new Set();
  const out = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const spokenName = String(item?.foodName || item?.name || '').trim();
    if (!spokenName) return;
    const key = normalizeSearchText(spokenName);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const grams = Number(item?.grams);
    out.push({
      spokenName,
      gramsHint: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null,
    });
  });
  return out;
}

/**
 * Unisce item LLM + nomi grezzi dal testo utente (se il modello ne perde uno).
 * Preferisce la coda più lunga; i grammi hint restano dagli item strutturati.
 * @param {Array<object>} items
 * @param {string[]} bareNames
 * @returns {WizardPendingItem[]}
 */
export function resolveWizardPendingQueue(items = [], bareNames = []) {
  const fromItems = buildPendingQueueFromFoodItems(items);
  const fromNames = buildPendingQueueFromNames(bareNames);
  if (fromNames.length > fromItems.length) {
    return fromNames.map((pending) => {
      const key = normalizeSearchText(pending.spokenName);
      const hit = fromItems.find((i) => {
        const ik = normalizeSearchText(i.spokenName);
        return ik === key || ik.includes(key) || key.includes(ik);
      });
      return hit?.gramsHint ? { ...pending, gramsHint: hit.gramsHint } : pending;
    });
  }
  if (fromItems.length === 0) return fromNames;
  return fromItems;
}

/**
 * True se ADD_FOOD deve entrare nel SequentialFoodWizard (vietata bozza globale).
 * @param {Array<object>|number} itemsOrCount
 * @param {string} [userText]
 * @param {(text: string) => string[]} [extractBareNames]
 * @returns {boolean}
 */
export function shouldForceSequentialFoodWizard(itemsOrCount, userText = '', extractBareNames = null) {
  const itemCount = Array.isArray(itemsOrCount)
    ? itemsOrCount.filter((i) => String(i?.foodName || i?.name || '').trim()).length
    : Math.max(0, Number(itemsOrCount) || 0);
  if (itemCount > 1) return true;
  if (typeof extractBareNames === 'function') {
    const bare = extractBareNames(userText) || [];
    if (bare.length > 1) return true;
  }
  return false;
}

/**
 * Candidati dal DB personale per un termine (es. «pane»).
 * @param {object|null} personalDb
 * @param {string} spokenName
 * @param {Record<string, number>} [userPortions]
 * @returns {WizardCandidate[]}
 */
export function findWizardCandidates(personalDb, spokenName, userPortions = {}) {
  const needle = String(spokenName || '').trim();
  if (!needle || !personalDb || typeof personalDb !== 'object') return [];

  const queries = expandSearchQueries(needle);
  const byId = new Map();

  queries.forEach((q) => {
    const hits = searchFoodsDetailed(personalDb, q, {
      limit: 12,
      includeUserHistory: false,
      enableFuzzy: true,
    });
    hits.forEach((hit) => {
      const id = String(hit.id);
      const prev = byId.get(id);
      if (!prev || (Number(hit.strictScore) || 0) > (Number(prev.strictScore) || 0)) {
        byId.set(id, hit);
      }
    });
  });

  const needleNorm = normalizeSearchText(needle);
  const needleTokens = needleNorm.split(' ').filter(Boolean);
  const family = FOOD_FAMILY_SYNONYMS[needleTokens[0]] || [];

  const ranked = [...byId.values()]
    .map((hit) => {
      const food = personalDb[hit.id];
      const name = String(hit.name || food?.desc || food?.name || '').trim();
      const nameNorm = normalizeSearchText(name);
      const contains = needleTokens.every((t) => nameNorm.includes(t));
      const familyHit = family.some((syn) => nameNorm.includes(syn));
      const usageCount = Number(hit.usageCount) || getFoodUsageCount(food) || 0;
      const lastUsedAt = getFoodLastUsedAt(food);
      const strict = Number(hit.strictScore) || 0;
      const matchTier = String(hit.matchTier || 'none');
      // Exact full-name (100) > token in multi-word (80) > family synonym.
      const familyBoost = familyHit && !contains ? 5 : 0;
      return {
        id: String(hit.id),
        name,
        usageCount,
        lastUsedAt,
        contains,
        familyHit,
        strictScore: strict + familyBoost,
        matchTier,
        score: strict + familyBoost,
      };
    })
    .filter((row) => row.name && (row.contains || row.familyHit || row.strictScore >= 50))
    .sort((a, b) => compareFoodSearchHits(a, b));

  // Dedup per nome normalizzato
  const seenNames = new Set();
  const unique = [];
  for (let i = 0; i < ranked.length; i += 1) {
    const key = normalizeSearchText(ranked[i].name);
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    unique.push(ranked[i]);
    if (unique.length >= MAX_OPTIONS) break;
  }

  const lastUsedId = unique[0]?.id || null;

  return unique.map((row, index) => {
    const habitual = lookupHabitualGrams(row.name, userPortions, [])
      || lookupHabitualGrams(needle, userPortions, []);
    const proposedGrams = habitual || DEFAULT_GRAMS;
    return {
      id: row.id,
      name: sanitizeWizardFoodName(row.name) || row.name,
      usageCount: row.usageCount,
      lastUsedAt: row.lastUsedAt,
      isLastUsed: index === 0 && lastUsedId === row.id,
      proposedGrams,
    };
  });
}

/**
 * Prompt item corrente — voce breve + testo schermo (opzioni solo nei bottoni).
 * @param {{ spokenName: string, candidates: WizardCandidate[], proposedGrams: number }} current
 * @param {{ allSpokenNames?: string[] }} [meta]
 * @returns {{ spokenText: string, displayText: string }}
 */
export function buildWizardItemPrompt(current, meta = {}) {
  const spoken = String(current?.spokenName || 'alimento').trim();
  const candidates = Array.isArray(current?.candidates) ? current.candidates : [];
  const grams = Math.round(Number(current?.proposedGrams) || DEFAULT_GRAMS);
  const allNames = Array.isArray(meta.allSpokenNames)
    ? meta.allSpokenNames.map((n) => String(n || '').trim()).filter(Boolean)
    : [];

  const intro = allNames.length > 1
    ? `Ho annotato ${allNames.join(' e ')}. `
    : '';

  if (candidates.length === 0) {
    const text = `${intro}Per ${spoken} non trovo corrispondenze chiare nel tuo database. Dimmi il nome esatto e i grammi, oppure una foto all'etichetta.`;
    return { spokenText: text, displayText: text };
  }

  const preferred = candidates.find((c) => c.isLastUsed) || candidates[0];
  const preferredName = sanitizeWizardFoodName(preferred?.name) || spoken;
  const preferredGrams = Math.round(Number(preferred?.proposedGrams) || grams);
  const hasVariants = candidates.length > 1;

  // VOCE: solo la proposta principale — mai l'elenco delle varianti (restano sui bottoni).
  const spokenText = hasVariants
    ? `${intro}Per ${spoken}, ti propongo il tuo solito ${preferredName} da ${preferredGrams}g. Confermi o scegli una delle varianti a schermo?`
    : `${intro}Per ${spoken}, ti propongo il tuo solito ${preferredName} da ${preferredGrams}g. Confermi?`;

  // SCHERMO: stesso testo breve; le opzioni sono nei quickReplies / bottoni.
  return { spokenText, displayText: spokenText };
}

/**
 * @deprecated Usa buildWizardItemPrompt(...).spokenText
 * @returns {string}
 */
export function buildWizardItemSpokenText(current, meta = {}) {
  return buildWizardItemPrompt(current, meta).spokenText;
}

/**
 * Quick replies cliccabili per l'item corrente (solo UI, mai TTS).
 * @param {{ candidates: WizardCandidate[], proposedGrams: number }} current
 * @returns {string[]}
 */
export function buildWizardItemQuickReplies(current) {
  const candidates = Array.isArray(current?.candidates) ? current.candidates : [];
  const grams = Math.round(Number(current?.proposedGrams) || DEFAULT_GRAMS);
  const replies = candidates.slice(0, MAX_OPTIONS).map((c) => {
    const cleanName = sanitizeWizardFoodName(c.name) || c.name;
    const g = Math.round(Number(c.proposedGrams) || grams);
    return c.isLastUsed
      ? `${cleanName} ${g}g (solito)`
      : `${cleanName} ${g}g`;
  });
  if (replies.length > 0) {
    replies.push('Altro / foto etichetta');
  }
  return replies.slice(0, 5);
}

/**
 * Riepilogo finale wizard (testo grezzo — preferire card proposal).
 * @param {WizardResolvedItem[]} resolvedItems
 * @returns {string}
 */
export function buildWizardFinalSummary(resolvedItems = []) {
  const list = Array.isArray(resolvedItems) ? resolvedItems.filter((i) => i?.foodName) : [];
  if (list.length === 0) {
    return 'Non ho elementi da salvare. Vuoi ricominciare?';
  }
  const bits = list.map((item) => {
    const g = Math.round(Number(item.grams) || 0);
    const name = sanitizeWizardFoodName(item.foodName) || String(item.foodName || '').trim();
    return g > 0 ? `${name} ${g}g` : name;
  });
  const summary = bits.length === 1
    ? bits[0]
    : `${bits.slice(0, -1).join(', ')} e ${bits[bits.length - 1]}`;
  return `Perfetto, ho registrato ${summary}. Salvo nel diario?`;
}

/** TTS breve alla chiusura coda → card riepilogo. */
export function buildWizardFinalSpokenText() {
  return 'Perfetto, ho preparato il riepilogo. Confermi il salvataggio?';
}

export function buildWizardFinalQuickReplies() {
  return ['Sì, salva', 'Annulla'];
}

/**
 * Nome alimento pulito: niente etichette porzione concatenate.
 * Es. "pomodoro (1 porzione (~10 g)) (1 100 g) 1g" → "pomodoro"
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeWizardFoodName(raw) {
  let name = String(raw || '').trim();
  if (!name) return '';

  name = name.replace(/\(\s*solito\s*\)/gi, ' ');

  // Taglia alla prima parentesi di serving-size (anche nested).
  const cut = name.search(/\(\s*(?:\d+\s*)?(?:porzion|[~]?\s*\d)/i);
  if (cut > 0) {
    name = name.slice(0, cut).trim();
  }

  let prev = '';
  let guard = 0;
  while (prev !== name && guard < 16) {
    prev = name;
    guard += 1;
    // Innermost (...) che sembrano porzioni / grammi
    name = name.replace(/\(([^()]*)\)/g, (full, inner) => {
      const body = String(inner || '');
      if (/\bporzion[ei]\b/i.test(body)) return ' ';
      if (/~\s*\d/i.test(body)) return ' ';
      if (/\d+(?:[.,]\d+)?\s*(?:g|gr|grammi)\b/i.test(body)) return ' ';
      if (/^\s*\d+\s+\d+(?:[.,]\d+)?\s*g?\s*$/i.test(body)) return ' ';
      return full;
    });
    name = name
      .replace(/\s+\d+(?:[.,]\d+)?\s*(?:g|gr|grammi)\b(?:\s*\(.*\))?/gi, ' ')
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:g|gr|grammi)\b\s*$/gi, ' ')
      // Residui tipo "1 porzione" / "2 porzioni" fuori da parentesi
      .replace(/\b\d+\s*porzion[ei]\b/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return name.replace(/^[,;\-–—\s]+|[,;\-–—\s]+$/g, '').trim();
}
function cleanFoodPhrase(raw) {
  return sanitizeWizardFoodName(
    String(raw || '')
      .replace(/^(?:la|il|lo|l'|un|una|uno|di|del|della|dello|dei|degli|delle)\s+/i, '')
      .replace(/\b(?:per\s+favore|grazie|prego|va\s+bene|ok|okay)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function parseGramsFromText(text) {
  const m = String(text || '').match(/(\d{1,4})\s*(?:g|gr|grammi)?\b/i);
  if (!m) return null;
  const n = Math.round(Number(String(m[1]).replace(',', '.')));
  return Number.isFinite(n) && n > 0 && n <= 5000 ? n : null;
}

/**
 * @param {WizardCandidate[]} candidates
 * @param {string} userText
 * @returns {WizardCandidate|null}
 */
export function matchCandidateFromUserText(candidates, userText) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) return null;
  const text = normalizeSearchText(userText);
  if (!text) return null;

  // Conferma del proposto / primo (ultimo usato)
  if (/^(?:s[iì]|ok|okay|va bene|quello|il solito|solito|confermo)\b/i.test(String(userText || '').trim())
    || /ultimo\s+usato|il\s+primo|quello\s+l[aà]/i.test(text)) {
    return list.find((c) => c.isLastUsed) || list[0];
  }

  let best = null;
  let bestScore = 0;
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    const nameNorm = normalizeSearchText(c.name);
    const tokens = nameNorm.split(' ').filter((t) => t.length >= 3);
    if (nameNorm && text.includes(nameNorm)) {
      return c;
    }
    const hitTokens = tokens.filter((t) => text.includes(t)).length;
    const score = hitTokens * 10 + (c.isLastUsed ? 1 : 0) + (c.usageCount || 0) * 0.01;
    if (hitTokens > 0 && score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Interpreta la risposta vocale sull'item corrente.
 * @param {MealWizardState} state
 * @param {string} userText
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   requestPhoto?: boolean,
 *   resolved?: WizardResolvedItem,
 * }}
 */
export function parseWizardItemReply(state, userText) {
  const text = String(userText || '').trim();
  if (!text) return { ok: false, reason: 'empty' };

  if (/foto|etichett|confezione|altro\s*\/?\s*foto|non\s+(?:ce|c'è|ho)/i.test(text)) {
    return { ok: false, reason: 'request_photo', requestPhoto: true };
  }

  const current = state?.current;
  if (!current) return { ok: false, reason: 'no_current' };

  const candidates = Array.isArray(current.candidates) ? current.candidates : [];
  const gramsFromUser = parseGramsFromText(text);
  const matched = matchCandidateFromUserText(candidates, text);

  // Nome libero se nessun match ma testo senza solo grammi
  if (!matched && candidates.length === 0) {
    const cleaned = cleanFoodPhrase(text.replace(/\d+\s*(?:g|gr|grammi)?/gi, ' '));
    if (cleaned.length >= 2) {
      return {
        ok: true,
        resolved: {
          foodName: cleaned,
          grams: gramsFromUser || current.proposedGrams || DEFAULT_GRAMS,
          spokenName: current.spokenName,
          isEstimated: !gramsFromUser,
          foodDbKey: null,
        },
      };
    }
    return { ok: false, reason: 'unparsed' };
  }

  if (!matched && gramsFromUser && candidates.length >= 1) {
    // Solo grammi → conferma candidato proposto (ultimo usato)
    const pick = candidates.find((c) => c.isLastUsed) || candidates[0];
    return {
      ok: true,
      resolved: {
        foodName: sanitizeWizardFoodName(pick.name) || pick.name,
        grams: gramsFromUser,
        foodDbKey: pick.id,
        spokenName: current.spokenName,
        isEstimated: false,
      },
    };
  }

  if (!matched) {
    // Prova nome libero che contiene il termine parlato
    const cleaned = cleanFoodPhrase(text.replace(/\d+\s*(?:g|gr|grammi)?/gi, ' '));
    if (cleaned.length >= 2) {
      return {
        ok: true,
        resolved: {
          foodName: cleaned,
          grams: gramsFromUser || current.proposedGrams || DEFAULT_GRAMS,
          spokenName: current.spokenName,
          isEstimated: !gramsFromUser,
          foodDbKey: null,
        },
      };
    }
    return { ok: false, reason: 'unparsed' };
  }

  return {
    ok: true,
    resolved: {
      foodName: sanitizeWizardFoodName(matched.name) || matched.name,
      grams: gramsFromUser || matched.proposedGrams || current.proposedGrams || DEFAULT_GRAMS,
      foodDbKey: matched.id,
      spokenName: current.spokenName,
      isEstimated: !gramsFromUser,
    },
  };
}

/**
 * Crea lo stato wizard iniziale e prepara il primo current.
 * @param {{
 *   pendingItems: WizardPendingItem[],
 *   mealType?: string|null,
 *   exactTime?: string|null,
 *   personalDb?: object|null,
 *   userPortions?: Record<string, number>,
 * }} opts
 * @returns {MealWizardState}
 */
export function createMealWizardState(opts = {}) {
  const pendingItems = Array.isArray(opts.pendingItems) ? [...opts.pendingItems] : [];
  /** @type {MealWizardState} */
  const state = {
    pendingItems,
    resolvedItems: [],
    current: null,
    mealType: opts.mealType || null,
    exactTime: opts.exactTime || null,
    timeString: opts.exactTime || null,
    phase: 'item',
  };
  return advanceWizardToNextItem(state, {
    personalDb: opts.personalDb,
    userPortions: opts.userPortions,
  });
}

/**
 * Popola `current` dal primo pending (senza rimuoverlo finché non risolto).
 * @param {MealWizardState} state
 * @param {{ personalDb?: object|null, userPortions?: Record<string, number> }} ctx
 * @returns {MealWizardState}
 */
export function advanceWizardToNextItem(state, ctx = {}) {
  const next = {
    ...state,
    pendingItems: [...(state.pendingItems || [])],
    resolvedItems: [...(state.resolvedItems || [])],
  };

  if (next.pendingItems.length === 0) {
    next.current = null;
    next.phase = 'confirm';
    return next;
  }

  const head = next.pendingItems[0];
  const candidates = findWizardCandidates(
    ctx.personalDb || null,
    head.spokenName,
    ctx.userPortions || {},
  );
  const proposedGrams = head.gramsHint
    || candidates[0]?.proposedGrams
    || lookupHabitualGrams(head.spokenName, ctx.userPortions || {}, [])
    || DEFAULT_GRAMS;

  next.current = {
    spokenName: head.spokenName,
    candidates,
    proposedGrams: Math.round(proposedGrams),
    proposedCandidateId: candidates[0]?.id || null,
  };
  next.phase = 'item';
  return next;
}

/**
 * Applica risoluzione dell'item corrente e avanza.
 * @param {MealWizardState} state
 * @param {WizardResolvedItem} resolved
 * @param {{ personalDb?: object|null, userPortions?: Record<string, number> }} ctx
 * @returns {MealWizardState}
 */
export function commitWizardItemAndAdvance(state, resolved, ctx = {}) {
  const pendingItems = [...(state.pendingItems || [])];
  if (pendingItems.length > 0) pendingItems.shift();

  const cleanName = sanitizeWizardFoodName(resolved?.foodName)
    || sanitizeWizardFoodName(resolved?.spokenName)
    || String(resolved?.foodName || '').trim();
  const grams = Math.round(Number(resolved?.grams) || DEFAULT_GRAMS);

  const resolvedItems = [
    ...(state.resolvedItems || []),
    {
      // Solo nome pulito + grammi finali — mai etichette porzione concatenate.
      foodName: cleanName,
      grams: Number.isFinite(grams) && grams > 0 ? grams : DEFAULT_GRAMS,
      foodDbKey: resolved?.foodDbKey ?? null,
      spokenName: String(resolved?.spokenName || state.current?.spokenName || '').trim(),
      isEstimated: resolved?.isEstimated === true,
    },
  ];

  return advanceWizardToNextItem(
    {
      ...state,
      pendingItems,
      resolvedItems,
      current: null,
    },
    ctx,
  );
}

/**
 * Messaggio di passaggio dopo aver salvato un item.
 * Voce breve: solo ack + proposta del PROSSIMO item (mai elenco varianti).
 * @returns {{ spokenText: string, displayText: string, isFinal: boolean }}
 */
export function buildWizardAdvanceMessage(resolved, nextState) {
  const savedName = (
    sanitizeWizardFoodName(resolved?.foodName)
    || String(resolved?.spokenName || 'alimento').trim()
  ).toLowerCase();
  const prefix = `Va bene, ${savedName} registrato.`;

  if (nextState.phase === 'confirm' || !nextState.current) {
    const spokenText = buildWizardFinalSpokenText();
    return { spokenText, displayText: spokenText, isFinal: true };
  }

  const nextPrompt = buildWizardItemPrompt(nextState.current);
  const spokenText = `${prefix} Passiamo a ${nextState.current.spokenName}. ${nextPrompt.spokenText}`;
  return {
    spokenText,
    displayText: spokenText,
    isFinal: false,
  };
}

/**
 * Payload ADD_FOOD da resolvedItems.
 * @param {MealWizardState} state
 * @returns {object}
 */
export function buildFoodPayloadFromWizard(state) {
  return {
    mealType: state.mealType || null,
    exactTime: state.exactTime || null,
    timeString: state.timeString || state.exactTime || null,
    items: (state.resolvedItems || []).map((item) => ({
      foodName: sanitizeWizardFoodName(item.foodName) || String(item.foodName || '').trim(),
      grams: Math.round(Number(item.grams) || DEFAULT_GRAMS),
      isEstimated: item.isEstimated === true,
      ...(item.foodDbKey != null ? { foodDbKey: item.foodDbKey } : {}),
      ...(item.spokenName ? { spokenFoodName: item.spokenName } : {}),
    })),
  };
}

/**
 * Conferma/annulla in fase finale wizard.
 * @param {string} userText
 * @returns {'confirm'|'cancel'|'unknown'}
 */
export function classifyWizardFinalReply(userText) {
  const t = String(userText || '').trim().toLowerCase();
  if (!t) return 'unknown';
  if (/^(?:s[iì]|ok|okay|va bene|confermo|salva|procedi|yes)\b/.test(t)) return 'confirm';
  if (/^(?:no|annulla|cancel|stop)\b/.test(t)) return 'cancel';
  return 'unknown';
}
