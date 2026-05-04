/**
 * Lookup nutrizionale puro: CREA (locale) > USDA, senza AI/API/React/Firebase.
 * Non inventa macro: include solo valori presenti e finiti nel record sorgente.
 */

import {
  compoundCarrierConfidencePenalty,
  expandItalianFoodVariants,
  simpleIngredientConfidenceBoost,
} from './italianFoodVariants';

const DEFAULT_CONFIDENCE_MATCH = 0.75;
const MAX_ALTERNATIVES = 5;
const MAX_QUERY_VARIANTS = 48;
const ACCENT_REGEX = /[\u0300-\u036f]/g;

/** Mappa sinonimi (chiavi/valori verranno normalizzati a runtime). */
const FOOD_SYNONYMS_RAW = Object.freeze({
  marmellata: ['confettura', 'marmellata'],
  confettura: ['marmellata', 'confettura'],
  yoghurt: ['yogurt'],
  yogurt: ['yoghurt'],
  caffe: ['caffè', 'coffee', 'espresso'],
  caffè: ['caffe', 'coffee', 'espresso'],
});

/**
 * @param {unknown} n
 * @returns {number | null}
 */
function pickFiniteFirst(...candidates) {
  for (let i = 0; i < candidates.length; i += 1) {
    const x = Number(candidates[i]);
    if (Number.isFinite(x)) return x;
  }
  return null;
}

/**
 * @param {string} s
 */
function stripAccents(s) {
  const t = String(s || '').normalize('NFD');
  return t.replace(ACCENT_REGEX, '');
}

/**
 * Leggera riduzione sing/plur: token corti → invariati; suffissi comuni i/e/s.
 * @param {string} token
 * @returns {string[]}
 */
function tokenPluralVariants(token) {
  const t = String(token || '').trim();
  if (t.length < 3) return [t];
  const out = new Set([t]);
  const last = t[t.length - 1];
  if (t.length >= 4 && (last === 'i' || last === 'e' || last === 's')) {
    out.add(t.slice(0, -1));
  }
  if (last === 'o' && t.length >= 3) out.add(`${t}i`);
  if (last === 'a' && t.length >= 3) out.add(`${t}e`);
  return [...out];
}

/**
 * Normalizza nome alimento per confronto.
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeFoodName(raw) {
  let s = stripAccents(String(raw ?? '')).toLowerCase();
  s = s.replace(/[''`´]/g, '');
  s = s.trim().replace(/\s+/g, ' ');
  return s;
}

const FOOD_SYNONYM_MAP = (() => {
  const m = Object.create(null);
  const keys = Object.keys(FOOD_SYNONYMS_RAW);
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    const nk = normalizeFoodName(k);
    const arr = FOOD_SYNONYMS_RAW[k];
    const merged = new Set([nk]);
    for (let j = 0; j < arr.length; j += 1) merged.add(normalizeFoodName(arr[j]));
    m[nk] = [...merged];
  }
  return m;
})();

/**
 * Sinonimi normalizzati per un token (include il token stesso).
 * @param {string} token
 */
function synonymsForToken(token) {
  const t = normalizeFoodName(token);
  const arr = FOOD_SYNONYM_MAP[t];
  if (!arr || arr.length === 0) return [t];
  const s = new Set(arr);
  s.add(t);
  return [...s];
}

/** Sinonimi + varianti morfologiche italiane per un token. */
function tokenExpansionForLookup(token) {
  const t = normalizeFoodName(token);
  const s = new Set(synonymsForToken(t));
  const it = expandItalianFoodVariants(t);
  for (let i = 0; i < it.length; i += 1) {
    s.add(normalizeFoodName(it[i]));
  }
  return [...s];
}

/**
 * Varianti della query: stringa normalizzata + sostituzioni sinonimi per token (prodotto limitato).
 * @param {string} normalizedQuery
 * @returns {string[]}
 */
