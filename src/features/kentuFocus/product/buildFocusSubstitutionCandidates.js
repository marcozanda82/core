/**
 * Candidati di sostituzione: alimenti meno lavorati già nel diario (ultimi N giorni),
 * stessa occasione d'uso (dolce / snack / bevanda), non NOVA 4.
 *
 * Occasione: (1) categoria catalogo CREA/OFF, (2) whitelist esplicita breve, (3) unknown.
 * unknown non si propone come sostituto specifico.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { collectDayLogForNutrition } from '../normalize/normalizeFoodEvents.js';
import {
  resolveFoodItemClassification,
  resolveOffCatalogStatus,
  readNovaGroup,
  FOOD_QUALITY_PROVENANCE,
} from './buildFocusFoodQualityBlock.js';

/**
 * NOVA effettivo: preferisci catalogo documentato se il diario ha 0/placeholder.
 * @param {object} classified
 * @returns {number|null}
 */
function effectiveNovaGroup(classified) {
  const fromCatalog = readNovaGroup(classified?.catalogRow?.semanticTags)
    ?? (Number.isFinite(Number(classified?.catalogRow?.nova_group))
      ? Number(classified.catalogRow.nova_group)
      : null)
    ?? (Number.isFinite(Number(classified?.catalogRow?.novaGroup))
      ? Number(classified.catalogRow.novaGroup)
      : null);
  if (fromCatalog != null) return fromCatalog;
  const n = classified?.novaGroup;
  return n != null && Number.isFinite(Number(n)) ? Number(n) : null;
}

/** Occasioni canoniche (IT prodotto). */
export const FOCUS_USE_OCCASION = Object.freeze({
  dolce: 'dolce',
  snack: 'snack',
  bevanda: 'bevanda',
  unknown: 'unknown',
});

/** Etichette generiche se manca un candidato stesso-occasione nel diario. */
export const FOCUS_GENERIC_OCCASION_LABEL = Object.freeze({
  dolce: 'frutta fresca',
  snack: 'frutta secca',
  bevanda: 'acqua o tè',
});

/** Marchi / proper noun da lasciare capitalizzati a metà frase. */
const BRAND_NAME_RE = /^(duchessa|excellence|lindt|nutella|milka|oreo|ferrero|kind|alpro|oatly|granola)$/i;

/**
 * @param {object|null|undefined} row
 * @returns {string}
 */
function categoryBlobFromRow(row) {
  if (!row || typeof row !== 'object') return '';
  const parts = [];
  const push = (v) => {
    const s = String(v || '').trim().toLowerCase();
    if (s) parts.push(s);
  };
  if (Array.isArray(row.categories_tags)) {
    for (const t of row.categories_tags) push(t);
  }
  if (typeof row.categories === 'string') {
    for (const part of row.categories.split(',')) push(part);
  }
  push(row.category);
  push(row.food_group);
  push(row.foodGroup);
  push(row.group);
  push(row.gruppo);
  push(row.categoria);
  push(row.crea_group);
  push(row.creaGroup);
  return parts.join(' | ');
}

/**
 * Occasione da categorie CREA/OFF (prima della whitelist).
 * @param {object|null|undefined} catalogRow
 * @returns {'dolce'|'snack'|'bevanda'|null}
 */
export function occasionFromCatalogCategories(catalogRow) {
  const tokens = categoryBlobFromRow(catalogRow);
  if (!tokens) return null;

  if (/\b(beverages?|bevande|drinks?|waters?|teas?|coffees?|milks?|succhi|juices?)\b/i.test(tokens)) {
    return FOCUS_USE_OCCASION.bevanda;
  }
  if (/\b(nuts?|tree-nuts|frutta.?secca|seeds?|semi|oléagineux|oilseeds)\b/i.test(tokens)) {
    return FOCUS_USE_OCCASION.snack;
  }
  // Frutta fresca (non succhi): dolce/spuntino dolce
  if (
    /\b(fresh-fruits?|fruits-and-products|frutta)\b/i.test(tokens)
    && !/\b(juices?|succhi|nectars?|dried|secca|secchi)\b/i.test(tokens)
  ) {
    return FOCUS_USE_OCCASION.dolce;
  }
  if (/\b(yogurts?|yogurt|desserts?|dolci|sweets?|dark-chocolates?|chocolates?)\b/i.test(tokens)
    && !/\b(ice-creams?|gelati|biscuits?|cookies?|cakes?)\b/i.test(tokens)) {
    // cioccolato / yogurt / dessert semplici; gelati/biscotti restano fuori (spesso UP)
    return FOCUS_USE_OCCASION.dolce;
  }
  if (/\b(yogurts?|yogurt)\b/i.test(tokens)) {
    return FOCUS_USE_OCCASION.dolce;
  }
  return null;
}

/**
 * Whitelist esplicita e breve (nome intero o forma tipica), non substring generiche tipo «frutta».
 * @param {string} name
 * @returns {'dolce'|'snack'|'bevanda'|null}
 */
