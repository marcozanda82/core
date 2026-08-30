/** @typedef {{ kcal?: number, prot?: number, proteins?: number, carb?: number, carbs?: number, fat?: number, fatTotal?: number }} NutrientBag */
/** @typedef {{ id?: string, foodId?: string, uid?: string, name?: string, emoji?: string, grams?: number, kcal?: number, prot?: number, carb?: number, fat?: number, locked?: boolean }} SolverItem */

import { sanitizeFoodDisplayName } from './foodVisualResolver.js';

/** @typedef {'main' | 'breakfast' | 'snack'} SolverSlotType */

export const SOLVER_FOOD_DB = Object.freeze([
  // —— Pasti principali (pranzo / cena) ——
  { id: 'chicken_breast', name: 'Petto di pollo', emoji: '🍗', category: 'protein', slotTypes: ['main'], kcalPer100g: 165, proteinPer100g: 31, carbPer100g: 0, fatPer100g: 3.6 },
  { id: 'cod', name: 'Merluzzo', emoji: '🐟', category: 'protein', slotTypes: ['main'], kcalPer100g: 82, proteinPer100g: 18, carbPer100g: 0, fatPer100g: 0.7 },
  { id: 'egg_white', name: "Albume d'uovo", emoji: '🥚', category: 'protein', slotTypes: ['main', 'breakfast', 'snack'], kcalPer100g: 52, proteinPer100g: 11, carbPer100g: 0.7, fatPer100g: 0.2 },
  { id: 'turkey_breast', name: 'Fesa di tacchino', emoji: '🦃', category: 'protein', slotTypes: ['main'], kcalPer100g: 135, proteinPer100g: 30, carbPer100g: 0, fatPer100g: 1 },
  { id: 'tofu', name: 'Tofu', emoji: '🧈', category: 'protein', slotTypes: ['main'], kcalPer100g: 76, proteinPer100g: 8, carbPer100g: 1.9, fatPer100g: 4.8 },

  { id: 'sweet_potato', name: 'Patate dolci', emoji: '🍠', category: 'carb', slotTypes: ['main'], kcalPer100g: 86, proteinPer100g: 1.6, carbPer100g: 20, fatPer100g: 0.1 },
  { id: 'basmati_rice', name: 'Riso basmati', emoji: '🍚', category: 'carb', slotTypes: ['main'], kcalPer100g: 350, proteinPer100g: 8, carbPer100g: 77, fatPer100g: 0.6 },
  { id: 'rye_bread', name: 'Pane di segale', emoji: '🍞', category: 'carb', slotTypes: ['main', 'breakfast'], kcalPer100g: 250, proteinPer100g: 8, carbPer100g: 48, fatPer100g: 1.5 },
  { id: 'oats', name: 'Avena', emoji: '🥣', category: 'carb', slotTypes: ['main', 'breakfast'], kcalPer100g: 389, proteinPer100g: 17, carbPer100g: 66, fatPer100g: 7 },

  { id: 'zucchini', name: 'Zucchine', emoji: '🥒', category: 'veggies', slotTypes: ['main'], kcalPer100g: 17, proteinPer100g: 1.2, carbPer100g: 3.1, fatPer100g: 0.3 },
  { id: 'broccoli', name: 'Broccoli', emoji: '🥦', category: 'veggies', slotTypes: ['main'], kcalPer100g: 34, proteinPer100g: 2.8, carbPer100g: 7, fatPer100g: 0.4 },
  { id: 'spinach', name: 'Spinaci', emoji: '🥬', category: 'veggies', slotTypes: ['main'], kcalPer100g: 23, proteinPer100g: 2.9, carbPer100g: 3.6, fatPer100g: 0.4 },
  { id: 'mixed_salad', name: 'Insalata mista', emoji: '🥗', category: 'veggies', slotTypes: ['main'], kcalPer100g: 15, proteinPer100g: 1.4, carbPer100g: 2.9, fatPer100g: 0.2 },

  { id: 'olive_oil', name: 'Olio EVO', emoji: '🫒', category: 'fat', slotTypes: ['main'], kcalPer100g: 884, proteinPer100g: 0, carbPer100g: 0, fatPer100g: 100 },
  { id: 'almonds', name: 'Mandorle', emoji: '🌰', category: 'fat', slotTypes: ['main', 'breakfast', 'snack'], kcalPer100g: 579, proteinPer100g: 21, carbPer100g: 22, fatPer100g: 50 },
  { id: 'walnuts', name: 'Noci', emoji: '🥜', category: 'fat', slotTypes: ['main', 'breakfast', 'snack'], kcalPer100g: 654, proteinPer100g: 15, carbPer100g: 14, fatPer100g: 65 },

  // —— Spuntino / merenda ——
  { id: 'greek_yogurt', name: 'Yogurt Greco 0%', emoji: '🥛', category: 'protein', slotTypes: ['snack', 'breakfast'], kcalPer100g: 59, proteinPer100g: 10, carbPer100g: 3.6, fatPer100g: 0.4 },
  { id: 'skyr', name: 'Skyr', emoji: '🥛', category: 'protein', slotTypes: ['snack', 'breakfast'], kcalPer100g: 63, proteinPer100g: 11, carbPer100g: 4, fatPer100g: 0.2 },
  { id: 'protein_shake', name: 'Shake Proteico', emoji: '🥤', category: 'protein', slotTypes: ['snack'], kcalPer100g: 400, proteinPer100g: 80, carbPer100g: 10, fatPer100g: 5, defaultGrams: 30 },
  { id: 'cottage_cheese', name: 'Fiocchi di latte', emoji: '🧀', category: 'protein', slotTypes: ['snack', 'breakfast'], kcalPer100g: 98, proteinPer100g: 11, carbPer100g: 3, fatPer100g: 4 },
  { id: 'parmesan', name: 'Parmigiano', emoji: '🧀', category: 'protein', slotTypes: ['snack'], kcalPer100g: 431, proteinPer100g: 38, carbPer100g: 4, fatPer100g: 29, defaultGrams: 30 },

  { id: 'banana', name: 'Banana', emoji: '🍌', category: 'carb', slotTypes: ['snack', 'breakfast'], kcalPer100g: 89, proteinPer100g: 1.1, carbPer100g: 23, fatPer100g: 0.3, defaultGrams: 120 },
  { id: 'apple', name: 'Mela', emoji: '🍎', category: 'carb', slotTypes: ['snack', 'breakfast'], kcalPer100g: 52, proteinPer100g: 0.3, carbPer100g: 14, fatPer100g: 0.2, defaultGrams: 150 },
  { id: 'rice_cakes', name: 'Gallette di riso', emoji: '🍘', category: 'carb', slotTypes: ['snack'], kcalPer100g: 387, proteinPer100g: 8, carbPer100g: 85, fatPer100g: 2, defaultGrams: 20 },
  { id: 'oat_cakes', name: 'Gallette di avena', emoji: '🍘', category: 'carb', slotTypes: ['snack'], kcalPer100g: 380, proteinPer100g: 9, carbPer100g: 78, fatPer100g: 3, defaultGrams: 20 },
  { id: 'whole_rusks', name: 'Fette biscottate integrali', emoji: '🍞', category: 'carb', slotTypes: ['snack', 'breakfast'], kcalPer100g: 400, proteinPer100g: 12, carbPer100g: 72, fatPer100g: 6, defaultGrams: 30 },

  { id: 'dark_chocolate', name: 'Cioccolato fondente 85%', emoji: '🍫', category: 'fat', slotTypes: ['snack'], kcalPer100g: 600, proteinPer100g: 10, carbPer100g: 19, fatPer100g: 52, defaultGrams: 15 },
  { id: 'peanut_butter', name: "Burro d'arachidi", emoji: '🥜', category: 'fat', slotTypes: ['snack', 'breakfast'], kcalPer100g: 588, proteinPer100g: 25, carbPer100g: 20, fatPer100g: 50, defaultGrams: 15 },
]);

