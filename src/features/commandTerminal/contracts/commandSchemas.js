const mealTypeEnum = ['colazione', 'snack', 'pranzo', 'cena'];

export const foodItemSchema = {
  type: 'object',
  properties: {
    foodName: {
      type: 'string',
      description:
        'Stringa pulita da cercare nel database, es: "pane integrale", "sardine all\'olio". '
        + 'NO grammi, NO congiunzioni (e/ed/con), NO articoli quantitativi, NO numeri. '
        + 'VIETATO: "e 160 g di pane", "90g sardine", "e pane". '
        + 'La quantita va SOLO in grams.',
    },
    icon: {
      type: 'string',
      description:
        'EMOJI PRECISA OBBLIGATORIA: la singola emoji piu accurata basata sulla lavorazione del cibo. '
        + 'Es: pomodoro→🍅, passata di pomodoro→🥫, salmone→🐟, piadina→🫓, pasta→🍝, pane→🥖, yogurt→🥣. '
        + 'VIETATO testo o piu emoji: solo 1 pittogramma.',
    },
    grams: {
      type: 'number',
      nullable: true,
      description:
        'Peso in grammi ASSOCIATO IN MODO ESCLUSIVO a QUESTO alimento (campo weight negli esempi). '
        + 'Esempio: "90g sardine e 160g pane" → sardine=90, pane=160. '
        + 'VIETATO duplicare il peso del primo alimento sui successivi. '
        + 'Grammi espliciti → isEstimated=false; unita/pezzi da dizionario → isEstimated=false; '
        + 'unita senza dizionario → stima + isEstimated=true; nessuna quantita → null.',
    },
    isEstimated: {
      type: 'boolean',
      nullable: true,
      description:
        'false se grams viene da User_Portions_Dictionary o da grammi espliciti utente. '
        + 'true SOLO se stima media universale (alimento assente dal dizionario). Ometti/false se grams assente.',
    },
    searchKeywords: {
      type: 'array',
      nullable: true,
      description:
        'Espansione semantica per la ricerca DB. DEVE contenere: '
        + '(1) il termine esatto detto dall utente, '
        + '(2) l opposto singolare/plurale (noci→noce, mela→mele), '
        + '(3) i sinonimi italiani piu comuni (cocomero→anguria, arachidi→noccioline, brioche→cornetto). '
        + 'Max 8 stringhe brevi. foodName resta il termine primario; searchKeywords amplia il matching.',
      items: { type: 'string' },
    },
  },
  required: ['foodName', 'icon'],
};

/** Alimento risultante dopo mutazione (source of truth per overwrite Firebase). */
export const resultingFoodItemSchema = {
  type: 'object',
  properties: {
    itemId: {
      type: 'string',
      nullable: true,
      description:
        'ID stabile da [TODAY_DIARY_INDEX]/[EXISTING_MEAL_NODE] se l alimento era gia presente. Ometti per nuovi add.',
    },
    foodName: {
      type: 'string',
      description: 'Nome PURO ingrediente senza grammi/parentesi/congiunzioni.',
    },
    foodDbKey: { type: 'string', nullable: true },
    grams: {
      type: 'number',
      description: 'Grammi finali (> 0) dopo la mutazione.',
    },
    kcal: { type: 'number' },
    pro: { type: 'number' },
    carbo: { type: 'number' },
    fat: { type: 'number' },
  },
  required: ['foodName', 'grams'],
};

/**
 * Operazione atomica su un pasto loggato (superficie LLM).
 * Il commit reale resta un overwrite completo via resultingItems/items.
 */
