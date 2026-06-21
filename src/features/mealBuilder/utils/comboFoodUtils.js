export function getComboFoodItems(combo) {
  const items = combo?.foods ?? combo?.items ?? combo?.ingredients;
  return Array.isArray(items) ? items : [];
}

export function convertComboToSingleFood(combo) {
  const items = getComboFoodItems(combo);
  if (items.length === 0) return null;

  let totalWeight = 0;
  let totalKcal = 0;
  let totalP = 0;
  let totalC = 0;
  let totalF = 0;

  items.forEach((item) => {
    const weight = Number(item?.weight ?? item?.qta) || 0;
    totalWeight += weight;
    totalKcal += Number(item?.kcal ?? item?.cal) || 0;
    totalP += Number(item?.prot) || 0;
    totalC += Number(item?.carb) || 0;
    totalF += Number(item?.fat ?? item?.fatTotal) || 0;
  });

  if (totalWeight <= 0) totalWeight = 100;

  const per100Factor = 100 / totalWeight;

  const id = String(combo?.id ?? combo?.signature ?? 'combo').trim() || 'combo';
  const name = String(combo?.name ?? 'Combo pasto').trim() || 'Combo pasto';

  return {
    id,
    name,
    customImage: combo?.customImage || null,
    defaultUnitWeight: 100,
    totalWeight: Math.round(totalWeight),
    baseKcal: Math.round(totalKcal * per100Factor),
    baseP: Math.round(totalP * per100Factor * 10) / 10,
    baseC: Math.round(totalC * per100Factor * 10) / 10,
    baseF: Math.round(totalF * per100Factor * 10) / 10,
    isRecipe: true,
    foodDbKey: `recipe:${id}`,
  };
}

export function buildComboDraftPayload(combo) {
  const single = convertComboToSingleFood(combo);
  if (!single) return null;

  const weight = single.totalWeight;
  const ratio = weight / 100;
  const servingKcal = Math.round(single.baseKcal * ratio);
  const servingP = Math.round(single.baseP * ratio * 10) / 10;
  const servingC = Math.round(single.baseC * ratio * 10) / 10;
  const servingF = Math.round(single.baseF * ratio * 10) / 10;

  return {
    type: 'food',
    desc: single.name,
    name: single.name,
    label: single.name,
    foodDbKey: single.foodDbKey,
    isRecipe: true,
    comboId: single.id,
    customImage: single.customImage,
    defaultUnitWeight: single.defaultUnitWeight,
    totalWeight: single.totalWeight,
    row: {
      desc: single.name,
      kcal: single.baseKcal,
      cal: single.baseKcal,
      prot: single.baseP,
      carb: single.baseC,
      fat: single.baseF,
      fatTotal: single.baseF,
      isRecipe: true,
    },
    qta: weight,
    weight,
    unit: 'g',
    selectedUnit: 'g',
    multiplier: weight,
    qtyLabel: `${weight}g`,
    kcal: servingKcal,
    cal: servingKcal,
    prot: servingP,
    carb: servingC,
    fat: servingF,
    fatTotal: servingF,
  };
}
