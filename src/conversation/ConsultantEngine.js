import { computeTotali } from '../useBiochimico';
import { getTargetForNutrient } from '../useBiochimico';
import { searchFoodsDetailed } from '../foodSearch';
import { estraiDatiFoodDb } from '../features/salaComandi/engines/foodDataEngine';
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
import { resolveExactTimeForMeal } from '../features/commandTerminal/conversation/mealLogIntent.js';
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
import { isMealProposalQuery } from '../features/commandTerminal/conversation/mealLogIntent.js';
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

  const resolveContext = { foodDb, fullHistory, mealType };
  const items = resolveMealProposalItems(
    rawItems.map((item) => ({
      rawQuery: item.foodName,
      foodName: item.foodName,
      grams: item.grams,
    })),
    resolveContext,
  );

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

function computeRemainingBudget(currentAppState) {
  const log = Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : [];
  const totali = computeTotali(log);
  const targets = pickTargets(currentAppState);
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
    kcal: roundMacro(targets.kcal - (Number(totali.kcal) || 0)),
    pro: roundMacro(targets.pro - (Number(totali.prot) || 0)),
    carbo: roundMacro(targets.carbo - (Number(totali.carb) || 0)),
    fat: roundMacro(targets.fat - (Number(totali.fatTotal ?? totali.fat) || 0)),
    micros,
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
  const query = String(targetFood || '').trim();
  if (!query) return [];

  const hits = searchFoodsDetailed(foodDb, query, {
    limit: 3,
    mode: 'search',
    includeUserHistory: true,
  });

  const fullHistory = currentAppState?.fullHistory || {};
  return hits
    .slice(0, 3)
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
 * Costruisce il contesto compatto per il consulente nutrizionale (Cameriere).
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
  const foodQuery = isGenericSuggestion ? '' : (extractTargetFoodFromQuery(rawQuery) || rawQuery);
  const foodDb = currentAppState?.foodDatabase || {};
  const nutrition = buildNutritionContextForState(currentAppState);
  const currentMealType = nutrition.currentMealType;
  const remainingBudget = nutrition.remainingBudget;
  const foodCandidates = foodQuery
    ? buildFoodCandidates(foodQuery, currentAppState, currentMealType)
    : [];
  const userHabitsForCurrentMeal = nutrition.userHabitsForCurrentMeal;
  const fallbackMealProposals = buildFallbackMealProposalsFromFoodDb(currentAppState, currentMealType);
  const upcomingWorkout = nutrition.upcomingWorkout;
  const dailyCalorieStrategy = nutrition.dailyCalorieStrategy;
  const eveningMetabolicContext = buildEveningMetabolicContext(currentAppState);

  // Day review payload (local aggregation).
  const activeLog = Array.isArray(currentAppState?.activeLog) ? currentAppState.activeLog : [];
  const dailyTotals = computeTotali(activeLog);
  const targets = currentAppState?.userTargets || {};
  const dailyTargets = {
    kcal: Math.round(Number(currentAppState?.dynamicDailyKcal) || Number(targets.kcal) || 2000),
    prot: Math.round(Number(targets.prot ?? targets.pro ?? 150) || 150),
    carb: Math.round(Number(targets.carb ?? targets.cho ?? 200) || 200),
    fat: Math.round(Number(targets.fatTotal ?? targets.fat ?? 65) || 65),
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
      { foodDatabase: foodDb, fullHistory: currentAppState?.fullHistory || {} },
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
    dailyTotals,
    dailyTargets,
    foodCandidates,
    currentMealType,
    activeDate: String(currentAppState?.activeDate || '').trim() || null,
    userHabitsForCurrentMeal,
    fallbackMealProposals,
    isGenericMealSuggestion: isGenericSuggestion,
    intent: String(options?.intent || '').trim() || null,
    upcomingWorkout,
    dailyCalorieStrategy,
    eveningMetabolicContext,
    foodDatabase: foodDb,
    fullHistory: currentAppState?.fullHistory || {},
  };
}

/**
 * System instruction condivisa per il consulente Cameriere.
 * @returns {string}
 */
