/**
 * Anteprima giornalistica Gemini — solo su azione esplicita.
 * Nessuna pubblicazione, nessuna persistenza, nessuna scrittura Firebase.
 */

import { FOCUS_VERIFICATION_STATUS } from '../../edition/editionVerification.js';
import { generateFocusWrittenEdition } from './generateFocusWrittenEdition.js';
import { FOCUS_PROSE_SOURCE } from './focusWrittenEdition.v1.js';
import { validateFocusWrittenEdition } from './validateFocusWrittenEdition.js';

export const FOCUS_GEMINI_PREVIEW_SCHEMA = 'kentu.focusGeminiPreview.v1';

/** Campi effettivamente inviati a Gemini (via AiBrief → prompt). Documentazione P6.6. */
export const FOCUS_GEMINI_PROMPT_FIELDS_DOC = Object.freeze({
  systemInstruction: [
    'identità giornalista (non caporedattore)',
    'toni/vietati (no diagnosi, no causalità inventate, no riempitivi)',
    'obbligo placeholder {{path}} e cautions',
  ],
  userPayload: [
    'locale',
    'dates.analysisDate',
    'dates.publicationDate',
    'editionKind',
    'openingMode',
    'overlapResolution',
    'constraints (flags editoriali)',
    'warnings',
    'memoryContext (solo cooldown topic/coach/esperimento; nessuna memoria persistita in questa prova)',
    'authorizedArticles[]: id, role, tone, claimType, domain, editorialScale, storyKind,',
    '  headlineSeed, summarySeed, metrics{path,value,unit,provenance}, refs,',
    '  evidenceQuality, observedPeriod, coverageHint, limitations, doNotClaim,',
    '  requiredCautions, authorizedEvidenceIds, bodyMaxChars',
    'coachAuthorized (se presente): id, templateId, textSeed, horizonDays, doNotClaim',
    'outputSchema + rules',
  ],
  neverSent: [
    'diario grezzo / fullHistory',
    'nodi Firebase grezzi',
    'note personali / testo libero escluso dalla pipeline',
    'UID utente',
    'candidati omitted / ranking completo',
    'API keys',
  ],
});

/**
 * @param {{
 *   firstBenchReport?: object|null,
 *   preset?: object|null,
 *   selection?: object|null,
 * }} input
 */
export function assessFocusGeminiPreviewEligibility(input) {
  const report = input?.firstBenchReport || null;
  const preset = input?.preset || null;
  const selection = input?.selection
    || report?.selectionForWriting
    || null;

  if (!report?.ok) {
    return {
      ok: false,
      reason: 'missing_first_selection',
      message: 'Esegui prima «Prova redazione» (1ª selezione) con esito ok.',
    };
  }
  if (report.mode && report.mode !== 'first') {
    return {
      ok: false,
      reason: 'not_first_selection',
      message: 'L’anteprima Gemini usa solo la prima selezione, non la seconda anti-ripetizione.',
    };
  }
  if (preset?.forceSimulation) {
    return {
      ok: false,
      reason: 'future_or_fixture_preset',
      message: 'Preset futuro/simulato: non valutabile come edizione reale. Scegli un preset storico.',
    };
  }
  const verification = report.diagnostics?.verificationStatus
    || report.edition?.verificationStatus
    || null;
  if (
    verification === FOCUS_VERIFICATION_STATUS.future_unverified
    || verification === FOCUS_VERIFICATION_STATUS.fixture_simulation
    || verification === FOCUS_VERIFICATION_STATUS.unevaluable
  ) {
    return {
      ok: false,
      reason: 'window_unevaluable',
      message: `Finestra non valutabile per scrittura (${verification}).`,
    };
  }
  if (!selection?.publicationDate || !selection?.analysisDate) {
    return {
      ok: false,
      reason: 'selection_incomplete',
      message: 'Selection di scrittura assente o incompleta nel report della 1ª selezione.',
    };
  }
  return { ok: true, reason: null, message: null, selection, verification };
}

/**
 * Elenco articoli selezionati (slim) per diagnostica/copia.
 * @param {object} selection
 */
