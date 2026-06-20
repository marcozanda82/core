import { useCallback, useMemo } from 'react';

import {
  fetchRecipesFromDb,
  ingredientToDraftItem,
  isRecipeRow,
} from '../utils/recipeDraftUtils';

export default function useRecipeEngine(personalDb) {
  const recipes = useMemo(() => fetchRecipesFromDb(personalDb), [personalDb]);

  const fetchRecipes = useCallback(
    () => fetchRecipesFromDb(personalDb),
    [personalDb],
  );

  const getRecipeAsDraft = useCallback(
    (recipeId) => {
      const key = String(recipeId ?? '').trim();
      if (!key || !personalDb?.[key]) return [];

      const entry = personalDb[key];
      if (!isRecipeRow(entry)) return [];

      const ingredients = Array.isArray(entry.ingredients) ? entry.ingredients : [];
      return ingredients.map((ing, index) => ingredientToDraftItem(ing, index, personalDb));
    },
    [personalDb],
  );

  return {
    recipes,
    fetchRecipes,
    getRecipeAsDraft,
  };
}
