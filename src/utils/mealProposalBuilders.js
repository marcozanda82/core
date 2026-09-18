import { getSlotKey, toCanonicalMealType } from '../coreEngine.jsx';

function isDiaryFood(item) {
  return item?.type === 'food' || item?.type === 'recipe';
}

/** Accetta ora decimale, stringa numerica o HH:mm[:ss]. */
export function coerceDiaryMealTime(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 24) {
    return value;
  }
  if (value == null || value === '') return null;
  const asNum = Number(String(value).trim().replace(',', '.'));
  if (Number.isFinite(asNum) && asNum >= 0 && asNum <= 24 && !String(value).includes(':')) {
    return asNum;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours + minutes / 60;
}

function foodsOfMealType(list, mealType) {
  const mt = String(mealType || '');
  if (!mt) return [];
  return (list || []).filter((item) => isDiaryFood(item) && String(item.mealType || '') === mt);
}

function canonicalMealBase(mealType) {
  return toCanonicalMealType(String(mealType || '').split('_')[0]) || '';
}

/** Separa `mealType` da un eventuale suffisso orario (0–24). Non tratta i timestamp di sessione. */
export function parseCompositeMealSlotId(slotId) {
  const idStr = String(slotId || '').trim();
  if (!idStr) return { typePart: '', timePart: NaN };
  const last = idStr.lastIndexOf('_');
  if (last <= 0) return { typePart: idStr, timePart: NaN };
  const suffix = idStr.slice(last + 1);
  const n = Number(suffix);
  if (Number.isFinite(n) && n >= 0 && n <= 24) {
    return { typePart: idStr.slice(0, last), timePart: n };
  }
  return { typePart: idStr, timePart: NaN };
}

function foodsOfCanonicalTypeAndTime(list, canonical, timePart) {
  const canon = String(canonical || '');
  if (!canon) return [];
  const sameCanon = (list || []).filter((item) => (
    isDiaryFood(item) && canonicalMealBase(item.mealType) === canon
  ));
  if (!Number.isFinite(timePart)) return sameCanon;
  return sameCanon.filter((item) => {
    const t = coerceDiaryMealTime(item.mealTime);
    return t != null && Math.abs(t - timePart) < 1e-4;
  });
}

function pickClosestMealTimeCluster(foods, parsedTime) {
  if (!Array.isArray(foods) || foods.length === 0) return [];
  if (!Number.isFinite(parsedTime)) return foods;
  const timed = foods
    .map((item) => ({ item, t: coerceDiaryMealTime(item.mealTime) }))
    .filter((row) => row.t != null);
  if (timed.length === 0) return foods;
  let bestDelta = Infinity;
  let bestT = timed[0].t;
  timed.forEach((row) => {
    const delta = Math.abs(row.t - parsedTime);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestT = row.t;
    }
  });
  const cluster = timed.filter((row) => Math.abs(row.t - bestT) < 1e-4).map((row) => row.item);
  return cluster.length > 0 ? cluster : foods;
}

