/** Placeholder fisso per l'input chat (niente testo predittivo nel campo). */
export const CHAT_INPUT_PLACEHOLDER = 'Scrivi un comando o un pasto...';

/** Placeholder durante McDrive / inserimento guidato AI (fallback statico). */
export const CHAT_INPUT_PLACEHOLDER_GUIDED = 'Es: 100g di pasta, pomodoro, 1 mela...';

/** Esempi rotanti per l'input McDrive (ghost typing). */
export const MCDRIVE_INPUT_PLACEHOLDERS = Object.freeze([
  'Es: 100g di pasta, pomodoro, 1 mela...',
  'Es: Un cappuccino e un cornetto vuoto',
  'Es: 150g petto di pollo e insalata',
]);

export const MCDRIVE_PLACEHOLDER_ROTATE_MS = 3500;

/**
 * @param {{ isNotesMode?: boolean, hasImages?: boolean, isAiGuidedMode?: boolean, guidedPlaceholder?: string|null }} [opts]
 * @returns {string}
 */
export function resolveChatInputPlaceholder(opts = {}) {
  if (opts.isNotesMode) return 'Nota di sviluppo…';
  if (opts.hasImages) return 'Commento immagini…';
  if (opts.isAiGuidedMode) {
    const guided = String(opts.guidedPlaceholder || '').trim();
    return guided || CHAT_INPUT_PLACEHOLDER_GUIDED;
  }
  return CHAT_INPUT_PLACEHOLDER;
}
