export function getComboFoodItems(combo) {
  const items = combo?.foods ?? combo?.items ?? combo?.ingredients;
  return Array.isArray(items) ? items : [];
}
