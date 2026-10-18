/**
 * Laboratorio JSON Kentu Focus (P5.2 / P5.2.2) — builder puro.
 * Nessuna I/O / Gemini / publish / scrittura Firebase.
 */

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { alignBriefsToCalendarWindow } from '../aggregate/calendarWindow.js';
import { evaluateDomainCoverage } from '../aggregate/focusCoverageConfig.js';
import { buildHistoryWindows } from '../aggregate/historyWindows.js';
import {
  FOCUS_PROVENANCE,
  FOCUS_TIMEZONE_MODE,
  focusMetric,
  missingMetric,
} from '../contracts/focusDossier.v1.js';
import {
  addCalendarDays,
  assertPublicationFollowsAnalysis,
  isIsoDateString,
} from '../normalize/focusDateUtils.js';
import {
  collectDayLogForNutritionWithQuality,
  normalizeFoodEvents,
  normalizeMealType,
  resolveFoodClockHour,
} from '../normalize/normalizeFoodEvents.js';
import { normalizeSleepNight } from '../normalize/normalizeSleepNight.js';
import {
  durationToMinutes,
  isCardioWorkout,
  normalizeWorkoutEvents,
} from '../normalize/normalizeWorkoutEvents.js';
import {
  dedupeById,
  finiteNumber,
  getLogArray,
  getManualNodesArray,
} from '../normalize/logUtils.js';
import { isUnresolvedMealDraftItem } from '../../../utils/mealDraftStatus.js';
import {
  resolveFocusBodyWeight,
  resolveFocusTargetsFromProfile,
} from '../server/reader/resolveFocusProfileData.js';
import {
  resolveFocusLabEditionDates,
  resolveFocusLabHistoryGate,
} from './focusLabHistoryGate.js';

export const FOCUS_LAB_DOSSIER_SCHEMA = 'kentu.focusLabDossier.v1';
export { resolveFocusLabEditionDates, resolveFocusLabHistoryGate } from './focusLabHistoryGate.js';

const FOOD_TYPES = new Set(['food', 'recipe']);

const STRENGTH_HINTS = [
  'pesi',
  'strength',
  'forza',
  'gym',
  'palestra',
  'squat',
  'deadlift',
  'panca',
  'bench',
  'hypertrophy',
  'ipertrof',
  'powerlift',
  'bodybuild',
  'manubri',
  'bilanciere',
];

/**
 * @param {object|null|undefined} fullHistory
 * @param {string} date
 */
export function getTrackerDayNode(fullHistory, date) {
  if (!fullHistory || typeof fullHistory !== 'object' || !isIsoDateString(date)) {
    return null;
  }
  const key = `trackerStorico_${date}`;
  const node = fullHistory[key];
  return node && typeof node === 'object' ? node : null;
}

/**
 * Nodo analisi simulato puro: solo log clonato. Nessun merge silenzioso da fullHistory.
 * @param {string} analysisDate
 * @param {unknown[]} simulatedLog
 */
export function buildSimulatedAnalysisDayNode(analysisDate, simulatedLog) {
  if (!isIsoDateString(analysisDate)) {
    throw new Error('buildSimulatedAnalysisDayNode: analysisDate ISO richiesta');
  }
  const log = Array.isArray(simulatedLog)
    ? JSON.parse(JSON.stringify(simulatedLog))
    : [];
  return {
    data: analysisDate,
    log,
    mealTimes: {},
    manualNodes: [],
    _labOrigin: {
      log: 'simulatedLog',
      mealTimes: 'excluded_not_from_simulatedLog',
      manualNodes: 'excluded_not_from_simulatedLog',
      note: 'Nodo laboratorio puro: nessun campo ereditato silenziosamente dal diario reale.',
    },
  };
}

/** @param {object} entry */
function workoutLabel(entry) {
  return String(entry?.name || entry?.desc || entry?.workoutType || entry?.label || '').trim();
}

/**
 * @param {object} entry
 */
export function classifyActivityHint(entry) {
  const label = workoutLabel(entry).toLowerCase();
  if (isCardioWorkout(entry)) {
    return {
      kind: 'aerobic_hint',
      provenance: FOCUS_PROVENANCE.calculated,
      source: 'isCardioWorkout',
    };
  }
  if (label && STRENGTH_HINTS.some((h) => label.includes(h))) {
    return {
      kind: 'strength_hint',
      provenance: FOCUS_PROVENANCE.calculated,
      source: 'strength_label_hints',
    };
  }
  if (label) {
    return {
      kind: 'other_labeled',
      provenance: FOCUS_PROVENANCE.calculated,
      source: 'label_present_no_forced_class',
    };
  }
  return {
    kind: 'unclassified',
    provenance: FOCUS_PROVENANCE.missing,
    source: 'no_label',
  };
}

/** @param {object} item */
function resolveFoodGrams(item) {
  const g = finiteNumber(
    item?.grams ?? item?.g ?? item?.qty ?? item?.quantity ?? item?.amount ?? item?.portionG,
  );
  if (g == null || g <= 0) return missingMetric('g');
  return focusMetric(Math.round(g * 10) / 10, {
    unit: 'g',
    provenance: FOCUS_PROVENANCE.recorded,
  });
}