export const mealMutationOperationSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['add', 'update', 'delete'],
      description:
        'add = nuovo alimento; update = cambia nome/grammi di un item esistente; delete = rimuovi item esistente.',
    },
    targetItemId: {
      type: 'string',
      nullable: true,
      description:
        'Obbligatorio per update/delete: copia itemId da [TODAY_DIARY_INDEX] o [EXISTING_MEAL_NODE]. Per add: null o ometti.',
    },
    matchHint: {
      type: 'string',
      nullable: true,
      description:
        'Nome grezzo citato dall utente (es. "olio", "pasta") utile se targetItemId e ambiguo.',
    },
    updatedFood: {
      type: 'object',
      nullable: true,
      description:
        'Obbligatorio per add/update: { foodName, grams }. Per delete: null o ometti.',
      properties: {
        foodName: {
          type: 'string',
          description: 'Nome PURO alimento.',
        },
        grams: {
          type: 'number',
          description: 'Grammi (> 0).',
        },
      },
      required: ['foodName', 'grams'],
    },
  },
  required: ['action'],
};

export const addFoodPayloadSchema = {
  type: 'object',
  description:
    'Payload ADD_FOOD — attivare quando l utente dichiara di aver mangiat/o/bevuto qualcosa, '
    + 'elenca alimenti o ingredienti, cita un pasto (colazione/snack/pranzo/cena) con cibo, '
    + 'o chiede di registrare calorie. Esempio: "come snack alle 19 ho mangiato sardine".',
  properties: {
    items: {
      type: 'array',
      description:
        'Se l utente elenca piu alimenti, crea UN oggetto SEPARATO per CIASCUN alimento. '
        + 'Associa a ogni alimento ESATTAMENTE la sua grammatura specifica indicata nel testo. '
        + 'E severamente vietato duplicare il peso del primo alimento sui successivi. '
        + 'Le congiunzioni (e, ed, con, piu, virgola) SEPARANO alimenti e NON entrano mai nel foodName. '
        + 'ONE-SHOT ESEMPIO: input "90g sardine e 160g pane" → '
        + '[{"foodName":"sardine","grams":90,"isEstimated":false},{"foodName":"pane","grams":160,"isEstimated":false}]. '
        + 'ESEMPIO 2: "90 g di sardine e 160 g di pane" → stessi due oggetti (foodName senza "di"/numeri). '
        + 'ESEMPIO 3: "pane 160g, tonno 56g, pomodoro 200g e pesca 100g" = 4 voci, NON 5.',
      items: foodItemSchema,
      minItems: 1,
    },
    foodName: {
      type: 'string',
      description:
        'Legacy: singolo alimento. Preferisci items[] se l utente ne elenca piu di uno.',
    },
    grams: {
      type: 'number',
      nullable: true,
      description:
        'Legacy singolo alimento: stessi criteri di items[].grams (esplicito → isEstimated false; unita/pezzi → stima + isEstimated true).',
    },
    isEstimated: {
      type: 'boolean',
      nullable: true,
      description: 'Legacy: flag stima per singolo alimento. Preferisci items[].isEstimated.',
    },
    mealType: {
      type: 'string',
      enum: mealTypeEnum,
      nullable: true,
      description:
        'Momento del pasto SOLO se l utente lo ha indicato esplicitamente (colazione/snack/pranzo/cena). Altrimenti null o ometti.',
    },
    timeString: {
      type: 'string',
      nullable: true,
      description:
        'Orario esplicito del pasto in HH:mm SOLO se l utente lo indica (es. ore 14:45, alle 20:30). Altrimenti null o ometti.',
    },
    exactTime: {
      type: 'string',
      nullable: true,
      description:
        'Alias di timeString: orario esplicito HH:mm se indicato dall utente nel messaggio.',
    },
    notes: {
      type: 'string',
      description: 'Note aggiuntive opzionali',
    },
    message: {
      type: 'string',
      description:
        'UNA sola frase informale e diretta che usa il displayName dell utente '
        + '(es. "Marco, ecco il tuo snack pronto da confermare."). '
        + 'VIETATO tono da referto, frasi standard, budget, cilindri o macro. '
        + 'Se non conosci il nome, ometti il vocativo ma resta colloquiale.',
    },
  },
};

