/**
 * Menu di ripresa post-abort: evita vicoli ciechi senza chip.
 * Intent allineati a resolvePredictiveIntentAction / CommandTerminal.
 */
export const CHAT_FALLBACK_QUICK_REPLIES = Object.freeze([
  Object.freeze({
    label: '🍔 Inserimento Guidato',
    intent: 'START_MCDRIVE_WIZARD',
    variant: 'primary',
  }),
  Object.freeze({
    label: '🔍 Pasto Libero',
    intent: 'FREE_MEAL_LISTEN',
  }),
  Object.freeze({
    label: '📊 Riepilogo',
    intent: 'ASK_DAY_REVIEW',
  }),
]);

/**
 * @returns {Array<{ label: string, intent: string, variant?: string }>}
 */
export function getChatFallbackQuickReplies() {
  return CHAT_FALLBACK_QUICK_REPLIES.map((chip) => ({ ...chip }));
}