function buildQueryVariants(normalizedQuery) {
  if (!normalizedQuery) return [];
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const expanded = tokens.map((tok) => tokenExpansionForLookup(tok));
  /** @type {string[][]} */
  let combos = [[]];
  for (let ti = 0; ti < expanded.length; ti += 1) {
    const opts = expanded[ti];
    const next = [];
    for (let ci = 0; ci < combos.length; ci += 1) {
      const prefix = combos[ci];
      for (let oi = 0; oi < opts.length; oi += 1) {
        next.push(prefix.concat(opts[oi]));
        if (next.length >= MAX_QUERY_VARIANTS) break;
      }
      if (next.length >= MAX_QUERY_VARIANTS) break;
    }
    combos = next;
    if (combos.length >= MAX_QUERY_VARIANTS) break;
  }

  const variants = new Set();
  variants.add(normalizedQuery);
  for (let i = 0; i < combos.length; i += 1) {
    variants.add(combos[i].join(' ').trim());
  }
  return Array.from(variants).filter(Boolean);
}

/**
 * @param {string} norm
 */
function expandedTokenSet(norm) {
  const tokens = norm.split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i < tokens.length; i += 1) {
    const vars = tokenPluralVariants(tokens[i]);
    for (let j = 0; j < vars.length; j += 1) set.add(vars[j]);
    const itVar = expandItalianFoodVariants(tokens[i]);
    for (let k = 0; k < itVar.length; k += 1) set.add(normalizeFoodName(itVar[k]));
  }
  return set;
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 */
function jaccardSets(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach((x) => {
    if (b.has(x)) inter += 1;
  });
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Score 0..1 tra query normalizzata e label DB normalizzata.
 * @param {string} normQ
 * @param {string} normD
 */
function scoreFoodCandidate(normQ, normD) {
  if (!normQ || !normD) return 0;
  if (normQ === normD) return 1;

  let best = 0;
  const qTokens = expandedTokenSet(normQ);
  const dTokens = expandedTokenSet(normD);

  if (normD.startsWith(normQ) && normQ.length >= 2) {
    const ratio = normQ.length / Math.max(normD.length, 1);
    best = Math.max(best, 0.78 + Math.min(ratio * 0.2, 0.2));
  }
  if (normQ.startsWith(normD) && normD.length >= 3) {
    const ratio = normD.length / Math.max(normQ.length, 1);
    best = Math.max(best, 0.76 + Math.min(ratio * 0.18, 0.18));
  }

  if (normQ.length >= 3 && normD.includes(normQ)) {
    const ratio = normQ.length / Math.max(normD.length, 1);
    best = Math.max(best, 0.75 + Math.min(ratio * 0.12, 0.12));
  }
  if (normD.length >= 3 && normQ.includes(normD)) {
    const ratio = normD.length / Math.max(normQ.length, 1);
    best = Math.max(best, 0.72 + Math.min(ratio * 0.15, 0.15));
  }

  const j = jaccardSets(qTokens, dTokens);
  if (j > 0) best = Math.max(best, 0.42 + j * 0.34);

  return Math.min(1, Math.round(best * 10000) / 10000);
}

/**
 * @param {unknown} db
 * @returns {{ key: string, item: object }[]}
 */
function flattenFoodDb(db) {
  if (db == null) return [];
  if (Array.isArray(db)) {
    const out = [];
    for (let i = 0; i < db.length; i += 1) {
      const item = db[i];
      if (!item || typeof item !== 'object') continue;
      const key = String(
        item.id ?? item.fdcId ?? item.fdc_id ?? item.key ?? item.code ?? item.ndbNumber ?? `row_${i}`,
      );
      out.push({ key, item });
    }
    return out;
  }
  if (typeof db !== 'object') return [];
  const rows = [];
  const keys = Object.keys(db);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (!Object.prototype.hasOwnProperty.call(db, key)) continue;
    const item = db[key];
    if (!item || typeof item !== 'object') continue;
    rows.push({ key, item });
  }
  return rows;
}

function rowPrimaryLabel(item) {
  if (!item || typeof item !== 'object') return '';
  const d = item.desc ?? item.name ?? item.description ?? item.foodName ?? item.lowercaseDescription ?? '';
  return String(d || '').trim();
}

/**
 * Cerca nel database: prova tutte le queryVariants, unisce per key tenendo la confidence massima.
 * Tie-break: a parità di score preferisce la variante uguale a normalizedQuery (match letterale).
 * @param {unknown} db
 * @param {string} normalizedQuery
 * @param {string[]} queryVariants
 * @returns {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }[]}
 */
