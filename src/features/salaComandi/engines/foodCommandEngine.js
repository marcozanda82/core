/**
 * Parsing puro di comandi tipo "ho mangiato X e Y": niente React, storage, API, Firebase.
 */

import { findRecentFoodHabit } from '@/features/salaComandi/utils/foodUtils';
import { toConceptTokenList } from '@/features/salaComandi/engines/foodCommandConcepts';

const ACCENT_REGEX = /[\u0300-\u036f]/g;

const READY_BIDIRECT_MIN = 0.92;
const READY_DESC_COVERAGE_MIN = 0.75;
const AMBIGUITY_BIDIRECT_GAP = 0.055;
/** Seconda opzione comunque ragionevole (evita ambiguity spuria su residue scarse) */
const AMBIGUITY_SECOND_MIN_SCORE = 0.72;
/**
 * Solo DEV: euristica sorgente chiave (parseFoodIntent riceve spesso un DB già unito senza metadata).
 * @param {string} key
 * @returns {'USER_LIKELY' | 'USDA' | 'GLOBAL_OR_UNKNOWN'}
 */
function devGuessFoodKeySource(key) {
  const k = String(key ?? '');
  if (/^USDA_/i.test(k)) return 'USDA';
  if (/^(food_|local_)/i.test(k)) return 'USER_LIKELY';
  return 'GLOBAL_OR_UNKNOWN';
}

const SKIP_TOKENS = [
  'alla',
  'allo',
  'al',
  'ai',
  'agli',
  'alle',
  'con',
  'di',
  'del',
  'della',
  'delle',
  'dei',
  'e',
  'ed',
  'oppure',
  'ecc',
];

/** @returns {boolean} true se lemma di token è un variant ortografico comune yogurt/yoghurt (non richiesto in spec ma stabile sul DB italiano). */
function alternateSpellingEquivalent(a, b) {
  if (a === b) return true;
  const yz = ['yogurt', 'yoghurt'];
  if (yz.includes(a) && yz.includes(b)) return true;
  return false;
}

/** Scala di normalizzazione: allinea il nuovo score (max teorico ~1.8) alle soglie storiche 0–1 */
const SCORE_FORMULA_SCALE = 1.8;

/**
 * @returns {{ score: number, queryCoverage: number, descCoverage: number, foodCoverage: number, matchedQueryTokens: number }}
 */
function scoreBidirectionalMatch(query, desc) {
  const qTokens = toConceptTokenList(query, SKIP_TOKENS);
  const dTokens = toConceptTokenList(desc, SKIP_TOKENS);

  const matchToken = (a, b) => {
    if (a === b) return true;
    if (alternateSpellingEquivalent(a, b)) return true;
    if (a.endsWith('a') && b === a.slice(0, -1) + 'e') return true;
    if (a.endsWith('e') && b === a.slice(0, -1) + 'a') return true;
    if (a.endsWith('o') && b === a.slice(0, -1) + 'i') return true;
    if (a.endsWith('i') && b === a.slice(0, -1) + 'o') return true;
    return false;
  };

  let queryMatches = 0;
  qTokens.forEach((q) => {
    if (dTokens.some((d) => matchToken(q, d))) {
      queryMatches += 1;
    }
  });

  let descMatches = 0;
  dTokens.forEach((d) => {
    if (qTokens.some((q) => matchToken(q, d))) {
      descMatches += 1;
    }
  });

  const totalQueryTokens = qTokens.length;
  const totalFoodTokens = dTokens.length;

  const queryCoverage = totalQueryTokens ? queryMatches / totalQueryTokens : 0;
  const foodCoverage = totalFoodTokens ? descMatches / totalFoodTokens : 0;

  const lengthPenalty =
    totalFoodTokens > totalQueryTokens ? (totalFoodTokens - totalQueryTokens) * 0.1 : 0;

  const baseScore = queryCoverage * 0.6 + foodCoverage * 0.4 - lengthPenalty;

  let combined = baseScore + queryCoverage * 0.5 + foodCoverage * 0.3;

  if (totalQueryTokens >= 2 && queryMatches < totalQueryTokens) {
    combined -= 0.3;
  }

  const score = Math.min(
    1,
    Math.max(0, combined / SCORE_FORMULA_SCALE),
  );

  return {
    score,
    queryCoverage,
    descCoverage: foodCoverage,
    foodCoverage,
    matchedQueryTokens: queryMatches,
  };
}

