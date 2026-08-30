/**
 * SequentialFoodWizard — inserimento pasti vocale item-per-item (coda).
 *
 * mealWizardState: { pendingItems, resolvedItems, current, mealType, exactTime }
 */

import {
  searchFoodsWithKeywords,
  normalizeSearchText,
  normalizeSearchKeywords,
  getFoodUsageCount,
  compareFoodSearchHits,
  shouldDiscloseSynonymMapping,
  italianSingularPluralForms,
} from '../../../foodSearch.js';
import { lookupHabitualGrams } from './mealButlerProposal.js';
import { sanitizeFoodDisplayName } from '../../../utils/foodVisualResolver.js';

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

/**
 * Query di ricerca: searchKeywords LLM + famiglie locali + flessioni.
 * @param {string} spokenName
 * @param {string[]|null|undefined} searchKeywords
 * @returns {string[]}
 */
function expandSearchQueries(spokenName, searchKeywords = null) {
  const keywords = normalizeSearchKeywords(spokenName, searchKeywords);
  const needle = normalizeSearchText(spokenName);
  const token = needle.split(' ').filter(Boolean)[0];
  const family = token ? FOOD_FAMILY_SYNONYMS[token] : null;
  if (family) {
    return [...new Set([...keywords, ...family])];
  }
  return keywords.length > 0 ? keywords : (needle ? [needle] : []);
}

/**
 * @typedef {{ spokenName: string, gramsHint?: number|null, searchKeywords?: string[] }} WizardPendingItem
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
 * @param {Array<{foodName?: string, name?: string, grams?: number, searchKeywords?: string[]}>} items
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
    const searchKeywords = normalizeSearchKeywords(spokenName, item?.searchKeywords);
    out.push({
      spokenName,
      gramsHint: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null,
      ...(searchKeywords.length > 0 ? { searchKeywords } : {}),
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
      if (!hit) return pending;
      return {
        ...pending,
        ...(hit.gramsHint ? { gramsHint: hit.gramsHint } : {}),
        ...(hit.searchKeywords?.length ? { searchKeywords: hit.searchKeywords } : {}),
      };
    });
  }
  if (fromItems.length === 0) return fromNames;
  return fromItems;
}

/**
 * Unisce grammi espliciti dal testo naturale (es. «21 g di noci») nella coda wizard.
 * @param {WizardPendingItem[]} pendingItems
 * @param {Array<{foodName?: string, name?: string, grams?: number}>} naturalItems
 * @returns {WizardPendingItem[]}
 */
