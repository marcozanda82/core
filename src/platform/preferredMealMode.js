/**
 * Preferenza inserimento pasti: manuale vs guidato AI.
 * Persistenza locale — niente sync remoto.
 */

export const PREFERRED_MEAL_MODE_KEY = 'kentu_preferred_meal_mode';
export const PREFERRED_MEAL_MODE = Object.freeze({
  MANUAL: 'manual',
  AI: 'ai',
});

const DEFAULT_MODE = PREFERRED_MEAL_MODE.AI;

/**
 * @param {unknown} raw
 * @returns {'manual'|'ai'}
 */
export function normalizePreferredMealMode(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === PREFERRED_MEAL_MODE.MANUAL || v === 'manuale') {
    return PREFERRED_MEAL_MODE.MANUAL;
  }
  if (v === PREFERRED_MEAL_MODE.AI || v === 'guidato' || v === 'guided') {
    return PREFERRED_MEAL_MODE.AI;
  }
  return DEFAULT_MODE;
}

/**
 * @returns {'manual'|'ai'}
 */
export function getPreferredMealMode() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_MODE;
    return normalizePreferredMealMode(localStorage.getItem(PREFERRED_MEAL_MODE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

/**
 * @param {'manual'|'ai'|string} mode
 * @returns {'manual'|'ai'}
 */
export function setPreferredMealMode(mode) {
  const next = normalizePreferredMealMode(mode);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREFERRED_MEAL_MODE_KEY, next);
    }
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}
