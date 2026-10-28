/**
 * FocusDossier v1 — contratto puro (Node / Cloud Functions safe).
 * Nessuna dipendenza React, Firebase client o browser.
 */

export const FOCUS_DOSSIER_SCHEMA_VERSION = '1.0.0';

/** @typedef {'recorded'|'calculated'|'derived'|'estimated'|'missing'|'ambiguous'} FocusProvenance */
/** @typedef {'high'|'medium'|'low'} FocusCertainty */

export const FOCUS_PROVENANCE = Object.freeze({
  recorded: 'recorded',
  /** @deprecated Preferire `derived` per bedtime = wake−hours. */
  calculated: 'calculated',
  /** Valore ricavato da altri campi recorded (es. bedtime = wakeTime − hours). */
  derived: 'derived',
  estimated: 'estimated',
  missing: 'missing',
  /** Origine non ricostruibile (micronutrienti / legacy); non usare per bedtime nuovi. */
  ambiguous: 'ambiguous',
});

export const FOCUS_CERTAINTY = Object.freeze({
  high: 'high',
  medium: 'medium',
  low: 'low',
});

export const FOCUS_TIMEZONE_MODE = 'device_local_offset';

export const FOCUS_MEAL_TYPES = Object.freeze([
  'colazione',
  'pranzo',
  'cena',
  'snack',
  'unknown',
]);

/**
 * Metrica tipizzata Focus.
 * @param {unknown} value
 * @param {{
 *   unit?: string,
 *   provenance: FocusProvenance,
 *   certainty?: FocusCertainty,
 *   source?: string,
 *   measuredOn?: string|null,
 * }} opts
 */
export function focusMetric(value, opts) {
  const provenance = opts?.provenance;
  if (!FOCUS_PROVENANCE[provenance]) {
    throw new Error(`focusMetric: provenance non valida: ${provenance}`);
  }
  const metric = {
    value: value === undefined ? null : value,
    provenance,
  };
  if (opts.unit != null) metric.unit = opts.unit;
  if (opts.certainty != null) metric.certainty = opts.certainty;
  if (opts.source != null) metric.source = opts.source;
  if (opts.measuredOn !== undefined) metric.measuredOn = opts.measuredOn;
  return metric;
}

/** @param {string} [unit] */
export function missingMetric(unit) {
  return focusMetric(null, {
    unit,
    provenance: FOCUS_PROVENANCE.missing,
  });
}

/** Copertura per dominio (nessun ratio unico per giudizi). */
export function emptyDomainCoverage(windowDays = 0) {
  return {
    daysWithData: 0,
    windowDays,
    coverageRatio: 0,
    sufficiency: 'none',
    trendComparable: false,
  };
}

/** Copertura storica vuota multi-dominio (d7/d30/d90). */
export function emptyHistoryCoverageSlot(windowDays = 0) {
  return {
    nutrition: emptyDomainCoverage(windowDays),
    sleep: emptyDomainCoverage(windowDays),
    activity: emptyDomainCoverage(windowDays),
    body: emptyDomainCoverage(windowDays),
  };
}

/** Finestra storica vuota nel dossier. */
export function emptyHistoryWindow({ available = true, windowDays = 0 } = {}) {
  const window = {
    nutrition: {},
    sleep: {},
    activity: {},
    body: {},
    sampleSize: 0,
    coverage: emptyHistoryCoverageSlot(windowDays),
    coverageRatio: 0,
  };
  if (available === false) window.available = false;
  return window;
}

/**
 * Guscio coverage + flags di default.
 */
export function createEmptyCoverage() {
  return {
    analysisDayHasFood: false,
    analysisDayHasWorkout: false,
    sleepAvailable: false,
    bodyMetricsInWindow: false,
    history: {
      d7: emptyHistoryCoverageSlot(7),
      d30: emptyHistoryCoverageSlot(30),
      d90: emptyHistoryCoverageSlot(90),
    },
  };
}

export function createEmptyFlags() {
  return {
    incompleteDay: false,
    sleepPartial: false,
    historyThin30: true,
    historyThin90: true,
    /** Qualità dati Focus (non giudizio salute) */
    nutritionDedupeRemovedDuplicates: false,
    nutritionTotalsAffectedByDedupe: false,
  };
}

/**
 * Struttura base FocusDossier (history/signals vuoti — riempiti in step successivi).
 * @param {{
 *   analysisDate: string,
 *   publicationDate: string,
 *   uid?: string,
 *   generatedAt?: string,
 *   engines?: Array<{ id: string, role: string }>,
 * }} metaInput
 */
export function createEmptyFocusDossier(metaInput) {
  const {
    analysisDate,
    publicationDate,
    uid = '',
    generatedAt = new Date(0).toISOString(),
    engines = [],
  } = metaInput || {};

  return {
    schemaVersion: FOCUS_DOSSIER_SCHEMA_VERSION,
    meta: {
      analysisDate,
      publicationDate,
      timezoneMode: FOCUS_TIMEZONE_MODE,
      generatedAt,
      uid,
      engines,
      coverage: createEmptyCoverage(),
      flags: createEmptyFlags(),
    },
    day: {
      nutrition: {
        totals: {
          kcal: missingMetric('kcal'),
          proteinG: missingMetric('g'),
          carbG: missingMetric('g'),
          fatG: missingMetric('g'),
          fiberG: missingMetric('g'),
        },
        targets: {
          kcal: missingMetric(),
          proteinG: missingMetric(),
        },
        balance: {
          kcalDeltaVsTarget: missingMetric(),
        },
        meals: [],
        foodSummary: {
          uniqueNames: 0,
          itemsLogged: 0,
          unclassifiedCount: 0,
        },
        lastMealHour: missingMetric(),
      },
      activity: {
        workouts: [],
        workoutKcalTotal: missingMetric(),
        cardioMinutes: missingMetric(),
      },
      stimuli: {
        waterMl: missingMetric('ml'),
        stimulantEvents: focusMetric(0, { provenance: FOCUS_PROVENANCE.recorded }),
        alcoholEvents: focusMetric(0, { provenance: FOCUS_PROVENANCE.recorded }),
        pureAlcoholG: missingMetric('g'),
      },
      body: {
        weightKg: missingMetric('kg'),
      },
    },
    sleep: {
      linkedToPublicationDate: true,
      storageDate: publicationDate,
      hours: missingMetric('h'),
      wakeTime: missingMetric('hour_decimal'),
      bedtime: missingMetric('hour_decimal'),
      qualityStars: missingMetric(),
      qualityBand: missingMetric(),
      deepMin: missingMetric('min'),
      remMin: missingMetric('min'),
      dinnerSleepBufferH: missingMetric('h'),
      napsIncludedInHours: false,
    },
    history: {
      d7: emptyHistoryWindow({ windowDays: 7 }),
      d30: emptyHistoryWindow({ windowDays: 30 }),
      d90: emptyHistoryWindow({ available: false, windowDays: 90 }),
      comparisons: {
        d7_vs_prev7: { available: false, requiredCalendarDays: 14 },
        d30_vs_prev30: { available: false, requiredCalendarDays: 60 },
      },
    },
    habits: {
      foodFrequency: {
        items: [],
        unclassifiedOccasions: 0,
        totalOccasions: 0,
        uniqueIdentities: 0,
        windowDays: 0,
        firstDate: null,
        lastDate: null,
      },
    },
    signals: {
      facts: [],
      trends: [],
      estimates: [],
      hypotheses: [],
    },
  };
}
