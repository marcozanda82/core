import { useMemo } from 'react';
import { projectDayNutrition } from './projectDayNutrition.js';

/**
 * Hook read-only: stessa proiezione da Manuale e Assistito, senza scrivere dati.
 */
export function useDayNutritionProjection({
  effectiveTargets,
  currentDailyLog,
  draftMeal,
  editingContext,
} = {}) {
  return useMemo(
    () => projectDayNutrition({
      effectiveTargets,
      currentDailyLog,
      draftMeal,
      editingContext,
    }),
    [effectiveTargets, currentDailyLog, draftMeal, editingContext],
  );
}
