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

export class CommandTerminalController {
  constructor({ bus = commandBus, llmClient = geminiStructuredClient, composer = contextComposer } = {}) {
    this.bus = bus;
    this.llmClient = llmClient;
    this.composer = composer;
  }

  async processUserMessage(text, currentState = {}, options = {}) {
    const userText = String(text || '').trim();
    const images = Array.isArray(options?.images) ? options.images : [];
    if (!userText && images.length === 0) {
      const reason = 'Empty user message';
      this.bus.publish(DISPATCH_COMMAND_REJECTED, { reason }, { source: 'CommandTerminalController' });
      return { ok: false, reason };
    }

    const inferredIntent =
      String(options.intent || '').trim().toUpperCase() ||
      this.composer.detectIntent(userText, { hasImages: images.length > 0 });
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

    const validationError = validateEnvelope(commandResponse.command);
    if (validationError) {
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

    const commandType = String(commandResponse.command.commandType).toUpperCase();
    console.log('✅ Intent completato con successo:', commandType);
    const eventType = COMMAND_TO_EVENT[commandType];
    const payload = { ...commandResponse.command.payload };
    const publishResult = this.bus.publish(eventType, payload, {
      source: 'CommandTerminalController',
      dedupeKey: {
        commandType,
        payload,
      },
    });
    this.bus.publish(
      DISPATCH_COMMAND_ACCEPTED,
      {
        commandType,
        payload,
        publishResult,
        confidence: commandResponse.command.confidence ?? null,
        requiresConfirmation: commandResponse.command.requiresConfirmation ?? true,
      },
      { source: 'CommandTerminalController' },
    );
    if (commandResponse.command.uiMessage) {
      this.bus.publish(
        DISPATCH_SYSTEM_MESSAGE,
        { message: String(commandResponse.command.uiMessage) },
        { source: 'CommandTerminalController' },
      );
    }
    return {
      ok: true,
      commandType,
      payload,
      publishResult,
      model: commandResponse.model,
    };
  }
}

export const commandTerminalController = new CommandTerminalController();
