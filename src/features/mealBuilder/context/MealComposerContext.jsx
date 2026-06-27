import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import {
  buildInitialAmount,
  buildQtyLabel,
  resolveUnitWeight,
} from '../utils/draftFoodUnits';
import {
  computeDraftTotals,
  scaleNutrientsForWeight,
} from '../utils/foodMacroUtils';
import { roundToOneDecimal } from '../utils/numberFormatUtils';

const MealComposerContext = createContext(null);

const DEFAULT_MEAL_TYPE = 'pranzo';
const DEFAULT_MEAL_TIME = 13.5;

function createDraftFoodId() {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function applyFoodAmount(item, multiplier, unitId) {
  const mult = Number(multiplier);
  if (!Number.isFinite(mult) || mult < 0) return item;

  const unitWeight = resolveUnitWeight(item, unitId);
  const newWeight = roundToOneDecimal(mult * unitWeight);
  const nextMult = unitId === 'g' ? newWeight : roundToOneDecimal(mult);
  const scaledNutrients = scaleNutrientsForWeight(item, newWeight);

  return {
    ...item,
    ...scaledNutrients,
    selectedUnit: unitId,
    multiplier: nextMult,
    qta: newWeight,
    weight: newWeight,
    qtyLabel: buildQtyLabel(item, unitId, nextMult, newWeight),
    unit: unitId === 'g' ? 'g' : unitId,
  };
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

  const normalized = {
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

  const weight = Number(normalized.weight ?? normalized.qta) || 0;
  if (normalized.row && weight > 0) {
    return {
      ...normalized,
      ...scaleNutrientsForWeight(normalized, weight),
    };
  }

  return normalized;
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
      setMealTime,
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
      setMealTime,
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
