const mealTypeEnum = ['colazione', 'snack', 'pranzo', 'cena'];

export const foodItemSchema = {
  type: 'object',
  properties: {
    foodName: {
      type: 'string',
      description:
        'Nome PURO dell ingrediente, senza grammature, parentesi, virgole finali o congiunzioni iniziali. Esempi corretti: "Pane integrale con semi e noci", "Tonno al naturale", "Pomodoro", "Pesca". VIETATO: "e pesca", "pesca 100 g", "pomodoro 200 g", "(160g)". La quantita va SOLO in grams, mai nel nome.',
    },
    grams: {
      type: 'number',
      nullable: true,
      description:
        'Quantita in grammi SOLO se l utente la ha indicato esplicitamente nel testo (es. 160g, 56 g). Se non specificata: null o ometti — NON stimare. MAI includere grammi nel foodName.',
    },
  },
  required: ['foodName'],
};

export const addFoodPayloadSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description:
        'TUTTI e SOLO gli alimenti menzionati dall utente, uno per voce, senza duplicati da congiunzioni. Es. "pane 160g, tonno 56g, pomodoro 200g e pesca 100g" = 4 voci, NON 5. Le congiunzioni (e, con, più, virgola) separano alimenti ma NON diventano mai un foodName.',
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
        'Quantita in grammi SOLO se l utente la ha indicato esplicitamente (es. 200g). Se non specificata: null o ometti il campo — NON stimare.',
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

export const addWorkoutPayloadSchema = {
  type: 'object',
  properties: {
    workoutName: {
      type: 'string',
      description: 'Nome sintetico dell allenamento',
    },
    durationMinutes: {
      type: 'number',
      description: 'Durata allenamento in minuti',
    },
    exercises: {
      type: 'array',
      description:
        'Un oggetto per OGNI esercizio esplicitamente citato. Vietato aggiungere riscaldamento/defaticamento non menzionati.',
      items: addWorkoutExerciseItemSchema,
    },
    estimatedKcal: {
      type: 'number',
      description: 'Stima kcal opzionale',
    },
    timeString: {
      type: 'string',
      description: 'Orario opzionale HH:MM',
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
  required: ['workoutName', 'durationMinutes'],
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

/** Singolo alimento per pasto a tappe (Meal Builder). */
export const draftMealFoodItemSchema = {
  type: 'object',
  properties: {
    foodName: {
      type: 'string',
      description: 'Nome puro dell alimento (senza grammi nel nome).',
    },
    name: {
      type: 'string',
      description: 'Alias di foodName.',
    },
    grams: {
      type: 'number',
      nullable: true,
      description: 'Grammi se indicati dall utente.',
    },
    kcal: { type: 'number', nullable: true },
    prot: { type: 'number', nullable: true },
    pro: { type: 'number', nullable: true },
    carb: { type: 'number', nullable: true },
    fat: { type: 'number', nullable: true },
  },
  required: ['foodName'],
};

export const draftMealItemsPayloadSchema = {
  type: 'object',
  properties: {
    mealType: {
      type: 'string',
      nullable: true,
      description: 'Tipo pasto (colazione/pranzo/cena/snack) se noto.',
    },
    foods: {
      type: 'array',
      description: 'Alimenti da aggiungere alla bozza pasto a tappe in questo turno.',
      items: draftMealFoodItemSchema,
    },
  },
};

export const commitMealBuilderPayloadSchema = {
  type: 'object',
  properties: {},
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
        'DRAFT_MEAL_ITEMS',
        'COMMIT_MEAL_BUILDER',
      ],
    },
    payload: {
      type: 'object',
      description:
        'Payload del comando. ADD_FOOD=cibo, ADD_WORKOUT=allenamento, LOG_SLEEP=sonno, DRAFT_MEAL_ITEMS=aggiungi alimenti al pasto a tappe, COMMIT_MEAL_BUILDER=salva/chiudi il pasto a tappe.',
    },
    uiMessage: {
      type: 'string',
      description: 'Messaggio utente opzionale separato dal comando',
    },
    adviceMessage: {
      type: 'string',
      nullable: true,
      description:
        'Solo per registrazione pasto (ADD_FOOD): riepilogo neutro della corretta estrazione (es. "Ho registrato 4 alimenti per lo snack delle 19:00."). VIETATO in fase di semplice log: allarmi su grassi, budget, semafori o valutazioni What-If non richieste. Compila SOLO se serve confermare il log; altrimenti ometti.',
    },
    confidence: {
      type: 'number',
      description: 'Confidenza del modello tra 0 e 1',
    },
    requiresConfirmation: {
      type: 'boolean',
      description: 'Se true il comando richiede conferma utente',
    },
  },
  required: ['commandType', 'payload'],
};

