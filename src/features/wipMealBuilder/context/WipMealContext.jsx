import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  computeWipMealTotals,
  declarationItemToWipAlimento,
  suggestionToWipAlimento,
} from '../utils/wipMealItemUtils.js';
import { registerWipMealBridge } from '../wipMealBridge.js';

const WipMealContext = createContext(null);

const DEFAULT_MEAL_TYPE = 'pranzo';

function useWipMealState() {
  const [wipMealItems, setWipMealItems] = useState([]);
  const [mealType, setMealType] = useState(DEFAULT_MEAL_TYPE);
  const [mealTime, setMealTime] = useState(null);

  const addAlimentoToWip = useCallback((alimento) => {
    const fromSuggestion = alimento?.name && !alimento?.foodName
      ? suggestionToWipAlimento(alimento)
      : declarationItemToWipAlimento(alimento);
    if (!fromSuggestion) return null;

    setWipMealItems((prev) => {
      const duplicate = prev.some((item) => {
        const sameName = String(item?.foodName || item?.name || '').trim().toLowerCase()
          === fromSuggestion.foodName.toLowerCase();
        const sameGrams = Math.round(Number(item?.grams) || 0) === fromSuggestion.grams;
        return sameName && sameGrams;
      });
      if (duplicate) return prev;
      return [...prev, fromSuggestion];
    });
    return fromSuggestion;
  }, []);

  const addAlimentiToWip = useCallback((items = []) => {
    if (!Array.isArray(items) || items.length === 0) return [];

    const normalizedBatch = items
      .map((raw) => declarationItemToWipAlimento(raw))
      .filter(Boolean);

    if (normalizedBatch.length === 0) return [];

    setWipMealItems((prev) => {
      const next = [...prev];
      normalizedBatch.forEach((candidate) => {
        const duplicate = next.some((item) => {
          const sameName = String(item?.foodName || item?.name || '').trim().toLowerCase()
            === candidate.foodName.toLowerCase();
          const sameGrams = Math.round(Number(item?.grams) || 0) === candidate.grams;
          return sameName && sameGrams;
        });
        if (!duplicate) next.push(candidate);
      });
      return next;
    });

    return normalizedBatch;
  }, []);

  const removeAlimentoFromWip = useCallback((itemId) => {
    if (itemId == null) return;
    setWipMealItems((prev) => prev.filter((item) => String(item.id) !== String(itemId)));
  }, []);

  const clearWipMeal = useCallback(() => {
    setWipMealItems([]);
    setMealType(DEFAULT_MEAL_TYPE);
    setMealTime(null);
  }, []);

  const setWipMealType = useCallback((nextMealType) => {
    const normalized = String(nextMealType || '').trim().toLowerCase();
    if (!normalized) return;
    setMealType(normalized);
  }, []);

  const seedFromDeclaration = useCallback((wipSeed) => {
    if (!wipSeed || !Array.isArray(wipSeed.items) || wipSeed.items.length === 0) return;
    addAlimentiToWip(wipSeed.items);
    if (wipSeed.mealType) setWipMealType(wipSeed.mealType);
  }, [addAlimentiToWip, setWipMealType]);

  const wipTotals = useMemo(
    () => computeWipMealTotals(wipMealItems),
    [wipMealItems],
  );

  const getWipMealSnapshot = useCallback(() => ({
    wipMealItems,
    mealType,
    mealTime,
    wipTotals,
  }), [wipMealItems, mealType, mealTime, wipTotals]);

  useEffect(() => {
    registerWipMealBridge({
      getWipMealSnapshot,
      seedFromDeclaration,
      addAlimentoToWip,
    });
    return () => registerWipMealBridge(null);
  }, [getWipMealSnapshot, seedFromDeclaration, addAlimentoToWip]);

  return useMemo(
    () => ({
      wipMealItems,
      wipTotals,
      mealType,
      mealTime,
      addAlimentoToWip,
      addAlimentiToWip,
      removeAlimentoFromWip,
      clearWipMeal,
      setWipMealType,
      setMealTime,
      getWipMealSnapshot,
      seedFromDeclaration,
    }),
    [
      wipMealItems,
      wipTotals,
      mealType,
      mealTime,
      addAlimentoToWip,
      addAlimentiToWip,
      removeAlimentoFromWip,
      clearWipMeal,
      setWipMealType,
      getWipMealSnapshot,
      seedFromDeclaration,
    ],
  );
}

export function WipMealProvider({ children }) {
  const value = useWipMealState();
  return (
    <WipMealContext.Provider value={value}>
      {children}
    </WipMealContext.Provider>
  );
}

export function useWipMeal() {
  const ctx = useContext(WipMealContext);
  if (ctx == null) {
    throw new Error('useWipMeal must be used within WipMealProvider');
  }
  return ctx;
}
