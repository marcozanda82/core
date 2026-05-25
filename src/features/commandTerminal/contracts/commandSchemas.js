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

export const terminalCommandEnvelopeSchema = {
  type: 'object',
  properties: {
    commandType: {
      type: 'string',
      enum: ['ADD_FOOD', 'ADD_WORKOUT'],
    },
    payload: {
      type: 'object',
      description:
        'Payload del comando. Se commandType e ADD_FOOD usa schema cibo, se ADD_WORKOUT usa schema allenamento.',
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
});
