/**
 * Stato leggibile anteprima Gemini nel banco (solo RAM React).
 * Nessuna persistenza. Nessuna chiamata Gemini.
 */

/**
 * @param {{
 *   editorialFirst?: object|null,
 *   geminiEligibility?: { ok?: boolean, reason?: string|null, message?: string|null }|null,
 *   geminiPreview?: object|null,
 *   geminiPreviewLoading?: boolean,
 *   geminiPreviewError?: string|null,
 *   hasReviewClipboard?: boolean,
 * }} input
 */
export function describeFocusGeminiBenchStatus(input = {}) {
  const {
    editorialFirst = null,
    geminiEligibility = null,
    geminiPreview = null,
    geminiPreviewLoading = false,
    geminiPreviewError = null,
    hasReviewClipboard = false,
  } = input;

  if (geminiPreviewLoading) {
    return {
      code: 'loading',
      label: 'Generazione in corso',
      detail: 'Una sola chiamata Gemini sulla 1ª selezione. Attendi il risultato.',
      showDiagnostics: true,
      canCopyReviewJson: false,
      sessionHasGeminiResult: false,
    };
  }

  if (geminiPreview) {
    const rejected = !geminiPreview.ok;
    const raw = Boolean(geminiPreview.rawAiOutput);
    return {
      code: rejected ? 'rejected_in_session' : 'accepted_in_session',
      label: rejected
        ? 'Generazione respinta (ancora in sessione React)'
        : 'Generazione accettata (in sessione React)',
      detail: rejected
        ? `Validazione fallita. JSON revisione ${hasReviewClipboard || geminiPreview.reviewJson ? 'copiabile' : 'non disponibile'}`
          + (raw ? '; risposta grezza in RAM.' : '; risposta grezza assente.')
        : 'Edizione scritta disponibile in sezione B; diagnostici in C.',
      showDiagnostics: true,
      canCopyReviewJson: Boolean(hasReviewClipboard || geminiPreview.reviewJson),
      sessionHasGeminiResult: true,
      errors: geminiPreview.aiValidation?.errors || [],
    };
  }

  if (geminiPreviewError && !geminiPreview) {
    return {
      code: 'error_no_payload',
      label: 'Errore senza payload di revisione',
      detail: String(geminiPreviewError),
      showDiagnostics: true,
      canCopyReviewJson: false,
      sessionHasGeminiResult: false,
    };
  }

  if (!editorialFirst?.ok) {
    return {
      code: 'awaiting_first_selection',
      label: 'Nessuna 1ª selezione in sessione',
      detail: 'Stato React vuoto (hot-reload, refresh o chiusura modal). '
        + 'Esegui «Prova redazione», poi «Genera anteprima con Gemini». '
        + 'La generazione precedente non è recuperabile.',
      showDiagnostics: true,
      canCopyReviewJson: false,
      sessionHasGeminiResult: false,
    };
  }

  if (!geminiEligibility?.ok) {
    return {
      code: 'gemini_gated',
      label: 'Gemini non disponibile per questo preset',
      detail: geminiEligibility?.message || geminiEligibility?.reason || 'Gate non soddisfatto.',
      showDiagnostics: true,
      canCopyReviewJson: false,
      sessionHasGeminiResult: false,
    };
  }

  return {
    code: 'ready_no_generation',
    label: 'Pronto — nessuna generazione in questa sessione',
    detail: '1ª selezione ok. Premi «Genera anteprima con Gemini» per una sola chiamata. '
      + 'Sezioni B/C e copia JSON revisione compaiono dopo il tentativo (anche se respinto).',
    showDiagnostics: true,
    canCopyReviewJson: false,
    sessionHasGeminiResult: false,
  };
}
