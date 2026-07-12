import { addDays } from '../../../calendarDateUtils';
import { getLogFromStoricoTree } from '../../../coreEngine';
import { FOOD_CATEGORIES, inferFoodCategoryFromName } from '../../../foodUnits';

const KNOWN_FOOD_CATEGORIES = new Set(Object.values(FOOD_CATEGORIES));
const MIN_RELEVANCE_SCORE = 50;

const KEYWORD_PLURAL_NORMALIZATION = {
  paste: 'pasta',
  patate: 'patata',
  mele: 'mela',
  uova: 'uovo',
  pere: 'pera',
  arance: 'arancia',
};

const PASTA_SHAPE_PATTERN =
  /\b(spaghetti|penne|fusilli|rigatoni|tagliatelle|orecchiette|lasagne|gnocch|fettuccine|bucatini|farfalle|tortiglioni|maccheroni|mezze maniche|linguine|paccheri|casarecce|strozzapreti)\b/i;

const DISTANT_TERM_PATTERN =
  /\b(candit|dolc|cioccolat|biscott|snack|patat|verdur|insalat|frutta|carne|manzo|pollo|tacchin|pesce|tonno|salmone|formagg|latte|yogurt|olio|burro|riso|pane|pizza)\b/i;

function normalizeFoodKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFoodLogEntry(item) {
  if (!item || typeof item !== 'object') return false;
  const type = String(item?.type || '').toLowerCase();
  return type === 'food' || type === 'recipe' || type === 'meal';
}

function foodNameFromLogEntry(item) {
  return String(item?.desc || item?.name || item?.foodName || '').trim();
}

function isValidIsoDate(dateStr) {
  const raw = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = new Date(`${raw}T12:00:00`);
  return !Number.isNaN(parsed.getTime());
}

/**
 * Pulisce la keyword: rimuove caratteri speciali e normalizza plurali comuni.
 * @param {unknown} rawWord
 * @returns {string}
 */
export function cleanFoodKeyword(rawWord) {
  const first = String(rawWord || '').trim().split(/\s+/)[0] || '';
  let key = normalizeFoodKey(first.replace(/[^a-zA-Z0-9\s]/g, ''));
  if (!key) return '';

  if (KEYWORD_PLURAL_NORMALIZATION[key]) {
    return KEYWORD_PLURAL_NORMALIZATION[key];
  }

  if (key.endsWith('e') && key.length >= 4) {
    const singularA = `${key.slice(0, -1)}a`;
    if (singularA.length >= 3) {
      return singularA;
    }
  }

  return key;
}

/**
 * Parola chiave principale del nome alimento (prima parola, pulita).
 * @param {unknown} foodName
 * @returns {string}
 */
export function extractPrimaryFoodKeyword(foodName) {
  const name = String(foodName || '').trim();
  if (!name) return '';
  return cleanFoodKeyword(name.split(/\s+/)[0] || '');
}

function resolveFoodCategory(row, name) {
  const raw = row?.category != null ? String(row.category).trim().toLowerCase() : '';
  if (KNOWN_FOOD_CATEGORIES.has(raw)) return raw;
  return inferFoodCategoryFromName(name);
}

