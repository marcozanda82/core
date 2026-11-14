/**
 * Audit sola lettura — piatti composti sospetti vs alimento semplice catalogo.
 * Condiviso tra scripts/auditCompoundFoodMatches.mjs e UI Focus (DEV).
 *
 * Prestazioni: indici exact/prefix costruiti una volta; contains solo su cataloghi
 * piccoli (CREA / USDA / personale); mai scan lineare sull'intero OFF.
 */

import { italianSingularPluralForms, normalizeSearchText } from '../../../foodSearch.js';
import {
  ENERGY_DENSITY_CONFIRM_RATIO,
  FOOD_MATCH_QUALITY,
  catalogRowDisplayNames,
  classifyFoodMatchQuality,
  exactQueryNormForms,
  foodMatchQualityRank,
} from '../../mealBuilder/utils/foodMatchQuality.js';
import { resolveFoodClockHourDetailed } from '../normalize/focusMealSlots.js';
import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { expandTrackerLogEntries } from '../normalize/expandTrackerDayLog.js';

export { ENERGY_DENSITY_CONFIRM_RATIO };

export const ASSISTED_ENTRY_SOURCES = Object.freeze(new Set([
  'chat',
  'chat_draft',
  'voice',
  'mcdrive',
  'wizard',
  'sequential',
  'fast_path',
  'fastpath',
]));

export const AUDIT_CHUNK_SIZE = 50;
export const AUDIT_LOG_PREFIX = '[compound-audit]';

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 32 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

const COMPOUND_CONNECTOR = /\b(?:di|con|al|alla|allo|ai|agli|alle|e|ed)\b/i;
const STOP_WORDS = new Set([
  'di', 'con', 'al', 'alla', 'allo', 'ai', 'agli', 'alle', 'e', 'ed',
  'un', 'una', 'uno', 'il', 'la', 'lo', 'i', 'gli', 'le', 'del', 'della',
  'dei', 'delle', 'degli', 'in', 'da', 'su', 'per', 'a', 'the', 'and',
  'fresh', 'raw', 'cooked', 'crudi', 'crude', 'cotti', 'cotta', 'surgelati',
  'ristorante', 'homemade', 'casa',
]);

/** Parole troppo generiche: non devono generare un match sospetto. */
export const AUDIT_GENERIC_MATCH_WORDS = Object.freeze(new Set([
  'barattolo', 'barattoli',
  'pronto', 'pronta', 'pronti', 'pronte',
  'mix',
  'fresco', 'fresca', 'freschi', 'fresche',
  'fresh',
]));

function isGenericMatchWord(word) {
  const w = normalizeSearchText(word);
  if (!w) return true;
  if (STOP_WORDS.has(w) || AUDIT_GENERIC_MATCH_WORDS.has(w)) return true;
  return false;
}

/**
 * Normalizza una riga catalogo grezza → campi usati dal matcher.
 * Non usare sull'intero OFF in UI: preferisci gli oggetti già indexati da foodLoader.
 * @param {Record<string, object>|null|undefined} raw
 * @returns {Record<string, object>}
 */
export function normalizeAuditCatalog(raw) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const [id, row] of Object.entries(raw || {})) {
    if (!row || typeof row !== 'object') continue;
    const italianName = String(row.italianName || '').trim();
    const desc = String(row.desc || italianName || row.name || '').trim();
    out[id] = {
      ...row,
      id: row.id ?? id,
      fdcId: row.fdcId ?? id,
      italianName: italianName || undefined,
      desc,
      name: String(row.name || desc).trim(),
      kcal: Number(row.kcal ?? row.cal ?? row.energyKcal) || undefined,
    };
  }
  return out;
}

/**
 * @param {unknown} name
 */
export function isCompoundDishName(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  const words = normalizeSearchText(n).split(/\s+/).filter(Boolean);
  if (words.length >= 3) return true;
  if (COMPOUND_CONNECTOR.test(n)) return true;
  return words.length >= 2 && /[,/+]/.test(n);
}

/**
 * @param {object} item
 */
export function isAssistedEntry(item) {
  const src = String(item?.entrySource || '').trim().toLowerCase();
  if (ASSISTED_ENTRY_SOURCES.has(src)) return true;
  if (item?.sourceText || item?.spokenFoodName) return true;
  const id = String(item?.id || '');
  if (/^mcdrive/i.test(id) || /wizard/i.test(id)) return true;
  return false;
}

/**
 * @param {object} item
 * @returns {number|null}
 */
