/**
 * Varianti morfologiche italiane leggere per matching alimenti (euristiche, senza dipendenze).
 */

/**
 * Indizi di prodotto lavorato/composto (penalità solo con query a singolo token + ingrediente in descrizione).
 */
export const PROCESSED_FOOD_HINT_RE =
  /\b(gelato|gelati|yoghurt|yogurt|marmellata|marmellate|confettura|confetture|crostata|crostate|torta|torte|biscotto|biscotti|merendina|merendine|barretta|barrette|crema\b|creme\b|dessert|succo|succi|bevanda|bevande|gusto|aroma)\b/i;

/**
 * Inizio desc = categoria lavorata (marmellata di…, gelato alla…) → penalità extra vs frutta fresca.
 */
export const PROCESSED_LEADING_RE =
  /^(gelato|gelati|yoghurt|yogurt|marmellata|marmellate|confettura|confetture|crostata|crostate|torta|torte|biscotto|biscotti|succo|bevanda|dessert)\b/i;

/** Connettivi tipici ricette marketing (incl. di / d' per «marmellata di fragole»). */
export const RECIPE_CONNECTOR_RE =
  /\b(alla|allo|agli|alle|al|ai|ad|con|di|d'|d')\b/i;

/** Segnali di prodotto fresco / minimamente lavorato in etichetta (bonus con query mono-ingrediente). */
export const FRESH_PRODUCE_LABEL_RE =
  /\b(crudo|cruda|crude|crudi|fresco|fresca|freschi|fresche)\b/i;

/** @deprecated usa PROCESSED_FOOD_HINT_RE */
export const COMPOUND_CARRIER_RE = PROCESSED_FOOD_HINT_RE;

function queryIngredientVariants(tok) {
  const variants = new Set(expandItalianFoodVariants(tok));
  variants.add(tok);
  return variants;
}

function labelContainsIngredientVariant(normD, variants) {
  for (const v of variants) {
    if (v.length >= 3 && normD.includes(v)) return true;
  }
  return false;
}

function labelWordCount(normD) {
  return normD
    .split(/[\s,;]+/)
    .map((s) =>
      s
        .replace(/^[^a-z0-9àèéìòù]+/gi, '')
        .replace(/[^a-z0-9àèéìòù]+$/gi, ''),
    )
    .filter((s) => s.length > 0).length;
}

function cleanWordTokens(normD) {
  return normD
    .split(/[\s,;]+/)
    .map((s) =>
      s
        .replace(/^[^a-z0-9àèéìòù]+/gi, '')
        .replace(/[^a-z0-9àèéìòù]+$/gi, ''),
    )
    .filter((s) => s.length > 0);
}

/**
 * Espande singolare/plurale comune (es. fragola↔fragole, pomodoro↔pomodori, uovo↔uova).
 * @param {string} term token in minuscolo (anche normalizzato senza accenti)
 * @returns {string[]}
 */
export function expandItalianFoodVariants(term) {
  const t = String(term || '')
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, '');
  if (t.length < 2) return [t];

  const out = new Set([t]);

  /** Coppie singolare/plurale esplicite (oltre alle euristiche -a/-e e -o/-i). */
  const explicitPairs = [
    ['fragola', 'fragole'],
    ['mela', 'mele'],
    ['pomodoro', 'pomodori'],
    ['uovo', 'uova'],
  ];
  for (let i = 0; i < explicitPairs.length; i += 1) {
    const [a, b] = explicitPairs[i];
    if (t === a) out.add(b);
    if (t === b) out.add(a);
  }
  if (t === 'uovo' || t === 'uova') {
    return [...out].filter((x) => x.length >= 2);
  }

  // Femminile -a → -e (fragola, mela, patata, carota)
  if (t.length >= 4 && t.endsWith('a') && !t.endsWith('ia')) {
    out.add(t.slice(0, -1) + 'e');
  }

  // Plurale -e → -a quando lo stelo in minuscolo finisce con consonante tipica dei plurali -ole/-ate/... (evita "caffe" → "caffa")
  if (t.length >= 4 && t.endsWith('e')) {
    if (/che$/i.test(t) || /ghe$/i.test(t)) {
      /* skip */
    } else {
      const stem = t.slice(0, -1);
      const last = stem[stem.length - 1];
      if ('rlmnt'.includes(last)) {
        out.add(stem + 'a');
      }
    }
  }

  // Maschile -o → -i (pomodoro, limone no — limone ends e)
  if (t.length >= 4 && t.endsWith('o') && !t.endsWith('io')) {
    out.add(t.slice(0, -1) + 'i');
  }
  if (t.length >= 4 && t.endsWith('i')) {
    const stem = t.slice(0, -1);
    if (stem.length >= 3 && !stem.endsWith('i')) {
      out.add(stem + 'o');
    }
  }

  return [...out].filter((x) => x.length >= 2);
}

/**
 * @param {string} normalizedQuery query già normalizzata (spazi singoli, lower)
 * @returns {string | null} unico token se la query è una sola parola
 */
