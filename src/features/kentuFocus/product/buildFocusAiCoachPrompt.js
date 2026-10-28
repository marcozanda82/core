/**
 * Prompt coach editoriale Kentu Focus (rapporto personale intelligente).
 * Libertà di ragionamento scientifico; divieto di certezze cliniche non giustificate.
 * FASE C: blocco summary obbligatorio + registro asciutto.
 */

import { FOCUS_ASKAI_DEFAULT_MODEL } from '../editorial/writing/createAskAiFocusGeminiProvider.js';

/** Singolo punto di modello (allineato al provider Focus). */
export const FOCUS_AI_COACH_MODEL = FOCUS_ASKAI_DEFAULT_MODEL;

const SUMMARY_ITEM = Object.freeze({
  type: 'object',
  properties: {
    text: { type: 'string' },
    area: {
      type: 'string',
      enum: ['energia', 'qualita', 'ritmo', 'sonno', 'movimento'],
    },
    eventRefs: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['text', 'eventRefs'],
});

export const FOCUS_AI_COACH_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    summary: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        wentWell: {
          type: 'array',
          items: SUMMARY_ITEM,
          minItems: 1,
          maxItems: 2,
        },
        toImprove: {
          type: 'array',
          items: SUMMARY_ITEM,
          minItems: 1,
          maxItems: 2,
        },
        todayAction: { type: 'string' },
      },
      required: ['headline', 'wentWell', 'toImprove', 'todayAction'],
    },
    headline: { type: 'string' },
    lead: { type: ['string', 'null'] },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
        },
      },
      maxItems: 5,
    },
    keyInsight: { type: 'string' },
    recommendedAction: { type: 'string' },
    expectedChange: { type: 'string' },
    verifyNext: { type: 'string' },
    evidenceRefs: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 6,
    },
    limits: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 4,
    },
    claimLayers: {
      type: 'object',
      properties: {
        recordedFacts: { type: 'array', items: { type: 'string' } },
        generalKnowledge: { type: 'array', items: { type: 'string' } },
        foundedInferences: { type: 'array', items: { type: 'string' } },
        hypothesesToTest: { type: 'array', items: { type: 'string' } },
      },
      required: ['recordedFacts', 'generalKnowledge', 'foundedInferences', 'hypothesesToTest'],
    },
    primaryPillarId: {
      type: 'string',
      enum: ['nutrition', 'exercise', 'sleep', 'balanced'],
    },
    quantitativeProposal: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            foodName: { type: 'string' },
            grams: { type: 'number' },
            fromMeal: { type: 'string' },
            toTiming: { type: 'string' },
            rationale: { type: 'string' },
            dailyKcalUnchanged: { type: 'boolean' },
          },
        },
      ],
    },
  },
  required: [
    'summary',
    'headline',
    'sections',
    'recommendedAction',
    'verifyNext',
    'primaryPillarId',
    'claimLayers',
    'quantitativeProposal',
  ],
});

/**
 * @returns {string}
 */
