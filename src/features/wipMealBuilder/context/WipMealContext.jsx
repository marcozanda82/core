import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  createEmptyMealWipConstraints,
  hasMealWipConstraints,
  mergeMealWipConstraints,
  parseMealConstraintsFromText,
  serializeMealWipForPrompt,
} from '../mealWipEngine.js';
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
  const [constraints, setConstraints] = useState(() => createEmptyMealWipConstraints());

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
    setConstraints(createEmptyMealWipConstraints());
  }, []);

  const setWipMealType = useCallback((nextMealType) => {
    const normalized = String(nextMealType || '').trim().toLowerCase();
    if (!normalized) return;
    setMealType(normalized);
  }, []);

  const mergeConstraints = useCallback((nextConstraints) => {
    setConstraints((prev) => mergeMealWipConstraints(prev, nextConstraints));
  }, []);

  const mergeConstraintsFromText = useCallback((userText) => {
    const parsed = parseMealConstraintsFromText(userText);
    if (!hasMealWipConstraints(parsed)) return parsed;
    setConstraints((prev) => mergeMealWipConstraints(prev, parsed));
    return parsed;
  }, []);

  const seedFromDeclaration = useCallback((wipSeed) => {
    if (!wipSeed || typeof wipSeed !== 'object') return;
    if (Array.isArray(wipSeed.items) && wipSeed.items.length > 0) {
      addAlimentiToWip(wipSeed.items);
    }
    if (wipSeed.mealType) setWipMealType(wipSeed.mealType);
    if (wipSeed.constraints) {
      setConstraints((prev) => mergeMealWipConstraints(prev, wipSeed.constraints));
    }
  }, [addAlimentiToWip, setWipMealType]);

  const wipTotals = useMemo(
    () => computeWipMealTotals(wipMealItems),
    [wipMealItems],
  );

  const mealWipActive = wipMealItems.length > 0 || hasMealWipConstraints(constraints);

  const getWipMealSnapshot = useCallback(() => ({
    wipMealItems,
    mealType,
    mealTime,
    wipTotals,
    constraints,
    mealWipActive,
    mealWip: serializeMealWipForPrompt({
      constraints,
      items: wipMealItems,
      mealType,
      totals: wipTotals,
    }),
  }), [wipMealItems, mealType, mealTime, wipTotals, constraints, mealWipActive]);

  useEffect(() => {
    registerWipMealBridge({
      getWipMealSnapshot,
      seedFromDeclaration,
      addAlimentoToWip,
      mergeConstraintsFromText,
      clearWipMeal,
    });
    return () => registerWipMealBridge(null);
  }, [getWipMealSnapshot, seedFromDeclaration, addAlimentoToWip, mergeConstraintsFromText, clearWipMeal]);

  return useMemo(
    () => ({
      wipMealItems,
      wipTotals,
      mealType,
      mealTime,
      constraints,
      mealWipActive,
      addAlimentoToWip,
      addAlimentiToWip,
      removeAlimentoFromWip,
      clearWipMeal,
      setWipMealType,
      setMealTime,
      mergeConstraints,
      mergeConstraintsFromText,
      getWipMealSnapshot,
      seedFromDeclaration,
    }),
    [
      wipMealItems,
      wipTotals,
      mealType,
      mealTime,
      constraints,
      mealWipActive,
      addAlimentoToWip,
      addAlimentiToWip,
      removeAlimentoFromWip,
      clearWipMeal,
      setWipMealType,
      mergeConstraints,
      mergeConstraintsFromText,
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
