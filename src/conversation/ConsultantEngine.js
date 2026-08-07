import { computeTotali } from '../useBiochimico';
import { getTargetForNutrient } from '../useBiochimico';
import { searchFoodsDetailed } from '../foodSearch';
import { estraiDatiFoodDb, findFoodDbMatchCascading } from '../features/salaComandi/engines/foodDataEngine';
import { toCanonicalMealType, generateCortisolCurve } from '../coreEngine';
import { inferDefaultMealType, expandFoodPayloadItems } from '../features/commandTerminal/conversation/conversationState';
import {
  applyMealRegistrationSmartDefaults,
  formatCurrentSystemTimeContext,
} from '../features/commandTerminal/conversation/mealSmartDefaults.js';
import {
  resolveFoodItemForProposal,
  resolveMealProposalItems,
  sumProposalItemMacros,
} from '../utils/foodResolver.js';
import { resolveExactTimeForMeal, isMealProposalQuery, matchDraftItemByFoodQuery, findMostProblematicDraftItem } from '../features/commandTerminal/conversation/mealLogIntent.js';
import { buildTodayDiaryIndex } from '../features/commandTerminal/conversation/todayDiaryIndex.js';
import { deduplicateWipItems, normalizeWipFoodNameKey, deduplicateMealProposalItems } from '../features/wipMealBuilder/utils/wipMealItemUtils.js';
import { analyzeTodayFromLog } from '../aiDayCoach';
import {
  aggregatePredictiveMealCombos,
  collectMealEventsFromFullHistory,
} from '../features/mealBuilder/hooks/usePredictiveMealCombos';
import { activityLabelFromBlock } from '../features/weeklyBlocks/activityCatalog';
import {
  DEFAULT_STRATEGY_DELTA,
  isActiveDayBlock,
  isUserAssignedDayBlock,
  resolveBlockKcalTarget,
} from '../features/weeklyBlocks/weeklyBlockSchema';
import { buildChatPersonaSystemBlock, resolveUserDisplayName } from '../features/chat/chatPersona.js';
import {
  applyMealOperations,
} from '../features/commandTerminal/meals/mealUpsert.js';
import {
  formatDecimalHourIt,
  parseFlexibleTimeToDecimal,
  resolveActivityOrWorkoutTimelineHour,
} from '../features/salaComandi/utils/timelineUtils';

const STANDARD_PORTION_G = 100;
const MEAL_ORDER = ['colazione', 'snack', 'pranzo', 'cena'];
const MAX_HABIT_PROPOSALS = 3;
const HABIT_LOOKBACK_DAYS = 45;
const PRE_WORKOUT_WINDOW_MINUTES = 180;

const MICRO_TELEMETRY_KEYS = [
  'fibre',
  'mg',
  'na',
  'k',
  'ca',
  'fe',
  'vitc',
  'vitD',
  'omega3',
];

const MICRO_UNITS = {
  fibre: 'g',
  omega3: 'g',
  vitD: 'µg',
  vitc: 'mg',
  mg: 'mg',
  na: 'mg',
  k: 'mg',
  ca: 'mg',
  fe: 'mg',
};

function roundMacro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function sumItemMacros(items) {
  return (items || []).reduce(
    (acc, item) => ({
      kcal: acc.kcal + (Number(item.kcal) || 0),
      pro: acc.pro + (Number(item.pro) || 0),
      carbo: acc.carbo + (Number(item.carbo) || 0),
      fat: acc.fat + (Number(item.fat) || 0),
    }),
    { kcal: 0, pro: 0, carbo: 0, fat: 0 },
  );
}

function clampBudgetValue(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, roundMacro(v));
}

function computeResidualBudgetAfterPartialMeal(remainingBudget, partialMealTotals) {
  const b = remainingBudget && typeof remainingBudget === 'object' ? remainingBudget : {};
  const p = partialMealTotals && typeof partialMealTotals === 'object' ? partialMealTotals : {};
  return {
    kcal: clampBudgetValue((b.kcal ?? 0) - (p.kcal ?? 0)),
    pro: clampBudgetValue((b.pro ?? 0) - (p.pro ?? 0)),
    carbo: clampBudgetValue((b.carbo ?? 0) - (p.carbo ?? 0)),
    fat: clampBudgetValue((b.fat ?? 0) - (p.fat ?? 0)),
    micros: b.micros || undefined,
  };
}

function roundTotals(totals) {
  return {
    kcal: roundMacro(totals.kcal),
    pro: roundMacro(totals.pro),
    carbo: roundMacro(totals.carbo),
    fat: roundMacro(totals.fat),
  };
}

function mapFoodEntryToProposalItem(entry) {
  const grams = Math.round(Number(entry?.qta ?? entry?.weight) || 0);
  return {
    foodName: String(entry?.desc ?? entry?.name ?? '').trim(),
    foodDbKey: entry?.foodDbKey ?? null,
    grams: grams > 0 ? grams : STANDARD_PORTION_G,
    kcal: roundMacro(entry?.kcal ?? entry?.cal),
    pro: roundMacro(entry?.prot),
    carbo: roundMacro(entry?.carb),
    fat: roundMacro(entry?.fatTotal ?? entry?.fat),
  };
}

function mapComboToProposal(combo, mealType) {
  const items = (combo?.items || [])
    .map(mapFoodEntryToProposalItem)
    .filter((item) => item.foodName);
  if (items.length === 0) return null;

  return {
    id: String(combo.id || combo.signature || combo.name || '').trim() || `combo_${Date.now()}`,
    name: String(combo.name || 'Combo abituale').trim(),
    source: 'historical_combo',
    frequency: Number(combo.count) || 0,
    mealType,
    items,
    totals: roundTotals(sumItemMacros(items)),
  };
}

function resolveFoodIdentityKey(entry) {
  if (entry?.foodDbKey != null && String(entry.foodDbKey).trim() !== '') {
    return String(entry.foodDbKey).trim().toLowerCase();
  }
  const name = String(entry?.desc ?? entry?.name ?? entry?.foodName ?? '').trim().toLowerCase();
  return name || null;
}

function buildMealEventSignature(foods) {
  const keys = (foods || [])
    .map(resolveFoodIdentityKey)
    .filter(Boolean)
    .sort();
  return keys.join('_');
}

function mapMealEventToProposal(event, mealType) {
  const items = (event?.foods || [])
    .map(mapFoodEntryToProposalItem)
    .filter((item) => item.foodName);
  if (items.length < 2) return null;

  const names = items.map((item) => item.foodName);
  const label = names.length === 2
    ? `${names[0]} e ${names[1]}`
    : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  const signature = buildMealEventSignature(event.foods);

  return {
    id: `recent_${event.date || 'unknown'}_${signature}`,
    name: `Pasto recente: ${label}`,
    source: 'recent_meal_event',
    frequency: 1,
    mealType,
    items,
    totals: roundTotals(sumItemMacros(items)),
  };
}

function buildProposalsFromRecentMealEvents(fullHistory, mealType, seenIds, limit) {
  const slot = MEAL_ORDER.includes(mealType) ? mealType : 'pranzo';
  const events = collectMealEventsFromFullHistory(fullHistory, slot, HABIT_LOOKBACK_DAYS);
  const proposals = [];
  const seenSignatures = new Set();

  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (proposals.length >= limit) break;
    const event = events[i];
    const signature = buildMealEventSignature(event.foods);
    if (!signature || seenSignatures.has(signature)) continue;

    const proposal = mapMealEventToProposal(event, slot);
    if (!proposal || seenIds.has(proposal.id)) continue;

    seenSignatures.add(signature);
    seenIds.add(proposal.id);
    proposals.push(proposal);
  }

  return proposals;
}

function habitProposalToCard(proposal) {
  if (!proposal || !Array.isArray(proposal.items) || proposal.items.length === 0) return null;
  return {
    id: String(proposal.id || '').trim() || `habit_${Date.now()}`,
    label: String(proposal.name || proposal.label || 'Proposta abituale').trim(),
    mealType: proposal.mealType,
    source: proposal.source || 'historical_combo',
    items: proposal.items,
    totals: proposal.totals || roundTotals(sumItemMacros(proposal.items)),
  };
}

/**
 * Proposte di fallback dal DB alimenti locale (porzioni standard) quando mancano abitudini recenti.
 *
 * @param {object} currentAppState
 * @param {string} mealType
 * @returns {Array<object>}
 */
export function buildFallbackMealProposalsFromFoodDb(currentAppState = {}, mealType) {
  const slot = MEAL_ORDER.includes(mealType) ? mealType : resolveCurrentMealType(currentAppState);
  const foodDb = currentAppState?.foodDatabase || {};
  const fullHistory = currentAppState?.fullHistory || {};
  const rows = Object.entries(foodDb)
    .filter(([, row]) => row && typeof row === 'object')
    .map(([id, row]) => ({ id, ...row }))
    .filter((row) => String(row.desc || row.name || '').trim());

  if (rows.length < 2) return [];

  const proposals = [];
  const chunkSize = 3;

  for (let i = 0; i < MAX_HABIT_PROPOSALS && i * chunkSize < rows.length; i += 1) {
    const slice = rows.slice(i * chunkSize, i * chunkSize + chunkSize);
    if (slice.length < 2) break;

    const items = slice
      .map((row) => mapCandidateToPortion(row, foodDb, fullHistory, slot))
      .filter(Boolean)
      .map((portion) => ({
        foodName: portion.name,
        foodDbKey: portion.dbKey,
        grams: portion.portionGrams,
        kcal: portion.kcal,
        pro: portion.pro,
        carbo: portion.carbo,
        fat: portion.fat,
      }));

    if (items.length < 2) continue;

    const label = items.map((item) => item.foodName).join(' + ');
    proposals.push({
      id: `fallback_db_${slot}_${i + 1}`,
      label: `Proposta ${i + 1}: ${label}`,
      mealType: slot,
      source: 'food_database_fallback',
      items,
      totals: roundTotals(sumItemMacros(items)),
    });
  }

  return proposals.slice(0, MAX_HABIT_PROPOSALS);
}

/**
 * Garantisce mealProposals non vuoti per richieste di suggerimento pasto.
 *
 * @param {Array<object>} mealProposals
 * @param {object} adviceContext
 * @returns {Array<object>}
 */
function enrichMealProposal(proposal, adviceContext = {}) {
  if (!proposal || !Array.isArray(proposal.items)) return proposal;
  const mealType = String(proposal.mealType || adviceContext?.currentMealType || 'pranzo').toLowerCase();
  const items = proposal.items
    .map((item) => enrichProposalItemWithResolver(item, adviceContext, mealType))
    .filter(Boolean);
  if (items.length === 0) return proposal;
  const exactTime = resolveExactTimeForMeal(proposal, adviceContext?.rawUserQuery || '');
  return {
    ...proposal,
    items,
    totals: roundTotals(sumProposalItemMacros(items)),
    ...(exactTime ? { exactTime } : {}),
  };
}

export function ensureMealProposalsForAdvice(mealProposals, adviceContext = {}) {
  if (Array.isArray(mealProposals) && mealProposals.length > 0) {
    return mealProposals
      .map((proposal) => enrichMealProposal(proposal, adviceContext))
      .filter(Boolean)
      .slice(0, MAX_HABIT_PROPOSALS);
  }

  // Backfill da abitudini/DB solo su richieste esplicite di suggerimento pasto (ADVICE generico).
  if (!adviceContext.isGenericMealSuggestion) {
    return [];
  }

  const habits = adviceContext?.userHabitsForCurrentMeal?.proposals || [];
  const fromHabits = habits
    .map((habit) => enrichMealProposal(habitProposalToCard(habit), adviceContext))
    .filter(Boolean)
    .slice(0, MAX_HABIT_PROPOSALS);
  if (fromHabits.length > 0) return fromHabits;

  const fallback = Array.isArray(adviceContext?.fallbackMealProposals)
    ? adviceContext.fallbackMealProposals
    : [];
  return fallback
    .map((proposal) => enrichMealProposal(proposal, adviceContext))
    .filter(Boolean)
    .slice(0, MAX_HABIT_PROPOSALS);
}

function proposalIncludesAnchorFood(proposal, anchorFood) {
  const anchor = String(anchorFood || '').trim().toLowerCase();
  if (!anchor) return true;
  const items = Array.isArray(proposal?.items) ? proposal.items : [];
  return items.some((item) => {
    const name = String(item?.foodName || '').trim().toLowerCase();
    return name.includes(anchor) || anchor.includes(name);
  });
}

/**
 * Garantisce 3 mealProposals Consultant Mode con alimento base incluso in ogni opzione.
 * @param {Array<object>} mealProposals
 * @param {object} adviceContext
 * @returns {Array<object>}
 */
export function ensureMealProposalsForConsultantMeal(mealProposals, adviceContext = {}) {
  const anchorFood = String(adviceContext?.consultantMealRequest?.anchorFood || '').trim();
  const mealType = String(
    adviceContext?.consultantMealRequest?.mealType
    || adviceContext?.currentMealType
    || 'pranzo',
  ).toLowerCase();

  const enriched = (Array.isArray(mealProposals) ? mealProposals : [])
    .map((proposal, index) => enrichMealProposal({
      ...proposal,
      mealType: proposal?.mealType || mealType,
      label: proposal?.label || `Opzione ${index + 1}`,
      source: proposal?.source || 'consultant_meal',
    }, adviceContext))
    .filter(Boolean);

  const withAnchor = enriched.filter((proposal) => proposalIncludesAnchorFood(proposal, anchorFood));
  const picked = (withAnchor.length > 0 ? withAnchor : enriched).slice(0, 3);

  return picked.map((proposal, index) => ({
    ...proposal,
    label: `Opzione ${index + 1}`,
    source: proposal.source || 'consultant_meal',
  }));
}

const CARB_HEAVY_FOOD_PATTERN = /pizza|pasta|riso|pane|patat|gnocch|crack|farro|orzo|cous|polenta/i;
const FAT_HEAVY_FOOD_PATTERN = /olio|noci|pesto|edamame|burro|formagg|mandorl|avocado|semi/i;
const PROTEIN_PRESERVE_FOOD_PATTERN = /salmone|merluzzo|tonno|pollo|uov|manzo|tacchino|gamber|bresaol|prosciutt/i;

function isScalableDraftItem(item) {
  const name = String(item?.foodName || '').toLowerCase();
  if (PROTEIN_PRESERVE_FOOD_PATTERN.test(name)) return false;
  if (CARB_HEAVY_FOOD_PATTERN.test(name) || FAT_HEAVY_FOOD_PATTERN.test(name)) return true;

  const kcal = Number(item?.kcal) || 0;
  const pro = Number(item?.pro) || 0;
  if (kcal <= 0) return true;
  return (pro * 4) / kcal < 0.35;
}

