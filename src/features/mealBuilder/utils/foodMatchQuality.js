/**
 * Qualità di corrispondenza nome↔query per wizard / ricerca alimenti.
 * Exact > prefix > contains > fuzzy. Frequenza/recenza solo spareggio a parità.
 */

import {
  italianSingularPluralForms,
  normalizeSearchText,
} from '../../../foodSearch.js';

/** @typedef {'exact'|'prefix'|'contains'|'fuzzy'} FoodMatchQuality */

export const FOOD_MATCH_QUALITY = Object.freeze({
  EXACT: 'exact',
  PREFIX: 'prefix',
  CONTAINS: 'contains',
  FUZZY: 'fuzzy',
});

export const FOOD_MATCH_QUALITY_RANK = Object.freeze({
  exact: 0,
  prefix: 1,
  contains: 2,
  fuzzy: 3,
});

/** Rapporto densità energetica oltre il quale chiedere conferma. */
export const ENERGY_DENSITY_CONFIRM_RATIO = 3;

/**
 * @param {unknown} raw
 * @returns {FoodMatchQuality}
 */
export function normalizeFoodMatchQuality(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'exact' || v === 'prefix' || v === 'contains' || v === 'fuzzy') return v;
  return FOOD_MATCH_QUALITY.FUZZY;
}

/**
 * Exact o prefix = match “forte” (auto-accept ammesso se non c’è close race).
 * @param {unknown} quality
 */
export function isStrongFoodMatchQuality(quality) {
  const q = normalizeFoodMatchQuality(quality);
  return q === FOOD_MATCH_QUALITY.EXACT || q === FOOD_MATCH_QUALITY.PREFIX;
}

/**
 * Token-equality tollerante a singolare/plurale IT/EN.
 * @param {string} a
 * @param {string} b
 */
