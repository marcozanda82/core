let wipMealBridge = null;

export function registerWipMealBridge(api) {
  wipMealBridge = api && typeof api === 'object' ? api : null;
}

export function getWipMealBridge() {
  return wipMealBridge;
}

export function getWipMealSnapshotFromBridge() {
  if (typeof wipMealBridge?.getWipMealSnapshot === 'function') {
    return wipMealBridge.getWipMealSnapshot();
  }
  return { wipMealItems: [], mealType: null, mealTime: null, wipTotals: null };
}

export function seedWipMealFromBridge(wipSeed) {
  if (typeof wipMealBridge?.seedFromDeclaration === 'function') {
    wipMealBridge.seedFromDeclaration(wipSeed);
  }
}
