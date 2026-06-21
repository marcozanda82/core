import { buildQtyLabel } from './draftFoodUnits';
import { resolveFoodIdentityKey } from './draftFoodMatchUtils';

function roundMacro(value, asInt = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return asInt ? Math.round(n) : Math.round(n * 10) / 10;
}

function scalePortionFromRow(row, weight) {
  const safeWeight = Math.max(0, Number(weight) || 0);
  const ratio = safeWeight > 0 ? safeWeight / 100 : 1;
  return {
    kcal: roundMacro((Number(row.kcal ?? row.cal) || 0) * ratio, true),
    cal: roundMacro((Number(row.kcal ?? row.cal) || 0) * ratio, true),
    prot: roundMacro((Number(row.prot) || 0) * ratio),
    carb: roundMacro((Number(row.carb) || 0) * ratio),
    fat: roundMacro((Number(row.fatTotal ?? row.fat) || 0) * ratio),
    fatTotal: roundMacro((Number(row.fatTotal ?? row.fat) || 0) * ratio),
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
  return row;
}

function enrichRowFromPersonalDb(row, personalDb, foodDbKey) {
  if (!foodDbKey || !personalDb?.[foodDbKey]) return row;
  return { ...personalDb[foodDbKey], ...row };
}

export function buildCatalogDeepEditItem(source, personalDb) {
  if (!source || typeof source !== 'object') return null;

  if (source._source) {
    const desc = String(source.desc || source.name || source.row?.desc || 'Alimento').trim();
    const foodDbKey = source._source === 'personal' ? (source.key || source.id) : undefined;
    const weight = 100;
    const row = enrichRowFromPersonalDb(source.row || {}, personalDb, foodDbKey);
    const portion = scalePortionFromRow(row, weight);

    return {
      id: `catalog_search_${foodDbKey || desc}`,
      type: 'food',
      desc,
      name: desc,
      foodDbKey,
      row,
      units: row.units,
      defaultUnit: row.defaultUnit,
      selectedUnit: 'g',
      multiplier: weight,
      qta: weight,
      weight,
      qtyLabel: `${weight}g`,
      ...portion,
      ...(row.customImage ? { customImage: row.customImage } : {}),
      ...(row.customEmoji ? { customEmoji: row.customEmoji } : {}),
      _editSource: 'catalog',
      _catalogKind: 'search',
      _searchSource: source._source,
    };
  }

  const desc = String(source.desc || source.name || source.label || 'Alimento').trim();
  const foodDbKey = source.foodDbKey ?? null;
  const weight = Number(source.qta ?? source.weight) || 100;
  let row = source.row;

  if (foodDbKey && personalDb?.[foodDbKey]) {
    row = { ...personalDb[foodDbKey], ...(row || {}) };
  } else if (!row) {
    row = buildRowFromPortion(source, weight);
  }

  const portion = scalePortionFromRow(row, weight);

  return {
    id: `catalog_tile_${foodDbKey || source.key || desc}`,
    type: 'food',
    desc,
    name: desc,
    foodDbKey,
    row,
    units: row.units ?? source.units,
    defaultUnit: row.defaultUnit ?? source.defaultUnit,
    selectedUnit: source.selectedUnit || 'g',
    multiplier: Number(source.multiplier) || weight,
    qta: weight,
    weight,
    qtyLabel: source.qtyLabel || `${Math.round(weight)}g`,
    label: source.label || desc,
    ...portion,
    ...(row.customImage || source.customImage
      ? { customImage: row.customImage || source.customImage }
      : {}),
    ...(row.customEmoji || source.customEmoji
      ? { customEmoji: row.customEmoji || source.customEmoji }
      : {}),
    _editSource: 'catalog',
    _catalogKind: 'tile',
  };
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

  const weight = Number(merged.qta ?? merged.weight) || 100;
  const row = dbRow
    ? { ...dbRow, ...(merged.row || {}) }
    : merged.row;

  if (row) {
    const portion = scalePortionFromRow(row, weight);
    merged = {
      ...merged,
      row,
      ...portion,
      ...(row.customImage ? { customImage: row.customImage } : {}),
      ...(row.customEmoji ? { customEmoji: row.customEmoji } : {}),
    };
    if (merged.qtyLabel && merged.desc) {
      merged.label = `${merged.desc} (${merged.qtyLabel})`;
    }
  }

  return merged;
}

export function applyCatalogEditToDraftItem(draftItem, updatedCatalog) {
  const weight = Number(draftItem.weight ?? draftItem.qta) || 0;
  const row = updatedCatalog.row || {};
  const portion = scalePortionFromRow(row, weight);
  const selectedUnit = draftItem.selectedUnit || 'g';
  const multiplier = Number(draftItem.multiplier) || weight;

  const next = {
    ...draftItem,
    row,
    ...portion,
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

  return {
    customImage: updatedItem.customImage ?? null,
    customEmoji: updatedItem.customEmoji ?? null,
    row,
    desc: updatedItem.desc,
    defaultServingWeight: Number(updatedItem.weight ?? updatedItem.qta) || undefined,
  };
}

export function buildCatalogAcquirePayload(updatedItem) {
  const row = updatedItem.row || {};
  return {
    desc: String(updatedItem.desc || row.desc || 'Alimento').trim(),
    kcal: Number(row.kcal ?? row.cal) || 0,
    prot: Number(row.prot) || 0,
    carb: Number(row.carb) || 0,
    fatTotal: Number(row.fatTotal ?? row.fat) || 0,
    ...(updatedItem.customImage ? { customImage: updatedItem.customImage } : {}),
    ...(updatedItem.customEmoji ? { customEmoji: updatedItem.customEmoji } : {}),
  };
}

export function buildCatalogOverrideFromEdit(updatedItem) {
  const weight = Number(updatedItem.weight ?? updatedItem.qta) || 100;
  const identity = resolveFoodIdentityKey(updatedItem);
  if (!identity) return null;

  return {
    key: identity,
    patch: {
      foodDbKey: updatedItem.foodDbKey,
      qta: weight,
      weight,
      qtyLabel: updatedItem.qtyLabel || `${Math.round(weight)}g`,
      label: updatedItem.label
        || `${updatedItem.desc || updatedItem.name} (${updatedItem.qtyLabel || `${Math.round(weight)}g`})`,
      kcal: updatedItem.kcal,
      cal: updatedItem.cal,
      prot: updatedItem.prot,
      carb: updatedItem.carb,
      fat: updatedItem.fat,
      fatTotal: updatedItem.fatTotal,
      row: updatedItem.row,
      ...(updatedItem.customImage ? { customImage: updatedItem.customImage } : {}),
      ...(updatedItem.customEmoji ? { customEmoji: updatedItem.customEmoji } : {}),
    },
  };
}
