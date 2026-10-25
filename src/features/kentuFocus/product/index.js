export {
  FOCUS_PRODUCT_DEMO_BANNER,
  FOCUS_PRODUCT_PERIODS,
  resolveFocusProductPeriod,
} from './focusProductPeriods.js';

export {
  buildFocusDemoTrackerHistory,
  buildFocusDemoProfilePack,
} from './buildFocusDemoTrackerHistory.js';

export { buildFocusProductEdition } from './buildFocusProductEdition.js';
export { mapWrittenEditionToCoachSections } from './mapWrittenEditionToCoachSections.js';
export { buildFocusProductChartSeries } from './buildFocusProductChartSeries.js';
export {
  buildFocusPrivateNutritionView,
  buildPrivateNutritionComment,
} from './buildFocusPrivateNutritionView.js';
export {
  stashFocusDiaryForUser,
  peekFocusDiaryForUser,
  clearFocusDiaryForUser,
  __resetFocusDiaryHandoffForTests,
} from './focusDiaryHandoff.js';

export {
  FOCUS_PAGE_MODE,
  resolveFocusPageSession,
  loadFocusPageDemoEditionIfAllowed,
  formatNutritionVerifyLabel,
  handoffBelongsToUser,
  buildRealSleepNightBrief,
} from './buildFocusPageSession.js';

export {
  buildFocusWellnessPillars,
  buildDeterministicWellnessCoach,
} from './buildFocusWellnessPillars.js';

export {
  buildFocusAiCoachDossier,
  canBuildFocusAiCoachDossier,
} from './buildFocusAiCoachDossier.js';

export {
  FOCUS_AI_COACH_MODEL,
  FOCUS_AI_COACH_RESPONSE_SCHEMA,
  buildFocusAiCoachSystemInstruction,
  buildFocusAiCoachUserPrompt,
} from './buildFocusAiCoachPrompt.js';

export { validateFocusAiCoachResponse } from './validateFocusAiCoachResponse.js';

export {
  requestFocusAiCoachAnalysis,
  previewFocusAiCoachPayload,
  loadFocusAiAnalysisFromStore,
  listFocusAiAnalysisHistory,
  focusAiCoachCacheKey,
  peekFocusAiCoachMemory,
  __resetFocusAiCoachMemoryForTests,
} from './requestFocusAiCoachAnalysis.js';

export {
  createMemoryFocusAiAnalysisStore,
  createFirebaseFocusAiAnalysisStore,
  getDefaultMemoryFocusAiAnalysisStore,
  __resetFocusAiAnalysisPersistenceForTests,
  FOCUS_AI_ANALYSIS_RETENTION_DAYS,
  FOCUS_AI_ANALYSIS_ALLOWED_PERIODS,
  focusAiAnalysisBasePath,
  focusAiAnalysisIndexPath,
  buildFocusAiAnalysisRecord,
  markFocusAiAnalysisFreshness,
  isFocusAiAnalysisExpired,
  assertFocusAiAnalysisWritable,
} from './focusAiAnalysisPersistence.js';

export { buildFocusCompassSignalsForDossier } from './buildFocusCompassSignalsForDossier.js';

export { buildFocusKentuEnginesForDossier } from './buildFocusKentuEnginesForDossier.js';

export { buildFocusKentuDeepLinks } from './focusKentuDeepLinks.js';

export { normalizeFocusEditorialAnalysis } from './normalizeFocusEditorialAnalysis.js';

export { buildFocusEditorialMockAnalysis } from './buildFocusEditorialMockAnalysis.js';

export {
  loadFocusAuthenticatedDiary,
  extractFocusUserTargetsFromProfile,
  countFocusTrackerDayNodes,
  focusLocalIsoDate,
} from './loadFocusAuthenticatedDiary.js';

export { buildFocusEditorialReadingContext } from './buildFocusEditorialReadingContext.js';

export {
  resolveFocusEvidenceRefs,
  normalizeEvidenceRefId,
  coerceEvidenceRefArray,
} from './resolveFocusEvidenceRefs.js';

export {
  FOCUS_SAVED_EVIDENCE_HARNESS_REVISION_ID,
  FOCUS_SAVED_EVIDENCE_HARNESS_GENERATED_AT,
  buildFocusSavedEvidenceHarnessAnalysis,
  buildFocusSavedEvidenceHarnessAnalysisFirebaseMap,
} from './focusSavedEvidenceHarnessFixture.js';

export {
  FOCUS_AI_COACH_TIMEOUT_MS,
  resolveFocusAiCoachTimeoutMs,
} from './focusAiCoachTimeouts.js';

export { buildFocusMealRedistributionManeuver } from './buildFocusMealRedistributionManeuver.js';

export { buildFocusWeeklyHabitCompass } from './buildFocusWeeklyHabitCompass.js';
