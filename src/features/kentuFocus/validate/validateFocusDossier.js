/**
 * Validazione strutturale minima FocusDossier v1 (+ coverage per dominio I2).
 */

import {
  FOCUS_DOSSIER_SCHEMA_VERSION,
  FOCUS_PROVENANCE,
  FOCUS_TIMEZONE_MODE,
} from '../contracts/focusDossier.v1.js';
import {
  assertPublicationFollowsAnalysis,
  isIsoDateString,
} from '../normalize/focusDateUtils.js';

const PROVENANCE_SET = new Set(Object.values(FOCUS_PROVENANCE));
const SUFFICIENCY_SET = new Set(['none', 'empty_window', 'insufficient', 'ok']);

/** @param {unknown} metric */
function isMetricShape(metric) {
  if (!metric || typeof metric !== 'object') return false;
  if (!('value' in metric)) return false;
  if (!PROVENANCE_SET.has(metric.provenance)) return false;
  return true;
}

/** @param {unknown} domain */
function isDomainCoverageShape(domain) {
  if (!domain || typeof domain !== 'object') return false;
  if (typeof domain.daysWithData !== 'number') return false;
  if (typeof domain.windowDays !== 'number') return false;
  if (typeof domain.coverageRatio !== 'number') return false;
  if (!SUFFICIENCY_SET.has(domain.sufficiency)) return false;
  if (typeof domain.trendComparable !== 'boolean') return false;
  return true;
}

/**
 * @param {unknown} dossier
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateFocusDossier(dossier) {
  const errors = [];

  if (!dossier || typeof dossier !== 'object') {
    return { ok: false, errors: ['dossier_not_object'] };
  }

  if (dossier.schemaVersion !== FOCUS_DOSSIER_SCHEMA_VERSION) {
    errors.push(`schemaVersion_expected_${FOCUS_DOSSIER_SCHEMA_VERSION}`);
  }

  const meta = dossier.meta;
  if (!meta || typeof meta !== 'object') {
    errors.push('meta_missing');
  } else {
    if (!isIsoDateString(meta.analysisDate)) errors.push('meta.analysisDate_invalid');
    if (!isIsoDateString(meta.publicationDate)) errors.push('meta.publicationDate_invalid');
    if (meta.timezoneMode !== FOCUS_TIMEZONE_MODE) {
      errors.push('meta.timezoneMode_unexpected');
    }
    if (typeof meta.generatedAt !== 'string' || !meta.generatedAt) {
      errors.push('meta.generatedAt_missing');
    }
    if (!meta.coverage || typeof meta.coverage !== 'object') {
      errors.push('meta.coverage_missing');
    } else {
      for (const key of [
        'analysisDayHasFood',
        'analysisDayHasWorkout',
        'sleepAvailable',
        'bodyMetricsInWindow',
      ]) {
        if (typeof meta.coverage[key] !== 'boolean') {
          errors.push(`meta.coverage.${key}_not_boolean`);
        }
      }
      for (const win of ['d7', 'd30', 'd90']) {
        const slot = meta.coverage.history?.[win];
        if (!slot) {
          errors.push(`meta.coverage.history.${win}_missing`);
          continue;
        }
        for (const domain of ['nutrition', 'sleep', 'activity', 'body']) {
          if (!isDomainCoverageShape(slot[domain])) {
            errors.push(`meta.coverage.history.${win}.${domain}_invalid`);
          }
        }
      }
    }
    if (!meta.flags || typeof meta.flags !== 'object') {
      errors.push('meta.flags_missing');
    }
    if (isIsoDateString(meta.analysisDate) && isIsoDateString(meta.publicationDate)) {
      const rel = assertPublicationFollowsAnalysis(meta.analysisDate, meta.publicationDate);
      if (!rel.ok) errors.push(`meta.date_relation_${rel.reason}`);
    }
  }

  if (!dossier.day || typeof dossier.day !== 'object') {
    errors.push('day_missing');
  } else {
    const totals = dossier.day.nutrition?.totals;
    if (!totals) errors.push('day.nutrition.totals_missing');
    else {
      for (const k of ['kcal', 'proteinG', 'carbG', 'fatG', 'fiberG']) {
        if (!isMetricShape(totals[k])) errors.push(`day.nutrition.totals.${k}_invalid`);
      }
    }
    if (!Array.isArray(dossier.day.nutrition?.meals)) {
      errors.push('day.nutrition.meals_not_array');
    }
    if (!Array.isArray(dossier.day.activity?.workouts)) {
      errors.push('day.activity.workouts_not_array');
    }
    if (!isMetricShape(dossier.day.stimuli?.waterMl)) {
      errors.push('day.stimuli.waterMl_invalid');
    }
  }

  if (!dossier.sleep || typeof dossier.sleep !== 'object') {
    errors.push('sleep_missing');
  } else {
    for (const k of ['hours', 'wakeTime', 'bedtime', 'deepMin', 'remMin']) {
      if (!isMetricShape(dossier.sleep[k])) errors.push(`sleep.${k}_invalid`);
    }
    if (dossier.sleep.storageDate !== meta?.publicationDate) {
      errors.push('sleep.storageDate_mismatch');
    }
  }

  if (!dossier.history || typeof dossier.history !== 'object') {
    errors.push('history_missing');
  } else {
    for (const win of ['d7', 'd30', 'd90']) {
      const h = dossier.history[win];
      if (!h || typeof h !== 'object') {
        errors.push(`history.${win}_missing`);
        continue;
      }
      if (!h.coverage || typeof h.coverage !== 'object') {
        errors.push(`history.${win}.coverage_missing`);
      }
    }
  }

  if (!dossier.habits?.foodFrequency || !Array.isArray(dossier.habits.foodFrequency.items)) {
    errors.push('habits.foodFrequency_invalid');
  }

  if (!dossier.signals || typeof dossier.signals !== 'object') {
    errors.push('signals_missing');
  }

  return { ok: errors.length === 0, errors };
}
