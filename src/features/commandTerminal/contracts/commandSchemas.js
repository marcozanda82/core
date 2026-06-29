const mealTypeEnum = ['colazione', 'snack', 'pranzo', 'cena'];

export const addFoodPayloadSchema = {
  type: 'object',
  properties: {
    foodName: {
      type: 'string',
      description: 'Nome dell alimento o piatto dichiarato dall utente',
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
      description: 'Opzionale, formato HH:MM',
    },
    notes: {
      type: 'string',
      description: 'Note aggiuntive opzionali',
    },
  },
  required: ['foodName'],
};

export const addWorkoutPayloadSchema = {
  type: 'object',
  properties: {
    workoutName: {
      type: 'string',
      description: 'Nome dell allenamento',
    },
    durationMinutes: {
      type: 'number',
      description: 'Durata allenamento in minuti',
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
        'Azione di inserimento rapido. Compila se semaforo verde o giallo; null se rosso o sconsigliato.',
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
  },
  required: ['adviceMessage'],
};

export const geminiToolSchemas = Object.freeze({
  ADD_FOOD: {
    name: 'dispatch_add_food',
    description:
      'Aggiunge un alimento al diario. foodName obbligatorio; grams e mealType solo se espliciti nel messaggio utente (altrimenti null/omessi per slot filling).',
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