export function occasionFromWhitelist(name) {
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n) return null;

  // Dolce: frutta fresca intera (nome = frutto, eventualmente plurale)
  if (/^(mela|mele|banana|banane|pera|pere|kiwi|arancia|arance|fragola|fragole|uva|pesca|pesche|albicocca|albicocche|ciliegia|ciliegie|melone|anguria|ananas|mango|pompelmo|pompelmi)$/i.test(n)) {
    return FOCUS_USE_OCCASION.dolce;
  }
  // Yogurt bianco / naturale / greco plain
  if (/^yogurt(\s+(bianco|naturale|greco|plain))?$/i.test(n)) {
    return FOCUS_USE_OCCASION.dolce;
  }
  // Cioccolato fondente ≥70% (cacao dichiarato)
  if (
    /\b(cioccolat\w*|chocolate|cacao|excellence|lindt)\b/i.test(n)
    && /\b(7[0-9]|8[0-9]|9[0-9]|100)\s*%/.test(n)
  ) {
    return FOCUS_USE_OCCASION.dolce;
  }
  if (/\bcioccolato\s+fondente\b/i.test(n) && !/\b(6[0-9]|[1-5]?[0-9])\s*%/.test(n)) {
    return FOCUS_USE_OCCASION.dolce;
  }

  // Snack: frutta secca / semi
  if (/^(mandorla|mandorle|noce|noci|nocciola|nocciole|anacardi|pistacchi|pinoli|noci del brasile|semi di zucca|semi di girasole|semi di chia|semi di lino)$/i.test(n)) {
    return FOCUS_USE_OCCASION.snack;
  }

  // Bevanda
  if (/^(acqua|th[eé]|t[eé]|caff[eé]|latte|kefir)$/i.test(n)) {
    return FOCUS_USE_OCCASION.bevanda;
  }

  return null;
}

/**
 * Nome alimento per testo a metà frase: minuscolo, salvo marchi.
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function formatFoodNameForMidSentence(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  return raw.split(/\s+/).map((token) => {
    if (!token) return token;
    if (BRAND_NAME_RE.test(token)) {
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    }
    if (/\d/.test(token) || /^[A-Z0-9.%+-]+$/.test(token)) return token;
    return token.toLowerCase();
  }).join(' ');
}

/**
 * @param {object} item
 * @param {object|null|undefined} catalogs
 * @param {object|null|undefined} offStatus
 * @returns {{
 *   occasion: 'dolce'|'snack'|'bevanda'|'unknown',
 *   source: 'catalog'|'whitelist'|'unknown',
 *   novaGroup: number|null,
 *   classified: object,
 * }}
 */
export function resolveUseOccasion(item, catalogs = null, offStatus = null) {
  const name = String(item?.name || item?.foodName || item?.label || item?.desc || '').trim();
  const status = offStatus || resolveOffCatalogStatus(catalogs);
  const classified = resolveFoodItemClassification(item, catalogs, status);
  const novaGroup = effectiveNovaGroup(classified);

  const fromCat = occasionFromCatalogCategories(classified.catalogRow);
  if (fromCat) {
    return {
      occasion: fromCat,
      source: 'catalog',
      novaGroup,
      classified,
    };
  }

  const fromWhite = occasionFromWhitelist(name);
  if (fromWhite) {
    return {
      occasion: fromWhite,
      source: 'whitelist',
      novaGroup,
      classified,
    };
  }

  return {
    occasion: FOCUS_USE_OCCASION.unknown,
    source: 'unknown',
    novaGroup,
    classified,
  };
}

/** @deprecated Usare resolveUseOccasion. */
export function inferUseOccasion(item, _mealType, catalogs = null, offStatus = null) {
  return resolveUseOccasion(item, catalogs, offStatus).occasion;
}

/**
 * Sostituto stesso-occasione, oppure categoria generica (mai cross-occasion).
 * @param {{ byOccasion?: object, candidates?: object[] }|null|undefined} block
 * @param {'dolce'|'snack'|'bevanda'|string} targetOccasion
 * @returns {{ kind: 'food', candidate: object }|{ kind: 'generic', label: string, occasion: string }|null}
 */
export function pickPreferredSubstitution(block, targetOccasion = 'dolce') {
  const target = String(targetOccasion || 'dolce');
  const by = block?.byOccasion || {};
  const list = Array.isArray(by[target]) ? by[target] : [];
  const usable = list.filter((c) => c && c.occasion === target && c.occasion !== 'unknown');
  if (usable[0]) {
    return { kind: 'food', candidate: usable[0], occasion: target };
  }
  const label = FOCUS_GENERIC_OCCASION_LABEL[target];
  if (label) {
    return { kind: 'generic', label, occasion: target };
  }
  return null;
}

/**
 * @param {{
 *   fullHistory: object,
 *   analysisDate: string,
 *   catalogs?: object|null,
 *   lookbackDays?: number,
 *   excludeNames?: string[],
 * }} input
 */