export const addWorkoutExerciseItemSchema = {
  type: 'object',
  properties: {
    exerciseName: {
      type: 'string',
      description: 'Nome esercizio citato dall utente o risolto via SMART RESOLUTION',
    },
    sets: {
      type: 'number',
      nullable: true,
      description: 'Serie solo se citate o da storico abituale',
    },
    reps: {
      type: 'number',
      nullable: true,
      description: 'Ripetizioni solo se citate o da storico abituale',
    },
    weightKg: {
      type: 'number',
      nullable: true,
      description: 'Carico in kg solo se citato o da storico abituale',
    },
    durationMinutes: {
      type: 'number',
      nullable: true,
      description: 'Durata esercizio in minuti se citata',
    },
  },
  required: ['exerciseName'],
};

export const workoutTypeEnum = ['spinta', 'trazione', 'gambe', 'cardio', 'altro'];

export const addWorkoutPayloadSchema = {
  type: 'object',
  properties: {
    workoutType: {
      type: 'string',
      enum: workoutTypeEnum,
      description:
        'OBBLIGATORIO. NORMALIZZA sempre il linguaggio utente: '
        + 'legs/lower/quad/squat/leg day/affondi → gambe; '
        + 'push/petto/spalle/tricipiti/panca → spinta; '
        + 'pull/dorso/schiena/bicipiti/trazioni/rematore → trazione; '
        + 'corsa/bike/HIIT/tapis/nuoto → cardio; '
        + 'allenamento generico senza gruppo chiaro → altro.',
    },
    workoutName: {
      type: 'string',
      nullable: true,
      description:
        'Etichetta sintetica (es. "Allenamento gambe"). Se assente, il sistema la deriva da workoutType. '
        + 'Per "ho fatto gambe" senza lista esercizi: workoutName puo essere "Allenamento gambe" e exercises=[].',
    },
    durationMinutes: {
      type: 'number',
      nullable: true,
      description:
        'Minuti SOLO se l utente li ha indicati esplicitamente (es. 45 min, 1 ora). '
        + 'Se assenti: null o ometti — NON inventare. Il sistema applica un default (45).',
    },
    exercises: {
      type: 'array',
      description:
        'Esercizi ESPLICITAMENTE citati. Per sessione generica ("allenamento gambe alle 18") lascia []. '
        + 'Vietato aggiungere riscaldamento/defaticamento non menzionati.',
      items: addWorkoutExerciseItemSchema,
    },
    estimatedKcal: {
      type: 'number',
      nullable: true,
      description: 'Stima kcal solo se citata esplicitamente',
    },
    timeString: {
      type: 'string',
      nullable: true,
      description: 'Orario HH:mm se citato (es. alle 18.00 → 18:00). Altrimenti ometti.',
    },
    exactTime: {
      type: 'string',
      nullable: true,
      description: 'Alias di timeString (HH:mm).',
    },
    notes: {
      type: 'string',
      description: 'Note aggiuntive opzionali',
    },
    trainingGoal: {
      type: 'string',
      nullable: true,
      enum: ['Ipertrofia', 'Forza', 'Resistenza', 'Mantenimento', 'Junk'],
      description:
        'Obiettivo allenamento se menzionato (Ipertrofia, Forza, Resistenza, Mantenimento, Junk). Ometti se non citato.',
    },
    rpe: {
      type: 'number',
      nullable: true,
      minimum: 1,
      maximum: 10,
      description:
        'RPE / fatica percepita intera 1-10 se l utente la menziona. Ometti se non citata.',
    },
    progressionNote: {
      type: 'string',
      nullable: true,
      description:
        'Note su carichi, esercizi, variazioni o sensazioni. Ometti se non citate.',
    },
  },
  required: ['workoutType'],
};