function isDistantFromReference(name, keyword, referenceCategory) {
  const normalizedName = normalizeFoodKey(name);
  const normalizedKeyword = cleanFoodKeyword(keyword);
  if (!normalizedName || !normalizedKeyword) return true;

  if (referenceCategory && referenceCategory !== FOOD_CATEGORIES.GENERIC) {
    if (DISTANT_TERM_PATTERN.test(normalizedName) && !normalizedName.startsWith(normalizedKeyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Punteggio di rilevanza strict category-aware.
 * @returns {{ score: number, match: boolean }}
 */
function scoreFoodVariationMatch(candidateName, keyword, referenceCategory, row = null) {
  const name = String(candidateName || '').trim();
  const normalizedKeyword = cleanFoodKeyword(keyword);
  const normalizedName = normalizeFoodKey(name);

  if (!name || !normalizedKeyword || !normalizedName) {
    return { score: 0, match: false };
  }

  if (isDistantFromReference(name, normalizedKeyword, referenceCategory)) {
    return { score: 0, match: false };
  }

  const candidateCategory = resolveFoodCategory(row, name);
  if (
    referenceCategory
    && referenceCategory !== FOOD_CATEGORIES.GENERIC
    && candidateCategory !== FOOD_CATEGORIES.GENERIC
    && candidateCategory !== referenceCategory
  ) {
    return { score: 0, match: false };
  }

  if (
    referenceCategory
    && referenceCategory !== FOOD_CATEGORIES.GENERIC
    && candidateCategory === FOOD_CATEGORIES.GENERIC
    && !normalizedName.startsWith(normalizedKeyword)
    && !PASTA_SHAPE_PATTERN.test(normalizedName)
  ) {
    return { score: 0, match: false };
  }

  let score = 0;

  if (normalizedName === normalizedKeyword) {
    score = 100;
  } else if (normalizedName.startsWith(normalizedKeyword)) {
    score = 100;
  } else {
    const firstWord = cleanFoodKeyword(name.split(/\s+/)[0] || '');
    if (firstWord === normalizedKeyword) {
      score = 90;
    } else {
      const prefixRe = new RegExp(`^${escapeRegex(normalizedKeyword)}\\b`);
      if (prefixRe.test(normalizedName)) {
        score = 95;
      } else if (normalizedKeyword === 'pasta' && PASTA_SHAPE_PATTERN.test(normalizedName)) {
        score = 85;
      } else if (normalizedName.includes(normalizedKeyword)) {
        score = 0;
      }
    }
  }

  const match = score >= MIN_RELEVANCE_SCORE;
  return { score, match };
}

/**
 * foodDatabase nello state può essere un oggetto (mappa) o, raramente, un array.
 * @param {unknown} foodDatabase
 * @returns {object[]}
 */
function getFoodDatabaseRows(foodDatabase) {
  if (!foodDatabase) return [];
  if (Array.isArray(foodDatabase)) {
    return foodDatabase.filter((row) => row && typeof row === 'object');
  }
  if (typeof foodDatabase === 'object') {
    try {
      return Object.values(foodDatabase).filter((row) => row && typeof row === 'object');
    } catch {
      return [];
    }
  }
  return [];
}

function tryAddCandidate(candidates, seen, name, keyword, referenceCategory, context = {}) {
  const label = String(name || '').trim();
  if (!label) return;

  const { score, match } = scoreFoodVariationMatch(
    label,
    keyword,
    referenceCategory,
    context?.row || null,
  );

  console.log(
    `Filtraggio varianti per keyword: [${keyword}] | Esaminando: [${label}] | Risultato: [${match}]`,
  );

  if (!match) return;

  const key = normalizeFoodKey(label);
  if (!key || seen.has(key)) return;
  seen.add(key);

  candidates.push({
    name: label,
    score,
    lastUsed: Number(context?.lastUsed) || 0,
    order: Number(context?.order) || 0,
  });
}

function collectFromLogArray(log, candidates, seen, keyword, referenceCategory, orderRef) {
  const entries = Array.isArray(log) ? log : [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const item = entries[i];
    if (!isFoodLogEntry(item)) continue;
    const name = foodNameFromLogEntry(item);
    orderRef.value += 1;
    tryAddCandidate(candidates, seen, name, keyword, referenceCategory, {
      row: item,
      order: orderRef.value,
      lastUsed: Number(item?.timestamp ?? item?.lastUsedAt ?? item?.lastUsed) || 0,
    });
  }
}

function finalizeCandidates(candidates, limit) {
  return candidates
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.lastUsed !== a.lastUsed) return b.lastUsed - a.lastUsed;
      return a.order - b.order;
    })
    .slice(0, limit)
    .map((entry) => entry.name);
}

/**
 * Varianti recenti dello stesso tipo di alimento (strict category-aware).
 * In caso di errore restituisce [] senza propagare eccezioni.
 * @param {object|null|undefined} currentState
 * @param {string} currentFoodName
 * @param {{ limit?: number }} [options]
 * @returns {string[]}
 */
export function extractRecentVariationsForFood(currentState, currentFoodName, options = {}) {
  try {
    const state = currentState && typeof currentState === 'object' ? currentState : {};
    const keyword = extractPrimaryFoodKeyword(currentFoodName);
    if (!keyword) return [];

    const referenceCategory = resolveFoodCategory(null, currentFoodName);
    const limit = Math.max(1, Math.min(10, Number(options?.limit) || 5));
    const seen = new Set();
    const candidates = [];
    const orderRef = { value: 0 };

    collectFromLogArray(state?.activeLog || [], candidates, seen, keyword, referenceCategory, orderRef);

    const fullHistory = state?.fullHistory;
    const anchor = String(state?.activeDate || '').trim();
    if (fullHistory && typeof fullHistory === 'object' && isValidIsoDate(anchor)) {
      for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
        let dStr = '';
        try {
          dStr = addDays(anchor, -dayOffset);
        } catch {
          break;
        }
        if (!isValidIsoDate(dStr)) continue;

        let log = [];
        try {
          log = getLogFromStoricoTree(fullHistory, dStr) || [];
        } catch {
          log = [];
        }
        collectFromLogArray(log, candidates, seen, keyword, referenceCategory, orderRef);
      }
    }

    const dbSorted = getFoodDatabaseRows(state?.foodDatabase)
      .map((row) => ({
        row,
        name: String(row?.desc || row?.name || row?.foodName || '').trim(),
        lastUsed: Number(row?.lastUsedAt ?? row?.lastUsed ?? row?.timestamp) || 0,
      }))
      .filter((entry) => entry.name && entry.lastUsed > 0)
      .sort((a, b) => b.lastUsed - a.lastUsed);

    dbSorted.forEach((entry) => {
      orderRef.value += 1;
      tryAddCandidate(candidates, seen, entry.name, keyword, referenceCategory, {
        row: entry.row,
        lastUsed: entry.lastUsed,
        order: orderRef.value,
      });
    });

    return finalizeCandidates(candidates, limit);
  } catch (err) {
    console.error('Errore estrazione varianti alimento:', err);
    return [];
  }
}