export function listSelectedArticlesForPreview(selection) {
  /** @type {object[]} */
  const out = [];
  const push = (item, role) => {
    if (!item) return;
    out.push({
      id: item.id,
      topicId: item.topicId || null,
      role: item.role || role,
      editorialScale: item.editorialScale || null,
      storyKind: item.storyKind || null,
      headlineSeed: item.headlineSeed || null,
      summarySeed: item.summarySeed || null,
      evidenceFingerprint: item.evidenceFingerprint || null,
      observedPeriod: item.observedPeriod || null,
      metrics: (item.metrics || []).map((m) => ({
        path: m.path,
        value: m.value,
        unit: m.unit ?? null,
        provenance: m.provenance || null,
      })),
      limitations: item.limitations || [],
      doNotClaim: item.doNotClaim || [],
      // P6.6.2a: espone spine in authorizedArticles del JSON revisione (se presente)
      ...(item.storySpine ? { storySpine: item.storySpine } : {}),
    });
  };
  push(selection.lead, 'lead');
  push(selection.centerpiece, 'centerpiece');
  for (const n of selection.goodNews || []) push(n, 'good');
  for (const n of selection.features || []) push(n, 'feature');
  for (const n of selection.concerns || []) push(n, 'concern');
  return out;
}

/**
 * Testo giornale leggibile (non seed).
 * @param {object|null} written
 */
export function formatFocusWrittenEditionText(written) {
  if (!written) return '';
  const lines = [];
  lines.push('KENTU FOCUS');
  lines.push(`Edizione del ${written.publicationDate || '—'}`);
  if (written.analysisDate) {
    lines.push(`(riferimento analisi: ${written.analysisDate})`);
  }
  if (written.mastheadTeaser) {
    lines.push('');
    lines.push(written.mastheadTeaser);
  }
  lines.push('');
  const roleLabel = {
    lead: 'Apertura',
    centerpiece: 'Articolo centrale',
    good: 'Breve',
    feature: 'Approfondimento',
    concern: 'In osservazione',
  };
  for (const a of written.articles || []) {
    lines.push('—'.repeat(36));
    lines.push(`${roleLabel[a.role] || a.role}`);
    lines.push(a.title || '');
    lines.push('');
    lines.push(a.body || '');
    if ((a.cautions || []).length) {
      lines.push('');
      lines.push(`Cautele: ${(a.cautions || []).join(' · ')}`);
    }
    lines.push('');
  }
  if (written.coach) {
    lines.push('—'.repeat(36));
    lines.push('Nota coach');
    lines.push(written.coach.title || '');
    lines.push(written.coach.body || '');
  }
  return lines.join('\n').trim();
}

/**
 * @param {{
 *   selection: object,
 *   geminiProvider: { generate: Function, model?: string, getCallCount?: Function },
 *   locale?: string,
 *   preset?: object|null,
 *   firstBenchReport?: object|null,
 * }} input
 */
