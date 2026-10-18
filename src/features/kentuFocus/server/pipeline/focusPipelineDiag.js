/**
 * Report tecnico locale per esecuzione pipeline Focus (nessun UID / PII / credenziali).
 */

/**
 * @param {object} partial
 */
export function createFocusPipelineReport(partial = {}) {
  return {
    kind: 'FocusPipelineReport',
    schemaVersion: '1.0.0',
    publicationDate: partial.publicationDate || null,
    analysisDate: partial.analysisDate || null,
    reads: {
      dailyRecords: partial.dailyRecords ?? null,
      approxBytes: partial.approxBytes ?? null,
      presentDays: partial.presentDays ?? null,
      missingDays: partial.missingDays ?? null,
      historyDaysRequested: partial.historyDaysRequested ?? null,
    },
    timingsMs: partial.timingsMs || {},
    editorial: {
      candidateCount: partial.candidateCount ?? null,
      selectedArticles: partial.selectedArticles ?? null,
      hasCoach: partial.hasCoach ?? null,
      openingMode: partial.openingMode ?? null,
    },
    prose: {
      source: partial.proseSource ?? null,
      usedFallback: partial.usedFallback ?? null,
      validationOk: partial.validationOk ?? null,
      diag: partial.proseDiag ?? null,
    },
    sleep: {
      status: partial.sleepStatus ?? null,
      reason: partial.sleepReason ?? null,
      available: partial.sleepAvailable ?? null,
      ambiguous: partial.sleepAmbiguous ?? null,
    },
    publish: {
      ok: partial.publishOk ?? null,
      revision: partial.revision ?? null,
      idempotentReplay: partial.idempotentReplay ?? null,
      error: partial.error ?? null,
      recovered: partial.recovered ?? null,
    },
    notes: Array.isArray(partial.notes) ? partial.notes : [],
  };
}

/**
 * Conta pezzi selezione (senza testi).
 * @param {object|null|undefined} selection
 */
export function countSelectedArticles(selection) {
  if (!selection) return 0;
  let n = 0;
  if (selection.lead) n += 1;
  n += (selection.goodNews || []).length;
  n += (selection.features || []).length;
  n += (selection.concerns || []).length;
  return n;
}
