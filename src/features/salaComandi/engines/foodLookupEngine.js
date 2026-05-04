/**
 * Lookup nutrizionale puro: CREA (locale) > USDA, senza AI/API/React/Firebase.
 * Non inventa macro: include solo valori presenti e finiti nel record sorgente.
 */

import {
  compoundCarrierConfidencePenalty,
  expandItalianFoodVariants,
  isStrictBaseFoodLabelForVariants,
  simpleIngredientConfidenceBoost,
  singleTokenFromNormalizedQuery,
  strictSingleWordBaseMatchConfidence,
} from './italianFoodVariants';

/** @typedef {'CREA' | 'USDA' | 'USER'} LookupSnapshotSource */

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
 * Varianti con cui eseguire ricerche separate nel DB (singola parola: base + italiano sing/plur;
 * più parole: combinazioni da sinonimi + morfologia come buildQueryVariants).
 * @param {string} normalizedQuery
 * @returns {string[]}
 */
function buildMorphologicalLookupVariants(normalizedQuery) {
  const q = String(normalizedQuery || '').trim();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    const base = normalizeFoodName(tokens[0]);
    const set = new Set([base]);
    const exp = expandItalianFoodVariants(base);
    for (let i = 0; i < exp.length; i += 1) {
      const nv = normalizeFoodName(exp[i]);
      if (nv) set.add(nv);
    }
    return [...set].filter(Boolean);
  }
  return buildQueryVariants(q);
}

/**
 * Unisce hit da più ricerche (stessa key → tiene confidence massima).
 * @param {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }[][]} batches
 * @param {string} originalNormalizedQuery
 * @returns {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }[]}
 */
function mergeSearchBatchesByKey(batches, originalNormalizedQuery) {
  /** @type {Map<string, { key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }>} */
  const byKey = new Map();
  for (let bi = 0; bi < batches.length; bi += 1) {
    const batch = batches[bi];
    for (let hi = 0; hi < batch.length; hi += 1) {
      const h = batch[hi];
      const prev = byKey.get(h.key);
      if (!prev || h.confidence > prev.confidence) {
        byKey.set(h.key, h);
      } else if (prev && h.confidence === prev.confidence) {
        const preferH =
          h.matchedViaVariant === originalNormalizedQuery &&
          prev.matchedViaVariant !== originalNormalizedQuery;
        if (preferH) byKey.set(h.key, h);
      }
    }
  }
  const merged = [...byKey.values()];
  merged.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return String(a.key).localeCompare(String(b.key));
  });
  return merged;
}

/**
 * Per ogni variante morfologica esegue una scansione completa con scoring solo su quella stringa, poi unisce per key.
 * @param {unknown} db
 * @param {string} originalNormalizedQuery query utente normalizzata (boost/penalty + synonymMatch)
 * @param {string[]} lookupVariants
 */
function searchFoodDbMultiPass(db, originalNormalizedQuery, lookupVariants) {
  const list = Array.isArray(lookupVariants) ? lookupVariants : [];
  if (!originalNormalizedQuery || list.length === 0) return [];

  /** @type {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }[][]} */
  const batches = [];
  for (let vi = 0; vi < list.length; vi += 1) {
    const v = list[vi];
    if (!v) continue;
    batches.push(searchFoodDb(db, originalNormalizedQuery, [v]));
  }

  return mergeSearchBatchesByKey(batches, originalNormalizedQuery);
}

/**
 * Tier prioritario: solo nomi "base" (sing/plur) per query a una parola.
 * @param {unknown} db
 * @param {string} normalizedQuery
 * @param {string[]} variantList da tokenExpansionForLookup(singleTok)
 * @returns {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }[]}
 */