export function itemKcalPer100g(item) {
  const grams = Number(item?.grams ?? item?.qta ?? item?.weight ?? item?.qty);
  const kcal = Number(item?.kcal ?? item?.cal);
  if (Number.isFinite(grams) && grams > 0 && Number.isFinite(kcal) && kcal > 0) {
    return (kcal / grams) * 100;
  }
  if (Number.isFinite(kcal) && kcal > 0 && kcal < 1200 && !(Number.isFinite(grams) && grams > 0)) {
    return kcal;
  }
  return null;
}

/**
 * @param {object} row
 * @returns {number|null}
 */
export function catalogKcalPer100g(row) {
  const direct = Number(row?.kcal ?? row?.cal ?? row?.energyKcal);
  if (Number.isFinite(direct) && direct > 0 && direct < 1200) return direct;
  return null;
}

/**
 * @param {string} name
 * @returns {string[]}
 */
export function candidateWordsFromDish(name) {
  return normalizeSearchText(name)
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 4 && !isGenericMatchWord(w));
}

/**
 * Testo originale utente (wizard/chat/voce), se presente.
 * @param {object} item
 * @returns {string|null}
 */
export function readAuditSourceText(item) {
  const raw = String(
    item?.sourceText
    || item?.spokenFoodName
    || item?.spokenName
    || item?.userText
    || '',
  ).trim();
  return raw || null;
}

/**
 * True se ciò che l'utente ha scritto punta all'alimento semplice, non al piatto.
 * Es. scritto "spinaci", registrato "Ravioli di ricotta e spinaci".
 * @param {string|null|undefined} sourceText
 * @param {string|null|undefined} simpleAlternative
 * @param {string|null|undefined} recorded
 */
export function sourceTextPointsToSimple(sourceText, simpleAlternative, recorded) {
  const src = normalizeSearchText(sourceText);
  const alt = normalizeSearchText(simpleAlternative);
  const dish = normalizeSearchText(recorded);
  if (!src || !alt || !dish) return false;
  if (src === dish) return false;
  const quality = classifyFoodMatchQuality(String(simpleAlternative || ''), String(sourceText || ''));
  return quality === FOOD_MATCH_QUALITY.EXACT || quality === FOOD_MATCH_QUALITY.PREFIX;
}

function isSimpleFoodName(name) {
  const words = normalizeSearchText(name).split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 3;
}

function hitFromRow(id, food, displayName, quality) {
  const fdcId = String(food.fdcId ?? food.id ?? food.foodDbKey ?? id ?? '').trim() || String(id);
  const name = String(displayName || food.italianName || food.desc || food.name || '').trim();
  // Nessuna copia della riga: riusa l'oggetto del catalogo (foodLoader).
  return {
    fdcId,
    name,
    confidence: quality === FOOD_MATCH_QUALITY.CONTAINS ? 'medium' : 'high',
    reason: quality === FOOD_MATCH_QUALITY.CONTAINS ? 'Match contains' : 'Match forte',
    matchKind: quality,
    matchQuality: quality,
    row: food,
    rowId: id,
  };
}

function pushIndexMap(map, key, hit) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(hit);
  else map.set(key, [hit]);
}

function indexCatalogEntries(entries, exactByNorm, prefixByFirstToken, containsByToken, forContains) {
  for (const [id, food] of entries) {
    if (!food || typeof food !== 'object') continue;

    // Fast-path OFF/heavy: solo nomi semplici (≤3 parole) per exact/prefix.
    if (!forContains) {
      const primary = String(food.italianName || food.desc || food.name || '').trim();
      const primaryNorm = normalizeSearchText(primary);
      if (!primaryNorm) continue;
      const primaryWords = primaryNorm.split(/\s+/).filter(Boolean);
      if (primaryWords.length === 0 || primaryWords.length > 3) continue;
      const display = primary;
      const exactHit = hitFromRow(id, food, display, FOOD_MATCH_QUALITY.EXACT);
      pushIndexMap(exactByNorm, primaryNorm, exactHit);
      if (primaryWords.length === 1) {
        for (const form of italianSingularPluralForms(primaryWords[0])) {
          const nf = normalizeSearchText(form);
          if (nf) pushIndexMap(exactByNorm, nf, exactHit);
        }
      }
      const first = primaryWords[0];
      if (first) {
        const prefixHit = hitFromRow(id, food, display, FOOD_MATCH_QUALITY.PREFIX);
        pushIndexMap(prefixByFirstToken, first, prefixHit);
        for (const form of italianSingularPluralForms(first)) {
          const nf = normalizeSearchText(form);
          if (nf) pushIndexMap(prefixByFirstToken, nf, prefixHit);
        }
      }
      continue;
    }

    const names = catalogRowDisplayNames(id, food);
    if (!names.length) continue;
    const containsRow = { id, food, names };

    for (const candidate of names) {
      const norm = normalizeSearchText(candidate);
      if (!norm) continue;
      const words = norm.split(/\s+/).filter(Boolean);
      const display = String(food.italianName || food.desc || food.name || candidate).trim();
      const simple = isSimpleFoodName(display) || isSimpleFoodName(candidate);

      for (const token of words) {
        if (token.length < 4 || STOP_WORDS.has(token)) continue;
        pushIndexMap(containsByToken, token, containsRow);
        for (const form of italianSingularPluralForms(token)) {
          const nf = normalizeSearchText(form);
          if (nf && nf.length >= 4) pushIndexMap(containsByToken, nf, containsRow);
        }
      }

      if (!simple) continue;

      const exactHit = hitFromRow(id, food, display, FOOD_MATCH_QUALITY.EXACT);
      pushIndexMap(exactByNorm, norm, exactHit);
      if (words.length === 1) {
        for (const form of italianSingularPluralForms(words[0])) {
          const nf = normalizeSearchText(form);
          if (nf) pushIndexMap(exactByNorm, nf, exactHit);
        }
      }

      const first = words[0];
      if (first) {
        const prefixHit = hitFromRow(id, food, display, FOOD_MATCH_QUALITY.PREFIX);
        pushIndexMap(prefixByFirstToken, first, prefixHit);
        for (const form of italianSingularPluralForms(first)) {
          const nf = normalizeSearchText(form);
          if (nf) pushIndexMap(prefixByFirstToken, nf, prefixHit);
        }
      }
    }
  }
}

