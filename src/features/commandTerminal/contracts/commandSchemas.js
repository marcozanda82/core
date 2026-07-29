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
        'Peso in grammi. PRIORITA: se unita/pezzi e alimento in User_Portions_Dictionary (KENTU_GLOBAL_STATE), usa ESATTAMENTE quel peso con isEstimated=false. '
        + 'Altrimenti: grammi espliciti utente → isEstimated=false; unita/pezzi senza dizionario → stima media + isEstimated=true; nessuna quantita → null.',
    },
    isEstimated: {
      type: 'boolean',
      nullable: true,
      description:
        'false se grams viene da User_Portions_Dictionary o da grammi espliciti utente. '
        + 'true SOLO se stima media universale (alimento assente dal dizionario). Ometti/false se grams assente.',
    },
  },
  required: ['foodName'],
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
      enum: ['ADD_FOOD', 'ADD_WORKOUT', 'LOG_SLEEP', 'CHAT_RESPONSE'],
      description:
        'ADD_FOOD/ADD_WORKOUT/LOG_SLEEP = inserimento dati (CASO 1). '
        + 'CHAT_RESPONSE = sola risposta consulenziale in chat senza bozze (CASO 2).',
    },
    payload: {
      type: 'object',
      description:
        'Payload del comando. Se commandType e ADD_FOOD usa schema cibo, se ADD_WORKOUT usa schema allenamento, '
        + 'se LOG_SLEEP usa schema sonno, se CHAT_RESPONSE usa { message } oppure oggetto vuoto '
        + '(il testo della risposta va in uiMessage o adviceMessage).',
    },
    uiMessage: {
      type: 'string',
      description:
        'Messaggio utente. Per CHAT_RESPONSE: analisi testuale sintetica basata su KENTU_GLOBAL_STATE.',
    },
    adviceMessage: {
      type: 'string',
      nullable: true,
      description:
        'Per CHAT_RESPONSE: testo consulenziale (alias di uiMessage). '
        + 'Per ADD_FOOD: riepilogo neutro del log. Se items[].isEstimated=true, spiega le stime. '
        + 'VIETATO in semplice log: allarmi What-If non richiesti.',
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

/** Payload minimo per risposte consulenziali senza bozza. */
export const chatResponsePayloadSchema = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      nullable: true,
      description:
        'Analisi testuale basata ESCLUSIVAMENTE su KENTU_GLOBAL_STATE. '
        + 'Puoi anche mettere il testo in uiMessage/adviceMessage.',
    },
  },
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
        'Proposte pasto complete pronte per conferma rapida. Priorità alle abitudini [USER_HABITS_FOR_CURRENT_MEAL]. Per UPDATE_LOGGED_MEAL: UNA sola proposta con targetNodeId + operations + resultingItems.',
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
              'Lista COMPLETA alimenti del pasto. Ogni voce DEVE avere foodName e grams > 0. Per UPDATE_LOGGED_MEAL: deve coincidere con resultingItems (lista post-mutazione). Se richiesta vaga, ripeti gli items di [EXISTING_MEAL_NODE]/[TODAY_DIARY_INDEX].',
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
});
