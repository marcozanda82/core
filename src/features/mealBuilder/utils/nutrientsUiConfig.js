import { ADVANCED_NUTRIENTS } from './foodMacroUtils';

export const NUTRIENT_KEY_LABELS = {
  zuccheri: 'Zuccheri',
  fatSat: 'Grassi saturi',
  fatTrans: 'Grassi trans',
  fatMono: 'Grassi monoinsaturi',
  fatPoly: 'Grassi polinsaturi',
  omega3: 'Omega 3',
  omega6: 'Omega 6',
  fibreTotali: 'Fibre totali',
  fibreSolubili: 'Fibre solubili',
  fibreInsolubili: 'Fibre insolubili',
  sale: 'Sale',
  mg: 'Magnesio',
  k: 'Potassio',
  ca: 'Calcio',
  fe: 'Ferro',
  zn: 'Zinco',
  cu: 'Rame',
  p: 'Fosforo',
  vitc: 'Vitamina C',
  vitA: 'Vitamina A',
  vitB12: 'Vitamina B12',
  vitD: 'Vitamina D',
  vitE: 'Vitamina E',
  vitK: 'Vitamina K',
  b9: 'Vitamina B9 (Folati)',
  b2: 'Vitamina B2',
  b6: 'Vitamina B6',
  leu: 'Leucina',
  iso: 'Isoleucina',
  val: 'Valina',
  lys: 'Lisina',
  met: 'Metionina',
  phe: 'Fenilalanina',
  thr: 'Treonina',
  trp: 'Triptofano',
  his: 'Istidina',
};

/** Unità di misura per singola chiave (override rispetto alla categoria). */
export const NUTRIENT_KEY_UNITS = {
  sale: 'g',
  omega3: 'g',
  omega6: 'g',
  zuccheri: 'g',
  fatSat: 'g',
  fatTrans: 'g',
  fatMono: 'g',
  fatPoly: 'g',
  fibreTotali: 'g',
  fibreSolubili: 'g',
  fibreInsolubili: 'g',
  vitc: 'mg',
  vitA: 'µg',
  vitB12: 'µg',
  vitD: 'µg',
  vitE: 'mg',
  vitK: 'µg',
  b9: 'µg',
  b2: 'mg',
  b6: 'mg',
  mg: 'mg',
  k: 'mg',
  ca: 'mg',
  fe: 'mg',
  zn: 'mg',
  cu: 'mg',
  p: 'mg',
  leu: 'mg',
  iso: 'mg',
  val: 'mg',
  lys: 'mg',
  met: 'mg',
  phe: 'mg',
  thr: 'mg',
  trp: 'mg',
  his: 'mg',
};

export const NUTRIENT_UI_CATEGORIES = [
  {
    id: 'lipidi',
    label: 'Profilo Lipidico',
    keys: ['fatSat', 'fatTrans', 'fatMono', 'fatPoly', 'omega3', 'omega6'],
    defaultUnit: 'g',
  },
  {
    id: 'carbo',
    label: 'Carboidrati e Fibre',
    keys: ['zuccheri', 'fibreTotali', 'fibreSolubili', 'fibreInsolubili'],
    defaultUnit: 'g',
  },
  {
    id: 'minerali',
    label: 'Minerali',
    keys: ['sale', 'mg', 'k', 'ca', 'fe', 'zn', 'cu', 'p'],
    defaultUnit: 'mg',
  },
  {
    id: 'vitamine',
    label: 'Vitamine',
    keys: ['vitc', 'vitA', 'vitB12', 'vitD', 'vitE', 'vitK', 'b9', 'b2', 'b6'],
    defaultUnit: 'mix',
  },
  {
    id: 'amminoacidi',
    label: 'Aminogramma',
    keys: ['leu', 'iso', 'val', 'lys', 'met', 'phe', 'thr', 'trp', 'his'],
    defaultUnit: 'mg',
  },
];

export function getNutrientLabel(key) {
  return NUTRIENT_KEY_LABELS[key] || key;
}

export function getNutrientUnit(key, category) {
  if (NUTRIENT_KEY_UNITS[key]) return NUTRIENT_KEY_UNITS[key];
  if (category?.defaultUnit && category.defaultUnit !== 'mix') {
    return category.defaultUnit;
  }
  return 'mg';
}

export function isNutrientValueVisible(value) {
  if (value == null || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n !== 0;
}

export function categoryHasVisibleNutrients(category, nutrients = {}) {
  if (!category?.keys?.length) return false;
  return category.keys.some((key) => isNutrientValueVisible(nutrients[key]));
}

export function getVisibleNutrientCategories(nutrients = {}) {
  return NUTRIENT_UI_CATEGORIES.filter((category) =>
    categoryHasVisibleNutrients(category, nutrients),
  );
}

export function formatNutrientDisplayValue(value, unit) {
  if (!isNutrientValueVisible(value)) return '—';
  const n = Number(value);
  const decimals = unit === 'g' && n < 1 ? 2 : n < 10 ? 2 : 1;
  const rounded = Math.round(n * 10 ** decimals) / 10 ** decimals;
  return `${rounded} ${unit}`;
}

/** Campi editabili in deep edit — allineati al master schema. */
export const DEEP_EDIT_ADVANCED_FIELDS = ADVANCED_NUTRIENTS.map((key) => ({
  key,
  label: getNutrientLabel(key),
  unit: NUTRIENT_KEY_UNITS[key] || 'mg',
}));