/**
 * @param {object} item
 * @param {{ includeNotes: boolean, includeFreeTextLabels: boolean, opaqueIndex: number }} opts
 */
function buildFoodItemExport(item, opts) {
  const rawName = String(item?.name || item?.desc || item?.label || item?.foodDbKey || '').trim() || null;
  const kcal = finiteNumber(item?.kcal ?? item?.cal);
  const proteinG = finiteNumber(item?.prot ?? item?.proteinG ?? item?.protein);
  const carbG = finiteNumber(item?.carb ?? item?.carbs ?? item?.carbG);
  const fatG = finiteNumber(item?.fat ?? item?.fatTotal ?? item?.fatG);
  const fiberG = finiteNumber(item?.fibre ?? item?.fiber ?? item?.fiberG);

  const macros = {
    kcal: kcal == null
      ? missingMetric('kcal')
      : focusMetric(Math.round(kcal * 10) / 10, {
        unit: 'kcal',
        provenance: FOCUS_PROVENANCE.recorded,
      }),
    proteinG: proteinG == null
      ? missingMetric('g')
      : focusMetric(Math.round(proteinG * 10) / 10, {
        unit: 'g',
        provenance: FOCUS_PROVENANCE.recorded,
      }),
    carbG: carbG == null
      ? missingMetric('g')
      : focusMetric(Math.round(carbG * 10) / 10, {
        unit: 'g',
        provenance: FOCUS_PROVENANCE.recorded,
      }),
    fatG: fatG == null
      ? missingMetric('g')
      : focusMetric(Math.round(fatG * 10) / 10, {
        unit: 'g',
        provenance: FOCUS_PROVENANCE.recorded,
      }),
    fiberG: fiberG == null
      ? missingMetric('g')
      : focusMetric(Math.round(fiberG * 10) / 10, {
        unit: 'g',
        provenance: FOCUS_PROVENANCE.recorded,
      }),
  };

  const out = {
    name: opts.includeFreeTextLabels ? rawName : null,
    labelRedacted: !opts.includeFreeTextLabels,
    opaqueId: `food_item_${opts.opaqueIndex}`,
    grams: resolveFoodGrams(item),
    macros,
    provenance: FOCUS_PROVENANCE.recorded,
  };

  if (opts.includeNotes) {
    const note = String(item?.note || item?.notes || '').trim();
    out.notes = note || null;
  }

  return out;
}

/**
 * @param {object|null} analysisDayNode
 * @param {{ includeNotes: boolean, includeFreeTextLabels: boolean, targets?: object|null }} opts
 */
function buildAnalysisDayNutrition(analysisDayNode, opts) {
  const food = normalizeFoodEvents(analysisDayNode, { targets: opts.targets || undefined });
  const mealTimes = analysisDayNode?.mealTimes && typeof analysisDayNode.mealTimes === 'object'
    ? analysisDayNode.mealTimes
    : {};
  const { dayLog } = collectDayLogForNutritionWithQuality(analysisDayNode);
  const foods = dayLog.filter(
    (e) => e && FOOD_TYPES.has(e.type) && !isUnresolvedMealDraftItem(e),
  );

  /** @type {Map<string, object[]>} */
  const byMeal = new Map();
  for (const item of foods) {
    const mealType = normalizeMealType(item.mealType);
    if (!byMeal.has(mealType)) byMeal.set(mealType, []);
    byMeal.get(mealType).push(item);
  }

  let opaqueIndex = 0;
  const mealOrder = ['colazione', 'pranzo', 'snack', 'cena', 'unknown'];
  const meals = mealOrder
    .filter((k) => byMeal.has(k))
    .map((mealType) => {
      const items = byMeal.get(mealType) || [];
      let clockHour = null;
      for (const item of items) {
        const h = resolveFoodClockHour(item, mealTimes);
        if (h != null) clockHour = clockHour == null ? h : Math.max(clockHour, h);
      }
      return {
        mealType,
        clockHour: clockHour == null
          ? missingMetric('hour_decimal')
          : focusMetric(clockHour, {
            unit: 'hour_decimal',
            provenance: FOCUS_PROVENANCE.recorded,
          }),
        items: items.map((item) => {
          opaqueIndex += 1;
          return buildFoodItemExport(item, {
            includeNotes: opts.includeNotes,
            includeFreeTextLabels: opts.includeFreeTextLabels,
            opaqueIndex,
          });
        }),
      };
    });

  const fieldsMissing = [];
  if (!food.hasFood) fieldsMissing.push('nutrition.meals');
  if (food.nutrition?.totals?.kcal?.provenance === 'missing') fieldsMissing.push('nutrition.totals');

  return {
    food,
    block: {
      totals: food.nutrition.totals,
      meals,
      quality: food.quality || null,
    },
    fieldsMissing,
  };
}

/**
 * @param {object|null} analysisDayNode
 * @param {{ includeNotes: boolean, includeFreeTextLabels: boolean }} opts
 */
