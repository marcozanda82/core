/** Placeholder fisso per l'input chat (niente testo predittivo nel campo). */
export const CHAT_INPUT_PLACEHOLDER = 'Scrivi un comando o un pasto...';

/** Placeholder durante McDrive / inserimento guidato AI. */
export const CHAT_INPUT_PLACEHOLDER_GUIDED = 'Es: 50g di pane, 1 mela...';

/**
 * @param {{ isNotesMode?: boolean, hasImages?: boolean, isAiGuidedMode?: boolean }} [opts]
 * @returns {string}
 */
export function resolveChatInputPlaceholder(opts = {}) {
  if (opts.isNotesMode) return 'Nota di sviluppo…';
  if (opts.hasImages) return 'Commento immagini…';
  if (opts.isAiGuidedMode) return CHAT_INPUT_PLACEHOLDER_GUIDED;
  return CHAT_INPUT_PLACEHOLDER;
}