/**
 * Indici exact + prefix da un catalogo già caricato (id → row, come foodLoader).
 * @param {Record<string, object>|null|undefined} catalog
 * @param {{ forContains?: boolean, label?: string }} [opts]
 */
export function buildAuditLookupIndex(catalog, opts = {}) {
  /** @type {Map<string, object[]>} */
  const exactByNorm = new Map();
  /** @type {Map<string, object[]>} */
  const prefixByFirstToken = new Map();
  /** @type {Map<string, Array<{ id: string, food: object, names: string[] }>>} */
  const containsByToken = new Map();
  const entries = Object.entries(catalog || {});
  indexCatalogEntries(
    entries,
    exactByNorm,
    prefixByFirstToken,
    containsByToken,
    Boolean(opts.forContains),
  );
  return {
    label: opts.label || 'catalog',
    size: entries.length,
    exactByNorm,
    prefixByFirstToken,
    containsByToken: opts.forContains ? containsByToken : new Map(),
  };
}

/**
 * Come buildAuditLookupIndex ma cede il controllo ogni `chunkSize` voci (OFF).
 * @param {Record<string, object>|null|undefined} catalog
 * @param {{ forContains?: boolean, label?: string, chunkSize?: number, signal?: AbortSignal }} [opts]
 */
export async function buildAuditLookupIndexAsync(catalog, opts = {}) {
  /** @type {Map<string, object[]>} */
  const exactByNorm = new Map();
  /** @type {Map<string, object[]>} */
  const prefixByFirstToken = new Map();
  /** @type {Map<string, Array<{ id: string, food: object, names: string[] }>>} */
  const containsByToken = new Map();
  const entries = Object.entries(catalog || {});
  const chunkSize = Math.max(500, Math.floor(Number(opts.chunkSize) || 6000));
  for (let start = 0; start < entries.length; start += chunkSize) {
    if (opts.signal?.aborted) {
      const err = new Error('cancelled');
      err.name = 'AbortError';
      throw err;
    }
    const slice = entries.slice(start, start + chunkSize);
    indexCatalogEntries(
      slice,
      exactByNorm,
      prefixByFirstToken,
      containsByToken,
      Boolean(opts.forContains),
    );
    if (start + chunkSize < entries.length) {
      // eslint-disable-next-line no-await-in-loop
      await yieldToBrowser();
    }
  }
  return {
    label: opts.label || 'catalog',
    size: entries.length,
    exactByNorm,
    prefixByFirstToken,
    containsByToken: opts.forContains ? containsByToken : new Map(),
  };
}

function collectBundleCatalogs(bundle = {}) {
  const smallCatalogs = [
    ...(Array.isArray(bundle.small) ? bundle.small : []),
    bundle.kentuItDb,
    bundle.globalDb,
    bundle.usdaDb,
    bundle.personalDb,
  ].filter((c) => c && typeof c === 'object' && Object.keys(c).length > 0);

  const heavyCatalogs = [
    ...(Array.isArray(bundle.heavy) ? bundle.heavy : []),
    bundle.offDb,
  ].filter((c) => c && typeof c === 'object' && Object.keys(c).length > 0);

  return { smallCatalogs, heavyCatalogs };
}

