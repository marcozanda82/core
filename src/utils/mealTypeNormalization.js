import { toCanonicalMealType } from '../coreEngine';

const STRATEGY_KEY_MAP = {
  colazione: 'colazione',
  merenda1: 'colazione',
  snack: 'snack',
  merenda_am: 'snack',
  merenda_pm: 'snack',
  merenda2: 'snack',
  spuntino: 'snack',
  pranzo: 'pranzo',
  cena: 'cena',
};

export function getStrategyKey(mealType) {
  return STRATEGY_KEY_MAP[mealType] || toCanonicalMealType(mealType) || mealType;
}

export function mealIdFromCanonical(c) {
  const canon = toCanonicalMealType(String(c || '').split('_')[0]);
  if (canon === 'colazione') return 'colazione';
  if (canon === 'snack') return 'snack';
  if (canon === 'pranzo') return 'pranzo';
  if (canon === 'cena') return 'cena';
  return canon || 'pranzo';
}

const AI_MEAL_PHRASE_EXACT = {
  colazione: 'colazione',
  merenda1: 'colazione',
  breakfast: 'colazione',
  pranzo: 'pranzo',
  lunch: 'pranzo',
  cena: 'cena',
  dinner: 'cena',
  'pasto serale': 'cena',
  snack: 'snack',
  spuntino: 'snack',
  merenda: 'snack',
  merenda_am: 'snack',
  merenda_pm: 'snack',
  merenda2: 'snack',
  'merenda am': 'snack',
  'merenda pm': 'snack',
  'spuntino mattina': 'snack',
  'spuntino pomeridiano': 'snack',
  'spuntino pomeriggio': 'snack',
};

/** Vocabolario AI → id diario: colazione, snack, pranzo, cena. */
export function normalizeAiMealTypeToStorageId(raw, decimalHourInfer) {
  const inferH =
    typeof decimalHourInfer === 'number' && !Number.isNaN(decimalHourInfer)
      ? decimalHourInfer
      : new Date().getHours() + new Date().getMinutes() / 60;
  const k = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
  if (!k) return 'snack';
  if (Object.prototype.hasOwnProperty.call(AI_MEAL_PHRASE_EXACT, k)) {
    return AI_MEAL_PHRASE_EXACT[k];
  }
  const base = k.includes(' ') ? k.replace(/\s/g, '_') : k;
  const canon = toCanonicalMealType(base);
  const id = mealIdFromCanonical(canon);
  const allowed = new Set(['colazione', 'snack', 'pranzo', 'cena']);
  if (allowed.has(id)) return id;
  return 'snack';
}
