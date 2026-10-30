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

const TODAY_ACTION = Object.freeze({
  type: 'object',
  properties: {
    text: { type: 'string' },
    toImproveIndex: { type: 'integer' },
    eventRefs: {
      type: 'array',
      items: { type: 'string' },
    },
    area: {
      type: 'string',
      enum: ['energia', 'qualita', 'ritmo', 'sonno', 'movimento'],
    },
  },
  required: ['text', 'toImproveIndex', 'eventRefs'],
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
        todayAction: TODAY_ACTION,
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
    'Lo stesso registro vale per summary, sections, lead, keyInsight, recommendedAction, verifyNext, limits e claimLayers.',
    'NON riepilogare il diario: l’utente conosce già pasti, kcal, minuti e ore delle card.',
    'Obbligatorio summary: headline (≤70), wentWell (1–2), toImprove (1–2), todayAction oggetto { text ≤140, toImproveIndex, eventRefs }.',
    'headline top-level DEVE essere identica a summary.headline (un solo titolo).',
    'wentWell: 1–2 segnali positivi più significativi. Valuta SEMPRE energia (bilancio vs target dichiarato e vs media recente) e qualità (grassi buoni, integrali, vegetali). Distingui obiettivo DICHIARATO e condotta OSSERVATA.',
    'toImprove: leve concrete con segnale nei dati analizzati. Se due voci condividono la stessa causa (es. cena abbondante → surplus kcal), uniscile in UNA voce; il secondo posto va a un segnale diverso oppure resta un solo item.',
    'Area: pasti tardivi o abbondanti → «ritmo». Area «sonno» SOLO se il segnale riguarda il sonno in sé (durata < 7 h, qualità bassa). Un alimento ultra-processato entra in toImprove SOLO se foodQuality.day.nova4Items[].critiqueWorthy=true (Nutri-Score D/E oppure zuccheri≥15g o saturi≥5g/porzione). Fondente ≥70% e altri ultra-processati favorevoli: non criticare.',
    'Durate sempre in formato «1 h 35» / «6 h 30» (ore e minuti), mai decimali («6,5 ore», «1.5 h»). Orari stimati o arrotondati: «verso le 21:40» o «circa le 21:40», non come orario esatto se il dato è approssimato.',
    'Se giorno e media 7g differiscono anche di poco, NON dire «identico» / «uguale»: indica entrambi i valori o la differenza.',
    'Se ritmo attivo (meal_within_3h_of_bedtime, heavy_late_meal) e anche sleep_under_7h: una sola voce (area sonno) che accosta orario cena e ore di sonno, senza causalità — es. «Cena abbondante verso le 21:40 e notte da 6 h 30». eventRefs: sleep:* e food:* del pasto. Se solo ritmo (sonno ≥7 h): area ritmo, senza inventare un effetto sul sonno.',
    'Non usare fasting_over_14h in summary sul giorno; in settimana/mese solo se active/summaryEligible.',
    'todayAction: UNA sola leva (niente alternative con « o »). toImproveIndex punta alla voce toImprove scelta; eventRefs compatibili con quella voce (almeno un ref in comune, o stessa area). recommendedAction approfondisce la STESSA leva e riusa gli stessi orari/grammi di todayAction.text.',
    'Se l’ora locale di generazione è già oltre il momento dell’azione (es. cena e sono le 20+), formula todayAction per la prossima occorrenza («Domani a cena…»), non per oggi.',
    'Se substitutionCandidates.byOccasion[occasione] ha voci: usale come sostituto concreto (displayNameMidSentence + porzione). Se la lista stessa-occasione è vuota: proponi la categoria generica in genericFallback (es. «frutta fresca»), MAI un alimento di un’altra occasione. Ignora occasion=unknown.',
    'lead: o contiene almeno un dato concreto (es. kcal del giorno vs target vs media 7g), oppure omettilo (null).',
    'claimLayers e quantitativeProposal sono obbligatori (quantitativeProposal può essere null).',
    'Nel summary usa «ultra-processato»; il codice di classificazione industriale degli alimenti va solo nelle sections se serve.',
    'Se non c’è attività registrata: nei limits, tono neutro.',
    'I limiti del ragionamento stanno SOLO in limits. Nel testo utente (summary, lead, sections, claimLayers, …) non commentare i limiti con meta-frasi difensive.',
    'Esempi NEGATIVI di tono da evitare: scuse sul metodo («meglio osservare senza…»), dichiarazioni su cosa non si può concludere, avvertenze da laboratorio. Preferisci «giorno analizzato» e «andamento».',
    'Cautele: NON affermare ciò che non è misurato; non dichiararlo con meta-frasi.',
    'Segnali deterministici attivi (deterministicSignals.activeIds) vanno considerati quando pertinenti.',
    'Se energy_irregular è attivo: VIETATO usare «costante», «stabile», «regolare» riferiti all’energia/aderenza calorica (la media può essere a target con escursioni ampie). Su Settimana/Mese l’irregolarità energetica è candidato prioritario in toImprove (area energia); su Ieri citabile come contesto, non come verdetto del solo giorno.',
    'Vietato: diagnosi, score 0–100, causalità certe da 1–2 giorni, infiammazione clinica, glicemia non misurata, «sei pronto a spingere».',
    'Vietato nel testo utente: «fascia neutra», «documentato», «calcolato», «derivato», «polisonnografia» (e varianti).',
    'eventRefs e evidenceRefs: usa solo gli alias corti di eventIndex.aliases (e1, e2, …) oppure []. Mai id lunghi.',
    'wentWell/toImprove: array di oggetti { text, area, eventRefs }, mai stringhe semplici.',
    'Rispondi SOLO JSON conforme allo schema.',
  ].join(' ');
}

