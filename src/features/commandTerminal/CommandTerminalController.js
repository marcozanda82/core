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
  applyGramsSlotResponse,
  buildFoodConfirmationSummary,
  buildMealDraftUiMessage,
  buildSleepConfirmationSummary,
  buildWorkoutConfirmationSummary,
  buildWorkoutDraftUiMessage,
  expandFoodPayloadItems,
  expandWorkoutPayloadExercises,
  getFoodItemsMissingGrams,
  getFoodPayloadMissingFields,
  MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES,
  normalizeFoodPayload,
  normalizeWorkoutPayload,
  parseConfirmationFromUserText,
  parseMealTypeFromUserText,
  WORKOUT_DRAFT_CONFIRMATION_QUICK_REPLIES,
} from './conversation/conversationState.js';
import {
  buildAdviceContext,
  buildMealLogProposalFromPayload,
  ensureMealProposalsForAdvice,
  extractTargetFoodFromQuery,
  generateConsultantPrompt,
  isGenericMealSuggestionQuery,
  sanitizeMealProposals,
  sanitizeSuggestedAction,
} from '../../conversation/ConsultantEngine.js';
import {
  isConsumedMealLogDescription,
  isDayReviewIntent,
  isMealCompletionIntent,
  isCreateNewFoodIntent,
  isFoodRegistrationIntent,
  isMealAdviceIntent,
  looksLikeComplexMealLog,
  normalizeExactTime,
  parseConsumedMealFromNaturalText,
  parseExactTimeFromUserText,
} from './conversation/mealLogIntent.js';
import { findNutritionalDonor, inheritMicrosFromDonor } from '../../utils/findNutritionalDonor.js';
import {
  buildConversationTextsFromChatHistory,
  getMealRegistrationMissingSlots,
  MEAL_REGISTRATION_SLOT_ORDER,
  mergeMealRegistrationFromConversation,
  promptForMissingMealRegistrationSlot,
  registrationSlotToConversationState,
} from './conversation/mealRegistrationSlots.js';
import { applyMealRegistrationSmartDefaults, applyMealTimingDefaultsOnly } from './conversation/mealSmartDefaults.js';
import {
  applyHistoricalWorkoutKcalDefault,
  applyWorkoutTimeSlotResponse,
  hasWorkoutToday,
  parseWorkoutConflictResponse,
} from './conversation/workoutRegistrationSlots.js';

const USER_FACING_ERROR_MESSAGE =
  'Scusa, ho avuto un problema a elaborare questa frase. Puoi riformularla?';

const USER_FACING_PARSE_ERROR_MESSAGE =
  'Non sono riuscito a capire tutti gli alimenti e le grammature. Prova a elencarli così: «230g di gnocchi, 100g di passato di pomodoro».';

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
  const items = expandFoodPayloadItems(payload);
  if (items.length === 0) return 'At least one food item is required';
  for (const item of items) {
    if (!String(item.foodName || '').trim()) return 'foodName is required for each item';
    if (!isFiniteNumber(item.grams) || Number(item.grams) <= 0) {
      return 'grams must be > 0 for each item';
    }
  }
  const mealType = String(payload.mealType || '').trim().toLowerCase();
  if (!['colazione', 'snack', 'pranzo', 'cena'].includes(mealType)) {
    return 'mealType must be one of colazione/snack/pranzo/cena';
  }
  return null;
}

function validateWorkoutPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Workout payload must be an object';
  const exercises = expandWorkoutPayloadExercises(payload);
  const workoutName = String(payload.workoutName || '').trim();
  if (exercises.length === 0 && !workoutName) return 'workoutName is required';
  if (exercises.some((item) => !String(item.exerciseName || '').trim())) {
    return 'exerciseName is required for each exercise';
  }
  if (!isFiniteNumber(payload.durationMinutes) || Number(payload.durationMinutes) <= 0) {
    return 'durationMinutes must be > 0';
  }
  return null;
}