function searchFoodDbStrictSingleWordBase(db, normalizedQuery, variantList) {
  if (!singleTokenFromNormalizedQuery(normalizedQuery) || !Array.isArray(variantList) || variantList.length === 0) {
    return [];
  }

  const variantSet = new Set(variantList);
  const rows = flattenFoodDb(db);
  /** @type {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }[]} */
  const hits = [];

  for (let ri = 0; ri < rows.length; ri += 1) {
    const { key, item } = rows[ri];
    const normD = normalizeFoodName(rowPrimaryLabel(item));
    if (!normD) continue;
    if (!isStrictBaseFoodLabelForVariants(normD, variantSet)) continue;

    const conf = strictSingleWordBaseMatchConfidence(normD, normalizedQuery, variantList);
    let matchedViaVariant = normalizedQuery;
    for (let vi = 0; vi < variantList.length; vi += 1) {
      const v = variantList[vi];
      if (v && (normD === v || normD.startsWith(`${v},`) || normD.startsWith(`${v} `))) {
        matchedViaVariant = v;
        break;
      }
    }
    const synonymMatch = matchedViaVariant !== normalizedQuery;
    hits.push({
      key,
      item,
      confidence: conf,
      normLabel: normD,
      matchedViaVariant,
      synonymMatch,
    });
  }

  hits.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return String(a.key).localeCompare(String(b.key));
  });
  return hits;
}

/**
 * Unisce hit strict (ordinate per prime) con fuzzy senza duplicare key.
 * @param {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }[]} strictHits
 * @param {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }[]} fuzzyHits
 */
function mergeStrictBaseThenFuzzy(strictHits, fuzzyHits) {
  if (!strictHits || strictHits.length === 0) return fuzzyHits;
  const seen = new Set(strictHits.map((h) => h.key));
  const rest = [];
  for (let i = 0; i < fuzzyHits.length; i += 1) {
    const h = fuzzyHits[i];
    if (!seen.has(h.key)) rest.push(h);
  }
  return [...strictHits, ...rest];
}

/**
 * Demotare risultati utente composti quando la query è un solo ingrediente (es. fragola vs gelato alla fragola).
 * @param {{ normLabel: string }} hit
 * @param {string} normalizedQuery
 */
function isUserHitDemotedForSingleWordQuery(hit, normalizedQuery) {
  const tok = singleTokenFromNormalizedQuery(normalizedQuery);
  if (!tok || !hit?.normLabel) return false;
  const variantList = tokenExpansionForLookup(tok);
  if (isStrictBaseFoodLabelForVariants(hit.normLabel, new Set(variantList))) return false;
  return compoundCarrierConfidencePenalty(hit.normLabel, normalizedQuery) > 0;
}

/**
 * Incrocia CREA globale + DB utente per query a una parola: base globale, base utente, fuzzy globale, utente non composto, utente composto.
 * @param {unknown} creaDb
 * @param {unknown} userFoodDb
 * @param {string} normalizedQuery
 * @param {string[]} variants
 * @param {string[]} singleTokVariantList
 */
function mergeSingleWordLookupHits(creaDb, userFoodDb, normalizedQuery, variants, singleTokVariantList) {
  const gStrict = searchFoodDbStrictSingleWordBase(creaDb, normalizedQuery, singleTokVariantList);
  const gFuzzy = searchFoodDbMultiPass(creaDb, normalizedQuery, variants);
  const gAll = mergeStrictBaseThenFuzzy(gStrict, gFuzzy);

  const uStrict = searchFoodDbStrictSingleWordBase(userFoodDb, normalizedQuery, singleTokVariantList);
  const uFuzzy = searchFoodDbMultiPass(userFoodDb, normalizedQuery, variants);
  const uAll = mergeStrictBaseThenFuzzy(uStrict, uFuzzy);

  const seen = new Set();
  /** @type {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean, __lookupSource: 'global' | 'user' }[]} */
  const out = [];

  const pushGlobal = (h) => {
    out.push({ ...h, __lookupSource: 'global' });
    seen.add(h.key);
  };
  const pushUser = (h) => {
    out.push({ ...h, __lookupSource: 'user' });
    seen.add(h.key);
  };

  for (let i = 0; i < gStrict.length; i += 1) pushGlobal(gStrict[i]);

  for (let i = 0; i < uStrict.length; i += 1) {
    const h = uStrict[i];
    if (!seen.has(h.key)) pushUser(h);
  }

  for (let i = 0; i < gAll.length; i += 1) {
    const h = gAll[i];
    if (!seen.has(h.key)) pushGlobal(h);
  }

  for (let i = 0; i < uAll.length; i += 1) {
    const h = uAll[i];
    if (seen.has(h.key)) continue;
    if (isUserHitDemotedForSingleWordQuery(h, normalizedQuery)) continue;
    pushUser(h);
  }
  for (let i = 0; i < uAll.length; i += 1) {
    const h = uAll[i];
    if (seen.has(h.key)) continue;
    pushUser(h);
  }
  return out;
}

