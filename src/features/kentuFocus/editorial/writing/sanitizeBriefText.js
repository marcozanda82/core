/**
 * Sanitizza stringhe utente/libere prima dell’ingresso in FocusAiBrief / prompt.
 * Strategia primaria: ridurre e strutturare, non solo “vincere” con il system prompt.
 */

const MAX_SEED = 160;
const MAX_CAUTION = 120;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * @param {unknown} raw
 * @param {number} [max]
 */
export function sanitizeUntrustedText(raw, max = MAX_SEED) {
  if (raw == null) return '';
  let s = String(raw)
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Neutralizza fence / ruoli tipici di injection
  s = s
    .replace(/<<<\s*DATI_UTENTE[^>]*>>>/gi, '[redacted-fence]')
    .replace(/```+/g, "'")
    .replace(/\b(system|assistant|developer)\s*:/gi, '[role]:')
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '[redacted-instr]')
    .replace(/ignora\s+(tutte\s+le\s+)?istruzioni(\s+precedenti)?/gi, '[redacted-instr]');
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s;
}

/**
 * @param {unknown[]} list
 * @param {number} [maxItem]
 * @param {number} [maxItems]
 */
export function sanitizeStringList(list, maxItem = MAX_CAUTION, maxItems = 8) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => typeof x === 'string' || typeof x === 'number')
    .map((x) => sanitizeUntrustedText(x, maxItem))
    .filter(Boolean)
    .slice(0, maxItems);
}