function buildAnalysisDayActivity(analysisDayNode, opts) {
  const activityPack = normalizeWorkoutEvents(analysisDayNode);
  const fromLog = getLogArray(analysisDayNode).filter((e) => e && e.type === 'workout');
  const fromManual = getManualNodesArray(analysisDayNode).filter((e) => e && e.type === 'workout');
  const merged = dedupeById([...fromLog, ...fromManual], (e) => e.id);

  const workouts = merged.map((entry, idx) => {
    const durationMin = durationToMinutes(entry.duration ?? entry.durationMin ?? entry.minutes);
    const kcalBurn = finiteNumber(entry.kcal ?? entry.cal ?? entry.kcalBurn);
    const hint = classifyActivityHint(entry);
    const rawLabel = workoutLabel(entry) || null;
    const hasFreeText = Boolean(
      String(entry?.note || entry?.notes || entry?.desc || '').trim() || rawLabel,
    );
    const out = {
      label: opts.includeFreeTextLabels ? rawLabel : null,
      labelRedacted: !opts.includeFreeTextLabels,
      opaqueId: `workout_${idx + 1}`,
      durationMin: durationMin == null
        ? missingMetric('min')
        : focusMetric(Math.round(durationMin * 10) / 10, {
          unit: 'min',
          provenance: FOCUS_PROVENANCE.recorded,
        }),
      kcal: kcalBurn == null
        ? missingMetric('kcal')
        : focusMetric(kcalBurn, {
          unit: 'kcal',
          provenance: FOCUS_PROVENANCE.recorded,
        }),
      isCardioHint: focusMetric(isCardioWorkout(entry), {
        provenance: FOCUS_PROVENANCE.calculated,
        source: 'isCardioWorkout',
      }),
      activityKindHint: {
        value: hint.kind,
        provenance: hint.provenance,
        source: hint.source,
      },
      detailLevel: entry?.exercises || entry?.sets || entry?.structured === true
        ? 'structured'
        : (hasFreeText ? 'note' : 'none'),
    };
    if (opts.includeNotes) {
      const note = String(entry?.note || entry?.notes || entry?.desc || '').trim();
      out.notes = note || null;
    }
    return out;
  });

  const fieldsMissing = [];
  if (!activityPack.hasWorkout) fieldsMissing.push('activity.workouts');

  return {
    activityPack,
    block: {
      workouts,
      cardioMinutesTotal: activityPack.activity.cardioMinutes,
      workoutKcalTotal: activityPack.activity.workoutKcalTotal,
    },
    fieldsMissing,
  };
}

/**
 * @param {object} sleepPack
 * @param {object|null} publicationDayNode
 */
function buildLastCompletedNight(sleepPack, publicationDayNode) {
  const sleep = sleepPack.sleep || {};
  const entry = sleepPack.sleepSelection?.entry || null;
  const awakeningsRaw = entry
    ? finiteNumber(
      entry.awakenings
        ?? entry.wakeCount
        ?? entry.interruptions
        ?? entry.awakeCount,
    )
    : null;

  let stagesNote = 'missing';
  if (sleep.deepMin?.source === 'form_placeholder_60_suppressed'
    || sleep.remMin?.source === 'form_placeholder_60_suppressed') {
    stagesNote = 'placeholder_stages_detected';
  } else if (
    sleep.deepMin?.provenance === FOCUS_PROVENANCE.recorded
    || sleep.remMin?.provenance === FOCUS_PROVENANCE.recorded
  ) {
    stagesNote = 'ok';
  }

  return {
    storageDate: sleep.storageDate || null,
    mainNightStatus: sleep.mainNightStatus || sleepPack.sleepSelection?.status || null,
    mainNightReason: sleep.mainNightReason || sleepPack.sleepSelection?.reason || null,
    hours: sleep.hours || missingMetric('h'),
    bedtime: sleep.bedtime || missingMetric('hour_decimal'),
    wakeTime: sleep.wakeTime || missingMetric('hour_decimal'),
    qualityStars: sleep.qualityStars || missingMetric(),
    deepMin: sleep.deepMin || missingMetric('min'),
    remMin: sleep.remMin || missingMetric('min'),
    awakenings: awakeningsRaw == null
      ? missingMetric()
      : focusMetric(awakeningsRaw, {
        provenance: FOCUS_PROVENANCE.recorded,
        source: 'sleep_entry',
      }),
    regularity: missingMetric(),
    stagesNote,
    provenanceSummary: {
      sleepAvailable: Boolean(sleepPack.sleepAvailable),
      sleepPartial: Boolean(sleepPack.sleepPartial),
      sleepAmbiguous: Boolean(sleepPack.sleepAmbiguous),
      nodePresent: Boolean(publicationDayNode),
    },
  };
}

/** @param {object} brief */
function buildDaySummaryFromBrief(brief) {
  return {
    date: brief.date,
    nutrition: {
      kcal: brief.nutrition?.kcal ?? null,
      proteinG: brief.nutrition?.proteinG ?? null,
      carbG: brief.nutrition?.carbG ?? null,
      fatG: brief.nutrition?.fatG ?? null,
      fiberG: brief.nutrition?.fiberG ?? null,
      hasFood: Boolean(brief.hasFood),
    },
    sleep: {
      hours: brief.sleep?.hours ?? null,
      available: Boolean(brief.sleepAvailable),
    },
    activity: {
      workoutCount: brief.activity?.workoutCount ?? 0,
      workoutKcal: brief.activity?.workoutKcal ?? null,
      cardioMinutes: brief.activity?.cardioMinutes ?? null,
      hasWorkout: Boolean(brief.hasWorkout),
    },
    coverage: {
      hasFood: Boolean(brief.hasFood),
      hasWorkout: Boolean(brief.hasWorkout),
      sleepAvailable: Boolean(brief.sleepAvailable),
      calendarPlaceholder: Boolean(brief.calendarPlaceholder),
    },
  };
}