export function tokensMatchNormalized(a, b) {
  const x = normalizeSearchText(a);
  const y = normalizeSearchText(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const forms = new Set(italianSingularPluralForms(y));
  if (forms.has(x)) return true;
  return italianSingularPluralForms(x).some((f) => f === y || forms.has(f));
}

/**
 * Classifica la qualità del match nome candidato vs query.
 * - exact: nome intero = query (norm + sing/plur)
 * - prefix: prima parola = query, o nome inizia con "query "
 * - contains: query come parola interna (es. ravioli … spinaci)
 * - fuzzy: altro
 *
 * @param {string} candidateName
 * @param {string} query
 * @returns {FoodMatchQuality}
 */
export function classifyFoodMatchQuality(candidateName, query) {
  const name = normalizeSearchText(candidateName);
  const q = normalizeSearchText(query);
  if (!name || !q) return FOOD_MATCH_QUALITY.FUZZY;

  const nameWords = name.split(/\s+/).filter(Boolean);
  const qWords = q.split(/\s+/).filter(Boolean);
  if (nameWords.length === 0 || qWords.length === 0) return FOOD_MATCH_QUALITY.FUZZY;

  if (name === q) return FOOD_MATCH_QUALITY.EXACT;
  if (qWords.length === 1 && nameWords.length === 1 && tokensMatchNormalized(nameWords[0], qWords[0])) {
    return FOOD_MATCH_QUALITY.EXACT;
  }
  // Nome monotoken che è forma sing/plur della query multi? already handled.
  const qForms = qWords.length === 1 ? italianSingularPluralForms(qWords[0]) : [];
  if (qForms.some((f) => f && name === f)) return FOOD_MATCH_QUALITY.EXACT;

  // Prefisso a confine di parola (mai "riso" → "risotto").
  if (name.startsWith(`${q} `)) return FOOD_MATCH_QUALITY.PREFIX;
  if (qWords.length === 1 && tokensMatchNormalized(nameWords[0], qWords[0])) {
    return FOOD_MATCH_QUALITY.PREFIX;
  }
  if (qForms.some((f) => f && name.startsWith(`${f} `))) return FOOD_MATCH_QUALITY.PREFIX;

  // Parola intera nel nome (non sottostringa tipo latte→caffellatte senza boundary).
  const hayTokens = nameWords;
  const queryTokensToFind = qWords.length === 1
    ? [qWords[0], ...qForms]
    : qWords;

  if (qWords.length === 1) {
    const hit = hayTokens.some((t) => queryTokensToFind.some((qt) => tokensMatchNormalized(t, qt)));
    if (hit) return FOOD_MATCH_QUALITY.CONTAINS;
    // Sottostringa non-token (caffellatte / risotto): fuzzy o contains debole
    if (qForms.some((f) => f && f.length >= 4 && name.includes(f)) || name.includes(q)) {
      return FOOD_MATCH_QUALITY.CONTAINS;
    }
    return FOOD_MATCH_QUALITY.FUZZY;
  }

  const allTokensPresent = qWords.every((qt) => (
    hayTokens.some((t) => tokensMatchNormalized(t, qt)) || name.includes(qt)
  ));
  if (allTokensPresent) return FOOD_MATCH_QUALITY.CONTAINS;
  return FOOD_MATCH_QUALITY.FUZZY;
}

/**
 * @param {FoodMatchQuality|string} quality
 * @returns {number}
 */
export function foodMatchQualityRank(quality) {
  const q = normalizeFoodMatchQuality(quality);
  return FOOD_MATCH_QUALITY_RANK[q] ?? FOOD_MATCH_QUALITY_RANK.fuzzy;
}

/**
 * Annota candidati con matchQuality dalla query.
 * @param {string} query
 * @param {object[]} candidates
 * @returns {object[]}
 */
export function annotateCandidatesMatchQuality(query, candidates = []) {
  return (Array.isArray(candidates) ? candidates : []).map((c) => {
    if (!c || typeof c !== 'object') return c;
    const name = String(c.name || c.desc || c.row?.desc || c.row?.name || '').trim();
    return { ...c, matchQuality: classifyFoodMatchQuality(name, query) };
  });
}

/**
 * True se L1 ha almeno un match exact/prefix.
 * @param {object[]} candidates
 */
export function levelHasStrongMatch(candidates = []) {
  return (Array.isArray(candidates) ? candidates : []).some((c) => (
    isStrongFoodMatchQuality(c?.matchQuality)
  ));
}

/**
 * Ordina: qualità match → confidenza → priorità sorgente (numero minore = meglio).
 * @param {object[]} list
 * @param {(c: object) => number} [sourcePriorityFn]
 */
export function sortCandidatesByMatchQuality(list = [], sourcePriorityFn = null) {
  const srcPri = typeof sourcePriorityFn === 'function'
    ? sourcePriorityFn
    : (c) => (c?.source === 'personal' ? 0 : c?.source === 'kentu' || c?.source === 'kentu_it' ? 1 : 2);

  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const qa = foodMatchQualityRank(a?.matchQuality);
    const qb = foodMatchQualityRank(b?.matchQuality);
    if (qa !== qb) return qa - qb;

    const scoreDiff = (Number(b?.confidenceScore) || 0) - (Number(a?.confidenceScore) || 0);
    if (Math.abs(scoreDiff) > 0.001) return scoreDiff;

    const usageDiff = (Number(b?.usageCount) || 0) - (Number(a?.usageCount) || 0);
    if (usageDiff !== 0) return usageDiff;

    const recencyDiff = (Number(b?.recencyScore) || Number(b?.lastUsedAt) || 0)
      - (Number(a?.recencyScore) || Number(a?.lastUsedAt) || 0);
    if (recencyDiff !== 0) return recencyDiff;

    return srcPri(a) - srcPri(b);
  });
}

/**
 * kcal/100g stimati dal row catalogo.
 * @param {object|null|undefined} row
 * @returns {number|null}
 */
export function estimateKcalPer100g(row) {
  if (!row || typeof row !== 'object') return null;
  const direct = Number(row.kcal ?? row.cal ?? row.energyKcal);
  if (Number.isFinite(direct) && direct > 0 && direct < 1200) return direct;
  const servingKcal = Number(row.servingMacros?.kcal);
  const servingG = Number(row.servingGrams || row.defaultUnitWeight);
  if (Number.isFinite(servingKcal) && servingKcal > 0 && Number.isFinite(servingG) && servingG > 0) {
    return (servingKcal / servingG) * 100;
  }
  return null;
}

/**
 * @param {object|null} chosen
 * @param {object|null} referenceStrong
 * @param {number} [ratio]
 */
export function hasImplausibleEnergyDensityGap(chosen, referenceStrong, ratio = ENERGY_DENSITY_CONFIRM_RATIO) {
  const a = estimateKcalPer100g(chosen?.row);
  const b = estimateKcalPer100g(referenceStrong?.row);
  if (a == null || b == null || a <= 0 || b <= 0) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return hi / lo > ratio;
}