/**
 * @param {object} bundle
 * @returns {object}
 */
export function buildAuditCatalogBundle(bundle = {}) {
  const { smallCatalogs, heavyCatalogs } = collectBundleCatalogs(bundle);
  const smallIndexes = smallCatalogs.map((cat, i) => (
    buildAuditLookupIndex(cat, { forContains: true, label: `small_${i}` })
  ));
  const heavyIndexes = heavyCatalogs.map((cat, i) => (
    buildAuditLookupIndex(cat, { forContains: false, label: `heavy_${i}` })
  ));

  return {
    smallIndexes,
    heavyIndexes,
    offReady: Boolean(bundle.offReady),
    offSkipped: Boolean(bundle.offSkipped),
    smallSize: smallIndexes.reduce((n, idx) => n + idx.size, 0),
    heavySize: heavyIndexes.reduce((n, idx) => n + idx.size, 0),
    /** Cache parola/sourceText normalizzata → alternativa | null */
    altCache: new Map(),
  };
}

/**
 * Bundle async: OFF indicizzato a blocchi senza congelare l'UI.
 * @param {object} bundle
 * @param {{ signal?: AbortSignal, onProgress?: Function }} [opts]
 */
export async function buildAuditCatalogBundleAsync(bundle = {}, opts = {}) {
  const { smallCatalogs, heavyCatalogs } = collectBundleCatalogs(bundle);
  const smallIndexes = smallCatalogs.map((cat, i) => (
    buildAuditLookupIndex(cat, { forContains: true, label: `small_${i}` })
  ));
  /** @type {object[]} */
  const heavyIndexes = [];
  for (let i = 0; i < heavyCatalogs.length; i += 1) {
    opts.onProgress?.({ phase: 'index_heavy', index: i, total: heavyCatalogs.length });
    // eslint-disable-next-line no-await-in-loop
    const idx = await buildAuditLookupIndexAsync(heavyCatalogs[i], {
      forContains: false,
      label: `heavy_${i}`,
      signal: opts.signal,
    });
    heavyIndexes.push(idx);
  }
  return {
    smallIndexes,
    heavyIndexes,
    offReady: Boolean(bundle.offReady),
    offSkipped: Boolean(bundle.offSkipped),
    smallSize: smallIndexes.reduce((n, idx) => n + idx.size, 0),
    heavySize: heavyIndexes.reduce((n, idx) => n + idx.size, 0),
    altCache: new Map(),
  };
}

function pickBestHit(hits, word, qualities) {
  if (!hits?.length) return null;
  const allowed = new Set(qualities);
  /** @type {object|null} */
  let best = null;
  let bestRank = Infinity;
  for (const hit of hits) {
    if (!hit || !isSimpleFoodName(hit.name)) continue;
    const quality = hit.matchQuality || classifyFoodMatchQuality(hit.name, word);
    if (!allowed.has(quality)) continue;
    const rank = foodMatchQualityRank(quality);
    if (rank < bestRank) {
      bestRank = rank;
      best = { ...hit, matchQuality: quality };
    }
  }
  return best;
}

/**
 * Exact > prefix via indici; contains solo sugli indici small.
 * @param {string} word
 * @param {ReturnType<typeof buildAuditCatalogBundle>} ctx
 */
