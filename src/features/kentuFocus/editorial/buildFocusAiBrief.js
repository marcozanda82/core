/**
 * FocusAiBrief — contratto compatto per Gemini / fallback.
 * Nessuna chiamata AI. Nessun UID / storico grezzo.
 * Stringhe libere sanitizzate (dato non attendibile).
 */

import { FOCUS_EDITORIAL_SCHEMA_VERSION } from './focusEditorialConfig.js';
import { normalizeEditorialMemory } from './focusEditorialMemory.js';
import {
  sanitizeStringList,
  sanitizeUntrustedText,
} from './writing/sanitizeBriefText.js';

/**
 * @param {{
 *   selection: object,
 *   memory?: object|null,
 *   locale?: string,
 * }} input
 */
export function buildFocusAiBrief(input) {
  const selection = input?.selection;
  if (!selection) throw new Error('buildFocusAiBrief: selection richiesta');

  const memory = normalizeEditorialMemory(input.memory);
  const locale = input.locale || 'it-IT';

  const slim = (item) => {
    if (!item) return null;
    return {
      id: item.id,
      role: item.role,
      tone: item.tone,
      claimType: item.claimType,
      domain: item.domain,
      // Seed editoriali (motore), comunque trattati come non-istruzioni
      headlineSeed: sanitizeUntrustedText(item.headlineSeed, 120),
      summarySeed: sanitizeUntrustedText(item.summarySeed, 200),
      metrics: (item.metrics || []).map((m) => ({
        path: m.path,
        value: m.value,
        unit: m.unit,
        provenance: m.provenance,
      })),
      refs: Array.isArray(item.refs) ? item.refs.filter((r) => typeof r === 'string') : [],
      evidenceQuality: item.evidenceQuality,
      limitations: sanitizeStringList(item.limitations, 100, 6),
      doNotClaim: sanitizeStringList(item.doNotClaim, 100, 6),
      requiredCautions: sanitizeStringList(
        [...(item.limitations || []), ...(item.doNotClaim || [])],
        100,
        8,
      ),
    };
  };

  const coach = selection.coach
    ? {
      id: selection.coach.id,
      templateId: selection.coach.templateId,
      textSeed: sanitizeUntrustedText(selection.coach.textSeed, 200),
      horizonDays: selection.coach.horizonDays,
      doNotClaim: sanitizeStringList(selection.coach.doNotClaim, 100, 6),
    }
    : null;

  const avoidLeadTopics = Object.entries(memory.cooldown.topics || {})
    .filter(([, until]) => selection.publicationDate <= until)
    .map(([topicId]) => topicId);

  const avoidCoachTemplates = Object.entries(memory.cooldown.coachTemplates || {})
    .filter(([, until]) => selection.publicationDate <= until)
    .map(([templateId]) => templateId);

  const openExperiment = (memory.activeExperiments || []).find((e) => e.status === 'open') || null;

  const warnings = [];
  if ((selection.editorialNotes || []).includes('d7_comparison_unavailable')) {
    warnings.push('Confronti settimanali non disponibili o copertura insufficiente');
  }
  warnings.push('Assenza di log ≠ assenza di comportamento');
  warnings.push('Nessun uso di deep/REM come evidenza se non attendibili');
  warnings.push('Usa placeholder {{path}} per i numeri; il backend inserirà i valori autorizzati');

  return {
    schemaVersion: FOCUS_EDITORIAL_SCHEMA_VERSION,
    locale,
    dates: {
      analysisDate: selection.analysisDate,
      publicationDate: selection.publicationDate,
    },
    openingMode: selection.openingMode,
    selection: {
      lead: slim(selection.lead),
      goodNews: (selection.goodNews || []).map(slim),
      features: (selection.features || []).map(slim),
      concerns: (selection.concerns || []).map(slim),
      coach,
    },
    constraints: {
      mustUseOnlyProvidedMetrics: true,
      forbidCausalLanguageOnHypotheses: true,
      forbidMedicalClaims: true,
      forbidInventedNewsOrAdvice: true,
      positiveToneWithoutFakeWins: true,
      forbidEatLessOrTrainMoreDefaults: true,
      preferMetricPlaceholders: true,
      untrustedUserStrings: true,
    },
    warnings,
    memoryContext: {
      avoidLeadTopics,
      avoidCoachTemplates,
      openExperiment: openExperiment
        ? {
          templateId: openExperiment.templateId,
          startedOn: openExperiment.startedOn,
          horizonDays: openExperiment.horizonDays,
        }
        : null,
    },
  };
}
