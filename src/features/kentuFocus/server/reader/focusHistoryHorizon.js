/**
 * Politica bounded degli orizzonti storici Focus (calendario).
 *
 * Confronti editoriali:
 * - d7 vs prev7 → 14 giorni calendario
 * - d30 vs prev30 → 60 giorni calendario
 * - d90 → 90 giorni (solo se richiesto / indicatori d90)
 *
 * Non scaricare sempre 90 giorni.
 */

import { FOCUS_COVERAGE_THRESHOLDS } from '../../aggregate/focusCoverageConfig.js';
import { FOCUS_TRACKER_MAX_HISTORY_DAYS } from '../paths/trackerRtdbPaths.js';

/** @typedef {'d7'|'d30'|'d90'} FocusHistoryHorizon */

export const FOCUS_HISTORY_HORIZON_DAYS = Object.freeze({
  /** Copre d7 + d7_vs_prev7 */
  d7: FOCUS_COVERAGE_THRESHOLDS.d7.windowDays * 2,
  /** Copre d30 + d30_vs_prev30 */
  d30: FOCUS_COVERAGE_THRESHOLDS.d30.windowDays * 2,
  /** Finestra d90 completa */
  d90: FOCUS_COVERAGE_THRESHOLDS.d90.windowDays,
});

/**
 * @param {{
 *   horizon?: FocusHistoryHorizon|null,
 *   historyDays?: number|null,
 *   needD90?: boolean,
 * }} opts
 * @returns {{ historyDays: number, horizon: FocusHistoryHorizon, policy: string }}
 */
export function resolveFocusHistoryDays(opts = {}) {
  if (Number.isFinite(opts.historyDays) && opts.historyDays > 0) {
    const days = Math.min(
      FOCUS_TRACKER_MAX_HISTORY_DAYS,
      Math.max(1, Math.round(opts.historyDays)),
    );
    return {
      historyDays: days,
      horizon: days >= 90 ? 'd90' : days >= 60 ? 'd30' : 'd7',
      policy: 'explicit_historyDays',
    };
  }

  if (opts.needD90 || opts.horizon === 'd90') {
    return {
      historyDays: FOCUS_HISTORY_HORIZON_DAYS.d90,
      horizon: 'd90',
      policy: 'd90_requested',
    };
  }

  if (opts.horizon === 'd7') {
    return {
      historyDays: FOCUS_HISTORY_HORIZON_DAYS.d7,
      horizon: 'd7',
      policy: 'd7_bounded',
    };
  }

  // Default misurabile: 60 giorni per confronti d30 senza forzare d90
  return {
    historyDays: FOCUS_HISTORY_HORIZON_DAYS.d30,
    horizon: 'd30',
    policy: 'default_d30_comparisons',
  };
}
