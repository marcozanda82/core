/**
 * Stato di verifica temporale delle edizioni (P6.5.1).
 * asOfDate è sempre iniettato — nessun Date.now() nella pipeline.
 */

import { isIsoDateString } from '../normalize/focusDateUtils.js';

export const FOCUS_VERIFICATION_STATUS = Object.freeze({
  historical_real: 'historical_real',
  fixture_simulation: 'fixture_simulation',
  future_unverified: 'future_unverified',
  partial: 'partial',
  unevaluable: 'unevaluable',
});

/**
 * @param {{
 *   publicationDate: string,
 *   asOfDate: string,
 *   windowToDate?: string|null,
 *   temporalComplete?: boolean,
 *   truncated?: boolean,
 *   presetHint?: string|null,
 *   forceSimulation?: boolean,
 * }} input
 */
export function resolveVerificationStatus(input) {
  const {
    publicationDate,
    asOfDate,
    windowToDate = null,
    temporalComplete = false,
    truncated = false,
    presetHint = null,
    forceSimulation = false,
  } = input || {};

  if (!isIsoDateString(asOfDate) || !isIsoDateString(publicationDate)) {
    return FOCUS_VERIFICATION_STATUS.unevaluable;
  }
  if (forceSimulation || presetHint === 'fixture_or_future' || presetHint === 'fixture_simulation') {
    if (publicationDate > asOfDate) {
      return FOCUS_VERIFICATION_STATUS.fixture_simulation;
    }
  }
  if (publicationDate > asOfDate) {
    return FOCUS_VERIFICATION_STATUS.future_unverified;
  }
  if (windowToDate && isIsoDateString(windowToDate) && windowToDate > asOfDate) {
    return FOCUS_VERIFICATION_STATUS.future_unverified;
  }
  if (truncated || !temporalComplete) {
    return FOCUS_VERIFICATION_STATUS.partial;
  }
  return FOCUS_VERIFICATION_STATUS.historical_real;
}

/**
 * Motivi centerpiece (pubblicato o escluso).
 */
export const CENTERPIECE_STORY_REASON = Object.freeze({
  significant_story_selected: 'significant_story_selected',
  descriptive_only: 'descriptive_only',
  ordinary_oscillation_no_story: 'ordinary_oscillation_no_story',
  comparison_insufficient: 'comparison_insufficient',
  insufficient_domain_coverage: 'insufficient_domain_coverage',
  future_window_unevaluable: 'future_window_unevaluable',
  temporal_incomplete: 'temporal_incomplete',
  overlap_no_autonomous_value: 'overlap_no_autonomous_value',
  scale_repeat_same_evidence: 'scale_repeat_same_evidence',
});
