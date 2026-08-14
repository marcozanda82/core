/** Placeholder fisso per l'input chat (niente testo predittivo nel campo). */
export const CHAT_INPUT_PLACEHOLDER = 'Scrivi un comando o un pasto...';

/**
 * @param {{ isNotesMode?: boolean, hasImages?: boolean }} [opts]
 * @returns {string}
 */
export function resolveChatInputPlaceholder(opts = {}) {
  if (opts.isNotesMode) return 'Nota di sviluppo…';
  if (opts.hasImages) return 'Commento immagini…';
  return CHAT_INPUT_PLACEHOLDER;
}