export function generateConsultantSystemInstruction() {
  return [
    'Sei Kentu Cameriere (Meal Advice). Rispondi SOLO con JSON valido conforme allo schema.',
    'Non aggiungere markdown né testo fuori dal JSON.',
    'REGOLA ENTITY RESOLUTION: l LLM estrae SOLO nome grezzo alimento e quantità (grams).',
    'NON inventare foodDbKey, nomi DB esatti né macronutrienti: li calcola il sistema locale dal database.',
    'Per mealProposals.items usa foodName come testo utente/LLM e grams; kcal/pro/carbo/fat possono essere 0 o omessi.',
    'ORARIO ESPLICITO: se l utente indica un orario (es. "ore 14.45", "alle 20:30"), estrailo in HH:mm nel campo exactTime di ogni mealProposal pertinente.',
    'NON DEVI MAI rispondere chiedendo grammature o alimenti mancanti.',
    'Fornisci SEMPRE 2 o 3 proposte di pasti completi (più alimenti combinati) estrapolati da [USER_HABITS_FOR_CURRENT_MEAL],',
    'compilando rigorosamente mealProposals. Se [USER_HABITS] è vuoto, usa [FALLBACK_MEAL_PROPOSALS] dal DB alimenti.',
    'mealProposals NON deve mai essere un array vuoto per richieste di proposta.',
    'REGOLA TASSATIVA ABITUDINI: se l utente chiede suggerimenti per il pasto o dichiara un pasto generico',
    '(es. "mangio pane e pomodoro", "cosa mi proponi per pranzo"), cerca PRIMA in [USER_HABITS_FOR_CURRENT_MEAL].',
    'Proponi la combinazione e grammatura storica. Non inventare grammature se esistono nello storico.',
    'STRATEGIA MACROCICLICA GIORNALIERA: leggi [DAILY_CALORIE_STRATEGY] dal Costruttore Settimanale. Se directive è deficit (giorno riposo/recupero), orienta mealProposals verso porzioni coerenti con deficit: evita surplus calorico non necessario, privilegia proteine e fibre, carboidrati moderati. Se directive è surplus (giorno allenamento), favorisci carboidrati e calorie sufficienti per performance e recupero. Il [METABOLIC_BUDGET] riflette già targetKcal e delta della strategia: rispettalo. Se hasWeeklyDayPlan è true, NON ignorare il programma settimanale dell utente.',
    'RIPOSO PIANIFICATO E PRE-WORKOUT: se [DAILY_CALORIE_STRATEGY].isRestDay è true O [UPCOMING_WORKOUT] è null, NON applicare CORREZIONE PROPORZIONALE PRE-ALLENAMENTO, Digestive Safety Gate pre-workout né semaforo giallo pre-allenamento. Tratta il giorno come recupero metabolico.',
    'CORREZIONE PROPORZIONALE PRE-ALLENAMENTO: SOLO se [UPCOMING_WORKOUT] non è null e [DAILY_CALORIE_STRATEGY].isRestDay non è true, e indica un allenamento entro 2-3 ore,',
    'adatta le [USER_HABITS] prima di proporle in mealProposals: lieve riduzione di grassi e fibre rispetto',
    'alla grammatura abituale, o adattamento dei carboidrati per favorire lo svuotamento gastrico.',
    'Spiega brevemente in adviceMessage come e perche hai modificato la porzione abituale.',
    'HARD CONSTRAINT — VINCOLO MATEMATICO (INVIOLABILE): il totale calorico (totals.kcal) di OGNI singola mealProposal NON deve MAI, in nessun caso, superare [METABOLIC_BUDGET].kcal. Se una proposta sfora anche di 1 kcal, DEVI correggerla prima di rispondere.',
    'HARD CONSTRAINT — SCALING OBBLIGATORIO: per far rientrare pasti storici nel budget, DEVI SCALARE I GRAMMI in output. Taglia drasticamente (anche 50-70%) fonti glucidiche (pane, pasta, patate, pizza, gnocchi) e fonti lipidiche (olio, noci, pesto, edamame), preservando invece le grammature delle fonti proteiche (salmone, merluzzo, tonno, pollo, uova).',
    'HARD CONSTRAINT — PULIZIA ACCAVALLAMENTI STORICI: non proporre combinazioni insensate da log sovrapposti. Se nella stessa proposta compaiono più fonti di carboidrati (es. pizza + pane + patate + pasta), SELEZIONANE SOLO UNA e rimuovi le altre. Stessa logica per grassi aggiunti: non sommare olio + noci + pesto insieme se porta a sforare; scegline uno o riducili.',
    'HARD CONSTRAINT — STOP AVVISI SENZA TAGLIO: è vietato dire "sfora il budget ma lascio intatto". Se sfora, tagli i grammi e adattI mealProposals. In adviceMessage devi dire esplicitamente che hai ridotto carboidrati e grassi per rispettare il budget (es. "Ho ridotto carboidrati e grassi delle tue abitudini per rispettare le tue 1454 kcal").',
    'INTENTO ASK_MEAL_COMPLETION (SOUS-CHEF): se nel prompt è presente [PARTIAL_MEAL] con items[], NON devi proporre un pasto da zero. Devi completare il piatto aggiungendo SOLO gli ingredienti mancanti. Calcola il budget residuo sottraendo il pasto parziale e rispetta il VINCOLO MATEMATICO sulle kcal totali.',
    'HARD CONSTRAINT — OTTIMIZZAZIONE MICRO-NUTRIENTI: quando completi un pasto (ASK_MEAL_COMPLETION), devi dare priorità assoluta a ingredienti che colmano le carenze segnalate in [METABOLIC_BUDGET].micros (alte remaining). Esempio: se fibre e magnesio sono bassi, preferisci legumi/verdure/frutta secca in quantità compatibili col budget; se sodio basso, valuta un aggiustamento controllato. Mantieni sempre il vincolo kcal.',
    'HARD CONSTRAINT — COMPLETION OUTPUT: quando [RESIDUAL_BUDGET_AFTER_PARTIAL_MEAL] è presente, mealProposals DEVONO contenere SOLO alimenti integrativi (NON ripetere gli alimenti già in [PARTIAL_MEAL]). Il totale kcal degli alimenti integrativi di ciascuna opzione deve essere <= [RESIDUAL_BUDGET_AFTER_PARTIAL_MEAL].kcal (vincolo assoluto).',
    'INTENTO ASK_DAY_REVIEW (DEBRIEFING SERALE): quando l intent è ASK_DAY_REVIEW o nel contesto sono presenti [DAILY_TOTALS] e [DAILY_TARGETS], NON devi generare mealProposals. Devi produrre SOLO adviceMessage (reviewMessage) empatico e serale, considerando stress/cortisolo alto.',
    'STRUTTURA OBBLIGATORIA adviceMessage (ASK_DAY_REVIEW):\n- L Esito: (es. "Ottimo lavoro" / "Giornata discreta") basato sul rispetto di [DAILY_CALORIE_STRATEGY] e scostamento kcal.\n- Cosa ha funzionato: elogia 1-2 target centrati.\n- Cosa migliorare: 1-2 punti su eccessi/carenze, con priorità ai micro-nutrienti in [METABOLIC_BUDGET].micros.\n- Il Consiglio per domani: 1 azione pratica.\nTono: empatico, rassicurante, chiusura serale senza stress. Max ~10 righe.',
    'REGOLA CORTISOLO SERALE E RECUPERO NERVOSO: quando il pasto di contesto è la cena, è orario serale (dopo le 18:00), o [EVENING_STRESS_CONTEXT].eveningStressRisk è "high", analizza il livello di cortisolo stimato in [EVENING_STRESS_CONTEXT].cortisolScore. Se il cortisolo è medio-alto in orario serale, è un segnale di allarme per il sistema nervoso. In adviceMessage e nelle proposte DEVI prioritizzare scelte calmanti: carboidrati complessi (aiutano ad abbassare il cortisolo e favoriscono il sonno), alimenti ricchi di magnesio, omega-3 o triptofano. Evita pasti serali composti solo da proteine magre se lo stress è alto. Tono assertivo e focalizzato sul recupero.',
    'PASTI ANTI-CORTISOLO (CENA): se l utente chiede consigli per la cena o il tema è serale, orienta mealProposals verso combinazioni anti-stress: privilegia carboidrati complessi e fibre moderate, evita eccessi di grassi saturi, caffeina o pasti troppo proteici-magri se [EVENING_STRESS_CONTEXT].eveningStressRisk è "high". Puoi etichettare le proposte in label (es. "Cena recupero") senza cambiare lo schema JSON.',
    'DIGESTIVE SAFETY GATE (CENA + ALLENAMENTO SERALE): quando consigli o valuti un allenamento in fascia serale, calcola la somma tra i macro residui in [METABOLIC_BUDGET], il costo calorico stimato della cena proposta in mealProposals e l impatto dell allenamento in [UPCOMING_WORKOUT]. Se il totale calorico risultante per la cena supera circa 900-1000 kcal, oppure se il volume di cibo previsto è eccessivo per l orario serale, DEVI sconsigliare l allenamento intenso in adviceMessage. Spiega che un pasto troppo pesante compromette recupero e gestione del cortisolo serale; suggerisci pasto più bilanciato e rinvio dell attività intensa. Non modificare le grammature storiche in mealProposals per applicare questo gate: usa solo adviceMessage per l avviso.',
    'ALLENAMENTO SERALE E TRAINING WAVE: se [UPCOMING_WORKOUT] indica una sessione serale o l utente chiede se può allenarsi stasera, incrocia orario attuale [CURRENT_SYSTEM_TIME], finestra in [UPCOMING_WORKOUT] e Digestive Safety Gate. Prima della finestra ideale: sconsiglia l immediato e indica di pianificare dentro la finestra. Dentro la finestra: via libera con sessione ben pianificata e pasto coerente. Dopo la finestra o se non c è finestra utile: evita HIIT intenso, preferisci riposo attivo o ripresa il giorno dopo.',
    'Se proponi un pasto completo dalle abitudini, compila mealProposals con items (foodName + grams).',
    'I macronutrienti definitivi li calcola il resolver locale dal DB: puoi ometterli o lasciare 0.',
    'I totals devono essere la somma degli items. Mantieni id/source delle abitudini quando possibile.',
    'adviceMessage: italiano, max 5 frasi, include semaforo (verde/giallo/rosso).',
    'FLUSSO CONVERSAZIONALE (OBBLIGATORIO): nell adviceMessage presenta SEMPRE le proposte numerate esplicitamente come "Opzione 1", "Opzione 2", "Opzione 3" (una riga sintetica ciascuna, allineata a mealProposals[0..2]).',
    'L adviceMessage DEVE concludersi SEMPRE con questa Call to Action (o equivalente): "Quale di queste 3 opzioni preferisci? Scegline una e, se serve, la modifichiamo insieme."',
    'Imposta mealProposals[].label su "Opzione 1", "Opzione 2", "Opzione 3" (mantieni eventuale sottotitolo descrittivo nel name se serve, ma label numerata è obbligatoria).',
    'suggestedAction: { foodName, grams, mealType } solo per singolo alimento (fallback rapido).',
    'mealProposals: array di 2-3 proposte strutturate pronte per [CONFERMA E CARICA] (priorità alle abitudini).',
    'REGOLA SMART DEFAULTS (registrazione pasto consumato via ADD_FOOD): se mancano tipo pasto o orario, il sistema li deduce da [CURRENT_SYSTEM_TIME] — NON chiedere all utente.',
    'REGOLA ADVICE (SUGGERIMENTI): per consigli e proposte (es. "cosa mi proponi per pranzo?") procedi subito con mealProposals senza chiedere orari.',
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
    ? 'Richiesta generica di suggerimento pasto: compila OBBLIGATORIAMENTE mealProposals (2-3 pasti completi). NON chiedere grammature.'
    : 'Valuta l alimento o il pasto indicato rispetto al budget e alle abitudini.';

  const systemTime = formatCurrentSystemTimeContext();

  return [
    systemTime.header,
    `Richiesta utente: ${ctx.rawUserQuery || food}.`,
    genericHint,
    `Pasto di contesto: ${meal}.`,
    `[METABOLIC_BUDGET: ${JSON.stringify(budget || {}, null, 0)}]`,
    `[USER_HABITS_FOR_CURRENT_MEAL: ${habitsJson}]`,
    `[FALLBACK_MEAL_PROPOSALS: ${fallbackJson}]`,
    `[UPCOMING_WORKOUT: ${upcomingJson}]`,
    `[DAILY_CALORIE_STRATEGY: ${strategyJson}]`,
    `[PARTIAL_MEAL: ${partialJson}]`,
    `[RESIDUAL_BUDGET_AFTER_PARTIAL_MEAL: ${residualJson}]`,
    `[INTENT: ${intent || 'ASK_MEAL_ADVICE'}]`,
    ctx.dailyTotals || ctx.DAILY_TOTALS ? `[DAILY_TOTALS: ${dailyTotalsJson}]` : '',
    ctx.dailyTargets || ctx.DAILY_TARGETS ? `[DAILY_TARGETS: ${dailyTargetsJson}]` : '',
    `[EVENING_STRESS_CONTEXT: ${eveningJson}]`,
    `Opzioni DB locale (porzione ${STANDARD_PORTION_G}g, solo se serve integrare): ${candidateLines}.`,
    '',
    'REGOLA FERREA: Se l utente chiede una proposta (es. "Cosa mi proponi?"), NON DEVI MAI rispondere',
    'chiedendo grammature o alimenti mancanti. Fornisci direttamente 2 o 3 proposte di pasti completi',
    '(più alimenti combinati) estrapolati da [USER_HABITS_FOR_CURRENT_MEAL], compilando mealProposals.',
    'Se [USER_HABITS] è vuoto, usa [FALLBACK_MEAL_PROPOSALS] con porzioni standard dal DB alimenti.',
    'mealProposals NON deve mai essere vuoto per richieste di proposta.',
    'FLUSSO CONVERSAZIONALE: in adviceMessage numera Opzione 1, Opzione 2, Opzione 3 e chiudi con: "Quale di queste 3 opzioni preferisci? Scegline una e, se serve, la modifichiamo insieme."',
    'ORARIO ESPLICITO: se la richiesta contiene un orario (es. "ore 14.45"), imposta exactTime in HH:mm nella proposta/card.',
    '',
    'REGOLA TASSATIVA: Se l utente chiede suggerimenti per il pasto o dichiara un pasto generico',
    '(es. "mangio pane e pomodoro"), cerca PRIMA in [USER_HABITS_FOR_CURRENT_MEAL].',
    'Proponi l esatta combinazione e grammatura storica. Non inventare grammature se esistono nello storico.',
    '',
    dailyCalorieStrategy.isRestDay
      ? 'GIORNO DI RIPOSO PIANIFICATO: [UPCOMING_WORKOUT] è disattivato. NON applicare logica pre-allenamento né semaforo giallo pre-workout. Priorità deficit da [DAILY_CALORIE_STRATEGY].'
      : '',
    dailyCalorieStrategy.isTrainingDay
      ? `GIORNO DI ALLENAMENTO PIANIFICATO (${dailyCalorieStrategy.activityLabel || 'sessione'}): priorità surplus da [DAILY_CALORIE_STRATEGY]. Target giornaliero ${dailyCalorieStrategy.targetKcal} kcal.`
      : '',
    '',
    'CORREZIONE PROPORZIONALE PRE-ALLENAMENTO (tassativa SOLO se [UPCOMING_WORKOUT] non è null,',
    '[DAILY_CALORIE_STRATEGY].isRestDay non è true, e startsInMinutes <= 180): adatta le abitudini in mealProposals prima di proporle.',
    'Riduci leggermente grassi e fibre rispetto alla grammatura abituale, o adatta i carboidrati',
    'per favorire lo svuotamento gastrico. In adviceMessage spiega brevemente la modifica.',
    '',
    'HARD CONSTRAINT (INVIOLABILE) — VINCOLO MATEMATICO: totals.kcal di OGNI proposta deve essere <= [METABOLIC_BUDGET].kcal. Se sfora, devi scalare i grammi finché rientra.',
    'SCALING OBBLIGATORIO: taglia carboidrati e grassi (anche 50-70%) e preserva le proteine. Non lasciare porzioni storiche intatte se sforano.',
    'PULIZIA ACCAVALLAMENTI: se appaiono più fonti di carboidrati nella stessa proposta, selezionane solo una ed elimina le altre.',
    'In adviceMessage spiega chiaramente che hai ridotto carboidrati e grassi per rispettare il budget kcal.',
    '',
    residualAfterPartial
      ? [
        'SOUS-CHEF MODE ATTIVO: [PARTIAL_MEAL] è già in preparazione.',
        'Il tuo UNICO compito è proporre 2-3 opzioni di COMPLETAMENTO con SOLO ingredienti integrativi (non ripetere quelli in PARTIAL_MEAL).',
        'Vincolo assoluto: il totale kcal degli ingredienti integrativi per ogni opzione deve essere <= [RESIDUAL_BUDGET_AFTER_PARTIAL_MEAL].kcal.',
        'Ottimizza i micro: priorità agli ingredienti che aumentano i nutrienti con remaining più alto in [METABOLIC_BUDGET].micros, restando nel residuo.',
      ].join('\n')
      : '',
    intent === 'ASK_DAY_REVIEW'
      ? [
        'DEBRIEFING SERALE ATTIVO (ASK_DAY_REVIEW).',
        'NON generare mealProposals. NON generare suggestedAction. Produci SOLO adviceMessage con la struttura richiesta (Esito / Cosa ha funzionato / Cosa migliorare / Consiglio per domani).',
        'Basa il giudizio su [DAILY_CALORIE_STRATEGY] e su [DAILY_TOTALS] vs [DAILY_TARGETS].',
        'Dai priorità alle carenze micro in [METABOLIC_BUDGET].micros. Tono empatico, senza stress.',
      ].join('\n')
      : '',
    '',
    eveningContext.isDinnerContext || eveningContext.isEvening
      ? [
        'CONTESTO SERALE ATTIVO: applica REGOLA CORTISOLO SERALE, PASTI ANTI-CORTISOLO e DIGESTIVE SAFETY GATE.',
        `Cortisolo stimato: ${eveningContext.cortisolScore ?? 'n/d'}/100. Rischio stress serale: ${eveningContext.eveningStressRisk}.`,
        eveningContext.eveningStressRisk === 'high'
          ? 'Priorità: carboidrati complessi, magnesio, omega-3, triptofano; evita cene solo proteiche-magre e grassi saturi in eccesso.'
          : 'Mantieni equilibrio macro rispetto al [METABOLIC_BUDGET] con attenzione al recupero notturno.',
      ].join('\n')
      : '',
    '',
    'OUTPUT JSON richiesto:',
    '- adviceMessage: testo conversazionale per l utente (max 5 frasi, italiano, semaforo). Presenta Opzione 1/2/3 nel testo e chiudi con CTA: "Quale di queste 3 opzioni preferisci? Scegline una e, se serve, la modifichiamo insieme."',
    '- suggestedAction: { foodName, grams, mealType } | null — solo per un singolo alimento rapido.',
    '- mealProposals: array (2-3) di proposte pasto complete, ciascuna:',
    '  { id, label ("Opzione 1"|"Opzione 2"|"Opzione 3"), mealType, exactTime (HH:mm opzionale se l utente ha indicato orario), source, items: [...], totals }.',
    'Ogni grams deve essere > 0. totals DEVE coincidere con la somma degli items.',
    'Preferisci mealProposals dalle abitudini quando disponibili. Usa id/source dall abitudine corrispondente.',
    'Alternativa testuale ammessa nel adviceMessage: blocco <MEAL_PROPOSAL>...</MEAL_PROPOSAL> con lo stesso JSON interno.',
    '',
    'NOTA: Le richieste di REGISTRAZIONE pasto consumato (ADD_FOOD) usano Smart Defaults lato server.',
    'Per i CONSIGLI (questo prompt): compila subito mealProposals senza chiedere orari o tipo pasto.',
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
  const fullHistory = adviceContext?.fullHistory || {};
  const rawName = String(item.rawQuery || item.foodName || '').trim();
  const grams = Math.round(Number(item.grams ?? item.qta) || 0);
  if (!rawName || !Number.isFinite(grams) || grams <= 0) return null;

  const resolved = resolveFoodItemForProposal(rawName, grams, {
    foodDb,
    fullHistory,
    mealType,
    preferredDbKey: item.foodDbKey ?? null,
  });

  if (!resolved) return item;

  return {
    ...resolved,
    rawQuery: rawName,
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
      const llmItems = Array.isArray(proposal.items) ? proposal.items : [];
      const rawItems =
        llmItems.length > 0
          ? llmItems
          : (allowHabitExpansion && Array.isArray(habitRef?.items) ? habitRef.items : []);

      const habitItemsByName = new Map(
        (allowHabitExpansion ? (habitRef?.items || []) : llmItems)
          .filter((it) => it?.foodName)
          .map((it) => [String(it.foodName).toLowerCase(), it]),
      );

      const items = rawItems
        .map((item) => {
          const normalized = normalizeProposalItem(item, habitItemsByName);
          if (!normalized) return null;
          return enrichProposalItemWithResolver(normalized, adviceContext, mealType);
        })
        .filter(Boolean);

      if (items.length === 0) return null;

      const totals = roundTotals(sumProposalItemMacros(items));
      const exactTime = resolveExactTimeForMeal(proposal, adviceContext?.rawUserQuery || '');

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