function searchFoodDb(db, normalizedQuery, queryVariants) {
  const variants =
    Array.isArray(queryVariants) && queryVariants.length > 0
      ? queryVariants
      : (normalizedQuery ? [normalizedQuery] : []);
  if (!normalizedQuery || variants.length === 0) return [];

  const rows = flattenFoodDb(db);
  /** @type {Map<string, { key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }>} */
  const hitMap = new Map();

  for (let ri = 0; ri < rows.length; ri += 1) {
    const { key, item } = rows[ri];
    const label = rowPrimaryLabel(item);
    const normD = normalizeFoodName(label);
    if (!normD) continue;

    let bestConf = 0;
    let bestVariant = normalizedQuery;
    for (let vi = 0; vi < variants.length; vi += 1) {
      const v = variants[vi];
      if (!v) continue;
      let c = scoreFoodCandidate(v, normD);
      c += simpleIngredientConfidenceBoost(normD, normalizedQuery);
      c -= compoundCarrierConfidencePenalty(normD, normalizedQuery);
      c = Math.max(0, Math.min(1, Math.round(c * 10000) / 10000));
      if (c > bestConf) {
        bestConf = c;
        bestVariant = v;
      } else if (c === bestConf && c > 0 && v === normalizedQuery) {
        bestVariant = normalizedQuery;
      }
    }
    if (bestConf > 0) {
      const synonymMatch = bestVariant !== normalizedQuery;
      hitMap.set(key, {
        key,
        item,
        confidence: bestConf,
        normLabel: normD,
        matchedViaVariant: bestVariant,
        synonymMatch,
      });
    }
  }

  const hits = [...hitMap.values()];
  hits.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return String(a.key).localeCompare(String(b.key));
  });
  return hits;
}

/**
 * Snapshot candidato senza inventare nutrienti (solo valori finiti nel record).
 * @param {string} key
 * @param {object} item
 * @param {'CREA' | 'USDA'} source
 */
function buildCandidateSnapshot(key, item, source) {
  const descRaw = rowPrimaryLabel(item) || String(key || '').trim();
  const snap = {
    key: String(key),
    desc: descRaw || String(key),
    source,
  };

  const kcal = pickFiniteFirst(
    item.kcal,
    item.cal,
    item.calories,
    item.energy,
    item.energy_kcal,
    item.energyKcal,
    item.nf_calories,
  );
  if (kcal != null) snap.kcal = kcal;

  const prot = pickFiniteFirst(item.prot, item.protein, item.proteins, item.proteinContent);
  if (prot != null) snap.prot = prot;

  const carb = pickFiniteFirst(
    item.carb,
    item.carbohydrate,
    item.carbohydrates,
    item.carbs,
    item.carbohydrate_g,
  );
  if (carb != null) snap.carb = carb;

  const fat = pickFiniteFirst(item.fat, item.fatTotal, item.totalFat, item.lipid, item.fat_g);
  if (fat != null) snap.fat = fat;

  const dq = pickFiniteFirst(item.defaultQty, item.portionGrams, item.servingSize);
  if (dq != null && dq > 0) snap.defaultQty = Math.round(dq);

  return snap;
}

/**
 * @param {{ key: string, item: object, confidence: number, normLabel: string }[]} hits
 * @param {'CREA' | 'USDA'} source
 * @param {number} start offset (salta primi N per alternatives)
 * @param {number} limit
 */
function snapshotsFromHits(hits, source, start, limit) {
  const out = [];
  const max = Math.min(hits.length, start + limit);
  for (let i = start; i < max; i += 1) {
    const h = hits[i];
    out.push(buildCandidateSnapshot(h.key, h.item, source));
  }
  return out;
}

/**
 * @param {object} params
 * @param {string} params.query
 * @param {unknown} params.creaDb
 * @param {unknown} [params.usdaDb]
 * @param {object} [params.options]
 * @param {number} [params.options.confidenceThreshold]
 * @param {number} [params.options.minWeakConfidence] soglia minima per alternatives / stima
 */