/**
 * @param {Map<string, object|null>} dayNodes
 * @param {string} analysisDate
 * @param {number} windowDays
 * @param {boolean} includeFreeTextLabels
 */
function buildWorkoutHistoryWindow(dayNodes, analysisDate, windowDays, includeFreeTextLabels) {
  /** @type {object[]} */
  const history = [];
  const n = Math.max(1, windowDays);
  for (let i = n - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const node = dayNodes.get(date) ?? null;
    if (!node) continue;
    const fromLog = getLogArray(node).filter((e) => e && e.type === 'workout');
    const fromManual = getManualNodesArray(node).filter((e) => e && e.type === 'workout');
    const merged = dedupeById([...fromLog, ...fromManual], (e) => e.id);
    for (const entry of merged) {
      const durationMin = durationToMinutes(entry.duration ?? entry.durationMin ?? entry.minutes);
      const kcalBurn = finiteNumber(entry.kcal ?? entry.cal ?? entry.kcalBurn);
      const hint = classifyActivityHint(entry);
      const rawLabel = workoutLabel(entry) || null;
      history.push({
        date,
        label: includeFreeTextLabels ? rawLabel : null,
        labelRedacted: !includeFreeTextLabels,
        durationMin: durationMin == null
          ? missingMetric('min')
          : focusMetric(Math.round(durationMin * 10) / 10, {
            unit: 'min',
            provenance: FOCUS_PROVENANCE.recorded,
          }),
        kcal: kcalBurn == null
          ? missingMetric('kcal')
          : focusMetric(kcalBurn, {
            unit: 'kcal',
            provenance: FOCUS_PROVENANCE.recorded,
          }),
        activityKindHint: {
          value: hint.kind,
          provenance: hint.provenance,
          source: hint.source,
          note: 'hint_only_not_forced_classification',
        },
        isCardioHint: focusMetric(isCardioWorkout(entry), {
          provenance: FOCUS_PROVENANCE.calculated,
          source: 'isCardioWorkout',
        }),
      });
    }
  }
  return history;
}

/**
 * @param {object[]|Record<string, object>|null|undefined} bodyMetrics
 * @param {object|null|undefined} profile
 * @param {string} analysisDate
 */
function buildBodyMeasurements(bodyMetrics, profile, analysisDate) {
  const weightPack = resolveFocusBodyWeight(bodyMetrics, profile, analysisDate);
  /** @type {object[]} */
  const measurements = [];

  const list = Array.isArray(bodyMetrics)
    ? bodyMetrics
    : (bodyMetrics && typeof bodyMetrics === 'object' ? Object.values(bodyMetrics) : []);

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const date = typeof entry.date === 'string'
      ? entry.date.trim().slice(0, 10)
      : (typeof entry.effectiveDate === 'string' ? entry.effectiveDate.trim().slice(0, 10) : null);
    if (!date || !isIsoDateString(date) || date > analysisDate) continue;
    const weight = finiteNumber(entry.weight ?? entry.weightKg);
    if (weight == null || !(weight > 0)) continue;

    const bodyFat = finiteNumber(entry.bodyFat ?? entry.bodyFatPct ?? entry.bf);
    const leanMass = finiteNumber(entry.leanMass ?? entry.muscleMassKg);

    measurements.push({
      date,
      weightKg: focusMetric(weight, {
        unit: 'kg',
        provenance: FOCUS_PROVENANCE.recorded,
        measuredOn: date,
      }),
      bodyFatPct: bodyFat != null && bodyFat > 0 && bodyFat < 80
        ? focusMetric(bodyFat, {
          unit: '%',
          provenance: FOCUS_PROVENANCE.recorded,
          measuredOn: date,
        })
        : missingMetric('%'),
      leanMassKg: leanMass != null && leanMass > 0
        ? focusMetric(leanMass, {
          unit: 'kg',
          provenance: FOCUS_PROVENANCE.recorded,
          measuredOn: date,
        })
        : missingMetric('kg'),
      source: 'body_metrics',
      attribution: date === analysisDate
        ? 'recorded_on_analysis_date'
        : 'last_available_on_or_before',
    });
  }

  measurements.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return {
    measurements,
    profileWeightNotAttributed: {
      value: weightPack.profileWeightKg,
      note: weightPack.attribution === 'profile_weight_not_attributed_to_day'
        ? 'profile.weight undated'
        : null,
      provenance: weightPack.profileWeightKg != null
        ? FOCUS_PROVENANCE.recorded
        : FOCUS_PROVENANCE.missing,
    },
    resolvedForAnalysis: {
      bodyWeightKg: weightPack.bodyWeightKg == null
        ? missingMetric('kg')
        : focusMetric(weightPack.bodyWeightKg, {
          unit: 'kg',
          provenance: weightPack.provenance,
          measuredOn: weightPack.bodyMeasuredOn,
          source: weightPack.source || undefined,
        }),
      attribution: weightPack.attribution,
      conflict: weightPack.conflict,
    },
  };
}

