import { buildNutritionContextForState } from '../../../conversation/ConsultantEngine.js';
import { computeTotali } from '../../../useBiochimico.js';
import {
  isFoodRegistrationIntent,
  isMealAdviceIntent,
  isMealCompletionIntent,
  isDayReviewIntent,
  isCreateNewFoodIntent,
  parseConsumedMealFromNaturalText,
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

export class ContextComposer {
  detectIntent(userText = '', { hasImages = false } = {}) {
    const text = toSafeString(userText).toLowerCase();
    if (!text) return hasImages ? 'LOG_SLEEP' : 'UNKNOWN';
    const sleepKeywords = ['sonno', 'sleep', 'dormito', 'dormire', 'deep sleep', 'sleep score', 'smartwatch'];
    if (sleepKeywords.some((token) => text.includes(token))) return 'LOG_SLEEP';
    const workoutKeywords = ['allenamento', 'workout', 'corsa', 'pesi', 'cardio', 'training'];
    if (workoutKeywords.some((token) => text.includes(token))) return 'ADD_WORKOUT';
    if (hasImages && isCreateNewFoodIntent(text)) return 'CREATE_NEW_FOOD';
    if (isDayReviewIntent(text)) return 'ASK_DAY_REVIEW';
    if (isMealCompletionIntent(text)) return 'ASK_MEAL_COMPLETION';
    if (isMealAdviceIntent(text)) return 'ASK_MEAL_ADVICE';
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
        'ADD_FOOD Smart Defaults: se mancano tipo pasto o orario, deduci da CURRENT_SYSTEM_TIME (06:00-10:30 colazione, 12:00-15:00 pranzo, 19:00-22:30 cena, altro snack). Orario assente = ora corrente. Chiedi SOLO grammature mancanti.',
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

  composeForIntent(intent, currentState = {}, { userText = '' } = {}) {
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

  buildPromptContext(intent, currentState = {}, userText = '') {
    const bundle = this.composeForIntent(intent, currentState, { userText });
    return {
      ...bundle,
      promptContextText: JSON.stringify(bundle.contextSlices),
    };
  }
}

export const contextComposer = new ContextComposer();
