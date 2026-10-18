/**
 * Sceglie tra output AI validato e fallback deterministico.
 * Nessun output AI non validato diventa edizione pubblicabile.
 */

import { buildFallbackWrittenEdition } from './buildFallbackWrittenEdition.js';
import {
  FOCUS_PROSE_SOURCE,
} from './focusWrittenEdition.v1.js';
import {
  parseFocusWrittenEditionJson,
  validateFocusWrittenEdition,
} from './validateFocusWrittenEdition.js';

/**
 * @param {{
 *   selection: object,
 *   rawAiOutput?: string|object|null,
 * }} input
 */
export function resolveWrittenEdition(input) {
  const selection = input?.selection;
  if (!selection) throw new Error('resolveWrittenEdition: selection richiesta');

  const raw = input.rawAiOutput;
  if (raw != null && raw !== '') {
    const parsed = parseFocusWrittenEditionJson(raw);
    if (!parsed.ok) {
      const fallback = buildFallbackWrittenEdition({ selection });
      return {
        written: fallback,
        proseSource: FOCUS_PROSE_SOURCE.fallback,
        usedFallback: true,
        aiValidation: { ok: false, errors: [parsed.error || 'parse_failed'] },
      };
    }
    const validation = validateFocusWrittenEdition(parsed.value, { selection });
    if (validation.ok) {
      const written = {
        ...parsed.value,
        proseSource: FOCUS_PROSE_SOURCE.validated_ai,
        kind: 'FocusWrittenEdition',
      };
      return {
        written,
        proseSource: FOCUS_PROSE_SOURCE.validated_ai,
        usedFallback: false,
        aiValidation: validation,
      };
    }
    const fallback = buildFallbackWrittenEdition({ selection });
    return {
      written: fallback,
      proseSource: FOCUS_PROSE_SOURCE.fallback,
      usedFallback: true,
      aiValidation: validation,
    };
  }

  const fallback = buildFallbackWrittenEdition({ selection });
  return {
    written: fallback,
    proseSource: FOCUS_PROSE_SOURCE.fallback,
    usedFallback: true,
    aiValidation: null,
  };
}
