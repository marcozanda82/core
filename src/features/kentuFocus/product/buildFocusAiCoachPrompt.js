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
    'headline: un solo messaggio chiaro. VIETATO bilanciare un segnale negativo con una giustificazione nella stessa frase (es. «sotto il target con media allineata»). Il contesto della media recente va in lead/sections, non nel titolo.',
    'wentWell: 1–2 segnali positivi più significativi. Valuta SEMPRE energia (bilancio vs target dichiarato e vs media recente) e qualità (grassi buoni, integrali, vegetali). Distingui obiettivo DICHIARATO e condotta OSSERVATA.',
    'toImprove: leve concrete con segnale nei dati analizzati. Se due voci condividono la stessa causa (es. cena abbondante → surplus kcal), uniscile in UNA voce; il secondo posto va a un segnale diverso oppure resta un solo item.',
    'Se energy_low_day è attivo (Ieri): è il PRIMO candidato per toImprove (area «energia»), prima dei segnali di ritmo. Il target è già corretto per cut/maintain/bulk: confronta solo introito vs target.',
    'heavy_late_meal attivo solo se la cena supera una soglia assoluta (≥900 kcal oppure ≥40% del target) E ≥45% del totale del giorno. Una cena moderata in un giorno low-energy NON è «abbondante»/«consistente»: non metterla in toImprove come problema di ritmo.',
    'Area: pasti tardivi o abbondanti (solo se heavy_late_meal o meal_within_3h_of_bedtime attivi) → «ritmo». Area «sonno» SOLO se il segnale riguarda il sonno in sé (durata < 7 h, qualità bassa). Un alimento ultra-processato entra in toImprove SOLO se foodQuality.day.nova4Items[].critiqueWorthy=true (Nutri-Score D/E oppure zuccheri≥15g o saturi≥5g/porzione). Fondente ≥70% e altri ultra-processati favorevoli: non criticare.',
    'Durate sempre in formato «1 h 35» / «6 h 30» (ore e minuti), mai decimali («6,5 ore», «1.5 h»). Orari stimati o arrotondati: «verso le 21:40» o «circa le 21:40», non come orario esatto se il dato è approssimato.',
    'Se giorno e media 7g differiscono anche di poco, NON dire «identico» / «uguale»: indica entrambi i valori o la differenza.',
    'Se ritmo attivo (meal_within_3h_of_bedtime, heavy_late_meal) e anche sleep_under_7h: una sola voce (area sonno) che accosta orario cena e ore di sonno, senza causalità — es. «Cena abbondante verso le 21:40 e notte da 6 h 30». eventRefs: sleep:* e food:* del pasto. Se solo ritmo (sonno ≥7 h): area ritmo, senza inventare un effetto sul sonno.',
    'Non usare fasting_over_14h come voce toImprove sul giorno; in settimana/mese solo se active/summaryEligible. Sul giorno, se energy_low_day.preferMorningAction (digiuno >14h osservato oppure primo pasto dopo le 13): todayAction riguarda il PRIMO pasto (aggiungere colazione o anticipare il pranzo), NON la cena.',
    'todayAction: UNA sola leva (niente alternative con « o »). toImproveIndex punta alla voce toImprove scelta; eventRefs compatibili con quella voce (almeno un ref in comune, o stessa area). recommendedAction approfondisce la STESSA leva e riusa gli stessi orari/grammi di todayAction.text.',
    'Se l’ora locale di generazione è già oltre il momento dell’azione (es. cena e sono le 20+), formula todayAction per la prossima occorrenza («Domani a cena…»), non per oggi. Se preferMorningAction: «Domani a colazione…» / «Domani anticipa il pranzo…».',
    'Se substitutionCandidates.byOccasion[occasione] ha voci: usale come sostituto concreto (displayNameMidSentence + porzione). Se la lista stessa-occasione è vuota: proponi la categoria generica in genericFallback (es. «frutta fresca»), MAI un alimento di un’altra occasione. Ignora occasion=unknown.',
    'lead: o contiene almeno un dato concreto (es. kcal del giorno vs target vs media 7g), oppure omettilo (null).',
    'claimLayers e quantitativeProposal sono obbligatori (quantitativeProposal può essere null).',
    'Nel summary usa «ultra-processato»; il codice di classificazione industriale degli alimenti va solo nelle sections se serve.',
    'Se non c’è attività registrata: nei limits, tono neutro.',
    'I limiti del ragionamento stanno SOLO in limits. Nel testo utente (summary, lead, sections, claimLayers, …) non commentare i limiti con meta-frasi difensive.',
    'Esempi NEGATIVI di tono da evitare: scuse sul metodo («meglio osservare senza…»), dichiarazioni su cosa non si può concludere, avvertenze da laboratorio. Preferisci «giorno analizzato» e «andamento».',
    'Cautele: NON affermare ciò che non è misurato; non dichiararlo con meta-frasi.',
    'Segnali deterministici attivi (deterministicSignals.activeIds) vanno considerati quando pertinenti.',
    'Se energy_irregular è attivo: VIETATO usare «costante», «stabile», «regolare» riferiti all’energia/aderenza calorica (la media può essere a target con escursioni ampie). Su Settimana/Mese l’irregolarità energetica è candidato prioritario in toImprove (area energia); su Ieri citabile come contesto, non come verdetto del solo giorno (su Ieri governa energy_low_day se attivo).',
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
  const energyLow = dossier?.deterministicSignals?.energyLowDay
    || (dossier?.deterministicSignals?.signals || []).find((s) => s?.id === 'energy_low_day');
  const signalDetails = (dossier?.deterministicSignals?.signals || [])
    .filter((s) => s?.active || s?.id === 'energy_low_day' || s?.id === 'heavy_late_meal')
    .map((s) => `${s.id}${s.active ? '' : ' (inactive)'}: ${s.detail || ''}`.trim())
    .slice(0, 8);
  const priorityHint = energyLow?.active
    ? [
      'PRIORITÀ IERI: energy_low_day attivo → toImprove[0] area «energia» (deficit vs target).',
      energyLow.preferMorningAction
        ? 'todayAction: primo pasto della giornata (colazione o anticipo pranzo), NON la cena.'
        : 'todayAction: allinea l’introito al target; evita di criticare una cena moderata.',
    ].join(' ')
    : '';
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
    priorityHint,
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
    'FALLIMENTO se energy_low_day attivo e toImprove[0] non è area «energia».',
    'FALLIMENTO se energy_low_day.preferMorningAction e todayAction parla di cena invece del primo pasto.',
    'FALLIMENTO se headline bilancia un negativo con la media recente nella stessa frase.',
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