const GRAM_STEP = 5;
const MIN_GRAMS = 5;

function clamp0(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 10) / 10);
}

function readNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** @param {string|null|undefined} mealType */
export function normalizeSolverMealSlot(mealType) {
  const t = String(mealType || '').trim().toLowerCase().split('_')[0];
  if (t === 'snack' || t === 'spuntino' || t === 'merenda') return 'snack';
  if (t === 'colazione') return 'breakfast';
  return 'main';
}

/** @param {NutrientBag | null | undefined} raw */
function normalizeTargets(raw) {
  return {
    kcal: readNumber(raw?.kcal),
    prot: readNumber(raw?.prot ?? raw?.proteins),
    carb: readNumber(raw?.carb ?? raw?.carbs),
    fat: readNumber(raw?.fat ?? raw?.fatTotal),
  };
}

/** @param {SolverItem[]} items */
function sumNutrients(items) {
  return (items || []).reduce(
    (acc, item) => ({
      kcal: acc.kcal + readNumber(item?.kcal),
      prot: acc.prot + readNumber(item?.prot ?? item?.proteins),
      carb: acc.carb + readNumber(item?.carb ?? item?.carbs),
      fat: acc.fat + readNumber(item?.fat ?? item?.fatTotal),
    }),
    { kcal: 0, prot: 0, carb: 0, fat: 0 },
  );
}