export function findSimpleAlternativeIndexed(word, ctx) {
  const q = String(word || '').trim();
  if (!q || !ctx) return null;
  const cacheKey = normalizeSearchText(q);
  if (!cacheKey) return null;
  if (ctx.altCache.has(cacheKey)) return ctx.altCache.get(cacheKey);

  const forms = exactQueryNormForms(q);
  const allIndexes = [...(ctx.smallIndexes || []), ...(ctx.heavyIndexes || [])];

  for (const form of forms) {
    for (const index of allIndexes) {
      const hit = pickBestHit(index.exactByNorm.get(form), q, [FOOD_MATCH_QUALITY.EXACT]);
      if (hit) {
        ctx.altCache.set(cacheKey, hit);
        return hit;
      }
    }
  }

  const firstForms = new Set();
  const qWords = normalizeSearchText(q).split(/\s+/).filter(Boolean);
  if (qWords[0]) {
    firstForms.add(qWords[0]);
    for (const form of italianSingularPluralForms(qWords[0])) {
      const nf = normalizeSearchText(form);
      if (nf) firstForms.add(nf);
    }
  }
  for (const form of firstForms) {
    for (const index of allIndexes) {
      const candidates = index.prefixByFirstToken.get(form) || [];
      const filtered = candidates.filter((hit) => {
        const quality = classifyFoodMatchQuality(hit.name, q);
        return quality === FOOD_MATCH_QUALITY.PREFIX || quality === FOOD_MATCH_QUALITY.EXACT;
      });
      const hit = pickBestHit(
        filtered.map((h) => ({ ...h, matchQuality: FOOD_MATCH_QUALITY.PREFIX })),
        q,
        [FOOD_MATCH_QUALITY.PREFIX, FOOD_MATCH_QUALITY.EXACT],
      );
      if (hit) {
        ctx.altCache.set(cacheKey, hit);
        return hit;
      }
    }
  }

  // Contains: solo cataloghi piccoli, via indice token (mai OFF).
  const tokenForms = new Set();
  for (const form of forms) {
    for (const token of form.split(/\s+/).filter(Boolean)) {
      if (token.length >= 4 && !STOP_WORDS.has(token)) tokenForms.add(token);
    }
  }
  for (const index of ctx.smallIndexes || []) {
    /** @type {Set<object>} */
    const seenRows = new Set();
    for (const token of tokenForms) {
      const rows = index.containsByToken?.get(token) || [];
      for (const row of rows) {
        if (seenRows.has(row)) continue;
        seenRows.add(row);
        let quality = null;
        let display = null;
        for (const candidate of row.names) {
          const qlt = classifyFoodMatchQuality(candidate, q);
          if (qlt !== FOOD_MATCH_QUALITY.CONTAINS) continue;
          if (!quality || foodMatchQualityRank(qlt) < foodMatchQualityRank(quality)) {
            quality = qlt;
            display = String(row.food.italianName || row.food.desc || row.food.name || candidate).trim();
          }
        }
        if (!quality || !display || !isSimpleFoodName(display)) continue;
        const hit = hitFromRow(row.id, row.food, display, FOOD_MATCH_QUALITY.CONTAINS);
        ctx.altCache.set(cacheKey, hit);
        return hit;
      }
    }
  }

  ctx.altCache.set(cacheKey, null);
  return null;
}

/**
 * Compat: unisce cataloghi in bundle small (contains consentito).
 * Preferire findSimpleAlternativeIndexed con bundle.
 * @param {string} word
 * @param {Record<string, object>} catalog
 */
export function findSimpleAlternative(word, catalog) {
  const ctx = buildAuditCatalogBundle({ small: [catalog || {}] });
  return findSimpleAlternativeIndexed(word, ctx);
}

/**
 * @param {number|null|undefined} hour
 * @returns {string|null}
 */