export const FOCUS_AI_COACH_RESPONSE_SCHEMA_V5 = Object.freeze({
  type: 'object',
  properties: {
    headline: { type: 'string' },
    pillars: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: ['alimentazione', 'sonno', 'movimento', 'forza'] },
          line: { type: 'string' },
          tone: { type: 'string', enum: ['positive', 'neutral', 'improve'] },
          eventRefs: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'line', 'tone', 'eventRefs'],
      },
    },
    action: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        pillar: { type: 'string', enum: ['alimentazione', 'sonno', 'movimento', 'forza'] },
      },
      required: ['text', 'pillar'],
    },
    support: {
      type: 'object',
      nullable: true,
      properties: { text: { type: 'string' } },
    },
    deepDive: {
      type: 'object',
      properties: {
        lead: { type: 'string' },
        sections: { type: 'array' },
        limits: { type: 'array', items: { type: 'string' } },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
      },
      required: ['lead', 'sections', 'limits', 'evidenceRefs'],
    },
  },
  required: ['headline', 'pillars', 'action', 'deepDive'],
});

/**
 * I pilastri arrivano con lo stato già deciso. L'AI lo spiega, non lo giudica di nuovo.
 * @returns {string}
 */
export function buildFocusAiCoachSystemInstructionV5() {
  return [
    'Sei il redattore del rapporto Kentu Focus.',
    'Registro: diretto, asciutto, frasi brevi, seconda persona. «Hai mangiato 3196 kcal», «Hai dormito 8 ore», «Non hai camminato». Mai forme impersonali come «Introito a…» o «Riposo registrato…».',
    'Vietate nel testo per l’utente: introito, apporto, quota, target, riferimento giornaliero, fascia abituale, fascia consueta, nel contesto, uscite variabili. Per il target scrivi «obiettivo».',
    'Per Settimana e Mese, se periodBrief.actionClose è presente, l’azione chiude almeno un terzo della distanza dal riferimento e usa quella quantità esplicita, già arrotondata (almeno 10 minuti, almeno 100 kcal). Una sola leva.',
    'Per Settimana e Mese la line di ogni pilastro racconta il periodo con il keyFact già aggregato (media kcal e giorni fuori fascia, media del sonno e notti, minuti su riferimento, forza come «parte alta N sessioni · parte bassa: nessuna» quando un macro non ha sessioni). Lo stato «ferma da» della forza solo se quel pilastro è fuori rotta. Non raccontare solo l’ultimo giorno.',
    'L’azione inizia una sola volta con periodBrief.actionHorizon: «Oggi» nel giorno, «Questa settimana» o «La prossima settimana», «Questo mese» o «A novembre». Un periodo già concluso parla del periodo successivo. Nel mese la quantità è settimanale («due camminate da 20 minuti ogni settimana»). Se il pilastro è on_track e non c’è una causa dei giorni fuori fascia, l’azione è di mantenimento («Continua così con le camminate»), senza «tieni la stessa linea».',
    'Se la media delle kcal è in fascia ma l’energia è irregolare o i giorni fuori fascia sono almeno 2, l’azione parla della causa di quei giorni (cene abbondanti, primo pasto tardivo, ultimo pasto vicino al sonno), non di aggiungere o togliere kcal sulla media.',
    'Se alcuni alimenti non hanno dati di lavorazione, nei limits scrivi esattamente «Alcuni alimenti non hanno dati sulla lavorazione.» Non citare il catalogo.',
    'Se periodBrief.unconfirmedNote è presente, nei limits inserisci quella frase esatta, per esempio «4 giorni su 7 non confermati».',
    'headline: un solo messaggio chiaro. VIETATO bilanciare un segnale negativo con una giustificazione nella stessa frase (es. «sotto il target con media allineata», «ma la media resta allineata»).',
    'L’azione ha una sola leva: niente alternative con « o ».',
    'Durate nel formato «6 h 50», «7 h 04» o «8 h». I minuti hanno sempre due cifre. Mai decimali come «6,5 ore» o «6.8 h». Accenti: attività, più, perché.',
    'Nei rapporti Settimana e Mese nessun riferimento all’ultima notte o a un giorno singolo (ieri, oggi, stanotte). Se un giorno è il fatto più rilevante del periodo, nominalo con la data, senza «ultima notte».',
    'Lo stato di ogni pilastro è già deciso nel dossier (periodBrief.pillars.status). Spiegalo con un fatto concreto del dossier. Non assegnare un altro stato.',
    'Se periodBrief.pillars[].penalties elenca una penalità, la line di quel pilastro deve citarne la causa anche se lo stato è on_track: heavy_late_meal → «cena abbondante»; late_meal_before_sleep → «ultimo pasto vicino al sonno»; nova4_critique → «ultra-processato sfavorevole».',
    'headline massimo 70 caratteri. Ogni pillars.line massimo 110. action.text massimo 140.',
    'pillars contiene solo i pilastri con active=true. I pilastri senza dati non vanno scritti: il codice aggiunge «non registrato».',
    'tone: on_track → positive; halfway → neutral o improve; off_track → improve. Se c’è restrictive_pattern, il tone di alimentazione non è mai positive: al massimo neutral.',
    'action.pillar deve essere identico a periodBrief.actionPillar. L’orizzonte è il campo action non scritto: periodBrief.horizon. Se il testo inizia già con oggi, questa settimana o questo mese, non aggiungerlo di nuovo.',
    'deepDive è «Perché te lo dico»: lead, sections, limits, evidenceRefs.',
    'Non usare summary, wentWell o toImprove.',
    'Se safety.suppressNumbers è true: nessun numero di calorie, peso o grammi in nessun testo. L’azione propone qualcosa di semplice, senza numeri e senza invitare un professionista.',
    'Se periodBrief.support è presente, compila support.text con un invito delicato a un professionista, senza numeri e senza ripetere l’orizzonte. Se periodBrief.support è null, support è null.',
    'Se c’è un segnale act del salvavita diverso da restrictive_pattern, l’azione riguarda quel segnale.',
    'Se reliability è low e l’orizzonte è il giorno: headline «Un giorno da leggere con calma» e una riga nei limits. Succede solo se il giorno è approssimato o ha buchi. Se reliability è medium (giorno solo non confermato): titolo normale e nei limits «Affidabilità media: il giorno non è confermato». La headline dice lo stato della giornata o del periodo (periodBrief.score: sulla rotta, a metà, fuori rotta), non lo stato del pilastro peggiore. Forma: «Giornata a metà: pasti sotto l\'obiettivo», «Settimana fuori rotta: …», «Mese sulla rotta: …». Dopo i due punti c\'è la causa, presa dal pilastro dell\'azione.',
    'Se il pilastro forza è inactive: nessun riferimento alla forza.',
    'Vietato: diagnosi, punteggi numerici, «sei pronto a spingere», gergo interno (dossier, calcolato, documentato, derivato).',
    'eventRefs e evidenceRefs: solo alias corti del dossier, oppure [].',
    'Rispondi SOLO JSON conforme allo schema v5.',
  ].join(' ');
}