function validateWorkoutDraftPayload(payload) {
  const baseError = validateWorkoutPayload(payload);
  if (baseError) return baseError;
  if (!String(payload?.timeString || payload?.exactTime || '').trim()) {
    return 'timeString is required';
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

function lockPendingFoodItems(pending = {}) {
  return expandFoodPayloadItems(pending).map((item) => ({ ...item }));
}

function buildConfirmationSummary(commandType, payload) {
  const type = String(commandType || '').trim().toUpperCase();
  if (type === 'ADD_FOOD') return buildFoodConfirmationSummary(payload);
  if (type === 'ADD_WORKOUT') return buildWorkoutConfirmationSummary(payload);
  if (type === 'LOG_SLEEP') return buildSleepConfirmationSummary(payload);
  return 'Confermi l\'inserimento?';
}

export class CommandTerminalController {
  constructor({ bus = commandBus, llmClient = geminiStructuredClient, composer = contextComposer } = {}) {
    this.bus = bus;
    this.llmClient = llmClient;
    this.composer = composer;
    this.conversationState = CONVERSATION_STATE.IDLE;
    this.pendingCommandPayload = null;
    this.pendingCommandType = null;
    this.pendingAction = null;
    this.pendingMealRegistration = false;
    this.pendingWorkoutBypassConflict = false;
    this.pendingWorkoutOriginUserText = '';
    this.isExecutingAction = false;
  }

  getConversationSnapshot() {
    return {
      conversationState: this.conversationState,
      pendingCommandPayload: this.pendingCommandPayload
        ? { ...this.pendingCommandPayload }
        : null,
      pendingCommandType: this.pendingCommandType,
      pendingMealRegistration: this.pendingMealRegistration,
      pendingAction: this.pendingAction
        ? { ...this.pendingAction, payload: { ...(this.pendingAction.payload || {}) } }
        : null,
    };
  }

  resetConversationState() {
    this.conversationState = CONVERSATION_STATE.IDLE;
    this.pendingCommandPayload = null;
    this.pendingCommandType = null;
    this.pendingAction = null;
    this.pendingMealRegistration = false;
    this.pendingWorkoutBypassConflict = false;
    this.pendingWorkoutOriginUserText = '';
    this.isExecutingAction = false;
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

  publishErrorMessage(message = USER_FACING_ERROR_MESSAGE) {
    const text = String(message || USER_FACING_ERROR_MESSAGE).trim();
    if (!text) return;
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      { type: 'ERROR', message: text, text },
      { source: 'CommandTerminalController' },
    );
  }

  beginMealRegistrationSlotFilling(partialPayload, missingSlots) {
    this.pendingMealRegistration = true;
    this.pendingCommandType = 'ADD_FOOD';
    this.pendingCommandPayload = { ...partialPayload };

    const firstSlot = MEAL_REGISTRATION_SLOT_ORDER.find((slot) => missingSlots.includes(slot));
    this.conversationState = registrationSlotToConversationState(firstSlot);
    this.publishSystemMessage(
      promptForMissingMealRegistrationSlot(firstSlot, this.pendingCommandPayload),
    );
    return {
      ok: true,
      awaiting: true,
      conversationState: this.conversationState,
      pendingCommandPayload: { ...this.pendingCommandPayload },
    };
  }

  ensureMealRegistrationCompleteOrAsk(payload, currentState = {}, userText = '', chatHistory = []) {
    const merged = mergeMealRegistrationFromConversation(payload, chatHistory, userText);
    const texts = buildConversationTextsFromChatHistory(chatHistory, userText);
    const withDefaults = applyMealRegistrationSmartDefaults(merged, texts);
    const missing = getMealRegistrationMissingSlots(withDefaults, texts);
    if (missing.length === 0) {
      return { ok: true, payload: withDefaults };
    }
    return {
      ok: false,
      awaiting: true,
      ...this.beginMealRegistrationSlotFilling(withDefaults, missing),
    };
  }

  advanceMealRegistrationSlotFilling(currentState = {}, userText = '', chatHistory = []) {
    const missing = getMealRegistrationMissingSlots(this.pendingCommandPayload || {}, []);

    if (missing.length === 0) {
      return this.publishFoodDraftAfterGrams(currentState);
    }

    const withDefaults = applyMealTimingDefaultsOnly(this.pendingCommandPayload || {});
    this.pendingCommandPayload = withDefaults;
    const firstSlot = MEAL_REGISTRATION_SLOT_ORDER.find((slot) => missing.includes(slot));
    this.conversationState = registrationSlotToConversationState(firstSlot);
    this.publishSystemMessage(promptForMissingMealRegistrationSlot(firstSlot, withDefaults));
    return {
      ok: true,
      awaiting: true,
      conversationState: this.conversationState,
    };
  }

  /**
   * Applica Smart Defaults (solo mealType + exactTime) e pubblica la card MEAL_DRAFT.
   * Gli items provengono ESCLUSIVAMENTE da pendingCommandPayload (post applyGramsSlotResponse).
   */
  publishFoodDraftAfterGrams(currentState = {}) {
    const lockedItems = lockPendingFoodItems(this.pendingCommandPayload || {});
    const withTiming = applyMealTimingDefaultsOnly({
      ...(this.pendingCommandPayload || {}),
      items: lockedItems,
    });
    const payload = normalizeFoodPayload(withTiming, currentState, {
      inferMealTypeFromContext: false,
    });
    payload.items = lockedItems;
    this.pendingCommandPayload = payload;
    this.pendingMealRegistration = false;

    const missingGrams = getFoodItemsMissingGrams(payload);
    if (missingGrams.length > 0) {
      this.pendingCommandType = 'ADD_FOOD';
      this.conversationState = CONVERSATION_STATE.AWAITING_FOOD_GRAMS;
      this.publishSystemMessage(promptForMissingMealRegistrationSlot('foods', payload));
      return {
        ok: true,
        awaiting: true,
        conversationState: this.conversationState,
        pendingCommandPayload: { ...payload },
      };
    }

    const validationError = validateFoodPayload(payload);
    if (validationError) {
      console.error(
        '[CommandTerminalController] Payload non valido dopo smart defaults',
        validationError,
        payload,
      );
      this.publishErrorMessage(USER_FACING_PARSE_ERROR_MESSAGE);
      this.resetConversationState();
      return { ok: false, reason: validationError, userNotified: true };
    }

    const uiMessage = buildMealDraftUiMessage(payload);
    return this.stagePendingAction('ADD_FOOD', payload, {
      requiresConfirmation: true,
      uiMessage,
    });
  }

  publishAddFoodContextAdvice(command) {
    const note = String(command?.adviceMessage || '').trim();
    if (!note) return;
    this.publishSystemMessage(note);
  }

  publishMealLogProposalCardDirect(payload, currentState = {}, userText = '', chatHistory = []) {
    const conversationTexts = buildConversationTextsFromChatHistory(chatHistory, userText);
    const proposal = buildMealLogProposalFromPayload(payload, currentState, {
      userText,
      conversationTexts,
    });
    if (!proposal) {
      this.publishErrorMessage(USER_FACING_PARSE_ERROR_MESSAGE);
      return { ok: false, reason: 'meal_log_proposal_build_failed', userNotified: true };
    }

    const itemCount = Array.isArray(proposal.items) ? proposal.items.length : 0;
    const summaryText = itemCount > 1
      ? `Ho estratto ${itemCount} alimenti dal tuo pasto. Controlla il riepilogo e conferma per caricarlo nel diario.`
      : 'Ho preparato il riepilogo del pasto. Conferma per caricarlo nel diario.';

    this.publishAdviceMessage({
      text: summaryText,
      mealProposals: [proposal],
    });

    return {
      ok: true,
      intent: 'ADD_FOOD',
      mealProposals: [proposal],
      userNotified: true,
      sourceText: String(userText || '').trim() || null,
    };
  }

  publishMealLogProposalCard(payload, currentState = {}, userText = '', chatHistory = []) {
    const check = this.ensureMealRegistrationCompleteOrAsk(
      payload,
      currentState,
      userText,
      chatHistory,
    );
    if (!check.ok) {
      return check;
    }
    return this.publishMealLogProposalCardDirect(
      check.payload || payload,
      currentState,
      userText,
      chatHistory,
    );
  }

  isMealRegistrationCandidate(userText) {
    return isConsumedMealLogDescription(userText) || looksLikeComplexMealLog(userText);
  }

  resolveEffectiveIntent(userText, options = {}) {
    const explicit = String(options.intent || '').trim().toUpperCase();
    if (explicit && explicit !== 'UNKNOWN') return explicit;

    if (options?.hasImages && isCreateNewFoodIntent(userText)) return 'CREATE_NEW_FOOD';
    if (isDayReviewIntent(userText)) return 'ASK_DAY_REVIEW';
    if (isMealCompletionIntent(userText)) return 'ASK_MEAL_COMPLETION';
    if (isMealAdviceIntent(userText)) return 'ASK_MEAL_ADVICE';

    const detected = this.composer.detectIntent(userText, { hasImages: options.hasImages });
    if (detected !== 'UNKNOWN') return detected;

    if (isFoodRegistrationIntent(userText)) {
      return 'ADD_FOOD';
    }

    return detected;
  }

  tryParseAndPublishMealLog(userText, currentState = {}, chatHistory = []) {
    const parsed = parseConsumedMealFromNaturalText(userText);
    if (!parsed?.items?.length) {
      return null;
    }

    const payload = normalizeFoodPayload(
      {
        items: parsed.items,
        mealType: parsed.mealType,
        ...(parsed.exactTime ? { exactTime: parsed.exactTime, timeString: parsed.exactTime } : {}),
      },
      currentState,
      { inferMealTypeFromContext: false },
    );

    return this.publishMealLogProposalCard(payload, currentState, userText, chatHistory);
  }

  shouldUseMealLogProposalCard(userText, payload) {
    if (!this.isMealRegistrationCandidate(userText)) {
      return false;
    }
    const normalized = normalizeFoodPayload(payload, {}, { inferMealTypeFromContext: false });
    return expandFoodPayloadItems(normalized).length > 0;
  }

  publishAdviceMessage({ text, suggestedAction = null, mealProposals = null }) {
    const adviceMessage = String(text || '').trim();
    if (!adviceMessage) return;
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'ADVICE',
        text: adviceMessage,
        message: adviceMessage,
        suggestedAction: suggestedAction || null,
        mealProposals: Array.isArray(mealProposals) && mealProposals.length > 0
          ? mealProposals
          : null,
        adviceId: `advice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      },
      { source: 'CommandTerminalController' },
    );
  }

  publishNewFoodPreview({ entryPer100, donor = null, sourceImageCount = 0 }) {
    const name = String(entryPer100?.desc || '').trim() || 'Nuovo alimento';
    const donorName = donor?.donorName ? String(donor.donorName).trim() : '';
    const badge = donorName ? ` (micro stimati da: ${donorName})` : '';
    const text = `🧾 Etichetta letta: ${name}${badge}. Controlla e salva nel database.`;
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'NEW_FOOD_PREVIEW',
        text,
        newFoodDraft: {
          entryPer100,
          donor: donor
            ? { key: donor.key, donorName: donor.donorName, score: donor.score }
            : null,
          sourceImageCount,
        },
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
      correlationId: meta.correlationId ?? null,
      dedupeKey: meta.dedupeKey ?? {
        commandType: normalizedType,
        correlationId: meta.correlationId ?? null,
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

  publishMealDraftMessage(payload, options = {}) {
    const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const items = expandFoodPayloadItems(payload);
    const mealDraft = {
      commandType: 'ADD_FOOD',
      payload: {
        ...payload,
        items,
      },
    };
    if (this.pendingAction) {
      this.pendingAction.draftId = draftId;
    }
    const summaryText = String(options.summaryText || buildMealDraftUiMessage(payload)).trim();
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'MEAL_DRAFT',
        draftId,
        mealDraft,
        text: summaryText,
        quickReplies: Array.isArray(options.quickReplies) && options.quickReplies.length > 0
          ? options.quickReplies
          : [...MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES],
      },
      { source: 'CommandTerminalController' },
    );
    return draftId;
  }

  publishWorkoutDraftMessage(payload, options = {}) {
    const draftId = `workout_draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const exercises = expandWorkoutPayloadExercises(payload);
    const workoutDraft = {
      commandType: 'ADD_WORKOUT',
      payload: normalizeWorkoutPayload({
        ...payload,
        exercises,
      }),
    };
    if (this.pendingAction) {
      this.pendingAction.draftId = draftId;
    }
    const summaryText = String(options.summaryText || buildWorkoutDraftUiMessage(workoutDraft.payload)).trim();
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'WORKOUT_DRAFT',
        draftId,
        workoutDraft,
        text: summaryText,
        quickReplies: Array.isArray(options.quickReplies) && options.quickReplies.length > 0
          ? options.quickReplies
          : [...WORKOUT_DRAFT_CONFIRMATION_QUICK_REPLIES],
      },
      { source: 'CommandTerminalController' },
    );
    return draftId;
  }

  getWorkoutDraftSnapshot() {
    if (!this.pendingAction || this.pendingAction.commandType !== 'ADD_WORKOUT') return null;
    const payload = normalizeWorkoutPayload(this.pendingAction.payload || {});
    return {
      commandType: 'ADD_WORKOUT',
      payload,
    };
  }

  updatePendingWorkoutMeta({ workoutName, durationMinutes, exactTime, estimatedKcal } = {}, currentState = {}) {
    if (!this.pendingAction || this.pendingAction.commandType !== 'ADD_WORKOUT') return null;
    const next = { ...this.pendingAction.payload };
    const userEditedKcal = estimatedKcal != null && String(estimatedKcal).trim() !== '';

    if (workoutName != null && String(workoutName).trim()) {
      next.workoutName = String(workoutName).trim();
    }

    if (durationMinutes != null && String(durationMinutes).trim() !== '') {
      const mins = Math.max(1, Math.round(Number(durationMinutes) || 0));
      if (Number.isFinite(mins) && mins > 0) {
        next.durationMinutes = mins;
      }
    }

    if (exactTime != null && String(exactTime).trim()) {
      const raw = String(exactTime).trim();
      const match = raw.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        const formatted = `${String(match[1]).padStart(2, '0')}:${match[2]}`;
        next.exactTime = formatted;
        next.timeString = formatted;
      }
    }

    if (userEditedKcal) {
      const kcal = Math.max(0, Math.round(Number(estimatedKcal) || 0));
      if (Number.isFinite(kcal) && kcal >= 0) {
        next.estimatedKcal = kcal;
      }
    } else if (workoutName != null) {
      const withHistorical = applyHistoricalWorkoutKcalDefault(next, currentState);
      if (withHistorical.estimatedKcal != null && withHistorical.estimatedKcal > 0) {
        next.estimatedKcal = withHistorical.estimatedKcal;
      }
    }

    this.pendingAction.payload = next;
    this.pendingCommandPayload = next;
    if (this.pendingAction.meta) {
      this.pendingAction.meta.uiMessage = buildWorkoutDraftUiMessage(next);
    }
    return this.getWorkoutDraftSnapshot();
  }

  updatePendingWorkoutExercise(itemIndex, fields = {}) {
    if (!this.pendingAction || this.pendingAction.commandType !== 'ADD_WORKOUT') return null;
    const exercises = expandWorkoutPayloadExercises(this.pendingAction.payload);
    const index = Number(itemIndex);
    if (!Number.isFinite(index) || index < 0 || index >= exercises.length) return null;

    const current = { ...exercises[index] };
    if (fields.exerciseName != null && String(fields.exerciseName).trim()) {
      current.exerciseName = String(fields.exerciseName).trim();
    }
    if (fields.sets != null) {
      if (String(fields.sets).trim() === '') {
        delete current.sets;
      } else {
        const sets = Math.max(1, Math.round(Number(fields.sets) || 0));
        if (Number.isFinite(sets) && sets > 0) current.sets = sets;
      }
    }
    if (fields.reps != null) {
      if (String(fields.reps).trim() === '') {
        delete current.reps;
      } else {
        const reps = Math.max(1, Math.round(Number(fields.reps) || 0));
        if (Number.isFinite(reps) && reps > 0) current.reps = reps;
      }
    }
    if (fields.weightKg != null) {
      if (String(fields.weightKg).trim() === '') {
        delete current.weightKg;
      } else {
        const weightKg = Math.max(0, Number(fields.weightKg) || 0);
        if (Number.isFinite(weightKg) && weightKg > 0) {
          current.weightKg = Math.round(weightKg * 10) / 10;
        } else {
          delete current.weightKg;
        }
      }
    }

    exercises[index] = current;
    const next = normalizeWorkoutPayload({
      ...this.pendingAction.payload,
      exercises,
    });
    this.pendingAction.payload = next;
    this.pendingCommandPayload = next;
    if (this.pendingAction.meta) {
      this.pendingAction.meta.uiMessage = buildWorkoutDraftUiMessage(next);
    }
    return this.getWorkoutDraftSnapshot();
  }

  removePendingWorkoutExercise(itemIndex) {
    if (!this.pendingAction || this.pendingAction.commandType !== 'ADD_WORKOUT') return null;
    const exercises = expandWorkoutPayloadExercises(this.pendingAction.payload);
    const index = Number(itemIndex);
    if (!Number.isFinite(index) || index < 0 || index >= exercises.length) return null;
    const nextExercises = exercises.filter((_, i) => i !== index);
    if (nextExercises.length === 0 && !String(this.pendingAction.payload?.workoutName || '').trim()) {
      this.cancelPendingAction();
      return null;
    }
    const next = normalizeWorkoutPayload({
      ...this.pendingAction.payload,
      exercises: nextExercises,
    });
    this.pendingAction.payload = next;
    this.pendingCommandPayload = next;
    if (this.pendingAction.meta) {
      this.pendingAction.meta.uiMessage = buildWorkoutDraftUiMessage(next);
    }
    return this.getWorkoutDraftSnapshot();
  }

  getMealDraftSnapshot() {
    if (!this.pendingAction || this.pendingAction.commandType !== 'ADD_FOOD') return null;
    const payload = normalizeFoodPayload(this.pendingAction.payload || {}, {}, {
      inferMealTypeFromContext: false,
    });
    return {
      commandType: 'ADD_FOOD',
      payload,
    };
  }

  updatePendingFoodItemGrams(itemIndex, grams) {
    if (!this.pendingAction || this.pendingAction.commandType !== 'ADD_FOOD') return null;
    const items = expandFoodPayloadItems(this.pendingAction.payload);
    const index = Number(itemIndex);
    const nextGrams = Math.max(1, Math.round(Number(grams) || 0));
    if (!Number.isFinite(index) || index < 0 || index >= items.length || nextGrams <= 0) {
      return null;
    }
    items[index] = { ...items[index], grams: nextGrams };
    this.pendingAction.payload = { ...this.pendingAction.payload, items };
    this.pendingCommandPayload = this.pendingAction.payload;
    return this.getMealDraftSnapshot();
  }

  updatePendingFoodItemName(itemIndex, foodName) {
    if (!this.pendingAction || this.pendingAction.commandType !== 'ADD_FOOD') return null;
    const items = expandFoodPayloadItems(this.pendingAction.payload);
    const index = Number(itemIndex);
    const nextName = String(foodName || '').trim();
    if (!nextName || !Number.isFinite(index) || index < 0 || index >= items.length) {
      return null;
    }
    items[index] = { ...items[index], foodName: nextName };
    this.pendingAction.payload = { ...this.pendingAction.payload, items };
    this.pendingCommandPayload = this.pendingAction.payload;
    return this.getMealDraftSnapshot();
  }

  updatePendingFoodMealMeta({ mealType, exactTime } = {}) {
    if (!this.pendingAction || this.pendingAction.commandType !== 'ADD_FOOD') return null;

    const MEAL_TYPES = ['colazione', 'snack', 'pranzo', 'cena'];
    const next = { ...this.pendingAction.payload };

    if (mealType != null && String(mealType).trim()) {
      const normalized = String(mealType).trim().toLowerCase().split('_')[0];
      if (MEAL_TYPES.includes(normalized)) {
        next.mealType = normalized;
      }
    }

    if (exactTime != null && String(exactTime).trim()) {
      const raw = String(exactTime).trim();
      const match = raw.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        const formatted = `${String(match[1]).padStart(2, '0')}:${match[2]}`;
        next.exactTime = formatted;
        next.timeString = formatted;
      }
    }

    this.pendingAction.payload = next;
    this.pendingCommandPayload = next;
    return this.getMealDraftSnapshot();
  }

  removePendingFoodItem(itemIndex) {
    if (!this.pendingAction || this.pendingAction.commandType !== 'ADD_FOOD') return null;
    const items = expandFoodPayloadItems(this.pendingAction.payload);
    const index = Number(itemIndex);
    if (!Number.isFinite(index) || index < 0 || index >= items.length) return null;
    const nextItems = items.filter((_, i) => i !== index);
    if (nextItems.length === 0) {
      this.cancelPendingAction();
      return null;
    }
    this.pendingAction.payload = { ...this.pendingAction.payload, items: nextItems };
    this.pendingCommandPayload = this.pendingAction.payload;
    return this.getMealDraftSnapshot();
  }

  cancelPendingAction() {
    this.resetConversationState();
  }

  confirmPendingAction() {
    return this.executePendingAction();
  }

  stagePendingAction(commandType, payload, meta = {}) {
    const normalizedType = String(commandType || '').trim().toUpperCase();
    this.pendingAction = {
      commandType: normalizedType,
      payload: { ...payload },
      meta: { ...meta },
    };
    this.pendingCommandType = normalizedType;
    this.pendingCommandPayload = { ...payload };
    this.conversationState = CONVERSATION_STATE.AWAITING_CONFIRMATION;

    if (normalizedType === 'ADD_FOOD') {
      this.publishMealDraftMessage(payload, {
        summaryText: meta.uiMessage || buildMealDraftUiMessage(payload),
        quickReplies: MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES,
      });
    } else if (normalizedType === 'ADD_WORKOUT') {
      this.publishWorkoutDraftMessage(payload, {
        summaryText: meta.uiMessage || buildWorkoutDraftUiMessage(payload),
        quickReplies: WORKOUT_DRAFT_CONFIRMATION_QUICK_REPLIES,
      });
    } else {
      const summary = buildConfirmationSummary(normalizedType, payload);
      this.publishSystemMessage(summary);
    }

    return {
      ok: true,
      awaiting: true,
      awaitingConfirmation: true,
      conversationState: this.conversationState,
      pendingAction: { ...this.pendingAction },
    };
  }

  executePendingAction() {
    if (this.isExecutingAction) {
      return { ok: false, reason: 'already_executing' };
    }
    if (!this.pendingAction?.commandType || !this.pendingAction?.payload) {
      return { ok: false, reason: 'no_pending_action' };
    }

    this.isExecutingAction = true;
    try {
      const snapshot = {
        commandType: this.pendingAction.commandType,
        payload: { ...this.pendingAction.payload },
        meta: { ...(this.pendingAction.meta || {}) },
        draftId: this.pendingAction.draftId || null,
      };
      this.resetConversationState();

      const { uiMessage: _uiMessage, ...execMeta } = snapshot.meta;
      const result = this.dispatchCommand(snapshot.commandType, snapshot.payload, {
        ...execMeta,
        requiresConfirmation: false,
        correlationId: snapshot.draftId
          ? `workout_draft_confirm_${snapshot.draftId}`
          : `workout_confirm_${Date.now()}`,
        dedupeKey: {
          commandType: snapshot.commandType,
          draftId: snapshot.draftId,
          payload: snapshot.payload,
        },
      });
      return { ok: true, ...result };
    } finally {
      this.isExecutingAction = false;
    }
  }

  applyWorkoutDraftClock(payload = {}, originUserText = '') {
    const next = { ...(payload || {}) };
    const userProvidedTime = Boolean(parseExactTimeFromUserText(originUserText));
    if (!userProvidedTime) {
      const now = new Date();
      const currentClock = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      next.exactTime = currentClock;
      next.timeString = currentClock;
      return next;
    }

    const fromText = parseExactTimeFromUserText(originUserText);
    if (fromText) {
      next.exactTime = fromText;
      next.timeString = fromText;
    }
    return next;
  }

  beginWorkoutRegistration(payload, currentState = {}, userText = '', options = {}) {
    this.pendingWorkoutOriginUserText = String(userText || '').trim();
    let normalized = normalizeWorkoutPayload(payload);

    if (parseExactTimeFromUserText(this.pendingWorkoutOriginUserText)) {
      const fromText = parseExactTimeFromUserText(this.pendingWorkoutOriginUserText);
      normalized = { ...normalized, exactTime: fromText, timeString: fromText };
    } else {
      delete normalized.exactTime;
      delete normalized.timeString;
    }

    this.pendingCommandType = 'ADD_WORKOUT';
    this.pendingCommandPayload = { ...normalized };
    this.pendingWorkoutBypassConflict = Boolean(options.bypassConflict);

    if (!this.pendingWorkoutBypassConflict && hasWorkoutToday(currentState?.activeLog)) {
      this.conversationState = CONVERSATION_STATE.AWAITING_WORKOUT_CONFLICT_RESOLUTION;
      this.publishSystemMessage(
        'Hai già un allenamento nel diario oggi. Vuoi procedere con un nuovo inserimento o annullare?',
      );
      return {
        ok: true,
        awaiting: true,
        conversationState: this.conversationState,
        pendingCommandPayload: { ...this.pendingCommandPayload },
      };
    }

    return this.advanceWorkoutRegistration(currentState, userText);
  }

  advanceWorkoutRegistration(currentState = {}, userText = '') {
    this.pendingCommandPayload = this.applyWorkoutDraftClock(
      this.pendingCommandPayload || {},
      this.pendingWorkoutOriginUserText || userText,
    );
    return this.publishWorkoutDraft(currentState);
  }

  publishWorkoutDraft(currentState = {}) {
    let payload = this.applyWorkoutDraftClock(
      { ...(this.pendingCommandPayload || {}) },
      this.pendingWorkoutOriginUserText || '',
    );
    payload = applyHistoricalWorkoutKcalDefault(payload, currentState);
    payload = normalizeWorkoutPayload(payload);
    this.pendingCommandPayload = payload;

    const validationError = validateWorkoutDraftPayload(payload);
    if (validationError) {
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason: validationError, command: payload },
        { source: 'CommandTerminalController' },
      );
      this.resetConversationState();
      return { ok: false, reason: validationError };
    }

    const uiMessage = buildWorkoutDraftUiMessage(payload);
    return this.stagePendingAction('ADD_WORKOUT', payload, {
      requiresConfirmation: true,
      uiMessage,
    });
  }

  processWorkoutSlotFillingResponse(userText, currentState = {}, options = {}) {
    const text = String(userText || '').trim();
    if (!text) {
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason: 'Risposta vuota.' },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason: 'empty_slot_response' };
    }

    if (this.pendingCommandType !== 'ADD_WORKOUT') {
      this.resetConversationState();
      return { ok: false, reason: 'unknown_pending_command' };
    }

    if (this.conversationState === CONVERSATION_STATE.AWAITING_WORKOUT_CONFLICT_RESOLUTION) {
      const action = parseWorkoutConflictResponse(text);
      if (action === 'cancel') {
        this.resetConversationState();
        this.publishSystemMessage('Inserimento annullato.');
        return { ok: true, cancelled: true };
      }
      if (action === 'proceed') {
        this.pendingWorkoutBypassConflict = true;
        return this.advanceWorkoutRegistration(currentState, text);
      }
      this.publishSystemMessage(
        'Hai già un allenamento nel diario oggi. Vuoi procedere con un nuovo inserimento o annullare?',
      );
      return { ok: true, awaiting: true, conversationState: this.conversationState };
    }

    if (this.conversationState === CONVERSATION_STATE.AWAITING_WORKOUT_TIME) {
      const timeResult = applyWorkoutTimeSlotResponse(this.pendingCommandPayload || {}, text);
      if (!timeResult.ok) {
        this.publishSystemMessage('A che ora ti sei allenato? (es. 18:30)');
        return { ok: true, awaiting: true, conversationState: this.conversationState };
      }
      this.pendingCommandPayload = timeResult.payload;
      return this.publishWorkoutDraft(currentState);
    }

    this.resetConversationState();
    return { ok: false, reason: 'invalid_workout_slot_state' };
  }

  processConfirmationResponse(userText, currentState = {}, options = {}) {
    const text = String(userText || '').trim();
    const confirmation = parseConfirmationFromUserText(text);

    if (confirmation === 'yes') {
      return this.executePendingAction();
    }

    if (confirmation === 'no') {
      this.resetConversationState();
      this.publishSystemMessage('Inserimento annullato.');
      return { ok: true, cancelled: true };
    }

    if (confirmation === 'modify') {
      this.publishSystemMessage('Modifica i dati nella card qui sopra, poi conferma.');
      return { ok: true, awaiting: true, conversationState: this.conversationState };
    }

    // Nuovo messaggio: annulla bozza e riprocessa come nuova richiesta.
    this.resetConversationState();
    return this.processUserMessage(text, currentState, options);
  }

  beginFoodSlotFilling(partialPayload, currentState = {}, options = {}) {
    const normalized = normalizeFoodPayload(partialPayload, currentState, {
      inferMealTypeFromContext: false,
      ...options,
    });
    this.pendingCommandType = 'ADD_FOOD';
    this.pendingCommandPayload = { ...normalized };

    const missingGrams = getFoodItemsMissingGrams(this.pendingCommandPayload);
    if (missingGrams.length === 0) {
      return this.publishFoodDraftAfterGrams(currentState);
    }

    this.conversationState = CONVERSATION_STATE.AWAITING_FOOD_GRAMS;
    this.publishSystemMessage(
      promptForMissingMealRegistrationSlot('foods', this.pendingCommandPayload),
    );
    return {
      ok: true,
      awaiting: true,
      conversationState: this.conversationState,
      pendingCommandPayload: { ...this.pendingCommandPayload },
    };
  }

  completePendingFoodCommand(currentState = {}, options = {}) {
    const lockedItems = lockPendingFoodItems(this.pendingCommandPayload || {});
    const withTiming = applyMealTimingDefaultsOnly({
      ...(this.pendingCommandPayload || {}),
      items: lockedItems,
    });
    const payload = normalizeFoodPayload(withTiming, currentState, {
      inferMealTypeFromContext: false,
    });
    payload.items = lockedItems;
    this.pendingCommandPayload = payload;
    const validationError = validateFoodPayload(payload);
    if (validationError) {
      const missing = getFoodPayloadMissingFields(payload);
      if (missing.includes('grams')) {
        this.pendingCommandPayload = { ...payload };
        this.conversationState = CONVERSATION_STATE.AWAITING_FOOD_GRAMS;
        this.publishSystemMessage(promptForMissingMealRegistrationSlot('foods', payload));
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

    const uiMessage = options.uiMessage || buildMealDraftUiMessage(payload);
    return this.stagePendingAction('ADD_FOOD', payload, {
      requiresConfirmation: true,
      uiMessage,
    });
  }

  processSlotFillingResponse(userText, currentState = {}, options = {}) {
    const text = String(userText || '').trim();
    const chatHistory = Array.isArray(options?.chatHistory) ? options.chatHistory : [];
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
      const gramsResult = applyGramsSlotResponse(pending, text);
      if (!gramsResult.ok || !gramsResult.applied) {
        this.publishSystemMessage(promptForMissingMealRegistrationSlot('foods', pending));
        return { ok: true, awaiting: true, conversationState: this.conversationState };
      }

      this.pendingCommandPayload = gramsResult.payload;

      return this.publishFoodDraftAfterGrams(currentState);
    }

    if (this.conversationState === CONVERSATION_STATE.AWAITING_TIME) {
      const mealType = parseMealTypeFromUserText(text);
      if (!mealType) {
        const prompt = this.pendingMealRegistration
          ? promptForMissingMealRegistrationSlot('mealType', pending)
          : 'Non ho riconosciuto il pasto. Rispondi con: colazione, pranzo, cena o snack.';
        this.publishSystemMessage(prompt);
        return { ok: true, awaiting: true, conversationState: this.conversationState };
      }
      pending.mealType = mealType;
      this.pendingCommandPayload = pending;

      if (this.pendingMealRegistration) {
        return this.advanceMealRegistrationSlotFilling(currentState, text, chatHistory);
      }
      return this.completePendingFoodCommand(currentState);
    }

    if (this.conversationState === CONVERSATION_STATE.AWAITING_EXACT_TIME) {
      const exactTime =
        parseExactTimeFromUserText(text)
        || normalizeExactTime(text);
      if (!exactTime) {
        this.publishSystemMessage(promptForMissingMealRegistrationSlot('exactTime', pending));
        return { ok: true, awaiting: true, conversationState: this.conversationState };
      }
      this.pendingCommandPayload = {
        ...pending,
        exactTime,
        timeString: exactTime,
      };

      if (this.pendingMealRegistration) {
        return this.advanceMealRegistrationSlotFilling(currentState, text, chatHistory);
      }

      this.resetConversationState();
      return { ok: false, reason: 'exact_time_without_meal_registration' };
    }

    this.resetConversationState();
    return { ok: false, reason: 'invalid_conversation_state' };
  }

  async processMealAdvice(userText, currentState = {}, options = {}) {
    const rawQuery = String(userText || '').trim();
    const chatHistory = Array.isArray(options?.chatHistory) ? options.chatHistory : [];
    const isCompletion = isMealCompletionIntent(rawQuery);
    const partialMeal = isCompletion ? parseConsumedMealFromNaturalText(rawQuery) : null;
    const isDayReview = isDayReviewIntent(rawQuery);
    const isGeneric = isGenericMealSuggestionQuery(rawQuery);
    const targetFood = isDayReview
      ? rawQuery
      : isGeneric
      ? rawQuery
      : (extractTargetFoodFromQuery(rawQuery) || rawQuery);
    if (!targetFood) {
      this.publishSystemMessage('Dimmi quale alimento vuoi valutare (es. «Posso mangiare una pizza?»).');
      return { ok: false, reason: 'empty_meal_advice_target' };
    }

    let adviceContext;
    try {
      adviceContext = await buildAdviceContext(targetFood, currentState, {
        intent: isDayReview
          ? 'ASK_DAY_REVIEW'
          : isCompletion
            ? 'ASK_MEAL_COMPLETION'
            : 'ASK_MEAL_ADVICE',
        partialMeal,
      });
    } catch (error) {
      const reason = `Consultant context failure: ${error?.message || 'unknown error'}`;
      console.error('[CommandTerminalController] buildAdviceContext error', error);
      this.publishErrorMessage(USER_FACING_ERROR_MESSAGE);
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason, userText, intent: 'ASK_MEAL_ADVICE', silent: true },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason, userNotified: true };
    }

    const consultantPrompt = generateConsultantPrompt(adviceContext, targetFood);

    try {
      const { adviceMessage, suggestedAction: rawAction, mealProposals: rawProposals, model } =
        await this.llmClient.generateConsultantResponse({
          prompt: consultantPrompt,
          temperature: 0.35,
          chatHistory,
        });
      const suggestedAction = sanitizeSuggestedAction(rawAction, adviceContext);
      let mealProposals = sanitizeMealProposals(rawProposals, adviceContext);
      if (isGeneric || adviceContext.isGenericMealSuggestion) {
        mealProposals = ensureMealProposalsForAdvice(mealProposals, adviceContext);
      }
      this.publishAdviceMessage({
        text: adviceMessage,
        suggestedAction,
        mealProposals,
      });
      return { ok: true, intent: 'ASK_MEAL_ADVICE', model, adviceContext, suggestedAction, mealProposals };
    } catch (error) {
      const reason = `Consultant LLM failure: ${error?.message || 'unknown error'}`;
      console.error('[CommandTerminalController] Meal advice LLM error', error);
      this.publishErrorMessage(USER_FACING_ERROR_MESSAGE);
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason, userText, intent: 'ASK_MEAL_ADVICE', silent: true },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason, userNotified: true };
    }
  }

  async processUserMessage(text, currentState = {}, options = {}) {
    try {
      return await this.processUserMessageCore(text, currentState, options);
    } catch (error) {
      console.error('[CommandTerminalController] Unhandled processUserMessage error', error);
      this.publishErrorMessage(USER_FACING_ERROR_MESSAGE);
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        {
          reason: error?.message || 'unhandled_error',
          userText: String(text || '').trim(),
          silent: true,
        },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason: 'unhandled_error', userNotified: true };
    }
  }

  async processUserMessageCore(text, currentState = {}, options = {}) {
    const userText = String(text || '').trim();
    const images = Array.isArray(options?.images) ? options.images : [];
    const chatHistory = Array.isArray(options?.chatHistory) ? options.chatHistory : [];

    if (this.conversationState === CONVERSATION_STATE.AWAITING_CONFIRMATION) {
      return this.processConfirmationResponse(userText, currentState, options);
    }

    if (
      this.conversationState === CONVERSATION_STATE.AWAITING_WORKOUT_CONFLICT_RESOLUTION
      || this.conversationState === CONVERSATION_STATE.AWAITING_WORKOUT_TIME
    ) {
      return this.processWorkoutSlotFillingResponse(userText, currentState, options);
    }

    if (this.conversationState !== CONVERSATION_STATE.IDLE) {
      if (images.length > 0) {
        this.publishSystemMessage('Completa prima la domanda in sospeso, poi allega eventuali screenshot.');
        return this.processSlotFillingResponse(userText, currentState, options);
      }
      return this.processSlotFillingResponse(userText, currentState, options);
    }

    if (!userText && images.length === 0) {
      const reason = 'Empty user message';
      this.publishErrorMessage('Scrivi un messaggio o allega uno screenshot.');
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason, silent: true },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason, userNotified: true };
    }

    const inferredIntent = this.resolveEffectiveIntent(userText, {
      intent: options.intent,
      hasImages: images.length > 0,
    });

    if (
      inferredIntent === 'ASK_DAY_REVIEW'
      || inferredIntent === 'ASK_MEAL_ADVICE'
      || inferredIntent === 'ASK_MEAL_COMPLETION'
      || (isMealAdviceIntent(userText) && !isConsumedMealLogDescription(userText) && !looksLikeComplexMealLog(userText))
    ) {
      return this.processMealAdvice(userText, currentState, options);
    }

    const commandHint =
      inferredIntent === 'UNKNOWN'
      && isFoodRegistrationIntent(userText)
        ? 'ADD_FOOD'
        : inferredIntent;

    const contextBundle = this.composer.buildPromptContext(commandHint, currentState, userText);

    let commandResponse;
    try {
      commandResponse = await this.llmClient.generateStructuredCommand({
        userText,
        contextBundle,
        commandHint,
        images,
        chatHistory,
      });
    } catch (error) {
      const detail =
        error?.details
        || error?.message
        || error?.code
        || 'unknown error';
      const reason = `LLM failure: ${detail}`;
      console.error('[CommandTerminalController] LLM error', error);

      if (looksLikeComplexMealLog(userText) || isConsumedMealLogDescription(userText)) {
        const localResult = this.tryParseAndPublishMealLog(userText, currentState, chatHistory);
        if (localResult) return localResult;
      }

      this.publishErrorMessage(USER_FACING_ERROR_MESSAGE);
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason, userText, intent: commandHint, silent: true },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason, userNotified: true };
    }

    const commandType = String(commandResponse.command?.commandType || '').trim().toUpperCase();
    let rawPayload = commandResponse.command?.payload || {};

    if (commandType === 'CREATE_NEW_FOOD') {
      const desc = String(rawPayload?.desc || '').trim();
      const entryPer100 = {
        desc: desc || 'Nuovo alimento',
        kcal: Number.isFinite(Number(rawPayload?.kcal)) ? Number(rawPayload.kcal) : null,
        prot: Number.isFinite(Number(rawPayload?.prot)) ? Number(rawPayload.prot) : null,
        carb: Number.isFinite(Number(rawPayload?.carb)) ? Number(rawPayload.carb) : null,
        fatTotal: Number.isFinite(Number(rawPayload?.fatTotal)) ? Number(rawPayload.fatTotal) : null,
        fibre: Number.isFinite(Number(rawPayload?.fibre)) ? Number(rawPayload.fibre) : null,
      };
      const donor = findNutritionalDonor(entryPer100, currentState?.foodDatabase || {});
      const inherited = donor?.donorRow ? inheritMicrosFromDonor(entryPer100, donor.donorRow) : entryPer100;
      this.publishNewFoodPreview({
        entryPer100: inherited,
        donor,
        sourceImageCount: images.length,
      });
      return { ok: true, intent: 'CREATE_NEW_FOOD', commandType: 'CREATE_NEW_FOOD', entryPer100: inherited, donor };
    }

    if (
      commandType === 'ADD_FOOD'
      && isMealAdviceIntent(userText)
      && !isConsumedMealLogDescription(userText)
      && !looksLikeComplexMealLog(userText)
    ) {
      return this.processMealAdvice(userText, currentState, options);
    }

    if (commandType === 'ADD_WORKOUT') {
      rawPayload = normalizeWorkoutPayload(rawPayload);
      commandResponse.command = { ...commandResponse.command, payload: rawPayload };
    }

    if (!COMMAND_TO_EVENT[commandType]) {
      if (looksLikeComplexMealLog(userText) || isConsumedMealLogDescription(userText)) {
        const localResult = this.tryParseAndPublishMealLog(userText, currentState, chatHistory);
        if (localResult) return localResult;
      }
      this.publishErrorMessage(USER_FACING_PARSE_ERROR_MESSAGE);
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        {
          reason: `Unsupported commandType: ${commandType || 'empty'}`,
          userText,
          intent: commandHint,
          silent: true,
        },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason: 'unsupported_command_type', userNotified: true };
    }

    if (commandType === 'ADD_FOOD') {
      this.publishAddFoodContextAdvice(commandResponse.command);

      let normalized = normalizeFoodPayload(rawPayload, currentState, {
        inferMealTypeFromContext: false,
      });
      const mealFromUser = parseMealTypeFromUserText(userText);
      if (mealFromUser && !normalized.mealType) {
        normalized = { ...normalized, mealType: mealFromUser };
      }
      const missing = getFoodPayloadMissingFields(normalized);
      const hasFood = expandFoodPayloadItems(normalized).length > 0;

      if (this.isMealRegistrationCandidate(userText) && hasFood) {
        return this.publishMealLogProposalCard(normalized, currentState, userText, chatHistory);
      }

      if (missing.length === 0 && this.shouldUseMealLogProposalCard(userText, normalized)) {
        return this.publishMealLogProposalCard(normalized, currentState, userText, chatHistory);
      }

      if (missing.length > 0 && hasFood) {
        return this.beginFoodSlotFilling(normalized, currentState);
      }
    }

    const validationError = validateEnvelope(commandResponse.command);
    if (validationError) {
      if (commandType === 'ADD_FOOD' && expandFoodPayloadItems(rawPayload).length > 0) {
        return this.beginFoodSlotFilling(rawPayload, currentState);
      }

      if (looksLikeComplexMealLog(userText) || isConsumedMealLogDescription(userText)) {
        const localResult = this.tryParseAndPublishMealLog(userText, currentState, chatHistory);
        if (localResult) return localResult;
      }

      this.publishErrorMessage(USER_FACING_PARSE_ERROR_MESSAGE);
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        {
          reason: validationError,
          userText,
          intent: commandHint,
          rawModelResponse: commandResponse.rawText,
          silent: true,
        },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason: validationError, userNotified: true };
    }

    console.log('✅ Intent completato con successo:', commandType);
    let payload = commandType === 'ADD_FOOD'
      ? normalizeFoodPayload(rawPayload, currentState, { inferMealTypeFromContext: true })
      : commandType === 'ADD_WORKOUT'
        ? normalizeWorkoutPayload(rawPayload)
        : { ...rawPayload };

    if (commandType === 'ADD_FOOD' && !payload.mealType) {
      const mealFromUser = parseMealTypeFromUserText(userText);
      if (mealFromUser) payload = { ...payload, mealType: mealFromUser };
    }

    if (commandType === 'ADD_FOOD' && this.shouldUseMealLogProposalCard(userText, payload)) {
      return this.publishMealLogProposalCard(payload, currentState, userText, chatHistory);
    }

    if (commandType === 'ADD_WORKOUT') {
      return this.beginWorkoutRegistration(payload, currentState, userText);
    }

    return this.stagePendingAction(commandType, payload, {
      confidence: commandResponse.command.confidence ?? null,
      requiresConfirmation: true,
      uiMessage: commandResponse.command.uiMessage,
    });
  }
}

export const commandTerminalController = new CommandTerminalController();
