/**
 * Gate completezza storico per laboratorio Focus (P5.2.2).
 * Non usa il conteggio chiavi come prova di completezza (giorni vuoti ≠ incompleto).
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';

/** @typedef {'idle'|'loading'|'ready'|'error'|'unknown'} FocusLabHistoryLoadState */

/**
 * @param {unknown} raw
 * @returns {FocusLabHistoryLoadState}
 */
export function normalizeFocusLabHistoryLoadState(raw) {
  const s = String(raw || '').trim();
  if (s === 'idle' || s === 'loading' || s === 'ready' || s === 'error') return s;
  return 'unknown';
}

/**
 * @param {{
 *   historyLoadState?: unknown,
 *   allowPartialHistory?: boolean,
 *   requestedHistoryDays?: number,
 * }} input
 */
export function resolveFocusLabHistoryGate(input = {}) {
  const historyLoadState = normalizeFocusLabHistoryLoadState(input.historyLoadState);
  const allowPartialHistory = Boolean(input.allowPartialHistory);
  const requestedHistoryDays = Math.max(1, Math.min(90, Number(input.requestedHistoryDays) || 60));

  if (historyLoadState === 'ready') {
    return {
      historyLoadState,
      canExport: true,
      d30CompleteAllowed: true,
      effectiveHistoryDays: requestedHistoryDays,
      exportScope: 'full_requested',
      blockReason: null,
      note: 'Storico bootstrap completato. Giorni senza nodo restano coverage/missing, non “non caricato”.',
    };
  }

  if (historyLoadState === 'loading' || historyLoadState === 'idle') {
    return {
      historyLoadState,
      canExport: allowPartialHistory,
      d30CompleteAllowed: false,
      effectiveHistoryDays: allowPartialHistory ? Math.min(10, requestedHistoryDays) : 0,
      exportScope: allowPartialHistory ? 'partial_explicit' : 'blocked',
      blockReason: 'history_still_loading',
      note: 'Bootstrap fullHistory non completato (cache 15g non basta per d30 completo).',
    };
  }

  // error | unknown
  return {
    historyLoadState,
    canExport: allowPartialHistory,
    d30CompleteAllowed: false,
    effectiveHistoryDays: allowPartialHistory ? Math.min(10, requestedHistoryDays) : 0,
    exportScope: allowPartialHistory ? 'partial_explicit' : 'blocked',
    blockReason: historyLoadState === 'error' ? 'history_load_failed' : 'history_coverage_unknown',
    note: 'Completezza storico non garantita. Solo export esplicitamente parziale (max d10).',
  };
}

/**
 * Date edizione Focus standard vs scenario simulato esplicito.
 * @param {{
 *   editionMode?: 'focus_standard'|'simulated_scenario',
 *   referenceDate?: string,
 *   simulatedAnalysisDate?: string,
 * }} input
 */
export function resolveFocusLabEditionDates(input = {}) {
  const editionMode = input.editionMode === 'simulated_scenario'
    ? 'simulated_scenario'
    : 'focus_standard';

  if (editionMode === 'simulated_scenario') {
    const analysisDate = String(input.simulatedAnalysisDate || input.referenceDate || '').slice(0, 10);
    if (!isIsoDateString(analysisDate)) {
      throw new Error('resolveFocusLabEditionDates: simulatedAnalysisDate ISO richiesta');
    }
    const publicationDate = addCalendarDays(analysisDate, 1);
    return {
      editionMode,
      analysisDate,
      publicationDate,
      analyzedDayRole: 'simulated_tracker_day',
      referenceDate: String(input.referenceDate || analysisDate).slice(0, 10),
    };
  }

  const publicationDate = String(input.referenceDate || '').slice(0, 10);
  if (!isIsoDateString(publicationDate)) {
    throw new Error('resolveFocusLabEditionDates: referenceDate ISO richiesta');
  }
  const analysisDate = addCalendarDays(publicationDate, -1);
  return {
    editionMode,
    analysisDate,
    publicationDate,
    analyzedDayRole: 'calendar_yesterday_vs_publication',
    referenceDate: publicationDate,
  };
}
