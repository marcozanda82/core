export const ADVANCED_NUTRIENTS = [
  'zuccheri',
  'fatSat',
  'fatTrans',
  'fatMono',
  'fatPoly',
  'omega3',
  'omega6',
  'fibreTotali',
  'fibreSolubili',
  'fibreInsolubili',
  'sale',
  'mg',
  'k',
  'vitc',
  'ca',
  'vitA',
  'vitB12',
  'vitD',
  'vitE',
  'vitK',
  'b9',
  'b2',
  'b6',
  'fe',
  'zn',
  'cu',
  'p',
  'leu',
  'iso',
  'val',
  'lys',
  'met',
  'phe',
  'thr',
  'trp',
  'his',
];

const MAIN_MACRO_KEYS = ['kcal', 'cal', 'prot', 'carb', 'fat', 'fatTotal', 'fatTot'];

export function pickFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function roundNutrientValue(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function getAdvancedNutrientsFromSource(source) {
  if (!source || typeof source !== 'object') return {};
  const out = {};
  ADVANCED_NUTRIENTS.forEach((key) => {
    const value = pickFiniteNumber(source[key]);
    if (value != null) out[key] = value;
  });
  return out;
}

export function scaleAdvancedNutrientsFromBase(baseSource, ratio, decimals = 2) {
  const scaled = {};
  if (!baseSource || typeof baseSource !== 'object') return scaled;

  ADVANCED_NUTRIENTS.forEach((key) => {
    const base = pickFiniteNumber(baseSource[key]);
    if (base == null) return;
    scaled[key] = roundNutrientValue(base * ratio, decimals);
  });

  return scaled;
}

export function getPer100Macros(food) {
  const row = food?.row || food || {};
  return {
    kcal:
      Number(row.baseKcal ?? row.kcal ?? row.cal ?? food?.baseKcal ?? food?.kcal ?? food?.cal) || 0,
    prot: Number(row.baseP ?? row.prot ?? food?.baseP ?? food?.prot) || 0,
    carb: Number(row.baseC ?? row.carb ?? food?.baseC ?? food?.carb) || 0,
    fat:
      Number(
        row.baseF ?? row.fatTot ?? row.fatTotal ?? row.fat ?? food?.baseF ?? food?.fatTot ?? food?.fatTotal ?? food?.fat,
      ) || 0,
  };
}

export function resolveUnitName(food) {
  if (food?.unitName != null && String(food.unitName).trim() !== '') {
    return String(food.unitName).trim();
  }
  const defaultUnit = food?.defaultUnit ?? food?.row?.defaultUnit;
  if (defaultUnit?.label) return String(defaultUnit.label).trim();
  return '';
}

export function resolveDefaultUnitWeight(food, fallback = 100) {
  const explicit = Number(food?.defaultUnitWeight ?? food?.defaultServingWeight);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const defaultUnit = food?.defaultUnit ?? food?.row?.defaultUnit;
  if (defaultUnit && Number(defaultUnit.grams) > 0) {
    return Number(defaultUnit.grams);
  }

  const units = food?.units ?? food?.row?.units;
  if (Array.isArray(units) && units[0] && Number(units[0].grams) > 0) {
    return Number(units[0].grams);
  }

  return fallback;
}

export function computeMacrosForWeight(per100, weight) {
  const w = Math.max(0, Number(weight) || 0);
  const ratio = w / 100;

  return {
    kcal: Math.round(per100.kcal * ratio),
    prot: roundNutrientValue(per100.prot * ratio, 1),
    carb: roundNutrientValue(per100.carb * ratio, 1),
    fat: roundNutrientValue(per100.fat * ratio, 1),
  };
}

export function computeMacrosForUnit(per100, unitWeight) {
  return computeMacrosForWeight(per100, unitWeight);
}

function scaleMainMacrosFromRow(row, ratio) {
  const per100 = getPer100Macros({ row });
  const macros = computeMacrosForWeight(per100, ratio * 100);
  const scaled = {
    kcal: macros.kcal,
    cal: macros.kcal,
    prot: macros.prot,
    carb: macros.carb,
    fat: macros.fat,
    fatTotal: macros.fat,
  };

  const fatTot = pickFiniteNumber(row.fatTot);
  if (fatTot != null) {
    scaled.fatTot = roundNutrientValue(fatTot * ratio, 1);
  }

  return scaled;
}

function scaleMainMacrosFromItem(item, ratio) {
  const scaled = {};

  MAIN_MACRO_KEYS.forEach((key) => {
    const current = pickFiniteNumber(item[key]);
    if (current == null) return;
    scaled[key] =
      key === 'kcal' || key === 'cal'
        ? Math.round(current * ratio)
        : roundNutrientValue(current * ratio, 1);
  });

  if (scaled.kcal != null && scaled.cal == null) scaled.cal = scaled.kcal;
  if (scaled.cal != null && scaled.kcal == null) scaled.kcal = scaled.cal;
  if (scaled.fat != null && scaled.fatTotal == null) scaled.fatTotal = scaled.fat;

  return scaled;
}

/**
 * Ricalcola macro principali e micronutrienti avanzati in base al nuovo peso (g).
 */
export function scaleNutrientsForWeight(item, newWeight) {
  const row = item?.row || {};
  const rowKcal = Number(row.kcal ?? row.cal);
  const hasRowPer100 = Number.isFinite(rowKcal) && rowKcal >= 0;
  const weight = Math.max(0, Number(newWeight) || 0);

  if (hasRowPer100) {
    const ratio = weight / 100;
    return {
      ...scaleMainMacrosFromRow(row, ratio),
      ...scaleAdvancedNutrientsFromBase(row, ratio),
    };
  }

  const oldWeight = Number(item.qta ?? item.weight) || 0;
  if (oldWeight <= 0 || weight === oldWeight) return {};

  const ratio = weight / oldWeight;
  return {
    ...scaleMainMacrosFromItem(item, ratio),
    ...scaleAdvancedNutrientsFromBase(item, ratio),
  };
}

/** @deprecated Usare scaleNutrientsForWeight */
export function scaleMacrosForWeight(item, newWeight) {
  return scaleNutrientsForWeight(item, newWeight);
}

export function computeDraftItemNutrients(item) {
  const weight = Number(item?.weight ?? item?.qta) || 0;
  const row = item?.row || {};
  const rowKcal = Number(row.kcal ?? row.cal);

  if (Number.isFinite(rowKcal) && weight > 0) {
    return scaleNutrientsForWeight(item, weight);
  }

  const nutrients = {
    kcal: Math.round(Number(item?.kcal ?? item?.cal) || 0),
    prot: Number(item?.prot) || 0,
    carb: Number(item?.carb) || 0,
    fat: Number(item?.fatTotal ?? item?.fatTot ?? item?.fat) || 0,
  };
  nutrients.cal = nutrients.kcal;
  nutrients.fatTotal = nutrients.fat;

  ADVANCED_NUTRIENTS.forEach((key) => {
    const value = pickFiniteNumber(item[key]);
    if (value != null) nutrients[key] = value;
  });

  return nutrients;
}

/** @deprecated Usare computeDraftItemNutrients */
export function computeDraftItemMacros(item) {
  const nutrients = computeDraftItemNutrients(item);
  return {
    kcal: nutrients.kcal,
    prot: nutrients.prot,
    carb: nutrients.carb,
    fat: nutrients.fat,
  };
}

export function createEmptyDraftTotals() {
  return { kcal: 0, prot: 0, carb: 0, fat: 0 };
}

export function computeDraftTotals(draftFoods) {
  const totals = createEmptyDraftTotals();

  (draftFoods || []).forEach((item) => {
    const nutrients = computeDraftItemNutrients(item);
    totals.kcal += nutrients.kcal || 0;
    totals.prot += nutrients.prot || 0;
    totals.carb += nutrients.carb || 0;
    totals.fat += nutrients.fat || 0;

    ADVANCED_NUTRIENTS.forEach((key) => {
      const value = pickFiniteNumber(nutrients[key]);
      if (value == null) return;
      totals[key] = (totals[key] || 0) + value;
    });
  });

  const result = {
    kcal: Math.round(totals.kcal),
    prot: roundNutrientValue(totals.prot, 1),
    carb: roundNutrientValue(totals.carb, 1),
    fat: roundNutrientValue(totals.fat, 1),
  };

  ADVANCED_NUTRIENTS.forEach((key) => {
    if (totals[key] != null) {
      result[key] = roundNutrientValue(totals[key]);
    }
  });

  return result;
}

export function buildBaseMacroFields(per100) {
  return {
    baseKcal: Math.round(Number(per100.kcal) || 0),
    baseP: roundNutrientValue(Number(per100.prot) || 0, 1),
    baseC: roundNutrientValue(Number(per100.carb) || 0, 1),
    baseF: roundNutrientValue(Number(per100.fat) || 0, 1),
  };
}

export function applyPer100ToRow(row, per100) {
  const base = buildBaseMacroFields(per100);
  return {
    ...row,
    kcal: base.baseKcal,
    cal: base.baseKcal,
    prot: base.baseP,
    carb: base.baseC,
    fatTotal: base.baseF,
    fat: base.baseF,
    ...base,
  };
}

/**
 * Costruisce i nutrienti scalati per un peso target a partire dal row per 100g.
 */
export function buildScaledNutrientsForWeight(row, weight) {
  return scaleNutrientsForWeight({ row }, weight);
}
