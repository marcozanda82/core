import { commandBus } from './dispatcher/CommandBus.js';
import { contextComposer } from './context/ContextComposer.js';
import { geminiStructuredClient } from './llm/GeminiStructuredClient.js';
import {
  DISPATCH_ADD_FOOD,
  DISPATCH_ADD_WORKOUT,
  DISPATCH_LOG_SLEEP,
  DISPATCH_COMMAND_ACCEPTED,
  DISPATCH_COMMAND_REJECTED,
  DISPATCH_SYSTEM_MESSAGE,
} from './contracts/eventTypes.js';
import {
  CONVERSATION_STATE,
  getFoodPayloadMissingFields,
  inferDefaultMealType,
  normalizeFoodPayload,
  parseGramsFromUserText,
  parseMealTypeFromUserText,
  slotPromptForState,
} from './conversation/conversationState.js';
import {
  buildAdviceContext,
  extractTargetFoodFromQuery,
  generateConsultantPrompt,
  sanitizeSuggestedAction,
} from '../../conversation/ConsultantEngine.js';

const COMMAND_TO_EVENT = Object.freeze({
  ADD_FOOD: DISPATCH_ADD_FOOD,
  ADD_WORKOUT: DISPATCH_ADD_WORKOUT,
  LOG_SLEEP: DISPATCH_LOG_SLEEP,
});

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function validateFoodPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Food payload must be an object';
  if (!String(payload.foodName || '').trim()) return 'foodName is required';
  if (!isFiniteNumber(payload.grams) || Number(payload.grams) <= 0) return 'grams must be > 0';
  const mealType = String(payload.mealType || '').trim().toLowerCase();
  if (!['colazione', 'snack', 'pranzo', 'cena'].includes(mealType)) {
    return 'mealType must be one of colazione/snack/pranzo/cena';
  }
  return null;
}

function validateWorkoutPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Workout payload must be an object';
  if (!String(payload.workoutName || '').trim()) return 'workoutName is required';
  if (!isFiniteNumber(payload.durationMinutes) || Number(payload.durationMinutes) <= 0) {
    return 'durationMinutes must be > 0';
  }
  return null;
}

const INVALID_SLEEP_DURATION_MESSAGE =
  'Non ho rilevato ore di sonno valide nell\'immagine. Carica uno screenshot più chiaro con la durata totale (es. 7h 30m).';

function validateSleepPayload(payload) {
  if (!payload || typeof payload !== 'object') return INVALID_SLEEP_DURATION_MESSAGE;
  if (!isFiniteNumber(payload.durationHours) || Number(payload.durationHours) <= 0) {
    return INVALID_SLEEP_DURATION_MESSAGE;
  }
  if (payload.deepSleepPhase != null && !isFiniteNumber(payload.deepSleepPhase)) {
    return 'deepSleepPhase must be a number when provided';
  }
  if (payload.qualityScore != null && !isFiniteNumber(payload.qualityScore)) {
    return 'qualityScore must be a number when provided';
  }
  return null;
}

function validateEnvelope(command) {
  if (!command || typeof command !== 'object') return 'Command must be an object';
  const commandType = String(command.commandType || '').trim().toUpperCase();
  if (!COMMAND_TO_EVENT[commandType]) return `Unsupported commandType: ${commandType || 'empty'}`;
  if (!command.payload || typeof command.payload !== 'object') return 'payload is required';
  if (commandType === 'ADD_FOOD') return validateFoodPayload(command.payload);
  if (commandType === 'ADD_WORKOUT') return validateWorkoutPayload(command.payload);
  if (commandType === 'LOG_SLEEP') return validateSleepPayload(command.payload);
  return 'Unsupported commandType';
}

function nextFoodSlotState(missingFields) {
  if (missingFields.includes('grams')) return CONVERSATION_STATE.AWAITING_FOOD_GRAMS;
  if (missingFields.includes('mealType')) return CONVERSATION_STATE.AWAITING_TIME;
  return CONVERSATION_STATE.IDLE;
}

export class CommandTerminalController {
  constructor({ bus = commandBus, llmClient = geminiStructuredClient, composer = contextComposer } = {}) {
    this.bus = bus;
    this.llmClient = llmClient;
    this.composer = composer;
    this.conversationState = CONVERSATION_STATE.IDLE;
    this.pendingCommandPayload = null;
    this.pendingCommandType = null;
  }

  getConversationSnapshot() {
    return {
      conversationState: this.conversationState,
      pendingCommandPayload: this.pendingCommandPayload
        ? { ...this.pendingCommandPayload }
        : null,
      pendingCommandType: this.pendingCommandType,
    };
  }

  resetConversationState() {
    this.conversationState = CONVERSATION_STATE.IDLE;
    this.pendingCommandPayload = null;
    this.pendingCommandType = null;
  }

