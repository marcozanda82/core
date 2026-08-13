/**
 * Avatar contestuale Kentu: cambia asset in base all'attività AI / UI.
 *
 * Stati:
 * - coding  → /Hacker.png   (loading, parsing, elaborazione)
 * - kitchen → /Chef.png     (vassoio pasti / modifica grammi)
 * - fitness → /Trainer.png  (giorno ON / bozza workout)
 * - default → Health Score o /avatar.png
 */

export const AVATAR_MOOD = Object.freeze({
  DEFAULT: 'default',
  CODING: 'coding',
  KITCHEN: 'kitchen',
  FITNESS: 'fitness',
});

export const AVATAR_MOOD_SRC = Object.freeze({
  [AVATAR_MOOD.CODING]: '/Hacker.png',
  [AVATAR_MOOD.KITCHEN]: '/Chef.png',
  [AVATAR_MOOD.FITNESS]: '/Trainer.png',
});

export const AVATAR_MOOD_LABEL = Object.freeze({
  [AVATAR_MOOD.CODING]: 'Kentu sta elaborando',
  [AVATAR_MOOD.KITCHEN]: 'Modalità cucina',
  [AVATAR_MOOD.FITNESS]: 'Modalità allenamento',
  [AVATAR_MOOD.DEFAULT]: 'Kentu',
});

/**
 * @param {{
 *   isProcessing?: boolean,
 *   isTyping?: boolean,
 *   isTranscribing?: boolean,
 *   hasActiveMealTray?: boolean,
 *   hasActiveWorkoutDraft?: boolean,
 *   isTrainingDay?: boolean,
 * }} flags
 * @returns {'default' | 'coding' | 'kitchen' | 'fitness'}
 */
export function resolveAvatarMood(flags = {}) {
  if (
    flags.isProcessing === true
    || flags.isTyping === true
    || flags.isTranscribing === true
  ) {
    return AVATAR_MOOD.CODING;
  }
  if (flags.hasActiveMealTray === true) {
    return AVATAR_MOOD.KITCHEN;
  }
  if (flags.hasActiveWorkoutDraft === true || flags.isTrainingDay === true) {
    return AVATAR_MOOD.FITNESS;
  }
  return AVATAR_MOOD.DEFAULT;
}

/**
 * @param {'default' | 'coding' | 'kitchen' | 'fitness'} mood
 * @param {string} [defaultSrc]
 * @returns {string}
 */
export function getAvatarSrcForMood(mood, defaultSrc = '/avatar.png') {
  const key = String(mood || AVATAR_MOOD.DEFAULT);
  if (key !== AVATAR_MOOD.DEFAULT && AVATAR_MOOD_SRC[key]) {
    return AVATAR_MOOD_SRC[key];
  }
  const fallback = String(defaultSrc || '/avatar.png').trim();
  return fallback || '/avatar.png';
}

/**
 * True se nel thread c'è un vassoio pasti attivo (bozza, proposal card, WIP, meal builder).
 * @param {{
 *   chatHistory?: Array<object>,
 *   wipMealItems?: Array<object>,
 *   mealBuilder?: object | null,
 * }} opts
 */
export function detectActiveMealTray({
  chatHistory = [],
  wipMealItems = [],
  mealBuilder = null,
} = {}) {
  if (mealBuilder && typeof mealBuilder === 'object' && mealBuilder.active === true) return true;
  if (Array.isArray(wipMealItems) && wipMealItems.length > 0) return true;
  return (chatHistory || []).some((m) => {
    if (!m || m.isTyping || m.draftResolved) return false;
    if (m.mealDraft && !m.draftResolved) return true;
    if (Array.isArray(m.mealProposals) && m.mealProposals.length > 0) {
      // Proposal ancora non salvata (niente loaded ids, o card ancora interattiva).
      const loaded = Array.isArray(m.mealProposalsLoadedIds) ? m.mealProposalsLoadedIds : [];
      if (loaded.length === 0) return true;
      const allLoaded = m.mealProposals.every((p) => loaded.includes(String(p?.id || '')));
      return !allLoaded;
    }
    if (m.mealProposal) return true;
    if (m.mealDraftInteractiveEdit === true) return true;
    return false;
  });
}
