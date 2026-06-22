import {
  getItemUnits,
  resolveUnitIdFromUnit,
  resolveUnitWeight,
} from './draftFoodUnits';
import {
  applyPer100ToRow,
  buildBaseMacroFields,
  computeMacrosForUnit,
  getPer100Macros,
  resolveDefaultUnitWeight,
  resolveUnitName,
} from './foodMacroUtils';

const MACRO_KEYS = ['kcal', 'cal', 'prot', 'carb', 'fat', 'fatTotal'];

const MICRO_KEYS = [
  'fibre',
  'zuccheri',
  'fatSat',
  'vitc',
  'vitD',
  'fe',
  'ca',
  'mg',
  'k',
  'na',
  'omega3',
];

export const DEEP_EDIT_MICRO_FIELDS = [
  { key: 'fibre', label: 'Fibre (g)' },
  { key: 'zuccheri', label: 'Zuccheri (g)' },
  { key: 'fatSat', label: 'Grassi sat. (g)' },
  { key: 'vitc', label: 'Vit. C (mg)' },
  { key: 'vitD', label: 'Vit. D (µg)' },
  { key: 'fe', label: 'Ferro (mg)' },
  { key: 'ca', label: 'Calcio (mg)' },
  { key: 'mg', label: 'Magnesio (mg)' },
  { key: 'k', label: 'Potassio (mg)' },
  { key: 'na', label: 'Sodio (mg)' },
  { key: 'omega3', label: 'Omega 3 (g)' },
];

function roundMacro(value, asInt = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return asInt ? Math.round(n) : Math.round(n * 10) / 10;
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

  const row = item?.row || {};
  MICRO_KEYS.forEach((key) => {
    defaults[key] = roundMacro(Number(row[key]) || 0);
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

  const form = {
    unitName,
    defaultUnitWeight: String(defaultUnitWeight),
    kcal: String(roundMacro(per100.kcal, true)),
    prot: String(roundMacro(per100.prot)),
    carb: String(roundMacro(per100.carb)),
    fat: String(roundMacro(per100.fat)),
  };

  const row = item?.row || {};
  MICRO_KEYS.forEach((key) => {
    form[key] = String(roundMacro(Number(row[key]) || 0));
  });

  return form;
}

function parseFormNumber(raw, fallback = 0) {
  const n = Number(String(raw ?? '').replace(',', '.'));
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

  MICRO_KEYS.forEach((key) => {
    row[key] = roundMacro(parseFormNumber(form[key]));
  });

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
  next.row = row;

  MICRO_KEYS.forEach((key) => {
    const per100Micro = roundMacro(parseFormNumber(form[key]));
    next[key] = roundMacro((per100Micro * defaultUnitWeight) / 100);
  });

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
      MICRO_KEYS.map((key) => [key, String(defaults[key] ?? 0)]),
    ),
  };
}

export function getDeepEditUnits(item) {
  return getItemUnits(item);
}

export { resolveUnitIdFromUnit, resolveUnitWeight, MICRO_KEYS, MACRO_KEYS };
