import { getSlotKey } from '../coreEngine.jsx';

/** Alimenti del diario che appartengono allo slot pasto (mealType o composito mealType_decimalTime). */
export function getFoodItemsForMealSlotFromLog(log, slotId) {
  if (slotId == null || slotId === 'rimanenti') return [];
  const idStr = String(slotId);
  const list = log || [];
  let items = list.filter((item) => getSlotKey(item) === idStr);
  if (items.length === 0) {
    const u = idStr.lastIndexOf('_');
    if (u > 0) {
      const baseMealType = idStr.slice(0, u);
      const parsedTime = Number(idStr.slice(u + 1));
      if (!Number.isNaN(parsedTime)) {
        items = list.filter(
          (item) =>
            (item.type === 'food' || item.type === 'recipe')
            && item.mealType === baseMealType
            && typeof item.mealTime === 'number'
            && Math.abs(item.mealTime - parsedTime) < 1e-4,
        );
      }
    }
  }
  return items;
}

/** Sostituisce tutte le voci di uno slot pasto con nuove entries (overwrite, non append). */
export function replaceMealSlotInLog(log, slotId, newEntries) {
  const foodsToRemove = getFoodItemsForMealSlotFromLog(log, slotId);
  const removeSet = new Set(foodsToRemove);
  const filtered = (log || []).filter((item) => !removeSet.has(item));
  return [...(Array.isArray(newEntries) ? newEntries : []), ...filtered];
}

export function buildMealProposalLogEntries(selectedItems, options = {}) {
  const {
    batchId,
    mealTypeCanonical,
    mealDec,
    mealSlot,
    foodDb = {},
    findBestFoodMatch,
    resolveFoodFromDb,
  } = options;

  if (!Array.isArray(selectedItems) || selectedItems.length === 0) return [];

  return selectedItems.map((it, index) => {
    const name = String(it.name || it.foodName || it.desc || '').trim() || 'Alimento';
    const qty = Math.max(1, Math.round(Number(it.qty ?? it.grams ?? it.qta) || 100));
    const preferredKey = it.foodDbKey ?? it.matchedKey ?? it.dbKey ?? null;

    // Cascata personale → Kentu: resolveFoodFromDb (estraiDatiFoodDb) gestisce i layer.
    // Non richiedere match solo sul DB personale prima della risoluzione.
    if (typeof resolveFoodFromDb === 'function') {
      let preferred = preferredKey;
      if (preferred != null && foodDb && foodDb[preferred] == null) {
        // Chiave Kentu / altro layer: passa comunque come preferred alla cascata.
        preferred = preferredKey;
      } else if (preferred == null && typeof findBestFoodMatch === 'function') {
        preferred = findBestFoodMatch(name, foodDb);
      }

      const dati = resolveFoodFromDb(name, qty, mealSlot, preferred || null);
      if (dati && String(dati.status || '') !== 'NEEDS_RESOLUTION') {
        const isRecipe = dati?.type === 'recipe';
        return {
          ...dati,
          id: dati.id || `${batchId}_${index}`,
          type: isRecipe ? 'recipe' : 'food',
          name: dati.name ?? dati.desc ?? name,
          desc: dati.desc ?? name,
          qta: dati.qta ?? dati.weight ?? qty,
          weight: dati.weight ?? dati.qta ?? qty,
          mealType: mealTypeCanonical,
          mealTime: mealDec,
          batchId,
          isEstimated: false,
          status: 'RESOLVED',
        };
      }
    }

    const qSafe = Math.max(5, qty);
    let kcal = Math.round(Number(it.estKcal));
    let prot = Number(it.estPro);
    let carb = Number(it.estCar);
    let fat = Number(it.estFat);
    // Tolleranza zero: niente stime medie automatiche se i valori non sono già noti.
    if (!Number.isFinite(kcal) || kcal < 0) kcal = 0;
    if (!Number.isFinite(prot) || prot < 0) prot = 0;
    if (!Number.isFinite(carb) || carb < 0) carb = 0;
    if (!Number.isFinite(fat) || fat < 0) fat = 0;
    prot = Math.round(prot * 10) / 10;
    carb = Math.round(carb * 10) / 10;
    fat = Math.round(fat * 10) / 10;

    return {
      id: `${batchId}_food_${index}`,
      type: 'food',
      name,
      desc: name,
      qta: qSafe,
      weight: qSafe,
      kcal,
      cal: kcal,
      prot,
      carb,
      fat,
      fatTotal: fat,
      mealType: mealTypeCanonical,
      mealTime: mealDec,
      batchId,
      isEstimated: true,
      status: 'NEEDS_RESOLUTION',
    };
  });
}

export function sumMealProposalMacroTotals(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return {
    kcal: Math.round(list.reduce((s, f) => s + (Number(f.kcal) || Number(f.cal) || 0), 0)),
    prot: Math.round(list.reduce((s, f) => s + (Number(f.prot) || 0), 0) * 10) / 10,
    carbo: Math.round(list.reduce((s, f) => s + (Number(f.carb) || 0), 0) * 10) / 10,
    fat: Math.round(list.reduce((s, f) => s + (Number(f.fatTotal ?? f.fat) || 0), 0) * 10) / 10,
  };
}

export function buildMealProposalConfirmMessage(timeStr, totals) {
  const t = totals && typeof totals === 'object' ? totals : {};
  return `🎯 **Pasto Registrato**
- **Orario:** ${timeStr}
- **Kcal Totali:** ${t.kcal ?? 0}
- **Proteine:** ${t.prot ?? 0}g
- **Carboidrati:** ${t.carbo ?? 0}g
- **Grassi:** ${t.fat ?? 0}g

Ottimo! Diario aggiornato. 🥗`;
}

export function buildMealUpdateConfirmMessage(timeStr, totals) {
  const t = totals && typeof totals === 'object' ? totals : {};
  return `✅ **Pasto Aggiornato**
- **Orario:** ${timeStr}
- **Kcal Totali:** ${t.kcal ?? 0}
- **Proteine:** ${t.prot ?? 0}g
- **Carboidrati:** ${t.carbo ?? 0}g
- **Grassi:** ${t.fat ?? 0}g

Diario sovrascritto con la versione aggiornata.`;
}
