export function getItemUnits(item) {
  const units = item?.units ?? item?.row?.units;
  return Array.isArray(units) ? units : [];
}

export function resolveUnitIdFromUnit(unit) {
  if (!unit) return 'g';
  if (typeof unit === 'string') return unit;
  const label = String(unit.label || '').trim();
  if (!label) return String(unit.grams ?? 'g');
  return label.toLowerCase().replace(/\s+/g, '_');
}

export function resolveUnitWeight(item, unitId) {
  if (unitId === 'g') return 1;

  const units = getItemUnits(item);
  const found = units.find(
    (unit) =>
      resolveUnitIdFromUnit(unit) === unitId
      || String(unit.label || '').toLowerCase() === String(unitId).toLowerCase(),
  );

  const grams = Number(found?.grams);
  return Number.isFinite(grams) && grams > 0 ? grams : 1;
}

export function buildInitialAmount(foodItem) {
  const weight = Number(foodItem?.qta ?? foodItem?.weight) || 0;
  const defaultUnit = foodItem?.defaultUnit ?? foodItem?.row?.defaultUnit;

  if (
    defaultUnit
    && typeof defaultUnit === 'object'
    && defaultUnit.label
    && Number(defaultUnit.grams) > 0
  ) {
    const unitId = resolveUnitIdFromUnit(defaultUnit);
    if (unitId !== 'g') {
      const totalWeight = weight || Number(defaultUnit.grams);
      const multiplier = Math.round((totalWeight / Number(defaultUnit.grams)) * 100) / 100 || 1;
      return {
        selectedUnit: unitId,
        multiplier,
        qta: totalWeight,
        weight: totalWeight,
      };
    }
  }

  const grams = weight || 100;
  return {
    selectedUnit: 'g',
    multiplier: grams,
    qta: grams,
    weight: grams,
  };
}

export function buildQtyLabel(item, unitId, multiplier, totalWeight) {
  if (unitId === 'g') return `${totalWeight}g`;

  const units = getItemUnits(item);
  const unit = units.find((entry) => resolveUnitIdFromUnit(entry) === unitId);
  if (unit?.label) return `${multiplier} ${unit.label}`;
  return `${totalWeight}g`;
}

export function getAmountStep(unitId) {
  return unitId === 'g' ? 10 : 0.25;
}
