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
      schema: 'kentu.focusAiCoachAnalysis.v3',
      headline: 'La forza regge, il supporto energetico resta irregolare',
      lead: 'Nella settimana emerge una continuità di stimolo muscolare più chiara della regolarità energetica: le sessioni di forza ci sono, ma il rapporto fra proteine medie e carico non è ancora stabile. Non è un verdetto di “cut”: è una condotta da allineare all’obiettivo dichiarato.',
      sections: [
        {
          id: 'stimolo',
          title: 'Stimolo e distribuzione',
          body: 'I gruppi toccati più spesso meritano continuità; dove manca un distretto non invento un programma bodybuilder — segnalo solo la discontinuità osservata.',
        },
        {
          id: 'energia',
          title: 'Pilota e Bussola',
          body: 'La Bussola legge un bilancio medio rispetto al target operativo, con dead-band: un giorno sotto non fa una fase. Conta la persistenza fuori banda e il carico allenante.',
        },
        {
          id: 'cardio',
          title: 'Cardio nella settimana',
          body: 'I minuti aerobici documentati e quelli classificabili per intensità non sono la stessa metrica del «Cardio / 14gg» in Salute. Se divergono, non si riconciliano inventando.',
        },
      ],
      keyInsight: 'Continuità di forza + proteine medie deboli è un’ipotesi di scarso supporto al recupero — da verificare, non “catabolismo”.',
      recommendedAction: 'Tieni le sessioni di forza già riuscite e porta una porzione proteica già presente nel diario più vicino a due allenamenti della settimana.',
      expectedChange: 'Cambia distribuzione proteica/timing; le kcal giornaliere restano simili se non aggiungi grammi netti. Non cambia il TDEE misurato (non lo abbiamo).',
      verifyNext: 'Nelle prossime due settimane: frequenza forza stabile e sazietà/recupero percepito dopo le sessioni.',
      evidenceRefs: ['kentuEngines.muscleStimulus', 'kentuEngines.bussola', 'kentuEngines.cardio'],
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
      schema: 'kentu.focusAiCoachAnalysis.v3',
      headline: 'Una traiettoria più chiara sul recupero che sull’energia',
      lead: 'Sul mese contano le abitudini ricorrenti: sonno più regolare e stimolo di forza ripetuto favoriscono autonomia e forma; l’energia resta da leggere come condotta media, non come TDEE certo.',
      sections: [
        {
          id: 'traiettoria',
          title: 'Dove sta andando la persona',
          body: 'I segnali favorevoli sono continuità e copertura del diario; i segnali da sorvegliare sono episodi isolati elevati a regola e conflitti obiettivo dichiarato vs condotta osservata.',
        },
        {
          id: 'sonno',
          title: 'Sonno sul mese',
          body: 'La regolarità conta più di una singola notte corta. Senza qualità soggettiva non invento fasi del sonno.',
        },
      ],
      keyInsight: 'Il mese premia ciò che si ripete: forza + sonno stabile battono un singolo surplus/deficit giornaliero.',
      recommendedAction: 'Consolida l’orario di addormentamento già riuscito in più notti registrate, senza aggiungere digiuni inventati.',
      expectedChange: 'Cambia soprattutto la regolarità della routine; non attribuisce anni di vita né rischi clinici individuali.',
      verifyNext: 'Confronta regolarità sonno e frequenza forza sul prossimo mese Focus.',
      evidenceRefs: ['kentuEngines.bussola', 'sleep.seriesRecorded', 'kentuEngines.muscleStimulus'],
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
    schema: 'kentu.focusAiCoachAnalysis.v3',
    headline: 'I carboidrati lontani dai pesi lasciano un buco di supporto',
    lead: 'La giornata non è «tanti pasti e un allenamento»: emerge un supporto proteico serale dopo la forza, con i carboidrati concentrati lontano dalla sessione. La Bussola va letta come condotta rispetto al target dichiarato, non come volontà di cut.',
    sections: [
      {
        id: 'timing',
        title: 'Timing e supporto all’allenamento',
        body: 'Avvicinare carboidrati già presenti nel diario all’orario di forza è un’ipotesi pratica. Non misura una carenza individuale: valuta solo la distribuzione osservata.',
      },
      {
        id: 'pilota',
        title: 'Energia della giornata nel contesto recente',
        body: 'Un singolo giorno sotto il target non definisce la traiettoria. Conta il contesto recente della Bussola e se il segnale è persistente o rumoroso.',
      },
      {
        id: 'sonno',
        title: 'Sonno e recupero',
        body: 'La notte conclusa al risveglio D+1 va letta con pasti e allenamento della giornata D. Senza qualità registrata non invento fasi del sonno.',
      },
    ],
    keyInsight: 'Ipotesi: distribuzione C/P sbilanciata rispetto all’orario di forza — interessante, non causalità certa.',
    recommendedAction: 'Se ripeti lo schema, valuta uno spuntino con un alimento carboidrato già registrato prima dei pesi, lasciando la proteina serale.',
    expectedChange: 'Cambia il timing; le calorie giornaliere restano sostanzialmente invariate se non aggiungi o togli grammi netti.',
    verifyNext: 'Nelle prossime 1–2 sessioni di forza, nota energia in sala e sazietà serale.',
    evidenceRefs: ['kentuEngines.muscleStimulus', 'kentuEngines.bussola', 'nutrition.meals'],
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
