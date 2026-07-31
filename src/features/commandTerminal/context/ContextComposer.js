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
  isConsultantMealIntent,
  parseConsultantMealIntent,
  isWipMealBuildIntent,
  parseWipMealDeclaration,
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
import { buildTodayDiaryIndex } from '../conversation/todayDiaryIndex.js';
import { isWorkoutLogIntent, isConsultativeStateIntent } from '../conversation/workoutRegistrationSlots.js';
import { formatCurrentSystemTimeContext } from '../conversation/mealSmartDefaults.js';
import {
  buildKentuGlobalStateFromAppState,
} from './kentuGlobalState.js';

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

function buildDailyBudgetRemaining(currentState = {}) {
  const nutrition = buildNutritionContextForState(currentState);
  const budget = nutrition?.remainingBudget || {};
  return {
    remainingCalories: Math.round(Number(budget.kcal) || 0),
    remainingProtein: Math.round(Number(budget.pro) || 0),
    remainingCarbs: Math.round(Number(budget.carbo) || 0),
    remainingFat: Math.round(Number(budget.fat) || 0),
  };
}

export { buildTodayDiaryIndex } from '../conversation/todayDiaryIndex.js';

export class ContextComposer {
  detectIntent(userText = '', { hasImages = false, chatHistory = [], pendingMealUpdate = null } = {}) {
    const text = toSafeString(userText).toLowerCase();
    if (!text) return hasImages ? 'LOG_SLEEP' : 'UNKNOWN';
    if (pendingMealUpdate?.targetMealType) return 'UPDATE_LOGGED_MEAL';
    const sleepKeywords = ['sonno', 'sleep', 'dormito', 'dormire', 'deep sleep', 'sleep score', 'smartwatch'];
    if (sleepKeywords.some((token) => text.includes(token))) return 'LOG_SLEEP';

    // DATA ENTRY pasti PRIMA del consulto: "come snack, ho mangiato…" → ADD_FOOD.
    if (isFoodRegistrationIntent(text)) return 'ADD_FOOD';

    // Domande sullo stato (CASO 2) prima di qualsiasi bozza workout.
    if (isConsultativeStateIntent(text)) {
      if (isDayReviewIntent(text)) return 'ASK_DAY_REVIEW';
      if (isMealAdviceIntent(text, chatHistory)) return 'ASK_MEAL_ADVICE';
      return 'CHAT_RESPONSE';
    }
    // Workout PRIMA di meal-advice: "allenamento gambe" non deve finire in ASK_MEAL_ADVICE.
    if (isWorkoutLogIntent(text)) return 'ADD_WORKOUT';
    if (hasImages && isCreateNewFoodIntent(text)) return 'CREATE_NEW_FOOD';
    if (isDayReviewIntent(text)) return 'ASK_DAY_REVIEW';
    if (isSubstituteMealDraftIntent(text, chatHistory)) return 'SUBSTITUTE_MEAL_DRAFT_ITEM';
    if (isFixMealDraftIntent(text, chatHistory)) return 'FIX_MEAL_DRAFT';
    if (isMealDraftEvaluationIntent(text)) return 'EVALUATE_MEAL_DRAFT';
    if (isMealCompletionIntent(text)) return 'ASK_MEAL_COMPLETION';
    if (isUpdateLoggedMealIntent(text, chatHistory)) return 'UPDATE_LOGGED_MEAL';
    if (isConsultantMealIntent(text, chatHistory)) return 'CONSULTANT_MEAL';
    if (isWipMealBuildIntent(text, chatHistory)) return 'WIP_MEAL_BUILD';
    if (isMealAdviceIntent(text, chatHistory)) return 'ASK_MEAL_ADVICE';
    return 'UNKNOWN';
  }