/**
 * Decisione auto vs disambiguazione basata su qualità match.
 * @param {object[]} candidates — già annotati/ordinati
 * @param {{
 *   autoAcceptThreshold?: number,
 *   closeRaceMargin?: number,
 * }} [opts]
 */
export function decideFoodMatchResolution(candidates = [], opts = {}) {
  const autoThreshold = Number.isFinite(Number(opts.autoAcceptThreshold))
    ? Number(opts.autoAcceptThreshold)
    : 0.8;
  const closeRaceMargin = Number.isFinite(Number(opts.closeRaceMargin))
    ? Number(opts.closeRaceMargin)
    : 0.08;

  const list = Array.isArray(candidates) ? candidates.filter((c) => c?.row || c?.name) : [];
  const top = list[0] || null;
  const second = list[1] || null;

  if (!top) {
    return {
      needsDisambiguation: true,
      match: null,
      confidenceScore: 0,
      matchQuality: null,
      reason: 'no_candidates',
    };
  }

  const topQuality = normalizeFoodMatchQuality(top.matchQuality);
  const topScore = Number(top.confidenceScore) || 0;
  const secondScore = Number(second?.confidenceScore) || 0;
  const secondQuality = second ? normalizeFoodMatchQuality(second.matchQuality) : null;

  const strongRef = list.find((c) => isStrongFoodMatchQuality(c.matchQuality)) || null;
  const energyGap = Boolean(
    strongRef
    && strongRef !== top
    && hasImplausibleEnergyDensityGap(top, strongRef),
  );

  // Close race solo a parità di qualità match (frequenza/score non mischiano exact vs contains).
  const closeRace = Boolean(
    second
    && foodMatchQualityRank(topQuality) === foodMatchQualityRank(secondQuality)
    && topScore < 0.98
    && secondScore >= autoThreshold - 0.05
    && (topScore - secondScore) < closeRaceMargin,
  );

  const weakMatch = !isStrongFoodMatchQuality(topQuality);
  const belowThreshold = topScore < autoThreshold;
  const needsDisambiguation = weakMatch || belowThreshold || closeRace || energyGap;

  if (needsDisambiguation) {
    return {
      needsDisambiguation: true,
      match: null,
      confidenceScore: topScore,
      matchQuality: topQuality,
      reason: energyGap
        ? 'energy_density_gap'
        : (weakMatch ? 'weak_match_quality' : (closeRace ? 'close_race' : 'below_threshold')),
    };
  }

  return {
    needsDisambiguation: false,
    match: top,
    confidenceScore: topScore,
    matchQuality: topQuality,
    reason: 'auto_strong_match',
  };
}

/**
 * Varianti normalizzate della query per match exact (singolare/plurale).
 * @param {string} query
 * @returns {Set<string>}
 */
export function exactQueryNormForms(query) {
  const q = normalizeSearchText(query);
  const forms = new Set();
  if (!q) return forms;
  forms.add(q);
  italianSingularPluralForms(q).forEach((f) => {
    if (f) forms.add(normalizeSearchText(f));
  });
  return forms;
}

/**
 * @param {string} candidateName
 * @param {string} query
 */
export function isExactFoodNameMatch(candidateName, query) {
  return classifyFoodMatchQuality(candidateName, query) === FOOD_MATCH_QUALITY.EXACT;
}

/**
 * Nomi candidati da una riga catalogo (include italianName CREA grezzo).
 * @param {string} id
 * @param {object} food
 * @returns {string[]}
 */
export function catalogRowDisplayNames(id, food) {
  if (!food || typeof food !== 'object') return [];
  const descName = String(food.desc || '').trim();
  const altName = String(food.name || '').trim();
  const italianName = String(food.italianName || '').trim();
  const keyAsName = String(id || '').trim();
  const keyLooksLikeName = keyAsName.length >= 2
    && !/^\d+$/.test(keyAsName)
    && !/^food[_-]?\d+/i.test(keyAsName)
    && /[\p{L}]/u.test(keyAsName);
  return [
    italianName,
    descName,
    altName,
    keyLooksLikeName ? keyAsName.replace(/[_-]+/g, ' ') : '',
  ].filter(Boolean);
}

