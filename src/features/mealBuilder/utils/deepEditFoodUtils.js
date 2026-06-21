import {
  buildQtyLabel,
  getItemUnits,
  resolveUnitIdFromUnit,
  resolveUnitWeight,
} from './draftFoodUnits';

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

function scaleRowValue(basePer100, weight) {
  const base = Number(basePer100);
  if (!Number.isFinite(base)) return 0;
  return (base * weight) / 100;
}

export function buildDefaultsFromRow(item, weight) {
  const row = item?.row || {};
  const safeWeight = Math.max(0, Number(weight) || 0);

  const defaults = {
    kcal: roundMacro(scaleRowValue(row.kcal ?? row.cal, safeWeight), true),
    cal: roundMacro(scaleRowValue(row.kcal ?? row.cal, safeWeight), true),
    prot: roundMacro(scaleRowValue(row.prot, safeWeight)),
    carb: roundMacro(scaleRowValue(row.carb, safeWeight)),
    fat: roundMacro(scaleRowValue(row.fatTotal ?? row.fat, safeWeight)),
    fatTotal: roundMacro(scaleRowValue(row.fatTotal ?? row.fat, safeWeight)),
  };

  MICRO_KEYS.forEach((key) => {
    defaults[key] = roundMacro(scaleRowValue(row[key], safeWeight));
  });

  return defaults;
}

export function buildDeepEditFormState(item) {
  const selectedUnit = item?.selectedUnit || 'g';
  const multiplier = Number(item?.multiplier ?? item?.qta ?? item?.weight) || 0;
  const weight = Number(item?.weight ?? item?.qta) || 0;

  const form = {
    selectedUnit,
    multiplier: multiplier > 0 ? String(multiplier) : '',
    weight: weight > 0 ? String(Math.round(weight)) : '',
    kcal: String(Number(item?.kcal ?? item?.cal) || 0),
    prot: String(Number(item?.prot) || 0),
    carb: String(Number(item?.carb) || 0),
    fat: String(Number(item?.fatTotal ?? item?.fat) || 0),
  };

  MICRO_KEYS.forEach((key) => {
    const portionVal = Number(item?.[key]);
    if (Number.isFinite(portionVal)) {
      form[key] = String(portionVal);
    } else if (item?.row?.[key] != null && weight > 0) {
      form[key] = String(roundMacro(scaleRowValue(item.row[key], weight)));
    } else {
      form[key] = '0';
    }
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

  if (customImage) {
    row.customImage = customImage;
    delete row.customEmoji;
    next.customImage = customImage;
    delete next.customEmoji;
  } else if (customEmoji) {
    row.customEmoji = customEmoji;
    delete row.customImage;
    next.customEmoji = customEmoji;
    delete next.customImage;
  } else {
    delete row.customImage;
    delete row.customEmoji;
    delete next.customImage;
    delete next.customEmoji;
  }
}

export function applyDeepEditFormToItem(item, form, iconState) {
  const selectedUnit = form.selectedUnit || 'g';
  const unitWeight = resolveUnitWeight(item, selectedUnit);
  const multiplier = parseFormNumber(form.multiplier, 0);
  const weight =
    selectedUnit === 'g'
      ? parseFormNumber(form.weight, multiplier)
      : Math.max(0, multiplier * unitWeight);

  const kcal = roundMacro(parseFormNumber(form.kcal), true);
  const prot = roundMacro(parseFormNumber(form.prot));
  const carb = roundMacro(parseFormNumber(form.carb));
  const fat = roundMacro(parseFormNumber(form.fat));
  const ratio = weight > 0 ? 100 / weight : 1;

  const row = { ...(item.row || {}) };
  row.kcal = roundMacro(kcal * ratio, true);
  row.cal = row.kcal;
  row.prot = roundMacro(prot * ratio);
  row.carb = roundMacro(carb * ratio);
  row.fatTotal = roundMacro(fat * ratio);
  row.fat = row.fatTotal;

  MICRO_KEYS.forEach((key) => {
    const portionVal = roundMacro(parseFormNumber(form[key]));
    row[key] = roundMacro(portionVal * ratio);
  });

  const next = {
    ...item,
    row,
    selectedUnit,
    multiplier: selectedUnit === 'g' ? weight : multiplier,
    qta: weight,
    weight,
    kcal,
    cal: kcal,
    prot,
    carb,
    fat,
    fatTotal: fat,
    qtyLabel: buildQtyLabel(item, selectedUnit, multiplier, weight),
    _manualOverride: true,
  };

  applyIconFields(row, next, iconState);
  next.row = row;

  MICRO_KEYS.forEach((key) => {
    next[key] = roundMacro(parseFormNumber(form[key]));
  });

  return next;
}

export function restoreDeepEditFormFromDefaults(item, form) {
  const weight = parseFormNumber(form.weight, parseFormNumber(form.multiplier, 100));
  const defaults = buildDefaultsFromRow(item, weight);

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