export async function runFocusGeminiPreview(input) {
  const selection = input?.selection;
  const provider = input?.geminiProvider;
  if (!selection) {
    return {
      ok: false,
      status: 'error',
      error: 'selection_required',
      callCount: 0,
      model: null,
      written: null,
      displayText: '',
      reviewJson: null,
      aiValidation: null,
      promptFieldsDoc: FOCUS_GEMINI_PROMPT_FIELDS_DOC,
    };
  }
  if (!provider || typeof provider.generate !== 'function') {
    return {
      ok: false,
      status: 'blocked',
      error: 'gemini_provider_unavailable',
      message: 'Percorso Gemini non disponibile (manca adapter askAI / callGemini).',
      callCount: 0,
      model: null,
      written: null,
      displayText: '',
      reviewJson: null,
      aiValidation: null,
      promptFieldsDoc: FOCUS_GEMINI_PROMPT_FIELDS_DOC,
    };
  }

  const generated = await generateFocusWrittenEdition({
    selection,
    memory: null,
    locale: input.locale || 'it-IT',
    geminiProvider: provider,
  });

  const callCount = typeof provider.getCallCount === 'function'
    ? provider.getCallCount()
    : 1;
  const model = provider.model || null;
  const geminiAccepted = generated.proseSource === FOCUS_PROSE_SOURCE.validated_ai
    && generated.usedFallback === false
    && generated.aiValidation?.ok === true;

  const reviewJson = buildFocusGeminiReviewJson({
    preset: input.preset,
    firstBenchReport: input.firstBenchReport,
    selection,
    generated,
    callCount,
    model,
    geminiAccepted,
  });

  return {
    ok: geminiAccepted,
    status: geminiAccepted
      ? 'gemini_accepted'
      : (generated.diag === 'aborted' ? 'aborted' : 'gemini_rejected_or_unavailable'),
    error: geminiAccepted ? null : (generated.diag || 'validation_failed'),
    message: geminiAccepted
      ? null
      : 'Generazione non accettata: vedi diagnostici. Nessuna pubblicazione. Un solo tentativo.',
    callCount,
    model,
    written: geminiAccepted ? generated.written : null,
    /** Fallback deterministico solo in diagnostica — non confonderlo con l’edizione Gemini. */
    fallbackWritten: generated.usedFallback ? generated.written : null,
    displayText: geminiAccepted ? formatFocusWrittenEditionText(generated.written) : '',
    reviewJson,
    aiBrief: generated.aiBrief,
    prompt: {
      authorizedArticleIds: generated.prompt?.authorizedArticleIds || [],
      coachAuthorizedId: generated.prompt?.coachAuthorizedId ?? null,
      // Non includere system/user completi nel review UI di default (privacy); restano in generated.prompt se serve debug locale
    },
    aiValidation: generated.aiValidation,
    proseSource: generated.proseSource,
    usedFallback: generated.usedFallback,
    diag: generated.diag,
    /** Solo RAM: risposta grezza se respinta (non persistita). */
    rawAiOutput: geminiAccepted ? null : (generated.rawAiOutput ?? null),
    promptFieldsDoc: FOCUS_GEMINI_PROMPT_FIELDS_DOC,
    persistence: {
      firebaseWrites: 0,
      rtdbReads: 0,
      editorialMemoryPersisted: false,
      published: false,
    },
  };
}

/**
 * Validazione offline di una risposta grezza (test / replay).
 * @param {object|string} raw
 * @param {object} selection
 */