/**
 * Trova match exact in un catalogo già caricato.
 * Nessun cap di scan e nessun early-exit: un exact presente deve sempre emergere.
 *
 * @param {string} foodName
 * @param {Record<string, object>|null|undefined} foodDb
 * @param {{ limit?: number }} [opts]
 * @returns {Array<object>}
 */
export function findExactFoodMatchesInCatalog(foodName, foodDb, opts = {}) {
  const needleForms = exactQueryNormForms(foodName);
  if (needleForms.size === 0 || !foodDb || typeof foodDb !== 'object') return [];
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 20;
  const out = [];
  const seen = new Set();

  for (const [id, food] of Object.entries(foodDb)) {
    if (!food || typeof food !== 'object') continue;
    const nameCandidates = catalogRowDisplayNames(id, food);
    let matchedName = null;
    for (const candidate of nameCandidates) {
      const norm = normalizeSearchText(candidate);
      if (!norm) continue;
      if (needleForms.has(norm)) {
        matchedName = candidate;
        break;
      }
      const words = norm.split(/\s+/).filter(Boolean);
      if (words.length === 1 && needleForms.has(words[0])) {
        matchedName = candidate;
        break;
      }
    }
    if (!matchedName) continue;

    const displayName = String(food.italianName || food.desc || food.name || matchedName).trim();
    const fdcId = String(food.fdcId ?? food.id ?? food.foodDbKey ?? id ?? '').trim() || String(id);
    if (seen.has(fdcId)) continue;
    seen.add(fdcId);
    out.push({
      fdcId,
      name: displayName,
      confidence: 'high',
      reason: 'Match letterale esatto',
      matchKind: 'exact',
      matchQuality: FOOD_MATCH_QUALITY.EXACT,
      row: {
        ...food,
        id: food.id ?? id,
        fdcId,
        foodDbKey: food.foodDbKey ?? fdcId,
        desc: food.desc || displayName,
        name: food.name || displayName,
      },
    });
    if (out.length >= limit) break;
  }

  return out;
}

/**
 * Exact + prefix a catalogo intero (nessun HEAVY_DB_MAX_SCAN).
 * Copre "Spinaci, crudi" per query "spinaci".
 *
 * @param {string} foodName
 * @param {Record<string, object>|null|undefined} foodDb
 * @param {{ limit?: number }} [opts]
 * @returns {Array<object>}
 */
export function findStrongFoodMatchesInCatalog(foodName, foodDb, opts = {}) {
  const q = normalizeSearchText(foodName);
  if (!q || !foodDb || typeof foodDb !== 'object') return [];
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 24;
  const exact = findExactFoodMatchesInCatalog(foodName, foodDb, { limit });
  const seen = new Set(exact.map((h) => h.fdcId));
  const prefix = [];

  for (const [id, food] of Object.entries(foodDb)) {
    if (!food || typeof food !== 'object') continue;
    const nameCandidates = catalogRowDisplayNames(id, food);
    let bestName = null;
    let bestQuality = null;
    for (const candidate of nameCandidates) {
      const quality = classifyFoodMatchQuality(candidate, foodName);
      if (!isStrongFoodMatchQuality(quality)) continue;
      if (
        !bestQuality
        || foodMatchQualityRank(quality) < foodMatchQualityRank(bestQuality)
      ) {
        bestQuality = quality;
        bestName = candidate;
      }
    }
    if (!bestName || bestQuality === FOOD_MATCH_QUALITY.EXACT) continue;

    const displayName = String(food.italianName || food.desc || food.name || bestName).trim();
    const fdcId = String(food.fdcId ?? food.id ?? food.foodDbKey ?? id ?? '').trim() || String(id);
    if (seen.has(fdcId)) continue;
    seen.add(fdcId);
    prefix.push({
      fdcId,
      name: displayName,
      confidence: 'high',
      reason: 'Match prefisso forte',
      matchKind: 'starts_with',
      matchQuality: FOOD_MATCH_QUALITY.PREFIX,
      row: {
        ...food,
        id: food.id ?? id,
        fdcId,
        foodDbKey: food.foodDbKey ?? fdcId,
        desc: food.desc || displayName,
        name: food.name || displayName,
      },
    });
    if (exact.length + prefix.length >= limit) break;
  }

  return [...exact, ...prefix].slice(0, limit);
}
