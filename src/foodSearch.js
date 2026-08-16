/**
 * Normalizza testo ricerca: trim, lower-case, senza accenti/punteggiatura.
 * Es. " Anguria " / "ANGURIA" → "anguria".
 */
export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RECENT_FOODS_STORAGE_KEY = 'recent_foods';
const RECENT_FOOD_HIGH_WINDOW_MS = 24 * 60 * 60 * 1000;
const SEARCH_SYNONYMS = {
  arrosto: ['cotto'],
  pollo: ['chicken'],
  pomodoro: ['pomodori', 'pomodorini'],
  pomodori: ['pomodoro', 'pomodorini'],
  uovo: ['uova'],
  uova: ['uovo'],
  // Fallback lessicale IT (l'LLM può espandere ulteriormente via searchKeywords).
  cocomero: ['anguria'],
  anguria: ['cocomero'],
  arachidi: ['noccioline'],
  noccioline: ['arachidi'],
  brioche: ['cornetto'],
  cornetto: ['brioche'],
};

/** Punteggi ranking lessicale (0–100). Lo storico NON entra in questi valori. */
const SCORE_EXACT_OR_PREFIX = 100;
/** Nome inizia con la query intera ma non è uguale (es. «noci» → «noci tostate»). */
const SCORE_PREFIX = 99;
/** Query = una parola intera dentro un nome multi-parola (es. «noci» in «pane … noci»). */
const SCORE_TOKEN_EXACT = 80;
const SCORE_WORD_BOUNDARY = 75;
const SCORE_SUBSTRING = 50;
const SCORE_FUZZY_DIST_1 = 70;
const SCORE_FUZZY_DIST_2 = 65;
const MIN_MATCH_SCORE = SCORE_SUBSTRING;
const DEFAULT_SEARCH_LIMIT = 30;
const HISTORY_SCORE_WEIGHT = 0.08;
/** Peso usageCount solo come tie-breaker (mai sopra il lexical). */
const USAGE_COUNT_SCORE_WEIGHT = 0.35;

export const MATCH_TIER_RANK = Object.freeze({
  exact: 100,
  prefix: 90,
  token_exact: 80,
  word_boundary: 70,
  substring: 50,
  fuzzy: 30,
  none: 0,
});

/**
 * Conta usi da usageCount esplicito o somma usageStats (morning…night).
 * @param {object | null | undefined} food
 * @returns {number}
 */
export function getFoodUsageCount(food) {
  if (!food || typeof food !== 'object') return 0;
  const explicit = Number(food.usageCount ?? food.count);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const stats = food.usageStats;
  if (stats && typeof stats === 'object') {
    const sum = ['morning', 'afternoon', 'evening', 'night']
      .reduce((acc, key) => acc + (Math.max(0, Number(stats[key]) || 0)), 0);
    if (sum > 0) return sum;
  }
  return 0;
}

/**
 * Distanza di Levenshtein (edit distance).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  // Early exit se differenza lunghezza già > max utile (2).
  if (Math.abs(s.length - t.length) > 2) return Math.abs(s.length - t.length);

  const prev = new Array(t.length + 1);
  const curr = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;

  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = curr[j];
  }
  return prev[t.length];
}

/**
 * Max distanza fuzzy: più tollerante su parole lunghe (errori STT).
 * @param {string} query
 * @returns {number}
 */
export function maxFuzzyDistanceForQuery(query) {
  const len = String(query || '').length;
  if (len <= 0) return 0;
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

/**
 * Normalizza confondimenti tipici STT italiano (v↔b, …) per il confronto.
 * @param {string} value
 * @returns {string}
 */
export function foldItalianSttConfusables(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ph/g, 'f')
    .replace(/v/g, 'b')
    .replace(/w/g, 'b')
    .replace(/y/g, 'i')
    .replace(/k/g, 'c')
    .replace(/j/g, 'g');
}

/**
 * Miglior distanza fuzzy tra query e nome (intero, parole, o dopo fold STT).
 * @returns {{ distance: number, score: number } | null}
 */