export function formatAuditClockHour(hour) {
  if (hour == null || !Number.isFinite(hour)) return null;
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * @param {object|null|undefined} fullHistory
 * @returns {Array<{ date: string, meal: string, mealTime: string|null, item: object }>}
 */
export function iterDiaryItemsForCompoundAudit(fullHistory) {
  /** @type {Array<{ date: string, meal: string, mealTime: string|null, item: object }>} */
  const out = [];
  for (const [key, node] of Object.entries(fullHistory || {})) {
    if (!node || typeof node !== 'object') continue;
    const date = String(key).replace(/^trackerStorico_/, '');
    if (!isIsoDateString(date)) continue;
    const mealTimes = node.mealTimes && typeof node.mealTimes === 'object' ? node.mealTimes : null;
    const foods = expandTrackerLogEntries(node.log).filter((entry) => (
      entry && (entry.type === 'food' || entry.type === 'recipe' || entry.type == null)
      && (entry.foodName || entry.desc || entry.name || entry.label)
    ));
    for (const item of foods) {
      const mealLabel = String(item?.mealType || item?.meal || item?.desc || 'pasto').trim();
      const clock = resolveFoodClockHourDetailed(item, mealTimes);
      out.push({
        date,
        meal: mealLabel,
        mealTime: formatAuditClockHour(clock.hour),
        item,
      });
    }
  }
  return out;
}

/**
 * Restringe lo storico agli ultimi `days` giorni fino a `endIso` (incluso).
 * @param {object|null|undefined} fullHistory
 * @param {string} endIso
 * @param {number} days
 */
export function sliceHistoryLastDays(fullHistory, endIso, days) {
  const end = isIsoDateString(endIso) ? endIso : null;
  const n = Math.max(1, Math.floor(Number(days) || 90));
  if (!end || !fullHistory || typeof fullHistory !== 'object') return {};
  /** @type {Record<string, object>} */
  const out = {};
  for (let i = 0; i < n; i += 1) {
    const date = addCalendarDays(end, -i);
    const keyed = fullHistory[`trackerStorico_${date}`];
    const bare = fullHistory[date];
    if (keyed && typeof keyed === 'object') out[`trackerStorico_${date}`] = keyed;
    else if (bare && typeof bare === 'object') out[`trackerStorico_${date}`] = bare;
  }
  return out;
}

/**
 * @param {object|null|undefined} fullHistory
 */
export function collectCompoundAuditCandidates(fullHistory) {
  const rows = iterDiaryItemsForCompoundAudit(fullHistory);
  const daySet = new Set(rows.map((r) => r.date));
  const assisted = [];
  const candidates = [];
  for (const row of rows) {
    if (!isAssistedEntry(row.item)) continue;
    assisted.push(row);
    const recorded = String(row.item.foodName || row.item.desc || row.item.name || row.item.label || '').trim();
    if (!recorded || !isCompoundDishName(recorded)) continue;
    if (itemKcalPer100g(row.item) == null) continue;
    candidates.push({ ...row, recorded });
  }
  return {
    days: daySet.size,
    itemsRead: rows.length,
    assistedCount: assisted.length,
    candidates,
  };
}

function auditLog(enabled, phase, detail = {}) {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.info(AUDIT_LOG_PREFIX, phase, detail);
}

function scoreCandidateRow(row, simple, ratio, matchedWord = null) {
  const { date, meal, mealTime, item, recorded } = row;
  if (matchedWord && isGenericMatchWord(matchedWord)) return null;
  const recordedDensity = itemKcalPer100g(item);
  if (recordedDensity == null || !simple) return null;
  const simpleDensity = catalogKcalPer100g(simple.row || simple);
  if (simpleDensity == null || simpleDensity <= 0) return null;
  if (recordedDensity / simpleDensity <= ratio) return null;

  const gramsRaw = Number(item.grams ?? item.qta ?? item.weight ?? item.qty);
  const grams = Number.isFinite(gramsRaw) && gramsRaw > 0 ? Math.round(gramsRaw * 10) / 10 : null;
  const recordedPortionKcalRaw = Number(item.kcal ?? item.cal);
  const recordedPortionKcal = Number.isFinite(recordedPortionKcalRaw) && recordedPortionKcalRaw > 0
    ? Math.round(recordedPortionKcalRaw)
    : null;
  const estimatedAltKcal = grams != null
    ? Math.round((simpleDensity / 100) * grams)
    : null;
  const kcalDiff = recordedPortionKcal != null && estimatedAltKcal != null
    ? recordedPortionKcal - estimatedAltKcal
    : null;
  const sourceText = readAuditSourceText(item);
  const sourcePointsToSimple = sourceTextPointsToSimple(sourceText, simple.name, recorded);

  return {
    date,
    meal,
    mealTime: mealTime || null,
    recorded,
    entrySource: item.entrySource || null,
    sourceText,
    sourcePointsToSimple,
    matchedWord: matchedWord || null,
    recordedKcalPer100g: Math.round(recordedDensity * 10) / 10,
    simpleAlternative: simple.name,
    simpleKcalPer100g: Math.round(simpleDensity * 10) / 10,
    densityRatio: Math.round((recordedDensity / simpleDensity) * 100) / 100,
    kcalDeltaPer100g: Math.round(recordedDensity - simpleDensity),
    foodDbKey: item.foodDbKey || item.matchedKey || null,
    grams,
    recordedPortionKcal,
    estimatedAltKcal,
    kcalDiff,
  };
}

function lookupWordsForItem(item, recorded) {
  const words = candidateWordsFromDish(recorded);
  const source = readAuditSourceText(item);
  if (source) {
    const srcWords = candidateWordsFromDish(source);
    for (const w of srcWords) {
      if (!words.includes(w)) words.unshift(w);
    }
    const srcNorm = normalizeSearchText(source);
    if (
      srcNorm
      && srcNorm.split(/\s+/).length === 1
      && !isGenericMatchWord(srcNorm)
      && !words.includes(srcNorm)
    ) {
      words.unshift(srcNorm);
    }
  }
  return words.filter((w) => !isGenericMatchWord(w));
}

/** Ordina sospetti: prima source→semplice, poi densità, poi data. */
function preferSuspect(a, b) {
  if (Boolean(a?.sourcePointsToSimple) !== Boolean(b?.sourcePointsToSimple)) {
    return a?.sourcePointsToSimple ? -1 : 1;
  }
  const dr = (b?.densityRatio || 0) - (a?.densityRatio || 0);
  if (dr) return dr;
  if (a?.date !== b?.date) return a?.date < b?.date ? 1 : -1;
  const ta = String(a?.mealTime || '');
  const tb = String(b?.mealTime || '');
  if (ta !== tb) return ta < tb ? 1 : -1;
  return 0;
}

/**
 * Raggruppa per nome piatto, conteggio occorrenze; in cima i casi
 * in cui il testo originale punta all'alimento semplice.
 * @param {object[]} suspects
 * @returns {Array<{
 *   recorded: string,
 *   count: number,
 *   sourcePointsToSimple: boolean,
 *   occurrences: object[],
 * }>}
 */
export function groupCompoundAuditSuspects(suspects) {
  /** @type {Map<string, { recorded: string, count: number, sourcePointsToSimple: boolean, occurrences: object[] }>} */
  const map = new Map();
  for (const s of Array.isArray(suspects) ? suspects : []) {
    const key = normalizeSearchText(s?.recorded) || String(s?.recorded || '').trim();
    if (!key) continue;
    let group = map.get(key);
    if (!group) {
      group = {
        recorded: String(s.recorded || '').trim(),
        count: 0,
        sourcePointsToSimple: false,
        occurrences: [],
      };
      map.set(key, group);
    }
    group.occurrences.push(s);
    group.count += 1;
    if (s.sourcePointsToSimple) group.sourcePointsToSimple = true;
  }

  for (const group of map.values()) {
    group.occurrences.sort(preferSuspect);
  }

  return [...map.values()].sort((a, b) => {
    if (a.sourcePointsToSimple !== b.sourcePointsToSimple) {
      return a.sourcePointsToSimple ? -1 : 1;
    }
    if (b.count !== a.count) return b.count - a.count;
    return String(a.recorded).localeCompare(String(b.recorded), 'it');
  });
}

/**
 * Motore async a blocchi (non blocca l'UI).
 * @param {object|null|undefined} fullHistory
 * @param {object} catalogBundle  buildAuditCatalogBundle(...) oppure { small, heavy, offReady }
 * @param {{
 *   ratio?: number,
 *   chunkSize?: number,
 *   signal?: AbortSignal,
 *   onProgress?: (p: object) => void,
 *   log?: boolean,
 *   prebuiltCtx?: object,
 * }} [opts]
 */
export async function auditCompoundFoodMatchesAsync(fullHistory, catalogBundle, opts = {}) {
  const ratio = Number(opts.ratio) > 0 ? Number(opts.ratio) : ENERGY_DENSITY_CONFIRM_RATIO;
  const chunkSize = Math.max(1, Math.floor(Number(opts.chunkSize) || AUDIT_CHUNK_SIZE));
  const log = opts.log !== false;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const tFilter0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const collected = collectCompoundAuditCandidates(fullHistory);
  const filterMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tFilter0);
  auditLog(log, 'filter', {
    ms: filterMs,
    days: collected.days,
    itemsRead: collected.itemsRead,
    assisted: collected.assistedCount,
    candidates: collected.candidates.length,
    syncMainThread: true,
  });

  const tIndex0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let ctx = opts.prebuiltCtx || null;
  if (!ctx) {
    if (catalogBundle?.smallIndexes) {
      ctx = catalogBundle;
    } else {
      opts.onProgress?.({ phase: 'index', done: 0, total: 1 });
      // eslint-disable-next-line no-await-in-loop
      ctx = await buildAuditCatalogBundleAsync(catalogBundle || {}, {
        signal: opts.signal,
        onProgress: opts.onProgress,
      });
    }
  }
  const indexMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tIndex0);
  auditLog(log, 'index', {
    ms: indexMs,
    smallSize: ctx.smallSize,
    heavySize: ctx.heavySize,
    offReady: ctx.offReady,
    offSkipped: ctx.offSkipped,
    syncMainThread: ctx.heavySize > 0 ? 'chunked' : true,
  });

  /** @type {object[]} */
  const suspects = [];
  const candidates = collected.candidates;
  const total = candidates.length;
  const tMatch0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  for (let start = 0; start < total; start += chunkSize) {
    if (opts.signal?.aborted) {
      const err = new Error('cancelled');
      err.name = 'AbortError';
      throw err;
    }
    const end = Math.min(start + chunkSize, total);
    for (let i = start; i < end; i += 1) {
      const row = candidates[i];
      const words = lookupWordsForItem(row.item, row.recorded);
      /** @type {object|null} */
      let best = null;
      for (const word of words) {
        const simple = findSimpleAlternativeIndexed(word, ctx);
        const scored = scoreCandidateRow(row, simple, ratio, word);
        if (!scored) continue;
        if (!best || preferSuspect(scored, best) < 0) best = scored;
      }
      if (best) suspects.push(best);
    }
    const done = end;
    opts.onProgress?.({
      done,
      total,
      suspects: suspects.length,
      phase: 'match',
    });
    if (end < total) {
      // eslint-disable-next-line no-await-in-loop
      await yieldToBrowser();
    }
  }

  const matchMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tMatch0);
  auditLog(log, 'match', {
    ms: matchMs,
    analyzed: total,
    uniqueAltCache: ctx.altCache.size,
    syncMainThread: false,
    chunked: true,
    chunkSize,
  });

  suspects.sort(preferSuspect);

  const totalMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  const timings = {
    filterMs,
    indexMs,
    matchMs,
    totalMs,
    days: collected.days,
    itemsRead: collected.itemsRead,
    assistedCount: collected.assistedCount,
    analyzed: total,
    suspects: suspects.length,
    altCacheSize: ctx.altCache.size,
  };
  auditLog(log, 'total', timings);
  return { suspects, timings, ctx };
}

