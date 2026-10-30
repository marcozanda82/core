/**
 * Anteprima MOCK del rapporto editoriale Focus — solo UI/dev.
 * NON è output Gemini. Sempre etichettare in UI.
 */

/**
 * @param {'ieri'|'settimana'|'mese'} periodId
 * @returns {object}
 */
export function buildFocusEditorialMockAnalysis(periodId = 'ieri') {
  const p = String(periodId || 'ieri').toLowerCase();

  if (p === 'settimana') {
    return {
      schema: 'kentu.focusAiCoachAnalysis.v4',
      headline: 'La forza regge, il supporto energetico resta irregolare',
      summary: {
        headline: 'La forza regge, il supporto energetico resta irregolare',
        wentWell: [
          { text: 'Tre sessioni di forza con gruppi ripetuti', area: 'movimento', eventRefs: [] },
          { text: 'Sonno medio sopra le 7 ore', area: 'sonno', eventRefs: [] },
        ],
        toImprove: [
          { text: 'Energia giornaliera fuori fascia in 4 giorni su 7', area: 'energia', eventRefs: [] },
          { text: 'Proteine medie sotto il supporto alle sessioni', area: 'qualita', eventRefs: [] },
        ],
        todayAction: {
          text: 'Porta una porzione proteica già presente nel diario più vicino a due allenamenti della settimana.',
          toImproveIndex: 1,
          eventRefs: [],
        },
      },
      lead: 'Nella settimana emerge una continuità di stimolo muscolare più chiara della regolarità energetica: le sessioni di forza ci sono, ma il rapporto fra proteine medie e carico non è ancora stabile.',
      sections: [
        {
          id: 'stimolo',
          title: 'Stimolo e distribuzione',
          body: 'I gruppi toccati più spesso meritano continuità; dove manca un distretto non invento un programma — segnalo solo la discontinuità osservata.',
        },
        {
          id: 'energia',
          title: 'Energia nella settimana',
          body: 'Conta la persistenza fuori fascia ±15% rispetto al target, non un singolo giorno.',
        },
      ],
      keyInsight: 'Continuità di forza + proteine medie deboli è un’ipotesi di scarso supporto al recupero — da verificare.',
      recommendedAction: 'Tieni le sessioni di forza già riuscite e porta una porzione proteica già presente nel diario più vicino a due allenamenti della settimana.',
      expectedChange: 'Cambia distribuzione proteica/timing; le kcal giornaliere restano simili se non aggiungi grammi netti.',
      verifyNext: 'Nelle prossime due settimane: frequenza forza stabile e sazietà/recupero percepito dopo le sessioni.',
      evidenceRefs: ['kentuEngines.muscleStimulus', 'kentuEngines.bussola'],
      limits: [
        'MOCK UI — non è un’analisi Gemini reale.',
        'Persistenza su pochi giorni ≠ traiettoria mensile.',
      ],
      primaryPillarId: 'exercise',
      _mock: true,
      _mockLabel: 'SIMULAZIONE EDITORIALE — non Gemini',
    };
  }

  if (p === 'mese') {
    return {
      schema: 'kentu.focusAiCoachAnalysis.v4',
      headline: 'Una traiettoria più chiara sul recupero che sull’energia',
      summary: {
        headline: 'Una traiettoria più chiara sul recupero che sull’energia',
        wentWell: [
          { text: 'Sonno più regolare nelle ultime tre settimane', area: 'sonno', eventRefs: [] },
          { text: 'Forza ripetuta sullo stesso schema', area: 'movimento', eventRefs: [] },
        ],
        toImprove: [
          { text: 'Oscillazione calorica ancora ampia sul mese', area: 'energia', eventRefs: [] },
        ],
        todayAction: {
          text: 'Consolida l’orario di addormentamento già riuscito in più notti registrate.',
          toImproveIndex: 0,
          eventRefs: [],
        },
      },
      lead: 'Sul mese contano le abitudini ricorrenti: sonno più regolare e stimolo di forza ripetuto favoriscono autonomia e forma.',
      sections: [
        {
          id: 'traiettoria',
          title: 'Dove sta andando la persona',
          body: 'I segnali favorevoli sono continuità e copertura del diario; i segnali da sorvegliare sono episodi isolati elevati a regola.',
        },
      ],
      keyInsight: 'Il mese premia ciò che si ripete: forza + sonno stabile battono un singolo surplus/deficit giornaliero.',
      recommendedAction: 'Consolida l’orario di addormentamento già riuscito in più notti registrate, senza aggiungere digiuni inventati.',
      expectedChange: 'Cambia soprattutto la regolarità della routine.',
      verifyNext: 'Confronta regolarità sonno e frequenza forza sul prossimo mese Focus.',
      evidenceRefs: ['sleep.seriesRecorded', 'kentuEngines.muscleStimulus'],
      limits: [
        'MOCK UI — non è un’analisi Gemini reale.',
        'Target calorico ≠ TDEE misurato.',
      ],
      primaryPillarId: 'balanced',
      _mock: true,
      _mockLabel: 'SIMULAZIONE EDITORIALE — non Gemini',
    };
  }

  // ieri
  return {
    schema: 'kentu.focusAiCoachAnalysis.v4',
    headline: 'I carboidrati lontani dai pesi lasciano un buco di supporto',
    summary: {
      headline: 'I carboidrati lontani dai pesi lasciano un buco di supporto',
      wentWell: [
        { text: 'Proteina serale dopo la forza', area: 'qualita', eventRefs: [] },
        { text: 'Sonno di 8 ore concluso al risveglio', area: 'sonno', eventRefs: [] },
      ],
      toImprove: [
        { text: 'Carboidrati concentrati lontano dalla sessione', area: 'ritmo', eventRefs: [] },
        { text: 'Ultimo pasto troppo vicino al sonno', area: 'ritmo', eventRefs: [] },
      ],
      todayAction: {
        text: 'Sposta 180 g di riso già nel diario a uno spuntino prima dei pesi.',
        toImproveIndex: 0,
        eventRefs: [],
      },
    },
    lead: 'La giornata non è «tanti pasti e un allenamento»: emerge un supporto proteico serale dopo la forza, con i carboidrati concentrati lontano dalla sessione.',
    sections: [
      {
        id: 'timing',
        title: 'Timing e supporto all’allenamento',
        body: 'Avvicinare carboidrati già presenti nel diario all’orario di forza è un’ipotesi pratica.',
      },
      {
        id: 'energia',
        title: 'Energia della giornata nel contesto recente',
        body: 'Un singolo giorno sotto il target non definisce la traiettoria. Conta il contesto recente e se il segnale è persistente.',
      },
    ],
    keyInsight: 'Ipotesi: distribuzione C/P sbilanciata rispetto all’orario di forza — interessante, non causalità certa.',
    recommendedAction: 'Sposta 180 g di riso già nel diario a uno spuntino prima dei pesi, lasciando la proteina serale.',
    expectedChange: 'Cambia il timing; le calorie giornaliere restano sostanzialmente invariate se non aggiungi o togli grammi netti.',
    verifyNext: 'Nelle prossime 1–2 sessioni di forza, nota energia in sala e sazietà serale.',
    evidenceRefs: ['kentuEngines.muscleStimulus', 'nutrition.meals'],
    limits: [
      'MOCK UI — non è un’analisi Gemini reale.',
      'Una sola giornata non prova una tendenza settimanale.',
    ],
    primaryPillarId: 'nutrition',
    quantitativeProposal: {
      foodName: 'Riso',
      grams: 180,
      fromMeal: 'pranzo',
      toTiming: 'spuntino pre-allenamento',
      rationale: 'Avvicinare C all’allenamento',
      dailyKcalUnchanged: true,
    },
    _mock: true,
    _mockLabel: 'SIMULAZIONE EDITORIALE — non Gemini',
  };
}