export function bestFuzzyMatch(normalizedQuery, normalizedName, itemWords = []) {
  const q = String(normalizedQuery || '');
  const name = String(normalizedName || '');
  if (!q || !name) return null;

  const maxDist = maxFuzzyDistanceForQuery(q);
  let best = levenshteinDistance(q, name);

  // Fold STT: «vauletto» vs «bauletto» → distanza 0 dopo fold.
  const qFold = foldItalianSttConfusables(q);
  const nameFold = foldItalianSttConfusables(name);
  if (qFold && nameFold) {
    best = Math.min(best, levenshteinDistance(qFold, nameFold));
  }

  // Match multi-parola allineato: ogni token query fuzzy-matcha un token nome.
  const qWords = q.split(' ').filter(Boolean);
  const nWords = itemWords.length ? itemWords : name.split(' ').filter(Boolean);

  // Confronto query intera vs singola parola SOLO se la query è monotoken
  // (es. «vauletto» → parola in «pane bauletto»). Evita falsi positivi tipo
  // «pane bauleto» vs parola «integrale» (Levenshtein basso per coincidenza).
  if (qWords.length === 1) {
    for (let i = 0; i < itemWords.length; i += 1) {
      const w = itemWords[i];
      if (!w) continue;
      if (Math.abs(w.length - q.length) > maxDist + 1) continue;
      best = Math.min(best, levenshteinDistance(q, w));
      const wFold = foldItalianSttConfusables(w);
      if (qFold && wFold) {
        best = Math.min(best, levenshteinDistance(qFold, wFold));
      }
    }
  }

  if (qWords.length > 1 && nWords.length > 0) {
    let tokenDistSum = 0;
    let tokensOk = true;
    const used = new Set();
    for (let qi = 0; qi < qWords.length; qi += 1) {
      const qw = qWords[qi];
      const qwMax = maxFuzzyDistanceForQuery(qw);
      let localBest = Infinity;
      let localIdx = -1;
      for (let ni = 0; ni < nWords.length; ni += 1) {
        if (used.has(ni)) continue;
        const nw = nWords[ni];
        if (Math.abs(nw.length - qw.length) > qwMax + 1) continue;
        let d = levenshteinDistance(qw, nw);
        d = Math.min(
          d,
          levenshteinDistance(foldItalianSttConfusables(qw), foldItalianSttConfusables(nw)),
        );
        if (d < localBest) {
          localBest = d;
          localIdx = ni;
        }
      }
      if (!(localBest <= qwMax)) {
        tokensOk = false;
        break;
      }
      if (localIdx >= 0) used.add(localIdx);
      tokenDistSum += localBest;
    }
    if (tokensOk) {
      best = Math.min(best, tokenDistSum);
    }
  }

  if (!Number.isFinite(best) || best < 0) return null;
  // Distanza 0 dopo fold STT = match utilizzabile (tier fuzzy alto).
  if (best === 0) {
    if (q === name) return null;
    return { distance: 1, score: SCORE_FUZZY_DIST_1 };
  }
  if (best > maxDist) return null;
  return {
    distance: best,
    score: best === 1 ? SCORE_FUZZY_DIST_1 : SCORE_FUZZY_DIST_2,
  };
}