export function buildFocusAiCoachSystemInstruction() {
  return [
    'Sei il redattore del rapporto personale Kentu Focus («a kent’annusu»).',
    'Registro: diretto, asciutto, frasi brevi. Niente formule letterarie né titoli da laboratorio.',
    'NON riepilogare il diario: l’utente conosce già pasti, kcal, minuti e ore delle card.',
    'Obbligatorio summary: headline (≤70), wentWell (1–2), toImprove (1–2), todayAction (≤140).',
    'wentWell: 1–2 segnali positivi più significativi. Valuta SEMPRE energia (bilancio vs target dichiarato e vs media recente) e qualità (grassi buoni, integrali, vegetali documentati). Distingui obiettivo DICHIARATO e condotta OSSERVATA.',
    'toImprove: leve concrete con segnale nel dossier. Un NOVA 4 entra in toImprove SOLO se foodQuality.day.nova4Items[].critiqueWorthy=true (Nutri-Score D/E oppure zuccheri≥15g o saturi≥5g/porzione). Fondente ≥70% e altri NOVA 4 favorevoli: non criticare.',
    'toImprove sonno: se ritmo attivo (meal_within_3h_of_bedtime, heavy_late_meal): fondili in UNA voce senza causalità — es. «Cena abbondante alle 21:40 e notte da 6,5 ore». eventRefs: sleep:* e food:* del pasto. Non usare fasting_over_14h in summary sul giorno; in settimana/mese solo se active/summaryEligible.',
    'todayAction DEVE riferirsi al primo toImprove. recommendedAction = approfondimento della stessa leva.',
    'Se substitutionCandidates.byOccasion[occasione] ha voci: usale come sostituto concreto (displayNameMidSentence + porzione). Se la lista stessa-occasione è vuota: proponi la categoria generica in genericFallback (es. «frutta fresca»), MAI un alimento di un’altra occasione. Ignora occasion=unknown.',
    'lead: o contiene almeno un dato concreto (es. kcal del giorno vs target vs media 7g), oppure omettilo (null).',
    'claimLayers e quantitativeProposal sono obbligatori (quantitativeProposal può essere null).',
    'Summary: «ultra-processato», non «NOVA 4». NOVA solo nelle sections.',
    'Se non c’è attività registrata: nei limits, tono neutro.',
    'I limiti del ragionamento stanno SOLO in limits. VIETATO nel testo utente commentare i limiti («senza forzare cause», «non si può affermare», «senza pretendere causalità»).',
    'Esempi NEGATIVI (non scrivere così): «Meglio osservare senza forzare cause non misurate.» · «Non si può affermare un nesso cena–sonno.»',
    'Cautele: NON affermare ciò che non è misurato; non dichiararlo con meta-frasi.',
    'Segnali deterministici attivi (deterministicSignals.activeIds) vanno considerati quando pertinenti.',
    'Vietato: diagnosi, score 0–100, causalità certe da 1–2 giorni, infiammazione clinica, glicemia non misurata, «sei pronto a spingere».',
    'eventRefs: usa solo gli alias corti di eventIndex.aliases (e1, e2, …) oppure []. Mai id lunghi.',
    'wentWell/toImprove: array di oggetti { text, area, eventRefs }, mai stringhe semplici.',
    'Rispondi SOLO JSON conforme allo schema.',
  ].join(' ');
}

/**
 * @param {object} dossier
 * @returns {string}
 */
