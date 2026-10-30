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
  buildFocusFoodQualityBlock,
  resolveFoodItemClassification,
  resolveOffCatalogStatus,
  readNovaGroup,
  FOOD_QUALITY_PROVENANCE,
  OFF_CATALOG_STATUS,
} from './buildFocusFoodQualityBlock.js';

export {
  assessNova4CritiqueProfile,
  isDarkChocolateGe70,
  readNutriScoreGrade,
} from './assessNova4CritiqueProfile.js';

export {
  FOCUS_OFF_WAIT_TIMEOUT_MS,
  focusWindowNeedsOffCatalog,
  waitFocusOffCatalogForAnalysis,
} from './waitFocusOffCatalogForAnalysis.js';

export {
  buildFocusDeterministicSignals,
  hoursBetweenClock,
} from './buildFocusDeterministicSignals.js';

export {
  assessEnergyIrregularity,
  collectRecentEnergyIntakes,
  computeEnergyIntakeVariability,
  formatEnergyExcursionSubtitle,
  populationStdev,
  ENERGY_IRREGULAR_PCT,
  ENERGY_IRREGULAR_MIN_OUTLIER_DAYS,
  ENERGY_IRREGULAR_WINDOW_DAYS,
} from './focusEnergyVariability.js';

export {
  FOCUS_AREAS,
  FOCUS_AREAS_BY_ID,
  resolveFocusArea,
} from './focusAreas.js';

export {
  buildFocusSubstitutionCandidates,
  inferUseOccasion,
  resolveUseOccasion,
  formatFoodNameForMidSentence,
  pickPreferredSubstitution,
  occasionFromCatalogCategories,
  occasionFromWhitelist,
  FOCUS_USE_OCCASION,
  FOCUS_GENERIC_OCCASION_LABEL,
} from './buildFocusSubstitutionCandidates.js';

export {
  FOCUS_AI_COACH_MODEL,
  FOCUS_AI_COACH_RESPONSE_SCHEMA,
  buildFocusAiCoachSystemInstruction,
  buildFocusAiCoachUserPrompt,
} from './buildFocusAiCoachPrompt.js';

export { validateFocusAiCoachResponse } from './validateFocusAiCoachResponse.js';

export {
  FOCUS_AI_COACH_BANNED_USER_PHRASES,
  FOCUS_AI_COACH_BANNED_SUMMARY_PHRASES,
  findBannedPhrasesInAnalysis,
  formatBannedPhraseRetryHint,
} from './focusAiCoachBannedUserPhrases.js';

export {
  requestFocusAiCoachAnalysis,
  previewFocusAiCoachPayload,
  loadFocusAiAnalysisFromStore,
  listFocusAiAnalysisHistory,
  focusAiCoachCacheKey,
  peekFocusAiCoachMemory,
  __resetFocusAiCoachMemoryForTests,
  __getFocusAiCoachRetryCountsForTests,
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