export const logSleepPayloadSchema = {
  type: 'object',
  properties: {
    durationHours: {
      type: 'number',
      minimum: 0.01,
      description:
        'Ore totali di sonno in formato decimale. ATTENZIONE MATEMATICA: converti ore e minuti (es. 7h 30m = 7.5, 7h 15m = 7.25). Non restituire MAI 0.',
    },
    deepSleepPhase: {
      type: 'number',
      description:
        'Ore di sonno profondo in formato decimale. Cerca voce Profondo (es. 1 ora 43 min = 1.71). Formula: ore + minuti/60.',
    },
    qualityScore: {
      type: 'number',
      description:
        'Punteggio sonno intero estratto da etichetta punti wearable (es. 80 punti = 80). Non confondere con sleepQuality (stelle 1-5).',
    },
    sleepQuality: {
      type: 'number',
      nullable: true,
      minimum: 1,
      maximum: 5,
      description:
        'Valutazione soggettiva del sonno in stelle 1-5 se l utente la menziona esplicitamente (es. "ho dormito bene 4 stelle", "qualita 3/5"). Ometti se non citata.',
    },
  },
  required: ['durationHours'],
};

export const terminalCommandEnvelopeSchema = {
  type: 'object',
  properties: {
    commandType: {
      type: 'string',
      enum: [
        'ADD_FOOD',
        'ADD_WORKOUT',
        'LOG_SLEEP',
        'CHAT_RESPONSE',
        'ASK_CLARIFICATION',
        'REQUEST_FOOD_PHOTO',
      ],
      description:
        'ADD_FOOD = trigger quando l utente dichiara di aver mangiat/o/bevuto qualcosa, elenca alimenti/ingredienti, '
        + 'cita colazione/snack/pranzo/cena con cibo, o chiede di registrare calorie di un pasto (anche discorsivo: '
        + '"come snack alle 19 ho mangiato sardine"). '
        + 'ADD_WORKOUT/LOG_SLEEP = altri inserimenti dati (CASO 1). '
        + 'ASK_CLARIFICATION = proposta maggiordomo / conferma rapida: message con il «solito» + options[] (Sì va bene / oggi diverso). '
        + 'REQUEST_FOOD_PHOTO = alimento sconosciuto: chiedi foto etichetta/confezione (niente ricerche forzate). '
        + 'CHAT_RESPONSE = SOLO domanda di consulto sullo stato SENZA assunzione di cibo (CASO 2). '
        + 'VIETATO CHAT_RESPONSE se il messaggio descrive cibo mangiato (usa ADD_FOOD, ASK_CLARIFICATION o REQUEST_FOOD_PHOTO).',
    },
    payload: {
      type: 'object',
      description:
        'Payload del comando. Se commandType e ADD_FOOD usa schema cibo, se ADD_WORKOUT usa schema allenamento, '
        + 'se LOG_SLEEP usa schema sonno, se ASK_CLARIFICATION usa { message, options[] }, '
        + 'se REQUEST_FOOD_PHOTO usa { message, foodName? }, '
        + 'se CHAT_RESPONSE usa { message } oppure oggetto vuoto '
        + '(il testo della risposta va in uiMessage o adviceMessage).',
    },
    uiMessage: {
      type: 'string',
      description:
        'Per CHAT_RESPONSE / ASK_CLARIFICATION / REQUEST_FOOD_PHOTO: testo breve (TTS). Per ADD_FOOD: lascia VUOTO (il sistema genera il testo).',
    },
    adviceMessage: {
      type: 'string',
      nullable: true,
      description:
        'Per CHAT_RESPONSE: testo consulenziale breve (alias di uiMessage). '
        + 'Per ADD_FOOD: lascia VUOTO. VIETATO allarmi/budget/cilindri in registrazione pasto.',
    },
    confidence: {
      type: 'number',
      description: 'Confidenza del modello tra 0 e 1',
    },
    requiresConfirmation: {
      type: 'boolean',
      description: 'Se true il comando richiede conferma utente. Per CHAT_RESPONSE: false.',
    },
  },
  required: ['commandType', 'payload'],
};