/**
 * Arricchisce ogni item della bozza con varianti storiche contestuali (solo UI).
 * @param {object|null|undefined} mealDraft
 * @param {object|null|undefined} currentState
 * @param {{ limit?: number }} [options]
 * @returns {object|null|undefined}
 */
export function enrichMealDraftWithHistoricalVariations(mealDraft, currentState, options = {}) {
  try {
    if (!mealDraft || typeof mealDraft !== 'object') return mealDraft;

    const payload = mealDraft?.payload;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) return mealDraft;

    const state = currentState && typeof currentState === 'object' ? currentState : {};
    const enrichedItems = items.map((item) => {
      const foodName = String(item?.foodName || item?.name || '').trim();
      const historicalVariations = extractRecentVariationsForFood(state, foodName, options);
      return {
        ...item,
        historicalVariations,
      };
    });

    return {
      ...mealDraft,
      payload: {
        ...payload,
        items: enrichedItems,
      },
    };
  } catch (err) {
    console.error('Errore arricchimento varianti bozza:', err);
    return mealDraft;
  }
}

/**
 * Opzioni select per un item: valore corrente + varianti (senza duplicati).
 */
export function buildFoodNameSelectOptions(currentName, recentFoods = []) {
  const current = String(currentName || '').trim();
  const options = [];
  const seen = new Set();

  if (current) {
    options.push(current);
    seen.add(normalizeFoodKey(current));
  }

  (Array.isArray(recentFoods) ? recentFoods : []).forEach((name) => {
    const label = String(name || '').trim();
    if (!label) return;
    const key = normalizeFoodKey(label);
    if (seen.has(key)) return;
    seen.add(key);
    options.push(label);
  });

  return options;
}