function roundGramsForMacro(macroGrams, per100g) {
  if (!per100g || per100g <= 0) return MIN_GRAMS;
  const raw = readNumber(macroGrams) / (per100g / 100);
  return Math.max(MIN_GRAMS, Math.round(raw / GRAM_STEP) * GRAM_STEP);
}

function roundGramsForKcal(kcalGap, kcalPer100g) {
  if (!kcalPer100g || kcalPer100g <= 0) return MIN_GRAMS;
  const raw = readNumber(kcalGap) / (kcalPer100g / 100);
  return Math.max(MIN_GRAMS, Math.round(raw / GRAM_STEP) * GRAM_STEP);
}

/** Fisher–Yates shuffle con seed numerico per varietà riproducibile per batch. */
function shuffleArray(items, seed = 0) {
  const list = [...items];
  let s = Math.abs(Math.trunc(seed)) || 1;
  for (let i = list.length - 1; i > 0; i -= 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function foodMatchesSlot(food, slotType) {
  const slots = Array.isArray(food?.slotTypes) ? food.slotTypes : ['main'];
  return slots.includes(slotType);
}

function createProposalUid(foodId, index) {
  const base = String(foodId || 'food');
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `prop_${base}_${crypto.randomUUID()}`;
  }
  return `prop_${base}_${index}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** @param {typeof SOLVER_FOOD_DB[number]} food @param {number} grams */
export function nutrientsForGrams(food, grams) {
  const g = Math.max(MIN_GRAMS, readNumber(grams));
  const factor = g / 100;
  return {
    grams: g,
    kcal: Math.round(food.kcalPer100g * factor),
    prot: Math.round(food.proteinPer100g * factor * 10) / 10,
    carb: Math.round(food.carbPer100g * factor * 10) / 10,
    fat: Math.round(food.fatPer100g * factor * 10) / 10,
  };
}

function normalizeFoodName(name) {
  return String(name || '').trim().toLowerCase();
}

/** Risolve l'ID canonico solver per un item (foodId, match per nome, fallback id). */
function resolveItemFoodId(item) {
  const direct = item?.foodId ?? item?._solverFoodId;
  if (direct) return String(direct).trim();

  const name = normalizeFoodName(item?.name ?? item?.desc ?? item?.foodName);
  if (name) {
    const byName = SOLVER_FOOD_DB.find(
      (f) => normalizeFoodName(f.name) === name,
    );
    if (byName) return byName.id;
  }

  return item?.id ? String(item.id).trim() : null;
}

/**
 * Unisce tutti gli ID da escludere: cronologia, pasto corrente, proposte bloccate.
 * @param {{ excludedFoodIds?: string[], existingFoods?: SolverItem[], lockedProposals?: SolverItem[] }} params
 */
export function buildMergedExcludedFoodIds({
  excludedFoodIds = [],
  existingFoods = [],
  lockedProposals = [],
} = {}) {
  const ids = new Set();
  for (const raw of excludedFoodIds || []) {
    const id = String(raw || '').trim();
    if (id) ids.add(id);
  }
  for (const item of [...(existingFoods || []), ...(lockedProposals || [])]) {
    const id = resolveItemFoodId(item);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Bloccati in cima, liberi sotto — ordine stabile all'interno del gruppo. */
export function sortProposalsLockedFirst(proposals = []) {
  return [...proposals].sort(
    (a, b) => (b.locked ? 1 : 0) - (a.locked ? 1 : 0),
  );
}

/**
 * @param {string} category
 * @param {{ excludedFoodIds?: string[], slotType?: SolverSlotType, rotation?: number, shuffleSeed?: number }} opts
 */
function pickFood(category, opts = {}) {
  const {
    excludedFoodIds = [],
    slotType = 'main',
    rotation = 0,
    shuffleSeed = 0,
  } = opts;
  const excluded = new Set(excludedFoodIds || []);

  const slotPool = SOLVER_FOOD_DB.filter(
    (f) => f.category === category && foodMatchesSlot(f, slotType),
  );
  const eligible = slotPool.filter((f) => !excluded.has(f.id));
  if (eligible.length === 0) return null;

  const shuffled = shuffleArray(eligible, shuffleSeed + rotation * 7919 + category.length * 131);
  return shuffled[rotation % shuffled.length];
}

function subtractGap(remaining, nutrients) {
  return {
    kcal: clamp0(remaining.kcal - nutrients.kcal),
    prot: clamp0(remaining.prot - nutrients.prot),
    carb: clamp0(remaining.carb - nutrients.carb),
    fat: clamp0(remaining.fat - nutrients.fat),
  };
}

/** @param {typeof SOLVER_FOOD_DB[number]} food @param {number} grams @param {number} index */
function buildProposal(food, grams, index) {
  const nutrients = nutrientsForGrams(food, grams);
  const uid = createProposalUid(food.id, index);
  return {
    id: uid,
    uid,
    foodId: food.id,
    emoji: food.emoji,
    name: food.name,
    grams: nutrients.grams,
    kcal: nutrients.kcal,
    prot: nutrients.prot,
    carb: nutrients.carb,
    fat: nutrients.fat,
    locked: false,
  };
}

function resolveGramsForFood(food, macroGrams, per100Field, kcalGap = 0) {
  if (food?.defaultGrams && readNumber(macroGrams) <= 0 && readNumber(kcalGap) <= 0) {
    return Math.max(MIN_GRAMS, Math.round(readNumber(food.defaultGrams)));
  }
  if (food?.defaultGrams && readNumber(macroGrams) < 5) {
    return Math.max(MIN_GRAMS, Math.round(readNumber(food.defaultGrams)));
  }
  return roundGramsForMacro(macroGrams, food?.[per100Field]);
}

/**
 * Calcola il gap nutrizionale residuo per centrare il target pasto.
 * Gap = Target − currentItems − lockedProposals (clamp ≥ 0).
 */
export function calculateNutritionalGap(targets, currentItems = [], lockedProposals = []) {
  const target = normalizeTargets(targets);
  const consumed = sumNutrients([...(currentItems || []), ...(lockedProposals || [])]);

  return {
    kcal: clamp0(target.kcal - consumed.kcal),
    prot: clamp0(target.prot - consumed.prot),
    carb: clamp0(target.carb - consumed.carb),
    fat: clamp0(target.fat - consumed.fat),
  };
}

/**
 * Genera proposte di completamento mantenendo gli slot locked e riempiendo il gap.
 *
 * @param {{
 *   gap: NutrientBag,
 *   lockedProposals?: SolverItem[],
 *   excludedFoodIds?: string[],
 *   existingFoods?: SolverItem[],
 *   mealType?: string|null,
 *   selectedSlot?: string|null,
 *   shuffleSeed?: number,
 * }} params
 */
export function generateMealProposals({
  gap,
  lockedProposals = [],
  excludedFoodIds = [],
  existingFoods = [],
  mealType = null,
  selectedSlot = null,
  shuffleSeed = Date.now(),
}) {
  const slotType = normalizeSolverMealSlot(selectedSlot ?? mealType);
  const locked = (lockedProposals || []).map((item) => ({
    ...item,
    locked: true,
    uid: item.uid || item.id,
    id: item.uid || item.id,
  }));

  const excludedSet = new Set(
    buildMergedExcludedFoodIds({
      excludedFoodIds,
      existingFoods,
      lockedProposals: locked,
    }),
  );

  let remaining = {
    kcal: clamp0(gap?.kcal),
    prot: clamp0(gap?.prot ?? gap?.proteins),
    carb: clamp0(gap?.carb ?? gap?.carbs),
    fat: clamp0(gap?.fat ?? gap?.fatTotal),
  };

  const generated = [];
  let rotation = 0;
  const pickOpts = (extraRotation = 0) => ({
    excludedFoodIds: [...excludedSet],
    slotType,
    rotation: rotation + extraRotation,
    shuffleSeed,
  });

  const pushFood = (food, grams) => {
    if (!food || excludedSet.has(food.id)) return;
    excludedSet.add(food.id);
    const proposal = buildProposal(food, grams, generated.length);
    generated.push(proposal);
    remaining = subtractGap(remaining, proposal);
  };

  const protThreshold = slotType === 'snack' ? 2 : 3;
  const carbThreshold = slotType === 'snack' ? 5 : 8;
  const fatThreshold = slotType === 'snack' ? 1.5 : 2;
  const kcalFillerThreshold = slotType === 'snack' ? 25 : 35;

  if (remaining.prot >= protThreshold) {
    const food = pickFood('protein', pickOpts());
    const grams = resolveGramsForFood(food, remaining.prot, 'proteinPer100g');
    pushFood(food, grams);
    rotation += 1;
  }

  if (remaining.carb >= carbThreshold) {
    const food = pickFood('carb', pickOpts());
    const grams = resolveGramsForFood(food, remaining.carb, 'carbPer100g');
    pushFood(food, grams);
    rotation += 1;
  }

  if (remaining.fat >= fatThreshold) {
    const food = pickFood('fat', pickOpts());
    const grams = resolveGramsForFood(food, remaining.fat, 'fatPer100g');
    pushFood(food, grams);
    rotation += 1;
  }

  const fillerCategory = slotType === 'snack' ? 'carb' : 'veggies';
  if (remaining.kcal >= kcalFillerThreshold || generated.length === 0) {
    const food = pickFood(fillerCategory, pickOpts());
    const grams = remaining.kcal >= kcalFillerThreshold
      ? roundGramsForKcal(remaining.kcal, food?.kcalPer100g)
      : (food?.defaultGrams ? Math.max(MIN_GRAMS, Math.round(readNumber(food.defaultGrams))) : 150);
    pushFood(food, slotType === 'snack' ? grams : Math.min(grams, 350));
    rotation += 1;
  }

  if (remaining.kcal >= 25 && remaining.fat >= 1) {
    const food = pickFood('fat', pickOpts(1));
    const grams = Math.min(
      food?.defaultGrams ? Math.max(MIN_GRAMS, Math.round(readNumber(food.defaultGrams))) : 20,
      roundGramsForMacro(remaining.fat, food?.fatPer100g),
    );
    pushFood(food, grams);
  }

  return sortProposalsLockedFirst([...locked, ...generated]);
}

/** Ricalcola i nutrienti di una proposta in base ai grammi (per stepper UI). */
export function scaleProposalNutrients(proposal, nextGrams, foodDb = SOLVER_FOOD_DB) {
  const food = foodDb.find((f) => f.id === proposal?.foodId || f.id === proposal?.id);
  if (food) {
    const nutrients = nutrientsForGrams(food, nextGrams);
    return { ...proposal, ...nutrients };
  }

  const prevGrams = Math.max(1, readNumber(proposal?.grams) || 1);
  const grams = Math.max(MIN_GRAMS, Math.round(readNumber(nextGrams) || prevGrams));
  const ratio = grams / prevGrams;
  return {
    ...proposal,
    grams,
    kcal: Math.round(readNumber(proposal.kcal) * ratio),
    prot: Math.round(readNumber(proposal.prot) * ratio * 10) / 10,
    carb: Math.round(readNumber(proposal.carb) * ratio * 10) / 10,
    fat: Math.round(readNumber(proposal.fat) * ratio * 10) / 10,
  };
}

/** Converte voci bozza lavagna → formato solver (existingFoods). */
export function draftFoodsToSolverItems(draftFoods = []) {
  return (Array.isArray(draftFoods) ? draftFoods : [])
    .filter((item) => item && !item._isPlaceholder)
    .map((item, index) => ({
      id: String(item?.id ?? item?.foodId ?? item?.foodDbKey ?? item?.desc ?? item?.foodName ?? `draft-${index}`),
      name: String(item?.desc ?? item?.name ?? item?.foodName ?? 'Alimento').trim(),
      grams: Math.max(0, readNumber(item?.weight ?? item?.qta ?? item?.grams) || 0),
      kcal: readNumber(item?.kcal),
      prot: readNumber(item?.prot ?? item?.pro ?? item?.proteins),
      carb: readNumber(item?.carb ?? item?.carbs ?? item?.carbo),
      fat: readNumber(item?.fat ?? item?.fatTotal),
    }));
}

/** Converte una proposta confermata dal solver → voce bozza FastMealLogger. */
export function solverProposalToDraftFood(proposal, { mealType, mealTime } = {}) {
  const foodId = String(proposal?.foodId ?? '').trim();
  const dbFood = SOLVER_FOOD_DB.find((f) => f.id === foodId);
  const grams = Math.max(MIN_GRAMS, Math.round(readNumber(proposal?.grams) || MIN_GRAMS));
  const nutrients = dbFood
    ? nutrientsForGrams(dbFood, grams)
    : {
        grams,
        kcal: Math.round(readNumber(proposal?.kcal)),
        prot: readNumber(proposal?.prot),
        carb: readNumber(proposal?.carb),
        fat: readNumber(proposal?.fat),
      };
  const name = sanitizeFoodDisplayName(proposal?.name ?? dbFood?.name ?? 'Alimento');
  const emoji = proposal?.emoji ?? dbFood?.emoji ?? '🍽️';

  return {
    id: `solver-${foodId || name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    desc: name,
    name,
    grams: nutrients.grams,
    weight: nutrients.grams,
    qta: nutrients.grams,
    kcal: Math.round(readNumber(proposal?.kcal) || nutrients.kcal),
    prot: readNumber(proposal?.prot) || nutrients.prot,
    carb: readNumber(proposal?.carb) || nutrients.carb,
    fat: readNumber(proposal?.fat) || nutrients.fat,
    emoji,
    selectedUnit: 'g',
    multiplier: nutrients.grams,
    _source: 'solver',
    _solverFoodId: foodId || null,
    mealType: mealType ?? null,
    mealTime: mealTime ?? null,
  };
}

/** Converte una proposta confermata dal solver → voce vassoio McDrive (resolved). */
export function solverProposalToMcDriveItem(proposal) {
  const draft = solverProposalToDraftFood(proposal);
  return {
    id: `mcdrive_solver_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    foodName: draft.desc,
    spokenFoodName: draft.desc,
    name: draft.name,
    grams: draft.weight,
    kcal: draft.kcal,
    pro: draft.prot,
    carbo: draft.carb,
    fat: draft.fat,
    status: 'resolved',
    source: 'solver',
    _solverFoodId: draft._solverFoodId,
    emoji: draft.emoji,
  };
}
