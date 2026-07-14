import { buildNutritionContextForState } from '../../../conversation/ConsultantEngine.js';
import { computeTotali } from '../../../useBiochimico.js';
import {
  isFoodRegistrationIntent,
  isMealAdviceIntent,
  isMealCompletionIntent,
  isMealDraftEvaluationIntent,
  isFixMealDraftIntent,
  isSubstituteMealDraftIntent,
  isDayReviewIntent,
  isCreateNewFoodIntent,
  isUpdateLoggedMealIntent,
  parseTargetMealTypeFromUpdateText,
  resolveUpdateMealContext,
  findPendingUpdateLoggedMealContext,
  buildUpdateLoggedMealCombinedQuery,
  parseConsumedMealFromNaturalText,
  parseMealDraftProjectionFromText,
  findLatestMealDraftProjectionFromChatHistory,
  parseRemovedFoodQueryFromSubstituteText,
  resolveSubstituteRemovedItem,
} from '../conversation/mealLogIntent.js';
import { formatCurrentSystemTimeContext } from '../conversation/mealSmartDefaults.js';

const MAX_FOOD_CONTEXT_ITEMS = 40;

function toSafeString(value) {
  return String(value ?? '').trim();
}

function normalizeMealType(value) {
  const v = toSafeString(value).toLowerCase();
  if (['colazione', 'snack', 'pranzo', 'cena'].includes(v)) return v;
  return null;
}

function normalizeFoodToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export class ContextComposer {
  detectIntent(userText = '', { hasImages = false, chatHistory = [], pendingMealUpdate = null } = {}) {
    const text = toSafeString(userText).toLowerCase();
    if (!text) return hasImages ? 'LOG_SLEEP' : 'UNKNOWN';
    if (pendingMealUpdate?.targetMealType) return 'UPDATE_LOGGED_MEAL';
    const sleepKeywords = ['sonno', 'sleep', 'dormito', 'dormire', 'deep sleep', 'sleep score', 'smartwatch'];
    if (sleepKeywords.some((token) => text.includes(token))) return 'LOG_SLEEP';
    const workoutKeywords = ['allenamento', 'workout', 'corsa', 'pesi', 'cardio', 'training'];
    if (workoutKeywords.some((token) => text.includes(token))) return 'ADD_WORKOUT';
    if (hasImages && isCreateNewFoodIntent(text)) return 'CREATE_NEW_FOOD';
    if (isDayReviewIntent(text)) return 'ASK_DAY_REVIEW';
    if (isSubstituteMealDraftIntent(text, chatHistory)) return 'SUBSTITUTE_MEAL_DRAFT_ITEM';
    if (isFixMealDraftIntent(text, chatHistory)) return 'FIX_MEAL_DRAFT';
    if (isMealDraftEvaluationIntent(text)) return 'EVALUATE_MEAL_DRAFT';
    if (isMealCompletionIntent(text)) return 'ASK_MEAL_COMPLETION';
    if (isUpdateLoggedMealIntent(text, chatHistory)) return 'UPDATE_LOGGED_MEAL';
    if (isMealAdviceIntent(text, chatHistory)) return 'ASK_MEAL_ADVICE';
    if (isFoodRegistrationIntent(text)) return 'ADD_FOOD';
    return 'UNKNOWN';
  }

  getFoodContext(foodDatabase = {}, mealState = {}) {
    const knownFoods = Object.values(foodDatabase || {})
      .filter((row) => row && typeof row === 'object')
      .slice(0, MAX_FOOD_CONTEXT_ITEMS)
      .map((row) => ({
        name: toSafeString(row.desc || row.name),
        kcal: Number.isFinite(Number(row.kcal ?? row.cal)) ? Number(row.kcal ?? row.cal) : null,
        prot: Number.isFinite(Number(row.prot)) ? Number(row.prot) : null,
        carb: Number.isFinite(Number(row.carb)) ? Number(row.carb) : null,
        fatTotal: Number.isFinite(Number(row.fatTotal ?? row.fat))
          ? Number(row.fatTotal ?? row.fat)
          : null,
      }))
      .filter((row) => row.name);

    return {
      mealType: normalizeMealType(mealState?.mealType),
      recentFoods: Array.isArray(mealState?.recentFoods)
        ? mealState.recentFoods.slice(0, 10).map((name) => toSafeString(name)).filter(Boolean)
        : [],
      knownFoods,
      slotFillingPolicy:
        'ADD_FOOD entity extraction (HARD): foodName = solo nome puro alimento (NO grammi, parentesi, "e " iniziale); grams in campo separato; congiunzioni e virgole separano alimenti senza creare voci duplicate. Smart Defaults: se mancano tipo pasto o orario, deduci da CURRENT_SYSTEM_TIME (06:00-10:30 colazione, 12:00-15:00 pranzo, 19:00-22:30 cena, altro snack). Orario assente = ora corrente. Chiedi SOLO grammature mancanti. adviceMessage in registrazione: solo riepilogo neutro, NO allarmi grassi/budget.',
    };
  }

  getWorkoutContext(dailyStats = {}) {
    return {
      todayWorkoutKcal: Number.isFinite(Number(dailyStats?.todayWorkoutKcal))
        ? Number(dailyStats.todayWorkoutKcal)
        : null,
      suggestedWorkoutTime: toSafeString(dailyStats?.suggestedWorkoutTime) || null,
      recoveryScore: Number.isFinite(Number(dailyStats?.recoveryScore))
        ? Number(dailyStats.recoveryScore)
        : null,
      bodyBatteryPercent: Number.isFinite(Number(dailyStats?.bodyBatteryPercent))
        ? Number(dailyStats.bodyBatteryPercent)
        : null,
    };
  }

  getWorkoutHabitsFromState(currentState = {}) {
    const habits = [];
    const seen = new Set();

    const pushHabit = (raw = {}) => {
      if (!raw || typeof raw !== 'object') return;
      const exerciseName = toSafeString(raw.exerciseName || raw.desc || raw.name);
      if (!exerciseName) return;
      const key = exerciseName.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      habits.push({
        exerciseName,
        sets: Number.isFinite(Number(raw.sets)) ? Number(raw.sets) : null,
        reps: Number.isFinite(Number(raw.reps)) ? Number(raw.reps) : null,
        weightKg: Number.isFinite(Number(raw.weightKg ?? raw.weight)) ? Number(raw.weightKg ?? raw.weight) : null,
        durationMinutes: Number.isFinite(Number(raw.durationMinutes)) ? Number(raw.durationMinutes) : null,
      });
    };

    const activeLog = Array.isArray(currentState?.activeLog) ? currentState.activeLog : [];
    [...activeLog].reverse().forEach((item) => {
      if (item?.type !== 'workout') return;
      pushHabit(item);
      const detail = toSafeString(item.strengthDetail || item.notes);
      if (detail) {
        pushHabit({
          exerciseName: detail,
          sets: item.sets,
          reps: item.reps,
          weightKg: item.weightKg ?? item.weight,
          durationMinutes: item.durationMinutes,
        });
      }
    });

    return habits.slice(0, 15);
  }

  buildNutritionContextSlices(currentState = {}) {
    const nutrition = buildNutritionContextForState(currentState);
    const systemTime = formatCurrentSystemTimeContext();
    return {
      systemTime: {
        currentTime: systemTime.timeHHmm,
        currentDate: systemTime.dateISO,
        header: systemTime.header,
      },
      currentMealType: nutrition.currentMealType,
      METABOLIC_BUDGET: nutrition.remainingBudget,
      USER_HABITS_FOR_CURRENT_MEAL: nutrition.userHabitsForCurrentMeal,
      UPCOMING_WORKOUT: nutrition.upcomingWorkout,
      DAILY_CALORIE_STRATEGY: nutrition.dailyCalorieStrategy,
    };
  }

  composeForIntent(intent, currentState = {}, { userText = '', chatHistory = [] } = {}) {
    const normalizedIntent = toSafeString(intent).toUpperCase();
    if (normalizedIntent === 'ADD_FOOD') {
      return {
        intent: 'ADD_FOOD',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          food: this.getFoodContext(currentState.foodDatabase, currentState.mealState),
        },
      };
    }
    if (normalizedIntent === 'ADD_WORKOUT') {
      return {
        intent: 'ADD_WORKOUT',
        contextSlices: {
          workout: this.getWorkoutContext(currentState.dailyStats),
          USER_WORKOUT_HABITS: this.getWorkoutHabitsFromState(currentState),
        },
      };
    }
    if (normalizedIntent === 'ASK_MEAL_ADVICE') {
      return {
        intent: 'ASK_MEAL_ADVICE',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          app: {
            activeDate: toSafeString(currentState?.activeDate) || null,
            locale: toSafeString(currentState?.locale) || 'it-IT',
          },
        },
      };
    }
    if (normalizedIntent === 'ASK_MEAL_COMPLETION') {
      const parsed = parseConsumedMealFromNaturalText(String(userText || ''));
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      return {
        intent: 'ASK_MEAL_COMPLETION',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          PARTIAL_MEAL: {
            items,
            mealType: parsed?.mealType || null,
            exactTime: parsed?.exactTime || null,
            source: items.length > 0 ? 'user_text' : 'none',
          },
          app: {
            activeDate: toSafeString(currentState?.activeDate) || null,
            locale: toSafeString(currentState?.locale) || 'it-IT',
          },
        },
      };
    }
    if (normalizedIntent === 'EVALUATE_MEAL_DRAFT') {
      const parsed = parseMealDraftProjectionFromText(String(userText || ''));
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      return {
        intent: 'EVALUATE_MEAL_DRAFT',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          MEAL_DRAFT_PROJECTION: {
            items,
            mealType: parsed?.mealType || null,
            exactTime: parsed?.exactTime || null,
            source: items.length > 0 ? 'user_text' : 'none',
          },
          app: {
            activeDate: toSafeString(currentState?.activeDate) || null,
            locale: toSafeString(currentState?.locale) || 'it-IT',
          },
        },
      };
    }
    if (normalizedIntent === 'FIX_MEAL_DRAFT') {
      const history = Array.isArray(chatHistory) ? chatHistory : [];
      const parsed = findLatestMealDraftProjectionFromChatHistory(history);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      return {
        intent: 'FIX_MEAL_DRAFT',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          MEAL_DRAFT_PROJECTION: {
            items,
            mealType: parsed?.mealType || null,
            exactTime: parsed?.exactTime || null,
            source: items.length > 0 ? 'chat_history' : 'none',
          },
          app: {
            activeDate: toSafeString(currentState?.activeDate) || null,
            locale: toSafeString(currentState?.locale) || 'it-IT',
          },
        },
      };
    }
    if (normalizedIntent === 'SUBSTITUTE_MEAL_DRAFT_ITEM') {
      const history = Array.isArray(chatHistory) ? chatHistory : [];
      const parsed = findLatestMealDraftProjectionFromChatHistory(history);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      const removedItem = resolveSubstituteRemovedItem(items, userText);
      const removedKey = normalizeFoodToken(removedItem?.foodName);
      const keptItems = items.filter(
        (item) => normalizeFoodToken(item?.foodName) !== removedKey,
      );
      return {
        intent: 'SUBSTITUTE_MEAL_DRAFT_ITEM',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          MEAL_DRAFT_PROJECTION: {
            items,
            mealType: parsed?.mealType || null,
            exactTime: parsed?.exactTime || null,
            source: items.length > 0 ? 'chat_history' : 'none',
          },
          REMOVED_DRAFT_ITEM: removedItem
            ? {
                foodName: removedItem.foodName,
                grams: removedItem.grams,
                role: removedItem.role || 'draft',
              }
            : null,
          KEPT_DRAFT_ITEMS: keptItems,
          REMOVED_FOOD_QUERY: parseRemovedFoodQueryFromSubstituteText(userText),
          app: {
            activeDate: toSafeString(currentState?.activeDate) || null,
            locale: toSafeString(currentState?.locale) || 'it-IT',
          },
        },
      };
    }
    if (normalizedIntent === 'UPDATE_LOGGED_MEAL') {
      const pendingUpdate = findPendingUpdateLoggedMealContext(chatHistory);
      const parsedTarget = parseTargetMealTypeFromUpdateText(userText);
      const targetMealType =
        parsedTarget?.mealType
        || pendingUpdate?.targetMealType
        || null;
      const combinedUserText = pendingUpdate?.targetMealType
        ? buildUpdateLoggedMealCombinedQuery(pendingUpdate.targetMealType, userText)
        : toSafeString(userText);
      const activeLog = Array.isArray(currentState?.activeLog) ? currentState.activeLog : [];
      const updateContext = resolveUpdateMealContext(
        activeLog,
        userText,
        currentState?.fullHistory || {},
        currentState?.activeDate || null,
        pendingUpdate,
      );
      const existingMealNode = updateContext?.existingMealNode || null;
      return {
        intent: 'UPDATE_LOGGED_MEAL',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          EXISTING_MEAL_NODE: existingMealNode,
          UPDATE_REQUEST: {
            targetMealType: targetMealType || null,
            timeQualifier: updateContext?.timeQualifier || parsedTarget?.timeQualifier || null,
            userText: combinedUserText,
            isFollowUp: Boolean(pendingUpdate),
            resolutionMethod: updateContext?.resolution?.resolutionMethod || null,
            source: existingMealNode ? 'active_log' : 'missing',
          },
          app: {
            activeDate: toSafeString(currentState?.activeDate) || null,
            locale: toSafeString(currentState?.locale) || 'it-IT',
          },
        },
      };
    }
    if (normalizedIntent === 'ASK_DAY_REVIEW') {
      const activeLog = Array.isArray(currentState?.activeLog) ? currentState.activeLog : [];
      const totali = computeTotali(activeLog);
      const nutrition = buildNutritionContextForState(currentState);
      const targets = currentState?.userTargets || {};

      const targetKcal = Math.round(Number(currentState?.dynamicDailyKcal) || Number(targets.kcal) || 2000);
      const targetMacro = {
        kcal: targetKcal,
        prot: Math.round(Number(targets.prot ?? targets.pro ?? 150) || 150),
        carb: Math.round(Number(targets.carb ?? targets.cho ?? 200) || 200),
        fat: Math.round(Number(targets.fatTotal ?? targets.fat ?? 65) || 65),
      };

      return {
        intent: 'ASK_DAY_REVIEW',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          DAILY_TOTALS: totali,
          DAILY_TARGETS: targetMacro,
          WORKOUT_STATUS: {
            hasRealWorkoutToday: currentState?.hasRealWorkoutToday === true || currentState?.isWorkoutDoneToday === true,
            upcomingWorkout: nutrition.upcomingWorkout,
          },
          DAILY_CALORIE_STRATEGY: nutrition.dailyCalorieStrategy,
          app: {
            activeDate: toSafeString(currentState?.activeDate) || null,
            locale: toSafeString(currentState?.locale) || 'it-IT',
          },
        },
      };
    }
    return {
      intent: 'UNKNOWN',
      contextSlices: {
        app: {
          activeDate: toSafeString(currentState?.activeDate) || null,
          locale: toSafeString(currentState?.locale) || 'it-IT',
        },
      },
    };
  }

  buildPromptContext(intent, currentState = {}, userText = '', chatHistory = [], options = {}) {
    const pendingMealUpdate = options?.pendingMealUpdate ?? null;
    const normalizedIntent = toSafeString(intent).toUpperCase();
    const shouldForceUpdateLoggedMeal = Boolean(
      pendingMealUpdate?.targetMealType
      || (normalizedIntent === 'ADD_FOOD' && isUpdateLoggedMealIntent(userText, chatHistory)),
    );
    const effectiveIntent = shouldForceUpdateLoggedMeal ? 'UPDATE_LOGGED_MEAL' : intent;
    const bundle = this.composeForIntent(effectiveIntent, currentState, { userText, chatHistory });
    return {
      ...bundle,
      promptContextText: JSON.stringify(bundle.contextSlices),
    };
  }
}

export const contextComposer = new ContextComposer();