function enforceProposalBudgetCap(proposal, budgetKcal, adviceContext = {}) {
  if (!proposal || !Array.isArray(proposal.items) || proposal.items.length === 0) return proposal;

  const cap = Math.round(Number(budgetKcal) || 0);
  if (cap <= 0) return proposal;

  const mealType = String(proposal.mealType || adviceContext?.currentMealType || 'pranzo').toLowerCase();
  let items = proposal.items.map((item) => ({ ...item }));
  let totals = roundTotals(sumItemMacros(items));

  if (totals.kcal <= cap) {
    return { ...proposal, items, totals };
  }

  for (let pass = 0; pass < 12 && totals.kcal > cap; pass += 1) {
    const scalable = items.filter(isScalableDraftItem);
    if (scalable.length === 0) break;

    const ratio = Math.max(0.45, cap / totals.kcal);
    items = items.map((item) => {
      if (!isScalableDraftItem(item)) return item;
      const newGrams = Math.max(1, Math.round(Number(item.grams) * ratio));
      if (newGrams >= item.grams) {
        const forcedGrams = Math.max(1, item.grams - 1);
        if (forcedGrams === item.grams) return item;
        return enrichProposalItemWithResolver(
          { ...item, grams: forcedGrams, rawQuery: item.rawQuery || item.foodName },
          adviceContext,
          mealType,
        ) || item;
      }
      return enrichProposalItemWithResolver(
        { ...item, grams: newGrams, rawQuery: item.rawQuery || item.foodName },
        adviceContext,
        mealType,
      ) || item;
    }).filter(Boolean);
    totals = roundTotals(sumItemMacros(items));
  }

  return {
    ...proposal,
    items,
    totals,
  };
}

function buildFixedMealProposalFromDraft(mealDraftProjection, adviceContext = {}) {
  const projection = mealDraftProjection && typeof mealDraftProjection === 'object'
    ? mealDraftProjection
    : null;
  const rawItems = Array.isArray(projection?.items) ? projection.items : [];
  if (rawItems.length === 0) return null;

  const mealType = String(
    projection?.mealType || adviceContext?.currentMealType || 'pranzo',
  ).toLowerCase();
  const budgetKcal = Math.round(Number(adviceContext?.remainingBudget?.kcal) || 0);
  const items = rawItems
    .map((item) => enrichProposalItemWithResolver(
      {
        foodName: String(item?.foodName || item?.name || '').trim(),
        grams: Math.round(Number(item?.grams ?? item?.qta) || 0),
        rawQuery: String(item?.foodName || item?.name || '').trim(),
        foodDbKey: item?.foodDbKey ?? null,
      },
      adviceContext,
      mealType,
    ))
    .filter(Boolean);

  if (items.length === 0) return null;

  const label = items.length === 1
    ? `${items[0].foodName} (${items[0].grams}g)`
    : items.map((item) => item.foodName).join(' + ');

  const baseProposal = {
    id: `fixed_draft_${Date.now()}`,
    label: 'Porzioni riparate',
    mealType,
    source: 'what_if_fix',
    items,
    totals: roundTotals(sumItemMacros(items)),
    ...(projection?.exactTime ? { exactTime: projection.exactTime } : {}),
  };

  return enforceProposalBudgetCap(baseProposal, budgetKcal, adviceContext);
}

/**
 * Garantisce una card pasto riparata entro budget per FIX_MEAL_DRAFT.
 * @param {Array<object>} mealProposals
 * @param {object} adviceContext
 * @returns {Array<object>}
 */
export function ensureMealProposalsForFixDraft(mealProposals, adviceContext = {}) {
  const budgetKcal = Math.round(Number(adviceContext?.remainingBudget?.kcal) || 0);
  const sanitized = sanitizeMealProposals(mealProposals, adviceContext)
    .map((proposal) => enforceProposalBudgetCap(proposal, budgetKcal, adviceContext))
    .filter(Boolean);

  if (sanitized.length > 0) {
    return [sanitized[0]];
  }

  const fixed = buildFixedMealProposalFromDraft(adviceContext?.mealDraftProjection, adviceContext);
  return fixed ? [fixed] : [];
}

export function buildFixMealDraftAdviceMessage(adviceContext = {}) {
  const receipt = adviceContext?.dogmaticMacroReceipt
    || adviceContext?.remainingBudget?.dogmaticReceipt
    || null;
  const rem = receipt?.remaining || adviceContext?.remainingBudget || {};
  const budgetKcal = Math.round(Number(rem.kcal) || 0);
  const remP = Math.round(Number(rem.pro) || 0);
  const remC = Math.round(Number(rem.carbo) || 0);
  const remF = Math.round(Number(rem.fat) || 0);
  if (budgetKcal !== 0 || remP || remC || remF) {
    return `Porzioni ricalibrate sul remaining dogmatico: ${budgetKcal} kcal | P ${remP}g | C ${remC}g | F ${remF}g. Conferma o modifica i grammi nella card.`;
  }
  return 'Porzioni ricalibrate per restare entro il remaining dogmatico. Conferma o modifica i grammi nella card.';
}

function normalizeDraftFoodKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function resolveRemovedEnrichedDraftItem(items, removedFoodQuery) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return null;
  if (removedFoodQuery) {
    const matched = matchDraftItemByFoodQuery(list, removedFoodQuery);
    if (matched) return matched;
  }
  return findMostProblematicDraftItem(list);
}

function partitionEnrichedDraftForSubstitute(items, removedItem) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!removedItem) return { kept: list, removed: null };
  const removedKey = normalizeDraftFoodKey(removedItem.foodName);
  const kept = list.filter((item) => normalizeDraftFoodKey(item.foodName) !== removedKey);
  const removed = list.find((item) => normalizeDraftFoodKey(item.foodName) === removedKey) || removedItem;
  return { kept, removed };
}

function mergeKeptItemsIntoSubstituteProposal(proposal, keptItems, adviceContext = {}) {
  if (!proposal || !Array.isArray(proposal.items)) return proposal;
  const kept = Array.isArray(keptItems) ? keptItems : [];
  if (kept.length === 0) return proposal;

  const keptKeys = new Set(kept.map((item) => normalizeDraftFoodKey(item.foodName)));
  const substituteItems = proposal.items.filter(
    (item) => !keptKeys.has(normalizeDraftFoodKey(item.foodName)),
  );
  const mealType = String(proposal.mealType || adviceContext?.currentMealType || 'pranzo').toLowerCase();
  const items = [...kept.map((item) => ({ ...item })), ...substituteItems];
  const totals = roundTotals(sumItemMacros(items));
  return {
    ...proposal,
    mealType,
    items,
    totals,
  };
}

function buildSubstituteFallbackProposals(adviceContext = {}) {
  const kept = adviceContext?.keptDraftProjection?.items || [];
  const residualCap = Math.round(Number(adviceContext?.residualBudgetAfterRemoval?.kcal) || 0);
  const mealType = String(
    adviceContext?.keptDraftProjection?.mealType
    || adviceContext?.currentMealType
    || 'pranzo',
  ).toLowerCase();
  const fallback = Array.isArray(adviceContext?.fallbackMealProposals)
    ? adviceContext.fallbackMealProposals
    : [];

  return fallback
    .map((proposal, index) => {
      const enriched = enrichMealProposal(proposal, adviceContext);
      if (!enriched) return null;
      const substituteOnly = (enriched.items || []).filter(
        (item) => !kept.some(
          (keptItem) => normalizeDraftFoodKey(keptItem.foodName) === normalizeDraftFoodKey(item.foodName),
        ),
      );
      const capped = enforceProposalBudgetCap(
        { ...enriched, items: substituteOnly },
        residualCap > 0 ? residualCap : Math.round(Number(adviceContext?.remainingBudget?.kcal) || 0),
        adviceContext,
      );
      if (!capped) return null;
      return mergeKeptItemsIntoSubstituteProposal(
        {
          ...capped,
          id: `substitute_fallback_${index + 1}`,
          label: `Opzione ${index + 1}`,
          source: 'what_if_substitute_fallback',
        },
        kept,
        adviceContext,
      );
    })
    .map((proposal) => enforceProposalBudgetCap(
      proposal,
      Math.round(Number(adviceContext?.remainingBudget?.kcal) || 0),
      adviceContext,
    ))
    .filter(Boolean)
    .slice(0, MAX_HABIT_PROPOSALS);
}

/**
 * Garantisce 3 proposte pasto per SUBSTITUTE_MEAL_DRAFT_ITEM (buoni + sostituto).
 * @param {Array<object>} mealProposals
 * @param {object} adviceContext
 * @returns {Array<object>}
 */
export function ensureMealProposalsForSubstituteDraft(mealProposals, adviceContext = {}) {
  const budgetKcal = Math.round(Number(adviceContext?.remainingBudget?.kcal) || 0);
  const kept = adviceContext?.keptDraftProjection?.items || [];
  const residualCap = Math.round(Number(adviceContext?.residualBudgetAfterRemoval?.kcal) || budgetKcal);

  let proposals = sanitizeMealProposals(mealProposals, adviceContext)
    .map((proposal) => mergeKeptItemsIntoSubstituteProposal(proposal, kept, adviceContext))
    .map((proposal) => {
      const substituteOnly = (proposal.items || []).filter(
        (item) => !kept.some(
          (keptItem) => normalizeDraftFoodKey(keptItem.foodName) === normalizeDraftFoodKey(item.foodName),
        ),
      );
      const substituteTotals = roundTotals(sumItemMacros(substituteOnly));
      if (residualCap > 0 && substituteTotals.kcal > residualCap) {
        return enforceProposalBudgetCap(
          { ...proposal, items: [...kept, ...substituteOnly] },
          budgetKcal,
          adviceContext,
        );
      }
      return enforceProposalBudgetCap(proposal, budgetKcal, adviceContext);
    })
    .filter(Boolean);

  if (proposals.length === 0) {
    proposals = buildSubstituteFallbackProposals(adviceContext);
  }

  return proposals
    .slice(0, MAX_HABIT_PROPOSALS)
    .map((proposal, index) => ({
      ...proposal,
      label: proposal.label || `Opzione ${index + 1}`,
    }));
}

export function buildSubstituteMealDraftAdviceMessage(adviceContext = {}) {
  const removedName = String(
    adviceContext?.removedDraftItem?.foodName || 'quell\'alimento',
  ).trim();
  return `Ho rimosso ${removedName}. Ecco 3 alternative che completano il tuo pasto tenendoti perfettamente nel budget.`;
}

const MEAL_TYPE_LABELS = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Snack',
};

export function buildUpdateLoggedMealAdviceMessage(adviceContext = {}) {
  const mealType = String(adviceContext?.existingMealNode?.mealType || 'pasto').toLowerCase();
  const mealLabel = MEAL_TYPE_LABELS[mealType] || 'Pasto';
  return `Ho recuperato il tuo ${mealLabel}. Ecco la versione aggiornata, conferma per sovrascrivere.`;
}

export function buildConsultantMealAdviceMessage(adviceContext = {}) {
  const anchor = String(adviceContext?.consultantMealRequest?.anchorFood || 'alimento').trim();
  const mealType = String(adviceContext?.consultantMealRequest?.mealType || 'pasto').toLowerCase();
  const mealLabel = MEAL_TYPE_LABELS[mealType] || 'Pasto';
  const budget = adviceContext?.remainingBudget || {};
  const kcal = Math.round(Number(budget.kcal) || 0);
  return `Ho usato ${anchor} come base per la tua ${mealLabel.toLowerCase()}. Ecco 3 combinazioni che completano i macro rimanenti (${kcal} kcal). Scegli un'opzione e caricala nel diario.`;
}

export function buildWipMealAdviceMessage(adviceContext = {}) {
  const items = Array.isArray(adviceContext?.wipMealProjection?.items)
    ? adviceContext.wipMealProjection.items
    : [];
  const lastItem = items[items.length - 1];
  const foodLabel = String(lastItem?.foodName || 'alimento').trim();
  const maxKcal = Number(
    adviceContext?.wipConstraints?.maxCalories
    ?? adviceContext?.mealWip?.constraints?.maxCalories,
  );
  const residual = Number(adviceContext?.residualBudgetAfterWipMeal?.kcal);
  const residualHint = Number.isFinite(residual) && residual >= 0
    ? ` Residuo ~${Math.round(residual)} kcal.`
    : '';
  const limitHint = Number.isFinite(maxKcal) && maxKcal > 0
    ? ` Vincolo ${Math.round(maxKcal)} kcal.`
    : '';
  if (!lastItem) {
    return `🍽️ Perfetto, apriamo il carrello WIP.${limitHint} Dimmi cosa aggiungere e calcolo io le porzioni.`;
  }
  return `✅ Ottima scelta: ${foodLabel}.${limitHint}${residualHint} 💡 Usa i suggerimenti qui sotto o dimmi cosa aggiungere — chiudiamo solo quando mi dici di inserire.`;
}

/**
 * Sanitizza Smart Chips WIP Meal Builder dall'LLM.
 * @param {Array<object>} suggestions
 * @param {object} [adviceContext]
 * @returns {Array<object>}
 */