/** Alimenti del diario che appartengono allo slot pasto (mealType o composito mealType_decimalTime). */
export function getFoodItemsForMealSlotFromLog(log, slotId) {
  if (slotId == null || slotId === 'rimanenti') return [];
  const idStr = String(slotId);
  const list = Array.isArray(log) ? log : [];
  let items = list.filter((item) => getSlotKey(item) === idStr);
  if (items.length > 0) return items;

  const foods = list.filter(isDiaryFood);
  const mealTypes = [...new Set(foods.map((f) => String(f.mealType || '')).filter(Boolean))];
  mealTypes.sort((a, b) => b.length - a.length);

  let prefixMatchType = '';
  let parsedTime = NaN;
  for (const mt of mealTypes) {
    if (idStr === mt) {
      return foods.filter((item) => item.mealType === mt);
    }
    const prefix = `${mt}_`;
    if (!idStr.startsWith(prefix)) continue;
    const timePart = idStr.slice(prefix.length);
    const t = Number(timePart);
    prefixMatchType = mt;
    if (Number.isFinite(t)) parsedTime = t;
    const timed = foods.filter((item) => {
      if (item.mealType !== mt) return false;
      const mealTime = coerceDiaryMealTime(item.mealTime);
      return mealTime != null && Number.isFinite(t) && Math.abs(mealTime - t) < 1e-4;
    });
    if (timed.length > 0) return timed;
  }

  if (prefixMatchType) {
    const closest = pickClosestMealTimeCluster(foodsOfMealType(list, prefixMatchType), parsedTime);
    if (closest.length > 0) return closest;
  }

  const u = idStr.lastIndexOf('_');
  if (u > 0) {
    const baseMealType = idStr.slice(0, u);
    const parsed = Number(idStr.slice(u + 1));
    const closest = pickClosestMealTimeCluster(
      foodsOfMealType(list, baseMealType),
      Number.isFinite(parsed) ? parsed : NaN,
    );
    if (closest.length > 0) return closest;
  }

  // `pranzo_13` deve trovare anche `mealType: pranzo_<timestamp>` allo stesso orario.
  const composite = parseCompositeMealSlotId(idStr);
  const canonical = canonicalMealBase(composite.typePart) || canonicalMealBase(idStr);
  if (canonical) {
    const byCanon = foodsOfCanonicalTypeAndTime(
      list,
      canonical,
      Number.isFinite(composite.timePart) ? composite.timePart : parsedTime,
    );
    if (byCanon.length > 0) return byCanon;
  }

  return foodsOfMealType(list, idStr);
}

/**
 * Trova le voci da sostituire in un update assistito: slot id, id alimenti, oppure tipo pasto.
 * @returns {{ slotId: string, existing: object[] }}
 */
export function resolveMealFoodsForSlotUpdate(log, slotId, incomingItems = [], lookupFn = null) {
  const list = Array.isArray(log) ? log : [];
  const idStr = String(slotId || '').trim();
  const lookup = typeof lookupFn === 'function' ? lookupFn : getFoodItemsForMealSlotFromLog;

  let existing = idStr ? lookup(list, idStr) : [];
  if (existing.length === 0 && idStr && lookup !== getFoodItemsForMealSlotFromLog) {
    existing = getFoodItemsForMealSlotFromLog(list, idStr);
  }
  if (existing.length > 0) {
    return { slotId: idStr, existing };
  }

  const incomingIds = new Set(
    (Array.isArray(incomingItems) ? incomingItems : [])
      .map((item) => String(item?.id || '').trim())
      .filter(Boolean),
  );
  if (incomingIds.size > 0) {
    const byId = list.filter((item) => isDiaryFood(item) && incomingIds.has(String(item.id || '')));
    if (byId.length > 0) {
      const seed = byId[0];
      const siblings = list.filter((item) => {
        if (!isDiaryFood(item)) return false;
        if (String(item.mealType || '') !== String(seed.mealType || '')) return false;
        const seedTime = coerceDiaryMealTime(seed.mealTime);
        if (seedTime != null) {
          const itemTime = coerceDiaryMealTime(item.mealTime);
          if (itemTime == null) return false;
          return Math.abs(itemTime - seedTime) < 1e-4;
        }
        return true;
      });
      return {
        slotId: idStr || String(seed.mealType || ''),
        existing: siblings.length > 0 ? siblings : byId,
      };
    }
  }

  return { slotId: idStr, existing: [] };
}

/** Sostituisce tutte le voci di uno slot pasto con nuove entries (overwrite, non append). */
export function replaceMealSlotInLog(log, slotId, newEntries, foodsToRemoveOverride = null) {
  const foodsToRemove = Array.isArray(foodsToRemoveOverride) && foodsToRemoveOverride.length > 0
    ? foodsToRemoveOverride
    : getFoodItemsForMealSlotFromLog(log, slotId);
  const removeRefs = new Set(foodsToRemove);
  const removeIds = new Set(
    foodsToRemove.map((item) => String(item?.id || '')).filter(Boolean),
  );
  const filtered = (log || []).filter((item) => {
    if (removeRefs.has(item)) return false;
    const id = String(item?.id || '');
    return !(id && removeIds.has(id));
  });
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