export function validateFocusGeminiPreviewRaw(raw, selection) {
  return validateFocusWrittenEdition(
    typeof raw === 'string' ? safeParse(raw) : raw,
    { selection },
  );
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {object} input
 */
export function buildFocusGeminiReviewJson(input) {
  const {
    preset,
    firstBenchReport,
    selection,
    generated,
    callCount,
    model,
    geminiAccepted,
  } = input;
  return {
    schema: FOCUS_GEMINI_PREVIEW_SCHEMA,
    exportedAt: new Date().toISOString(),
    note: 'Anteprima Gemini locale · nessuna persistenza · nessuna pubblicazione',
    preset: preset
      ? {
        id: preset.id,
        label: preset.label,
        publicationDate: preset.publicationDate,
        dataOriginHint: preset.dataOriginHint,
        forceSimulation: Boolean(preset.forceSimulation),
      }
      : null,
    editionKind: selection?.editionKind
      || firstBenchReport?.edition?.editionKind
      || null,
    dates: {
      analysisDate: selection?.analysisDate,
      publicationDate: selection?.publicationDate,
      asOfDate: firstBenchReport?.diagnostics?.asOfDate || null,
    },
    verificationStatus: firstBenchReport?.diagnostics?.verificationStatus || null,
    selectedArticles: listSelectedArticlesForPreview(selection || {}),
    essentialEvidence: listSelectedArticlesForPreview(selection || {}).map((a) => ({
      id: a.id,
      role: a.role,
      metrics: a.metrics,
      observedPeriod: a.observedPeriod,
    })),
    writtenTexts: geminiAccepted
      ? {
        proseSource: generated.proseSource,
        mastheadTeaser: generated.written?.mastheadTeaser || null,
        articles: (generated.written?.articles || []).map((a) => ({
          id: a.id,
          role: a.role,
          title: a.title,
          body: a.body,
          selectionIndex: a.selectionIndex,
          cautions: a.cautions || [],
        })),
        coach: generated.written?.coach || null,
        fullText: formatFocusWrittenEditionText(generated.written),
      }
      : null,
    model,
    callCount,
    validation: {
      ok: Boolean(generated.aiValidation?.ok),
      errors: generated.aiValidation?.errors || [],
      proseSource: generated.proseSource,
      usedFallback: generated.usedFallback,
      diag: generated.diag,
      geminiAccepted,
      semanticLimits: generated.aiValidation?.semanticLimits || null,
    },
    errors: geminiAccepted ? [] : [
      generated.diag || 'validation_failed',
      ...(generated.aiValidation?.errors || []),
    ],
    rawAiAvailableInSession: Boolean(generated.rawAiOutput) && !geminiAccepted,
    /** Risposta grezza completa (solo se respinta / in sessione). Non è diario. */
    geminiRawResponse: (!geminiAccepted && generated.rawAiOutput != null)
      ? (typeof generated.rawAiOutput === 'string'
        ? generated.rawAiOutput
        : generated.rawAiOutput)
      : null,
    rawAiPreview: (!geminiAccepted && generated.rawAiOutput)
      ? String(generated.rawAiOutput).slice(0, 1200)
      : null,
    promptFieldsSent: FOCUS_GEMINI_PROMPT_FIELDS_DOC,
    persistence: {
      firebaseWrites: 0,
      editorialMemoryPersisted: false,
      published: false,
    },
  };
}

/**
 * Payload clipboard per «Copia JSON revisione Gemini».
 * Funziona anche se la generazione è stata respinta.
 * Nessun diario grezzo / note personali.
 *
 * @param {object|null|undefined} previewResult — esito di runFocusGeminiPreview
 */
export function buildFocusGeminiReviewClipboardPayload(previewResult) {
  if (!previewResult || typeof previewResult !== 'object') return null;
  const base = previewResult.reviewJson && typeof previewResult.reviewJson === 'object'
    ? { ...previewResult.reviewJson }
    : {
      schema: FOCUS_GEMINI_PREVIEW_SCHEMA,
      note: 'Anteprima Gemini locale · nessuna persistenza · nessuna pubblicazione',
      validation: {
        ok: Boolean(previewResult.aiValidation?.ok),
        errors: previewResult.aiValidation?.errors || [],
        diag: previewResult.diag || null,
        geminiAccepted: false,
      },
      errors: previewResult.aiValidation?.errors || [previewResult.error].filter(Boolean),
    };

  const raw = previewResult.rawAiOutput != null
    ? previewResult.rawAiOutput
    : (base.geminiRawResponse ?? null);

  return {
    schema: FOCUS_GEMINI_PREVIEW_SCHEMA,
    kind: 'FocusGeminiReviewClipboard',
    exportedAt: new Date().toISOString(),
    note: 'Revisione Gemini (anche se respinta) · solo RAM · nessuna pubblicazione',
    preset: base.preset ?? null,
    editionKind: base.editionKind ?? null,
    dates: base.dates ?? null,
    verificationStatus: base.verificationStatus ?? null,
    model: previewResult.model ?? base.model ?? null,
    callCount: previewResult.callCount ?? base.callCount ?? 0,
    status: previewResult.status ?? null,
    authorizedArticles: base.selectedArticles
      || listSelectedArticlesForPreview({}),
    essentialEvidence: base.essentialEvidence || [],
    validationErrors: previewResult.aiValidation?.errors
      || base.validation?.errors
      || [],
    validation: {
      ok: Boolean(previewResult.aiValidation?.ok ?? base.validation?.ok),
      errors: previewResult.aiValidation?.errors || base.validation?.errors || [],
      proseSource: previewResult.proseSource ?? base.validation?.proseSource ?? null,
      usedFallback: previewResult.usedFallback ?? base.validation?.usedFallback ?? null,
      diag: previewResult.diag ?? base.validation?.diag ?? null,
      geminiAccepted: Boolean(previewResult.ok),
    },
    geminiRawResponse: raw,
    rawAiAvailableInSession: Boolean(raw),
    writtenTextsAccepted: previewResult.ok ? (base.writtenTexts || null) : null,
    persistence: {
      firebaseWrites: 0,
      editorialMemoryPersisted: false,
      published: false,
    },
  };
}
