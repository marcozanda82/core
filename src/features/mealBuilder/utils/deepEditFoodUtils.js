import {
  getItemUnits,
  resolveUnitIdFromUnit,
  resolveUnitWeight,
} from './draftFoodUnits';
import {
  ADVANCED_NUTRIENTS,
  applyPer100ToRow,
  buildBaseMacroFields,
  computeMacrosForUnit,
  getPer100Macros,
  resolveDefaultUnitWeight,
  resolveUnitName,
} from './foodMacroUtils';

const MACRO_KEYS = ['kcal', 'cal', 'prot', 'carb', 'fat', 'fatTotal'];

/** @deprecated Usare ADVANCED_NUTRIENTS */
const MICRO_KEYS = ADVANCED_NUTRIENTS;

export const DEEP_EDIT_MICRO_FIELDS = ADVANCED_NUTRIENTS.map((key) => ({
  key,
  label: key,
}));

function roundMacro(value, asInt = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return asInt ? Math.round(n) : Math.round(n * 10) / 10;
}

function readPer100Nutrient(row, key) {
  const value = Number(row?.[key]);
  return Number.isFinite(value) ? value : null;
}

export function buildDefaultsFromRow(item) {
  const per100 = getPer100Macros(item);
  const defaults = {
    kcal: roundMacro(per100.kcal, true),
    cal: roundMacro(per100.kcal, true),
    prot: roundMacro(per100.prot),
    carb: roundMacro(per100.carb),
    fat: roundMacro(per100.fat),
    fatTotal: roundMacro(per100.fat),
  };

  const row = item?.row || item || {};
  ADVANCED_NUTRIENTS.forEach((key) => {
    const value = readPer100Nutrient(row, key);
    defaults[key] = value != null ? roundMacro(value) : 0;
  });

  return defaults;
}

export function resolveDefaultUnitFromItem(item) {
  const unitName = resolveUnitName(item);
  const defaultUnitWeight = resolveDefaultUnitWeight(item, 100);

  return {
    unitName,
    defaultUnitWeight: defaultUnitWeight > 0 ? defaultUnitWeight : 100,
  };
}

export function buildDeepEditFormState(item) {
  const { unitName, defaultUnitWeight } = resolveDefaultUnitFromItem(item);
  const per100 = getPer100Macros(item);
  const row = item?.row || item || {};

  const form = {
    unitName,
    defaultUnitWeight: String(defaultUnitWeight),
    kcal: String(roundMacro(per100.kcal, true)),
    prot: String(roundMacro(per100.prot)),
    carb: String(roundMacro(per100.carb)),
    fat: String(roundMacro(per100.fat)),
  };

  ADVANCED_NUTRIENTS.forEach((key) => {
    const value = readPer100Nutrient(row, key);
    form[key] = value != null && value !== 0 ? String(roundMacro(value)) : '';
  });

  return form;
}

function parseFormNumber(raw, fallback = 0) {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return fallback;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function applyIconFields(row, next, iconState) {
  const customImage = iconState?.customImage ?? null;
  const customEmoji = iconState?.customEmoji ?? null;
  const customIcon = iconState?.customIcon ?? null;

  if (customImage) {
    row.customImage = customImage;
    delete row.customEmoji;
    delete row.customIcon;
    next.customImage = customImage;
    delete next.customEmoji;
    delete next.customIcon;
  } else if (customIcon) {
    row.customIcon = customIcon;
    delete row.customImage;
    delete row.customEmoji;
    next.customIcon = customIcon;
    delete next.customImage;
    delete next.customEmoji;
  } else if (customEmoji) {
    row.customEmoji = customEmoji;
    delete row.customImage;
    delete row.customIcon;
    next.customEmoji = customEmoji;
    delete next.customImage;
    delete next.customIcon;
  } else {
    delete row.customImage;
    delete row.customEmoji;
    delete row.customIcon;
    delete next.customImage;
    delete next.customEmoji;
    delete next.customIcon;
  }
}

function applyAdvancedNutrientsFromForm(row, next, form, defaultUnitWeight) {
  ADVANCED_NUTRIENTS.forEach((key) => {
    const trimmed = String(form[key] ?? '').trim();
    if (trimmed === '') {
      delete row[key];
      delete next[key];
      return;
    }

    const per100Micro = roundMacro(parseFormNumber(trimmed));
    if (per100Micro === 0) {
      delete row[key];
      delete next[key];
      return;
    }

    row[key] = per100Micro;
    next[key] = roundMacro((per100Micro * defaultUnitWeight) / 100);
  });
}

export function applyDeepEditFormToItem(item, form, iconState) {
  const unitName = String(form.unitName ?? '').trim();
  const defaultUnitWeight = Math.max(1, parseFormNumber(form.defaultUnitWeight, 100));

  const per100 = {
    kcal: roundMacro(parseFormNumber(form.kcal), true),
    prot: roundMacro(parseFormNumber(form.prot)),
    carb: roundMacro(parseFormNumber(form.carb)),
    fat: roundMacro(parseFormNumber(form.fat)),
  };
  const baseFields = buildBaseMacroFields(per100);
  const portion = computeMacrosForUnit(per100, defaultUnitWeight);

  const row = applyPer100ToRow({ ...(item.row || {}) }, per100);

  if (unitName) {
    const unitEntry = { label: unitName, grams: defaultUnitWeight };
    row.defaultUnit = unitEntry;
    row.units = [unitEntry];
  }

  const selectedUnit = unitName
    ? resolveUnitIdFromUnit({ label: unitName, grams: defaultUnitWeight })
    : 'g';

  const next = {
    ...item,
    row,
    unitName,
    defaultUnitWeight,
    ...baseFields,
    defaultUnit: unitName ? { label: unitName, grams: defaultUnitWeight } : item.defaultUnit,
    units: unitName ? [{ label: unitName, grams: defaultUnitWeight }] : item.units,
    defaultServingWeight: defaultUnitWeight,
    selectedUnit,
    multiplier: 1,
    qta: defaultUnitWeight,
    weight: defaultUnitWeight,
    kcal: portion.kcal,
    cal: portion.kcal,
    prot: portion.prot,
    carb: portion.carb,
    fat: portion.fat,
    fatTotal: portion.fat,
    qtyLabel: unitName ? `1 ${unitName}` : `${Math.round(defaultUnitWeight)}g`,
    _manualOverride: true,
  };

  applyIconFields(row, next, iconState);
  applyAdvancedNutrientsFromForm(row, next, form, defaultUnitWeight);
  next.row = row;

  return next;
}

export function restoreDeepEditFormFromDefaults(item, form) {
  const defaults = buildDefaultsFromRow(item);

  return {
    ...form,
    kcal: String(defaults.kcal),
    prot: String(defaults.prot),
    carb: String(defaults.carb),
    fat: String(defaults.fat),
    ...Object.fromEntries(
      ADVANCED_NUTRIENTS.map((key) => [
        key,
        defaults[key] != null && defaults[key] !== 0 ? String(defaults[key]) : '',
      ]),
    ),
  };
}

export function getDeepEditUnits(item) {
  return getItemUnits(item);
}

export { resolveUnitIdFromUnit, resolveUnitWeight, MICRO_KEYS, MACRO_KEYS, ADVANCED_NUTRIENTS };
