import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import {

  buildInitialAmount,

  buildQtyLabel,

  resolveUnitWeight,

} from '../utils/draftFoodUnits';



const MealComposerContext = createContext(null);



const DEFAULT_MEAL_TYPE = 'pranzo';

const DEFAULT_MEAL_TIME = 13.5;



const MACRO_SCALE_KEYS = [

  { key: 'kcal', roundInt: true },

  { key: 'cal', roundInt: true },

  { key: 'prot', roundInt: false },

  { key: 'carb', roundInt: false },

  { key: 'fat', roundInt: false },

  { key: 'fatTotal', roundInt: false },

];



function createDraftFoodId() {

  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

}



function scaleMacrosForWeight(item, newWeight) {

  const row = item?.row || {};

  const rowKcal = Number(row.kcal ?? row.cal);

  const hasRowPer100 = Number.isFinite(rowKcal) && rowKcal >= 0;



  if (hasRowPer100 && newWeight >= 0) {

    const ratio = newWeight / 100;

    const scaled = {};

    MACRO_SCALE_KEYS.forEach(({ key, roundInt }) => {

      const base =

        key === 'cal'

          ? Number(row.cal ?? row.kcal)

          : Number(row[key] ?? (key === 'fatTotal' ? row.fat : undefined));

      if (!Number.isFinite(base)) return;

      const value = base * ratio;

      scaled[key] = roundInt ? Math.round(value) : Math.round(value * 10) / 10;

    });

    if (scaled.kcal != null && scaled.cal == null) scaled.cal = scaled.kcal;

    if (scaled.cal != null && scaled.kcal == null) scaled.kcal = scaled.cal;

    return scaled;

  }



  const oldWeight = Number(item.qta ?? item.weight) || 0;

  if (oldWeight <= 0 || newWeight === oldWeight) return {};



  const ratio = newWeight / oldWeight;

  const scaled = {};

  MACRO_SCALE_KEYS.forEach(({ key, roundInt }) => {

    const current = Number(item[key]);

    if (!Number.isFinite(current)) return;

    const value = current * ratio;

    scaled[key] = roundInt ? Math.round(value) : Math.round(value * 10) / 10;

  });

  return scaled;

}



function applyFoodAmount(item, multiplier, unitId) {

  const mult = Number(multiplier);

  if (!Number.isFinite(mult) || mult < 0) return item;



  const unitWeight = resolveUnitWeight(item, unitId);

  const newWeight = mult * unitWeight;

  const scaledMacros = scaleMacrosForWeight(item, newWeight);



  return {

    ...item,

    ...scaledMacros,

    selectedUnit: unitId,

    multiplier: mult,

    qta: newWeight,

    weight: newWeight,

    qtyLabel: buildQtyLabel(item, unitId, mult, newWeight),

    unit: unitId === 'g' ? 'g' : unitId,

  };

}



