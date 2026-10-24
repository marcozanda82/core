/**
 * Usabilità nutrienti per Focus — riusa flag di focusNutritionPlausibility.
 * Non corregge il diario; non produce giudizi di carenza/adeguatezza.
 */

import { FOCUS_PROVENANCE } from '../contracts/focusDossier.v1.js';
import {
  FOCUS_NUTRIENT_AVAILABILITY,
  resolveMicronutrientPresence,
} from './focusLabMicronutrients.js';

/** Micro su cui il coach può osservare contributi (se attendibili). */
export const FOCUS_COACH_MICRO_KEYS = Object.freeze(['omega3', 'k', 'mg', 'vitB12']);

/**
 * Da flag anomalie → nutrienti da non usare per giudizi/consigli.
 * @param {object[]} flags
 * @returns {{
 *   byItemId: Map<string, Set<string>>,
 *   dayNutrients: Set<string>,
 *   excludedFromAdvice: object[],
 * }}
 */
export function mapAnomalyFlagsToUnusableNutrients(flags) {
  /** @type {Map<string, Set<string>>} */
  const byItemId = new Map();
  const dayNutrients = new Set();
  /** @type {object[]} */
  const excludedFromAdvice = [];

  const addItem = (itemId, nutrient, reason) => {
    if (itemId == null || itemId === '') return;
    const id = String(itemId);
    if (!byItemId.has(id)) byItemId.set(id, new Set());
    byItemId.get(id).add(nutrient);
    excludedFromAdvice.push({
      scope: 'item',
      itemId: id,
      nutrient,
      reason,
      usableForJudgement: false,
    });
  };

  for (const f of Array.isArray(flags) ? flags : []) {
    const code = String(f?.code || '');
    if (code === 'fibre_on_fish_like_name') {
      addItem(f.itemId, 'fiberG', code);
    } else if (code === 'kcal_per_gram_implausible') {
      addItem(f.itemId, 'kcal', code);
      addItem(f.itemId, 'proteinG', code);
      addItem(f.itemId, 'carbG', code);
      addItem(f.itemId, 'fatG', code);
      addItem(f.itemId, 'fiberG', code);
    } else if (code === 'daily_fiber_unusually_high') {
      dayNutrients.add('fiberG');
      excludedFromAdvice.push({
        scope: 'day',
        nutrient: 'fiberG',
        reason: code,
        usableForJudgement: false,
        fiberG: f.fiberG ?? null,
      });
    } else if (code === 'no_food_log') {
      dayNutrients.add('nutrition');
      excludedFromAdvice.push({
        scope: 'day',
        nutrient: 'nutrition',
        reason: code,
        usableForJudgement: false,
      });
    }
  }

  return { byItemId, dayNutrients, excludedFromAdvice };
}

/**
 * Annota una metrica con usabilità (non altera value).
 * @param {object} metric
 * @param {boolean} usable
 * @param {string|null} reason
 */
export function withUsability(metric, usable, reason = null) {
  if (!metric || typeof metric !== 'object') {
    return {
      value: null,
      provenance: FOCUS_PROVENANCE.missing,
      usableForJudgement: false,
      unusableReason: reason || 'missing_metric',
    };
  }
  const out = {
    ...metric,
    usableForJudgement: Boolean(usable),
  };
  if (!usable && reason) out.unusableReason = reason;
  return out;
}

/**
 * @param {string|null|undefined} itemId
 * @param {string} nutrient
 * @param {Map<string, Set<string>>} byItemId
 * @param {Set<string>} dayNutrients
 */
export function isNutrientUnusable(itemId, nutrient, byItemId, dayNutrients) {
  if (dayNutrients?.has(nutrient) || dayNutrients?.has('nutrition')) return true;
  if (itemId == null) return false;
  return Boolean(byItemId?.get(String(itemId))?.has(nutrient));
}

/**
 * Evidenze nutrizionali utilizzabili a livello presentazione / coach.
 * Nessun giudizio di adeguatezza; nessun EPA/DHA/ALA.
 *
 * @param {{
 *   foods: object[],
 *   meals: object[],
 *   micronutrientTotals: object|null,
 *   plausibility: object|null,
 *   timingCoverage: object|null,
 *   includeFoodLabels: boolean,
 * }} input
 */
