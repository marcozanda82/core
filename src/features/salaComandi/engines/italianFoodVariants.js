/**
 * Varianti morfologiche italiane leggere per matching alimenti (euristiche, senza dipendenze).
 */

/** Prodotti composti da deprioritizzare quando la query è un singolo ingrediente ("fragola" vs "gelato alla fragola"). */
export const COMPOUND_CARRIER_RE =
  /\b(gelato|gelati|yoghurt|yogurt|crostata|crostate|merendine|merenda|biscotti|biscotto|torta|torte|budino|budini|semifreddo|semifreddi|mousse)\b/i;

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
 * Penalità 0..1 da sottrarre alla confidence se ingrediente singolo in prodotto preparato (es. gelato alla fragola).
 * @param {string} normD label normalizzata
 * @param {string} normalizedQuery query normalizzata
 * @returns {number}
 */
export function compoundCarrierConfidencePenalty(normD, normalizedQuery) {
  const tok = singleTokenFromNormalizedQuery(normalizedQuery);
  if (!tok || !normD) return 0;
  if (!COMPOUND_CARRIER_RE.test(normD)) return 0;
  const variants = new Set(expandItalianFoodVariants(tok));
  variants.add(tok);
  for (const v of variants) {
    if (v.length >= 3 && normD.includes(v)) return 0.09;
  }
  return 0;
}

/**
 * Piccolo bonus se la label mette l’ingrediente in evidenza (inizio o "frutta …").
 * @param {string} normD
 * @param {string} normalizedQuery
 * @returns {number}
 */
export function simpleIngredientConfidenceBoost(normD, normalizedQuery) {
  const tok = singleTokenFromNormalizedQuery(normalizedQuery);
  if (!tok || !normD) return 0;
  const variants = new Set(expandItalianFoodVariants(tok));
  variants.add(tok);
  const words = normD.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  for (const v of variants) {
    if (!v || v.length < 3) continue;
    if (normD === v) return 0.06;
    if (normD.startsWith(v + ',') || normD.startsWith(v + ' ')) return 0.055;
    const w0 = words[0].replace(/^[^a-z0-9àèéìòù]+/i, '');
    if (w0 === v) return 0.05;
  }

  if (words.length >= 2) {
    const w1 = words[1].replace(/^[^a-z0-9àèéìòù]+/i, '');
    if (words[0].includes('frutta') && variants.has(w1)) return 0.045;
    for (const v of variants) {
      if (v.length >= 3 && words[1] === v) return 0.04;
    }
  }

  return 0;
}
