/**
 * Qualità alimentare deterministica per dossier Focus AI Coach.
 * NOVA / semanticTags da diario + cataloghi (personal → CREA → USDA → OFF).
 * Ruoli vegetali: prima categorie catalogo / nutrienti, poi name_pattern.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { collectDayLogForNutrition } from '../normalize/normalizeFoodEvents.js';
import { resolveFocusMealIdentity } from '../normalize/focusMealSlots.js';
import { assessNova4CritiqueProfile } from './assessNova4CritiqueProfile.js';
import {
  catalogDbNonEmpty,
  withFocusCatalogLookupSession,
} from './focusAiCoachCatalogLookup.js';

export const FOOD_QUALITY_PROVENANCE = Object.freeze({
  documented: 'documented',
  estimated: 'estimated',
  name_pattern: 'name_pattern',
  unclassified: 'unclassified',
});

/** Codici brevi nel dossier inviato al modello. */
export const FOOD_QUALITY_PROVENANCE_CODE = Object.freeze({
  documented: 'd',
  estimated: 'e',
  name_pattern: 'n',
  unclassified: 'u',
});

/**
 * @param {string|null|undefined} provenance
 * @returns {string|null}
 */
export function compactFoodQualityProvenance(provenance) {
  const p = String(provenance || '');
  return FOOD_QUALITY_PROVENANCE_CODE[p] || (p ? p.slice(0, 1) : null);
}

export const OFF_CATALOG_STATUS = Object.freeze({
  ready: 'ready',
  not_ready: 'not_ready',
  absent: 'absent',
});

const MEAL_LABELS = Object.freeze({
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Spuntino',
  spuntino: 'Spuntino',
  merenda: 'Merenda',
  unknown: 'Pasto',
});

/** Pattern nome → ruolo (solo se catalogo non fornisce categoria). */
const NAME_ROLE_PATTERNS = Object.freeze([
  { role: 'legume', re: /\b(fagiol\w*|lenticch\w*|ceci|pisell\w*|edamame|fave|soia)\b/i },
  { role: 'fruit', re: /\b(mela|mele|banan\w*|arancia|arance|kiwi|fragol\w*|mirtill\w*|pera|pere|uva|pesca|pesche|albicocc\w*|cilieg\w*|melone|anguria|ananas|mango|frutta|avocado)\b/i },
  { role: 'vegetable', re: /\b(insalat\w*|verdure?|broccoli|spinac\w*|zucchine?|carot\w*|peperon\w*|cetriol\w*|melanzan\w*|pomodor\w*|finocchi|rucola|bieta|cicoria|cavol\w*)\b/i },
  { role: 'whole_grain', re: /\b(integrale|integrali|avena|fiocchi\s+d['']?avena|quinoa|farro|orzo\s+mondo|con\s+semi|semi\s+di)\b/i },
]);

/** Dolci / bevande zuccherate: non contano come frutta/verdura anche se il nome contiene "frutta". */
const SWEET_OR_DRINK_NAME_RE = /\b(torta|torte|biscott\w*|cookie|muffin|croissant|gelato|budino|crema\s+pasticcera|marmellata|confettura|succo|spremuta|bevanda|drink|soda|cola|sciroppo|caramell\w*|cioccolat\w*|snack\s+dolce|merendin\w*)\b/i;

const SWEET_OR_DRINK_CATEGORY_RE = /\b(beverage|bevande|drink|succhi|juices?|nectars?|sodas?|soft-drinks|dolci|dessert|sweets?|cakes?|biscuits?|confetteria|cioccolato|ice-creams?)\b/i;

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object|null|undefined} tags
 * @returns {number|null}
 */
export function readNovaGroup(tags) {
  if (!tags || typeof tags !== 'object') return null;
  const raw = tags.novaGroup ?? tags.nova ?? tags.NOVA ?? null;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object|null|undefined} item
 */
function foodDisplayName(item) {
  return String(item?.name || item?.desc || item?.label || item?.foodName || '').trim();
}

/**
 * @param {object|null|undefined} item
 */
function foodDbKeyOf(item) {
  const raw = item?.foodDbKey ?? item?.matchedKey ?? item?.dbKey ?? null;
  const key = raw != null ? String(raw).trim() : '';
  return key || null;
}

/**
 * @param {string|null} mealType
 */
function mealLabelOf(mealType) {
  const key = String(mealType || '').trim().toLowerCase().split('_')[0];
  return MEAL_LABELS[key] || MEAL_LABELS.unknown;
}

