/**
 * Escape hatch FAB Hold-to-Talk → CommandTerminal (allineato alla chat).
 * Puro / iniettabile: i checker intent restano nel caller (evita import pesanti in node:test).
 */

/**
 * @param {string} text
 * @param {{
 *   foodItemCount?: number|null,
 *   isWorkout?: (text: string) => boolean,
 *   isAdvice?: (text: string) => boolean,
 * }} [options]
 * @returns {boolean} true → inviare a sendMessage(chat), non forzare McDrive
 */
export function shouldRouteFabVoiceToChat(text, options = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  if (typeof options.isWorkout === 'function' && options.isWorkout(trimmed)) return true;
  if (typeof options.isAdvice === 'function' && options.isAdvice(trimmed)) return true;
  if (options.foodItemCount === 0) return true;
  return false;
}
