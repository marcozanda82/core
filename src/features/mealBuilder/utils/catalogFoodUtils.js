import { buildQtyLabel } from './draftFoodUnits';
import { resolveFoodIdentityKey } from './draftFoodMatchUtils';
import {
  applyPer100ToRow,
  buildBaseMacroFields,
  computeMacrosForUnit,
  getPer100Macros,
  resolveDefaultUnitWeight,
  resolveUnitName,
} from './foodMacroUtils';

function roundMacro(value, asInt = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return asInt ? Math.round(n) : Math.round(n * 10) / 10;
}

function buildPortionFromPer100(row, unitWeight) {
  const per100 = getPer100Macros({ row });
  const portion = computeMacrosForUnit(per100, unitWeight);
  return {
    ...portion,
    fatTotal: portion.fat,
    cal: portion.kcal,
    ...buildBaseMacroFields(per100),
  };
}

function buildRowFromPortion(item, weight) {
  const safeWeight = Math.max(0, Number(weight) || 0);
  const ratio = safeWeight > 0 ? 100 / safeWeight : 1;
  const row = {
    desc: String(item.desc || item.name || 'Alimento').trim(),
    kcal: roundMacro((Number(item.kcal ?? item.cal) || 0) * ratio, true),
    cal: roundMacro((Number(item.kcal ?? item.cal) || 0) * ratio, true),
    prot: roundMacro((Number(item.prot) || 0) * ratio),
    carb: roundMacro((Number(item.carb) || 0) * ratio),
    fatTotal: roundMacro((Number(item.fatTotal ?? item.fat) || 0) * ratio),
    fat: roundMacro((Number(item.fatTotal ?? item.fat) || 0) * ratio),
  };
  if (item.customImage) row.customImage = item.customImage;
  return applyPer100ToRow(row, getPer100Macros({ row }));
}

function enrichRowFromPersonalDb(row, personalDb, foodDbKey) {
  if (!foodDbKey || !personalDb?.[foodDbKey]) return row;
  return { ...personalDb[foodDbKey], ...row };
}

function buildCatalogEditItemBase(source, personalDb, options = {}) {
  const desc = String(
    source.desc || source.name || source.label || source.row?.desc || 'Alimento',
  ).trim();
  const foodDbKey =
    options.foodDbKey ??
    source.foodDbKey ??
    (source._source === 'personal' ? source.key || source.id : null);

  let row = source.row;
  if (foodDbKey && personalDb?.[foodDbKey]) {
    row = { ...personalDb[foodDbKey], ...(row || {}) };
  } else if (!row) {
    row = buildRowFromPortion(source, 100);
  }

  const unitName = resolveUnitName({ ...source, row });
  const defaultUnitWeight = resolveDefaultUnitWeight({ ...source, row });
  const portion = buildPortionFromPer100(row, defaultUnitWeight);

  return {
    id: options.id || `catalog_${foodDbKey || desc}`,
    type: 'food',
    desc,
    name: desc,
    foodDbKey,
    row,
    units: row.units ?? source.units,
    defaultUnit: row.defaultUnit ?? source.defaultUnit,
    unitName,
    defaultUnitWeight,
    selectedUnit: 'g',
    multiplier: 1,
    qta: defaultUnitWeight,
    weight: defaultUnitWeight,
    qtyLabel: unitName ? `1 ${unitName}` : `${Math.round(defaultUnitWeight)}g`,
    label: source.label || desc,
    ...portion,
    ...(row.customImage || source.customImage
      ? { customImage: row.customImage || source.customImage }
      : {}),
    ...(row.customEmoji || source.customEmoji
      ? { customEmoji: row.customEmoji || source.customEmoji }
      : {}),
    _editSource: 'catalog',
    _catalogKind: options.catalogKind || 'tile',
    ...(options.extra || {}),
  };
}

export function buildCatalogDeepEditItem(source, personalDb) {
  if (!source || typeof source !== 'object') return null;

  if (source._source) {
    const foodDbKey = source._source === 'personal' ? source.key || source.id : undefined;
    return buildCatalogEditItemBase(source, personalDb, {
      id: `catalog_search_${foodDbKey || source.desc || source.name}`,
      foodDbKey,
      catalogKind: 'search',
      extra: { _searchSource: source._source },
    });
  }

  return buildCatalogEditItemBase(source, personalDb, {
    id: `catalog_tile_${source.foodDbKey || source.key || source.desc}`,
    catalogKind: 'tile',
  });
}