/**
 * @param {{
 *   personalDb?: object|null,
 *   kentuItDb?: object|null,
 *   globalDb?: object|null,
 *   offDb?: object|null,
 *   offReady?: boolean|null,
 * }|null|undefined} catalogs
 */
export function resolveOffCatalogStatus(catalogs) {
  if (!catalogs || typeof catalogs !== 'object') {
    return {
      status: OFF_CATALOG_STATUS.absent,
      note: 'Nessun catalogo passato al builder: lookup OFF non eseguito; item senza tag restano unclassified.',
    };
  }
  if (catalogs.offReady === false) {
    return {
      status: OFF_CATALOG_STATUS.not_ready,
      note: 'OFF ancora in caricamento: senza match su CREA/USDA/personale la classificazione resta unclassified (off_catalog_not_ready).',
    };
  }
  if (catalogs.offReady === true || catalogDbNonEmpty(catalogs.offDb)) {
    return {
      status: OFF_CATALOG_STATUS.ready,
      note: 'OFF disponibile per lookup per foodDbKey.',
    };
  }
  if (catalogs.offReady === true) {
    return {
      status: OFF_CATALOG_STATUS.ready,
      note: 'OFF segnalato ready (mappa vuota o già consultata).',
    };
  }
  return {
    status: OFF_CATALOG_STATUS.absent,
    note: 'OFF non fornito al builder.',
  };
}

/**
 * @param {object|null|undefined} row
 * @param {string} sourceLabel
 */
function classificationFromCatalogRow(row, sourceLabel) {
  if (!row || typeof row !== 'object') {
    return { nova: null, semanticTags: null, provenance: null, source: null, row: null };
  }
  const tags = row.semanticTags && typeof row.semanticTags === 'object'
    ? row.semanticTags
    : null;
  const fromTags = readNovaGroup(tags);
  if (fromTags != null) {
    return {
      nova: fromTags,
      semanticTags: tags,
      provenance: FOOD_QUALITY_PROVENANCE.documented,
      source: sourceLabel,
      row,
    };
  }
  const estimated = finiteOrNull(row.novaScore ?? row.nova_score);
  if (estimated != null) {
    return {
      nova: estimated,
      semanticTags: tags,
      provenance: FOOD_QUALITY_PROVENANCE.estimated,
      source: `${sourceLabel}:novaScore`,
      row,
    };
  }
  return { nova: null, semanticTags: tags, provenance: null, source: null, row };
}

/**
 * @param {object|null|undefined} catalogs
 * @param {string} key
 * @returns {{ row: object, sourceLabel: string, layer: string }|null}
 */
function lookupCatalogRow(catalogs, key) {
  if (!key || !catalogs || typeof catalogs !== 'object') return null;
  if (catalogs.__focusLookupSession?.lookup) {
    return catalogs.__focusLookupSession.lookup(key);
  }
  const layers = [
    { db: catalogs.personalDb, label: 'personal' },
    { db: catalogs.kentuItDb, label: 'crea' },
    { db: catalogs.globalDb, label: 'usda' },
    { db: catalogs.offDb, label: 'off' },
  ];
  for (const layer of layers) {
    if (!layer.db || typeof layer.db !== 'object') continue;
    if (layer.label === 'off' && !catalogDbNonEmpty(layer.db)) continue;
    const row = layer.db[key];
    if (!row) continue;
    return { row, sourceLabel: `catalog:${layer.label}`, layer: layer.label };
  }
  return null;
}

/**
 * Risolve classificazione NOVA + tag per un item diario.
 * @param {object} item
 * @param {object|null|undefined} catalogs
 * @param {{ status: string }} offStatus
 */
