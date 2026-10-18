/**
 * Date tracker necessarie per una finestra storica (puro).
 */

import { FOCUS_COVERAGE_THRESHOLDS } from '../../aggregate/focusCoverageConfig.js';
import { addCalendarDays } from '../../normalize/focusDateUtils.js';
import { FOCUS_TRACKER_MAX_HISTORY_DAYS } from '../paths/trackerRtdbPaths.js';

/**
 * @param {string} analysisDate
 * @param {string} publicationDate
 * @param {number} historyDays
 */
export function listRequiredTrackerDates(analysisDate, publicationDate, historyDays) {
  const days = Math.min(
    FOCUS_TRACKER_MAX_HISTORY_DAYS,
    Math.max(1, Number(historyDays) || FOCUS_COVERAGE_THRESHOLDS.d90.windowDays),
  );
  const dates = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    dates.push(addCalendarDays(analysisDate, -i));
  }
  if (!dates.includes(publicationDate)) dates.push(publicationDate);
  return [...new Set(dates)];
}
