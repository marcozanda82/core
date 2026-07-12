const mealTypeEnum = ['colazione', 'snack', 'pranzo', 'cena'];

export const foodItemSchema = {
  type: 'object',
  properties: {
    foodName: {
      type: 'string',
      description: 'Nome dell alimento o piatto',
    },
    grams: {
      type: 'number',
      nullable: true,
      description:
        'Quantita in grammi SOLO se l utente la ha indicato esplicitamente. Se non specificata: null o ometti — NON stimare.',
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
        'TUTTI gli alimenti menzionati dall utente. Obbligatorio se l utente elenca piu alimenti (es. pollo e riso).',
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
        'Punteggio sonno intero estratto da etichetta punti (es. 80 punti = 80).',
    },
  },
  required: ['durationHours'],
};

export const terminalCommandEnvelopeSchema = {
  type: 'object',
  properties: {
    commandType: {
      type: 'string',
      enum: ['ADD_FOOD', 'ADD_WORKOUT', 'LOG_SLEEP'],
    },
    payload: {
      type: 'object',
      description:
        'Payload del comando. Se commandType e ADD_FOOD usa schema cibo, se ADD_WORKOUT usa schema allenamento, se LOG_SLEEP usa schema sonno.',
    },
    uiMessage: {
      type: 'string',
      description: 'Messaggio utente opzionale separato dal comando',
    },
    adviceMessage: {
      type: 'string',
      nullable: true,
      description:
        'Consiglio breve opzionale (max 1 frase) per ADD_FOOD se budget/metabolico/workout lo richiede. Ometti se non necessario.',
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
          source: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                foodName: { type: 'string' },
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

export const geminiToolSchemas = Object.freeze({
  ADD_FOOD: {
    name: 'dispatch_add_food',
    description:
      'Aggiunge uno o piu alimenti al diario. Usa items[] con TUTTI gli alimenti elencati; grams e mealType solo se espliciti (altrimenti null/omessi per slot filling).',
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