/**
 * Sync wrapper (CLI / test). Internamente usa gli indici; non cedere al browser.
 * @param {object|null|undefined} fullHistory
 * @param {Array<Record<string, object>|null|undefined>|Record<string, object>|object} catalogs
 * @param {number} [ratio]
 * @returns {object[]}
 */
export function auditCompoundFoodMatches(fullHistory, catalogs, ratio = ENERGY_DENSITY_CONFIRM_RATIO) {
  let bundle;
  if (catalogs && typeof catalogs === 'object' && !Array.isArray(catalogs)
    && (catalogs.small || catalogs.heavy || catalogs.kentuItDb || catalogs.offDb || catalogs.smallIndexes)) {
    bundle = catalogs.smallIndexes ? catalogs : buildAuditCatalogBundle(catalogs);
  } else {
    const list = Array.isArray(catalogs) ? catalogs : [catalogs];
    bundle = buildAuditCatalogBundle({ small: list.filter(Boolean) });
  }

  const collected = collectCompoundAuditCandidates(fullHistory);
  const ctx = bundle.smallIndexes ? bundle : buildAuditCatalogBundle(bundle);
  /** @type {object[]} */
  const suspects = [];
  for (const row of collected.candidates) {
    const words = lookupWordsForItem(row.item, row.recorded);
    /** @type {object|null} */
    let best = null;
    for (const word of words) {
      const simple = findSimpleAlternativeIndexed(word, ctx);
      const scored = scoreCandidateRow(row, simple, ratio, word);
      if (!scored) continue;
      if (!best || preferSuspect(scored, best) < 0) best = scored;
    }
    if (best) suspects.push(best);
  }
  suspects.sort(preferSuspect);
  return suspects;
}

