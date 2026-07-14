import {
  createBlockActivity,
  createCalorieStrategy,
  createDayBlock,
  isUserAssignedDayBlock,
} from './weeklyBlockSchema';

/** @param {import('./weeklyBlockSchema').DayBlock | null | undefined} block */
export function isRestPlanBlockForSwap(block) {
  if (!isUserAssignedDayBlock(block)) return false;
  if (String(block.meta?.plannerWorkoutType || '').toLowerCase() === 'riposo') return true;
  const kind = String(block.activity?.kind || '').toUpperCase();
  return kind === 'REST' || kind === 'RECOVERY';
}

/**
 * @param {string} dateIso
 * @param {import('./weeklyBlockSchema').DayBlock | null | undefined} todayPlanBlock
 * @param {number | null | undefined} userProfileKcalBase
 */
export function buildUserRestDayBlock(dateIso, todayPlanBlock, userProfileKcalBase) {
  const strategyExtra = {};
  const existingBase = Number(todayPlanBlock?.calorieStrategy?.profileKcalBase);
  if (Number.isFinite(existingBase) && existingBase > 0) {
    strategyExtra.profileKcalBase = Math.round(existingBase);
  } else if (userProfileKcalBase != null) {
    strategyExtra.profileKcalBase = userProfileKcalBase;
  }
  return createDayBlock(
    dateIso,
    createBlockActivity('REST', { hour: '18:00' }),
    createCalorieStrategy('maintenance', 0, strategyExtra),
    {
      source: 'user',
      plannerWorkoutType: 'riposo',
      plannerIntensity: 'rest',
      plannerDurationMin: 0,
      updatedAt: Date.now(),
    },
  );
}

/** @param {import('./weeklyBlockSchema').DayBlock} block @param {string} targetDate */
export function relocatePlanBlockToDate(block, targetDate) {
  return {
    ...block,
    date: targetDate,
    activity: {
      ...block.activity,
      focus: Array.isArray(block.activity?.focus) ? [...block.activity.focus] : [],
    },
    calorieStrategy: { ...block.calorieStrategy },
    meta: { ...(block.meta || {}), source: 'user', updatedAt: Date.now() },
  };
}