export function buildFocusAiCoachUserPrompt(dossier) {
  const periodLabel = dossier?.periodId === 'ieri'
    ? 'Ieri'
    : dossier?.periodId === 'mese'
      ? 'Mese'
      : 'Settimana';

  const erc = dossier?.editorialReadingContext || null;
  const dvr = erc?.dayVersusRecent || null;
  const fq = dossier?.nutrition?.foodQuality || null;
  const eventAliases = Array.isArray(dossier?.eventIndex?.aliases)
    ? dossier.eventIndex.aliases.slice(0, 24)
    : (Array.isArray(dossier?.eventIndex?.events)
      ? dossier.eventIndex.events.map((e) => e?.alias).filter(Boolean).slice(0, 24)
      : []);
  const eventAliasLegend = Array.isArray(dossier?.eventIndex?.events)
    ? dossier.eventIndex.events.slice(0, 24).map((e) => {
      const tip = e?.name || e?.label || e?.kind || '';
      return `${e.alias}=${tip}`.trim();
    })
    : [];
  const activeSignals = dossier?.deterministicSignals?.activeIds || [];
  const signalDetails = (dossier?.deterministicSignals?.signals || [])
    .filter((s) => s?.active)
    .map((s) => `${s.id}: ${s.detail || ''}`.trim())
    .slice(0, 6);
  const subs = dossier?.nutrition?.substitutionCandidates;
  const dessertSubs = (subs?.byOccasion?.dolce || subs?.byOccasion?.dessert || [])
    .slice(0, 5);
  const genericDolce = subs?.genericFallback?.dolce || 'frutta fresca';

  const contextBlock = dvr
    ? [
      '[CONTESTO TEMPORALE — leggi prima del titolo]',
      `Giorno analisi (${dvr.analysisDate}): introito ${dvr.day?.intakeKcal ?? 'n/d'} kcal · bilancio vs target ${dvr.day?.balanceVsTargetKcal ?? 'n/d'} kcal.`,
      `Media recente 7g (escluso giorno analisi): ${dvr.recent7dExcludingAnalysisDay?.recordedDays ?? 0} giorni · media introito ${dvr.recent7dExcludingAnalysisDay?.meanIntakeKcal ?? 'n/d'} kcal · bilancio medio vs target ${dvr.recent7dExcludingAnalysisDay?.meanBalanceVsTargetKcal ?? 'n/d'} kcal.`,
      `Target dichiarato: ${dvr.declaredTargetKcal ?? 'n/d'} kcal.`,
      erc?.mealTiming?.lateDinnerLikely
        ? `Pasto più tardivo ~${erc.mealTiming.latestMealHour} (${erc.mealTiming.latestMealLabel || 'pasto'}).`
        : '',
      '[/CONTESTO TEMPORALE]',
    ].filter(Boolean).join('\n')
    : [
      '[CONTESTO TEMPORALE]',
      'Usa kentuEngines + compassSignals; confronta giorno e media recente se presenti.',
      '[/CONTESTO TEMPORALE]',
    ].join('\n');

  const qualityBlock = [
    '[QUALITÀ / SEGNALI]',
    fq?.completeness === 'partial'
      ? 'foodQuality incompleto (OFF): citare nei limits.'
      : 'foodQuality: complete (o assente).',
    activeSignals.length
      ? `Segnali attivi: ${activeSignals.join(', ')}.`
      : 'Nessun segnale deterministico attivo.',
    ...signalDetails.map((d) => `· ${d}`),
    dessertSubs.length
      ? `substitutionCandidates dolce (preferisci in todayAction): ${dessertSubs.map((c) => `${c.displayNameMidSentence || c.name}${c.typicalGrams != null ? ` ~${c.typicalGrams}g` : ''}`).join('; ')}.`
      : `Nessun candidato dolce nel diario: in todayAction usa la categoria generica «${genericDolce}» (non snatch da snack).`,
    eventAliases.length
      ? `eventIndex.aliases (usa questi in eventRefs): ${eventAliases.join(', ')}.`
      : 'eventIndex vuoto.',
    eventAliasLegend.length
      ? `Legenda alias: ${eventAliasLegend.join('; ')}.`
      : '',
    ...(Array.isArray(dossier?.generationLimits) ? dossier.generationLimits.map((l) => `LIMIT: ${l}`) : []),
    '[/QUALITÀ / SEGNALI]',
  ].filter(Boolean).join('\n');

  // Per il modello: nascondi id lunghi / mappe inverse; tieni solo alias.
  const dossierForModel = (() => {
    try {
      const clone = JSON.parse(JSON.stringify(dossier));
      if (clone?.eventIndex) {
        clone.eventIndex = {
          schema: clone.eventIndex.schema,
          aliases: clone.eventIndex.aliases || [],
          events: (clone.eventIndex.events || []).map((e) => ({
            alias: e.alias,
            kind: e.kind,
            name: e.name || null,
            label: e.label || null,
            mealLabel: e.mealLabel || null,
            date: e.date || null,
            hours: e.hours ?? null,
          })),
        };
      }
      return clone;
    } catch {
      return dossier;
    }
  })();

  return [
    `Genera il RAPPORTO EDITORIALE Kentu Focus per ${periodLabel}.`,
    dossier.horizonBrief || '',
    `Date: analisi ${dossier.analysisDate} · pubblicazione ${dossier.publicationDate}.`,
    '',
    contextBlock,
    '',
    qualityBlock,
    '',
    'FALLIMENTO se todayAction ignora substitutionCandidates quando pertinenti.',
    'FALLIMENTO se toImprove sonno non accosta un ritmo attivo (cena vicina / cena abbondante) quando presente.',
    'FALLIMENTO se lead esiste ma senza dato concreto (numero + contesto: kcal/target/media/ore).',
    'FALLIMENTO se commenti i limiti del ragionamento fuori da limits (es. «senza forzare cause», «non si può affermare»).',
    'FALLIMENTO se mancano claimLayers o la chiave quantitativeProposal.',
    'FALLIMENTO se todayAction ≠ primo toImprove, o meta-frasi vietate, o NOVA in summary.',
    'FALLIMENTO se wentWell/toImprove non sono oggetti {text,area,eventRefs}.',
    '',
    '[FOCUS_INPUT_DATA]',
    JSON.stringify(dossierForModel),
    '[/FOCUS_INPUT_DATA]',
    '',
    'Compila questo JSON:',
    '{',
    '  "summary": { "headline", "wentWell":[{"text","area","eventRefs"}], "toImprove":[{"text","area","eventRefs"}], "todayAction" },',
    '  "headline": "...",',
    '  "lead": "con dato concreto OPPURE null",',
    '  "sections": [ { "id", "title", "body" } ],',
    '  "keyInsight": "o null",',
    '  "recommendedAction": "...",',
    '  "expectedChange": "...",',
    '  "verifyNext": "...",',
    '  "evidenceRefs": [],',
    '  "limits": [],',
    '  "claimLayers": { "recordedFacts": [], "generalKnowledge": [], "foundedInferences": [], "hypothesesToTest": [] },',
    '  "primaryPillarId": "nutrition|exercise|sleep|balanced",',
    '  "quantitativeProposal": null',
    '}',
  ].filter(Boolean).join('\n');
}
