/**
 * Prompt coach editoriale Kentu Focus (rapporto personale intelligente).
 * Libertà di ragionamento scientifico; divieto di certezze cliniche non giustificate.
 */

import { FOCUS_ASKAI_DEFAULT_MODEL } from '../editorial/writing/createAskAiFocusGeminiProvider.js';

/** Singolo punto di modello (allineato al provider Focus). */
export const FOCUS_AI_COACH_MODEL = FOCUS_ASKAI_DEFAULT_MODEL;

export const FOCUS_AI_COACH_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    headline: { type: 'string' },
    lead: { type: 'string' },
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
    },
    primaryPillarId: {
      type: 'string',
      enum: ['nutrition', 'exercise', 'sleep', 'balanced'],
    },
    quantitativeProposal: {
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
    // Legacy v2 (accettati in lettura; preferire i campi editoriali)
    theEmergingPicture: { type: 'string' },
    nutrition: { type: 'string' },
    exercise: { type: 'string' },
    sleep: { type: 'string' },
    importantConnections: { type: 'array', items: { type: 'string' } },
    theChoiceIWouldMake: { type: 'string' },
    whatToWatchNext: { type: 'string' },
  },
  required: [
    'headline',
    'lead',
    'sections',
    'recommendedAction',
    'verifyNext',
    'primaryPillarId',
  ],
});

/**
 * @returns {string}
 */