function computeDraftItemMacros(item) {
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

function computeDraftTotals(draftFoods) {
  return (draftFoods || []).reduce(
    (acc, item) => {
      const macros = computeDraftItemMacros(item);
      acc.kcal += macros.kcal;
      acc.prot += macros.prot;
      acc.carb += macros.carb;
      acc.fat += macros.fat;
      return acc;
    },
    { kcal: 0, prot: 0, carb: 0, fat: 0 },
  );
}

function normalizeDraftFood(foodItem) {

  const id = foodItem?.id != null && String(foodItem.id).trim() !== ''

    ? String(foodItem.id)

    : createDraftFoodId();



  const initialAmount = foodItem.selectedUnit != null && foodItem.multiplier != null

    ? {

        selectedUnit: foodItem.selectedUnit,

        multiplier: Number(foodItem.multiplier) || 0,

        qta: Number(foodItem.qta ?? foodItem.weight) || 0,

        weight: Number(foodItem.weight ?? foodItem.qta) || 0,

      }

    : buildInitialAmount(foodItem);



  return {

    ...foodItem,

    id,

    ...initialAmount,

    qta: initialAmount.qta || initialAmount.weight,

    weight: initialAmount.weight || initialAmount.qta,

    qtyLabel: foodItem.qtyLabel || buildQtyLabel(

      foodItem,

      initialAmount.selectedUnit,

      initialAmount.multiplier,

      initialAmount.weight,

    ),

  };

}



function useMealComposerState({ initialMealType, initialMealTime } = {}) {

  const [draftFoods, setDraftFoods] = useState([]);

  const [mealType, setMealType] = useState(initialMealType ?? DEFAULT_MEAL_TYPE);

  const [mealTime, setMealTime] = useState(initialMealTime ?? DEFAULT_MEAL_TIME);

  const [status, setStatus] = useState('idle');



  const addFoodToDraft = useCallback((foodItem) => {

    if (!foodItem || typeof foodItem !== 'object') return;



    const normalized = normalizeDraftFood(foodItem);

    setDraftFoods((prev) => [normalized, ...prev]);

    setStatus('composing');

  }, []);



  const addComboToDraft = useCallback((comboItemsArray) => {

    if (!Array.isArray(comboItemsArray) || comboItemsArray.length === 0) return;



    const normalizedItems = comboItemsArray

      .filter((item) => item && typeof item === 'object')

      .map((item) => normalizeDraftFood({ type: 'food', ...item }));



    if (normalizedItems.length === 0) return;



    setDraftFoods((prev) => [...normalizedItems, ...prev]);

    setStatus('composing');

  }, []);

  const addFoodsToDraft = useCallback((foodsArray) => {
    if (!Array.isArray(foodsArray) || foodsArray.length === 0) return;

    const normalizedItems = foodsArray
      .filter((item) => item && typeof item === 'object')
      .map((item) => normalizeDraftFood({ type: 'food', ...item }));

    if (normalizedItems.length === 0) return;

    setDraftFoods((prev) => [...normalizedItems, ...prev]);
    setStatus('composing');
  }, []);



  const removeFoodFromDraft = useCallback((foodId) => {

    if (foodId == null) return;



    setDraftFoods((prev) => {

      const next = prev.filter((item) => String(item.id) !== String(foodId));

      setStatus(next.length === 0 ? 'idle' : 'composing');

      return next;

    });

  }, []);



  const updateFoodAmount = useCallback((foodId, multiplier, unitId) => {

    if (foodId == null) return;



    setDraftFoods((prev) =>

      prev.map((item) => {

        if (String(item.id) !== String(foodId)) return item;

        return applyFoodAmount(item, multiplier, unitId || 'g');

      }),

    );

  }, []);



  const updateFoodQuantity = useCallback((foodId, newQta) => {

    updateFoodAmount(foodId, newQta, 'g');

  }, [updateFoodAmount]);

  const updateFoodInDraft = useCallback((foodId, nextPartial) => {
    if (foodId == null || !nextPartial || typeof nextPartial !== 'object') return;

    setDraftFoods((prev) =>
      prev.map((item) => {
        if (String(item.id) !== String(foodId)) return item;
        return { ...item, ...nextPartial };
      }),
    );
  }, []);



  const clearDraft = useCallback(() => {

    setDraftFoods([]);

    setStatus('idle');

  }, []);

  const loadInitialDraft = useCallback((items) => {
    if (!Array.isArray(items) || items.length === 0) {
      setDraftFoods([]);
      setStatus('idle');
      return;
    }

    const normalized = items
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const weight = Number(item.qta ?? item.weight) || 100;
        return normalizeDraftFood({
          type: item.type === 'recipe' ? 'recipe' : 'food',
          ...item,
          selectedUnit: item.selectedUnit || 'g',
          multiplier: Number(item.multiplier) || weight,
          qta: weight,
          weight,
        });
      });

    setDraftFoods(normalized);
    setStatus(normalized.length > 0 ? 'composing' : 'idle');
  }, []);

  const draftTotals = useMemo(() => computeDraftTotals(draftFoods), [draftFoods]);

  return useMemo(

    () => ({

      draftFoods,

      draftTotals,

      mealType,

      mealTime,

      status,

      addFoodToDraft,

      addComboToDraft,

      addFoodsToDraft,

      removeFoodFromDraft,

      updateFoodAmount,

      updateFoodQuantity,

      updateFoodInDraft,

      clearDraft,

      loadInitialDraft,

    }),

    [

      draftFoods,

      draftTotals,

      mealType,

      mealTime,

      status,

      addFoodToDraft,

      addComboToDraft,

      addFoodsToDraft,

      removeFoodFromDraft,

      updateFoodAmount,

      updateFoodQuantity,

      updateFoodInDraft,

      clearDraft,

      loadInitialDraft,

    ],

  );

}



export function MealComposerProvider({

  children,

  initialMealType,

  initialMealTime,

}) {

  const value = useMealComposerState({ initialMealType, initialMealTime });



  return (

    <MealComposerContext.Provider value={value}>

      {children}

    </MealComposerContext.Provider>

  );

}



export function useMealComposer() {

  const ctx = useContext(MealComposerContext);

  if (ctx == null) {

    throw new Error('useMealComposer must be used within MealComposerProvider');

  }

  return ctx;

}


