/**
 * Parsing puro di comandi tipo "ho mangiato X e Y": niente React, storage, API, Firebase.
 */

import { findBestFoodMatch, findRecentFoodHabit } from '@/features/salaComandi/utils/foodUtils';

const AMBIGUITY_SCORE_GAP = 100;
const READY_MIN_TOP_SCORE = 350;

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
 * @returns {{ explicitGrams: number | null, countHint: number | null, strippedName: string, rawRemainder: string }}
 */
function extractQuantity(segment) {
  const raw = normalizeFoodText(segment);
  let explicitGrams = null;
  let countHint = null;
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
    m = /^(\d+)\s*uov(?:a|o)?(?:\s|$)(.*)$/i.exec(rest);
    if (m) {
      const c = Number(m[1]);
      const tail = normalizeFoodText(String(m[2] ?? ''));
      if (Number.isFinite(c) && c > 0) countHint = Math.round(c);
      rest = tail.length > 0 ? tail : normalizeFoodText('uovo');
    }
  }

  if (explicitGrams == null && countHint == null && rest.length > 0) {
    if (IT_ARTICLE_ONE.test(rest)) {
      const tail = normalizeFoodText(rest.replace(IT_ARTICLE_ONE, ''));
      countHint = 1;
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
 * @param {string} query
 * @param {Record<string, object>} foodDb
 * @param {number} max
 */
function collectFoodCandidates(query, foodDb, max = 8) {
  if (!query || !foodDb || typeof foodDb !== 'object') return [];
  const q = query.toLowerCase().trim();
  if (!q) return [];

  /** @type {{ key: string, score: number, item: object }[]} */
  const list = [];
  for (const key in foodDb) {
    if (!Object.prototype.hasOwnProperty.call(foodDb, key)) continue;
    const item = foodDb[key];
    const dbName = String(item?.desc ?? item?.name ?? '')
      .toLowerCase()
      .trim();
    if (!dbName) continue;

    let score = -1;
    if (dbName === q) score = 10000;
    else if (dbName.startsWith(q)) score = 900 - Math.abs(dbName.length - q.length);
    else if (q.length >= 2 && (dbName.includes(q) || q.includes(dbName))) {
      score = 800 - Math.abs(dbName.length - q.length);
    }
    if (score < 0) continue;
    list.push({ key, score, item });
  }

  list.sort((a, b) => b.score - a.score);
  return list.slice(0, max);
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
 * @param {string} params.rawSegment
 * @param {Record<string, object>} params.foodDb
 * @param {unknown[]} params.flatLog
 * @param {object | null | undefined} params.mealContext
 */
function buildFoodCommandItem({ rawSegment, foodDb, flatLog, mealContext }) {
  void mealContext;

  const extracted = extractQuantity(rawSegment);
  const nameForMatch = normalizeFoodText(extracted.strippedName || extracted.rawRemainder);
  const displayRawName = nameForMatch || normalizeFoodText(rawSegment);

  const candidatesFull = collectFoodCandidates(nameForMatch, foodDb, 8);
  const candidates = candidatesFull.map((c) => ({
    key: c.key,
    desc: String(c.item?.desc ?? c.item?.name ?? c.key).trim(),
    score: c.score,
  }));

  const firstByScore = candidatesFull[0] ?? null;
  const secondByScore = candidatesFull[1] ?? null;

  /** @type {'ready' | 'needs_review' | 'ambiguous' | 'no_match'} */
  let itemStatus = 'no_match';
  let confidence = 0;
  let reason = '';

  if (candidates.length === 0) {
    itemStatus = 'no_match';
    reason = 'Nessuna voce nel database si avvicina al testo indicato.';
  } else if (
    candidates.length >= 2
    && firstByScore
    && secondByScore
    && firstByScore.score - secondByScore.score <= AMBIGUITY_SCORE_GAP
  ) {
    itemStatus = 'ambiguous';
    confidence = Math.min(0.92, Math.max(0.2, firstByScore.score / 10500));
    reason = 'Più voci hanno punteggio simile: serve una scelta.';
  } else if (firstByScore && firstByScore.score >= READY_MIN_TOP_SCORE) {
    itemStatus = 'ready';
    confidence = Math.min(1, firstByScore.score / 10000);
    reason = 'Match coerente con il database alimenti.';
  } else if (firstByScore) {
    itemStatus = 'needs_review';
    confidence = Math.min(0.88, Math.max(0.15, firstByScore.score / 1200));
    reason = 'Match debole: conviene verificare la voce corretta.';
  }

  const canonicalKey = findBestFoodMatch(nameForMatch, foodDb);
  const canonicalRow =
    canonicalKey && itemStatus !== 'ambiguous' && itemStatus !== 'no_match'
      ? candidatesFull.find((c) => c.key === canonicalKey)
      : null;
  const top = canonicalRow ?? firstByScore;

  const matched =
    top && itemStatus !== 'no_match' && itemStatus !== 'ambiguous'
      ? buildMatchedFoodSnapshot(top.key, top.item)
      : null;

  const habit = nameForMatch && foodDb && Object.keys(foodDb).length > 0
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
 * @param {string} [input.text]
 * @param {Record<string, object>} [input.foodDb]
 * @param {unknown[]} [input.flatLog]
 * @param {object} [input.mealContext]
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
