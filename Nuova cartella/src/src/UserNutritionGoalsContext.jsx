import React, { createContext, useContext } from 'react';

const UserNutritionGoalsContext = createContext(null);

export function UserNutritionGoalsProvider({ value, children }) {
  return (
    <UserNutritionGoalsContext.Provider value={value}>
      {children}
    </UserNutritionGoalsContext.Provider>
  );
}

/**
 * Global nutrition goals: goal (cut/maintain/bulk), targetCalories, optional proteinTarget.
 * Must be used inside UserNutritionGoalsProvider (SalaComandi root).
 */
export function useUserNutritionGoals() {
  const ctx = useContext(UserNutritionGoalsContext);
  if (ctx == null) {
    throw new Error('useUserNutritionGoals must be used within UserNutritionGoalsProvider');
  }
  return ctx;
}