export function resolveFoodItemClassification(item, catalogs, offStatus) {
  const name = foodDisplayName(item);
  const key = foodDbKeyOf(item);
  const diaryTags = item?.semanticTags && typeof item.semanticTags === 'object'
    ? item.semanticTags
    : null;
  const diaryNova = readNovaGroup(diaryTags);
  if (diaryNova != null) {
    const hit = key ? lookupCatalogRow(catalogs, key) : null;
    return {
      name,
      foodDbKey: key,
      novaGroup: diaryNova,
      semanticTags: diaryTags,
      provenance: FOOD_QUALITY_PROVENANCE.documented,
      source: 'diary_semanticTags',
      reason: null,
      catalogRow: hit?.row || null,
      catalogLayer: hit?.layer || null,
    };
  }

  // novaScore 0 sul diario è spesso placeholder non verificato: non bloccare il catalogo.
  const estimatedOnItem = finiteOrNull(item?.novaScore);
  if (estimatedOnItem != null && estimatedOnItem > 0) {
    const hit = key ? lookupCatalogRow(catalogs, key) : null;
    return {
      name,
      foodDbKey: key,
      novaGroup: estimatedOnItem,
      semanticTags: diaryTags,
      provenance: FOOD_QUALITY_PROVENANCE.estimated,
      source: 'diary_novaScore',
      reason: null,
      catalogRow: hit?.row || null,
      catalogLayer: hit?.layer || null,
    };
  }

  if (!key || !catalogs || typeof catalogs !== 'object') {
    return {
      name,
      foodDbKey: key,
      novaGroup: null,
      semanticTags: diaryTags,
      provenance: FOOD_QUALITY_PROVENANCE.unclassified,
      source: null,
      reason: key ? 'catalogs_absent' : 'missing_foodDbKey_and_tags',
      catalogRow: null,
      catalogLayer: null,
    };
  }

  // Lookup O(1) per chiave (memo se catalogs.__focusLookupSession presente)
  const cached = lookupCatalogRow(catalogs, key);
  if (cached?.row) {
    const hit = classificationFromCatalogRow(cached.row, cached.sourceLabel);
    if (hit.provenance) {
      return {
        name,
        foodDbKey: key,
        novaGroup: hit.nova,
        semanticTags: hit.semanticTags || diaryTags,
        provenance: hit.provenance,
        source: hit.source,
        reason: null,
        catalogRow: cached.row,
        catalogLayer: cached.layer,
      };
    }
    return {
      name,
      foodDbKey: key,
      novaGroup: null,
      semanticTags: hit.semanticTags || diaryTags,
      provenance: FOOD_QUALITY_PROVENANCE.unclassified,
      source: hit.source || cached.sourceLabel,
      reason: 'catalog_without_nova',
      catalogRow: cached.row,
      catalogLayer: cached.layer,
    };
  }

  const offConsultable = catalogs.offReady === true
    || (catalogs.__focusLookupSession?.dbNonEmpty
      ? catalogs.__focusLookupSession.dbNonEmpty(catalogs.offDb)
      : catalogDbNonEmpty(catalogs.offDb));

  if (
    offStatus?.status === OFF_CATALOG_STATUS.not_ready
    && !offConsultable
  ) {
    return {
      name,
      foodDbKey: key,
      novaGroup: null,
      semanticTags: diaryTags,
      provenance: FOOD_QUALITY_PROVENANCE.unclassified,
      source: null,
      reason: 'off_catalog_not_ready',
      catalogRow: null,
      catalogLayer: null,
    };
  }

  return {
    name,
    foodDbKey: key,
    novaGroup: null,
    semanticTags: diaryTags,
    provenance: FOOD_QUALITY_PROVENANCE.unclassified,
    source: null,
    reason: 'no_catalog_match',
    catalogRow: null,
    catalogLayer: null,
  };
}

/**
 * @param {object} row
 * @returns {string[]}
 */
function categoryTokensFromRow(row) {
  const out = [];
  const push = (v) => {
    const s = String(v || '').trim().toLowerCase();
    if (s) out.push(s);
  };
  if (Array.isArray(row?.categories_tags)) {
    for (const t of row.categories_tags) push(t);
  }
  if (typeof row?.categories === 'string') {
    for (const part of row.categories.split(',')) push(part);
  }
  push(row?.category);
  push(row?.food_group);
  push(row?.foodGroup);
  push(row?.group);
  push(row?.gruppo);
  push(row?.categoria);
  push(row?.crea_group);
  push(row?.creaGroup);
  push(row?.codice_gruppo);
  push(row?.groupCode);
  if (Array.isArray(row?.groups)) {
    for (const g of row.groups) push(g);
  }
  return out;
}

/**
 * Ruolo da categorie CREA/OFF/USDA (documented), prima del name_pattern.
 * @param {object} row
 * @param {string} layer
 */
