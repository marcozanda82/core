const MAX_FOOD_CONTEXT_ITEMS = 40;

function toSafeString(value) {
  return String(value ?? '').trim();
}

function normalizeMealType(value) {
  const v = toSafeString(value).toLowerCase();
  if (['colazione', 'snack', 'pranzo', 'cena'].includes(v)) return v;
  return null;
}

const MEAL_ADVICE_PATTERNS = [
  /\bposso\s+(?:mangiare|prendere|avere)\b/,
  /\bconviene\s+(?:mangiare|prendere)\b/,
  /\bmi\s+consigli\b/,
  /\b(?:è|e)\s+ok\s+mangiare\b/,
  /\bva\s+bene\s+mangiare\b/,
  /\bse\s+mangio\b/,
  /\bdentro\s+(?:al\s+)?budget\b/,
  /\bquanto\s+(?:posso\s+)?mangiare\b/,
  /\bposso\s+.*\?/,
];

const FOOD_LOG_PATTERNS = [
  /\bho\s+mangiat/,
  /\bho\s+preso\b/,
  /\bho\s+bevut/,
  /\baggiung/i,
  /\blogg/i,
  /\bregistr/i,
];

export class ContextComposer {
  detectIntent(userText = '', { hasImages = false } = {}) {
    const text = toSafeString(userText).toLowerCase();
    if (!text) return hasImages ? 'LOG_SLEEP' : 'UNKNOWN';
    const sleepKeywords = ['sonno', 'sleep', 'dormito', 'dormire', 'deep sleep', 'sleep score', 'smartwatch'];
    if (sleepKeywords.some((token) => text.includes(token))) return 'LOG_SLEEP';
    const workoutKeywords = ['allenamento', 'workout', 'corsa', 'pesi', 'cardio', 'training'];
    if (workoutKeywords.some((token) => text.includes(token))) return 'ADD_WORKOUT';
    const isFoodLog = FOOD_LOG_PATTERNS.some((pattern) => pattern.test(text));
    const isMealAdvice = MEAL_ADVICE_PATTERNS.some((pattern) => pattern.test(text));
    if (isMealAdvice && !isFoodLog) return 'ASK_MEAL_ADVICE';
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
      slotFillingPolicy:
        'ADD_FOOD: usa items[] con tutti gli alimenti elencati; ometti grams e mealType se non espliciti nel messaggio utente; il terminale chiederà i dati mancanti e poi chiederà conferma.',
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
    if (normalizedIntent === 'ASK_MEAL_ADVICE') {
      return {
        intent: 'ASK_MEAL_ADVICE',
        contextSlices: {
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

  buildPromptContext(intent, currentState = {}) {
    const bundle = this.composeForIntent(intent, currentState);
    return {
      ...bundle,
      promptContextText: JSON.stringify(bundle.contextSlices),
    };
  }
}

export const contextComposer = new ContextComposer();