/**
 * @param {object[]} suspects
 */
export function summarizeCompoundFoodAudit(suspects) {
  const list = Array.isArray(suspects) ? suspects : [];
  let sumKcalDiff = 0;
  let diffCount = 0;
  for (const s of list) {
    if (Number.isFinite(Number(s?.kcalDiff))) {
      sumKcalDiff += Number(s.kcalDiff);
      diffCount += 1;
    }
  }
  return {
    suspectCount: list.length,
    sumKcalDiff: Math.round(sumKcalDiff),
    diffCount,
  };
}

/**
 * Testo semplice per clipboard (raggruppato per piatto).
 * @param {object[]} suspects
 * @param {{ suspectCount?: number, sumKcalDiff?: number }} [summary]
 */
export function formatCompoundFoodAuditPlainText(suspects, summary) {
  const list = Array.isArray(suspects) ? suspects : [];
  const sm = summary || summarizeCompoundFoodAudit(list);
  const groups = groupCompoundAuditSuspects(list);
  const lines = [
    `Alimenti sospetti: ${sm.suspectCount} (${groups.length} piatti)`,
    `Somma differenze kcal: ${sm.sumKcalDiff}`,
    '',
  ];
  for (const group of groups) {
    const flag = group.sourcePointsToSimple ? ' [testo → semplice]' : '';
    lines.push(`${group.recorded} ×${group.count}${flag}`);
    for (const s of group.occurrences) {
      const timePart = s.mealTime ? ` ${s.mealTime}` : '';
      const grams = s.grams != null ? `${s.grams} g` : '—';
      const recKcal = s.recordedPortionKcal != null ? `${s.recordedPortionKcal}` : '—';
      const altKcal = s.estimatedAltKcal != null ? `${s.estimatedAltKcal}` : '—';
      const diff = s.kcalDiff != null ? `${s.kcalDiff > 0 ? '+' : ''}${s.kcalDiff}` : '—';
      const wrote = s.sourceText ? `Avevi scritto: ${s.sourceText}` : null;
      lines.push(
        [
          `  ${s.date}`,
          `${s.meal}${timePart}`,
          `→ ${s.simpleAlternative}`,
          grams,
          `kcal ${recKcal}`,
          `alt ${altKcal}`,
          `Δ ${diff}`,
          wrote,
        ].filter(Boolean).join(' | '),
      );
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