export const chatResponsePayloadSchema = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      nullable: true,
      description:
        'Analisi testuale BREVE (1-3 frasi, tono coach, adatta a TTS) basata ESCLUSIVAMENTE su KENTU_GLOBAL_STATE. '
        + 'Puoi anche mettere il testo in uiMessage/adviceMessage.',
    },
    options: {
      type: 'array',
      nullable: true,
      description:
        'Opzionale: 2-4 scelte rapide se serve un chiarimento leggero. Preferisci ASK_CLARIFICATION per ambiguita forti.',
      items: { type: 'string' },
    },
  },
};

/** Chiarimento interattivo: proposta maggiordomo + pulsanti (VUI-ready). */
export const askClarificationPayloadSchema = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description:
        'Proposta esplicita stile maggiordomo (1-3 frasi TTS). Es: «Ho annotato pane e pomodoro. '
        + 'Per il pane, inserisco il tuo solito Pane bauletto integrale, o oggi hai mangiato un tipo diverso? '
        + 'Posso segnare 50g per il pane e 100g per il pomodoro come al solito, o vuoi cambiare le quantità?». '
        + 'VIETATO domande aperte tipo «Che tipo di pane?».',
    },
    options: {
      type: 'array',
      description:
        '2-4 opzioni cliccabili. Preferisci: «Sì, va bene», «Oggi è diverso», eventuali alternative abituali. '
        + 'Ogni stringa sara inviata come risposta utente.',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 4,
    },
  },
  required: ['message', 'options'],
};

/** Alimento sconosciuto: chiedi foto etichetta (fallback visivo). */
export const requestFoodPhotoPayloadSchema = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description:
        'Messaggio TTS: «Questo prodotto non credo di averlo in memoria. Puoi fargli una foto veloce all\'etichetta o alla confezione?»',
    },
    foodName: {
      type: 'string',
      nullable: true,
      description: 'Nome alimento non risolto, se noto.',
    },
    options: {
      type: 'array',
      nullable: true,
      description: 'Opzionale: es. «📷 Scatta foto etichetta», «Te lo descrivo a parole».',
      items: { type: 'string' },
      maxItems: 4,
    },
  },
  required: ['message'],
};