export function lookupFoodCandidate({ query, creaDb, usdaDb, options }) {
  const opts = options != null && typeof options === 'object' ? options : {};
  const threshold =
    typeof opts.confidenceThreshold === 'number' && opts.confidenceThreshold > 0 && opts.confidenceThreshold <= 1
      ? opts.confidenceThreshold
      : DEFAULT_CONFIDENCE_MATCH;
  const minWeak =
    typeof opts.minWeakConfidence === 'number' && opts.minWeakConfidence >= 0 && opts.minWeakConfidence < 1
      ? opts.minWeakConfidence
      : 0.08;

  const normalizedQuery = normalizeFoodName(query);
  /** @type {Record<string, unknown>} */
  const debug = {
    normalizedQuery,
    threshold,
    creaHitCount: 0,
    usdaHitCount: 0,
    creaTop: null,
    usdaTop: null,
  };

  const baseNotFound = {
    status: 'not_found',
    source: null,
    confidence: 0,
    candidate: null,
    alternatives: [],
    explanation: 'Query vuota o nessuna corrispondenza utile nei database forniti.',
    needsReview: true,
    debug,
  };

  if (!normalizedQuery) {
    baseNotFound.explanation = 'Query vuota o non valida.';
    return baseNotFound;
  }

  const queryVariants = buildQueryVariants(normalizedQuery);
  debug.queryVariants = queryVariants;

  const creaHits = searchFoodDb(creaDb, normalizedQuery, queryVariants);
  debug.creaHitCount = creaHits.length;
  debug.creaTop = creaHits[0] ? { key: creaHits[0].key, confidence: creaHits[0].confidence } : null;

  const topCrea = creaHits[0];
  if (topCrea && topCrea.confidence >= threshold) {
    const candidate = buildCandidateSnapshot(topCrea.key, topCrea.item, 'CREA');
    const alternatives = snapshotsFromHits(creaHits, 'CREA', 1, MAX_ALTERNATIVES);
    const via = topCrea.matchedViaVariant;
    const syn =
      topCrea.synonymMatch && via && via !== normalizedQuery
        ? `Trovato tramite sinonimo: ${via}. `
        : '';
    return {
      status: 'matched',
      source: 'CREA',
      confidence: topCrea.confidence,
      candidate,
      alternatives,
      explanation: `${syn}Match affidabile nel database CREA (confidence ${topCrea.confidence}).`,
      needsReview: false,
      debug,
    };
  }

  const usdaHits = searchFoodDb(usdaDb, normalizedQuery, queryVariants);
  debug.usdaHitCount = usdaHits.length;
  debug.usdaTop = usdaHits[0] ? { key: usdaHits[0].key, confidence: usdaHits[0].confidence } : null;

  const topUsda = usdaHits[0];
  if (topUsda && topUsda.confidence >= threshold) {
    const candidate = buildCandidateSnapshot(topUsda.key, topUsda.item, 'USDA');
    const alternatives = snapshotsFromHits(usdaHits, 'USDA', 1, MAX_ALTERNATIVES);
    const viaU = topUsda.matchedViaVariant;
    const synU =
      topUsda.synonymMatch && viaU && viaU !== normalizedQuery
        ? `Trovato tramite sinonimo: ${viaU}. `
        : '';
    return {
      status: 'matched',
      source: 'USDA',
      confidence: topUsda.confidence,
      candidate,
      alternatives,
      explanation: `${synU}Match affidabile nel database USDA (confidence ${topUsda.confidence}).`,
      needsReview: false,
      debug,
    };
  }

  /** @type {{ key: string, item: object, confidence: number, source: 'CREA' | 'USDA', normLabel: string }[]} */
  const merged = [];
  for (let i = 0; i < creaHits.length; i += 1) {
    const h = creaHits[i];
    merged.push({ ...h, source: 'CREA' });
  }
  for (let i = 0; i < usdaHits.length; i += 1) {
    const h = usdaHits[i];
    merged.push({ ...h, source: 'USDA' });
  }
  merged.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const ks = String(a.source).localeCompare(String(b.source));
    if (ks !== 0) return ks;
    return String(a.key).localeCompare(String(b.key));
  });

  const weak = merged.filter((x) => x.confidence >= minWeak);
  if (weak.length === 0) {
    return {
      ...baseNotFound,
      explanation:
        'Nessuna voce supera la soglia minima di similarità nei database CREA e USDA.',
    };
  }

  const alternatives = [];
  const seen = new Set();
  for (let i = 0; i < weak.length && alternatives.length < MAX_ALTERNATIVES; i += 1) {
    const w = weak[i];
    const id = `${w.source}:${w.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    alternatives.push(buildCandidateSnapshot(w.key, w.item, w.source));
  }

  const best = weak[0];

  return {
    status: 'needs_ai_estimate',
    source: best.source,
    confidence: best.confidence,
    candidate: null,
    alternatives,
    explanation:
      'Nessun match >= soglia affidabile; elenco ordinato di candidati deboli (stima AI non eseguita in questo modulo).',
    needsReview: true,
    debug,
  };
}