/**
 * @param {{
 *   analysisDate?: string,
 *   publicationDate?: string,
 *   editionMode?: 'focus_standard'|'simulated_scenario',
 *   referenceDate?: string,
 *   dataOrigin?: 'real'|'simulated',
 *   fullHistory?: object|null,
 *   dayNodes?: Map<string, object|null>|Record<string, object|null>|null,
 *   profileTargets?: object|null,
 *   userProfile?: object|null,
 *   bodyMetrics?: object[]|Record<string, object>|null,
 *   exportTier?: 'essential'|'deep',
 *   consent?: { includePersonalNotes?: boolean, includeSensitiveFields?: boolean },
 *   simulatedLog?: unknown[]|null,
 *   historyLoadState?: string,
 *   allowPartialHistory?: boolean,
 *   exportedAt?: string,
 *   historyDays?: number,
 *   simulationUiActive?: boolean,
 * }} input
 */
export function buildFocusLabDossier(input) {
  const dataOrigin = input.dataOrigin === 'simulated' ? 'simulated' : 'real';
  const editionMode = input.editionMode
    || (dataOrigin === 'simulated' ? 'simulated_scenario' : 'focus_standard');

  let analysisDate = input.analysisDate;
  let publicationDate = input.publicationDate;
  let analyzedDayRole = 'calendar_yesterday_vs_publication';
  let referenceDate = input.referenceDate || publicationDate || null;

  if (!analysisDate || !publicationDate) {
    const dates = resolveFocusLabEditionDates({
      editionMode,
      referenceDate: input.referenceDate || input.publicationDate,
      simulatedAnalysisDate: dataOrigin === 'simulated'
        ? (input.analysisDate || input.referenceDate)
        : undefined,
    });
    analysisDate = dates.analysisDate;
    publicationDate = dates.publicationDate;
    analyzedDayRole = dates.analyzedDayRole;
    referenceDate = dates.referenceDate;
  } else {
    analyzedDayRole = editionMode === 'simulated_scenario'
      ? 'simulated_tracker_day'
      : 'calendar_yesterday_vs_publication';
  }

  if (!isIsoDateString(analysisDate) || !isIsoDateString(publicationDate)) {
    throw new Error('buildFocusLabDossier: analysisDate/publicationDate devono essere YYYY-MM-DD');
  }
  const relation = assertPublicationFollowsAnalysis(analysisDate, publicationDate);
  if (!relation.ok) {
    throw new Error(`buildFocusLabDossier: ${relation.reason}`);
  }

  const historyGate = resolveFocusLabHistoryGate({
    historyLoadState: input.historyLoadState,
    allowPartialHistory: input.allowPartialHistory,
    requestedHistoryDays: input.historyDays || 60,
  });
  if (!historyGate.canExport) {
    const err = new Error(
      `buildFocusLabDossier: export bloccato (${historyGate.blockReason}). `
      + 'Attendi il bootstrap dello storico oppure abilita export parziale esplicito.',
    );
    err.code = historyGate.blockReason;
    err.historyGate = historyGate;
    throw err;
  }

  const exportTier = input.exportTier === 'deep' ? 'deep' : 'essential';
  const consent = {
    includePersonalNotes: Boolean(input.consent?.includePersonalNotes),
    includeSensitiveFields: Boolean(input.consent?.includeSensitiveFields),
  };
  const includeNotes = exportTier === 'deep'
    && consent.includePersonalNotes
    && consent.includeSensitiveFields;
  const includeFreeTextLabels = exportTier === 'deep' && consent.includeSensitiveFields;

  const historyDays = historyGate.effectiveHistoryDays;

  /** @type {Map<string, object|null>} */
  const dayNodes = new Map();
  if (input.dayNodes instanceof Map) {
    for (const [k, v] of input.dayNodes.entries()) dayNodes.set(k, v);
  } else if (input.dayNodes && typeof input.dayNodes === 'object') {
    for (const [k, v] of Object.entries(input.dayNodes)) dayNodes.set(k, v);
  } else if (input.fullHistory && typeof input.fullHistory === 'object') {
    const required = [];
    for (let i = historyDays - 1; i >= 0; i -= 1) {
      required.push(addCalendarDays(analysisDate, -i));
    }
    required.push(publicationDate);
    for (const date of required) {
      dayNodes.set(date, getTrackerDayNode(input.fullHistory, date));
    }
  }

  /** @type {object|null} */
  let analysisDayNode = dayNodes.get(analysisDate) ?? null;
  /** @type {object|null} */
  let analysisDayOriginMeta = {
    mode: 'real_fullHistory',
    log: 'fullHistory',
    mealTimes: 'fullHistory_if_present',
    manualNodes: 'fullHistory_if_present',
  };

  if (dataOrigin === 'simulated') {
    if (!Array.isArray(input.simulatedLog)) {
      throw new Error('buildFocusLabDossier: dataOrigin=simulated richiede simulatedLog array');
    }
    analysisDayNode = buildSimulatedAnalysisDayNode(analysisDate, input.simulatedLog);
    dayNodes.set(analysisDate, analysisDayNode);
    analysisDayOriginMeta = {
      mode: 'simulated_pure_log',
      log: 'simulatedLog',
      mealTimes: 'excluded_not_from_simulatedLog',
      manualNodes: 'excluded_not_from_simulatedLog',
      inheritedFromRealNode: false,
    };
  }

  const publicationDayNode = dayNodes.get(publicationDate) ?? null;

  const profileTargetsRoot = input.profileTargets && typeof input.profileTargets === 'object'
    ? {
      ...input.profileTargets,
      profile: input.profileTargets.profile || input.userProfile || null,
    }
    : {
      profile: input.userProfile || null,
      targets: null,
    };

  const targetsPack = resolveFocusTargetsFromProfile(profileTargetsRoot, analysisDate);
  const profileForWeight = input.userProfile || profileTargetsRoot.profile || null;
  const bodyPack = buildBodyMeasurements(input.bodyMetrics, profileForWeight, analysisDate);
  const weightResolved = resolveFocusBodyWeight(
    input.bodyMetrics,
    profileForWeight,
    analysisDate,
  );

  const nutritionPack = buildAnalysisDayNutrition(analysisDayNode, {
    includeNotes,
    includeFreeTextLabels,
    targets: targetsPack.targets,
  });
  const activityPack = buildAnalysisDayActivity(analysisDayNode, {
    includeNotes,
    includeFreeTextLabels,
  });
  const lastMealHour = nutritionPack.food.nutrition.lastMealHour?.value ?? null;
  const sleepPack = normalizeSleepNight(publicationDayNode, {
    publicationDate,
    lastMealHour,
  });

  /** @type {object[]} */
  const historyDayBriefs = [];
  let presentDays = 0;
  let missingDays = 0;
  for (let i = historyDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const sleepStorageDate = addCalendarDays(date, 1);
    const dayNode = dayNodes.get(date) ?? null;
    const sleepNode = dayNodes.get(sleepStorageDate) ?? null;
    if (dayNode) presentDays += 1;
    else missingDays += 1;
    historyDayBriefs.push(
      buildDayBrief({
        date,
        dayNode,
        sleepNode,
        sleepStorageDate,
        bodyWeightKg: date === analysisDate ? weightResolved.bodyWeightKg : null,
      }),
    );
  }

  const historyWindows = historyDays >= 7
    ? buildHistoryWindows(historyDayBriefs, { analysisDate })
    : {
      d7: { nutrition: {}, sleep: {}, activity: {}, coverage: null },
      d30: { nutrition: {}, sleep: {}, activity: {}, coverage: null },
      comparisons: null,
    };

  const d10Window = Math.min(10, historyDays);
  const aligned10 = alignBriefsToCalendarWindow(historyDayBriefs, analysisDate, d10Window);
  const d10Briefs = aligned10.briefs;
  const d10FoodDays = d10Briefs.filter((b) => b.hasFood);
  const d10SleepDays = d10Briefs.filter((b) => b.sleepAvailable && b.sleep?.hours != null);
  const d10WorkoutDays = d10Briefs.filter((b) => b.hasWorkout);
  const avgOrNull = (values) => {
    const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (nums.length === 0) return null;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
  };
  const d10CardioTotal = d10WorkoutDays.reduce((acc, b) => {
    const m = b.activity?.cardioMinutes;
    return acc + (typeof m === 'number' && Number.isFinite(m) ? m : 0);
  }, 0);
  const d10Thresholds = { thinBelowRatio: 0.5, minDaysForTrend: 4 };
  const d10Agg = {
    nutrition: {
      avgKcal: avgOrNull(d10FoodDays.map((b) => b.nutrition.kcal)),
      avgProteinG: avgOrNull(d10FoodDays.map((b) => b.nutrition.proteinG)),
      avgCarbG: avgOrNull(d10FoodDays.map((b) => b.nutrition.carbG)),
      avgFatG: avgOrNull(d10FoodDays.map((b) => b.nutrition.fatG)),
      avgFiberG: avgOrNull(d10FoodDays.map((b) => b.nutrition.fiberG)),
      daysWithFood: d10FoodDays.length,
      daysWithoutFoodLog: d10Briefs.length - d10FoodDays.length,
    },
    sleep: {
      avgHours: avgOrNull(d10SleepDays.map((b) => b.sleep.hours)),
      nightsLogged: d10SleepDays.length,
      nightsMissing: d10Briefs.length - d10SleepDays.length,
    },
    activity: {
      workoutDaysLogged: d10WorkoutDays.length,
      cardioMinutesTotal: Math.round(d10CardioTotal * 10) / 10,
    },
    coverage: {
      nutrition: evaluateDomainCoverage(d10FoodDays.length, d10Window, d10Thresholds),
      sleep: evaluateDomainCoverage(d10SleepDays.length, d10Window, d10Thresholds),
      activity: evaluateDomainCoverage(d10WorkoutDays.length, d10Window, d10Thresholds),
    },
  };

  const d10Daily = d10Briefs.map(buildDaySummaryFromBrief);
  const d30Allowed = historyGate.d30CompleteAllowed && historyDays >= 30;
  const d30WorkoutHistory = d30Allowed
    ? buildWorkoutHistoryWindow(dayNodes, analysisDate, 30, includeFreeTextLabels)
    : [];

  const fieldsMissing = [
    ...nutritionPack.fieldsMissing,
    ...activityPack.fieldsMissing,
  ];
  if (!sleepPack.sleepAvailable) fieldsMissing.push('lastCompletedNight.hours');

  let firstMealHourValue = null;
  for (const meal of nutritionPack.block.meals) {
    const h = meal.clockHour?.value;
    if (typeof h === 'number' && Number.isFinite(h)) {
      if (firstMealHourValue == null || h < firstMealHourValue) firstMealHourValue = h;
    }
  }
  const firstMealHour = firstMealHourValue == null
    ? missingMetric('hour_decimal')
    : focusMetric(firstMealHourValue, {
      unit: 'hour_decimal',
      provenance: FOCUS_PROVENANCE.calculated,
      source: 'buildFocusLabDossier',
    });

  const dossier = {
    schema: FOCUS_LAB_DOSSIER_SCHEMA,
    exportedAt: input.exportedAt || new Date().toISOString(),
    timezoneMode: FOCUS_TIMEZONE_MODE,
    exportTier,
    consent: {
      includePersonalNotes: consent.includePersonalNotes,
      includeSensitiveFields: consent.includeSensitiveFields,
      notesIncluded: includeNotes,
      freeTextLabelsIncluded: includeFreeTextLabels,
    },
    dataSource: {
      primary: dataOrigin === 'simulated' ? 'simulatedLog' : 'in_memory_fullHistory',
      dataOrigin,
      editionMode,
      analyzedDayRole,
      referenceDate,
      analysisDayFields: analysisDayOriginMeta,
      containsSimulatedData: dataOrigin === 'simulated',
      simulationUiActive: Boolean(input.simulationUiActive),
      rtdbReads: 0,
      firebaseWrites: 0,
      gemini: false,
      publish: false,
      note: dataOrigin === 'simulated'
        ? 'Scenario simulato esplicito: log analisi da simulatedLog puro; storia/sonno da fullHistory reale se presenti.'
        : 'Diario reale: nessuna applicazione di simulatedLog.',
    },
    historyCompleteness: {
      loadState: historyGate.historyLoadState,
      exportScope: historyGate.exportScope,
      d30PresentedAsComplete: d30Allowed,
      allowPartialHistory: Boolean(input.allowPartialHistory),
      blockReason: historyGate.blockReason,
      note: historyGate.note,
      emptyDaysMean: 'no_registration_or_absent_node_not_bootstrap_pending',
    },
    window: {
      analysisDate,
      publicationDate,
      d7: historyDays >= 7 ? {
        from: addCalendarDays(analysisDate, -6),
        to: analysisDate,
      } : null,
      d10: {
        from: addCalendarDays(analysisDate, -(d10Window - 1)),
        to: analysisDate,
      },
      d30: d30Allowed ? {
        from: addCalendarDays(analysisDate, -29),
        to: analysisDate,
      } : null,
    },
    analysisDay: {
      date: analysisDate,
      role: analyzedDayRole,
      nutrition: nutritionPack.block,
      activity: activityPack.block,
      timing: {
        firstMealHour,
        lastMealHour: nutritionPack.food.nutrition.lastMealHour || missingMetric('hour_decimal'),
        dinnerSleepBufferH: sleepPack.sleep.dinnerSleepBufferH || missingMetric('h'),
      },
      coverage: {
        hasFood: nutritionPack.food.hasFood,
        hasWorkout: activityPack.activityPack.hasWorkout,
        fieldsMissing,
      },
    },
    lastCompletedNight: buildLastCompletedNight(sleepPack, publicationDayNode),
    history: {
      d7: historyDays >= 7 ? {
        nutritionTrend: historyWindows.d7.nutrition,
        sleepTrend: historyWindows.d7.sleep,
        activityTrend: historyWindows.d7.activity,
        cardioTrend: {
          cardioMinutesTotal: historyWindows.d7.activity?.cardioMinutesTotal ?? null,
        },
        timing: historyWindows.comparisons?.d7_vs_prev7 || null,
        coverage: historyWindows.d7.coverage,
      } : null,
      d10: {
        aggregates: {
          nutrition: d10Agg.nutrition,
          sleep: d10Agg.sleep,
          activity: d10Agg.activity,
          cardio: { cardioMinutesTotal: d10Agg.activity?.cardioMinutesTotal ?? null },
        },
        dailySummaries: d10Daily,
        coverage: {
          ...d10Agg.coverage,
          windowDays: d10Window,
          briefsReceived: aligned10.briefsReceived,
          calendarDays: d10Window,
        },
      },
      d30: d30Allowed ? {
        available: true,
        presentedAsComplete: true,
        nutritionTrend: historyWindows.d30.nutrition,
        sleepTrend: historyWindows.d30.sleep,
        activityTrend: historyWindows.d30.activity,
        coverage: historyWindows.d30.coverage,
        workoutHistory: d30WorkoutHistory,
        habitSignals: {
          note: 'hint_based_activity_kinds_only',
          strengthHintCount: d30WorkoutHistory.filter((w) => w.activityKindHint?.value === 'strength_hint').length,
          aerobicHintCount: d30WorkoutHistory.filter((w) => w.activityKindHint?.value === 'aerobic_hint').length,
          otherLabeledCount: d30WorkoutHistory.filter((w) => w.activityKindHint?.value === 'other_labeled').length,
          unclassifiedCount: d30WorkoutHistory.filter((w) => w.activityKindHint?.value === 'unclassified').length,
        },
      } : {
        available: false,
        presentedAsComplete: false,
        reason: historyGate.blockReason || 'history_incomplete_for_d30',
        workoutHistory: [],
        note: 'd30 omesso: non presentare questa sezione come storia completa.',
      },
    },
    body: bodyPack,
    goals: {
      targets: {
        kcal: targetsPack.targets?.kcal != null
          ? focusMetric(targetsPack.targets.kcal, {
            unit: 'kcal',
            provenance: targetsPack.provenance.kcal,
            source: targetsPack.provenance.kcalSource || undefined,
            measuredOn: targetsPack.provenance.referenceDate,
          })
          : missingMetric('kcal'),
        proteinG: targetsPack.targets?.proteinG != null
          ? focusMetric(targetsPack.targets.proteinG, {
            unit: 'g',
            provenance: targetsPack.provenance.proteinG,
            source: targetsPack.provenance.proteinSource || undefined,
            measuredOn: targetsPack.provenance.referenceDate,
          })
          : missingMetric('g'),
        referenceDate: targetsPack.provenance.referenceDate,
        source: targetsPack.provenance.kcalSource || targetsPack.provenance.proteinSource || 'missing',
        conflict: targetsPack.provenance.conflict,
      },
      diagnostics: targetsPack.diagnostics || null,
    },
    evidenceQuality: {
      reads: {
        trackerDays: presentDays,
        profile: profileTargetsRoot.targets || profileTargetsRoot.profile ? 1 : 0,
        bodyMetrics: Array.isArray(input.bodyMetrics)
          ? input.bodyMetrics.length
          : (input.bodyMetrics ? Object.keys(input.bodyMetrics).length : 0),
      },
      presentDays,
      missingDays,
      historyDaysRequested: input.historyDays || 60,
      historyDaysEffective: historyDays,
      domains: {
        nutrition: d30Allowed ? (historyWindows.d30.coverage?.nutrition || null) : null,
        sleep: d30Allowed ? (historyWindows.d30.coverage?.sleep || null) : null,
        activity: d30Allowed ? (historyWindows.d30.coverage?.activity || null) : null,
        body: d30Allowed ? (historyWindows.d30.coverage?.body || null) : null,
      },
      reliabilityNotes: [
        'Non inventare nutrienti, risvegli, fasi sonno o misure assenti.',
        'bodyFat/leanMass solo se presenti e positivi in body_metrics (nessuna deduzione).',
        'activityKindHint è euristico, non etichetta utente.',
        'Stage sonno 60/60 senza indizio wearable → provenance missing.',
        'missingDays = nodi assenti nello storico in memoria, non prova di bootstrap incompleto.',
      ],
    },
    exclusions: {
      uid: true,
      email: true,
      tokens: true,
      firebasePaths: true,
      rawDiaryDump: true,
    },
  };

  return dossier;
}