export function sanitizeWipSuggestions(suggestions, adviceContext = {}) {
  const wipItems = Array.isArray(adviceContext?.wipMealProjection?.items)
    ? adviceContext.wipMealProjection.items
    : [];
  const wipNames = new Set(
    wipItems
      .map((item) => normalizeWipFoodNameKey(item?.foodName || item?.name))
      .filter(Boolean),
  );
  const constraintResidual = Number(adviceContext?.residualBudgetAfterWipMeal?.kcal);
  const constraintMax = Number(
    adviceContext?.wipConstraints?.maxCalories
    ?? adviceContext?.mealWip?.constraints?.maxCalories
    ?? adviceContext?.wipMealProjection?.constraints?.maxCalories,
  );
  const residualKcal = Number.isFinite(constraintResidual) && constraintResidual >= 0
    ? Math.round(constraintResidual)
    : (Number.isFinite(constraintMax) && constraintMax > 0
      ? Math.max(0, Math.round(constraintMax - (Number(adviceContext?.wipMealProjection?.totals?.kcal) || 0)))
      : Math.round(Number(adviceContext?.remainingBudget?.kcal) || 0));

  return (Array.isArray(suggestions) ? suggestions : [])
    .map((entry, index) => {
      const name = String(entry?.name || entry?.foodName || '').trim();
      let weight = Math.round(Number(entry?.weight ?? entry?.grams) || 0);
      if (!name || weight <= 0) return null;

      const normalizedName = normalizeWipFoodNameKey(name);
      if (wipNames.has(normalizedName)) return null;
      const firstToken = normalizeWipFoodNameKey(name.split(/\s+/)[0]);
      if (firstToken && wipNames.has(firstToken)) return null;

      const macros = entry?.macros && typeof entry.macros === 'object' ? entry.macros : entry;
      let calories = Math.round(Number(entry?.calories ?? entry?.kcal) || 0);
      let prot = Number(macros?.prot ?? macros?.pro) || 0;
      let carb = Number(macros?.carb ?? macros?.carbo) || 0;
      let fat = Number(macros?.fat) || 0;

      // Scala sul residuo WIP se la proposta sforerebbe il vincolo
      if (residualKcal > 0 && calories > residualKcal && weight > 0 && calories > 0) {
        const density = (calories / weight) * 100;
        const scaledGrams = Math.floor((residualKcal / density) * 100);
        if (scaledGrams > 0) {
          const ratio = scaledGrams / weight;
          weight = scaledGrams;
          calories = Math.round(calories * ratio);
          prot = Math.round(prot * ratio * 10) / 10;
          carb = Math.round(carb * ratio * 10) / 10;
          fat = Math.round(fat * ratio * 10) / 10;
        }
      }

      if (residualKcal > 0 && calories > residualKcal * 1.15) return null;

      return {
        id: `wip_chip_${index}_${normalizedName.replace(/\s+/g, '_')}`,
        name,
        weight,
        calories: calories > 0 ? calories : null,
        macros: { prot, carb, fat },
        reason: String(entry?.reason || '').trim() || null,
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * Card preview locale (turno 1) clonando gli items del nodo esistente.
 * @param {object} existingMealNode
 * @returns {object | null}
 */
export function buildUpdateLoggedMealPreviewProposal(existingMealNode) {
  if (!existingMealNode?.targetNodeId) return null;
  const items = Array.isArray(existingMealNode.items)
    ? existingMealNode.items.map((item) => ({
        foodName: String(item?.foodName || item?.name || '').trim(),
        foodDbKey: item?.foodDbKey ?? null,
        grams: Math.round(Number(item?.grams ?? item?.qta) || 0),
        kcal: Math.round(Number(item?.kcal) || 0),
        pro: Number(item?.pro) || 0,
        carbo: Number(item?.carbo) || 0,
        fat: Number(item?.fat) || 0,
      })).filter((item) => item.foodName && item.grams > 0)
    : [];
  if (items.length === 0) return null;

  return {
    id: `update_preview_${existingMealNode.targetNodeId}_${Date.now()}`,
    label: 'Pasto recuperato',
    mealType: existingMealNode.mealType,
    exactTime: existingMealNode.exactTime || null,
    targetNodeId: existingMealNode.targetNodeId,
    source: 'logged_meal_update_preview',
    upsertAction: 'replace',
    action: 'replace',
    baselineItems: items,
    operations: [],
    resultingItems: items,
    items,
    totals: existingMealNode.totals || roundTotals(sumItemMacros(items)),
  };
}

/**
 * Garantisce una singola mealProposal per UPDATE_LOGGED_MEAL con targetNodeId.
 * @param {Array<object>} mealProposals
 * @param {object} adviceContext
 * @returns {Array<object>}
 */
export function ensureMealProposalsForUpdateLoggedMeal(mealProposals, adviceContext = {}) {
  const existing = adviceContext?.existingMealNode;
  if (!existing?.targetNodeId) return [];

  const existingItems = Array.isArray(existing.items) ? existing.items : [];

  const pickValidUpdateItems = (items) => {
    const source = Array.isArray(items) ? items : [];
    return source
      .map((item) => ({
        itemId: item?.itemId != null ? String(item.itemId).trim() : null,
        foodName: String(item?.foodName || item?.name || '').trim(),
        foodDbKey: item?.foodDbKey ?? null,
        grams: Math.round(Number(item?.grams ?? item?.qta) || 0),
        kcal: Math.round(Number(item?.kcal) || 0),
        pro: Number(item?.pro) || 0,
        carbo: Number(item?.carbo) || 0,
        fat: Number(item?.fat) || 0,
      }))
      .filter((item) => item.foodName && item.grams > 0)
      .map(({ itemId, ...rest }) => (itemId ? { itemId, ...rest } : rest));
  };

  const sanitizeOperations = (operations) => {
    if (!Array.isArray(operations)) return [];
    return operations
      .map((op) => {
        if (!op || typeof op !== 'object') return null;
        const action = String(op.action || '').trim().toLowerCase();
        if (!['add', 'update', 'delete'].includes(action)) return null;
        const targetItemId = op.targetItemId != null ? String(op.targetItemId).trim() : '';
        const matchHint = op.matchHint != null ? String(op.matchHint).trim() : '';
        const updated = op.updatedFood && typeof op.updatedFood === 'object'
          ? {
              foodName: String(op.updatedFood.foodName || '').trim(),
              grams: Math.round(Number(op.updatedFood.grams) || 0),
            }
          : null;
        return {
          action,
          ...(targetItemId ? { targetItemId } : {}),
          ...(matchHint ? { matchHint } : {}),
          ...(updated?.foodName && updated.grams > 0 ? { updatedFood: updated } : {}),
        };
      })
      .filter(Boolean);
  };

  const sanitized = sanitizeMealProposals(mealProposals, adviceContext).filter(Boolean);

  const diaryMeal = (Array.isArray(adviceContext?.todayDiaryIndex) ? adviceContext.todayDiaryIndex : [])
    .find((meal) => String(meal?.targetNodeId || meal?.mealId || '') === String(existing.targetNodeId));
  const diaryItems = Array.isArray(diaryMeal?.items) ? diaryMeal.items : [];

  const baselineItems = existingItems.map((item, index) => {
    const foodName = String(item?.foodName || item?.name || '').trim();
    const grams = Math.round(Number(item?.grams ?? item?.qta) || 0);
    const byId = diaryItems.find((d) => String(d?.itemId || '') === String(item?.itemId || ''));
    const byNameGrams = diaryItems.find((d) =>
      String(d?.foodName || '').trim().toLowerCase() === foodName.toLowerCase()
      && Math.round(Number(d?.grams) || 0) === grams,
    );
    const byIndex = diaryItems[index];
    const itemId = String(
      item?.itemId
      || byId?.itemId
      || byNameGrams?.itemId
      || byIndex?.itemId
      || '',
    ).trim();
    return {
      ...item,
      foodName,
      grams,
      ...(itemId ? { itemId } : {}),
    };
  });

  if (sanitized.length > 0) {
    const proposal = sanitized[0];
    const operations = Array.isArray(proposal.operations)
      ? proposal.operations
      : sanitizeOperations(mealProposals?.[0]?.operations);
    const opsApplied = operations.length > 0
      ? applyMealOperations(baselineItems, operations)
      : [];
    const validItems = pickValidUpdateItems(
      opsApplied.length > 0
        ? opsApplied
        : (proposal.resultingItems || proposal.items),
    );
    const resolvedItems = validItems.length > 0 ? validItems : pickValidUpdateItems(existingItems);
    const totals = resolvedItems.length > 0
      ? roundTotals(sumItemMacros(resolvedItems))
      : (proposal.totals || existing.totals);
    const onlyAdds = operations.length > 0
      && operations.every((op) => String(op?.action || '').toLowerCase() === 'add');
    const upsertAction = onlyAdds || String(adviceContext?.forcedUpsertAction || '') === 'merge'
      ? 'merge'
      : 'replace';
    return [{
      ...proposal,
      id: proposal.id || `update_${existing.targetNodeId}_${Date.now()}`,
      label: proposal.label || (upsertAction === 'merge' ? 'Aggiunta al pasto' : 'Pasto aggiornato'),
      mealType: existing.mealType || proposal.mealType,
      exactTime: existing.exactTime || proposal.exactTime || null,
      targetNodeId: existing.targetNodeId,
      source: upsertAction === 'merge' ? 'logged_meal_merge' : 'logged_meal_update',
      upsertAction,
      action: upsertAction,
      operations,
      baselineItems,
      resultingItems: resolvedItems,
      items: resolvedItems,
      totals,
    }];
  }

  return [{
    id: `update_${existing.targetNodeId}_${Date.now()}`,
    label: 'Pasto aggiornato',
    mealType: existing.mealType,
    exactTime: existing.exactTime || null,
    targetNodeId: existing.targetNodeId,
    source: 'logged_meal_update_fallback',
    upsertAction: 'replace',
    action: 'replace',
    operations: [],
    baselineItems,
    resultingItems: existingItems,
    items: existingItems,
    totals: existing.totals,
  }];
}

/**
 * Converte un payload ADD_FOOD completo in una singola mealProposal (card riepilogo pasto consumato).
 *
 * @param {object} payload
 * @param {object} currentAppState
 * @param {{ label?: string }} [options]
 * @returns {object | null}
 */
export function buildMealLogProposalFromPayload(payload, currentAppState = {}, options = {}) {
  const foodDb = currentAppState?.foodDatabase || {};
  const kentuItDb = currentAppState?.kentuItDatabase || currentAppState?.kentuItDb || {};
  const globalDb = currentAppState?.globalFoodDatabase || currentAppState?.globalDb || currentAppState?.masterDb || {};
  const fullHistory = currentAppState?.fullHistory || {};
  const userText = String(options.userText || '').trim();
  const conversationTexts = Array.isArray(options.conversationTexts)
    ? options.conversationTexts
    : (userText ? [userText] : []);

  const withDefaults = applyMealRegistrationSmartDefaults(payload, conversationTexts);
  const rawItems = expandFoodPayloadItems(withDefaults);
  if (rawItems.length === 0) return null;

  const mealType = withDefaults.mealType;
  const exactTime = withDefaults.exactTime;

  const resolveContext = {
    foodDb,
    kentuItDb,
    globalDb,
    fullHistory,
    mealType,
  };
  const resolvedItems = resolveMealProposalItems(
    rawItems.map((item) => ({
      rawQuery: item.spokenFoodName || item.foodName,
      foodName: item.foodName,
      grams: item.grams,
      // Chiave esatta dal wizard/click/fast-path: evita re-fuzzy.
      foodDbKey: item.foodDbKey ?? item.foodId ?? null,
      searchKeywords: item.searchKeywords || null,
    })),
    resolveContext,
  ).map((resolved, idx) => {
    // Preferisci emoji LLM sull'item grezzo corrispondente (stesso ordine / nome).
    const src = rawItems[idx] || rawItems.find(
      (r) => String(r.foodName || '').toLowerCase() === String(resolved?.foodName || '').toLowerCase(),
    );
    const srcIcon = String(src?.icon || '').trim();
    const spoken = String(src?.spokenFoodName || '').trim();
    return {
      ...resolved,
      ...(srcIcon ? { icon: srcIcon } : {}),
      ...(spoken ? { spokenFoodName: spoken } : {}),
      ...(Array.isArray(src?.searchKeywords) ? { searchKeywords: src.searchKeywords } : {}),
    };
  });
  const items = deduplicateMealProposalItems(resolvedItems);

  if (items.length === 0) return null;

  const defaultLabel = items.length === 1
    ? `${items[0].foodName} (${items[0].grams}g)`
    : items.map((item) => item.foodName).join(' + ');

  return {
    id: `meal_log_${Date.now()}_${items.map((i) => i.foodDbKey || i.foodName).join('_')}`,
    label: String(options.label || `Riepilogo: ${defaultLabel}`).trim(),
    mealType,
    exactTime,
    source: 'user_meal_log',
    upsertAction: 'append',
    action: 'append',
    items,
    totals: roundTotals(sumProposalItemMacros(items)),
  };
}

function resolveWorkoutCandidateName(entry) {
  if (!entry || typeof entry !== 'object') return 'Allenamento';
  const title = String(entry.title || '').trim();
  if (title) return title.replace(/^Previsto:\s*/i, '').trim() || title;
  const label = String(entry.label || entry.desc || entry.name || '').trim();
  if (label) return label;
  const muscles = Array.isArray(entry.muscles) ? entry.muscles.join(' · ') : '';
  if (muscles) return muscles;
  const subType = String(entry.subType || entry.workoutType || '').trim();
  if (subType) return subType;
  return 'Allenamento';
}

function pushWorkoutCandidate(bucket, candidate) {
  if (!candidate || !Number.isFinite(candidate.timeDecimal)) return;
  bucket.push(candidate);
}

/**
 * Giorno di riposo / recupero nel Costruttore Settimanale (nessun allenamento imminente).
 * @param {import('../features/weeklyBlocks/weeklyBlockSchema').DayBlock | null | undefined} planBlock
 * @returns {boolean}
 */
export function isPlannedRestDayBlock(planBlock) {
  if (!planBlock?.activity) return false;
  const kind = String(planBlock.activity.kind || '').toUpperCase();
  if (kind === 'REST' || kind === 'RECOVERY') return true;
  return String(planBlock.meta?.plannerWorkoutType || '').toLowerCase() === 'riposo';
}

/**
 * Strategia calorica del giorno dal piano settimanale (surplus in allenamento, deficit in riposo).
 * @param {object} currentAppState
 * @returns {{
 *   hasWeeklyDayPlan: boolean,
 *   directive: 'deficit' | 'surplus' | 'maintenance' | 'refeed' | 'custom' | null,
 *   status: string | null,
 *   deltaKcal: number,
 *   targetKcal: number,
 *   activityLabel: string | null,
 *   dayKind: string | null,
 *   isRestDay: boolean,
 *   isTrainingDay: boolean,
 *   rationale: string | null,
 * }}
 */
export function buildDailyCalorieStrategyContext(currentAppState = {}) {
  const planBlock = currentAppState?.todayPlanBlock;
  const profileKcal = Math.round(Number(currentAppState?.userTargets?.kcal) || 2000);
  const dynamicKcal = Number(currentAppState?.dynamicDailyKcal);

  if (!isUserAssignedDayBlock(planBlock)) {
    const fallbackTarget = Number.isFinite(dynamicKcal) && dynamicKcal > 0
      ? Math.round(dynamicKcal)
      : profileKcal;
    return {
      hasWeeklyDayPlan: false,
      directive: null,
      status: null,
      deltaKcal: 0,
      targetKcal: fallbackTarget,
      activityLabel: null,
      dayKind: null,
      isRestDay: false,
      isTrainingDay: false,
      rationale: null,
    };
  }

  const isRestDay = isPlannedRestDayBlock(planBlock);
  const isTrainingDay = isActiveDayBlock(planBlock);
  const strat = planBlock.calorieStrategy || {};
  const blockDelta = Math.round(Number(strat.deltaKcal) || 0);

  let directive = String(strat.status || 'maintenance');
  let deltaKcal = blockDelta;

  if (isRestDay) {
    directive = 'deficit';
    deltaKcal = blockDelta < 0 ? blockDelta : DEFAULT_STRATEGY_DELTA.deficit;
  } else if (isTrainingDay) {
    directive = 'surplus';
    deltaKcal = blockDelta > 0 ? blockDelta : DEFAULT_STRATEGY_DELTA.surplus;
  }

  const plannedTarget = resolveBlockKcalTarget(planBlock, profileKcal);
  const targetKcal = Number.isFinite(dynamicKcal) && dynamicKcal > 0
    ? Math.round(dynamicKcal)
    : plannedTarget;

  return {
    hasWeeklyDayPlan: true,
    directive,
    status: String(strat.status || directive),
    deltaKcal,
    targetKcal,
    activityLabel: activityLabelFromBlock(planBlock),
    dayKind: String(planBlock.activity?.kind || '').toUpperCase() || null,
    isRestDay,
    isTrainingDay,
    rationale: isRestDay
      ? 'Giorno di riposo nel Costruttore Settimanale: priorità deficit calorico e recupero.'
      : isTrainingDay
        ? 'Giorno di allenamento nel Costruttore Settimanale: priorità surplus calorico per performance.'
        : 'Giorno pianificato nel Costruttore Settimanale: rispetta la strategia del blocco.',
  };
}

/**
 * Prossimo allenamento futuro rispetto all'orario attuale (null se assente o già svolto).
 *
 * @param {object} currentAppState
 * @returns {null | {
 *   name: string,
 *   startsInMinutes: number,
 *   startsInHours: number,
 *   timeLabel: string,
 *   timeDecimal: number,
 *   source: string,
 *   isWithinPreWorkoutWindow: boolean,
 * }}
 */
export function resolveUpcomingWorkout(currentAppState = {}) {
  const now = Number(currentAppState?.decimalHour);
  if (!Number.isFinite(now)) return null;

  const hasRealWorkout = currentAppState?.hasRealWorkoutToday === true
    || currentAppState?.isWorkoutDoneToday === true;
  if (hasRealWorkout) return null;

  const planBlock = currentAppState?.todayPlanBlock;
  const hasAssignedWeeklyPlan = isUserAssignedDayBlock(planBlock);

  // Il Costruttore Settimanale è fonte di verità: in riposo/recupero non c'è pre-workout.
  if (hasAssignedWeeklyPlan && isPlannedRestDayBlock(planBlock)) {
    return null;
  }

  const candidates = [];

  const pushPlanBlockCandidate = () => {
    if (!planBlock?.activity || !isActiveDayBlock(planBlock)) return;
    const hourRaw = planBlock.activity.hour ?? planBlock.meta?.plannerStartTime;
    const hourDec = typeof hourRaw === 'number'
      ? hourRaw
      : parseFlexibleTimeToDecimal(String(hourRaw || ''));
    pushWorkoutCandidate(candidates, {
      timeDecimal: hourDec,
      name: activityLabelFromBlock(planBlock),
      source: 'day_plan_block',
    });
  };

  if (hasAssignedWeeklyPlan) {
    pushPlanBlockCandidate();
  } else {
    const scheduled = currentAppState?.scheduledWorkout;
    if (scheduled && Number.isFinite(Number(scheduled.workoutDecimalHour))) {
      pushWorkoutCandidate(candidates, {
        timeDecimal: Number(scheduled.workoutDecimalHour),
        name: String(scheduled.label || 'Allenamento').trim(),
        source: 'chat_scheduled',
      });
    }

    pushPlanBlockCandidate();

    const nodeSources = [
      ...(Array.isArray(currentAppState?.timelineNodes) ? currentAppState.timelineNodes : []),
      ...(Array.isArray(currentAppState?.manualNodes) ? currentAppState.manualNodes : []),
      ...(Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : []),
    ];

    nodeSources.forEach((entry) => {
      if (!entry) return;
      const type = String(entry.type || '').toLowerCase();
      if (type !== 'workout' && type !== 'ghost_workout' && type !== 'work') return;
      if (type === 'workout' && entry.isGhost === true) return;

      const hourDec = resolveActivityOrWorkoutTimelineHour(entry);
      pushWorkoutCandidate(candidates, {
        timeDecimal: hourDec,
        name: resolveWorkoutCandidateName(entry),
        source: type === 'ghost_workout' ? 'ghost_timeline' : 'diary_or_timeline',
      });
    });
  }

  const deduped = [];
  const seenTimes = new Set();
  candidates
    .filter((c) => Number.isFinite(c.timeDecimal))
    .sort((a, b) => a.timeDecimal - b.timeDecimal)
    .forEach((c) => {
      const key = c.timeDecimal.toFixed(2);
      if (seenTimes.has(key)) return;
      seenTimes.add(key);
      deduped.push(c);
    });

  const next = deduped.find((c) => c.timeDecimal > now - 0.02);
  if (!next) return null;

  const startsInMinutes = Math.round((next.timeDecimal - now) * 60);
  if (startsInMinutes <= 0) return null;

  return {
    name: next.name || 'Allenamento',
    startsInMinutes,
    startsInHours: Math.round((startsInMinutes / 60) * 10) / 10,
    timeLabel: formatDecimalHourIt(next.timeDecimal),
    timeDecimal: next.timeDecimal,
    source: next.source,
    isWithinPreWorkoutWindow: startsInMinutes <= PRE_WORKOUT_WINDOW_MINUTES,
  };
}

/**
 * Recupera le top 2-3 combo/pasti frequenti per la fascia oraria corrente.
 *
 * @param {object} currentAppState
 * @param {string} mealType
 * @returns {{ mealType: string, proposals: Array<object> }}
 */
export function buildUserHabitsForCurrentMeal(currentAppState = {}, mealType) {
  const canonMeal = toCanonicalMealType(String(mealType || '').split('_')[0]);
  const slot = MEAL_ORDER.includes(canonMeal) ? canonMeal : resolveCurrentMealType(currentAppState);

  const fullHistory = currentAppState?.fullHistory || {};
  const proposals = [];
  const seenIds = new Set();

  const combos = aggregatePredictiveMealCombos(
    fullHistory,
    slot,
    MAX_HABIT_PROPOSALS,
    HABIT_LOOKBACK_DAYS,
  );
  combos.forEach((combo) => {
    const proposal = mapComboToProposal(combo, slot);
    if (!proposal || proposal.items.length < 2 || seenIds.has(proposal.id)) return;
    seenIds.add(proposal.id);
    proposals.push(proposal);
  });

  if (proposals.length < MAX_HABIT_PROPOSALS) {
    const recent = buildProposalsFromRecentMealEvents(
      fullHistory,
      slot,
      seenIds,
      MAX_HABIT_PROPOSALS - proposals.length,
    );
    recent.forEach((proposal) => {
      if (proposal.items.length >= 2) proposals.push(proposal);
    });
  }

  return {
    mealType: slot,
    proposals: proposals.slice(0, MAX_HABIT_PROPOSALS),
  };
}

/**
 * @param {string} userText
 * @returns {boolean}
 */
export function isGenericMealSuggestionQuery(userText) {
  return isMealProposalQuery(userText);
}

function pickTargets(currentAppState) {
  const targets = currentAppState?.userTargets || {};
  const strategy = buildDailyCalorieStrategyContext(currentAppState);
  const dynamicKcal = Number(currentAppState?.dynamicDailyKcal);
  const kcalTarget = Number.isFinite(dynamicKcal) && dynamicKcal > 0
    ? Math.round(dynamicKcal)
    : strategy.hasWeeklyDayPlan && strategy.targetKcal > 0
      ? strategy.targetKcal
      : Math.round(Number(targets.kcal) || 2000);
  return {
    kcal: kcalTarget,
    pro: Number(targets.prot ?? targets.pro ?? 150) || 150,
    carbo: Number(targets.carb ?? targets.cho ?? 200) || 200,
    fat: Number(targets.fatTotal ?? targets.fat ?? 65) || 65,
  };
}

/**
 * Scontrino dogmatico millimetrico: Target − Consumato = Rimanenti (signed).
 * Fonte unica per il Solver Consultant (P/C/F/kcal).
 * @param {object} currentAppState
 * @returns {{
 *   target: { kcal: number, pro: number, carbo: number, fat: number },
 *   consumed: { kcal: number, pro: number, carbo: number, fat: number },
 *   remaining: { kcal: number, pro: number, carbo: number, fat: number },
 *   note: string,
 * }}
 */
export function buildDogmaticMacroReceipt(currentAppState = {}) {
  const log = Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : [];
  const totali = computeTotali(log);
  const target = pickTargets(currentAppState);
  const consumed = {
    kcal: roundMacro(totali?.kcal ?? totali?.cal ?? 0),
    pro: roundMacro(totali?.prot ?? totali?.pro ?? 0),
    carbo: roundMacro(totali?.carb ?? totali?.carbo ?? totali?.cho ?? 0),
    fat: roundMacro(totali?.fatTotal ?? totali?.fat ?? 0),
  };
  const remaining = {
    kcal: roundMacro(target.kcal - consumed.kcal),
    pro: roundMacro(target.pro - consumed.pro),
    carbo: roundMacro(target.carbo - consumed.carbo),
    fat: roundMacro(target.fat - consumed.fat),
  };
  return {
    target: {
      kcal: Math.round(target.kcal),
      pro: roundMacro(target.pro),
      carbo: roundMacro(target.carbo),
      fat: roundMacro(target.fat),
    },
    consumed,
    remaining,
    note: 'remaining firmato: positivo = ancora da coprire; negativo = sforamento già accumulato. Target kcal = equazione dogmatica (dynamicDailyKcal).',
  };
}

function computeRemainingBudget(currentAppState) {
  const receipt = buildDogmaticMacroReceipt(currentAppState);
  const log = Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : [];
  const totali = computeTotali(log);
  const userTargets = currentAppState?.userTargets || {};

  const micros = {};
  MICRO_TELEMETRY_KEYS.forEach((key) => {
    const current = Number(totali?.[key]) || 0;
    const explicitTarget = Number(userTargets?.[key]);
    const fallbackTarget = Number(getTargetForNutrient(key));
    const target = Number.isFinite(explicitTarget) && explicitTarget > 0
      ? explicitTarget
      : Number.isFinite(fallbackTarget) && fallbackTarget > 0
        ? fallbackTarget
        : 0;
    const remaining = Math.max(0, roundMacro(target - current));
    micros[key] = {
      current: roundMacro(current),
      target: roundMacro(target),
      remaining,
      unit: MICRO_UNITS[key] || 'g',
    };
  });

  return {
    kcal: receipt.remaining.kcal,
    pro: receipt.remaining.pro,
    carbo: receipt.remaining.carbo,
    fat: receipt.remaining.fat,
    target: receipt.target,
    consumed: receipt.consumed,
    remaining: receipt.remaining,
    dogmaticReceipt: receipt,
    micros,
  };
}

function roundSignedMacro(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

/**
 * Proiezione in memoria post-pasto (anti race React/Firebase).
 * nuoviConsumi = store attuale + macro del pasto appena risolto;
 * budgetRimanente = targetOdierno − nuoviConsumi.
 * Non legge lo state post-setDailyLog (ancora stale).
 *
 * @param {object} currentAppState
 * @param {{ kcal?: number, cal?: number, pro?: number, prot?: number, carbo?: number, carb?: number, fat?: number, fatTotal?: number }} mealTotals
 * @returns {{
 *   meal: { kcal: number, pro: number, carbo: number, fat: number },
 *   consumiAttuali: { kcal: number, pro: number, carbo: number, fat: number },
 *   nuoviConsumi: { kcal: number, pro: number, carbo: number, fat: number },
 *   budgetRimanente: { kcal: number, pro: number, carbo: number, fat: number },
 *   targetOdierno: { kcal: number, pro: number, carbo: number, fat: number },
 * }}
 */
export function projectNutritionAfterMeal(currentAppState = {}, mealTotals = {}) {
  const log = Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : [];
  const totali = computeTotali(log);
  const targetOdierno = pickTargets(currentAppState);

  const meal = {
    kcal: roundMacro(mealTotals?.kcal ?? mealTotals?.cal ?? 0),
    pro: roundMacro(mealTotals?.pro ?? mealTotals?.prot ?? 0),
    carbo: roundMacro(mealTotals?.carbo ?? mealTotals?.carb ?? 0),
    fat: roundMacro(mealTotals?.fat ?? mealTotals?.fatTotal ?? 0),
  };

  const consumiAttuali = {
    kcal: roundMacro(totali?.kcal ?? totali?.cal ?? 0),
    pro: roundMacro(totali?.prot ?? totali?.pro ?? 0),
    carbo: roundMacro(totali?.carb ?? totali?.carbo ?? totali?.cho ?? 0),
    fat: roundMacro(totali?.fatTotal ?? totali?.fat ?? 0),
  };

  const nuoviConsumi = {
    kcal: roundMacro(consumiAttuali.kcal + meal.kcal),
    pro: roundMacro(consumiAttuali.pro + meal.pro),
    carbo: roundMacro(consumiAttuali.carbo + meal.carbo),
    fat: roundMacro(consumiAttuali.fat + meal.fat),
  };

  const budgetRimanente = {
    kcal: roundSignedMacro(targetOdierno.kcal - nuoviConsumi.kcal),
    pro: roundSignedMacro(targetOdierno.pro - nuoviConsumi.pro),
    carbo: roundSignedMacro(targetOdierno.carbo - nuoviConsumi.carbo),
    fat: roundSignedMacro(targetOdierno.fat - nuoviConsumi.fat),
  };

  return {
    meal,
    consumiAttuali,
    nuoviConsumi,
    budgetRimanente,
    targetOdierno,
  };
}

/**
 * Fallback deterministico se l'LLM copy non è disponibile.
 * @deprecated Preferire buildMealReceiptPayload + MealReceiptMessage.
 * @param {ReturnType<typeof projectNutritionAfterMeal>} projection
 * @param {string} [mealLabel]
 */
export function buildDeterministicMealLogFeedback(projection, mealLabel = '') {
  const meal = projection?.meal || {};
  const rem = projection?.budgetRimanente || {};
  const label = String(mealLabel || '').trim();
  const head = label
    ? `Hai registrato «${label}» (~${meal.kcal || 0} kcal · P${meal.pro || 0} C${meal.carbo || 0} F${meal.fat || 0}).`
    : `Hai registrato il pasto (~${meal.kcal || 0} kcal · P${meal.pro || 0} C${meal.carbo || 0} F${meal.fat || 0}).`;
  return (
    `${head} `
    + `ATTENZIONE — NUOVO budget rimanente aggiornato: `
    + `${rem.kcal ?? 0} kcal, Proteine ${rem.pro ?? 0}g, Carboidrati ${rem.carbo ?? 0}g, Grassi ${rem.fat ?? 0}g.`
  );
}

/**
 * Somma macro da items proposal / resultingItems (per accept senza ripassare dal resolver).
 * @param {Array<object>} items
 */
export function sumMealItemsMacros(items = []) {
  const list = Array.isArray(items) ? items : [];
  return {
    kcal: roundMacro(list.reduce((s, i) => s + (Number(i?.kcal ?? i?.cal) || 0), 0)),
    pro: roundMacro(list.reduce((s, i) => s + (Number(i?.pro ?? i?.prot) || 0), 0)),
    carbo: roundMacro(list.reduce((s, i) => s + (Number(i?.carbo ?? i?.carb) || 0), 0)),
    fat: roundMacro(list.reduce((s, i) => s + (Number(i?.fat ?? i?.fatTotal) || 0), 0)),
  };
}

function resolveCortisolScoreAtHour(currentAppState = {}, decimalHour) {
  const h = Number(decimalHour);
  if (!Number.isFinite(h)) return null;
  const activeLog = Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : [];
  const manualNodes = Array.isArray(currentAppState?.manualNodes)
    ? currentAppState.manualNodes
    : Array.isArray(currentAppState?.timelineNodes)
      ? currentAppState.timelineNodes
      : [];
  const curve = generateCortisolCurve(activeLog, manualNodes);
  if (!Array.isArray(curve) || curve.length === 0) return null;
  let closest = curve[0];
  let minDist = Math.abs(curve[0].time - h);
  for (let i = 1; i < curve.length; i += 1) {
    const dist = Math.abs(curve[i].time - h);
    if (dist < minDist) {
      minDist = dist;
      closest = curve[i];
    }
  }
  const score = Number(closest?.cortisolScore);
  return Number.isFinite(score) ? Math.round(score) : null;
}

/**
 * Contesto serale per regole anti-cortisolo e Digestive Safety Gate.
 * @param {object} currentAppState
 * @returns {{
 *   isDinnerContext: boolean,
 *   isEvening: boolean,
 *   cortisolScore: number | null,
 *   eveningStressRisk: 'high' | 'low',
 *   bodyBatteryPercent: number | null,
 * }}
 */
export function buildEveningMetabolicContext(currentAppState = {}) {
  const decimalHour = Number(currentAppState?.decimalHour);
  const isEvening = Number.isFinite(decimalHour) && decimalHour >= 18;
  const currentMealType = resolveCurrentMealType(currentAppState);
  const isDinnerContext = currentMealType === 'cena' || isEvening;

  const cortisolFromState = Number(currentAppState?.dailyStats?.cortisolScore);
  const cortisolScore = Number.isFinite(cortisolFromState)
    ? Math.round(cortisolFromState)
    : resolveCortisolScoreAtHour(currentAppState, decimalHour);

  const bodyBattery = Number(currentAppState?.dailyStats?.bodyBatteryPercent);
  const energyAt20 = Number(currentAppState?.dailyStats?.energyAt20);

  const eveningStressRisk = (
    (Number.isFinite(cortisolScore) && cortisolScore >= 50 && isEvening)
    || (Number.isFinite(energyAt20) && energyAt20 < 40)
    || (Number.isFinite(bodyBattery) && bodyBattery < 40 && isEvening)
  ) ? 'high' : 'low';

  return {
    isDinnerContext,
    isEvening,
    cortisolScore: Number.isFinite(cortisolScore) ? cortisolScore : null,
    eveningStressRisk,
    bodyBatteryPercent: Number.isFinite(bodyBattery) ? Math.round(bodyBattery) : null,
  };
}

function mealsLoggedToday(log) {
  const set = new Set();
  (log || []).forEach((entry) => {
    if (!entry || (entry.type !== 'food' && entry.type !== 'recipe')) return;
    const canon = toCanonicalMealType(String(entry.mealType || '').split('_')[0]);
    if (MEAL_ORDER.includes(canon)) set.add(canon);
  });
  return set;
}

function fallbackMealTypeByHour(decimalHour) {
  const h = Number(decimalHour);
  if (!Number.isFinite(h)) return 'pranzo';
  if (h >= 5 && h < 10) return 'colazione';
  if (h >= 10 && h < 12.5) return 'snack';
  if (h >= 12.5 && h < 14.5) return 'pranzo';
  if (h >= 14.5 && h < 19) return 'snack';
  return 'cena';
}

function resolveCurrentMealType(currentAppState) {
  const decimalHour = Number(currentAppState?.decimalHour);
  const log = Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : [];

  if (typeof currentAppState?.predictMealType === 'function') {
    const predicted = currentAppState.predictMealType(
      Number.isFinite(decimalHour) ? decimalHour : undefined,
    );
    const canon = toCanonicalMealType(String(predicted || '').split('_')[0]);
    if (MEAL_ORDER.includes(canon)) return canon;
  }

  const fromState = inferDefaultMealType(currentAppState);
  if (fromState) return fromState;

  analyzeTodayFromLog(log, toCanonicalMealType);
  const logged = mealsLoggedToday(log);
  for (let i = 0; i < MEAL_ORDER.length; i += 1) {
    if (!logged.has(MEAL_ORDER[i])) return MEAL_ORDER[i];
  }

  return fallbackMealTypeByHour(decimalHour);
}

function mapCandidateToPortion(row, foodDb, fullHistory, mealType) {
  const dbKey = row.id;
  const name = String(row.name || row.desc || dbKey || '').trim();
  if (!name) return null;

  const portion = estraiDatiFoodDb({
    nome: name,
    qta: STANDARD_PORTION_G,
    pastoType: mealType,
    preferredDbKey: dbKey,
    foodDb: foodDb || {},
    fullHistory: fullHistory || {},
  });

  return {
    dbKey,
    name: String(portion.desc || portion.name || name),
    portionGrams: STANDARD_PORTION_G,
    kcal: roundMacro(portion.kcal ?? portion.cal),
    pro: roundMacro(portion.prot),
    carbo: roundMacro(portion.carb),
    fat: roundMacro(portion.fatTotal ?? portion.fat),
  };
}

function buildFoodCandidates(targetFood, currentAppState, mealType) {
  const foodDb = currentAppState?.foodDatabase || {};
  const kentuItDb = currentAppState?.kentuItDatabase || {};
  const globalDb = currentAppState?.globalFoodDatabase || {};
  const fullHistory = currentAppState?.fullHistory || {};
  const query = String(targetFood || '').trim();
  if (!query) return [];

  const cascadeMatch = findFoodDbMatchCascading({
    personalDb: foodDb,
    kentuItDb,
    globalDb,
    nome: query,
  });
  if (cascadeMatch) {
    const portion = mapCandidateToPortion(
      { id: cascadeMatch.key, name: cascadeMatch.foodDb[cascadeMatch.key]?.desc },
      cascadeMatch.foodDb,
      fullHistory,
      mealType,
    );
    return portion ? [portion] : [];
  }

  const hits = searchFoodsDetailed(foodDb, query, {
    limit: 3,
    mode: 'search',
    includeUserHistory: true,
  });

  return hits
    .map((row) => mapCandidateToPortion(row, foodDb, fullHistory, mealType))
    .filter(Boolean);
}

/**
 * Estrae l'alimento target da una domanda consulenziale ("Posso mangiare una pizza?").
 * @param {string} userText
 * @returns {string}
 */
export function extractTargetFoodFromQuery(userText) {
  let t = String(userText || '').trim().replace(/\?+$/, '').trim();
  if (!t) return '';

  const stripPatterns = [
    /^posso\s+(?:mangiare|prendere|avere|permettere\s+di\s+mangiare)\s+(?:una?\s+|un\s+|delle?\s+|del\s+|della\s+|dei\s+|degli\s+)?/i,
    /^conviene\s+(?:mangiare|prendere)\s+(?:una?\s+|un\s+)?/i,
    /^mi\s+consigli\s+(?:di\s+)?(?:mangiare\s+)?(?:una?\s+|un\s+)?/i,
    /^(?:è|e)\s+ok\s+(?:mangiare\s+)?(?:una?\s+|un\s+)?/i,
    /^va\s+bene\s+(?:mangiare\s+)?(?:una?\s+|un\s+)?/i,
    /^se\s+mangio\s+(?:una?\s+|un\s+)?/i,
    /^quanto\s+(?:posso\s+)?mangiare\s+(?:di\s+|d\s+)?/i,
    /^dentro\s+(?:al\s+)?budget\s+(?:mangiare\s+)?(?:una?\s+|un\s+)?/i,
    /^cosa\s+(?:mi\s+)?(?:proponi|suggerisci|consigli)\s+(?:per\s+)?(?:la\s+|il\s+|l')?(?:colazione|pranzo|cena|snack)?\??/i,
    /^(?:che|cosa)\s+(?:pasto|cosa)\s+(?:mangio|preparo)\??/i,
  ];

  for (let i = 0; i < stripPatterns.length; i += 1) {
    t = t.replace(stripPatterns[i], '').trim();
  }

  return t || String(userText || '').trim();
}

/**
 * Contesto nutrizionale condiviso (budget, abitudini, workout) per ADD_FOOD e ADVICE.
 * @param {object} currentAppState
 * @returns {{
 *   currentMealType: string,
 *   remainingBudget: { kcal: number, pro: number, carbo: number, fat: number },
 *   userHabitsForCurrentMeal: { mealType: string, proposals: Array<object> },
 *   upcomingWorkout: object | null,
 * }}
 */
export function buildNutritionContextForState(currentAppState = {}) {
  const currentMealType = resolveCurrentMealType(currentAppState);
  return {
    currentMealType,
    remainingBudget: computeRemainingBudget(currentAppState),
    userHabitsForCurrentMeal: buildUserHabitsForCurrentMeal(currentAppState, currentMealType),
    upcomingWorkout: resolveUpcomingWorkout(currentAppState),
    dailyCalorieStrategy: buildDailyCalorieStrategyContext(currentAppState),
  };
}

/**
 * Costruisce il contesto compatto per Kentu Solver (scontrino dogmatico + proposte).
 * @param {string} targetFood
 * @param {object} currentAppState
 * @returns {Promise<object>}
 */
export async function buildAdviceContext(targetFood, currentAppState = {}) {
  // Backward compatible signature: buildAdviceContext(targetFood, state, options?)
  const maybeOptions = arguments.length >= 3 ? arguments[2] : null; // eslint-disable-line prefer-rest-params
  const options = maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {};
  void (await Promise.resolve());
  const rawQuery = String(targetFood || '').trim();
  const isGenericSuggestion = isGenericMealSuggestionQuery(rawQuery);
  const intent = String(options?.intent || '').trim().toUpperCase() || null;
  const consultantMealRequest = options?.consultantMealRequest && typeof options.consultantMealRequest === 'object'
    ? options.consultantMealRequest
    : null;
  const isConsultantMealMode = intent === 'CONSULTANT_MEAL' || Boolean(consultantMealRequest?.anchorFood);
  const isWipMealMode = intent === 'WIP_MEAL_BUILD';
  const mealWipMeta = options?.mealWip && typeof options.mealWip === 'object'
    ? options.mealWip
    : null;
  const wipConstraints = options?.wipConstraints || mealWipMeta?.constraints || null;
  const wipSubIntent = String(options?.wipSubIntent || mealWipMeta?.subIntent || '').trim().toUpperCase() || null;
  const foodQuery = isGenericSuggestion ? '' : (extractTargetFoodFromQuery(rawQuery) || rawQuery);
  const foodDb = currentAppState?.foodDatabase || {};
  const kentuItDb = currentAppState?.kentuItDatabase || currentAppState?.kentuItDb || {};
  const globalDb = currentAppState?.globalFoodDatabase || currentAppState?.globalDb || currentAppState?.masterDb || {};
  const nutrition = buildNutritionContextForState(currentAppState);
  let currentMealType = nutrition.currentMealType;
  if (isConsultantMealMode && consultantMealRequest?.mealType) {
    currentMealType = consultantMealRequest.mealType;
  }
  if (isWipMealMode && options?.wipMealDeclaration?.mealType) {
    currentMealType = options.wipMealDeclaration.mealType;
  }
  const remainingBudget = nutrition.remainingBudget;
  const foodCandidates = foodQuery
    ? buildFoodCandidates(foodQuery, currentAppState, currentMealType)
    : [];
  const userHabitsForCurrentMeal = nutrition.userHabitsForCurrentMeal;
  const fallbackMealProposals = buildFallbackMealProposalsFromFoodDb(currentAppState, currentMealType);
  const upcomingWorkout = nutrition.upcomingWorkout;
  const dailyCalorieStrategy = nutrition.dailyCalorieStrategy;
  const eveningMetabolicContext = buildEveningMetabolicContext(currentAppState);

  // Day review payload (local aggregation) — allineato allo scontrino dogmatico.
  const activeLog = Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : [];
  const dailyTotals = computeTotali(activeLog);
  const dogmaticMacroReceipt = remainingBudget?.dogmaticReceipt
    || buildDogmaticMacroReceipt(currentAppState);
  const dailyTargets = {
    kcal: dogmaticMacroReceipt.target.kcal,
    prot: dogmaticMacroReceipt.target.pro,
    carb: dogmaticMacroReceipt.target.carbo,
    fat: dogmaticMacroReceipt.target.fat,
  };

  const partialMealRaw = options?.partialMeal && typeof options.partialMeal === 'object'
    ? options.partialMeal
    : null;
  const partialMealItemsRaw = Array.isArray(partialMealRaw?.items) ? partialMealRaw.items : [];
  const partialMealType = String(partialMealRaw?.mealType || currentMealType || '').trim() || currentMealType;

  const partialMealResolvedItems = partialMealItemsRaw
    .map((it) => enrichProposalItemWithResolver(
      {
        foodName: String(it?.foodName || it?.name || '').trim(),
        grams: Math.round(Number(it?.grams ?? it?.qta) || 0),
        rawQuery: String(it?.foodName || it?.name || '').trim(),
      },
      { foodDatabase: foodDb, kentuItDatabase: kentuItDb, globalFoodDatabase: globalDb, fullHistory: currentAppState?.fullHistory || {} },
      partialMealType,
    ))
    .filter(Boolean);

  const partialMealTotals = partialMealResolvedItems.length > 0
    ? roundTotals(sumItemMacros(partialMealResolvedItems))
    : { kcal: 0, pro: 0, carbo: 0, fat: 0 };

  const residualBudgetAfterPartialMeal =
    partialMealResolvedItems.length > 0
      ? computeResidualBudgetAfterPartialMeal(remainingBudget, partialMealTotals)
      : null;

  const wipMealItemsRaw = deduplicateWipItems(
    Array.isArray(options?.wipMealItems) ? options.wipMealItems : [],
  );
  const wipMealType = String(
    options?.wipMealDeclaration?.mealType
    || options?.wipMealMealType
    || currentMealType
    || '',
  ).trim() || currentMealType;

  const wipMealResolvedItems = wipMealItemsRaw
    .map((it) => enrichProposalItemWithResolver(
      {
        foodName: String(it?.foodName || it?.name || '').trim(),
        grams: Math.round(Number(it?.grams ?? it?.weight ?? it?.qta) || 0),
        rawQuery: String(it?.foodName || it?.name || '').trim(),
        kcal: Number(it?.kcal ?? it?.cal) || 0,
        pro: Number(it?.prot) || 0,
        carbo: Number(it?.carbo) || 0,
        fat: Number(it?.fat) || 0,
      },
      { foodDatabase: foodDb, kentuItDatabase: kentuItDb, globalFoodDatabase: globalDb, fullHistory: currentAppState?.fullHistory || {} },
      wipMealType,
    ))
    .filter(Boolean);

  const wipMealTotals = wipMealResolvedItems.length > 0
    ? roundTotals(sumItemMacros(wipMealResolvedItems))
    : { kcal: 0, pro: 0, carbo: 0, fat: 0 };

  const residualBudgetAfterWipMealBase = wipMealResolvedItems.length > 0
    ? computeResidualBudgetAfterPartialMeal(remainingBudget, wipMealTotals)
    : remainingBudget;

  // Vincolo WIP (es. snack max 100 kcal): residuo = maxCalories − carrello, non il budget giornaliero
  const wipMaxKcal = Number(wipConstraints?.maxCalories);
  const residualBudgetAfterWipMeal = (Number.isFinite(wipMaxKcal) && wipMaxKcal > 0)
    ? {
        ...(residualBudgetAfterWipMealBase || {}),
        kcal: Math.max(0, Math.round(wipMaxKcal - (Number(wipMealTotals.kcal) || 0))),
        wipConstraintMaxCalories: wipMaxKcal,
      }
    : residualBudgetAfterWipMealBase;

  const mealDraftRaw = options?.mealDraftProjection && typeof options.mealDraftProjection === 'object'
    ? options.mealDraftProjection
    : null;
  const mealDraftItemsRaw = Array.isArray(mealDraftRaw?.items) ? mealDraftRaw.items : [];
  const mealDraftType = String(mealDraftRaw?.mealType || currentMealType || '').trim() || currentMealType;

  const mealDraftResolvedItems = mealDraftItemsRaw
    .map((it) => enrichProposalItemWithResolver(
      {
        foodName: String(it?.foodName || it?.name || '').trim(),
        grams: Math.round(Number(it?.grams ?? it?.qta) || 0),
        rawQuery: String(it?.foodName || it?.name || '').trim(),
      },
      { foodDatabase: foodDb, kentuItDatabase: kentuItDb, globalFoodDatabase: globalDb, fullHistory: currentAppState?.fullHistory || {} },
      mealDraftType,
    ))
    .filter(Boolean)
    .map((it, index) => ({
      ...it,
      role: String(mealDraftItemsRaw[index]?.role || 'draft').trim() || 'draft',
    }));

  const mealDraftTotals = mealDraftResolvedItems.length > 0
    ? roundTotals(sumItemMacros(mealDraftResolvedItems))
    : { kcal: 0, pro: 0, carbo: 0, fat: 0 };

  const budgetKcal = Math.round(Number(remainingBudget?.kcal) || 0);
  const draftTotalKcal = Math.round(Number(mealDraftTotals.kcal) || 0);
  const budgetOverflowAmount = Math.max(0, draftTotalKcal - budgetKcal);

  const removedFoodQuery = String(options?.removedFoodQuery || '').trim() || null;
  const existingMealNodeRaw = options?.existingMealNode && typeof options.existingMealNode === 'object'
    ? options.existingMealNode
    : null;
  const forcedUpsertAction = options?.forcedUpsertAction
    ? String(options.forcedUpsertAction).trim().toLowerCase()
    : null;

  let removedDraftItem = null;
  let keptDraftResolvedItems = mealDraftResolvedItems;
  let keptDraftTotals = mealDraftTotals;
  let residualBudgetAfterRemoval = null;

  if (intent === 'SUBSTITUTE_MEAL_DRAFT_ITEM' && mealDraftResolvedItems.length > 0) {
    removedDraftItem = resolveRemovedEnrichedDraftItem(mealDraftResolvedItems, removedFoodQuery);
    const partitioned = partitionEnrichedDraftForSubstitute(mealDraftResolvedItems, removedDraftItem);
    keptDraftResolvedItems = partitioned.kept;
    removedDraftItem = partitioned.removed;
    keptDraftTotals = keptDraftResolvedItems.length > 0
      ? roundTotals(sumItemMacros(keptDraftResolvedItems))
      : { kcal: 0, pro: 0, carbo: 0, fat: 0 };
    residualBudgetAfterRemoval = computeResidualBudgetAfterPartialMeal(remainingBudget, keptDraftTotals);
  }

  const mapDraftItemForContext = (it) => ({
    foodName: it.foodName,
    foodDbKey: it.foodDbKey ?? null,
    grams: it.grams,
    kcal: it.kcal,
    pro: it.pro,
    carbo: it.carbo,
    fat: it.fat,
    role: it.role || 'draft',
  });

  return {
    targetFood: foodQuery,
    rawUserQuery: rawQuery,
    remainingBudget,
    partialMeal: partialMealResolvedItems.length > 0
      ? {
          items: partialMealResolvedItems.map((it) => ({
            foodName: it.foodName,
            foodDbKey: it.foodDbKey ?? null,
            grams: it.grams,
            kcal: it.kcal,
            pro: it.pro,
            carbo: it.carbo,
            fat: it.fat,
          })),
          totals: partialMealTotals,
          mealType: partialMealType,
          exactTime: partialMealRaw?.exactTime || null,
        }
      : null,
    residualBudgetAfterPartialMeal,
    residualBudgetAfterRemoval,
    mealDraftProjection: mealDraftResolvedItems.length > 0
      ? {
          items: mealDraftResolvedItems.map(mapDraftItemForContext),
          totals: mealDraftTotals,
          mealType: mealDraftType,
          exactTime: mealDraftRaw?.exactTime || null,
        }
      : null,
    keptDraftProjection: intent === 'SUBSTITUTE_MEAL_DRAFT_ITEM' && keptDraftResolvedItems.length > 0
      ? {
          items: keptDraftResolvedItems.map(mapDraftItemForContext),
          totals: keptDraftTotals,
          mealType: mealDraftType,
          exactTime: mealDraftRaw?.exactTime || null,
        }
      : null,
    removedDraftItem: removedDraftItem
      ? {
          foodName: removedDraftItem.foodName,
          foodDbKey: removedDraftItem.foodDbKey ?? null,
          grams: removedDraftItem.grams,
          kcal: removedDraftItem.kcal,
          pro: removedDraftItem.pro,
          carbo: removedDraftItem.carbo,
          fat: removedDraftItem.fat,
          role: removedDraftItem.role || 'draft',
        }
      : null,
    draftTotalKcal: mealDraftResolvedItems.length > 0 ? draftTotalKcal : null,
    budgetOverflowAmount: mealDraftResolvedItems.length > 0 ? budgetOverflowAmount : null,
    dailyTotals,
    dailyTargets,
    foodCandidates,
    currentMealType,
    activeDate: String(currentAppState?.activeDate || '').trim() || null,
    userHabitsForCurrentMeal,
    fallbackMealProposals,
    isGenericMealSuggestion: isGenericSuggestion,
    intent: intent || null,
    consultantMealRequest,
    isConsultantMealMode,
    isWipMealMode,
    wipConstraints: wipConstraints || null,
    wipSubIntent,
    mealWip: mealWipMeta || (isWipMealMode
      ? {
          constraints: wipConstraints || null,
          subIntent: wipSubIntent,
          items: wipMealResolvedItems,
          totals: wipMealTotals,
        }
      : null),
    wipMealProjection: wipMealResolvedItems.length > 0 || (isWipMealMode && wipConstraints)
      ? {
          items: wipMealResolvedItems.map((item) => ({
            foodName: item.foodName,
            grams: item.grams,
            kcal: item.kcal,
            pro: item.pro,
            carbo: item.carbo,
            fat: item.fat,
          })),
          totals: wipMealTotals,
          mealType: wipMealType,
          constraints: wipConstraints || null,
        }
      : null,
    residualBudgetAfterWipMeal,
    dogmaticMacroReceipt,
    dailyBudgetRemaining: {
      remainingCalories: Math.round(Number(dogmaticMacroReceipt.remaining.kcal) || 0),
      remainingProtein: Math.round(Number(dogmaticMacroReceipt.remaining.pro) || 0),
      remainingCarbs: Math.round(Number(dogmaticMacroReceipt.remaining.carbo) || 0),
      remainingFat: Math.round(Number(dogmaticMacroReceipt.remaining.fat) || 0),
      target: dogmaticMacroReceipt.target,
      consumed: dogmaticMacroReceipt.consumed,
      remaining: dogmaticMacroReceipt.remaining,
    },
    existingMealNode: existingMealNodeRaw,
    forcedUpsertAction,
    todayDiaryIndex: buildTodayDiaryIndex(activeLog, {
      fullHistory: currentAppState?.fullHistory || {},
      activeDate: currentAppState?.activeDate || null,
    }),
    upcomingWorkout,
    dailyCalorieStrategy,
    eveningMetabolicContext,
    foodDatabase: foodDb,
    kentuItDatabase: kentuItDb,
    globalFoodDatabase: globalDb,
    fullHistory: currentAppState?.fullHistory || {},
  };
}

/**
 * System instruction: Coach Nutrizionale Interattivo + solver macro.
 * @param {{ displayName?: string, userProfile?: object }} [opts]
 * @returns {string}
 */
export function generateConsultantSystemInstruction(opts = {}) {
  const displayName = resolveUserDisplayName(opts.userProfile) || String(opts.displayName || '').trim();
  return [
    'Sei un assistente nutrizionale empatico, colloquiale e intelligente — un Coach Nutrizionale Interattivo.',
    'Aiuti l\'utente a comporre pasti tenendo conto di macros e calorie residue. Rispondi SOLO con JSON valido conforme allo schema (niente markdown fuori dal JSON).',
    'Il testo discorsivo va in adviceMessage: tono incoraggiante, chiaro, amichevole, BREVE (adatto a TTS: preferisci 1–4 frasi corte).',
    'STILE VISIVO (adviceMessage): usa emoji native. Associa un\'emoji coerente a ogni alimento (🥣 yogurt, 🌰 noci, 🍎 mela, 🐟 pesce, 🥖 pane, 🥛 latte, 🥗 verdure, 🥚 uova).',
    'Usa ✅ quando i vincoli sono rispettati; ⚠️ se si supera un limite (e correggi subito i grammi); 💡 per alternative utili.',
    'CARRELLO WIP: non finalizzare MAI l\'inserimento se l\'utente fa una domanda o un dubbio (es. «non sono troppe?»). Chiudi/salva SOLO con conferma esplicita (CONFIRM).',
    'Calcola sempre le calorie prima di proporre una grammatura. VIETATO esempi statici non calcolati (niente yogurt 100g / noci 150g inventati).',
    'IDENTITÀ SOLVER: risolvi equazioni sui macronutrienti rispetto a [DOGMATIC_RECEIPT] e, in WIP, a [MEAL_WIP].constraints.',
    'VINCOLO INGREDIENTI: lavora SOLO sugli alimenti che l utente propone (o in [PARTIAL_MEAL]/[MEAL_DRAFT_PROJECTION]/[EXISTING_MEAL_NODE]/[WIP_MEAL_ITEMS]/[CONSULTANT_MEAL_REQUEST].anchorFood). Per suggerimenti generici senza ingredienti utente, usa [USER_HABITS_FOR_CURRENT_MEAL] o [FALLBACK_MEAL_PROPOSALS], poi ottimizza i grammi sul remaining.',
    'SCENARIO APERTO (senza quantità): calcola grams sul residuo (priorità P→C→F→kcal). Popola mealProposals.items o suggestions[].',
    'SCENARIO CHIUSO (quantità precise): se sfora, correggi grams e spiega il delta in adviceMessage con emoji.',
    'OUTPUT MAPPING: grams in mealProposals[].items[] o suggestions[].weight (WIP). totals = somma items.',
    'REGOLA ENTITY RESOLUTION: estrai SOLO nome grezzo e quantità (grams).',
    'HARD CONSTRAINT — SANITIZZAZIONE NOMI: foodName = solo nome puro, senza grammature.',
    'HARD CONSTRAINT — NESSUNA DUPLICAZIONE DA CONGIUNZIONE.',
    'NON inventare foodDbKey né macronutrienti: li calcola il sistema locale.',
    'ORARIO ESPLICITO: estrai HH:mm in exactTime se indicato.',
    'In WIP/coach: se mancano i grammi ma c\'è un vincolo calorico, proponi tu la porzione calcolata.',
    'STRATEGIA MACROCICLICA: leggi [DAILY_CALORIE_STRATEGY].',
    'HARD CONSTRAINT — VINCOLO MATEMATICO: totals.kcal di ogni mealProposal ≤ remaining.kcal se remaining.kcal > 0.',
    'HARD CONSTRAINT — SCALING OBBLIGATORIO: per rientrare, SCALA I GRAMMI.',
    'INTENTO ASK_MEAL_COMPLETION: solo ingredienti integrativi utili.',
    'INTENTO ASK_DAY_REVIEW / EVALUATE_MEAL_DRAFT: solo adviceMessage (niente mealProposals).',
    'INTENTO FIX_MEAL_DRAFT: UNA mealProposal con grams scalati.',
    'INTENTO SUBSTITUTE_MEAL_DRAFT_ITEM: 2-3 mealProposals sostitutive.',
    'INTENTO UPDATE_LOGGED_MEAL: UNA mealProposal con operations[] + resultingItems[].',
    'INTENTO CONSULTANT_MEAL: 3 opzioni con anchorFood obbligatorio.',
    'INTENTO WIP_MEAL_BUILD — leggi [MEAL_WIP].subIntent:',
    '  QUERY: adviceMessage empatico + ricalcolo; suggestions=[] mealProposals=[]. NON chiudere.',
    '  UPDATE: suggestions[] con weight = floor((residualKcal / kcal_per_100g)*100). mealProposals=[].',
    '  UPDATE HARD RULE: se l\'utente modifica o aggiunge un alimento già presente nel carrello, aggiorna la sua quantità esistente. Non creare mai due voci separate per lo stesso alimento.',
    '  CONFIRM: mealProposals riepilogo finale; suggestions=[].',
    '  CONFIRM adviceMessage: frase informale SENZA nome utente (es. «Ecco il tuo snack pronto da confermare.») + elenco «- [Emoji] Nome (Grammi)». Niente JSON, niente tono da referto.',
    'HARD CONSTRAINT WIP: se maxCalories è valorizzato, ogni suggestion.weight → calories ≤ residualKcal.',
    'HARD CONSTRAINT UPDATE_LOGGED_MEAL — resultingItems/items mai vuoti.',
    'REGOLA CORTISOLO SERALE: in cena/sera preferisci carboidrati complessi se stress high.',
    'suggestedAction: { foodName, grams, mealType } solo per singolo alimento rapido; altrimenti null.',
    'REGOLA SMART DEFAULTS: mealType/orario da [CURRENT_SYSTEM_TIME] se mancanti.',
    buildChatPersonaSystemBlock({ displayName }),
  ].join(' ');
}

/**
 * Formatta adviceContext in prompt denso per LLM consulente.
 * @param {object} adviceContext
 * @param {string} [targetFood]
 * @returns {string}
 */
export function generateConsultantPrompt(adviceContext, targetFood) {
  const ctx = adviceContext && typeof adviceContext === 'object' ? adviceContext : {};
  const food = String(targetFood || ctx.targetFood || ctx.rawUserQuery || 'pasto').trim();
  const budget = ctx.remainingBudget || {};
  const dogmaticReceipt = ctx.dogmaticMacroReceipt
    || budget.dogmaticReceipt
    || {
      target: budget.target || null,
      consumed: budget.consumed || null,
      remaining: budget.remaining || {
        kcal: budget.kcal,
        pro: budget.pro,
        carbo: budget.carbo,
        fat: budget.fat,
      },
      note: 'remaining = target − consumato (firmato).',
    };
  const meal = String(ctx.currentMealType || 'pasto').trim();
  const candidates = Array.isArray(ctx.foodCandidates) ? ctx.foodCandidates : [];
  const habits = ctx.userHabitsForCurrentMeal || { mealType: meal, proposals: [] };
  const habitsJson = JSON.stringify(habits, null, 0);
  const fallbackProposals = Array.isArray(ctx.fallbackMealProposals) ? ctx.fallbackMealProposals : [];
  const fallbackJson = JSON.stringify(fallbackProposals, null, 0);
  const upcomingWorkout = ctx.upcomingWorkout ?? null;
  const upcomingJson = JSON.stringify(upcomingWorkout, null, 0);
  const dailyCalorieStrategy = ctx.dailyCalorieStrategy || buildDailyCalorieStrategyContext({});
  const strategyJson = JSON.stringify(dailyCalorieStrategy, null, 0);
  const partialMeal = ctx.partialMeal ?? null;
  const partialJson = JSON.stringify(partialMeal, null, 0);
  const residualAfterPartial = ctx.residualBudgetAfterPartialMeal ?? null;
  const residualJson = JSON.stringify(residualAfterPartial, null, 0);
  const residualAfterRemoval = ctx.residualBudgetAfterRemoval ?? null;
  const residualRemovalJson = JSON.stringify(residualAfterRemoval, null, 0);
  const mealDraftProjection = ctx.mealDraftProjection ?? null;
  const mealDraftJson = JSON.stringify(mealDraftProjection, null, 0);
  const keptDraftProjection = ctx.keptDraftProjection ?? null;
  const keptDraftJson = JSON.stringify(keptDraftProjection, null, 0);
  const removedDraftItem = ctx.removedDraftItem ?? null;
  const removedDraftJson = JSON.stringify(removedDraftItem, null, 0);
  const existingMealNode = ctx.existingMealNode ?? null;
  const existingMealJson = JSON.stringify(existingMealNode, null, 0);
  const todayDiaryIndex = Array.isArray(ctx.todayDiaryIndex) ? ctx.todayDiaryIndex : [];
  const todayDiaryJson = JSON.stringify(todayDiaryIndex, null, 0);
  const consultantMealRequest = ctx.consultantMealRequest ?? null;
  const consultantMealJson = JSON.stringify(consultantMealRequest, null, 0);
  const dailyBudgetRemaining = ctx.dailyBudgetRemaining ?? {
    remainingCalories: Math.round(Number(dogmaticReceipt?.remaining?.kcal ?? budget?.kcal) || 0),
    remainingProtein: Math.round(Number(dogmaticReceipt?.remaining?.pro ?? budget?.pro) || 0),
    remainingCarbs: Math.round(Number(dogmaticReceipt?.remaining?.carbo ?? budget?.carbo) || 0),
    remainingFat: Math.round(Number(dogmaticReceipt?.remaining?.fat ?? budget?.fat) || 0),
    target: dogmaticReceipt?.target || null,
    consumed: dogmaticReceipt?.consumed || null,
    remaining: dogmaticReceipt?.remaining || null,
  };
  const dailyBudgetRemainingJson = JSON.stringify(dailyBudgetRemaining, null, 0);
  const dogmaticReceiptJson = JSON.stringify(dogmaticReceipt, null, 0);
  const wipMealProjection = ctx.wipMealProjection ?? null;
  const wipMealJson = JSON.stringify(wipMealProjection, null, 0);
  const residualAfterWipMeal = ctx.residualBudgetAfterWipMeal ?? null;
  const residualWipJson = JSON.stringify(residualAfterWipMeal, null, 0);
  const mealWipState = ctx.mealWip ?? null;
  const mealWipJson = JSON.stringify(mealWipState, null, 0);
  const draftTotalKcal = ctx.draftTotalKcal ?? null;
  const budgetOverflowAmount = ctx.budgetOverflowAmount ?? null;
  const intent = String(ctx.intent || '').trim().toUpperCase();
  const dailyTotalsJson = JSON.stringify(ctx.dailyTotals || ctx.DAILY_TOTALS || null, null, 0);
  const dailyTargetsJson = JSON.stringify(ctx.dailyTargets || ctx.DAILY_TARGETS || null, null, 0);
  const eveningContext = ctx.eveningMetabolicContext || {
    isDinnerContext: meal === 'cena',
    isEvening: false,
    cortisolScore: null,
    eveningStressRisk: 'low',
    bodyBatteryPercent: null,
  };
  const eveningJson = JSON.stringify(eveningContext, null, 0);

  const candidateLines = candidates.length > 0
    ? candidates
        .map((c, i) => {
          const label = c.name || `Opzione ${i + 1}`;
          const grams = c.portionGrams ?? STANDARD_PORTION_G;
          return `${i + 1}) ${label} (${c.kcal} kcal, ${c.pro}g P, ${c.carbo}g C, ${c.fat}g G / ${grams}g)`;
        })
        .join('; ')
    : 'nessun match utile nel DB locale';

  const genericHint = ctx.isGenericMealSuggestion
    ? 'Richiesta generica: usa habits/fallback e calibra grams su [DOGMATIC_RECEIPT].remaining. Compila mealProposals.'
    : 'Risolvi la richiesta rispetto allo scontrino dogmatico (scenario aperto o chiuso).';

  const rem = dogmaticReceipt?.remaining || {};
  const receiptHint = [
    `Macro rimanenti (firmato): ${Math.round(Number(rem.kcal) || 0)} kcal | P ${Math.round(Number(rem.pro) || 0)}g | C ${Math.round(Number(rem.carbo) || 0)}g | F ${Math.round(Number(rem.fat) || 0)}g.`,
    'Positivo = ancora da coprire; negativo = già in sforamento.',
  ].join(' ');

  const systemTime = formatCurrentSystemTimeContext();

  return [
    systemTime.header,
    `Richiesta utente: ${ctx.rawUserQuery || food}.`,
    genericHint,
    `Pasto di contesto: ${meal}.`,
    `[DOGMATIC_RECEIPT: ${dogmaticReceiptJson}]`,
    receiptHint,
    `[METABOLIC_BUDGET: ${JSON.stringify(budget || {}, null, 0)}]`,
    `[dailyBudgetRemaining: ${dailyBudgetRemainingJson}]`,
    `[USER_HABITS_FOR_CURRENT_MEAL: ${habitsJson}]`,
    `[FALLBACK_MEAL_PROPOSALS: ${fallbackJson}]`,
    `[UPCOMING_WORKOUT: ${upcomingJson}]`,
    `[DAILY_CALORIE_STRATEGY: ${strategyJson}]`,
    `[PARTIAL_MEAL: ${partialJson}]`,
    `[RESIDUAL_BUDGET_AFTER_PARTIAL_MEAL: ${residualJson}]`,
    residualAfterRemoval ? `[RESIDUAL_BUDGET_AFTER_REMOVAL: ${residualRemovalJson}]` : '',
    keptDraftProjection ? `[KEPT_DRAFT_PROJECTION: ${keptDraftJson}]` : '',
    removedDraftItem ? `[REMOVED_DRAFT_ITEM: ${removedDraftJson}]` : '',
    existingMealNode ? `[EXISTING_MEAL_NODE: ${existingMealJson}]` : '',
    todayDiaryIndex.length > 0 ? `[TODAY_DIARY_INDEX: ${todayDiaryJson}]` : '',
    consultantMealRequest ? `[CONSULTANT_MEAL_REQUEST: ${consultantMealJson}]` : '',
    mealWipState ? `[MEAL_WIP: ${mealWipJson}]` : '',
    wipMealProjection ? `[WIP_MEAL_ITEMS: ${wipMealJson}]` : '',
    (wipMealProjection || mealWipState) ? `[RESIDUAL_BUDGET_AFTER_WIP_MEAL: ${residualWipJson}]` : '',
    mealDraftProjection ? `[MEAL_DRAFT_PROJECTION: ${mealDraftJson}]` : '',
    mealDraftProjection ? `[DRAFT_TOTAL_KCAL: ${draftTotalKcal}]` : '',
    mealDraftProjection ? `[BUDGET_OVERFLOW_AMOUNT: ${budgetOverflowAmount}]` : '',
    `[INTENT: ${intent || 'ASK_MEAL_ADVICE'}]`,
    ctx.dailyTotals || ctx.DAILY_TOTALS ? `[DAILY_TOTALS: ${dailyTotalsJson}]` : '',
    ctx.dailyTargets || ctx.DAILY_TARGETS ? `[DAILY_TARGETS: ${dailyTargetsJson}]` : '',
    `[EVENING_STRESS_CONTEXT: ${eveningJson}]`,
    `Opzioni DB locale (densità per 100g, solo per risolvere nomi — NON usare 100g come default se c'è un vincolo WIP): ${candidateLines}.`,
    '',
    'SOLVER MODE — EQUAZIONI MACRO:',
    '1) Leggi [DOGMATIC_RECEIPT]: remaining = target − consumato (kcal, pro, carbo, fat).',
    '2) SCENARIO APERTO (solo ingredienti, senza grams): calcola grams per saturare remaining; popola mealProposals.items.',
    '3) SCENARIO CHIUSO (grams precisi): verifica sforamento vs remaining; se sfora, correggi grams in mealProposals e spiega il delta numerico in adviceMessage.',
    '4) NON inventare ingredienti non proposti dall utente (salvo habits/fallback per richieste generiche, o accompagnamenti CONSULTANT_MEAL).',
    '5) adviceMessage: coach empatico con emoji (✅ ⚠️ 💡 + emoji alimento); cita residui/sforamenti in g o kcal.',
    'ORARIO ESPLICITO: se la richiesta contiene un orario (es. "ore 14.45"), imposta exactTime in HH:mm.',
    '',
    dailyCalorieStrategy.isRestDay
      ? 'GIORNO DI RIPOSO PIANIFICATO: NON applicare logica pre-allenamento. Priorità deficit da [DAILY_CALORIE_STRATEGY].'
      : '',
    dailyCalorieStrategy.isTrainingDay
      ? `GIORNO DI ALLENAMENTO PIANIFICATO (${dailyCalorieStrategy.activityLabel || 'sessione'}): priorità surplus da [DAILY_CALORIE_STRATEGY]. Target giornaliero ${dailyCalorieStrategy.targetKcal} kcal.`
      : '',
    '',
    'HARD CONSTRAINT — VINCOLO MATEMATICO: totals.kcal <= [DOGMATIC_RECEIPT].remaining.kcal se remaining.kcal > 0 (alias [METABOLIC_BUDGET].kcal). Se sfora, scala grams.',
    'SCALING: taglia carboidrati e grassi; preserva proteine salvo sforamento proteico. Spiega i tagli in grammi in adviceMessage.',
    '',
    residualAfterPartial
      ? [
        'SOUS-CHEF MODE ATTIVO: [PARTIAL_MEAL] è già in preparazione.',
        'Proponi completamenti con SOLO ingredienti integrativi. totals.kcal integrativi <= [RESIDUAL_BUDGET_AFTER_PARTIAL_MEAL].kcal.',
        'Calibra anche su remaining P/C/F dello scontrino dogmatico.',
      ].join('\n')
      : '',
    intent === 'ASK_DAY_REVIEW'
      ? [
        'DEBRIEFING SERALE ATTIVO (ASK_DAY_REVIEW).',
        'NON generare mealProposals. Solo adviceMessage analitico su [DAILY_TOTALS] vs [DOGMATIC_RECEIPT]/[DAILY_TARGETS].',
        'Cita scostamenti in kcal/P/C/F. Una azione concreta per domani.',
      ].join('\n')
      : '',
    intent === 'EVALUATE_MEAL_DRAFT'
      ? [
        'NAVIGATORE WHAT-IF LIVE ATTIVO (EVALUATE_MEAL_DRAFT).',
        'NON generare mealProposals. Usa [DRAFT_TOTAL_KCAL] e [BUDGET_OVERFLOW_AMOUNT].',
        'adviceMessage: check matematico → tagli chirurgici in grammi → CTA riparazione/sostituzione.',
      ].join('\n')
      : '',
    intent === 'FIX_MEAL_DRAFT'
      ? [
        'RIPARAZIONE PORZIONI ATTIVA (FIX_MEAL_DRAFT).',
        'UNA mealProposal con grams scalati da [MEAL_DRAFT_PROJECTION] entro remaining.',
        'adviceMessage: conferma numerica del taglio (es. "Pasta da 120g a 80g per rientrare di 15g di grassi").',
      ].join('\n')
      : '',
    intent === 'SUBSTITUTE_MEAL_DRAFT_ITEM'
      ? [
        'SOSTITUZIONE ALIMENTO ATTIVA (SUBSTITUTE_MEAL_DRAFT_ITEM).',
        '2-3 mealProposals: tieni [KEPT_DRAFT_PROJECTION]; sostituisci [REMOVED_DRAFT_ITEM]; residuo <= [RESIDUAL_BUDGET_AFTER_REMOVAL].',
      ].join('\n')
      : '',
    intent === 'UPDATE_LOGGED_MEAL'
      ? [
        'MODIFICA PASTO REGISTRATO ATTIVA (UPDATE_LOGGED_MEAL).',
        'UNA mealProposal con operations + resultingItems (= items). targetNodeId obbligatorio.',
        'Se la modifica sforerebbe remaining, correggi grams e spiega il delta.',
      ].join('\n')
      : '',
    intent === 'CONSULTANT_MEAL'
      ? [
        'CONSULTANT MODE ATTIVA (CONSULTANT_MEAL).',
        '3 mealProposals con anchorFood obbligatorio; grams calibrati su [DOGMATIC_RECEIPT].remaining.',
        'adviceMessage coach: residuo macro + sintesi delle 3 soluzioni con emoji.',
      ].join('\n')
      : '',
    intent === 'WIP_MEAL_BUILD'
      ? [
        '🍽️ COACH WIP ATTIVO (WIP_MEAL_BUILD) — STATE MACHINE.',
        `Sub-intent corrente: ${String(ctx.wipSubIntent || mealWipState?.subIntent || 'UPDATE').toUpperCase()}.`,
        'QUERY: adviceMessage empatico + ricalcolo macros; suggestions=[] mealProposals=[]. NON finalizzare.',
        'UPDATE: suggestions[] con weight = floor((residualKcal / kcal_per_100g)*100) su [MEAL_WIP]/[RESIDUAL_BUDGET_AFTER_WIP_MEAL]. mealProposals=[].',
        'UPDATE HARD RULE: se l\'utente modifica o aggiunge un alimento già presente nel carrello, aggiorna la sua quantità esistente. Non creare mai due voci separate per lo stesso alimento.',
        'CONFIRM: mealProposals con riepilogo finale per salvataggio; suggestions=[]. adviceMessage informale con displayName.',
        'CONFIRM adviceMessage — SOLO Markdown pulito (niente JSON grezzo). Una riga intro + elenco:',
        '  Ecco il riepilogo del tuo pasto pronto per il salvataggio:',
        '  - 🥣 Yogurt greco 0% (100g)',
        '  - 🌰 Noci sgusciate (6g)',
        '  - 🍎 Mela (120g)',
        'Formato riga obbligatorio: - [Emoji] Nome Alimento (Grammi)',
        'Esempio tono UPDATE: «Puoi aggiungere 🌰 6g di noci per restare nelle 100 kcal ✅».',
        'VIETATO grammature statiche non calcolate.',
      ].join('\n')
      : '',
    '',
    eveningContext.isDinnerContext || eveningContext.isEvening
      ? [
        'CONTESTO SERALE ATTIVO: bilancia grams per recupero (carboidrati se stress high) senza inventare ingredienti non ammessi.',
        `Cortisolo: ${eveningContext.cortisolScore ?? 'n/d'}/100. Rischio: ${eveningContext.eveningStressRisk}.`,
      ].join('\n')
      : '',
    '',
    'OUTPUT JSON richiesto:',
    '- adviceMessage: coach italiano con emoji, max ~6 frasi; cita sforamenti/residui in g o kcal.',
    '- suggestedAction: { foodName, grams, mealType } | null — solo singolo alimento rapido.',
    '- mealProposals: proposte con items[].foodName + items[].grams OTTIMIZZATI (grams > 0) e totals coerenti.',
    'I grams in items[] sono la Source of Truth per le card.',
  ].join('\n');
}

const MEAL_TYPES = ['colazione', 'snack', 'pranzo', 'cena'];

function scaleMacroFromReference(referenceItem, newGrams) {
  const refGrams = Math.round(Number(referenceItem?.grams ?? referenceItem?.qta) || 0);
  const grams = Math.max(1, Math.round(Number(newGrams) || 0));
  if (refGrams <= 0) {
    return {
      kcal: roundMacro(referenceItem?.kcal),
      pro: roundMacro(referenceItem?.pro),
      carbo: roundMacro(referenceItem?.carbo),
      fat: roundMacro(referenceItem?.fat),
    };
  }
  const ratio = grams / refGrams;
  return {
    kcal: roundMacro((Number(referenceItem?.kcal) || 0) * ratio),
    pro: roundMacro((Number(referenceItem?.pro) || 0) * ratio),
    carbo: roundMacro((Number(referenceItem?.carbo) || 0) * ratio),
    fat: roundMacro((Number(referenceItem?.fat) || 0) * ratio),
  };
}

function normalizeProposalItem(item, habitItemsByName) {
  if (!item || typeof item !== 'object') return null;
  const foodName = String(item.foodName || item.name || '').trim();
  const grams = Math.round(Number(item.grams ?? item.qta ?? item.weight));
  if (!foodName || !Number.isFinite(grams) || grams <= 0) return null;

  const habitRef = habitItemsByName.get(foodName.toLowerCase());
  const hasMacros = ['kcal', 'pro', 'carbo', 'fat'].some((key) => Number(item[key]) > 0);
  const scaled = hasMacros
    ? {
        kcal: roundMacro(item.kcal),
        pro: roundMacro(item.pro),
        carbo: roundMacro(item.carbo),
        fat: roundMacro(item.fat),
      }
    : scaleMacroFromReference(habitRef, grams);

  return {
    foodName,
    foodDbKey: item.foodDbKey ?? habitRef?.foodDbKey ?? null,
    grams,
    ...scaled,
  };
}

function enrichProposalItemWithResolver(item, adviceContext, mealType) {
  if (!item) return null;

  const foodDb = adviceContext?.foodDatabase || {};
  const kentuItDb = adviceContext?.kentuItDatabase || adviceContext?.kentuItDb || {};
  const globalDb = adviceContext?.globalFoodDatabase || adviceContext?.globalDb || {};
  const fullHistory = adviceContext?.fullHistory || {};
  const rawName = String(item.rawQuery || item.foodName || '').trim();
  const grams = Math.round(Number(item.grams ?? item.qta) || 0);
  if (!rawName || !Number.isFinite(grams) || grams <= 0) return null;

  const resolveCtx = {
    foodDb,
    kentuItDb,
    globalDb,
    fullHistory,
    mealType,
  };

  // Già risolto / appreso: se c'è foodDbKey, ricalcola dal DB locale.
  if (
    item.status === 'RESOLVED'
    && item.foodDbKey
    && (item.resolutionSource === 'learned_db' || item.resolutionSource === 'manual')
  ) {
    const fromDb = resolveFoodItemForProposal(rawName, grams, {
      ...resolveCtx,
      preferredDbKey: item.foodDbKey,
    });
    if (fromDb && fromDb.status !== 'NEEDS_RESOLUTION') {
      return { ...fromDb, rawQuery: rawName, icon: item.icon || fromDb.icon };
    }
  }

  // Già risolto manualmente senza chiave DB (legacy).
  if (
    item.status === 'RESOLVED'
    && item.resolutionSource === 'manual'
    && ['kcal', 'pro', 'carbo', 'fat'].some((key) => Number(item[key]) > 0)
  ) {
    return {
      ...item,
      foodName: rawName,
      grams,
      rawQuery: rawName,
      status: 'RESOLVED',
      resolutionSource: 'manual',
    };
  }

  const resolved = resolveFoodItemForProposal(rawName, grams, {
    ...resolveCtx,
    preferredDbKey: item.foodDbKey ?? null,
    searchKeywords: item.searchKeywords || null,
  });

  // Tolleranza zero: senza match DB non si conservano macro LLM/abitudine.
  if (!resolved) {
    return {
      foodName: rawName,
      foodDbKey: null,
      grams,
      kcal: 0,
      pro: 0,
      carbo: 0,
      fat: 0,
      rawQuery: rawName,
      status: 'NEEDS_RESOLUTION',
      alternatives: [],
    };
  }

  return {
    ...resolved,
    rawQuery: rawName,
    icon: item.icon || resolved.icon,
  };
}

/**
 * Espansione combo abitudini consentita solo su richieste ADVICE generiche ("cosa mi proponi?").
 * Per registrazione pasto / singolo alimento: mai sostituire items LLM con combo storica.
 */
function shouldAllowHabitComboExpansion(adviceContext = {}) {
  return adviceContext.isGenericMealSuggestion === true;
}

/**
 * @param {unknown} raw
 * @returns {Array<object>}
 */
export function sanitizeMealProposals(raw, adviceContext = {}) {
  if (!Array.isArray(raw)) return [];

  const habits = adviceContext?.userHabitsForCurrentMeal?.proposals || [];
  const habitById = new Map(habits.map((p) => [p.id, p]));
  const mealTypeDefault = String(adviceContext?.currentMealType || 'pranzo').toLowerCase();
  const allowHabitExpansion = shouldAllowHabitComboExpansion(adviceContext);

  return raw
    .map((proposal, index) => {
      if (!proposal || typeof proposal !== 'object') return null;

      const mealType = String(proposal.mealType || mealTypeDefault).toLowerCase();
      if (!MEAL_TYPES.includes(mealType)) return null;

      const habitRef = habitById.get(proposal.id);
      const resultingItemsRaw = Array.isArray(proposal.resultingItems) ? proposal.resultingItems : [];
      const llmItems = Array.isArray(proposal.items) ? proposal.items : [];
      const rawItems =
        resultingItemsRaw.length > 0
          ? resultingItemsRaw
          : llmItems.length > 0
            ? llmItems
            : (allowHabitExpansion && Array.isArray(habitRef?.items) ? habitRef.items : []);

      const habitItemsByName = new Map(
        (allowHabitExpansion ? (habitRef?.items || []) : rawItems)
          .filter((it) => it?.foodName)
          .map((it) => [String(it.foodName).toLowerCase(), it]),
      );

      const items = deduplicateMealProposalItems(
        rawItems
          .map((item) => {
            const normalized = normalizeProposalItem(item, habitItemsByName);
            if (!normalized) return null;
            const enriched = enrichProposalItemWithResolver(normalized, adviceContext, mealType);
            if (!enriched) return null;
            const itemId = item?.itemId != null ? String(item.itemId).trim() : '';
            return itemId ? { ...enriched, itemId } : enriched;
          })
          .filter(Boolean),
      );

      if (items.length === 0) return null;

      const totals = roundTotals(sumProposalItemMacros(items));
      const exactTime = resolveExactTimeForMeal(proposal, adviceContext?.rawUserQuery || '');
      const targetNodeId = proposal.targetNodeId != null
        ? String(proposal.targetNodeId).trim()
        : '';
      const operations = Array.isArray(proposal.operations)
        ? proposal.operations
          .map((op) => {
            if (!op || typeof op !== 'object') return null;
            const action = String(op.action || '').trim().toLowerCase();
            if (!['add', 'update', 'delete'].includes(action)) return null;
            const targetItemId = op.targetItemId != null ? String(op.targetItemId).trim() : '';
            const matchHint = op.matchHint != null ? String(op.matchHint).trim() : '';
            const updated = op.updatedFood && typeof op.updatedFood === 'object'
              ? {
                  foodName: String(op.updatedFood.foodName || '').trim(),
                  grams: Math.round(Number(op.updatedFood.grams) || 0),
                }
              : null;
            return {
              action,
              ...(targetItemId ? { targetItemId } : {}),
              ...(matchHint ? { matchHint } : {}),
              ...(updated?.foodName && updated.grams > 0 ? { updatedFood: updated } : {}),
            };
          })
          .filter(Boolean)
        : [];

      return {
        id: String(proposal.id || habitRef?.id || `proposal_${index + 1}`),
        label: String(
          proposal.label
          || proposal.name
          || (allowHabitExpansion ? habitRef?.name : null)
          || `Proposta ${index + 1}`,
        ).trim(),
        mealType,
        source: String(
          proposal.source
          || (allowHabitExpansion ? habitRef?.source : null)
          || 'llm',
        ).trim(),
        items,
        resultingItems: items,
        ...(operations.length > 0 ? { operations } : {}),
        ...(targetNodeId ? { targetNodeId } : {}),
        totals,
        ...(exactTime ? { exactTime } : {}),
        workoutAdjusted: Boolean(
          adviceContext?.upcomingWorkout?.isWithinPreWorkoutWindow
          && proposal.workoutAdjusted !== false,
        ),
      };
    })
    .filter(Boolean)
    .slice(0, MAX_HABIT_PROPOSALS);
}

/**
 * Estrae mealProposals da testo LLM (tag XML o JSON embedded).
 * @param {string} text
 * @returns {Array<object>}
 */
export function parseMealProposalsFromText(text) {
  const raw = String(text || '');
  const tagMatch = raw.match(/<MEAL_PROPOSAL>([\s\S]*?)<\/MEAL_PROPOSAL>/i);
  if (tagMatch) {
    try {
      const parsed = JSON.parse(tagMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.mealProposals)) return parsed.mealProposals;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {
      /* fall through */
    }
  }
  return [];
}

/**
 * Normalizza suggestedAction dal modello; allinea foodName al candidato DB più vicino.
 * @param {unknown} raw
 * @param {object} [adviceContext]
 * @returns {{ foodName: string, grams: number, mealType: string } | null}
 */
export function sanitizeSuggestedAction(raw, adviceContext = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const foodNameRaw = String(raw.foodName || '').trim();
  const grams = Math.round(Number(raw.grams));
  const mealType = String(raw.mealType || '').trim().toLowerCase();

  if (!foodNameRaw || !MEAL_TYPES.includes(mealType) || !Number.isFinite(grams) || grams <= 0) {
    return null;
  }

  const candidates = Array.isArray(adviceContext.foodCandidates) ? adviceContext.foodCandidates : [];
  const query = foodNameRaw.toLowerCase();
  let resolvedName = foodNameRaw;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidateName = String(candidates[i]?.name || '').trim();
    if (!candidateName) continue;
    const cn = candidateName.toLowerCase();
    if (cn === query || cn.includes(query) || query.includes(cn)) {
      resolvedName = candidateName;
      break;
    }
  }

  return {
    foodName: resolvedName,
    grams,
    mealType,
  };
}