export function singleTokenFromNormalizedQuery(normalizedQuery) {
  const t = String(normalizedQuery || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (t.length !== 1) return null;
  return t[0];
}

/**
 * true se la label è un alimento "base" compatibile con query a una sola parola (nessun composto lavorato).
 * @param {string} normD nome normalizzato (accenti strip, lower)
 * @param {Set<string> | string[]} variantSet token ingrediente ammessi (sing/plur + sinonimi lookup)
 */
export function isStrictBaseFoodLabelForVariants(normD, variantSet) {
  if (!normD || !variantSet) return false;
  const set = variantSet instanceof Set ? variantSet : new Set(variantSet);
  if (set.size === 0) return false;
  if (PROCESSED_FOOD_HINT_RE.test(normD)) return false;
  if (RECIPE_CONNECTOR_RE.test(normD)) return false;

  const words = cleanWordTokens(normD);
  if (words.length === 0 || words.length > 2) return false;

  const headOk = (w) => typeof w === 'string' && w.length >= 2 && set.has(w);
  if (words.length === 1) return headOk(words[0]);
  if (headOk(words[0]) && FRESH_PRODUCE_LABEL_RE.test(normD)) return true;
  if (words[0] === 'frutta' && headOk(words[1])) return true;
  return false;
}

/**
 * Confidence 0..1 per match strict base (query una parola, label già filtrata come base).
 * @param {string} normD
 * @param {string} normalizedQuery
 * @param {string[]} variantList
 */
export function strictSingleWordBaseMatchConfidence(normD, normalizedQuery, variantList) {
  const set = new Set(variantList);
  if (normD === normalizedQuery) return 1;
  for (let i = 0; i < variantList.length; i += 1) {
    const v = variantList[i];
    if (!v) continue;
    if (normD === v) return 0.99;
    if (normD.startsWith(`${v},`) || normD.startsWith(`${v} `)) return 0.97;
  }
  const words = cleanWordTokens(normD);
  if (words[0] && set.has(words[0])) return 0.95;
  return 0.93;
}

/**
 * Penalità 0..1 per prodotti composti/aromatizzati quando la query è un solo ingrediente (es. "fragola" vs "gelato alla fragola").
 * @param {string} normD label normalizzata
 * @param {string} normalizedQuery query normalizzata
 * @returns {number}
 */
export function compoundCarrierConfidencePenalty(normD, normalizedQuery) {
  const tok = singleTokenFromNormalizedQuery(normalizedQuery);
  if (!tok || !normD) return 0;
  const variants = queryIngredientVariants(tok);
  if (!labelContainsIngredientVariant(normD, variants)) return 0;

  let pen = 0;
  if (PROCESSED_FOOD_HINT_RE.test(normD)) pen += 0.2;
  if (PROCESSED_LEADING_RE.test(normD)) pen += 0.06;

  const wc = labelWordCount(normD);
  if (wc >= 3 && RECIPE_CONNECTOR_RE.test(normD)) pen += 0.11;
  else if (wc >= 2 && RECIPE_CONNECTOR_RE.test(normD) && PROCESSED_FOOD_HINT_RE.test(normD)) pen += 0.07;

  return Math.min(0.42, pen);
}

/**
 * Bonus per descrizioni “semplici” (frutta/ingrediente in evidenza) con query a un solo token.
 * @param {string} normD
 * @param {string} normalizedQuery
 * @returns {number}
 */
export function simpleIngredientConfidenceBoost(normD, normalizedQuery) {
  const tok = singleTokenFromNormalizedQuery(normalizedQuery);
  if (!tok || !normD) return 0;
  const variants = queryIngredientVariants(tok);
  const cleanTokens = cleanWordTokens(normD);

  let boost = 0;
  for (const v of variants) {
    if (!v || v.length < 3) continue;
    if (normD === v) boost = Math.max(boost, 0.095);
    else if (normD.startsWith(`${v},`) || normD.startsWith(`${v} `)) boost = Math.max(boost, 0.082);
  }

  if (cleanTokens.length === 1) {
    for (const v of variants) {
      if (v.length >= 3 && cleanTokens[0] === v) boost = Math.max(boost, 0.088);
    }
  }

  const w0 = cleanTokens[0] || '';
  for (const v of variants) {
    if (v.length >= 3 && w0 === v) boost = Math.max(boost, 0.078);
  }

  if (cleanTokens.length >= 2) {
    const w1 = cleanTokens[1];
    if (w0.includes('frutta') && variants.has(w1)) boost = Math.max(boost, 0.065);
    for (const v of variants) {
      if (v.length >= 3 && w1 === v) boost = Math.max(boost, 0.055);
    }
    if (FRESH_PRODUCE_LABEL_RE.test(normD)) {
      for (const v of variants) {
        if (v.length >= 3 && (w0 === v || w1 === v)) boost = Math.max(boost, 0.072);
      }
    }
  }

  if (FRESH_PRODUCE_LABEL_RE.test(normD)) {
    for (const v of variants) {
      if (v.length < 3) continue;
      if (normD === v) boost = Math.max(boost, 0.105);
      else if (normD.startsWith(`${v},`) || normD.startsWith(`${v} `)) boost = Math.max(boost, 0.095);
    }
  }

  return Math.min(0.17, boost);
}