function loadRecentFoodEntries() {
  if (typeof localStorage === 'undefined') return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_FOODS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;

        const name = String(entry.name || '').trim();
        const id = String(entry.id ?? name).trim();
        const lastUsed = Number(entry.lastUsedAt ?? entry.lastUsed ?? entry.timestamp);
        const count = Number(entry.usageCount ?? entry.count);

        if (!id || !name || !Number.isFinite(lastUsed)) return null;
        return {
          id,
          name,
          lastUsed,
          lastUsedAt: lastUsed,
          count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
          usageCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
        };
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function getRecencyScore(lastUsed, now) {
  const ageMs = now - Number(lastUsed);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
  if (ageMs <= RECENT_FOOD_HIGH_WINDOW_MS) return 1;
  if (ageMs <= 2 * RECENT_FOOD_HIGH_WINDOW_MS) return 0.8;
  if (ageMs <= 7 * RECENT_FOOD_HIGH_WINDOW_MS) return 0.6;
  return 0.3;
}

function getFrequencyScore(count, maxCount) {
  const normalizedCount = Math.max(1, Number(count) || 1);
  const normalizedMaxCount = Math.max(1, Number(maxCount) || 1);
  const rawScore = normalizedCount / normalizedMaxCount;
  return Math.max(0.2, Math.min(1, rawScore));
}

function buildRecentFoodScoreMap() {
  const now = Date.now();
  const recentEntries = loadRecentFoodEntries();
  const scores = new Map();
  const maxCount = recentEntries.reduce(
    (max, entry) => Math.max(max, Math.max(1, Number(entry?.count) || 1)),
    1,
  );

  for (let i = 0; i < recentEntries.length; i += 1) {
    const entry = recentEntries[i];
    const recencyScore = getRecencyScore(entry.lastUsed, now);
    const frequencyScore = getFrequencyScore(entry.count, maxCount);
    const scorePayload = { recencyScore, frequencyScore };

    const idKey = String(entry.id || '').trim();
    const nameKey = normalizeSearchText(entry.name);

    if (idKey) scores.set(idKey, scorePayload);
    if (nameKey) scores.set(nameKey, scorePayload);
  }

  return scores;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expandQueryWords(queryWord) {
  const base = String(queryWord || '');
  const out = new Set([base, ...(SEARCH_SYNONYMS[base] || [])]);
  // Stemming leggero IT: pomodori↔pomodoro, mele↔mela, ecc.
  for (const stem of italianSingularPluralForms(base)) {
    out.add(stem);
    for (const syn of SEARCH_SYNONYMS[stem] || []) out.add(syn);
  }
  return [...out].filter(Boolean);
}

/**
 * Varianti singolare/plurale italiane comuni per match alimenti.
 * @param {string} word
 * @returns {string[]}
 */
export function italianSingularPluralForms(word) {
  const w = String(word || '').trim().toLowerCase();
  if (w.length < 3) return w ? [w] : [];
  const forms = new Set([w]);
  if (w.endsWith('i') && w.length > 3) {
    forms.add(`${w.slice(0, -1)}o`); // pomodori → pomodoro
    forms.add(`${w.slice(0, -1)}e`); // pesci → pesce (approssimato)
  }
  if (w.endsWith('o') && w.length > 3) forms.add(`${w.slice(0, -1)}i`);
  if (w.endsWith('a') && w.length > 3) forms.add(`${w.slice(0, -1)}e`);
  if (w.endsWith('e') && w.length > 3) {
    forms.add(`${w.slice(0, -1)}a`);
    forms.add(`${w.slice(0, -1)}i`);
  }
  if (w.endsWith('chi')) forms.add(`${w.slice(0, -3)}co`);
  if (w.endsWith('co')) forms.add(`${w.slice(0, -2)}chi`);
  if (w.endsWith('ghi')) forms.add(`${w.slice(0, -3)}go`);
  if (w.endsWith('go')) forms.add(`${w.slice(0, -2)}ghi`);
  return [...forms];
}

function hasWordBoundaryMatch(normalizedText, queryWord) {
  if (!queryWord || !normalizedText) return false;
  const re = new RegExp(`\\b${escapeRegex(queryWord)}\\b`, 'i');
  return re.test(normalizedText);
}

/**
 * Score per una singola parola della query (testo già normalizzato lowercase).
 * Uguaglianza sull'INTERO nome = 100. Token interno (parziale) ≤ SCORE_TOKEN_EXACT.
 */
function scoreQueryToken(normalizedName, itemWords, queryWord) {
  const candidates = expandQueryWords(queryWord);
  let best = 0;

  for (let c = 0; c < candidates.length; c += 1) {
    const qw = candidates[c];
    if (!qw) continue;

    // Match esatto sull'intero nome alimento.
    if (normalizedName === qw) {
      best = Math.max(best, SCORE_EXACT_OR_PREFIX);
      continue;
    }

    // Prefisso sull'intero nome: sotto l'uguaglianza esatta.
    if (normalizedName.startsWith(qw) && normalizedName !== qw) {
      best = Math.max(best, SCORE_PREFIX);
      continue;
    }

    // Token esatto dentro un nome multi-parola — MAI al livello del match full-name.
    if (itemWords.some((word) => word === qw)) {
      best = Math.max(best, SCORE_TOKEN_EXACT);
      continue;
    }

    if (itemWords.some((word) => word.startsWith(qw) && word !== qw)) {
      best = Math.max(best, SCORE_WORD_BOUNDARY);
      continue;
    }

    if (hasWordBoundaryMatch(normalizedName, qw)) {
      best = Math.max(best, SCORE_WORD_BOUNDARY);
      continue;
    }

    if (normalizedName.includes(qw)) {
      best = Math.max(best, SCORE_SUBSTRING);
    }
  }

  return best;
}

function tierFromTokenScore(tokenScore, isFullNameExact) {
  if (isFullNameExact || tokenScore >= SCORE_EXACT_OR_PREFIX) return 'exact';
  if (tokenScore >= SCORE_PREFIX) return 'prefix';
  if (tokenScore >= SCORE_TOKEN_EXACT) return 'token_exact';
  if (tokenScore >= SCORE_WORD_BOUNDARY) return 'word_boundary';
  if (tokenScore >= SCORE_SUBSTRING) return 'substring';
  return 'none';
}

/**
 * @returns {{ strictScore: number, matchTier: string, allTokensMatch: boolean }}
 */
function calculateMatchScore(normalizedName, itemWords, queryWords) {
  if (queryWords.length === 0) {
    return { strictScore: 0, matchTier: 'none', allTokensMatch: false };
  }

  const fullQuery = queryWords.join(' ');

  // Uguaglianza esatta (case-insensitive) batte tutto: "noci" → "Noci" > "pane … noci".
  if (normalizedName === fullQuery) {
    return { strictScore: SCORE_EXACT_OR_PREFIX, matchTier: 'exact', allTokensMatch: true };
  }

  if (normalizedName.startsWith(fullQuery)) {
    return { strictScore: SCORE_PREFIX, matchTier: 'prefix', allTokensMatch: true };
  }

  if (hasWordBoundaryMatch(normalizedName, fullQuery) && fullQuery.includes(' ')) {
    return { strictScore: SCORE_WORD_BOUNDARY, matchTier: 'word_boundary', allTokensMatch: true };
  }

  if (normalizedName.includes(fullQuery) && fullQuery.length >= 3) {
    // Query multi-parola o frase contenuta: non è exact full-name.
    return { strictScore: SCORE_SUBSTRING, matchTier: 'substring', allTokensMatch: true };
  }

  if (queryWords.length === 1) {
    const tokenScore = scoreQueryToken(normalizedName, itemWords, queryWords[0]);
    if (tokenScore < MIN_MATCH_SCORE) {
      return { strictScore: 0, matchTier: 'none', allTokensMatch: false };
    }
    return {
      strictScore: tokenScore,
      matchTier: tierFromTokenScore(tokenScore, false),
      allTokensMatch: true,
    };
  }

  let minTokenScore = SCORE_EXACT_OR_PREFIX;
  let maxTokenScore = 0;
  let bestTier = 'none';

  for (let i = 0; i < queryWords.length; i += 1) {
    const tokenScore = scoreQueryToken(normalizedName, itemWords, queryWords[i]);
    if (tokenScore < MIN_MATCH_SCORE) {
      return { strictScore: 0, matchTier: 'none', allTokensMatch: false };
    }

    minTokenScore = Math.min(minTokenScore, tokenScore);
    maxTokenScore = Math.max(maxTokenScore, tokenScore);

    const tier = tierFromTokenScore(tokenScore, false);
    if ((MATCH_TIER_RANK[tier] || 0) > (MATCH_TIER_RANK[bestTier] || 0)) bestTier = tier;
  }

  const strictScore = Math.round(minTokenScore * 0.7 + maxTokenScore * 0.3);
  return { strictScore, matchTier: bestTier, allTokensMatch: true };
}

function isAutocompletePrefix(normalizedName, itemWords, normalizedQuery) {
  if (!normalizedQuery) return false;
  if (normalizedName.startsWith(normalizedQuery)) return true;
  return itemWords.some((word) => word.startsWith(normalizedQuery));
}

function usageBoostFromCount(usageCount, maxUsageInDb) {
  const count = Math.max(0, Number(usageCount) || 0);
  if (count <= 0) return 0;
  const maxU = Math.max(1, Number(maxUsageInDb) || 1);
  return (count / maxU) * 100 * USAGE_COUNT_SCORE_WEIGHT;
}

/**
 * Ricerca case-insensitive (trim + lower-case).
 * Two-tier: 1) similarità testuale (exact > prefix > token > fuzzy)
 * 2) a parità lessicale, usageCount / lastUsed come spareggio.
 */
export function searchFoodsDetailed(foodDb, query, options = {}) {
  if (!foodDb || typeof foodDb !== 'object') return [];

  const trimmedQuery = String(query ?? '').trim();
  const normalizedQuery = normalizeSearchText(trimmedQuery);
  if (!normalizedQuery) return [];

  const includeUserHistory = options.includeUserHistory !== false;
  const mode = options.mode || 'search';
  const enableFuzzy = options.enableFuzzy !== false && mode !== 'autocomplete';
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_SEARCH_LIMIT;

  const queryWords = normalizedQuery.split(' ').filter(Boolean);
  if (queryWords.length === 0) return [];

  const results = [];
  const entries = Object.entries(foodDb);
  const recentFoodScores = includeUserHistory ? buildRecentFoodScoreMap() : new Map();

  // Solo con storico utente serve il max usage; su OFF (~100k+) evita un pass O(n) inutile.
  let maxUsageInDb = 1;
  if (includeUserHistory) {
    for (let i = 0; i < entries.length; i += 1) {
      maxUsageInDb = Math.max(maxUsageInDb, getFoodUsageCount(entries[i][1]));
    }
  }

  for (let i = 0; i < entries.length; i += 1) {
    const [id, food] = entries[i];
    const descName = String(food?.desc || '').trim();
    const altName = String(food?.name || '').trim();
    // Fallback chiave DB: spesso il personale ha solo la key ("pomodoro") senza desc.
    const keyAsName = String(id || '').trim();
    const keyLooksLikeName = keyAsName.length >= 2
      && !/^\d+$/.test(keyAsName)
      && !/^food[_-]?\d+/i.test(keyAsName)
      && /[\p{L}]/u.test(keyAsName);
    const name = descName || altName || (keyLooksLikeName ? keyAsName.replace(/[_-]+/g, ' ') : '');
    if (!name) continue;

    const normalizedName = normalizeSearchText(name);
    const normalizedAlt = altName && altName !== name ? normalizeSearchText(altName) : '';
    const normalizedKey = keyLooksLikeName && keyAsName !== name
      ? normalizeSearchText(keyAsName.replace(/[_-]+/g, ' '))
      : '';
    if (!normalizedName && !normalizedAlt && !normalizedKey) continue;

    const primaryNorm = normalizedName || normalizedAlt || normalizedKey;
    const itemWords = primaryNorm.split(' ').filter(Boolean);
    if (itemWords.length === 0) continue;

    if (mode === 'autocomplete' && !isAutocompletePrefix(primaryNorm, itemWords, normalizedQuery)) {
      continue;
    }

    let { strictScore, matchTier, allTokensMatch } = calculateMatchScore(
      primaryNorm,
      itemWords,
      queryWords,
    );

    // Secondo passaggio su `name` / key se diversi da `desc`.
    const altCandidates = [
      normalizedAlt && normalizedAlt !== primaryNorm
        ? { norm: normalizedAlt, words: normalizedAlt.split(' ').filter(Boolean) }
        : null,
      normalizedKey && normalizedKey !== primaryNorm && normalizedKey !== normalizedAlt
        ? { norm: normalizedKey, words: normalizedKey.split(' ').filter(Boolean) }
        : null,
    ].filter(Boolean);

    for (let a = 0; a < altCandidates.length; a += 1) {
      const altMatch = calculateMatchScore(altCandidates[a].norm, altCandidates[a].words, queryWords);
      if (altMatch.strictScore > strictScore) {
        strictScore = altMatch.strictScore;
        matchTier = altMatch.matchTier;
        allTokensMatch = altMatch.allTokensMatch;
      }
    }

    // Boost esplicito uguaglianza esatta (case-insensitive) su desc, name o key.
    if (
      primaryNorm === normalizedQuery
      || normalizedAlt === normalizedQuery
      || normalizedKey === normalizedQuery
    ) {
      strictScore = SCORE_EXACT_OR_PREFIX;
      matchTier = 'exact';
      allTokensMatch = true;
    }

    // Stem IT: query "pomodoro" ↔ nome INTERO "pomodori" = exact.
    // Token stem dentro multi-parola = token_exact, mai exact full-name.
    if (matchTier !== 'exact' && queryWords.length === 1) {
      const qForms = new Set(italianSingularPluralForms(queryWords[0]));
      const nameForms = italianSingularPluralForms(primaryNorm);
      if (nameForms.some((f) => qForms.has(f))) {
        strictScore = SCORE_EXACT_OR_PREFIX;
        matchTier = 'exact';
        allTokensMatch = true;
      } else if (itemWords.some((w) => italianSingularPluralForms(w).some((f) => qForms.has(f)))) {
        strictScore = Math.max(strictScore, SCORE_TOKEN_EXACT);
        if ((MATCH_TIER_RANK[matchTier] || 0) < MATCH_TIER_RANK.token_exact) {
          matchTier = 'token_exact';
        }
        allTokensMatch = true;
      }
    }

    if (strictScore < MIN_MATCH_SCORE) continue;

    const usageCount = getFoodUsageCount(food);
    const historyScores = includeUserHistory
      ? recentFoodScores.get(String(id).trim()) || recentFoodScores.get(primaryNorm) || null
      : null;
    const recencyScore = historyScores?.recencyScore ?? 0;
    const frequencyScore = historyScores?.frequencyScore ?? 0;
    // Boost storico solo per tie-break / display — il sort usa strictScore prima.
    const historyBoost = includeUserHistory
      ? (recencyScore * 0.6 + frequencyScore * 0.4) * 100 * HISTORY_SCORE_WEIGHT
      : 0;
    const usageBoost = usageBoostFromCount(usageCount, maxUsageInDb);

    // score composito (legacy UI): lexical dominante, storia in frazione.
    const score = strictScore + (usageBoost + historyBoost) * 0.01;
    const matchScore = strictScore / 100;

    results.push({
      id,
      name,
      matchScore,
      recencyScore,
      frequencyScore,
      usageCount,
      score,
      strictScore,
      matchTier,
      allTokensMatch,
      lastUsedAt: Number(food?.lastUsedAt ?? food?.lastUsed ?? 0) || 0,
    });
  }

  // Fuzzy fallback: se non ci sono match forti (≥75), anche in presenza di substring deboli.
  const hasStrongMatch = results.some((r) => {
    const tier = String(r.matchTier || '');
    return tier === 'exact' || tier === 'prefix' || tier === 'token_exact' || tier === 'word_boundary'
      || Number(r.strictScore) >= 75;
  });
  if (!hasStrongMatch && enableFuzzy) {
    const existingIds = new Set(results.map((r) => String(r.id)));
    for (let i = 0; i < entries.length; i += 1) {
      const [id, food] = entries[i];
      if (existingIds.has(String(id))) continue;
      const descName = String(food?.desc || '').trim();
      const altName = String(food?.name || '').trim();
      const keyAsName = String(id || '').trim();
      const keyLooksLikeName = keyAsName.length >= 2
        && !/^\d+$/.test(keyAsName)
        && !/^food[_-]?\d+/i.test(keyAsName)
        && /[\p{L}]/u.test(keyAsName);
      const name = descName || altName || (keyLooksLikeName ? keyAsName.replace(/[_-]+/g, ' ') : '');
      if (!name) continue;

      const normalizedName = normalizeSearchText(name);
      const normalizedAlt = altName && altName !== name ? normalizeSearchText(altName) : '';
      const primaryNorm = normalizedName || normalizedAlt;
      if (!primaryNorm) continue;
      const itemWords = primaryNorm.split(' ').filter(Boolean);

      let fuzzy = bestFuzzyMatch(normalizedQuery, primaryNorm, itemWords);
      if (normalizedAlt && normalizedAlt !== primaryNorm) {
        const altFuzzy = bestFuzzyMatch(
          normalizedQuery,
          normalizedAlt,
          normalizedAlt.split(' ').filter(Boolean),
        );
        if (altFuzzy && (!fuzzy || altFuzzy.distance < fuzzy.distance)) {
          fuzzy = altFuzzy;
        }
      }
      // Stem IT full-name come fuzzy-0 → exact; token stem → token_exact.
      let fuzzyTier = 'fuzzy';
      let fuzzyStrict = fuzzy?.score ?? 0;
      if (!fuzzy && queryWords.length === 1) {
        const qForms = italianSingularPluralForms(normalizedQuery);
        if (qForms.includes(primaryNorm)) {
          fuzzy = { distance: 0, score: SCORE_EXACT_OR_PREFIX };
          fuzzyTier = 'exact';
          fuzzyStrict = SCORE_EXACT_OR_PREFIX;
        } else if (itemWords.some((w) => qForms.includes(w))) {
          fuzzy = { distance: 0, score: SCORE_TOKEN_EXACT };
          fuzzyTier = 'token_exact';
          fuzzyStrict = SCORE_TOKEN_EXACT;
        }
      } else if (fuzzy) {
        if (fuzzy.distance === 0 && primaryNorm === normalizedQuery) {
          fuzzyTier = 'exact';
          fuzzyStrict = SCORE_EXACT_OR_PREFIX;
        } else if (fuzzy.distance === 0) {
          fuzzyTier = 'token_exact';
          fuzzyStrict = SCORE_TOKEN_EXACT;
        } else {
          fuzzyStrict = fuzzy.score;
        }
      }
      if (!fuzzy) continue;

      const usageCount = getFoodUsageCount(food);
      const usageBoost = usageBoostFromCount(usageCount, maxUsageInDb);

      results.push({
        id,
        name,
        matchScore: fuzzyStrict / 100,
        recencyScore: 0,
        frequencyScore: 0,
        usageCount,
        score: fuzzyStrict + usageBoost * 0.01,
        strictScore: fuzzyStrict,
        matchTier: fuzzyTier,
        allTokensMatch: true,
        fuzzyDistance: fuzzy.distance,
        lastUsedAt: Number(food?.lastUsedAt ?? food?.lastUsed ?? 0) || 0,
      });
    }
  }

  results.sort(compareFoodSearchHits);

  return results.slice(0, limit).map(
    ({ id, name, matchScore, recencyScore, frequencyScore, usageCount, score, strictScore, matchTier }) => ({
      id,
      name,
      matchScore,
      recencyScore,
      frequencyScore,
      usageCount,
      textScore: score / 100,
      strictScore,
      matchTier,
    }),
  );
}

/**
 * Two-tier sort: 1) similarità testuale (strictScore / tier) 2) storico (usage / recency).
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
export function compareFoodSearchHits(a, b) {
  const aStrict = Number(a?.strictScore) || 0;
  const bStrict = Number(b?.strictScore) || 0;
  if (bStrict !== aStrict) return bStrict - aStrict;

  const aTier = MATCH_TIER_RANK[String(a?.matchTier || 'none')] || 0;
  const bTier = MATCH_TIER_RANK[String(b?.matchTier || 'none')] || 0;
  if (bTier !== aTier) return bTier - aTier;

  // Tie-breaker: frequenza e recency.
  const aUsage = Number(a?.usageCount) || 0;
  const bUsage = Number(b?.usageCount) || 0;
  if (bUsage !== aUsage) return bUsage - aUsage;

  const aRecency = Number(a?.recencyScore) || 0;
  const bRecency = Number(b?.recencyScore) || 0;
  if (bRecency !== aRecency) return bRecency - aRecency;

  const aLast = Number(a?.lastUsedAt) || 0;
  const bLast = Number(b?.lastUsedAt) || 0;
  if (bLast !== aLast) return bLast - aLast;

  return String(a?.name || '').localeCompare(String(b?.name || ''), 'it');
}

export function searchFoods(foodDb, query, options = {}) {
  return searchFoodsDetailed(foodDb, query, options).map(({ id, name }) => ({ id, name }));
}

/**
 * Normalizza searchKeywords LLM + foodName + flessioni IT locali.
 * @param {string} foodName
 * @param {string[]|null|undefined} searchKeywords
 * @returns {string[]}
 */
export function normalizeSearchKeywords(foodName, searchKeywords) {
  const out = [];
  const seen = new Set();
  const push = (value) => {
    const raw = String(value || '').trim();
    if (!raw || raw.length > 64) return;
    const key = normalizeSearchText(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  };

  push(foodName);
  (Array.isArray(searchKeywords) ? searchKeywords : []).forEach(push);

  const primaryNorm = normalizeSearchText(foodName);
  const firstToken = primaryNorm.split(' ').filter(Boolean)[0] || '';
  if (firstToken) {
    italianSingularPluralForms(firstToken).forEach(push);
    for (const syn of SEARCH_SYNONYMS[firstToken] || []) push(syn);
  }

  return out.slice(0, 12);
}

/**
 * Two-tier semantico: cicla searchKeywords; match esatto su QUALSIASI keyword = Livello 1.
 * Altrimenti vince lo score fuzzy/lessicale più alto tra le keyword.
 * @param {object} foodDb
 * @param {string|string[]} keywordsOrQuery
 * @param {object} [options]
 * @returns {Array<object>}
 */
export function searchFoodsWithKeywords(foodDb, keywordsOrQuery, options = {}) {
  const keywords = Array.isArray(keywordsOrQuery)
    ? keywordsOrQuery.map((k) => String(k || '').trim()).filter(Boolean)
    : normalizeSearchKeywords(keywordsOrQuery, options.searchKeywords);

  if (keywords.length === 0) return [];
  if (keywords.length === 1) {
    return searchFoodsDetailed(foodDb, keywords[0], options);
  }

  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : DEFAULT_SEARCH_LIMIT;
  const perQueryLimit = Math.max(limit, 12);
  const byId = new Map();

  for (let i = 0; i < keywords.length; i += 1) {
    const kw = keywords[i];
    const hits = searchFoodsDetailed(foodDb, kw, {
      ...options,
      limit: perQueryLimit,
    });
    for (let h = 0; h < hits.length; h += 1) {
      const hit = hits[h];
      const id = String(hit.id);
      const isExact = String(hit.matchTier || '') === 'exact'
        || Number(hit.strictScore) >= SCORE_EXACT_OR_PREFIX;
      const next = {
        ...hit,
        matchedKeyword: kw,
        keywordExact: isExact,
        // Exact su qualsiasi keyword → priorità assoluta Livello 1.
        strictScore: isExact ? SCORE_EXACT_OR_PREFIX : Number(hit.strictScore) || 0,
        matchTier: isExact ? 'exact' : hit.matchTier,
      };
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, next);
        continue;
      }
      if (next.keywordExact && !prev.keywordExact) {
        byId.set(id, next);
        continue;
      }
      if (!next.keywordExact && prev.keywordExact) continue;
      if ((Number(next.strictScore) || 0) > (Number(prev.strictScore) || 0)) {
        byId.set(id, {
          ...next,
          keywordExact: prev.keywordExact || next.keywordExact,
        });
      } else if (next.keywordExact) {
        byId.set(id, { ...prev, keywordExact: true, matchTier: 'exact', strictScore: SCORE_EXACT_OR_PREFIX });
      }
    }
  }

  return [...byId.values()]
    .sort(compareFoodSearchHits)
    .slice(0, limit);
}

/**
 * True se il nome DB non è una flessione/variante ovvia del termine parlato
 * (es. cocomero → Anguria) e va dichiarato a voce.
 * @param {string} spokenName
 * @param {string} dbName
 * @returns {boolean}
 */
export function shouldDiscloseSynonymMapping(spokenName, dbName) {
  const s = normalizeSearchText(spokenName);
  const d = normalizeSearchText(dbName);
  if (!s || !d) return false;
  if (s === d) return false;
  if (d.includes(s) || s.includes(d)) return false;

  const sTok = s.split(' ').filter(Boolean)[0] || '';
  const dTok = d.split(' ').filter(Boolean)[0] || '';
  const sForms = new Set(italianSingularPluralForms(sTok));
  const dForms = italianSingularPluralForms(dTok);
  if (dForms.some((f) => sForms.has(f))) return false;
  if ([...sForms].some((f) => d.includes(f))) return false;

  // Sinonimo statico noto: ancora disclosure (cocomero ≠ anguria).
  return true;
}

export default searchFoods;