export function mergeExplicitGramsIntoQueue(pendingItems = [], naturalItems = []) {
  const naturals = buildPendingQueueFromFoodItems(naturalItems);
  if (naturals.length === 0) return pendingItems;
  return (Array.isArray(pendingItems) ? pendingItems : []).map((pending) => {
    if (pending.gramsHint != null && pending.gramsHint > 0) return pending;
    const key = normalizeSearchText(pending.spokenName);
    const hit = naturals.find((n) => {
      const nk = normalizeSearchText(n.spokenName);
      return nk === key || nk.includes(key) || key.includes(nk);
    });
    return hit?.gramsHint ? { ...pending, gramsHint: hit.gramsHint } : pending;
  });
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
 * Candidati dal DB personale per un termine (es. «pane» / «cocomero»).
 * Cicla searchKeywords: match esatto su qualsiasi keyword = Livello 1.
 * @param {object|null} personalDb
 * @param {string} spokenName
 * @param {Record<string, number>} [userPortions]
 * @param {string[]|null} [searchKeywords]
 * @returns {WizardCandidate[]}
 */
export function findWizardCandidates(personalDb, spokenName, userPortions = {}, searchKeywords = null) {
  const needle = String(spokenName || '').trim();
  if (!needle || !personalDb || typeof personalDb !== 'object') return [];

  const queries = expandSearchQueries(needle, searchKeywords);
  // Una sola passata multi-keyword: exact su qualsiasi termine = Livello 1.
  const hits = searchFoodsWithKeywords(personalDb, queries, {
    limit: 24,
    includeUserHistory: false,
    enableFuzzy: true,
  });

  const needleNorm = normalizeSearchText(needle);
  const needleTokens = needleNorm.split(' ').filter(Boolean);
  const family = FOOD_FAMILY_SYNONYMS[needleTokens[0]] || [];
  const keywordNorms = new Set(
    queries.map((q) => normalizeSearchText(q)).filter(Boolean),
  );

  const ranked = hits
    .map((hit) => {
      const food = personalDb[hit.id];
      const name = String(hit.name || food?.desc || food?.name || '').trim();
      const nameNorm = normalizeSearchText(name);
      const contains = needleTokens.every((t) => nameNorm.includes(t));
      const familyHit = family.some((syn) => nameNorm.includes(syn));
      const synonymExact = keywordNorms.has(nameNorm)
        || [...keywordNorms].some((kw) => kw && (nameNorm === kw || italianSingularPluralForms(kw).includes(nameNorm)));
      const usageCount = Number(hit.usageCount) || getFoodUsageCount(food) || 0;
      const lastUsedAt = getFoodLastUsedAt(food);
      let strict = Number(hit.strictScore) || 0;
      let matchTier = String(hit.matchTier || 'none');
      // Exact full-name su foodName O su qualsiasi searchKeyword → Livello 1.
      if (synonymExact || hit.keywordExact || matchTier === 'exact') {
        strict = Math.max(strict, 100);
        matchTier = 'exact';
      }
      const familyBoost = familyHit && !contains && matchTier !== 'exact' ? 5 : 0;
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
 * Applica grammi espliciti utente a tutti i candidati (niente override storico).
 * @param {WizardCandidate[]} candidates
 * @param {number|null} explicitGrams
 * @returns {WizardCandidate[]}
 */
function withExplicitGramsOnCandidates(candidates, explicitGrams) {
  const g = Math.round(Number(explicitGrams) || 0);
  if (!(g > 0)) return candidates;
  return (Array.isArray(candidates) ? candidates : []).map((c) => ({
    ...c,
    proposedGrams: g,
  }));
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
  const explicit = current?.explicitGrams === true;
  const allNames = Array.isArray(meta.allSpokenNames)
    ? meta.allSpokenNames.map((n) => String(n || '').trim()).filter(Boolean)
    : [];

  const intro = allNames.length > 1
    ? `Ho annotato ${allNames.join(' e ')}. `
    : '';

  if (candidates.length === 0) {
    const text = explicit
      ? `${intro}Per ${spoken} non trovo corrispondenze chiare. Segno ${grams}g come hai indicato? Dimmi il nome esatto, oppure una foto all'etichetta.`
      : `${intro}Per ${spoken} non trovo corrispondenze chiare nel tuo database. Dimmi il nome esatto e i grammi, oppure una foto all'etichetta.`;
    return { spokenText: text, displayText: text };
  }

  const preferred = candidates.find((c) => c.isLastUsed) || candidates[0];
  const preferredName = sanitizeWizardFoodName(preferred?.name) || spoken;
  // Grammi espliciti utente: mai sovrascrivere con porzione storica del candidato.
  const preferredGrams = explicit
    ? grams
    : Math.round(Number(preferred?.proposedGrams) || grams);
  const hasVariants = candidates.length > 1;
  const gramsPhrase = explicit
    ? `da ${preferredGrams}g come hai richiesto`
    : `da ${preferredGrams}g`;

  // Sinonimo risolto (cocomero → Anguria): voce trasparente.
  if (shouldDiscloseSynonymMapping(spoken, preferredName)) {
    const spokenText = hasVariants
      ? `${intro}Per ${spoken}, nel database ho ${preferredName}. Ti propongo ${preferredGrams} grammi. Confermi o scegli una delle varianti a schermo?`
      : `${intro}Per ${spoken}, nel database ho ${preferredName}. Ti propongo ${preferredGrams} grammi. Va bene?`;
    return { spokenText, displayText: spokenText };
  }

  const spokenText = hasVariants
    ? `${intro}Per ${spoken}, ti propongo il tuo solito ${preferredName} ${gramsPhrase}. Confermi o scegli una delle varianti a schermo?`
    : `${intro}Per ${spoken}, ti propongo il tuo solito ${preferredName} ${gramsPhrase}. Confermi?`;

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
 * Quick replies strutturati: label a schermo + riferimento esatto al cibo.
 * Il click NON deve rifare fuzzy matching — usa foodDbKey/foodName.
 * @param {{ candidates: WizardCandidate[], proposedGrams: number, explicitGrams?: boolean }} current
 * @returns {Array<{ label: string, foodDbKey: string|null, foodName: string, grams: number, action?: string }>}
 */
export function buildWizardItemQuickReplies(current) {
  const candidates = Array.isArray(current?.candidates) ? current.candidates : [];
  const grams = Math.round(Number(current?.proposedGrams) || DEFAULT_GRAMS);
  const replies = candidates.slice(0, MAX_OPTIONS).map((c) => {
    const cleanName = sanitizeWizardFoodName(c.name) || c.name;
    const g = Math.round(Number(c.proposedGrams) || grams);
    return {
      label: c.isLastUsed ? `${cleanName} ${g}g (solito)` : `${cleanName} ${g}g`,
      foodDbKey: c.id != null ? String(c.id) : null,
      foodName: cleanName,
      grams: g,
    };
  });
  if (replies.length > 0) {
    replies.push({
      label: 'Altro / foto etichetta',
      foodDbKey: null,
      foodName: '',
      grams: null,
      action: 'photo',
    });
  }
  return replies.slice(0, 5);
}

/**
 * Normalizza una quick reply (stringa legacy o oggetto strutturato).
 * @param {string|object} entry
 * @returns {{ label: string, foodDbKey: string|null, foodName: string|null, grams: number|null, action: string|null }}
 */
export function normalizeWizardQuickReply(entry) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const label = String(entry.label || entry.text || entry.value || '').trim();
    const grams = Number(entry.grams);
    return {
      label,
      foodDbKey: entry.foodDbKey != null ? String(entry.foodDbKey) : (entry.id != null ? String(entry.id) : null),
      foodName: String(entry.foodName || entry.name || '').trim() || null,
      grams: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null,
      action: entry.action ? String(entry.action) : null,
    };
  }
  return {
    label: String(entry || '').trim(),
    foodDbKey: null,
    foodName: null,
    grams: null,
    action: null,
  };
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
  const cleaned = sanitizeFoodDisplayName(name, '');
  if (!cleaned) return '';

  return cleaned
    .replace(/\b\d+\s*porzion[ei]\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,;\-–—\s]+|[,;\-–—\s]+$/g, '')
    .trim();
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
 * Match candidato da testo libero (voce). Preferisce uguaglianza esatta sul nome,
 * mai usageCount sopra un match lessicale migliore.
 * @param {WizardCandidate[]} candidates
 * @param {string} userText
 * @returns {WizardCandidate|null}
 */
export function matchCandidateFromUserText(candidates, userText) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) return null;
  const raw = String(userText || '').trim();
  if (!raw) return null;

  // Conferma del proposto / primo
  if (/^(?:s[iì]|ok|okay|va bene|quello|il solito|solito|confermo)\b/i.test(raw)
    || /ultimo\s+usato|il\s+primo|quello\s+l[aà]/i.test(normalizeSearchText(raw))) {
    return list.find((c) => c.isLastUsed) || list[0];
  }

  // Estrai nome dal label bottone: "Noci 21g (solito)" → "noci"
  const cleaned = normalizeSearchText(
    cleanFoodPhrase(
      raw
        .replace(/\(\s*solito\s*\)/gi, ' ')
        .replace(/\d+\s*(?:g|gr|grammi)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    ),
  );
  if (!cleaned) return null;

  // 1) Uguaglianza esatta sul nome candidato
  for (let i = 0; i < list.length; i += 1) {
    const nameNorm = normalizeSearchText(sanitizeWizardFoodName(list[i].name) || list[i].name);
    if (nameNorm && nameNorm === cleaned) return list[i];
  }

  // 2) Il testo inizia con il nome completo del candidato (più lungo prima)
  const byLen = [...list].sort(
    (a, b) => normalizeSearchText(b.name).length - normalizeSearchText(a.name).length,
  );
  for (let i = 0; i < byLen.length; i += 1) {
    const nameNorm = normalizeSearchText(sanitizeWizardFoodName(byLen[i].name) || byLen[i].name);
    if (nameNorm && (cleaned === nameNorm || cleaned.startsWith(`${nameNorm} `))) {
      return byLen[i];
    }
  }

  // 3) Token overlap: preferisci nome PIÙ CORTO a parità (exact "noci" > "pane … noci")
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    const nameNorm = normalizeSearchText(sanitizeWizardFoodName(c.name) || c.name);
    if (!nameNorm) continue;
    const tokens = nameNorm.split(' ').filter((t) => t.length >= 3);
    const hitTokens = tokens.filter((t) => cleaned.includes(t) || t === cleaned).length;
    if (hitTokens <= 0 && !nameNorm.includes(cleaned) && !cleaned.includes(nameNorm.split(' ')[0])) {
      continue;
    }
    const exactToken = tokens.some((t) => t === cleaned) || nameNorm === cleaned;
    // Lessicale dominante: exact token + preferenza nomi corti. Usage solo spareggio minimo.
    const score = (exactToken ? 1000 : 0)
      + hitTokens * 10
      - nameNorm.length
      + (c.isLastUsed ? 0.5 : 0)
      + (Number(c.usageCount) || 0) * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Risolve un click strutturato sul bottone: NESSUNA ricerca fuzzy.
 * @param {object} state
 * @param {{ foodDbKey?: string|null, foodName?: string|null, grams?: number|null }} selection
 * @returns {{ ok: boolean, resolved?: WizardResolvedItem, reason?: string, requestPhoto?: boolean }}
 */
export function resolveWizardSelection(state, selection = {}) {
  const current = state?.current;
  if (!current) return { ok: false, reason: 'no_current' };

  if (selection?.action === 'photo') {
    return { ok: false, reason: 'request_photo', requestPhoto: true };
  }

  const candidates = Array.isArray(current.candidates) ? current.candidates : [];
  const key = selection?.foodDbKey != null ? String(selection.foodDbKey) : '';
  const byId = key ? candidates.find((c) => String(c.id) === key) : null;
  const nameSel = sanitizeWizardFoodName(selection?.foodName || '') || String(selection?.foodName || '').trim();
  const byName = !byId && nameSel
    ? candidates.find((c) => normalizeSearchText(sanitizeWizardFoodName(c.name) || c.name) === normalizeSearchText(nameSel))
    : null;
  const pick = byId || byName;

  if (!pick && !nameSel) {
    return { ok: false, reason: 'empty_selection' };
  }

  const foodName = sanitizeWizardFoodName(pick?.name || nameSel) || nameSel;
  const gramsFromSel = Number(selection?.grams);
  const grams = Number.isFinite(gramsFromSel) && gramsFromSel > 0
    ? Math.round(gramsFromSel)
    : Math.round(Number(current.proposedGrams) || pick?.proposedGrams || DEFAULT_GRAMS);

  return {
    ok: true,
    resolved: {
      foodName,
      grams,
      foodDbKey: pick?.id != null ? pick.id : (key || null),
      spokenName: current.spokenName,
      isEstimated: !(Number.isFinite(gramsFromSel) && gramsFromSel > 0) && !current.explicitGrams,
    },
  };
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
  const grams = gramsFromUser
    || (current.explicitGrams ? current.proposedGrams : null)
    || matched?.proposedGrams
    || current.proposedGrams
    || DEFAULT_GRAMS;
  const isEstimated = !gramsFromUser && !current.explicitGrams;

  // Nome libero se nessun match ma testo senza solo grammi
  if (!matched && candidates.length === 0) {
    const cleaned = cleanFoodPhrase(text.replace(/\d+\s*(?:g|gr|grammi)?/gi, ' '));
    if (cleaned.length >= 2) {
      return {
        ok: true,
        resolved: {
          foodName: cleaned,
          grams: Math.round(grams),
          spokenName: current.spokenName,
          isEstimated,
          foodDbKey: null,
        },
      };
    }
    return { ok: false, reason: 'unparsed' };
  }

  if (!matched && gramsFromUser && candidates.length >= 1) {
    // Solo grammi → conferma candidato proposto (ultimo usato / primo lessicale)
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
    const cleaned = cleanFoodPhrase(text.replace(/\d+\s*(?:g|gr|grammi)?/gi, ' '));
    if (cleaned.length >= 2) {
      return {
        ok: true,
        resolved: {
          foodName: cleaned,
          grams: Math.round(grams),
          spokenName: current.spokenName,
          isEstimated,
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
      grams: Math.round(grams),
      foodDbKey: matched.id,
      spokenName: current.spokenName,
      isEstimated,
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
    ...(opts.isolatedEdit ? { isolatedEdit: opts.isolatedEdit } : {}),
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
    ...(state.isolatedEdit ? { isolatedEdit: state.isolatedEdit } : {}),
  };

  if (next.pendingItems.length === 0) {
    next.current = null;
    next.phase = 'confirm';
    return next;
  }

  const head = next.pendingItems[0];
  const explicitGrams = Number.isFinite(Number(head.gramsHint)) && Number(head.gramsHint) > 0
    ? Math.round(Number(head.gramsHint))
    : null;
  let candidates = findWizardCandidates(
    ctx.personalDb || null,
    head.spokenName,
    ctx.userPortions || {},
    head.searchKeywords || null,
  );
  candidates = withExplicitGramsOnCandidates(candidates, explicitGrams);

  const proposedGrams = explicitGrams
    || candidates[0]?.proposedGrams
    || lookupHabitualGrams(head.spokenName, ctx.userPortions || {}, [])
    || DEFAULT_GRAMS;

  next.current = {
    spokenName: head.spokenName,
    candidates,
    proposedGrams: Math.round(proposedGrams),
    proposedCandidateId: candidates[0]?.id || null,
    explicitGrams: explicitGrams != null,
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