export function buildFocusAiCoachSystemInstruction() {
  return [
    'Sei il redattore del rapporto personale Kentu Focus («a kent’annusu»).',
    'Scrivi come un divulgatore intelligente che conosce il diario del lettore — non come un laboratorio clinico né come un report tecnico.',
    'NON riepilogare il diario: l’utente conosce già pasti, kcal, minuti e ore delle card.',
    'PRIMA del titolo: apri editorialReadingContext.dayVersusRecent (se presente). Distingui EPISODIO (giorno di analisi) e CONTESTO RECENTE (media giorni precedenti). Un giorno sopra/sotto target NON è «traiettoria».',
    'headline: interessante, umano, specifico, comprensibile. VIETATI titoli da relazione tecnica (es. «asimmetria», «assetto operativo», «scarto energetico», «delta kcal», gergo da laboratorio).',
    'Cerca una scoperta o un’apparente contraddizione interessante — anche positiva. Non cercare obbligatoriamente una criticità.',
    'Capitoli: 1–4 sezioni dinamiche solo se aggiungono informazione. NON forzare un capitolo per ogni motore (Pilota, Bussola, Stimolo, cardio, sonno). Motori non centrali → evidenceRefs.',
    'Pilota/Bussola: rispetta timeframe e segnali canonici in kentuEngines. Su Ieri, observedEnergy è l’episodio 1d; la media recente è in editorialReadingContext, non inventare una seconda Bussola.',
    'Sonno: puoi citare conoscenza generale (timing pasti/caffè/allenamento). VIETATO affermare che la cena abbia «compromesso il sonno profondo», alterato fasi del sonno, o altre fisiologie individuali non misurate. Distingui fatto / conoscenza generale / ipotesi.',
    'Proposta: preferisci un alimento reale + grammi + pasto/orario già in redistributionCandidates o meals. Niente «una frazione dell’introito» vaga. Distingui redistribuzione (dailyKcalUnchanged true) da riduzione calorica. Usa mealManeuver se utile, ma non ripetere sempre la stessa raccomandazione sulla cena se il contesto suggerisce altro.',
    'expectedChange: cosa cambia e cosa resta invariato (kcal giorno se solo timing).',
    'Hai libertà su meccanismi generali. Vietato: diagnosi, glicemia/infiammazione clinica individuali, score 0–100, causalità certe da 1–2 episodi, «sei pronto a spingere», anni di vita.',
    'Rispondi SOLO JSON conforme allo schema editoriale v3. Niente Markdown fuori dal JSON.',
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
  const contextBlock = dvr
    ? [
      '[CONTESTO TEMPORALE — leggi prima del titolo]',
      `Giorno analisi (${dvr.analysisDate}): introito ${dvr.day?.intakeKcal ?? 'n/d'} kcal · bilancio vs target ${dvr.day?.balanceVsTargetKcal ?? 'n/d'} kcal · ruolo=${dvr.day?.role}.`,
      `Media recente 7g (escluso giorno analisi): ${dvr.recent7dExcludingAnalysisDay?.recordedDays ?? 0} giorni · media introito ${dvr.recent7dExcludingAnalysisDay?.meanIntakeKcal ?? 'n/d'} kcal · bilancio medio vs target ${dvr.recent7dExcludingAnalysisDay?.meanBalanceVsTargetKcal ?? 'n/d'} kcal · ruolo=${dvr.recent7dExcludingAnalysisDay?.role}.`,
      `Target dichiarato: ${dvr.declaredTargetKcal ?? 'n/d'} kcal.`,
      dvr.readingHint || '',
      dvr.bussolaNote || '',
      erc?.workoutTiming?.morningTraining
        ? `Allenamento: orario più precoce ~${erc.workoutTiming.earliestHour} (mattutino).`
        : '',
      erc?.mealTiming?.lateDinnerLikely
        ? `Pasto più tardivo ~${erc.mealTiming.latestMealHour} (${erc.mealTiming.latestMealLabel || 'pasto'}) — cena tardiva/abbondante può essere osservata senza affermare danno al sonno.`
        : '',
      (erc?.redistributionCandidates || []).length
        ? `Candidati redistribuzione (verificati nel diario): ${erc.redistributionCandidates.slice(0, 6).map((c) => `${c.foodName} ${c.grams}g @ ${c.fromMeal || '?'}`).join('; ')}.`
        : '',
      '[/CONTESTO TEMPORALE]',
    ].filter(Boolean).join('\n')
    : [
      '[CONTESTO TEMPORALE]',
      'Se editorialReadingContext è assente, usa comunque kentuEngines + compassSignals e non elevare un solo giorno a traiettoria.',
      '[/CONTESTO TEMPORALE]',
    ].join('\n');

  return [
    `Genera il RAPPORTO EDITORIALE Kentu Focus per ${periodLabel}.`,
    dossier.horizonBrief || '',
    `Date: analisi ${dossier.analysisDate} · pubblicazione ${dossier.publicationDate}.`,
    dossier.windowLabel ? `Finestra calendario Focus: ${dossier.windowLabel}.` : '',
    '',
    contextBlock,
    '',
    'FALLIMENTO se ripeti: «hai registrato N pasti, X kcal, Y minuti, Z ore».',
    'FALLIMENTO se il titolo suona da report tecnico o se tratti lo scostamento di un giorno come traiettoria ignorando la media recente disponibile.',
    'FALLIMENTO se affermi che un pasto abbia compromesso il sonno profondo o fasi del sonno non misurate.',
    'FALLIMENTO se la proposta è vaga («una frazione…») quando esistono candidati con nome e grammi.',
    '',
    '[FOCUS_AI_COACH_DOSSIER]',
    JSON.stringify(dossier),
    '[/FOCUS_AI_COACH_DOSSIER]',
    '',
    'Compila questo JSON:',
    '{',
    '  "headline": "titolo umano e specifico (non tecnico)",',
    '  "lead": "scoperta principale, con episodio vs contesto se rilevante",',
    '  "sections": [ { "id": "...", "title": "...", "body": "..." } ],',
    '  "keyInsight": "collegamento particolarmente rilevante (o null)",',
    '  "recommendedAction": "UNA proposta concreta (alimento+grammi+timing se verificabili)",',
    '  "expectedChange": "cosa cambia / cosa NO (es. kcal giorno invariate se solo redistribuzione)",',
    '  "verifyNext": "come osservare gli effetti in 7–14 giorni",',
    '  "evidenceRefs": ["editorialReadingContext....", "kentuEngines...."],',
    '  "limits": ["incertezze importanti"],',
    '  "claimLayers": { "recordedFacts": [], "generalKnowledge": [], "foundedInferences": [], "hypothesesToTest": [] },',
    '  "primaryPillarId": "nutrition" | "exercise" | "sleep" | "balanced",',
    '  "quantitativeProposal": null o { "foodName", "grams", "fromMeal", "toTiming", "rationale", "dailyKcalUnchanged": true }',
    '}',
    '',
    'Scegli 1–4 sezioni davvero pertinenti. Non forzare tutti i pilastri/motori.',
  ].filter(Boolean).join('\n');
}