/**
 * Unisce hit globali e utente per query multi-parola: stessa key → confidence max; parità → preferisci globale.
 * @param {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }[]} globalHits
 * @param {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean }[]} userHits
 */
function mergeHitsPreferGlobalOnTie(globalHits, userHits) {
  /** @type {Map<string, { key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean, __lookupSource: 'global' | 'user' }>} */
  const map = new Map();
  for (let i = 0; i < globalHits.length; i += 1) {
    const h = globalHits[i];
    map.set(h.key, { ...h, __lookupSource: 'global' });
  }
  for (let i = 0; i < userHits.length; i += 1) {
    const h = userHits[i];
    const prev = map.get(h.key);
    const tagged = { ...h, __lookupSource: 'user' };
    if (!prev) {
      map.set(h.key, tagged);
    } else if (h.confidence > prev.confidence) {
      map.set(h.key, tagged);
    }
  }
  const merged = [...map.values()];
  merged.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.__lookupSource !== b.__lookupSource) return a.__lookupSource === 'global' ? -1 : 1;
    return String(a.key).localeCompare(String(b.key));
  });
  return merged;
}

/**
 * Pipeline strict+fuzzy su un solo database (senza tag sorgente).
 * @param {unknown} db
 * @param {string} normalizedQuery
 * @param {string[]} variants
 * @param {string[] | null} singleTokVariantList
 */