export const consultantResponseSchema = {
  type: 'object',
  properties: {
    adviceMessage: {
      type: 'string',
      description:
        'Messaggio analitico e diretto in italiano (max 5 frasi). Cita sforamenti o residui macro in grammi/kcal '
        + '(es. "La tua proposta sfora i grassi di 15g. Ecco le grammature calibrate per restare in traiettoria."). '
        + 'Niente semafori, niente tono motivazionale, niente CTA "Quale opzione preferisci?".',
    },
    suggestedAction: {
      type: 'object',
      nullable: true,
      description:
        'Azione di inserimento rapido singolo alimento con grams già ottimizzati sul remaining dogmatico; null se non applicabile.',
      properties: {
        foodName: {
          type: 'string',
          description: 'Nome esatto dell alimento scelto tra i candidati DB forniti nel prompt.',
        },
        grams: {
          type: 'number',
          description: 'Porzione matematicamente calibrata in grammi (> 0) rispetto a [DOGMATIC_RECEIPT].remaining.',
        },
        mealType: {
          type: 'string',
          enum: mealTypeEnum,
          description: 'Pasto target: colazione, snack, pranzo o cena.',
        },
      },
      required: ['foodName', 'grams', 'mealType'],
    },
    suggestions: {
      type: 'array',
      description:
        'WIP Meal Builder: Smart Chips integrativi da aggiungere al carrello pasto in corso. Compila SOLO per intent WIP_MEAL_BUILD. 3-5 suggerimenti con name, weight (grammi ottimizzati sul residuo), calories, macros {prot,carb,fat}, reason analitica.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome alimento puro senza grammature.' },
          weight: { type: 'number', description: 'Grammi calibrati sul remaining (> 0).' },
          calories: { type: 'number', description: 'Kcal stimate per la porzione.' },
          macros: {
            type: 'object',
            properties: {
              prot: { type: 'number' },
              carb: { type: 'number' },
              fat: { type: 'number' },
            },
          },
          reason: { type: 'string', description: 'Motivo analitico (macro residui da coprire).' },
        },
        required: ['name', 'weight'],
      },
    },
    mealProposals: {
      type: 'array',
      description:
        'Proposte pasto con grammature OTTIMIZZATE dal Solver (alimentano MealProposalCards). '
        + 'Scenario aperto: grams calcolati per saturare remaining. Scenario chiuso: grams corretti se la proposta utente sfora. '
        + 'Per UPDATE_LOGGED_MEAL: UNA sola proposta con targetNodeId + operations + resultingItems.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          mealType: { type: 'string', enum: mealTypeEnum },
          exactTime: {
            type: 'string',
            nullable: true,
            description: 'Orario esplicito HH:mm se indicato dall utente (es. ore 14:45).',
          },
          targetNodeId: {
            type: 'string',
            nullable: true,
            description:
              'ID nodo pasto esistente da sovrascrivere (UPDATE_LOGGED_MEAL). Copia da [EXISTING_MEAL_NODE].targetNodeId o [TODAY_DIARY_INDEX][].targetNodeId.',
          },
          source: { type: 'string' },
          operations: {
            type: 'array',
            description:
              'UPDATE_LOGGED_MEAL: operazioni atomiche (add|update|delete) derivate dalla richiesta utente e da [TODAY_DIARY_INDEX]. Usate per UI/diff; il salvataggio usa resultingItems.',
            items: mealMutationOperationSchema,
          },
          resultingItems: {
            type: 'array',
            description:
              'UPDATE_LOGGED_MEAL — SOURCE OF TRUTH: lista FINALE completa degli alimenti del pasto DOPO aver applicato operations. Mai vuota. Copia gli stessi oggetti anche in items[].',
            items: resultingFoodItemSchema,
          },
          items: {
            type: 'array',
            description:
              'Lista COMPLETA alimenti del pasto con grams OTTIMIZZATI dal Solver. Ogni voce DEVE avere foodName e grams > 0. '
              + 'Questi grams alimentano direttamente le MealProposalCards. Per UPDATE_LOGGED_MEAL: deve coincidere con resultingItems.',
            items: {
              type: 'object',
              properties: {
                itemId: {
                  type: 'string',
                  nullable: true,
                  description: 'ID stabile da [TODAY_DIARY_INDEX] se presente.',
                },
                foodName: {
                  type: 'string',
                  description:
                    'Nome PURO ingrediente: senza grammi, parentesi o congiunzioni iniziali (es. "Pesca", non "e pesca 100 g").',
                },
                foodDbKey: { type: 'string', nullable: true },
                grams: {
                  type: 'number',
                  description:
                    'Grammatura ottimizzata (scenario aperto: saturazione remaining; scenario chiuso: correzione anti-sforamento).',
                },
                kcal: { type: 'number' },
                pro: { type: 'number' },
                carbo: { type: 'number' },
                fat: { type: 'number' },
              },
              required: ['foodName', 'grams'],
            },
          },
          totals: {
            type: 'object',
            properties: {
              kcal: { type: 'number' },
              pro: { type: 'number' },
              carbo: { type: 'number' },
              fat: { type: 'number' },
            },
          },
        },
        required: ['label', 'mealType', 'items'],
      },
    },
  },
  required: ['adviceMessage'],
};

/**
 * Schema LLM — HealthAnalyzerEngine (lazy labeling NOVA + referto salute giornaliero).
 */
