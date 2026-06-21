import { getComboFoodItems } from './comboFoodUtils';
import { roundToOneDecimal } from './numberFormatUtils';

function createChildId() {
  return `draft_child_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createRecipeGroupId() {
  return `draft_rg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function isRecipeGroup(item) {
  return item?.isRecipeGroup === true;
}

export function resolveRecipeGroupMatchKey(groupOrCombo) {
  if (groupOrCombo?.foodDbKey) return String(groupOrCombo.foodDbKey).trim();
  const id = groupOrCombo?.recipeGroupId ?? groupOrCombo?.id ?? groupOrCombo?.signature;
  return id ? `recipe:${String(id).trim()}` : null;
}

export function findRecipeGroupInDraft(draftFoods, comboOrKey) {
  const matchKey =
    typeof comboOrKey === 'string'
      ? comboOrKey
      : resolveRecipeGroupMatchKey({
          id: comboOrKey?.id ?? comboOrKey?.signature,
          recipeGroupId: comboOrKey?.id ?? comboOrKey?.signature,
        });
  if (!matchKey) return null;

  return (
    (draftFoods || []).find(
      (item) => isRecipeGroup(item) && resolveRecipeGroupMatchKey(item) === matchKey,
    ) ?? null
  );
}

export function getRecipeGroupQty(draftFoods, combo) {
  const group = findRecipeGroupInDraft(draftFoods, combo);
  if (!group) return 0;

  const base = Number(group.baseTotalWeight) || 0;
  const current = Number(group.weight ?? group.qta) || 0;
  if (current <= 0) return 0;
  if (base <= 0) return 1;
  return Math.max(1, Math.round(current / base));
}

function scaleChildMacros(child, ratio) {
  const kcal = Math.round((Number(child.kcal ?? child.cal) || 0) * ratio);
  const prot = Math.round((Number(child.prot) || 0) * ratio * 10) / 10;
  const carb = Math.round((Number(child.carb) || 0) * ratio * 10) / 10;
  const fat = Math.round((Number(child.fatTotal ?? child.fat) || 0) * ratio * 10) / 10;

  return {
    kcal,
    cal: kcal,
    prot,
    carb,
    fat,
    fatTotal: fat,
  };
}

export function scaleChildByFactor(child, factor) {
  if (!Number.isFinite(factor) || factor <= 0) return child;

  const oldWeight = Number(child.weight ?? child.qta) || 0;
  const newWeight = roundToOneDecimal(oldWeight * factor);
  const ratio = oldWeight > 0 ? newWeight / oldWeight : factor;

  return {
    ...child,
    ...scaleChildMacros(child, ratio),
    weight: newWeight,
    qta: newWeight,
    multiplier: newWeight,
    qtyLabel: `${Math.round(newWeight)}g`,
  };
}

export function normalizeComboItemToChild(item, index = 0) {
  const desc = String(item?.desc ?? item?.name ?? 'Alimento').trim() || 'Alimento';
  const weight = roundToOneDecimal(Number(item?.weight ?? item?.qta) || 0) || 100;
  const kcal = Math.round(Number(item?.kcal ?? item?.cal) || 0);
  const prot = Number(item?.prot) || 0;
  const carb = Number(item?.carb) || 0;
  const fat = Number(item?.fatTotal ?? item?.fat) || 0;
  const ratio = weight > 0 ? 100 / weight : 1;

  const row = item?.row ?? {
    desc,
    kcal: Math.round(kcal * ratio),
    cal: Math.round(kcal * ratio),
    prot: Math.round(prot * ratio * 10) / 10,
    carb: Math.round(carb * ratio * 10) / 10,
    fat: Math.round(fat * ratio * 10) / 10,
    fatTotal: Math.round(fat * ratio * 10) / 10,
  };

  return {
    type: 'food',
    id: item?.id != null ? String(item.id) : createChildId(),
    desc,
    name: desc,
    foodDbKey: item?.foodDbKey ?? null,
    row,
    units: item?.units ?? row?.units,
    defaultUnit: item?.defaultUnit ?? row?.defaultUnit,
    baseWeight: weight,
    qta: weight,
    weight,
    unit: 'g',
    selectedUnit: item?.selectedUnit || 'g',
    multiplier: Number(item?.multiplier) || weight,
    qtyLabel: item?.qtyLabel || `${Math.round(weight)}g`,
    kcal,
    cal: kcal,
    prot: Math.round(prot * 10) / 10,
    carb: Math.round(carb * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    fatTotal: Math.round(fat * 10) / 10,
    _recipeChildIndex: index,
  };
}

export function recomputeRecipeGroupTotals(group) {
  const items = Array.isArray(group?.items) ? group.items : [];

  const totals = items.reduce(
    (acc, child) => {
      acc.weight += Number(child.weight ?? child.qta) || 0;
      acc.kcal += Number(child.kcal ?? child.cal) || 0;
      acc.prot += Number(child.prot) || 0;
      acc.carb += Number(child.carb) || 0;
      acc.fat += Number(child.fatTotal ?? child.fat) || 0;
      return acc;
    },
    { weight: 0, kcal: 0, prot: 0, carb: 0, fat: 0 },
  );

  const weight = roundToOneDecimal(totals.weight);

  return {
    ...group,
    items,
    weight,
    qta: weight,
    multiplier: weight,
    selectedUnit: 'g',
    qtyLabel: `${Math.round(weight)}g`,
    kcal: Math.round(totals.kcal),
    cal: Math.round(totals.kcal),
    prot: Math.round(totals.prot * 10) / 10,
    carb: Math.round(totals.carb * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
    fatTotal: Math.round(totals.fat * 10) / 10,
  };
}

export function scaleRecipeGroupToWeight(group, newParentWeight) {
  const oldWeight = Number(group?.weight ?? group?.qta) || 0;
  const targetWeight = roundToOneDecimal(newParentWeight);

  if (oldWeight <= 0 || targetWeight <= 0) {
    return recomputeRecipeGroupTotals({ ...group, weight: targetWeight, qta: targetWeight });
  }

  const factor = targetWeight / oldWeight;
  const scaledItems = (group.items || []).map((child) => scaleChildByFactor(child, factor));

  return recomputeRecipeGroupTotals({
    ...group,
    items: scaledItems,
  });
}

export function buildRecipeGroupFromCombo(combo) {
  const rawItems = getComboFoodItems(combo);
  if (rawItems.length === 0) return null;

  const recipeGroupId = String(combo?.id ?? combo?.signature ?? 'combo').trim() || 'combo';
  const name = String(combo?.name ?? 'Combo pasto').trim() || 'Combo pasto';
  const children = rawItems.map((item, index) => normalizeComboItemToChild(item, index));
  const baseTotalWeight = Math.round(
    children.reduce((sum, child) => sum + (Number(child.baseWeight) || 0), 0),
  );

  const group = {
    id: createRecipeGroupId(),
    recipeGroupId,
    isRecipeGroup: true,
    type: 'recipeGroup',
    name,
    desc: name,
    foodDbKey: `recipe:${recipeGroupId}`,
    customImage: combo?.customImage || null,
    baseTotalWeight: baseTotalWeight > 0 ? baseTotalWeight : 100,
    items: children,
    selectedUnit: 'g',
  };

  return recomputeRecipeGroupTotals(group);
}

export function flattenDraftFoodsForSave(draftFoods) {
  const out = [];

  (draftFoods || []).forEach((item) => {
    if (isRecipeGroup(item)) {
      (item.items || []).forEach((child) => {
        out.push({ ...child, type: 'food' });
      });
      return;
    }
    out.push(item);
  });

  return out;
}

export function computeRecipeGroupItemMacros(item) {
  if (isRecipeGroup(item)) {
    return (item.items || []).reduce(
      (acc, child) => {
        const macros = computeRecipeGroupItemMacros(child);
        acc.kcal += macros.kcal;
        acc.prot += macros.prot;
        acc.carb += macros.carb;
        acc.fat += macros.fat;
        return acc;
      },
      { kcal: 0, prot: 0, carb: 0, fat: 0 },
    );
  }

  const weight = Number(item?.weight ?? item?.qta) || 0;
  const row = item?.row || {};
  const rowKcal = Number(row.kcal ?? row.cal);

  if (Number.isFinite(rowKcal) && weight > 0) {
    const ratio = weight / 100;
    return {
      kcal: Math.round(rowKcal * ratio),
      prot: Math.round((Number(row.prot) || 0) * ratio * 10) / 10,
      carb: Math.round((Number(row.carb) || 0) * ratio * 10) / 10,
      fat: Math.round((Number(row.fatTotal ?? row.fat) || 0) * ratio * 10) / 10,
    };
  }

  return {
    kcal: Math.round(Number(item?.kcal ?? item?.cal) || 0),
    prot: Number(item?.prot) || 0,
    carb: Number(item?.carb) || 0,
    fat: Number(item?.fatTotal ?? item?.fat) || 0,
  };
}