function plantRoleFromCatalogCategories(row, layer) {
  const tokens = categoryTokensFromRow(row).join(' | ');
  if (!tokens) return null;
  if (SWEET_OR_DRINK_CATEGORY_RE.test(tokens)) return null;

  const source = `catalog_category:${layer}`;
  if (
    /\b(legumi|legumes?|pulses?|beans?|lentils?|chickpeas?|fagioli|lenticchie|ceci)\b/i.test(tokens)
  ) {
    return { role: 'legume', provenance: FOOD_QUALITY_PROVENANCE.documented, source };
  }
  if (
    /\b(frutta|fruits?|fresh-fruits|fruits-and-products)\b/i.test(tokens)
    && !/\b(juices?|succhi|nectars?)\b/i.test(tokens)
  ) {
    return { role: 'fruit', provenance: FOOD_QUALITY_PROVENANCE.documented, source };
  }
  if (/\b(verdura|verdure|vegetables?|ortaggi|fresh-vegetables)\b/i.test(tokens)) {
    return { role: 'vegetable', provenance: FOOD_QUALITY_PROVENANCE.documented, source };
  }
  if (/\b(cereali\s*integr|whole.?grain|wholemeal|integrali?)\b/i.test(tokens)) {
    return { role: 'whole_grain', provenance: FOOD_QUALITY_PROVENANCE.documented, source };
  }
  return null;
}

/**
 * Omega-3 da riga catalogo (USDA/CREA tipicamente g/100g).
 * @param {object} row
 * @returns {number|null}
 */
function omega3FromCatalogRow(row) {
  const candidates = [
    row?.omega3,
    row?.omega_3,
    row?.n3,
    row?.fatty_acids_n3,
    row?.fattyAcidsN3,
    row?.nutriments?.['omega-3'],
    row?.nutriments?.omega_3,
  ];
  for (const c of candidates) {
    const n = finiteOrNull(c);
    if (n != null && n > 0) return n;
  }
  return null;
}

/**
 * @param {string} name
 * @param {number|null} novaGroup
 */
function plantRoleFromDisplayName(name, novaGroup) {
  const n = String(name || '');
  if (novaGroup != null && novaGroup >= 4) return null;
  if (SWEET_OR_DRINK_NAME_RE.test(n)) return null;

  for (const row of NAME_ROLE_PATTERNS) {
    if (row.re.test(n)) {
      return {
        role: row.role,
        provenance: FOOD_QUALITY_PROVENANCE.name_pattern,
        source: 'display_name_pattern',
      };
    }
  }
  return null;
}

/**
 * @param {object} fullHistory
 * @param {string} date
 * @param {object|null|undefined} catalogs
 * @param {object} offStatus
 */
