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
    const foodKeywords = ['mang', 'cibo', 'alimento', 'pasto', 'colazione', 'pranzo', 'cena', 'snack'];
    if (foodKeywords.some((token) => text.includes(token))) return 'ADD_FOOD';
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

  composeForIntent(intent, currentState = {}) {
    const normalizedIntent = toSafeString(intent).toUpperCase();
    if (normalizedIntent === 'ADD_FOOD') {
      return {
        intent: 'ADD_FOOD',
        contextSlices: {
          food: this.getFoodContext(currentState.foodDatabase, currentState.mealState),
        },
      };
    }
    if (normalizedIntent === 'ADD_WORKOUT') {
      return {
        intent: 'ADD_WORKOUT',
        contextSlices: {
          workout: this.getWorkoutContext(currentState.dailyStats),
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

  buildPromptContext(intent, currentState = {}) {
    const bundle = this.composeForIntent(intent, currentState);
    return {
      ...bundle,
      promptContextText: JSON.stringify(bundle.contextSlices),
    };
  }
}

export const contextComposer = new ContextComposer();