/**
 * @param {object} dossier
 * @returns {string}
 */
export function buildFocusAiCoachUserPromptV5(dossier) {
  const brief = dossier?.periodBrief || {};
  const periodLabel = brief.periodId === 'settimana' || brief.horizon === 'questa settimana'
    ? 'Settimana'
    : brief.periodId === 'mese' || brief.horizon === 'questo mese'
      ? 'Mese'
      : 'Giorno';
  return [
    `Genera il rapporto Kentu Focus per ${periodLabel}.`,
    `Orizzonte dell’azione: ${brief.actionHorizon || brief.horizon || 'oggi'}.`,
    `Pilastro dell’azione, già scelto: ${brief.actionPillar || 'alimentazione'}.`,
    `Affidabilità: ${brief.reliability || 'high'}. Stato del giorno: ${brief.dayStatus || 'n/d'}.`,
    `Salvavita: ${brief.safety?.level || 'none'}.`,
    brief.safety?.suppressNumbers ? 'suppressNumbers attivo: niente calorie, peso o grammi. L’azione resta semplice.' : '',
    brief.support ? 'Card di sostegno dovuta: invito a un professionista in support.text.' : 'Nessuna card di sostegno: support null.',
    brief.periodId === 'settimana' || brief.periodId === 'mese'
      ? 'Periodo: parla dell’insieme. Niente ultima notte, ieri, oggi o stanotte, salvo un fatto del periodo detto con la data.'
      : '',
    brief.actionClose
      ? `Azione: almeno ${brief.actionClose.minimum} ${brief.actionClose.unit}. Forma: «${brief.actionClose.phrase}».`
      : '',
    ...(Array.isArray(brief.pillars) ? brief.pillars.flatMap((pillar) => (
      Array.isArray(pillar.penalties) && pillar.penalties.length
        ? [`Line di ${pillar.id}: cita ${pillar.penalties.join(', ')}, anche se è sulla rotta.`]
        : []
    )) : []),
    (dossier?.generationLimits || []).some((line) => line === 'Alcuni alimenti non hanno dati sulla lavorazione.')
      ? 'Nei limits inserisci «Alcuni alimenti non hanno dati sulla lavorazione.»'
      : '',
    brief.unconfirmedNote ? `Nei limits inserisci «${brief.unconfirmedNote}».` : '',
    brief.movementEstimateNote ? `Nei limits inserisci «${brief.movementEstimateNote}».` : '',
    '',
    '[FOCUS_INPUT_DATA]',
    JSON.stringify(dossier),
    '[/FOCUS_INPUT_DATA]',
    '',
    'Compila questo JSON:',
    '{',
    '  "headline": "",',
    '  "pillars": [ { "id": "", "line": "", "tone": "positive|neutral|improve", "eventRefs": [] } ],',
    '  "action": { "text": "", "pillar": "" },',
    '  "support": null,',
    '  "deepDive": { "lead": "", "sections": [], "limits": [], "evidenceRefs": [] }',
    '}',
  ].filter(Boolean).join('\n');
}