export function mergeCatalogDisplay(item, personalDb, catalogOverrides = {}) {
  if (!item) return item;

  const identity = resolveFoodIdentityKey(item);
  const override = identity ? catalogOverrides[identity] : null;

  let merged = { ...item };
  const foodDbKey = item.foodDbKey ?? override?.foodDbKey;
  const dbRow = foodDbKey && personalDb?.[foodDbKey] ? personalDb[foodDbKey] : null;

  if (override) {
    merged = { ...merged, ...override };
  }

  const row = dbRow ? { ...dbRow, ...(merged.row || {}) } : merged.row;
  const unitWeight = resolveDefaultUnitWeight({ ...merged, row });
  const unitName = resolveUnitName({ ...merged, row });

  if (row) {
    const portion = buildPortionFromPer100(row, unitWeight);
    merged = {
      ...merged,
      row,
      unitName,
      defaultUnitWeight: unitWeight,
      qta: unitWeight,
      weight: unitWeight,
      qtyLabel: unitName ? `1 ${unitName}` : `${Math.round(unitWeight)}g`,
      ...portion,
      ...(row.customImage ? { customImage: row.customImage } : {}),
      ...(row.customEmoji ? { customEmoji: row.customEmoji } : {}),
    };
    if (merged.desc) {
      merged.label = `${merged.desc} (${merged.qtyLabel})`;
    }
  }

  return merged;
}

export function applyCatalogEditToDraftItem(draftItem, updatedCatalog) {
  const weight = Number(draftItem.weight ?? draftItem.qta) || 0;
  const row = updatedCatalog.row || {};
  const per100 = getPer100Macros({ row });
  const portion = computeMacrosForUnit(per100, weight);
  const selectedUnit = draftItem.selectedUnit || 'g';
  const multiplier = Number(draftItem.multiplier) || weight;

  const next = {
    ...draftItem,
    row,
    ...portion,
    fatTotal: portion.fat,
    cal: portion.kcal,
    ...buildBaseMacroFields(per100),
    qtyLabel: buildQtyLabel(draftItem, selectedUnit, multiplier, weight),
    _manualOverride: true,
  };

  if (updatedCatalog.customImage) {
    next.customImage = updatedCatalog.customImage;
    delete next.customEmoji;
  } else if (updatedCatalog.customEmoji) {
    next.customEmoji = updatedCatalog.customEmoji;
    delete next.customImage;
  } else {
    delete next.customImage;
    delete next.customEmoji;
  }

  return next;
}

export function buildCatalogDbPatch(updatedItem) {
  const row = { ...(updatedItem.row || {}) };
  if (updatedItem.desc) row.desc = updatedItem.desc;

  const unitName = String(updatedItem.unitName ?? resolveUnitName(updatedItem)).trim();
  const defaultUnitWeight = Math.max(
    1,
    Number(updatedItem.defaultUnitWeight) || resolveDefaultUnitWeight(updatedItem),
  );

  const per100 = getPer100Macros({ ...updatedItem, row });
  Object.assign(row, applyPer100ToRow(row, per100));

  if (unitName) {
    const unitEntry = { label: unitName, grams: defaultUnitWeight };
    row.defaultUnit = unitEntry;
    row.units = [unitEntry];
  }

  return {
    customImage: updatedItem.customImage ?? null,
    customEmoji: updatedItem.customEmoji ?? null,
    row,
    desc: updatedItem.desc,
    unitName: unitName || undefined,
    defaultUnitWeight,
    defaultServingWeight: defaultUnitWeight,
    defaultUnit: unitName ? { label: unitName, grams: defaultUnitWeight } : row.defaultUnit,
    ...buildBaseMacroFields(per100),
    kcal: per100.kcal,
    prot: per100.prot,
    carb: per100.carb,
    fatTotal: per100.fat,
  };
}

export function buildCatalogAcquirePayload(updatedItem) {
  const row = updatedItem.row || {};
  const per100 = getPer100Macros({ ...updatedItem, row });
  return {
    desc: String(updatedItem.desc || row.desc || 'Alimento').trim(),
    kcal: per100.kcal,
    prot: per100.prot,
    carb: per100.carb,
    fatTotal: per100.fat,
    ...buildBaseMacroFields(per100),
    ...(updatedItem.customImage ? { customImage: updatedItem.customImage } : {}),
    ...(updatedItem.customEmoji ? { customEmoji: updatedItem.customEmoji } : {}),
  };
}

export function buildCatalogOverrideFromEdit(updatedItem) {
  const unitWeight = resolveDefaultUnitWeight(updatedItem);
  const identity = resolveFoodIdentityKey(updatedItem);
  if (!identity) return null;

  const per100 = getPer100Macros(updatedItem);
  const portion = computeMacrosForUnit(per100, unitWeight);

  return {
    key: identity,
    patch: {
      foodDbKey: updatedItem.foodDbKey,
      unitName: updatedItem.unitName,
      defaultUnitWeight: unitWeight,
      qta: unitWeight,
      weight: unitWeight,
      qtyLabel: updatedItem.qtyLabel || `${Math.round(unitWeight)}g`,
      label: updatedItem.label
        || `${updatedItem.desc || updatedItem.name} (${updatedItem.qtyLabel || `${Math.round(unitWeight)}g`})`,
      ...portion,
      cal: portion.kcal,
      fatTotal: portion.fat,
      ...buildBaseMacroFields(per100),
      row: updatedItem.row,
      defaultUnit: updatedItem.defaultUnit,
      units: updatedItem.units,
      ...(updatedItem.customImage ? { customImage: updatedItem.customImage } : {}),
      ...(updatedItem.customEmoji ? { customEmoji: updatedItem.customEmoji } : {}),
    },
  };
}
