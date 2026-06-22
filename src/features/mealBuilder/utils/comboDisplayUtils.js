export function formatComboIngredientLine(item) {
  const name = String(item?.desc || item?.name || 'Alimento').trim();
  const weight = Number(item?.weight ?? item?.qta);
  if (Number.isFinite(weight) && weight > 0) {
    return `${name} (${Math.round(weight)}g)`;
  }
  if (item?.qtyLabel) return `${name} (${item.qtyLabel})`;
  return name;
}

export function resolveComboCardTitle(combo, index) {
  const name = String(combo?.name || '').trim();
  if (!name) return `Combo ${index + 1}`;

  if (/^Combo:\s/i.test(name)) return `Combo ${index + 1}`;

  const items = combo?.items || [];
  if (items.length > 1) {
    const ingredientNames = items
      .map((item) => String(item.desc || item.name || '').trim())
      .filter(Boolean);
    const looksLikeIngredientList =
      name.includes(',')
      || name.includes(' e ')
      || ingredientNames.every(
        (label) => label.length > 0 && name.toLowerCase().includes(label.toLowerCase()),
      );
    if (looksLikeIngredientList) return `Combo ${index + 1}`;
  }

  return name;
}