function buildDayFoodQuality(fullHistory, date, catalogs, offStatus) {
  const node = getTrackerDayNode(fullHistory, date);
  if (!node) {
    return {
      date,
      hasFood: false,
      nova4Items: [],
      fiberGTotal: null,
      omega3Sources: [],
      plantFoods: [],
      wholeGrainFoods: [],
      provenanceCounts: {
        documented: 0,
        estimated: 0,
        name_pattern: 0,
        unclassified: 0,
      },
      itemCount: 0,
      offUnresolvedCount: 0,
    };
  }

  const dayLog = collectDayLogForNutrition(node);
  const foods = dayLog.filter(
    (e) => e && (e.type === 'food' || e.type === 'recipe' || !e.type),
  );

  /** @type {object[]} */
  const nova4Items = [];
  /** @type {object[]} */
  const omega3Sources = [];
  /** @type {object[]} */
  const plantFoods = [];
  /** @type {object[]} */
  const wholeGrainFoods = [];
  const provenanceCounts = {
    documented: 0,
    estimated: 0,
    name_pattern: 0,
    unclassified: 0,
  };
  let fiberGTotal = 0;
  let fiberAny = false;
  let offUnresolvedCount = 0;

  for (const item of foods) {
    const identity = resolveFocusMealIdentity(item);
    const mealLabel = mealLabelOf(identity.canonicalMealType);
    const kcal = finiteOrNull(item.kcal ?? item.cal);
    const fiber = finiteOrNull(item.fibre ?? item.fiber ?? item.fiberG);
    if (fiber != null) {
      fiberGTotal += fiber;
      fiberAny = true;
    }

    const classified = resolveFoodItemClassification(item, catalogs, offStatus);
    if (classified.reason === 'off_catalog_not_ready') offUnresolvedCount += 1;

    if (classified.provenance === FOOD_QUALITY_PROVENANCE.documented) {
      provenanceCounts.documented += 1;
    } else if (classified.provenance === FOOD_QUALITY_PROVENANCE.estimated) {
      provenanceCounts.estimated += 1;
    } else {
      provenanceCounts.unclassified += 1;
    }

    if (classified.novaGroup != null && classified.novaGroup >= 4) {
      const grams = finiteOrNull(item.grams ?? item.g ?? item.qty);
      const critique = assessNova4CritiqueProfile({
        name: classified.name,
        grams,
        catalogRow: classified.catalogRow,
        sugarsG: finiteOrNull(item.sugars ?? item.sugar ?? item.sugarG),
        satFatG: finiteOrNull(item.satFat ?? item.fatSat ?? item.saturatedFat),
      });
      nova4Items.push({
        name: classified.name,
        mealLabel,
        mealType: identity.canonicalMealType,
        kcal,
        grams,
        novaGroup: classified.novaGroup,
        provenance: classified.provenance,
        source: classified.source,
        reason: classified.reason,
        critiqueWorthy: critique.critiqueWorthy,
        critiqueReason: critique.reason,
        nutriScoreGrade: critique.nutriScoreGrade,
        sugarsGPortion: critique.sugarsGPortion,
        satFatGPortion: critique.satFatGPortion,
      });
    }

    // Omega-3: (1) campo diario già scalato; (2) nutrienti catalogo se assenti sul log.
    const diaryOmega3 = finiteOrNull(item.omega3 ?? item.omega_3);
    if (diaryOmega3 != null && diaryOmega3 > 0) {
      omega3Sources.push({
        name: classified.name,
        mealLabel,
        omega3G: diaryOmega3,
        provenance: FOOD_QUALITY_PROVENANCE.documented,
        source: 'diary_omega3_field',
      });
    } else if (classified.catalogRow) {
      const catOmega = omega3FromCatalogRow(classified.catalogRow);
      if (catOmega != null && catOmega > 0) {
        const grams = finiteOrNull(item.grams ?? item.g ?? item.qty);
        const scaled = grams != null && grams > 0
          ? (catOmega * grams) / 100
          : catOmega;
        const layer = classified.catalogLayer || 'unknown';
        omega3Sources.push({
          name: classified.name,
          mealLabel,
          omega3G: Math.round(scaled * 1000) / 1000,
          provenance: (layer === 'usda' || layer === 'crea' || layer === 'personal')
            ? FOOD_QUALITY_PROVENANCE.documented
            : FOOD_QUALITY_PROVENANCE.estimated,
          source: `catalog_${layer}_omega3`,
        });
      }
    }

    let plant = null;
    if (classified.catalogRow && classified.catalogLayer) {
      plant = plantRoleFromCatalogCategories(classified.catalogRow, classified.catalogLayer);
    }
    if (!plant) {
      plant = plantRoleFromDisplayName(classified.name, classified.novaGroup);
    }
    if (
      plant
      && (plant.role === 'fruit' || plant.role === 'vegetable')
      && classified.novaGroup != null
      && classified.novaGroup >= 4
    ) {
      plant = null;
    }

    if (plant) {
      const entry = {
        name: classified.name,
        mealLabel,
        role: plant.role,
        provenance: plant.provenance,
        source: plant.source,
      };
      if (plant.role === 'whole_grain') {
        wholeGrainFoods.push(entry);
      } else {
        plantFoods.push(entry);
      }
      if (plant.provenance === FOOD_QUALITY_PROVENANCE.name_pattern) {
        provenanceCounts.name_pattern += 1;
      }
    }
  }

  return {
    date,
    hasFood: foods.length > 0,
    nova4Items,
    fiberGTotal: fiberAny ? Math.round(fiberGTotal * 10) / 10 : null,
    omega3Sources,
    plantFoods,
    wholeGrainFoods,
    provenanceCounts,
    itemCount: foods.length,
    offUnresolvedCount,
  };
}

/**
 * @param {{
 *   fullHistory: object,
 *   analysisDate: string,
 *   periodId?: string,
 *   catalogs?: object|null,
 *   recentDays?: number,
 *   offStatusOverride?: { status: string, note?: string }|null,
 * }} input
 */