  publishSystemMessage(message) {
    const text = String(message || '').trim();
    if (!text) return;
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      { message: text, text },
      { source: 'CommandTerminalController' },
    );
  }

  publishAdviceMessage({ text, suggestedAction = null }) {
    const adviceMessage = String(text || '').trim();
    if (!adviceMessage) return;
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'ADVICE',
        text: adviceMessage,
        message: adviceMessage,
        suggestedAction: suggestedAction || null,
        adviceId: `advice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      },
      { source: 'CommandTerminalController' },
    );
  }

  dispatchCommand(commandType, payload, meta = {}) {
    const normalizedType = String(commandType || '').trim().toUpperCase();
    const eventType = COMMAND_TO_EVENT[normalizedType];
    if (!eventType) {
      throw new Error(`Unsupported commandType: ${normalizedType}`);
    }

    const publishResult = this.bus.publish(eventType, payload, {
      source: 'CommandTerminalController',
      dedupeKey: {
        commandType: normalizedType,
        payload,
      },
    });

    this.bus.publish(
      DISPATCH_COMMAND_ACCEPTED,
      {
        commandType: normalizedType,
        payload,
        publishResult,
        confidence: meta.confidence ?? null,
        requiresConfirmation: meta.requiresConfirmation ?? false,
      },
      { source: 'CommandTerminalController' },
    );

    if (meta.uiMessage) {
      this.publishSystemMessage(meta.uiMessage);
    }

    return { commandType: normalizedType, payload, publishResult };
  }

  beginFoodSlotFilling(partialPayload, currentState = {}, options = {}) {
    const normalized = normalizeFoodPayload(partialPayload, currentState, {
      inferMealTypeFromContext: false,
      ...options,
    });
    this.pendingCommandType = 'ADD_FOOD';
    this.pendingCommandPayload = { ...normalized };

    const missing = getFoodPayloadMissingFields(this.pendingCommandPayload);
    if (missing.length === 0) {
      return this.completePendingFoodCommand(currentState, { fromSlotFilling: false });
    }

    this.conversationState = nextFoodSlotState(missing);
    this.publishSystemMessage(slotPromptForState(this.conversationState, this.pendingCommandPayload));
    return {
      ok: true,
      awaiting: true,
      conversationState: this.conversationState,
      pendingCommandPayload: { ...this.pendingCommandPayload },
    };
  }

  completePendingFoodCommand(currentState = {}, options = {}) {
    const payload = normalizeFoodPayload(this.pendingCommandPayload || {}, currentState);
    const validationError = validateFoodPayload(payload);
    if (validationError) {
      const missing = getFoodPayloadMissingFields(payload);
      if (missing.length > 0) {
        this.pendingCommandPayload = { ...payload };
        this.conversationState = nextFoodSlotState(missing);
        this.publishSystemMessage(slotPromptForState(this.conversationState, payload));
        return {
          ok: true,
          awaiting: true,
          conversationState: this.conversationState,
          reason: validationError,
        };
      }

      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason: validationError, command: payload },
        { source: 'CommandTerminalController' },
      );
      this.resetConversationState();
      return { ok: false, reason: validationError };
    }

    const result = this.dispatchCommand('ADD_FOOD', payload, {
      requiresConfirmation: false,
      uiMessage: options.uiMessage,
    });
    this.resetConversationState();
    return { ok: true, ...result };
  }

  processSlotFillingResponse(userText, currentState = {}) {
    const text = String(userText || '').trim();
    if (!text) {
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason: 'Risposta vuota.' },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason: 'empty_slot_response' };
    }

    if (this.pendingCommandType !== 'ADD_FOOD') {
      this.resetConversationState();
      return { ok: false, reason: 'unknown_pending_command' };
    }

    const pending = { ...(this.pendingCommandPayload || {}) };

    if (this.conversationState === CONVERSATION_STATE.AWAITING_FOOD_GRAMS) {
      const grams = parseGramsFromUserText(text);
      if (!grams) {
        this.publishSystemMessage(
          `Non ho capito la quantità. Quanti grammi di ${pending.foodName || 'alimento'}? (es. 200 o 200g)`,
        );
        return { ok: true, awaiting: true, conversationState: this.conversationState };
      }
      pending.grams = grams;
      this.pendingCommandPayload = pending;

      const missing = getFoodPayloadMissingFields(
        normalizeFoodPayload(pending, currentState),
      );
      if (missing.includes('mealType')) {
        const inferred = inferDefaultMealType(currentState);
        if (inferred) {
          pending.mealType = inferred;
          this.pendingCommandPayload = pending;
          return this.completePendingFoodCommand(currentState);
        }
        this.conversationState = CONVERSATION_STATE.AWAITING_TIME;
        this.publishSystemMessage(slotPromptForState(this.conversationState, pending));
        return {
          ok: true,
          awaiting: true,
          conversationState: this.conversationState,
        };
      }

      return this.completePendingFoodCommand(currentState);
    }

    if (this.conversationState === CONVERSATION_STATE.AWAITING_TIME) {
      const mealType = parseMealTypeFromUserText(text);
      if (!mealType) {
        this.publishSystemMessage(
          'Non ho riconosciuto il pasto. Rispondi con: colazione, pranzo, cena o snack.',
        );
        return { ok: true, awaiting: true, conversationState: this.conversationState };
      }
      pending.mealType = mealType;
      this.pendingCommandPayload = pending;
      return this.completePendingFoodCommand(currentState);
    }

    this.resetConversationState();
    return { ok: false, reason: 'invalid_conversation_state' };
  }

  async processMealAdvice(userText, currentState = {}) {
    const targetFood = extractTargetFoodFromQuery(userText) || String(userText || '').trim();
    if (!targetFood) {
      this.publishSystemMessage('Dimmi quale alimento vuoi valutare (es. «Posso mangiare una pizza?»).');
      return { ok: false, reason: 'empty_meal_advice_target' };
    }

    let adviceContext;
    try {
      adviceContext = await buildAdviceContext(targetFood, currentState);
    } catch (error) {
      const reason = `Consultant context failure: ${error?.message || 'unknown error'}`;
      console.error('[CommandTerminalController] buildAdviceContext error', error);
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason, userText, intent: 'ASK_MEAL_ADVICE' },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason };
    }

    const consultantPrompt = generateConsultantPrompt(adviceContext, targetFood);

    try {
      const { adviceMessage, suggestedAction: rawAction, model } =
        await this.llmClient.generateConsultantResponse({
          prompt: consultantPrompt,
          temperature: 0.35,
        });
      const suggestedAction = sanitizeSuggestedAction(rawAction, adviceContext);
      this.publishAdviceMessage({
        text: adviceMessage,
        suggestedAction,
      });
      return { ok: true, intent: 'ASK_MEAL_ADVICE', model, adviceContext, suggestedAction };
    } catch (error) {
      const reason = `Consultant LLM failure: ${error?.message || 'unknown error'}`;
      console.error('[CommandTerminalController] Meal advice LLM error', error);
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason, userText, intent: 'ASK_MEAL_ADVICE' },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason };
    }
  }

  async processUserMessage(text, currentState = {}, options = {}) {
    const userText = String(text || '').trim();
    const images = Array.isArray(options?.images) ? options.images : [];

    if (this.conversationState !== CONVERSATION_STATE.IDLE) {
      if (images.length > 0) {
        this.publishSystemMessage('Completa prima la domanda in sospeso, poi allega eventuali screenshot.');
        return this.processSlotFillingResponse(userText, currentState);
      }
      return this.processSlotFillingResponse(userText, currentState);
    }

    if (!userText && images.length === 0) {
      const reason = 'Empty user message';
      this.bus.publish(DISPATCH_COMMAND_REJECTED, { reason }, { source: 'CommandTerminalController' });
      return { ok: false, reason };
    }

    const inferredIntent =
      String(options.intent || '').trim().toUpperCase() ||
      this.composer.detectIntent(userText, { hasImages: images.length > 0 });

    if (inferredIntent === 'ASK_MEAL_ADVICE') {
      return this.processMealAdvice(userText, currentState);
    }

    const contextBundle = this.composer.buildPromptContext(inferredIntent, currentState);

    let commandResponse;
    try {
      commandResponse = await this.llmClient.generateStructuredCommand({
        userText,
        contextBundle,
        commandHint: inferredIntent,
        images,
      });
    } catch (error) {
      const detail =
        error?.details
        || error?.message
        || error?.code
        || 'unknown error';
      const reason = `LLM failure: ${detail}`;
      console.error('[CommandTerminalController] LLM error', error);
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason, userText, intent: inferredIntent },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason };
    }

    const commandType = String(commandResponse.command?.commandType || '').trim().toUpperCase();
    const rawPayload = commandResponse.command?.payload || {};

    if (commandType === 'ADD_FOOD') {
      const normalized = normalizeFoodPayload(rawPayload, currentState, {
        inferMealTypeFromContext: false,
      });
      const missing = getFoodPayloadMissingFields(normalized);

      if (missing.length > 0 && String(normalized.foodName || '').trim()) {
        return this.beginFoodSlotFilling(normalized, currentState);
      }
    }

    const validationError = validateEnvelope(commandResponse.command);
    if (validationError) {
      if (commandType === 'ADD_FOOD' && String(rawPayload.foodName || '').trim()) {
        return this.beginFoodSlotFilling(rawPayload, currentState);
      }

      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        {
          reason: validationError,
          userText,
          intent: inferredIntent,
          rawModelResponse: commandResponse.rawText,
        },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason: validationError };
    }

    console.log('✅ Intent completato con successo:', commandType);
    const payload = { ...rawPayload };
    const result = this.dispatchCommand(commandType, payload, {
      confidence: commandResponse.command.confidence ?? null,
      requiresConfirmation: commandResponse.command.requiresConfirmation ?? true,
      uiMessage: commandResponse.command.uiMessage,
    });

    return {
      ok: true,
      ...result,
      model: commandResponse.model,
    };
  }
}

export const commandTerminalController = new CommandTerminalController();