/**
 * @param {object} dossier
 */
export function summarizeFocusLabDossier(dossier) {
  const meals = Array.isArray(dossier?.analysisDay?.nutrition?.meals)
    ? dossier.analysisDay.nutrition.meals
    : [];
  const itemCount = meals.reduce((acc, m) => acc + (m.items?.length || 0), 0);
  const workouts = dossier?.analysisDay?.activity?.workouts || [];
  const d10 = dossier?.history?.d10?.dailySummaries || [];
  return {
    schema: dossier?.schema || null,
    exportTier: dossier?.exportTier || null,
    notesIncluded: Boolean(dossier?.consent?.notesIncluded),
    freeTextLabelsIncluded: Boolean(dossier?.consent?.freeTextLabelsIncluded),
    analysisDate: dossier?.window?.analysisDate || null,
    publicationDate: dossier?.window?.publicationDate || null,
    analyzedDayRole: dossier?.analysisDay?.role || null,
    dataOrigin: dossier?.dataSource?.dataOrigin || null,
    dataSource: dossier?.dataSource?.primary || null,
    containsSimulatedData: Boolean(dossier?.dataSource?.containsSimulatedData),
    historyLoadState: dossier?.historyCompleteness?.loadState || null,
    exportScope: dossier?.historyCompleteness?.exportScope || null,
    d30Complete: Boolean(dossier?.history?.d30?.presentedAsComplete),
    mealsLogged: meals.length,
    foodItems: itemCount,
    workoutsLogged: workouts.length,
    sleepAvailable: Boolean(dossier?.lastCompletedNight?.provenanceSummary?.sleepAvailable),
    sleepStagesNote: dossier?.lastCompletedNight?.stagesNote || null,
    d10DaysWithFood: d10.filter((d) => d.nutrition?.hasFood).length,
    d10DaysWithSleep: d10.filter((d) => d.sleep?.available).length,
    d30WorkoutEvents: dossier?.history?.d30?.workoutHistory?.length || 0,
    bodyMeasurements: dossier?.body?.measurements?.length || 0,
    targetsReferenceDate: dossier?.goals?.targets?.referenceDate || null,
    presentDays: dossier?.evidenceQuality?.presentDays ?? 0,
    missingDays: dossier?.evidenceQuality?.missingDays ?? 0,
    fieldsMissing: dossier?.analysisDay?.coverage?.fieldsMissing || [],
  };
}
