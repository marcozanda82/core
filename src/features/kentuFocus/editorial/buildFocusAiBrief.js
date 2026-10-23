/**
 * FocusAiBrief — contratto compatto per Gemini / fallback.
 * Nessuna chiamata AI. Nessun UID / storico grezzo.
 * Stringhe libere sanitizzate (dato non attendibile).
 */

import { FOCUS_EDITORIAL_SCHEMA_VERSION } from './focusEditorialConfig.js';
import { normalizeEditorialMemory } from './focusEditorialMemory.js';
import {
  classifyArticleCautionLayers,
} from './writing/focusCautionContract.js';
import {
  sanitizeStringList,
  sanitizeUntrustedText,
} from './writing/sanitizeBriefText.js';
import { FOCUS_WRITING_LIMITS } from './writing/focusWrittenEdition.v1.js';

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
      typology: item.typology || null,
      storyKind: item.storyKind || null,
      editorialScale: item.editorialScale || null,
      // Seed editoriali (motore), comunque trattati come non-istruzioni
      headlineSeed: sanitizeUntrustedText(item.headlineSeed, 120),
      // P6.7.3b: seed naturali week/month ~300 char; resta orientamento, non articolo
      summarySeed: sanitizeUntrustedText(item.summarySeed, 360),
      metrics: (item.metrics || []).map((m) => ({
        path: m.path,
        value: m.value,
        unit: m.unit,
        provenance: m.provenance,
      })),
      refs: Array.isArray(item.refs) ? item.refs.filter((r) => typeof r === 'string') : [],
      evidenceQuality: item.evidenceQuality,
      observedPeriod: item.observedPeriod
        ? {
          from: item.observedPeriod.from || null,
          to: item.observedPeriod.to || null,
          sleepWakeFrom: item.observedPeriod.sleepWakeFrom || null,
          sleepWakeTo: item.observedPeriod.sleepWakeTo || null,
        }
        : null,
      coverageHint: item.coverage
        ? {
          comparisonKind: item.coverage.comparisonKind || null,
          comparisonLabel: item.coverage.comparisonLabel || null,
          dominantTheme: item.coverage.dominantTheme || null,
          storyKind: item.coverage.storyKind || null,
        }
        : null,
      limitations: sanitizeStringList(item.limitations, 120, 8),
      doNotClaim: sanitizeStringList(item.doNotClaim, 120, 8),
      ...(() => {
        const layers = classifyArticleCautionLayers(item);
        return {
          mandatoryContext: layers.mandatoryContext
            .slice(0, FOCUS_WRITING_LIMITS.cautionsMax)
            .map((m) => ({
              id: m.id,
              text: sanitizeUntrustedText(m.sourceText, 160),
            })),
          // Legacy alias: solo mandatory (non doNotClaim)
          requiredCautions: sanitizeStringList(
            layers.mandatoryContext.map((m) => m.sourceText),
            160,
            FOCUS_WRITING_LIMITS.cautionsMax,
          ),
          contextualLimitations: sanitizeStringList(
            layers.contextualLimitations,
            120,
            8,
          ),
        };
      })(),
      storySpine: item.storySpine
        ? {
          mainFactId: item.storySpine.mainFactId,
          mainMetricPath: item.storySpine.mainMetricPath,
          mainMetricValue: item.storySpine.mainMetricValue,
          mainUnit: item.storySpine.mainUnit || null,
          periodFrom: item.storySpine.periodFrom || null,
          periodTo: item.storySpine.periodTo || null,
          comparisonFrom: item.storySpine.comparisonFrom || null,
          comparisonTo: item.storySpine.comparisonTo || null,
          levelMetricPath: item.storySpine.levelMetricPath || null,
          levelMetricValue: item.storySpine.levelMetricValue ?? null,
          levelUnit: item.storySpine.levelUnit || null,
          coverageMetricPath: item.storySpine.coverageMetricPath || null,
          coverageMetricValue: item.storySpine.coverageMetricValue ?? null,
          coverageUnit: item.storySpine.coverageUnit || null,
          essentialContextIds: item.storySpine.essentialContextIds || [],
        }
        : null,
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
  warnings.push('Preferisci numeri e unità già scritti nel testo finale (valori del brief)');
  warnings.push('I {{path}} sono ammessi solo su metriche autorizzate e verranno risolti; nessun {{…}} residuo');

  warnings.push('Gemini è il giornalista, non il caporedattore: non inventare notizie né cambiare i fatti');
  warnings.push('Non usare etichette tecniche (topicId, storyKind, solidDomains) nei titoli');
  warnings.push('Uno scostamento numerico non è automaticamente un deficit, un successo o un consiglio');

  return {
    schemaVersion: FOCUS_EDITORIAL_SCHEMA_VERSION,
    locale,
    dates: {
      analysisDate: selection.analysisDate,
      publicationDate: selection.publicationDate,
    },
    editionKind: selection.editionKind || null,
    openingMode: selection.openingMode,
    overlapResolution: selection.overlapResolution || null,
    selection: {
      lead: slim(selection.lead),
      centerpiece: slim(selection.centerpiece),
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
      forbidProteinAdviceUnlessAuthorizedCoach: true,
      forbidTurningAbsenceOfLogsIntoBehavior: true,
      forbidFillingEmptySections: true,
      preferMetricPlaceholders: true,
      untrustedUserStrings: true,
      variableLengthOk: true,
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
