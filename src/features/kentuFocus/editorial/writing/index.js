/** Entry scrittura editoriale I4-D1 (puri, no Gemini live). */

export {
  FOCUS_ARTICLE_ROLES,
  FOCUS_PROSE_SOURCE,
  FOCUS_SEMANTIC_VALIDATION_LIMITS,
  FOCUS_WRITING_LIMITS,
  FOCUS_WRITTEN_SCHEMA_VERSION,
  createFocusWrittenArticle,
  createFocusWrittenEdition,
} from './focusWrittenEdition.v1.js';

export { buildFocusEditorialPrompt } from './buildFocusEditorialPrompt.js';
export { buildFallbackWrittenEdition } from './buildFallbackWrittenEdition.js';
export {
  parseFocusWrittenEditionJson,
  validateFocusWrittenEdition,
  buildAuthorizedCatalog,
} from './validateFocusWrittenEdition.js';
export { resolveWrittenEdition } from './resolveWrittenEdition.js';
export { applyWrittenEditionToRevision } from './applyWrittenEditionToRevision.js';
export { generateFocusWrittenEdition } from './generateFocusWrittenEdition.js';
export {
  materializeAuthorizedProse,
  materializeAuthorizedProseText,
  materializeWrittenEdition,
} from './materializeAuthorizedProse.js';
export { sanitizeUntrustedText, sanitizeStringList } from './sanitizeBriefText.js';