export function buildNutritionCoachEvidence(input) {
  const foods = Array.isArray(input.foods) ? input.foods : [];
  const flags = input.plausibility?.flags || [];
  const usability = mapAnomalyFlagsToUnusableNutrients(flags);
  const timing = input.timingCoverage || {};
  const microTotals = input.micronutrientTotals?.byKey || {};

  const mealDistributionUsable = Boolean(
    foods.length > 0
    && timing.mealSlotsWithTime > 0
    && !usability.dayNutrients.has('nutrition'),
  );

  /** @type {Record<string, object>} */
  const micronutrients = {};
  for (const key of FOCUS_COACH_MICRO_KEYS) {
    const tot = microTotals[key];
    const completeness = Number(tot?.completenessRatio) || 0;
    const hasValue = tot?.value != null && tot?.provenance !== FOCUS_PROVENANCE.missing;
    // Attendibile solo se almeno un item noto e copertura ≥ 50% (euristica operativa).
    const reliableEnough = hasValue && completeness >= 0.5 && tot.itemsKnown >= 1;
    micronutrients[key] = {
      value: reliableEnough ? tot.value : null,
      unit: tot?.unit || undefined,
      provenance: reliableEnough
        ? FOCUS_PROVENANCE.calculated
        : (hasValue ? FOCUS_PROVENANCE.ambiguous : FOCUS_PROVENANCE.missing),
      availability: reliableEnough
        ? FOCUS_NUTRIENT_AVAILABILITY.present
        : (hasValue ? 'insufficient_coverage' : FOCUS_NUTRIENT_AVAILABILITY.absent),
      usableForObservation: reliableEnough,
      usableForJudgement: false,
      completenessRatio: completeness,
      itemsKnown: tot?.itemsKnown ?? 0,
      itemsTotal: tot?.itemsTotal ?? 0,
      limits: reliableEnough
        ? 'observation_only_no_adequacy_judgement'
        : 'insufficient_or_incomplete_for_observation',
      judgement: null,
    };
  }

  /** Contributi per alimento (solo micro usable + label se consenso). */
  const foodContributions = [];
  for (const item of foods) {
    const itemId = item?.id != null ? String(item.id) : null;
    const contrib = {};
    let any = false;
    for (const key of FOCUS_COACH_MICRO_KEYS) {
      if (isNutrientUnusable(itemId, key, usability.byItemId, usability.dayNutrients)) {
        continue;
      }
      const resolved = resolveMicronutrientPresence(item, key);
      if (!resolved.contributesToSum || resolved.metric?.value == null) continue;
      contrib[key] = {
        value: resolved.metric.value,
        unit: resolved.metric.unit,
        provenance: resolved.metric.provenance,
        availability: resolved.availability,
        usableForObservation: true,
        usableForJudgement: false,
      };
      any = true;
    }
    if (!any) continue;
    const label = String(item?.name || item?.desc || item?.label || '').trim();
    foodContributions.push({
      opaqueRef: itemId ? `diary:${itemId}` : null,
      name: input.includeFoodLabels && label ? label : null,
      labelRedacted: !input.includeFoodLabels,
      contributions: contrib,
    });
  }

  const meals = Array.isArray(input.meals) ? input.meals : [];
  const mealSlots = meals.map((m) => ({
    mealSlotId: m.mealSlotId || null,
    mealType: m.mealType || m.canonicalMealType || null,
    clockHour: m.clockHour?.value ?? null,
    itemCount: Array.isArray(m.items) ? m.items.length : (m.itemCount ?? null),
  }));

  return {
    schema: 'kentu.focusNutritionCoachEvidence.v1',
    mealDistribution: {
      usableForObservation: mealDistributionUsable,
      usableForJudgement: false,
      slots: mealSlots,
      timingCoverage: {
        mealSlotsTotal: timing.mealSlotsTotal ?? null,
        mealSlotsWithTime: timing.mealSlotsWithTime ?? null,
        windowComplete: Boolean(timing.windowComplete),
        partial: Boolean(timing.partial),
      },
      limits: mealDistributionUsable
        ? 'timing_observation_only'
        : 'insufficient_timing_or_no_food',
    },
    micronutrients,
    foodContributions: input.includeFoodLabels ? foodContributions : foodContributions.map((c) => ({
      ...c,
      name: null,
      labelRedacted: true,
    })),
    excludedFromAdvice: usability.excludedFromAdvice,
    policy: {
      noAdequacyJudgement: true,
      noDeficiencyClaims: true,
      noInflammationClaims: true,
      noPhysiologicalEffectsFromDiaryAlone: true,
      noEpaDhaAlaSplit: true,
      missingNotTreatedAsZero: true,
      diaryValuesNotAutoCorrected: true,
    },
    notes: [
      'Osservazioni consentite solo su evidenze usableForObservation=true.',
      'Fibre/macro flaggati come unusable non devono guidare consigli.',
      'Nessun giudizio automatico di adeguatezza micronutrienti in questa fase.',
      'EPA/DHA/ALA non sono nel modello: non inventarli da omega3.',
    ],
  };
}

/**
 * Catalog ref per export: in essential redige foodDbKey (identificativo alimentare).
 * @param {object} catalogRef
 * @param {boolean} includeFoodIdentifiers
 */
export function projectCatalogRefForExport(catalogRef, includeFoodIdentifiers) {
  const base = catalogRef && typeof catalogRef === 'object'
    ? catalogRef
    : {
      foodDbKey: null,
      dbSource: null,
      dbSourceProvenance: FOCUS_PROVENANCE.missing,
      nutrientPresenceEvidence: 'none',
    };

  if (includeFoodIdentifiers) {
    return {
      ...base,
      foodDbKeyRedacted: false,
    };
  }

  return {
    foodDbKey: null,
    foodDbKeyRedacted: Boolean(base.foodDbKey),
    // Layer di provenienza (non è un nome alimento); ok in essential.
    dbSource: base.dbSource ?? null,
    dbSourceProvenance: base.dbSourceProvenance || FOCUS_PROVENANCE.missing,
    nutrientPresenceEvidence: base.nutrientPresenceEvidence || 'none',
  };
}