function computeDbHits(db, normalizedQuery, variants, singleTokVariantList) {
  const fuzzy = searchFoodDbMultiPass(db, normalizedQuery, variants);
  const strict =
    singleTokVariantList && singleTokVariantList.length > 0
      ? searchFoodDbStrictSingleWordBase(db, normalizedQuery, singleTokVariantList)
      : [];
  return mergeStrictBaseThenFuzzy(strict, fuzzy);
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
 * @param {{ __lookupSource?: 'global' | 'user' }} h
 * @param {LookupSnapshotSource} fallback
 * @returns {LookupSnapshotSource}
 */
function snapshotSourceFromLookupHit(h, fallback) {
  if (h && h.__lookupSource === 'user') return 'USER';
  if (h && h.__lookupSource === 'global') return 'CREA';
  return fallback;
}

/**
 * Snapshot candidato senza inventare nutrienti (solo valori finiti nel record).
 * @param {string} key
 * @param {object} item
 * @param {LookupSnapshotSource} source
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
 * @param {{ key: string, item: object, confidence: number, normLabel: string, __lookupSource?: 'global' | 'user' }[]} hits
 * @param {LookupSnapshotSource} fallbackSource
 * @param {number} start offset (salta primi N per alternatives)
 * @param {number} limit
 */
function snapshotsFromHits(hits, fallbackSource, start, limit) {
  const out = [];
  const max = Math.min(hits.length, start + limit);
  for (let i = start; i < max; i += 1) {
    const h = hits[i];
    out.push(buildCandidateSnapshot(h.key, h.item, snapshotSourceFromLookupHit(h, fallbackSource)));
  }
  return out;
}

/**
 * @param {object} params
 * @param {string} params.query
 * @param {unknown} params.creaDb database globale / CREA (solo CSV se passi anche userFoodDb)
 * @param {unknown} [params.usdaDb]
 * @param {unknown} [params.userFoodDb] voci personali: con creaDb separato, la query a una parola preferisce il catalogo globale
 * @param {object} [params.options]
 * @param {number} [params.options.confidenceThreshold]
 * @param {number} [params.options.minWeakConfidence] soglia minima per alternatives / stima
 */
export function lookupFoodCandidate({ query, creaDb, usdaDb, userFoodDb, options }) {
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

  const variants = buildMorphologicalLookupVariants(normalizedQuery);
  const singleTok = singleTokenFromNormalizedQuery(normalizedQuery);
  const singleTokVariantList = singleTok ? tokenExpansionForLookup(singleTok) : null;

  debug.queryVariants = variants;
  debug.lookupVariants = variants;

  const userDb =
    userFoodDb != null && typeof userFoodDb === 'object' && !Array.isArray(userFoodDb) ? userFoodDb : null;

  /** @type {{ key: string, item: object, confidence: number, normLabel: string, matchedViaVariant: string, synonymMatch: boolean, __lookupSource?: 'global' | 'user' }[]} */
  let creaHits;
  if (userDb) {
    if (singleTokVariantList && singleTokVariantList.length > 0) {
      creaHits = mergeSingleWordLookupHits(creaDb, userDb, normalizedQuery, variants, singleTokVariantList);
    } else {
      const gHits = computeDbHits(creaDb, normalizedQuery, variants, singleTokVariantList);
      const uHits = computeDbHits(userDb, normalizedQuery, variants, singleTokVariantList);
      creaHits = mergeHitsPreferGlobalOnTie(gHits, uHits);
    }
    debug.splitUserDb = true;
  } else {
    creaHits = computeDbHits(creaDb, normalizedQuery, variants, singleTokVariantList);
  }

  debug.creaHitCount = creaHits.length;
  debug.creaTop = creaHits[0] ? { key: creaHits[0].key, confidence: creaHits[0].confidence } : null;

  const topCrea = creaHits[0];
  if (topCrea && topCrea.confidence >= threshold) {
    const topSource = snapshotSourceFromLookupHit(topCrea, 'CREA');
    const candidate = buildCandidateSnapshot(topCrea.key, topCrea.item, topSource);
    const alternatives = snapshotsFromHits(creaHits, 'CREA', 1, MAX_ALTERNATIVES);
    const via = topCrea.matchedViaVariant;
    const syn =
      topCrea.synonymMatch && via && via !== normalizedQuery
        ? `Trovato tramite sinonimo: ${via}. `
        : '';
    const dbLabel =
      topSource === 'USER'
        ? 'nel tuo database alimenti'
        : topSource === 'CREA'
          ? 'nel database CREA'
          : 'nel catalogo';
    return {
      status: 'matched',
      source: topSource,
      confidence: topCrea.confidence,
      candidate,
      alternatives,
      explanation: `${syn}Match affidabile ${dbLabel} (confidence ${topCrea.confidence}).`,
      needsReview: false,
      debug,
    };
  }

  const usdaFuzzy = searchFoodDbMultiPass(usdaDb, normalizedQuery, variants);
  const strictUsda =
    singleTokVariantList && singleTokVariantList.length > 0
      ? searchFoodDbStrictSingleWordBase(usdaDb, normalizedQuery, singleTokVariantList)
      : [];
  const usdaHits = mergeStrictBaseThenFuzzy(strictUsda, usdaFuzzy);
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

  /** @type {{ key: string, item: object, confidence: number, source: LookupSnapshotSource, normLabel: string }[]} */
  const merged = [];
  for (let i = 0; i < creaHits.length; i += 1) {
    const h = creaHits[i];
    merged.push({ ...h, source: snapshotSourceFromLookupHit(h, 'CREA') });
  }
  for (let i = 0; i < usdaHits.length; i += 1) {
    const h = usdaHits[i];
    merged.push({ ...h, source: 'USDA' });
  }
  const sourceRank = (s) => {
    if (s === 'CREA') return 0;
    if (s === 'USER') return 1;
    return 2;
  };
  merged.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const dr = sourceRank(a.source) - sourceRank(b.source);
    if (dr !== 0) return dr;
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
