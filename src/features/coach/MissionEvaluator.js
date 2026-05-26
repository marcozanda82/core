import { GOAL_DEFINITIONS } from './GoalDefinitions';

export const evaluateMissions = (
  goalType,
  currentData,
  userStats = { weight: 68, tdee: 2480 }
) => {
  const goal = GOAL_DEFINITIONS[goalType];
  if (!goal) return [];

  // Calcolo Dinamico Target
  const calculatedTargets = {
    kcal: Math.round(userStats.tdee * (1 + (goal.surplus_percentage || 0))),
    protein: Math.round(userStats.weight * (goal.multipliers?.protein || 0)),
    fats: Math.round(userStats.weight * (goal.multipliers?.fats || 0)),
    carbs: Math.round(userStats.weight * (goal.multipliers?.carbs || 0))
  };

  return goal.missions.map(mission => {
    let status = 'pending'; // 'pending', 'progress', 'completed'
    let progress = 0;
    const targetValue = Number(calculatedTargets[mission.id]) || 0;
    const currentValue = Number(
      currentData?.[mission.id] ?? (mission.id === 'fats' ? currentData?.fat : 0)
    ) || 0;

    // Logica di valutazione (progress confronta currentValue con targetValue)
    if (currentValue > 0) {
      status = 'progress';
      if (targetValue > 0) {
        if (currentValue >= targetValue) status = 'completed';
        progress = Math.min((currentValue / targetValue) * 100, 100);
      }
    }

    return {
      ...mission,
      status,
      progress,
      current: currentValue,
      targetValue
    };
  });
};