export function buildFocusFoodQualityBlock(input) {
  const fullHistory = input?.fullHistory && typeof input.fullHistory === 'object'
    ? input.fullHistory
    : null;
  const analysisDate = String(input?.analysisDate || '').trim();
  if (!fullHistory || !isIsoDateString(analysisDate)) {
    return {
      available: false,
      reason: 'missing_history_or_date',
      day: null,
      recent: null,
      catalogStatus: resolveOffCatalogStatus(input?.catalogs),
      completeness: 'complete',
      completenessReason: null,
      policy: {
        noInferenceBeyondTagsAndCatalog: true,
        offNotReadyMarksUnclassified: true,
        plantRolesPreferCatalogCategories: true,
        namePatternIsIndicative: true,
        sweetDrinkExcludedFromFruitVegetable: true,
      },
    };
  }

  const { catalogs } = withFocusCatalogLookupSession(input.catalogs || null);
  const offStatus = input.offStatusOverride && typeof input.offStatusOverride === 'object'
    ? input.offStatusOverride
    : resolveOffCatalogStatus(catalogs);
  const day = buildDayFoodQuality(fullHistory, analysisDate, catalogs, offStatus);

  const recentDays = Math.max(
    1,
    Number(input.recentDays)
      || (input.periodId === 'mese' ? 30 : input.periodId === 'settimana' ? 7 : 7),
  );

  /** @type {object[]} */
  const recentDaysBuilt = [];
  let fiberSum = 0;
  let fiberDays = 0;
  let nova4Occasions = 0;
  let omega3Occasions = 0;
  let plantOccasions = 0;
  let wholeGrainOccasions = 0;
  let offUnresolvedTotal = day.offUnresolvedCount || 0;
  const recentProvenance = {
    documented: 0,
    estimated: 0,
    name_pattern: 0,
    unclassified: 0,
  };

  for (let i = recentDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const row = buildDayFoodQuality(fullHistory, date, catalogs, offStatus);
    if (!row.hasFood) continue;
    recentDaysBuilt.push({
      date: row.date,
      nova4Count: row.nova4Items.length,
      fiberGTotal: row.fiberGTotal,
      omega3Count: row.omega3Sources.length,
      plantCount: row.plantFoods.length,
      wholeGrainCount: row.wholeGrainFoods.length,
      provenanceCounts: row.provenanceCounts,
      offUnresolvedCount: row.offUnresolvedCount || 0,
    });
    if (row.fiberGTotal != null) {
      fiberSum += row.fiberGTotal;
      fiberDays += 1;
    }
    nova4Occasions += row.nova4Items.length;
    omega3Occasions += row.omega3Sources.length;
    plantOccasions += row.plantFoods.length;
    wholeGrainOccasions += row.wholeGrainFoods.length;
    offUnresolvedTotal += (date === analysisDate ? 0 : (row.offUnresolvedCount || 0));
    recentProvenance.documented += row.provenanceCounts.documented;
    recentProvenance.estimated += row.provenanceCounts.estimated;
    recentProvenance.name_pattern += row.provenanceCounts.name_pattern || 0;
    recentProvenance.unclassified += row.provenanceCounts.unclassified;
  }

  const incompleteOff = offUnresolvedTotal > 0
    && offStatus.status === OFF_CATALOG_STATUS.not_ready;

  return {
    available: day.hasFood || recentDaysBuilt.length > 0,
    reason: null,
    catalogStatus: offStatus,
    completeness: incompleteOff ? 'partial' : 'complete',
    completenessReason: incompleteOff ? 'off_catalog_not_ready' : null,
    offUnresolvedItemCount: offUnresolvedTotal,
    day: {
      analysisDate,
      nova4Items: day.nova4Items,
      fiberGTotal: day.fiberGTotal,
      omega3Sources: day.omega3Sources,
      plantFoods: day.plantFoods,
      wholeGrainFoods: day.wholeGrainFoods,
      provenanceCounts: day.provenanceCounts,
      itemCount: day.itemCount,
      offUnresolvedCount: day.offUnresolvedCount || 0,
    },
    recent: {
      windowDays: recentDays,
      daysWithFood: recentDaysBuilt.length,
      meanFiberG: fiberDays > 0 ? Math.round((fiberSum / fiberDays) * 10) / 10 : null,
      nova4Occasions,
      omega3Occasions,
      plantOccasions,
      wholeGrainOccasions,
      provenanceCounts: recentProvenance,
      byDay: recentDaysBuilt,
    },
    policy: {
      noInferenceBeyondTagsAndCatalog: true,
      offNotReadyMarksUnclassified: true,
      plantRolesPreferCatalogCategories: true,
      namePatternIsIndicative: true,
      sweetDrinkExcludedFromFruitVegetable: true,
      estimatedMeansHealthAnalyzerNovaScore: true,
    },
  };
}