export const consultantResponseSchema = {
  type: 'object',
  properties: {
    adviceMessage: {
      type: 'string',
      description:
        'Risposta coach in italiano (max 4 frasi) con semaforo verde/giallo/rosso e porzione consigliata.',
    },
    suggestedAction: {
      type: 'object',
      nullable: true,
      description:
        'Azione di inserimento rapido singolo alimento. Compila se semaforo verde o giallo; null se rosso o sconsigliato.',
      properties: {
        foodName: {
          type: 'string',
          description: 'Nome esatto dell alimento scelto tra i candidati DB forniti nel prompt.',
        },
        grams: {
          type: 'number',
          description: 'Porzione raccomandata in grammi (> 0).',
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
        'WIP Meal Builder: Smart Chips integrativi da aggiungere al carrello pasto in corso. Compila SOLO per intent WIP_MEAL_BUILD. 3-5 suggerimenti con name, weight (grammi), calories, macros {prot,carb,fat}, reason.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome alimento puro senza grammature.' },
          weight: { type: 'number', description: 'Grammi consigliati (> 0).' },
          calories: { type: 'number', description: 'Kcal stimate per la porzione.' },
          macros: {
            type: 'object',
            properties: {
              prot: { type: 'number' },
              carb: { type: 'number' },
              fat: { type: 'number' },
            },
          },
          reason: { type: 'string', description: 'Breve motivazione nutrizionale.' },
        },
        required: ['name', 'weight'],
      },
    },
    mealProposals: {
      type: 'array',
      description:
        'Proposte pasto complete pronte per conferma rapida. Priorità alle abitudini [USER_HABITS_FOR_CURRENT_MEAL].',
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
              'ID nodo pasto esistente da sovrascrivere (UPDATE_LOGGED_MEAL). Copia da [EXISTING_MEAL_NODE].targetNodeId.',
          },
          source: { type: 'string' },
          items: {
            type: 'array',
            description:
              'Lista COMPLETA alimenti del pasto. Ogni voce DEVE avere foodName e grams > 0. Per UPDATE_LOGGED_MEAL: mai array vuoto; se richiesta vaga, ripeti [EXISTING_MEAL_NODE].items.',
            items: {
              type: 'object',
              properties: {
                foodName: {
                  type: 'string',
                  description:
                    'Nome PURO ingrediente: senza grammi, parentesi o congiunzioni iniziali (es. "Pesca", non "e pesca 100 g").',
                },
                foodDbKey: { type: 'string', nullable: true },
                grams: { type: 'number' },
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
  DRAFT_MEAL_ITEMS: {
    name: 'dispatch_draft_meal_items',
    description:
      'Aggiunge alimenti alla bozza del pasto a tappe (Meal Builder) senza salvare ancora sul diario. Usa quando meal builder e attivo o l utente costruisce un pasto in piu messaggi.',
    inputSchema: draftMealItemsPayloadSchema,
  },
  COMMIT_MEAL_BUILDER: {
    name: 'dispatch_commit_meal_builder',
    description:
      'Chiude e salva il pasto a tappe costruito a step. Nessun payload richiesto.',
    inputSchema: commitMealBuilderPayloadSchema,
  },
});