export const healthReportSchema = {
  type: 'object',
  properties: {
    newLabels: {
      type: 'array',
      description:
        'Etichette salute SOLO per alimenti in unknownFoods. Array vuoto se non ci sono cibi da classificare. '
        + 'Copia foodDbKey quando fornito nel prompt.',
      items: {
        type: 'object',
        properties: {
          foodDbKey: {
            type: 'string',
            nullable: true,
            description: 'Chiave DB personale se nota; altrimenti null.',
          },
          foodName: {
            type: 'string',
            description: 'Nome alimento classificato.',
          },
          novaScore: {
            type: 'number',
            description: 'Classificazione NOVA intera 1–4 (1 minimo processamento, 4 ultra-processato).',
          },
          inflammationFactor: {
            type: 'number',
            description: 'Fattore infiammatorio: -1 anti-infiammatorio, 0 neutro, +1 pro-infiammatorio.',
          },
          hasSaturatedFats: {
            type: 'boolean',
            description: 'true se l alimento è rilevante fonte di grassi saturi.',
          },
        },
        required: ['foodName', 'novaScore', 'inflammationFactor', 'hasSaturatedFats'],
      },
    },
    dailyScore: {
      type: 'number',
      description: 'Score salute giornata 0–100 (qualità cibo + timing).',
    },
    inflammationSummary: {
      type: 'string',
      description: 'Sintesi analitica del bilancio infiammatorio della giornata (italiano, max 3 frasi).',
    },
    timingFeedback: {
      type: 'string',
      description:
        'Feedback sul timing dei pasti (es. carico glicemico serale, digiuno, distribuzione). Italiano, max 3 frasi.',
    },
    sleepCorrelationInsight: {
      type: 'string',
      nullable: true,
      description:
        'Correlazione cena di ieri (orario, macro, carico glicemico) con qualità/ore del sonno registrato stamattina. '
        + 'Se [MORNING_SLEEP_LOG] è null, spiega brevemente che manca il dato sonno. Italiano, max 3 frasi.',
    },
  },
  required: ['newLabels', 'dailyScore', 'inflammationSummary', 'timingFeedback'],
};

// Nuovo alimento da etichetta (Vision): solo dati stampati, per 100g.
export const createNewFoodPayloadSchema = {
  type: 'object',
  properties: {
    desc: { type: 'string', description: 'Nome del prodotto/alimento come stampato o ricostruito dal titolo etichetta.' },
    kcal: { type: 'number', nullable: true, description: 'kcal per 100g se stampate, altrimenti null' },
    prot: { type: 'number', nullable: true, description: 'Proteine per 100g se stampate, altrimenti null' },
    carb: { type: 'number', nullable: true, description: 'Carboidrati per 100g se stampati, altrimenti null' },
    fatTotal: { type: 'number', nullable: true, description: 'Grassi per 100g se stampati, altrimenti null' },
    fibre: { type: 'number', nullable: true, description: 'Fibre per 100g se stampate, altrimenti null' },
  },
  required: ['desc'],
};

export const geminiToolSchemas = Object.freeze({
  ADD_FOOD: {
    name: 'dispatch_add_food',
    description:
      'Aggiunge uno o piu alimenti al diario. items[]: un oggetto per alimento citato; foodName = nome puro (no grammi/parentesi/congiunzioni); grams separato. Nessun duplicato da "e"/virgole.',
    inputSchema: addFoodPayloadSchema,
  },
  ADD_WORKOUT: {
    name: 'dispatch_add_workout',
    description:
      'Crea un comando tipizzato per aggiungere un allenamento al diario (nome e durata obbligatori).',
    inputSchema: addWorkoutPayloadSchema,
  },
  LOG_SLEEP: {
    name: 'dispatch_log_sleep',
    description:
      'Estrae e registra dati sonno da testo o screenshot smartwatch (durationHours obbligatorio).',
    inputSchema: logSleepPayloadSchema,
  },
});
