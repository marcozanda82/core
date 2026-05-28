const mealTypeEnum = ['colazione', 'snack', 'pranzo', 'cena'];

export const addFoodPayloadSchema = {
  type: 'object',
  properties: {
    foodName: {
      type: 'string',
      description: 'Nome dell alimento o piatto',
    },
    grams: {
      type: 'number',
      description: 'Quantita in grammi',
    },
    mealType: {
      type: 'string',
      enum: mealTypeEnum,
      description: 'Momento del pasto',
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
  required: ['foodName', 'grams', 'mealType'],
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

export const geminiToolSchemas = Object.freeze({
  ADD_FOOD: {
    name: 'dispatch_add_food',
    description:
      'Crea un comando tipizzato per aggiungere un alimento al diario (nome, grammi, pasto obbligatori).',
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
