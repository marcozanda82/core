import { computeTotali } from '../useBiochimico';
import { searchFoodsDetailed } from '../foodSearch';
import { estraiDatiFoodDb } from '../features/salaComandi/engines/foodDataEngine';
import { toCanonicalMealType } from '../coreEngine';
import { inferDefaultMealType } from '../features/commandTerminal/conversation/conversationState';
import { analyzeTodayFromLog } from '../aiDayCoach';

const STANDARD_PORTION_G = 100;
const MEAL_ORDER = ['colazione', 'snack', 'pranzo', 'cena'];

function roundMacro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function pickTargets(currentAppState) {
  const targets = currentAppState?.userTargets || {};
  const dynamicKcal = Number(currentAppState?.dynamicDailyKcal);
  const kcalTarget = Number.isFinite(dynamicKcal) && dynamicKcal > 0
    ? Math.round(dynamicKcal)
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
  return {
    kcal: roundMacro(targets.kcal - (Number(totali.kcal) || 0)),
    pro: roundMacro(targets.pro - (Number(totali.prot) || 0)),
    carbo: roundMacro(targets.carbo - (Number(totali.carb) || 0)),
    fat: roundMacro(targets.fat - (Number(totali.fatTotal ?? totali.fat) || 0)),
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
  ];

  for (let i = 0; i < stripPatterns.length; i += 1) {
    t = t.replace(stripPatterns[i], '').trim();
  }

  return t || String(userText || '').trim();
}

/**
 * Costruisce il contesto compatto per il consulente nutrizionale.
 * @param {string} targetFood
 * @param {object} currentAppState
 * @returns {Promise<object>}
 */
export async function buildAdviceContext(targetFood, currentAppState = {}) {
  void (await Promise.resolve());
  const foodQuery = String(targetFood || '').trim();
  const currentMealType = resolveCurrentMealType(currentAppState);
  const remainingBudget = computeRemainingBudget(currentAppState);
  const foodCandidates = buildFoodCandidates(foodQuery, currentAppState, currentMealType);

  return {
    targetFood: foodQuery,
    remainingBudget,
    foodCandidates,
    currentMealType,
    activeDate: String(currentAppState?.activeDate || '').trim() || null,
  };
}

/**
 * Formatta adviceContext in prompt denso per LLM consulente.
 * @param {object} adviceContext
 * @param {string} [targetFood]
 * @returns {string}
 */
export function generateConsultantPrompt(adviceContext, targetFood) {
  const ctx = adviceContext && typeof adviceContext === 'object' ? adviceContext : {};
  const food = String(targetFood || ctx.targetFood || 'alimento').trim();
  const budget = ctx.remainingBudget || {};
  const meal = String(ctx.currentMealType || 'pasto').trim();
  const candidates = Array.isArray(ctx.foodCandidates) ? ctx.foodCandidates : [];

  const candidateLines = candidates.length > 0
    ? candidates
        .map((c, i) => {
          const label = c.name || `Opzione ${i + 1}`;
          const grams = c.portionGrams ?? STANDARD_PORTION_G;
          return `${i + 1}) ${label} (${c.kcal} kcal, ${c.pro}g P, ${c.carbo}g C, ${c.fat}g G / ${grams}g)`;
        })
        .join('; ')
    : 'nessun match utile nel DB locale';

  return [
    `L'utente vuole mangiare: ${food}.`,
    `Pasto di contesto suggerito: ${meal}.`,
    `Budget rimanente oggi: ${budget.kcal} kcal, ${budget.pro}g P, ${budget.carbo}g C, ${budget.fat}g G.`,
    `Opzioni trovate nel DB locale (porzione ${STANDARD_PORTION_G}g): ${candidateLines}.`,
    'Agisci da coach nutrizionale Kentu: analizza se le opzioni rientrano nel budget rimanente,',
    'dai un semaforo (verde/giallo/rosso), consiglia porzione ideale in grammi e tono breve (max 4 frasi, italiano).',
    'Se il budget è negativo, segnala surplus e adatta il consiglio. Non inventare valori nutrizionali fuori dal DB fornito.',
    'OUTPUT JSON: adviceMessage = testo per l utente. suggestedAction = { foodName, grams, mealType } se verde/giallo',
    '(foodName deve coincidere con un candidato DB); suggestedAction = null se rosso o sconsigliato.',
  ].join(' ');
}

const MEAL_TYPES = ['colazione', 'snack', 'pranzo', 'cena'];

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