export function buildFocusSubstitutionCandidates(input) {
  const fullHistory = input?.fullHistory && typeof input.fullHistory === 'object'
    ? input.fullHistory
    : null;
  const analysisDate = String(input?.analysisDate || '').trim();
  const lookbackDays = Math.max(1, Number(input.lookbackDays) || 30);
  const catalogs = input.catalogs || null;
  const offStatus = resolveOffCatalogStatus(catalogs);
  const exclude = new Set(
    (input.excludeNames || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean),
  );

  if (!fullHistory || !isIsoDateString(analysisDate)) {
    return {
      available: false,
      reason: 'missing_history_or_date',
      lookbackDays,
      byOccasion: { dolce: [], snack: [], bevanda: [], unknown: [] },
      candidates: [],
      proposable: [],
      genericFallback: { ...FOCUS_GENERIC_OCCASION_LABEL },
    };
  }

  /** @type {Map<string, { name: string, occasion: string, occasionSource: string, grams: number[], occasions: number, novaGroup: number|null, provenance: string|null }>} */
  const map = new Map();
  /** Nomi esclusi se in qualsiasi giorno della finestra risultano NOVA ≥ 4. */
  const bannedNova4 = new Set();

  for (let i = 0; i < lookbackDays; i += 1) {
    const date = addCalendarDays(analysisDate, -i);
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) continue;
    const foods = collectDayLogForNutrition(node).filter(
      (e) => e && (e.type === 'food' || e.type === 'recipe' || !e.type),
    );
    for (const item of foods) {
      const name = String(item.name || item.foodName || item.label || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (exclude.has(key) || bannedNova4.has(key)) continue;

      const resolved = resolveUseOccasion(item, catalogs, offStatus);
      if (resolved.novaGroup != null && resolved.novaGroup >= 4) {
        bannedNova4.add(key);
        // Rimuovi eventuali occorrenze già accumulate senza NOVA documentato.
        for (const mapKey of [...map.keys()]) {
          if (mapKey.endsWith(`::${key}`)) map.delete(mapKey);
        }
        continue;
      }

      const occasion = resolved.occasion;
      const grams = Number(item.grams ?? item.g ?? item.qty);
      let row = map.get(`${occasion}::${key}`);
      if (!row) {
        row = {
          name,
          occasion,
          occasionSource: resolved.source,
          grams: [],
          occasions: 0,
          novaGroup: resolved.novaGroup,
          provenance: resolved.classified.provenance,
        };
        map.set(`${occasion}::${key}`, row);
      }
      row.occasions += 1;
      if (Number.isFinite(grams) && grams > 0) row.grams.push(grams);
      if (row.novaGroup == null && resolved.novaGroup != null) row.novaGroup = resolved.novaGroup;
    }
  }

  /** @type {object[]} */
  const candidates = [];
  for (const row of map.values()) {
    if (row.occasions < 1) continue;
    const typicalGrams = row.grams.length
      ? Math.round(row.grams.reduce((a, b) => a + b, 0) / row.grams.length)
      : null;
    candidates.push({
      name: row.name,
      displayNameMidSentence: formatFoodNameForMidSentence(row.name),
      occasion: row.occasion,
      occasionSource: row.occasionSource,
      typicalGrams,
      occasionsInWindow: row.occasions,
      novaGroup: row.novaGroup,
      provenance: row.provenance === FOOD_QUALITY_PROVENANCE.unclassified
        ? FOOD_QUALITY_PROVENANCE.unclassified
        : row.provenance,
      lessProcessedThanNova4: true,
      proposable: row.occasion !== FOCUS_USE_OCCASION.unknown,
    });
  }

  candidates.sort((a, b) => {
    if (b.occasionsInWindow !== a.occasionsInWindow) return b.occasionsInWindow - a.occasionsInWindow;
    return String(a.name).localeCompare(String(b.name));
  });

  const proposable = candidates.filter((c) => c.proposable);

  const byOccasion = {
    dolce: proposable.filter((c) => c.occasion === 'dolce').slice(0, 8),
    snack: proposable.filter((c) => c.occasion === 'snack').slice(0, 8),
    bevanda: proposable.filter((c) => c.occasion === 'bevanda').slice(0, 8),
    unknown: candidates.filter((c) => c.occasion === 'unknown').slice(0, 8),
    dessert: proposable.filter((c) => c.occasion === 'dolce').slice(0, 8),
    drink: proposable.filter((c) => c.occasion === 'bevanda').slice(0, 8),
  };

  return {
    available: proposable.length > 0,
    reason: null,
    lookbackDays,
    policy: {
      excludeNova4: true,
      sameUseOccasionOnly: true,
      preferDiaryFoods: true,
      noCrossOccasionFallback: true,
      unknownNotProposable: true,
      windowDays: lookbackDays,
    },
    byOccasion,
    candidates: candidates.slice(0, 32),
    proposable: proposable.slice(0, 24),
    genericFallback: { ...FOCUS_GENERIC_OCCASION_LABEL },
  };
}