  /**
   * @param {object} currentState
   * @returns {Array<object>}
   */
  getTodayDiaryIndex(currentState = {}) {
    return buildTodayDiaryIndex(currentState?.activeLog || [], {
      fullHistory: currentState?.fullHistory || {},
      activeDate: currentState?.activeDate || null,
    });
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
        'ADD_FOOD few-shot: User "Ho mangiato 90g di sardine all\'olio e 160g di pane integrale" → items [{foodName:"sardine all\'olio",grams:90},{foodName:"pane integrale",grams:160}]. foodName = stringa pulita DB (NO grammi, NO congiunzioni). uiMessage/adviceMessage VUOTI.',
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
      const nutritionSlices = this.buildNutritionContextSlices(currentState);
      return {
        intent: 'ADD_FOOD',
        contextSlices: {
          ...nutritionSlices,
          // PRE-pasto: non usare Delta/remaining per copy. Feedback budget e post-macro.
          METABOLIC_BUDGET: {
            note:
              'REDACTED_FOR_ADD_FOOD: Se commandType e ADD_FOOD, lascia uiMessage e adviceMessage VUOTI. '
              + 'I calcoli di budget verranno fatti dal sistema. NON citare kcal rimanenti ne cilindri.',
            suppressBudgetCommentary: true,
          },
          COPY_POLICY:
            'ADD_FOOD: adviceMessage="" e uiMessage="". Nessun paragrafo di stato metabolico.',
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
          CARDIO_VS_HYPERTROPHY:
            'REGOLA DI COMPILAZIONE TASSATIVA: Quando l\'utente registra un\'attivita puramente CARDIO '
            + '(es. corsa, camminata, SUP, nuoto, bici, o dichiara "minuti di cardio"), devi aggiornare '
            + 'ESCLUSIVAMENTE il parametro dei minuti di cardio (durationMinutes + workoutType=cardio). '
            + 'E SEVERAMENTE VIETATO alterare, incrementare o compilare i parametri di affaticamento dei '
            + 'cilindri muscolari (Spinta, Trazione, Gambe, Core) in risposta ad attivita cardio. '
            + 'Non usare workoutType gambe/spinta/trazione e lascia muscles=[]/null/omesso. '
            + 'I cilindri muscolari devono essere modificati SOLO ED ESCLUSIVAMENTE se l\'utente dichiara '
            + 'esplicitamente un allenamento di pesistica / ipertrofia mirato a quei gruppi muscolari.',
        },
      };
    }
    if (normalizedIntent === 'CHAT_RESPONSE') {
      return {
        intent: 'CHAT_RESPONSE',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          TODAY_DIARY_INDEX: this.getTodayDiaryIndex(currentState),
          INTENT_ROUTING:
            'CASO 2 CONSULTO: rispondi solo con commandType CHAT_RESPONSE. '
            + 'Usa ESCLUSIVAMENTE KENTU_GLOBAL_STATE. Vietato ADD_FOOD/ADD_WORKOUT/bozze.',
          app: {
            activeDate: toSafeString(currentState?.activeDate) || null,
            locale: toSafeString(currentState?.locale) || 'it-IT',
          },
        },
      };
    }
    if (normalizedIntent === 'ASK_MEAL_ADVICE') {
      return {
        intent: 'ASK_MEAL_ADVICE',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          TODAY_DIARY_INDEX: this.getTodayDiaryIndex(currentState),
          app: {
            activeDate: toSafeString(currentState?.activeDate) || null,
            locale: toSafeString(currentState?.locale) || 'it-IT',
          },
        },
      };
    }
    if (normalizedIntent === 'CONSULTANT_MEAL') {
      const consultantRequest = parseConsultantMealIntent(userText);
      const dailyBudgetRemaining = buildDailyBudgetRemaining(currentState);
      return {
        intent: 'CONSULTANT_MEAL',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          dailyBudgetRemaining,
          TODAY_DIARY_INDEX: this.getTodayDiaryIndex(currentState),
          CONSULTANT_MEAL_REQUEST: {
            mealType: consultantRequest?.mealType || null,
            anchorFood: consultantRequest?.anchorFood || null,
            userText: toSafeString(userText),
          },
          app: {
            activeDate: toSafeString(currentState?.activeDate) || null,
            locale: toSafeString(currentState?.locale) || 'it-IT',
          },
        },
      };
    }
    if (normalizedIntent === 'WIP_MEAL_BUILD') {
      const wipDeclaration = parseWipMealDeclaration(userText);
      const dailyBudgetRemaining = buildDailyBudgetRemaining(currentState);
      const wipMealItems = Array.isArray(currentState?.wipMealItems)
        ? currentState.wipMealItems
        : [];
      return {
        intent: 'WIP_MEAL_BUILD',
        contextSlices: {
          ...this.buildNutritionContextSlices(currentState),
          dailyBudgetRemaining,
          WIP_MEAL_ITEMS: wipMealItems,
          WIP_MEAL_DECLARATION: wipDeclaration,
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
          TODAY_DIARY_INDEX: this.getTodayDiaryIndex(currentState),
          EXISTING_MEAL_NODE: existingMealNode,
          UPDATE_REQUEST: {
            targetMealType: targetMealType || null,
            timeQualifier: updateContext?.timeQualifier || parsedTarget?.timeQualifier || null,
            userText: combinedUserText,
            isFollowUp: Boolean(pendingUpdate),
            resolutionMethod: updateContext?.resolution?.resolutionMethod || null,
            source: existingMealNode ? 'active_log' : 'missing',
          },
          MUTATION_VOCABULARY:
            'Per UPDATE_LOGGED_MEAL: usa [TODAY_DIARY_INDEX] per scegliere targetNodeId e targetItemId. '
            + 'Compila mealProposals[0].operations[] con action add|update|delete e mealProposals[0].resultingItems[] '
            + '(lista FINALE completa del pasto = source of truth). Copia anche resultingItems in items[]. '
            + 'Per delete/update usa itemId da [TODAY_DIARY_INDEX] o [EXISTING_MEAL_NODE].',
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
          TODAY_DIARY_INDEX: this.getTodayDiaryIndex(currentState),
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

    let kentuGlobalStateText = '';
    let kentuGlobalState = null;
    try {
      const global = buildKentuGlobalStateFromAppState(currentState);
      kentuGlobalState = global.object;
      kentuGlobalStateText = global.text;
      // ADD_FOOD: redige Delta rimanente nel dump stato — altrimenti l'LLM cita i valori PRE-pasto.
      if (String(effectiveIntent || '').toUpperCase() === 'ADD_FOOD' && kentuGlobalState?.Nutrition_Context) {
        kentuGlobalState = {
          ...kentuGlobalState,
          Nutrition_Context: {
            ...kentuGlobalState.Nutrition_Context,
            Delta: {
              Kcal: null,
              Pro: null,
              Cho: null,
              Fat: null,
              note:
                'REDACTED_FOR_ADD_FOOD: NON citare budget rimanente. '
                + 'Sara ricalcolato dal sistema dopo i macro del pasto.',
            },
          },
        };
        kentuGlobalStateText = JSON.stringify(kentuGlobalState, null, 2);
      }
    } catch (error) {
      console.warn('[ContextComposer] buildKentuGlobalState failed', error);
    }

    return {
      ...bundle,
      contextSlices: {
        ...(bundle.contextSlices || {}),
        ...(kentuGlobalState ? { KENTU_GLOBAL_STATE: kentuGlobalState } : {}),
      },
      kentuGlobalStateText,
      promptContextText: JSON.stringify({
        ...(bundle.contextSlices || {}),
        ...(kentuGlobalState ? { KENTU_GLOBAL_STATE: kentuGlobalState } : {}),
      }),
    };
  }
}

export const contextComposer = new ContextComposer();
