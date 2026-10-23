/** Entry scrittura editoriale I4-D1 (puri, no Gemini live). */

export {
  FOCUS_ARTICLE_ROLES,
  FOCUS_PROSE_SOURCE,
  FOCUS_SEMANTIC_VALIDATION_LIMITS,
  FOCUS_WRITING_LIMITS,
  FOCUS_WRITTEN_SCHEMA_VERSION,
  bodyMaxCharsForRole,
  createFocusWrittenArticle,
  createFocusWrittenEdition,
} from './focusWrittenEdition.v1.js';

export { buildFocusEditorialPrompt } from './buildFocusEditorialPrompt.js';
export { buildFallbackWrittenEdition } from './buildFallbackWrittenEdition.js';
export {
  parseFocusWrittenEditionJson,
  validateFocusWrittenEdition,
  buildAuthorizedCatalog,
  selectRequiredCautionsForArticle,
  isRequiredCautionSatisfied,
  isMandatoryContextSatisfied,
  classifyArticleCautionLayers,
  detectForbiddenClaims,
  evaluateProteinDeltaDeficitGuard,
} from './validateFocusWrittenEdition.js';
export {
  FOCUS_AGGREGATE_BOILERPLATE_LIMITATIONS,
  selectContextualLimitations,
} from './focusCautionContract.js';
export {
  attachStorySpine,
  buildCenterpieceStorySpine,
  validateStorySpinePreserved,
} from './focusStorySpine.js';
export {
  detectMetricUnitMismatches,
  formatAuthorizedMetricDisplay,
} from './focusMetricUnitGuard.js';
export { resolveWrittenEdition } from './resolveWrittenEdition.js';
export { applyWrittenEditionToRevision } from './applyWrittenEditionToRevision.js';
export { generateFocusWrittenEdition } from './generateFocusWrittenEdition.js';
export {
  materializeAuthorizedProse,
  materializeAuthorizedProseText,
  materializeWrittenEdition,
} from './materializeAuthorizedProse.js';
export { sanitizeUntrustedText, sanitizeStringList } from './sanitizeBriefText.js';
export {
  FOCUS_GEMINI_PREVIEW_SCHEMA,
  FOCUS_GEMINI_PROMPT_FIELDS_DOC,
  assessFocusGeminiPreviewEligibility,
  listSelectedArticlesForPreview,
  formatFocusWrittenEditionText,
  runFocusGeminiPreview,
  validateFocusGeminiPreviewRaw,
  buildFocusGeminiReviewJson,
  buildFocusGeminiReviewClipboardPayload,
} from './runFocusGeminiPreview.js';
export {
  createAskAiFocusGeminiProvider,
  FOCUS_ASKAI_DEFAULT_MODEL,
} from './createAskAiFocusGeminiProvider.js';
