/**
 * Varianti morfologiche italiane leggere per matching alimenti (euristiche, senza dipendenze).
 */

/**
 * Indizi di prodotto lavorato/composto (penalità solo con query a singolo token + ingrediente in descrizione).
 */
export const PROCESSED_FOOD_HINT_RE =
  /\b(gelato|gelati|yoghurt|yogurt|torta|torte|biscotto|biscotti|merendina|merendine|barretta|barrette|crema\b|creme\b|dessert|succo|succi|bevanda|bevande|gusto|aroma)\b/i;

/** Connettivi tipici ricette marketing: con query mono-parola abbassano ranking vs frutta/verdura semplice. */
export const RECIPE_CONNECTOR_RE = /\b(alla|allo|agli|alle|al|ai|ad|con)\b/i;

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

  if (t === 'uovo') {
    out.add('uova');
    return [...out];
  }
  if (t === 'uova') {
    out.add('uovo');
    return [...out];
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
  if (PROCESSED_FOOD_HINT_RE.test(normD)) pen += 0.14;

  const wc = labelWordCount(normD);
  if (wc >= 3 && RECIPE_CONNECTOR_RE.test(normD)) pen += 0.09;

  return Math.min(0.22, pen);
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
  }

  return Math.min(0.14, boost);
}