/**
 * @param {object} dossier
 * @param {{ generatedAt?: Date|number|null }} [opts]
 * @returns {string}
 */
export function buildFocusAiCoachUserPrompt(dossier, opts = {}) {
  const periodLabel = dossier?.periodId === 'ieri'
    ? 'Ieri'
    : dossier?.periodId === 'mese'
      ? 'Mese'
      : 'Settimana';

  const generatedAt = opts.generatedAt instanceof Date
    ? opts.generatedAt
    : (Number.isFinite(Number(opts.generatedAt)) ? new Date(Number(opts.generatedAt)) : new Date());
  const localHour = generatedAt.getHours();
  const localMinute = generatedAt.getMinutes();
  const localClock = `${String(localHour).padStart(2, '0')}:${String(localMinute).padStart(2, '0')}`;

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
      `Variabilità 7g: min ${dvr.recent7dExcludingAnalysisDay?.minIntakeKcal ?? 'n/d'} · max ${dvr.recent7dExcludingAnalysisDay?.maxIntakeKcal ?? 'n/d'} · σ ${dvr.recent7dExcludingAnalysisDay?.stdevKcal ?? 'n/d'} · oltre ±15% target: ${dvr.recent7dExcludingAnalysisDay?.daysBeyondBand ?? 'n/d'} (↑${dvr.recent7dExcludingAnalysisDay?.daysAboveBand ?? 'n/d'} / ↓${dvr.recent7dExcludingAnalysisDay?.daysBelowBand ?? 'n/d'}) · irregular=${dvr.recent7dExcludingAnalysisDay?.irregular === true ? 'true' : 'false'}.`,
      `Target dichiarato: ${dvr.declaredTargetKcal ?? 'n/d'} kcal.`,
      erc?.mealTiming?.lateDinnerLikely
        ? `Pasto più tardivo ~${erc.mealTiming.latestMealHour} (${erc.mealTiming.latestMealLabel || 'pasto'}).`
        : '',
      '[/CONTESTO TEMPORALE]',
    ].filter(Boolean).join('\n')
    : [
      '[CONTESTO TEMPORALE]',
      'Usa kentuEngines + compassSignals; confronta giorno e media recente se presenti.',
      erc?.energyVariability
        ? `Variabilità energia finestra: min ${erc.energyVariability.minIntakeKcal ?? 'n/d'} · max ${erc.energyVariability.maxIntakeKcal ?? 'n/d'} · σ ${erc.energyVariability.stdevKcal ?? 'n/d'} · oltre ±15%: ${erc.energyVariability.daysBeyondBand ?? 'n/d'} (↑${erc.energyVariability.daysAboveBand ?? 'n/d'}/↓${erc.energyVariability.daysBelowBand ?? 'n/d'}) · irregular=${erc.energyVariability.irregular === true ? 'true' : 'false'}.`
        : '',
      '[/CONTESTO TEMPORALE]',
    ].filter(Boolean).join('\n');

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

  const unclassifiedN = Number(fq?.day?.provenanceCounts?.unclassified)
    || Number(fq?.day?.unclassifiedCount)
    || 0;

  return [
    `Genera il RAPPORTO EDITORIALE Kentu Focus per ${periodLabel}.`,
    dossier.horizonBrief || '',
    `Date: analisi ${dossier.analysisDate} · pubblicazione ${dossier.publicationDate}.`,
    `Ora locale di generazione: ${localClock} (fuso del dispositivo).`,
    localHour >= 20
      ? 'Sono già le 20 o oltre: se l’azione riguarda cena/sera, formula per «domani a cena…», non per stasera.'
      : localHour >= 15
        ? 'Nel pomeriggio: se l’azione riguarda il pranzo, formula per «domani a pranzo…».'
        : '',
    '',
    contextBlock,
    '',
    qualityBlock,
    unclassifiedN > 0
      ? `Alimenti senza dati sulla lavorazione: ${unclassifiedN}. Non metterli in summary/card; se utili, citarli solo nei limits con testo chiaro.`
      : '',
    '',
    'FALLIMENTO se todayAction ignora substitutionCandidates quando pertinenti.',
    'FALLIMENTO se due toImprove ripetono la stessa causa (es. cena → surplus e cena → ritmo) senza unirle.',
    'FALLIMENTO se area «sonno» senza segnale sul sonno in sé (durata/qualità); pasti tardivi/abbondanti → area «ritmo».',
    'FALLIMENTO se toImprove con sleep_under_7h + ritmo attivo non accosta cena e ore di sonno in una voce.',
    'FALLIMENTO se lead esiste ma senza dato concreto (numero + contesto: kcal/target/media/ore).',
    'FALLIMENTO se commenti i limiti del ragionamento fuori da limits con meta-frasi difensive.',
    'FALLIMENTO se mancano claimLayers o la chiave quantitativeProposal.',
    'FALLIMENTO se todayAction non è {text,toImproveIndex,eventRefs}, o toImproveIndex fuori range, o eventRefs incompatibili, o testo con alternative « o », o orari/grammi diversi da recommendedAction, o meta-frasi vietate, o codice di classificazione industriale nel summary.',
    'FALLIMENTO se headline ≠ summary.headline.',
    'FALLIMENTO se wentWell/toImprove non sono oggetti {text,area,eventRefs}.',
    '',
    '[FOCUS_INPUT_DATA]',
    JSON.stringify(dossierForModel),
    '[/FOCUS_INPUT_DATA]',
    '',
    'Compila questo JSON:',
    '{',
    '  "summary": { "headline", "wentWell":[{"text","area","eventRefs"}], "toImprove":[{"text","area","eventRefs"}], "todayAction":{"text","toImproveIndex","eventRefs"} },',
    '  "headline": "(= summary.headline)",',
    '  "lead": "con dato concreto OPPURE null",',
    '  "sections": [ { "id", "title", "body" } ],',
    '  "keyInsight": "o null",',
    '  "recommendedAction": "(stessi orari/grammi di todayAction.text)",',
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
