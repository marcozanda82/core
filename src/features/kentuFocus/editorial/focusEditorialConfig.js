/**
 * Config ranking / cap / cooldown — deterministico e regolabile.
 */

export const FOCUS_EDITORIAL_SCHEMA_VERSION = '1.0.0';

export const FOCUS_EDITORIAL_CAPS = Object.freeze({
  goodNewsMax: 2,
  featuresMax: 2,
  concernsMax: 2,
});

export const FOCUS_RANK_WEIGHTS = Object.freeze({
  evidence: 0.25,
  relevance: 0.2,
  novelty: 0.15,
  persistence: 0.1,
  actionability: 0.1,
  coherence: 0.1,
  narrative: 0.05,
  antiRepeat: 0.05,
});

export const FOCUS_SCORE_THRESHOLDS = Object.freeze({
  leadMin: 55,
  goodNewsMin: 40,
  featureMin: 35,
  concernMin: 45,
  coachMin: 50,
  /** Delta kcal medio considerato “significativo” su finestre comparabili */
  significantKcalDelta: 150,
  significantProteinDeltaG: 12,
  significantSleepDeltaH: 0.4,
  proteinNearTargetRatio: 0.9,
  proteinHitTargetRatio: 0.97,
  sleepAdequateHours: 7,
  sleepShortHours: 6,
  dinnerBufferShortH: 2.5,
  habitEmergingDistinctDays: 3,
  habitEmergingOccasions: 4,
});

export const FOCUS_MEMORY_RULES = Object.freeze({
  leadTopicCooldownEditions: 3,
  coachTemplateCooldownDays: 6,
  maxRecentLeads: 8,
  maxRecentTopics: 24,
  maxRecentCoach: 8,
  maxOpenExperiments: 1,
});
