/**
 * Config ranking / cap / cooldown — deterministico e regolabile.
 */

export const FOCUS_EDITORIAL_SCHEMA_VERSION = '1.0.0';

export const FOCUS_EDITORIAL_CAPS = Object.freeze({
  goodNewsMax: 2,
  featuresMax: 2,
  concernsMax: 2,
  /** Rubrica continuità (log ordinari) — non riempie good/feature. */
  continuityMax: 2,
});

/**
 * Classi di salienza editoriale (non categorie di dominio).
 * - significant_pattern: storia interpretativa / pattern
 * - routine_confirmation: conferma quotidiana (es. proteine ok)
 * - routine_log: semplice presenza di registrazione
 */
export const FOCUS_STORY_CLASS = Object.freeze({
  significant_pattern: 'significant_pattern',
  routine_confirmation: 'routine_confirmation',
  routine_log: 'routine_log',
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
  /**
   * Sopra questa soglia: oltre il riferimento (neutro, non un problema).
   * ~108%+ non è «in linea»; 150,8/127 ≈ 1,19 ricade qui.
   */
  proteinAboveTargetRatio: 1.08,
  sleepAdequateHours: 7,
  sleepShortHours: 6,
  dinnerBufferShortH: 2.5,
  habitEmergingDistinctDays: 3,
  habitEmergingOccasions: 4,
  /** Frequenza consolidata su finestra lunga → non “emergente”, non approfondimento automatico. */
  habitConsolidatedDistinctDays: 10,
  habitConsolidatedMinWindowDays: 21,
  habitConsolidatedMinDensity: 0.4,
  /** Giorni con sessioni strength in d30 per continuità forza. */
  strengthContinuityMinDaysD30: 6,
});

export const FOCUS_MEMORY_RULES = Object.freeze({
  leadTopicCooldownEditions: 3,
  coachTemplateCooldownDays: 6,
  maxRecentLeads: 8,
  maxRecentTopics: 24,
  maxRecentCoach: 8,
  maxOpenExperiments: 1,
  /** Cooldown famiglia routine sonno (giorni calendario). */
  sleepRoutineFamilyCooldownDays: 7,
  /** Override cooldown se fingerprint evidenza cambia in modo rilevante. */
  sleepRoutineSignificantChangeBypassesCooldown: true,
});