/**
 * Query lower + spazi singoli.
 * @param {string} q
 */
function compactLowerQuery(q) {
  return String(q || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Compare stringa comando con desc DB dopo strip accenti/apici coerenti con ranking.
 */
function normalizeComparableFoodString(s) {
  let t = String(s ?? '')
    .normalize('NFD')
    .replace(ACCENT_REGEX, '');
  t = t.replace(/[''`´]/g, '');
  return compactLowerQuery(t);
}

/** Testo desc normalizzato per prefix-match e pattern derivati (stessa base del matching). */
function normalizeFoodSearchText(s) {
  return normalizeComparableFoodString(s);
}

const DERIVED_RANK_PREFIXES = ['farina', 'crema', 'latte', 'biscotti', 'pomodori'];

/**
 * Bonus/penalità deterministiche solo per query a un concept-token (non altera bm).
 * @param {string} dbName
 * @param {string[]} qTok
 * @param {string[]} dTok
 */
function singleConceptRankingAdjustments(dbName, qTok, dTok) {
  if (qTok.length !== 1) {
    return {
      startsWithPrimaryConcept: false,
      simplicityBonus: 0,
      derivedPenalty: 0,
      total: 0,
    };
  }

  const normalizedDesc = normalizeFoodSearchText(dbName);
  const qt0 = qTok[0];
  const d0 = dTok.length ? dTok[0] : '';
  const startsWithPrimaryConcept =
    normalizedDesc.startsWith(qt0) || (dTok.length > 0 && d0 === qt0);

  let total = 0;
  if (startsWithPrimaryConcept) total += 0.18;

  const foodTokensLen = dTok.length;
  const simplicityBonus = Math.max(0, 0.12 - foodTokensLen * 0.015);
  total += simplicityBonus;

  const derivedPenalty = DERIVED_RANK_PREFIXES.some((p) => normalizedDesc.startsWith(p))
    ? 0.12
    : 0;
  total -= derivedPenalty;

  return {
    startsWithPrimaryConcept,
    simplicityBonus,
    derivedPenalty,
    total,
  };
}

/** True se comando e voce sono sostanzialmente la stessa etichetta. */
function practicallyEqualFoodLabel(query, desc) {
  const qa = normalizeComparableFoodString(query);
  const da = normalizeComparableFoodString(desc);
  if (!qa.length || !da.length) return false;
  if (qa === da) return true;
  const qTok = toConceptTokenList(query, SKIP_TOKENS);
  const dTok = toConceptTokenList(desc, SKIP_TOKENS);
  if (!qTok.length || !dTok.length) return false;
  const qs = [...qTok].slice().sort().join(' ');
  const ds = [...dTok].slice().sort().join(' ');
  return qs === ds;
}

/**
 * Ready secondo soglie bidirezionali o uguaglianza pratica.
 * @param {*} bm
 * @param {string} query
 * @param {string} descText
 */
function passesBidirectReadyGate(bm, query, descText) {
  if (practicallyEqualFoodLabel(query, descText)) return true;
  if (!bm || typeof bm !== 'object') return false;
  return bm.score >= READY_BIDIRECT_MIN && bm.descCoverage >= READY_DESC_COVERAGE_MIN;
}

const IT_ARTICLE_ONE = /^(?:un[ao']\s+|un\s+|una\s+|uno\s+)/i;

const NUM_WORD_MAP = Object.freeze({
  un: 1,
  una: 1,
  uno: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
});

/**
 * @param {unknown} text
 */
function splitFoodCommandText(text) {
  const s = typeof text === 'string' ? text.trim() : '';
  if (!s) return [];

  let chunks = s
    .replace(/\r\n/g, '\n')
    .split(/\n|,|;/)
    .map((x) => x.trim())
    .filter(Boolean);

  chunks = chunks.flatMap((c) =>
    c
      .split('+')
      .map((x) => x.trim())
      .filter(Boolean),
  );

  chunks = chunks.flatMap((c) =>
    c
      .split(/\s+e\s+/i)
      .map((x) => x.trim())
      .filter(Boolean),
  );

  return chunks;
}

/**
 * @param {string} fragment
 */
function normalizeFoodText(fragment) {
  return String(fragment || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * @param {string} segment
 * @returns {{
 *   explicitGrams: number | null,
 *   countHint: number | null,
 *   countHintFromArticle: boolean,
 *   strippedName: string,
 *   rawRemainder: string
 * }}
 */
function extractQuantity(segment) {
  const raw = normalizeFoodText(segment);
  let explicitGrams = null;
  let countHint = null;
  let countHintFromArticle = false;
  let rest = raw;

  let m = /^(\d+(?:[.,]\d+)?)\s*g(?:ramm[io])?\s+(.+)$/i.exec(rest);
  if (m && m[2]) {
    const g = Number(String(m[1]).replace(',', '.'));
    if (Number.isFinite(g) && g > 0) explicitGrams = Math.round(g);
    rest = normalizeFoodText(m[2]);
  } else {
    m = /^(\d+(?:[.,]\d+)?)\s*g(.*)$/i.exec(rest);
    if (m && m[2] != null) {
      const g = Number(String(m[1]).replace(',', '.'));
      const tail = String(m[2]).trim();
      if (Number.isFinite(g) && g > 0 && tail.length > 0) {
        explicitGrams = Math.round(g);
        rest = normalizeFoodText(tail);
      }
    }
  }

  if (explicitGrams == null) {
    m = /^(.+)\s+(\d+(?:[.,]\d+)?)\s*g(?:ramm[io])?\s*$/i.exec(rest);
    if (m && m[1] != null && m[2] != null) {
      const g = Number(String(m[2]).replace(',', '.'));
      const head = normalizeFoodText(String(m[1]));
      if (Number.isFinite(g) && g > 0 && head.length > 0) {
        explicitGrams = Math.round(g);
        rest = head;
      }
    }
  }

  if (explicitGrams == null) {
    m = /^(\d+(?:[.,]\d+)?)\s*tazzine?\b(.*)$/i.exec(rest);
    if (m && m[2] != null) {
      const c = Number(String(m[1]).replace(',', '.'));
      const tail = String(m[2]).trim();
      if (Number.isFinite(c) && c > 0 && tail.length > 0) {
        countHint = Math.round(c);
        rest = normalizeFoodText(tail);
      }
    }
  }

  if (explicitGrams == null && countHint == null) {
    m = /^(\d+)\s+(uova|uovi|uovo)\b(.*)$/i.exec(rest);
    if (m && m[2]) {
      const c = Number(m[1]);
      const eggWord = String(m[2]).trim();
      const tail = normalizeFoodText(String(m[3] ?? ''));
      if (Number.isFinite(c) && c > 0) {
        countHint = Math.round(c);
        rest = tail.length > 0 ? tail : normalizeFoodText(eggWord);
      }
    }
  }

  if (explicitGrams == null && countHint == null && rest.length > 0) {
    if (IT_ARTICLE_ONE.test(rest)) {
      const tail = normalizeFoodText(rest.replace(IT_ARTICLE_ONE, ''));
      countHint = 1;
      countHintFromArticle = true;
      if (tail) rest = tail;
    }
  }

  if (explicitGrams == null && countHint == null && rest.length > 0) {
    const wordLead = /^([a-zàèìòù']+)\s+(.+)$/i.exec(rest);
    if (wordLead) {
      const w = String(wordLead[1]).toLowerCase();
      const n = NUM_WORD_MAP[w];
      if (n != null) {
        countHint = n;
        rest = normalizeFoodText(wordLead[2]);
      }
    }
  }

  if (explicitGrams == null && countHint == null && rest.length > 0) {
    m = /^(\d+(?:[.,]\d+)?)\s+(.+)$/i.exec(rest);
    if (m && m[2]) {
      const c = Number(String(m[1]).replace(',', '.'));
      const tail = normalizeFoodText(m[2]);
      if (Number.isFinite(c) && c > 0 && tail.length > 0) {
        countHint = Math.round(c);
        rest = tail;
      }
    }
  }

  let strippedName = normalizeFoodText(rest);
  strippedName = strippedName.replace(/^(ho\s+mangiato\s+|ho\s+preso\s+)/i, '').trim();

  return {
    explicitGrams,
    countHint,
    countHintFromArticle,
    strippedName,
    rawRemainder: strippedName.length > 0 ? strippedName : raw,
  };
}

/**
 * @param {number | null | undefined} n
 */
function safeFiniteNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : null;
}

/**
 * Preferenza quando query e desc sono un solo token-concetto coincidente o meno (tie-break ordinamento).
 * @param {string} queryNormalized
 * @param {string} descText
 */
function singularQueryPluralDescBonus(queryNormalized, descText) {
  const qTok = toConceptTokenList(queryNormalized, SKIP_TOKENS);
  const dTok = toConceptTokenList(descText, SKIP_TOKENS);
  if (qTok.length !== 1 || dTok.length !== 1) return 0;
  return qTok[0] === dTok[0] ? 0.08 : 0;
}

/**
 * @param {string} query
 * @param {Record<string, object>} foodDb
 * @param {number} max
 */
function collectFoodCandidates(query, foodDb, max = 8) {
  if (!query || !foodDb || typeof foodDb !== 'object') return [];
  const q = normalizeFoodText(query);
  if (!q.trim()) return [];

  const qTok = toConceptTokenList(q, SKIP_TOKENS);
  const widen = Math.max(max, Math.min(24, 8 + Math.max(qTok.length - 1, 0) * 4));

  /** @type {{ key: string, score: number, item: object, bm: ReturnType<typeof scoreBidirectionalMatch> }[]} */
  const list = [];

  for (const key in foodDb) {
    if (!Object.prototype.hasOwnProperty.call(foodDb, key)) continue;
    const item = foodDb[key];
    const dbName = String(item?.desc ?? item?.name ?? '')
      .trim();
    if (!dbName) continue;

    const bm = scoreBidirectionalMatch(q, dbName);

    const qCov = bm.queryCoverage;
    if (qCov <= 0 && !practicallyEqualFoodLabel(q, dbName)) {
      continue;
    }

    const dTok = toConceptTokenList(dbName, SKIP_TOKENS);
    const singular = singularQueryPluralDescBonus(q, dbName);
    const rankAdj = singleConceptRankingAdjustments(dbName, qTok, dTok);
    const compositeRankScore = bm.score + singular + rankAdj.total;

    /** sortKey alto = migliore; tiebreak: desc più corta poi desc lessicografica */
    const dLen = dTok.length;
    const secondary = -dLen * 0.001;
    list.push({
      key,
      sortKey: compositeRankScore + secondary,
      rankAdj: import.meta.env?.DEV ? rankAdj : undefined,
      item,
      bm,
      compositeRankScore,
    });
  }

  list.sort((a, b) => {
    if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
    const da = String(a.item?.desc ?? a.item?.name ?? '');
    const dbb = String(b.item?.desc ?? b.item?.name ?? '');
    return da.localeCompare(dbb, 'it');
  });

  /** score esposto = ranking composito (bm + tie-break singolo + bonus query semplice); bm resta per soglie ready/ambiguous */
  return list.slice(0, widen).map((row) => ({
    ...row,
    score: row.compositeRankScore,
  }));
}

/**
 * @param {string} key
 * @param {object} item
 */
function buildMatchedFoodSnapshot(key, item) {
  if (!item || typeof item !== 'object') return null;
  const desc = String(item.desc ?? item.name ?? '').trim();
  return {
    key,
    desc: desc || key,
    defaultQty: safeFiniteNumber(item.defaultQty),
    kcal: item.kcal,
    prot: item.prot,
    carb: item.carb,
    fat: item.fat,
    fatTotal: item.fatTotal,
    fibre: item.fibre,
  };
}

/**
 * @param {object} params
 */
function buildFoodCommandItem({ rawSegment, foodDb, flatLog, mealContext }) {
  void mealContext;

  const extracted = extractQuantity(rawSegment);
  const nameForMatch = normalizeFoodText(extracted.strippedName || extracted.rawRemainder);
  const displayRawName = nameForMatch || normalizeFoodText(rawSegment);

  const candidatesFull = collectFoodCandidates(nameForMatch, foodDb, 8);

  /** score esposto: scala 0–10000 per lettura nell’UI / debug senza rotture */
  const candidates = candidatesFull.map((c) => ({
    key: c.key,
    desc: String(c.item?.desc ?? c.item?.name ?? c.key).trim(),
    score: Math.max(0, Math.round(Math.min(1.5, Math.max(-0.5, c.score)) * 10000)),
  }));

  const firstByScore = candidatesFull[0] ?? null;
  const secondByScore = candidatesFull[1] ?? null;

  /** @type {'ready' | 'needs_review' | 'ambiguous' | 'no_match'} */
  let itemStatus = 'no_match';
  let confidence = 0;
  let reason = '';

  if (!firstByScore) {
    itemStatus = 'no_match';
    reason = 'Nessuna voce nel database si avvicina al testo indicato.';
  } else {
    const bm1 = firstByScore.bm;
    const desc1 = String(firstByScore.item?.desc ?? firstByScore.item?.name ?? '').trim();
    const firstReadyGate = passesBidirectReadyGate(bm1, nameForMatch, desc1);

    const gap =
      secondByScore != null ? firstByScore.bm.score - secondByScore.bm.score : 1;

    const secondDesc = secondByScore
      ? String(secondByScore.item?.desc ?? secondByScore.item?.name ?? '')
      : '';
    const secondReadyGate = secondByScore
      ? passesBidirectReadyGate(secondByScore.bm, nameForMatch, secondDesc)
      : false;

    if (
      secondByScore
      && gap <= AMBIGUITY_BIDIRECT_GAP
      && secondByScore.bm.score >= AMBIGUITY_SECOND_MIN_SCORE
      && firstReadyGate
      && secondReadyGate
    ) {
      itemStatus = 'ambiguous';
      confidence = Math.min(0.9, Math.max(0.35, bm1.score + 0.05));
      reason = 'Più voci equivalgono al comando: scegli quella corretta.';
    } else if (
      secondByScore
      && gap <= AMBIGUITY_BIDIRECT_GAP
      && bm1.score >= 0.58
      && secondByScore.bm.score >= 0.58
    ) {
      itemStatus = 'ambiguous';
      confidence = Math.min(0.88, Math.max(0.3, (bm1.score + secondByScore.bm.score) / 2));
      reason = 'Punteggi molto vicini tra le prime voci: conferma quella giusta.';
    } else if (firstReadyGate) {
      const singleConceptQuery =
        toConceptTokenList(nameForMatch, SKIP_TOKENS).length === 1;
      if (singleConceptQuery && candidatesFull.length > 1) {
        itemStatus = 'ambiguous';
        confidence = Math.min(0.9, Math.max(0.35, bm1.score + 0.05));
        reason =
          'Più voci plausibili per un termine generico: scegli quella corretta.';
      } else {
        itemStatus = 'ready';
        confidence = Math.min(1, Math.max(0.72, bm1.score));
        reason = practicallyEqualFoodLabel(nameForMatch, desc1)
          ? 'Corrispondenza diretta con il database.'
          : 'Score di pertinenza alto e sufficiente coincidenza con la descrizione.';
      }
    } else if (bm1.score >= 0.28 || bm1.queryCoverage >= 0.5 || practicallyEqualFoodLabel(nameForMatch, desc1)) {
      itemStatus = 'needs_review';
      confidence = Math.min(0.85, Math.max(0.2, bm1.score + 0.12));
      reason = 'Match non sufficientemente univoco per procedere senza conferma.';
    } else {
      itemStatus = 'no_match';
      reason = 'Nessuna voce nel database si avvicina al testo indicato.';
    }
  }

  const top = firstByScore;

  const matched =
    top && itemStatus !== 'no_match' && itemStatus !== 'ambiguous'
      ? buildMatchedFoodSnapshot(top.key, top.item)
      : null;

  const habit =
    nameForMatch && foodDb && Object.keys(foodDb).length > 0
      ? findRecentFoodHabit(nameForMatch, foodDb, flatLog)
      : null;

  /** @type {number | null} */
  let quantity = null;
  /** @type {number | null} */
  let suggestedQuantity = null;
  /** @type {'explicit' | 'habit' | 'default_qty' | 'count_hint' | null} */
  let quantitySource = null;

  const topKey = top?.key ?? null;

  if (extracted.explicitGrams != null) {
    quantity = extracted.explicitGrams;
    suggestedQuantity = quantity;
    quantitySource = 'explicit';
  } else if (
    extracted.countHint != null
    && !extracted.countHintFromArticle
    && itemStatus !== 'ambiguous'
    && (itemStatus === 'ready' || itemStatus === 'needs_review')
  ) {
    suggestedQuantity = extracted.countHint;
    quantity = extracted.countHint;
    quantitySource = 'count_hint';
  } else if (
    itemStatus !== 'ambiguous'
    && topKey
    && habit
    && habit.dbKey === topKey
  ) {
    const hq = safeFiniteNumber(habit.qty);
    if (hq != null) {
      suggestedQuantity = hq;
      if (itemStatus === 'ready' || itemStatus === 'needs_review') {
        quantity = hq;
        quantitySource = 'habit';
      }
    }
  }

  const itemDefaultQty = matched ? safeFiniteNumber(foodDb[matched.key]?.defaultQty) : null;
  if (
    quantity == null
    && itemDefaultQty != null
    && matched
    && itemStatus !== 'ambiguous'
  ) {
    suggestedQuantity = suggestedQuantity ?? itemDefaultQty;
    if (itemStatus === 'ready' || itemStatus === 'needs_review') {
      quantity = itemDefaultQty;
      quantitySource = 'default_qty';
    }
  }

  if (
    quantity == null
    && extracted.countHint != null
    && extracted.countHintFromArticle
    && itemStatus !== 'ambiguous'
    && (itemStatus === 'ready' || itemStatus === 'needs_review')
  ) {
    suggestedQuantity = suggestedQuantity ?? extracted.countHint;
    quantity = extracted.countHint;
    quantitySource = 'count_hint';
  }

  if (itemStatus === 'ambiguous' && quantity == null && extracted.countHint != null) {
    suggestedQuantity = extracted.countHint;
  }

  if (habit?.qty != null && suggestedQuantity == null) {
    suggestedQuantity = safeFiniteNumber(habit.qty);
  }

  if (import.meta.env?.DEV) {
    const queryTokens = toConceptTokenList(nameForMatch, SKIP_TOKENS);
    const habitDbKey = habit?.dbKey ?? null;
    // eslint-disable-next-line no-console
    console.log('[foodSmart:DEV]', {
      input: displayRawName,
      queryTokens,
      foodDbKeyCount: Object.keys(foodDb || {}).length,
      habit: habitDbKey ? { dbKey: habitDbKey, qty: habit.qty } : null,
      candidates: candidatesFull.slice(0, 8).map((c, idx) => ({
        rank: idx + 1,
        key: c.key,
        name: String(c.item?.desc ?? c.item?.name ?? ''),
        candidateSource: devGuessFoodKeySource(c.key),
        userMatch: devGuessFoodKeySource(c.key) === 'USER_LIKELY',
        habitScore: habitDbKey && c.key === habitDbKey ? 1 : 0,
        sourceBoost: null,
        bmScore: c.bm?.score,
        compositeRank: c.score,
        sortKey: c.sortKey ?? c.score,
        queryCoverage: c.bm?.queryCoverage,
        foodCoverage: c.bm?.foodCoverage,
        rankAdj: c.rankAdj,
      })),
    });
  }

  return {
    rawName: displayRawName,
    matchedFood: matched,
    candidates,
    quantity,
    suggestedQuantity,
    quantitySource,
    confidence,
    status: itemStatus,
    reason,
  };
}

/**
 * @param {object} input
 */
export function parseFoodCommandIntent(input = {}) {
  const text = input.text != null ? String(input.text) : '';
  const foodDb =
    input.foodDb != null && typeof input.foodDb === 'object' && !Array.isArray(input.foodDb)
      ? input.foodDb
      : {};
  const flatLog = Array.isArray(input.flatLog) ? input.flatLog : [];
  const mealContext =
    input.mealContext != null && typeof input.mealContext === 'object' ? input.mealContext : null;

  /** @type {string[]} */
  const errors = [];
  const debug = {
    segments: /** @type {string[]} */ ([]),
    mealContextKeys: mealContext ? Object.keys(mealContext) : [],
  };

  if (!text.trim()) {
    return {
      intent: 'unknown',
      status: 'empty',
      items: [],
      requiresUserAction: false,
      errors,
      debug,
    };
  }

  const segments = splitFoodCommandText(text);
  debug.segments = segments.slice();

  if (segments.length === 0) {
    return {
      intent: 'unknown',
      status: 'empty',
      items: [],
      requiresUserAction: false,
      errors,
      debug,
    };
  }

  /** @type {ReturnType<typeof buildFoodCommandItem>[]} */
  const items = segments.map((seg) =>
    buildFoodCommandItem({
      rawSegment: seg,
      foodDb,
      flatLog,
      mealContext,
    }),
  );

  let overall = 'ready';
  if (items.some((it) => it.status === 'ambiguous')) overall = 'ambiguous';
  else if (items.some((it) => it.status === 'no_match')) overall = 'no_match';
  else if (items.some((it) => it.status === 'needs_review')) overall = 'needs_review';

  const requiresUserAction = items.some(
    (it) => it.status === 'ambiguous' || it.status === 'no_match' || it.status === 'needs_review',
  );

  return {
    intent: 'add_food',
    status: overall,
    items,
    requiresUserAction,
    errors,
    debug,
  };
}
