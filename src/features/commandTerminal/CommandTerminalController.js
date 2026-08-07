import { commandBus } from './dispatcher/CommandBus.js';
import { contextComposer } from './context/ContextComposer.js';
import { geminiStructuredClient } from './llm/GeminiStructuredClient.js';
import { isAbortError } from '../../services/aiService.js';
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
  buildMealPreviewReadyMessage,
  buildSleepConfirmationSummary,
  buildWorkoutConfirmationSummary,
  buildWorkoutDraftUiMessage,
  expandFoodPayloadItems,
  expandWorkoutPayloadExercises,
  getFoodItemsMissingGrams,
  getFoodPayloadMissingFields,
  MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES,
  MEAL_DRAFT_ESTIMATED_WEIGHTS_ADVICE,
  normalizeFoodPayload,
  normalizeWorkoutPayload,
  parseConfirmationFromUserText,
  parseMealTypeFromUserText,
  payloadHasEstimatedFoodWeights,
  WORKOUT_DRAFT_CONFIRMATION_QUICK_REPLIES,
} from './conversation/conversationState.js';
import {
  buildAdviceContext,
  buildMealLogProposalFromPayload,
  buildFixMealDraftAdviceMessage,
  buildSubstituteMealDraftAdviceMessage,
  buildUpdateLoggedMealAdviceMessage,
  buildUpdateLoggedMealPreviewProposal,
  buildConsultantMealAdviceMessage,
  buildWipMealAdviceMessage,
  projectNutritionAfterMeal,
  sumMealItemsMacros,
  sanitizeWipSuggestions,
  ensureMealProposalsForAdvice,
  ensureMealProposalsForConsultantMeal,
  ensureMealProposalsForFixDraft,
  ensureMealProposalsForSubstituteDraft,
  ensureMealProposalsForUpdateLoggedMeal,
  extractTargetFoodFromQuery,
  generateConsultantPrompt,
  generateConsultantSystemInstruction,
  isGenericMealSuggestionQuery,
  sanitizeMealProposals,
  sanitizeSuggestedAction,
  buildUserHabitsForCurrentMeal,
} from '../../conversation/ConsultantEngine.js';
import {
  isConsumedMealLogDescription,
  isDayReviewIntent,
  isMealCompletionIntent,
  isMealDraftEvaluationIntent,
  isFixMealDraftIntent,
  isSubstituteMealDraftIntent,
  isCreateNewFoodIntent,
  isFoodRegistrationIntent,
  isMealAdviceIntent,
  isConsultantMealIntent,
  parseConsultantMealIntent,
  isWipMealBuildIntent,
  parseWipMealDeclaration,
  isUpdateLoggedMealIntent,
  isMergeIntoExistingMealIntent,
  parseTargetMealTypeFromUpdateText,
  resolveUpdateMealContext,
  findPendingUpdateLoggedMealContext,
  hasExplicitUpdateAction,
  buildUpdateLoggedMealCombinedQuery,
  buildUpdateWaitingPromptMessage,
  buildUpdateMealDisambiguationMessage,
  buildUpdateMealNoMatchMessage,
  MEAL_UPDATE_WAITING_STATE,
  MEAL_UPDATE_DISAMBIGUATION_STATE,
  looksLikeComplexMealLog,
  normalizeExactTime,
  parseConsumedMealFromNaturalText,
  parseMealDraftProjectionFromText,
  findLatestMealDraftProjectionFromChatHistory,
  parseRemovedFoodQueryFromSubstituteText,
  parseExactTimeFromUserText,
  isClarificationFollowUpReply,
  parseMealLogFromChatThread,
  buildApproximateMealLogForRecovery,
  extractBareFoodNamesFromText,
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
  BUTLER_MEAL_QUICK_REPLIES,
  REQUEST_FOOD_PHOTO_QUICK_REPLIES,
  enrichFoodItemsAsButlerProposal,
  buildButlerConfirmationMessage,
  buildRequestFoodPhotoMessage,
} from './conversation/mealButlerProposal.js';
import { sanitizeUserPortionsDict } from './conversation/userPortionsMemory.js';
import { findFoodDbMatchCascading } from '../salaComandi/engines/foodDataEngine.js';
import {
  CONFIRM_MEAL_DRAFT,
  UPDATE_MEAL_DRAFT,
  CANCEL_MEAL_DRAFT,
  classifyMealDraftVoiceReply,
  applyVoiceCorrectionToMealDraft,
  buildMcDriveUpdatedConfirmationMessage,
  buildMcDriveClarificationDoneMessage,
  detectPartialMealDraftCorrection,
  applyPartialClarificationReply,
  isUpdateMealDraftIntent,
} from './conversation/mealDraftVoiceEdit.js';
import {
  createMealWizardState,
  parseWizardItemReply,
  commitWizardItemAndAdvance,
  buildWizardItemPrompt,
  buildWizardItemQuickReplies,
  buildWizardAdvanceMessage,
  buildWizardFinalSpokenText,
  buildFoodPayloadFromWizard,
  classifyWizardFinalReply,
  resolveWizardPendingQueue,
  mergeExplicitGramsIntoQueue,
  shouldForceSequentialFoodWizard,
  sanitizeWizardFoodName,
  resolveWizardSelection,
} from './conversation/sequentialFoodWizard.js';
import {
  applyHistoricalWorkoutKcalDefault,
  applyWorkoutTimeSlotResponse,
  buildLocalWorkoutPayloadFromText,
  hasWorkoutToday,
  inferWorkoutTypeFromText,
  isWorkoutLogIntent,
  normalizeChatWorkoutType,
  parseWorkoutConflictResponse,
  isConsultativeStateIntent,
} from './conversation/workoutRegistrationSlots.js';
import {
  appendKentuGlobalStateToSystemInstruction,
  buildKentuGlobalStateFromAppState,
} from './context/kentuGlobalState.js';
import { handleLocalQuery } from './context/localReceptionist.js';
import {
  classifyMealWipSubIntent,
  hasMealWipConstraints,
  isMealWipSessionStart,
  MEAL_WIP_SUB_INTENTS,
  MEAL_WIP_SYSTEM_PROMPT,
  parseMealConstraintsFromText,
  residualCaloriesFromWip,
  scaleSuggestionToResidualCalories,
  serializeMealWipForPrompt,
} from '../wipMealBuilder/mealWipEngine.js';
import {
  buildWipConfirmAdviceMessage,
  deduplicateWipItems,
  mergeWipMealItemsByName,
  normalizeWipFoodNameKey,
} from '../wipMealBuilder/utils/wipMealItemUtils.js';
import {
  buildMealReceiptPayload,
  mealReceiptFallbackText,
} from '../chat/mealReceiptUtils.js';
import { buildChatPersonaSystemBlock, resolveUserDisplayName } from '../chat/chatPersona.js';

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
  const workoutType = normalizeChatWorkoutType(payload.workoutType)
    || inferWorkoutTypeFromText(`${workoutName} ${exercises.map((e) => e.exerciseName).join(' ')}`);
  if (exercises.length === 0 && !workoutName && !workoutType) {
    return 'workoutType or workoutName is required';
  }
  if (exercises.some((item) => !String(item.exerciseName || '').trim())) {
    return 'exerciseName is required for each exercise';
  }
  // durationMinutes: se assente, normalizeWorkoutPayload applica default 45 — non bloccare.
  if (payload.durationMinutes != null) {
    if (!isFiniteNumber(payload.durationMinutes) || Number(payload.durationMinutes) <= 0) {
      return 'durationMinutes must be > 0 when provided';
    }
  }
  if (payload.rpe != null) {
    const rpe = Number(payload.rpe);
    if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) {
      return 'rpe must be an integer from 1 to 10 when provided';
    }
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
  if (payload.sleepQuality != null) {
    const sq = Number(payload.sleepQuality);
    if (!Number.isFinite(sq) || sq < 1 || sq > 5) {
      return 'sleepQuality must be an integer from 1 to 5 when provided';
    }
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
    /** @type {object | null} Stato multi-turno UPDATE_LOGGED_MEAL (indipendente da chatHistory). */
    this.pendingMealUpdate = null;
    /** @type {object | null} Bozza pasto McDrive in sospeso (proposta → correzioni → conferma). */
    this.pendingMealDraft = null;
    /**
     * Chiarimento mirato su correzione incompleta (es. quantità del pane senza grammi).
     * @type {{ field: 'grams'|'type', targetIndex: number, targetLabel: string, spokenPrompt?: string } | null}
     */
    this.pendingMealDraftClarification = null;
    /** @type {import('./conversation/sequentialFoodWizard.js').MealWizardState | null} */
    this.mealWizardState = null;
    /** @type {{ confirmLabel?: string, payload?: object } | null} Recovery soft post-errore LLM. */
    this.pendingSoftMealRecovery = null;
  }

  setPendingMealUpdate(ctx) {
    if (!ctx || typeof ctx !== 'object') {
      this.pendingMealUpdate = null;
      return;
    }
    this.pendingMealUpdate = { ...ctx };
  }

  clearPendingMealUpdate() {
    this.pendingMealUpdate = null;
  }

  getPendingMealUpdate() {
    return this.pendingMealUpdate ? { ...this.pendingMealUpdate } : null;
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
      pendingMealUpdate: this.getPendingMealUpdate(),
      pendingMealDraft: this.getPendingMealDraft(),
      mealWizardState: this.getMealWizardState(),
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
    this.pendingMealUpdate = null;
    this.pendingMealDraft = null;
    this.pendingMealDraftClarification = null;
    this.mealWizardState = null;
    this.pendingSoftMealRecovery = null;
  }

  setPendingMealDraft(draft) {
    if (!draft || typeof draft !== 'object') {
      this.pendingMealDraft = null;
      this.pendingMealDraftClarification = null;
      return;
    }
    this.pendingMealDraft = {
      ...draft,
      items: expandFoodPayloadItems(draft).map((item) => ({ ...item })),
      updatedAt: Date.now(),
    };
  }

  clearPendingMealDraft() {
    this.pendingMealDraft = null;
    this.pendingMealDraftClarification = null;
  }

  /**
   * Domanda mirata per correzione incompleta (niente prompt generici).
   */
  askMealDraftClarification(partial) {
    if (!partial?.spokenPrompt) return;
    this.pendingMealDraftClarification = {
      field: partial.field,
      targetIndex: partial.targetIndex,
      targetLabel: partial.targetLabel,
      spokenPrompt: partial.spokenPrompt,
    };
    this.conversationState = CONVERSATION_STATE.AWAITING_CONFIRMATION;
    this.publishSystemMessage(partial.spokenPrompt);
  }

  /**
   * Dopo correzione: ripubblica card amichevole + TTS breve.
   */
  async republishMealDraftAfterVoiceEdit(nextPayload, currentState, options = {}) {
    const items = expandFoodPayloadItems(nextPayload);
    const voiceMessage = String(options.spokenText || '').trim()
      || buildMcDriveUpdatedConfirmationMessage(items);
    const payload = {
      ...nextPayload,
      message: voiceMessage,
    };
    this.pendingMealDraftClarification = null;
    return this.publishMealLogProposalCardDirect(
      payload,
      currentState,
      options.userText || '',
      options.chatHistory || [],
      {
        uiMessage: voiceMessage,
        spokenText: voiceMessage,
        fromVoiceCorrection: true,
        skipWizard: true,
      },
    );
  }

  getPendingMealDraft() {
    return this.pendingMealDraft
      ? {
          ...this.pendingMealDraft,
          items: expandFoodPayloadItems(this.pendingMealDraft).map((item) => ({ ...item })),
        }
      : null;
  }

  getMealWizardState() {
    return this.mealWizardState
      ? {
          ...this.mealWizardState,
          pendingItems: [...(this.mealWizardState.pendingItems || [])],
          resolvedItems: (this.mealWizardState.resolvedItems || []).map((i) => ({ ...i })),
          current: this.mealWizardState.current
            ? {
                ...this.mealWizardState.current,
                candidates: [...(this.mealWizardState.current.candidates || [])],
              }
            : null,
        }
      : null;
  }

  clearMealWizardState() {
    this.mealWizardState = null;
  }

  getWizardContext(currentState = {}) {
    return {
      personalDb: currentState?.foodDatabase
        || currentState?.trackerFoodDatabase
        || currentState?.personalFoodDb
        || null,
      userPortions: sanitizeUserPortionsDict(
        currentState?.userPortions
        || currentState?.nutrition?.userPortions
        || {},
      ),
    };
  }

  publishWizardItemPrompt(state, options = {}) {
    if (!state?.current) return;
    const allSpokenNames = Array.isArray(options.allSpokenNames) && options.allSpokenNames.length > 0
      ? options.allSpokenNames
      : [
          state.current.spokenName,
          ...(state.pendingItems || []).slice(1).map((p) => p.spokenName),
        ].filter(Boolean);
    // Intro multi-item solo al primo step (resolved vuoto): mai grammi/varianti dei successivi.
    const showBatchIntro = (state.resolvedItems || []).length === 0 && allSpokenNames.length > 1;
    const { spokenText, displayText } = buildWizardItemPrompt(state.current, {
      allSpokenNames: showBatchIntro ? allSpokenNames : [],
    });
    const quickReplies = buildWizardItemQuickReplies(state.current);
    this.conversationState = CONVERSATION_STATE.AWAITING_MEAL_WIZARD_ITEM;
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'ASK_CLARIFICATION',
        text: displayText,
        message: displayText,
        spokenText,
        displayText,
        quickReplies,
        clarification: true,
        mealWizard: true,
        mealWizardPhase: 'item',
        mealProposals: null,
      },
      { source: 'CommandTerminalController' },
    );
  }

  /**
   * Fine coda wizard → card proposal amichevole (macro/emoji) + TTS breve.
   * Non pubblica testo grezzo di riepilogo.
   */
  async publishWizardFinalProposalCard(state, currentState = {}) {
    const spokenText = buildWizardFinalSpokenText();
    const payload = normalizeFoodPayload(
      buildFoodPayloadFromWizard(state),
      currentState,
      { inferMealTypeFromContext: false },
    );
    // Chiudi il wizard: da qui conferma = McDrive / meal proposal, non AWAITING_MEAL_WIZARD_CONFIRM.
    this.clearMealWizardState();
    return this.publishMealLogProposalCardDirect(
      payload,
      currentState,
      '',
      [],
      {
        skipWizard: true,
        fromVoiceCorrection: true,
        uiMessage: spokenText,
        spokenText,
      },
    );
  }

  publishWizardConfirmPrompt(state, currentState = {}) {
    // Preferisci sempre la card riepilogo invece del testo grezzo.
    return this.publishWizardFinalProposalCard(state, currentState);
  }

  /**
   * Multi-item ADD_FOOD → SequentialFoodWizard obbligatorio (niente bozza globale).
   */
  mustUseSequentialFoodWizard(payload, userText = '') {
    const items = expandFoodPayloadItems(payload);
    return shouldForceSequentialFoodWizard(items, userText, extractBareFoodNamesFromText);
  }

  /**
   * Avvia SequentialFoodWizard al posto della proposta batch.
   * Blocca pendingMealDraft / MEAL_DRAFT finché ogni item non è in resolvedItems.
   */
  startSequentialFoodWizard(payload, currentState = {}, userText = '') {
    const items = expandFoodPayloadItems(payload);
    const bareNames = extractBareFoodNamesFromText(userText);
    const fallbackItems = items.length > 0
      ? items
      : [{ foodName: String(payload?.foodName || '').trim(), grams: payload?.grams }];
    let pendingItems = resolveWizardPendingQueue(fallbackItems, bareNames);
    // Grammi espliciti dal testo utente (anche se LLM li ha droppati).
    const natural = parseConsumedMealFromNaturalText(userText);
    if (natural?.items?.length) {
      pendingItems = mergeExplicitGramsIntoQueue(pendingItems, natural.items);
    }
    if (pendingItems.length === 0) {
      return { ok: false, reason: 'empty_wizard_queue' };
    }

    const ctx = this.getWizardContext(currentState);
    const withTiming = applyMealTimingDefaultsOnly(payload || {});
    const state = createMealWizardState({
      pendingItems,
      mealType: withTiming.mealType || payload?.mealType || null,
      exactTime: withTiming.exactTime || payload?.exactTime || null,
      personalDb: ctx.personalDb,
      userPortions: ctx.userPortions,
    });
    this.mealWizardState = state;
    // Vietato bozza globale mentre il wizard è attivo.
    this.pendingMealDraft = null;
    this.pendingAction = null;
    this.pendingCommandType = null;
    this.pendingCommandPayload = null;

    console.log('🧙 DEBUG - START SEQUENTIAL FOOD WIZARD:', {
      pending: pendingItems.map((p) => p.spokenName),
      userText: String(userText || '').slice(0, 80),
    });

    if (state.phase === 'confirm') {
      return this.publishWizardFinalProposalCard(state, currentState);
    }

    this.publishWizardItemPrompt(state, {
      allSpokenNames: pendingItems.map((p) => p.spokenName),
    });
    return {
      ok: true,
      intent: 'MEAL_WIZARD',
      phase: 'item',
      mealWizardState: this.getMealWizardState(),
    };
  }

  async processMealWizardResponse(userText, currentState = {}, options = {}) {
    const text = String(userText || '').trim();
    const state = this.getMealWizardState();
    if (!state) {
      this.resetConversationState();
      return this.processUserMessage(text, currentState, options);
    }

    const ctx = this.getWizardContext(currentState);

    if (
      this.conversationState === CONVERSATION_STATE.AWAITING_MEAL_WIZARD_CONFIRM
      || state.phase === 'confirm'
    ) {
      const final = classifyWizardFinalReply(text);
      if (final === 'confirm') {
        console.log('🟡 DEBUG - PATH SCELTO: MEAL_WIZARD CONFIRM → SAVE');
        const payload = normalizeFoodPayload(
          buildFoodPayloadFromWizard(state),
          currentState,
          { inferMealTypeFromContext: false },
        );
        this.clearMealWizardState();
        this.stagePendingMealDraft(payload, { uiMessage: 'Pasto pronto.' });
        if (this.pendingAction?.commandType === 'ADD_FOOD') {
          this.pendingAction.payload = { ...payload };
        }
        this.pendingCommandPayload = { ...payload };
        const result = this.executePendingAction();
        if (result?.ok) {
          this.publishSystemMessage('Perfetto, pasto salvato.');
        }
        return { ...result, intent: 'MEAL_WIZARD_CONFIRM' };
      }
      if (final === 'cancel') {
        this.resetConversationState();
        this.publishSystemMessage('Ok, bozza annullata.');
        return { ok: true, cancelled: true, intent: 'MEAL_WIZARD_CANCEL' };
      }
      return this.publishWizardFinalProposalCard(state, currentState);
    }

    // Fase item
    if (/^(?:annulla|cancel|stop)\b/i.test(text)) {
      this.resetConversationState();
      this.publishSystemMessage('Ok, wizard annullato.');
      return { ok: true, cancelled: true, intent: 'MEAL_WIZARD_CANCEL' };
    }

    // Click bottone strutturato: accetta foodDbKey/foodName ESATTI — zero fuzzy re-search.
    let parsed;
    const selection = options?.wizardSelection && typeof options.wizardSelection === 'object'
      ? options.wizardSelection
      : null;
    if (selection && (selection.foodDbKey || selection.foodName || selection.action === 'photo')) {
      parsed = resolveWizardSelection(state, selection);
      console.log('🧙 DEBUG - WIZARD SELECTION (exact click):', {
        foodDbKey: selection.foodDbKey,
        foodName: selection.foodName,
        grams: selection.grams,
        resolved: parsed.resolved?.foodName,
      });
    } else {
      parsed = parseWizardItemReply(state, text);
    }

    if (parsed.requestPhoto) {
      return this.publishRequestFoodPhoto(
        {
          payload: {
            message: buildRequestFoodPhotoMessage(state.current?.spokenName || ''),
            foodName: state.current?.spokenName || '',
            options: [...REQUEST_FOOD_PHOTO_QUICK_REPLIES],
          },
        },
        text,
      );
    }

    if (!parsed.ok || !parsed.resolved) {
      this.publishWizardItemPrompt(state);
      this.publishSystemMessage(
        'Non ho colto. Scegli una delle opzioni, oppure dimmi nome e grammi (es. «rosetta 80 grammi»).',
      );
      return { ok: true, awaiting: true, intent: 'MEAL_WIZARD', reason: parsed.reason };
    }

    const nextState = commitWizardItemAndAdvance(state, parsed.resolved, ctx);
    this.mealWizardState = nextState;

    const advance = buildWizardAdvanceMessage(parsed.resolved, nextState);
    console.log('🧙 DEBUG - WIZARD ITEM RESOLVED:', {
      resolved: {
        foodName: sanitizeWizardFoodName(parsed.resolved?.foodName) || parsed.resolved?.foodName,
        grams: parsed.resolved?.grams,
      },
      remaining: nextState.pendingItems.map((p) => p.spokenName),
      phase: nextState.phase,
    });

    if (nextState.phase === 'confirm' || !nextState.current) {
      // Ultimo item: card riepilogo amichevole (macro/emoji), non testo grezzo.
      return this.publishWizardFinalProposalCard(nextState, currentState);
    }

    // Item successivo: voce breve + bottoni varianti (mai elenco in TTS).
    this.conversationState = CONVERSATION_STATE.AWAITING_MEAL_WIZARD_ITEM;
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'ASK_CLARIFICATION',
        text: advance.displayText,
        message: advance.displayText,
        spokenText: advance.spokenText,
        displayText: advance.displayText,
        quickReplies: buildWizardItemQuickReplies(nextState.current),
        clarification: true,
        mealWizard: true,
        mealWizardPhase: 'item',
      },
      { source: 'CommandTerminalController' },
    );
    return {
      ok: true,
      intent: 'MEAL_WIZARD',
      phase: 'item',
      mealWizardState: this.getMealWizardState(),
    };
  }

  /**
   * Mette in sospeso la bozza pasto senza duplicare UI (la card proposal è già pubblicata).
   */
  stagePendingMealDraft(payload, meta = {}) {
    const normalized = normalizeFoodPayload(payload, {}, { inferMealTypeFromContext: false });
    const items = expandFoodPayloadItems(payload).length > 0
      ? expandFoodPayloadItems(payload)
      : expandFoodPayloadItems(normalized);
    const draftPayload = {
      ...normalized,
      items,
      mealType: payload?.mealType || normalized.mealType,
      exactTime: payload?.exactTime || normalized.exactTime,
      timeString: payload?.timeString || normalized.timeString,
      ...(payload?.message ? { message: payload.message } : {}),
    };
    this.setPendingMealDraft(draftPayload);
    this.pendingAction = {
      commandType: 'ADD_FOOD',
      payload: { ...draftPayload },
      meta: { ...meta, requiresConfirmation: true },
    };
    this.pendingCommandType = 'ADD_FOOD';
    this.pendingCommandPayload = { ...draftPayload };
    this.conversationState = CONVERSATION_STATE.AWAITING_CONFIRMATION;
    return this.getPendingMealDraft();
  }

  publishSystemMessage(message) {
    const text = String(message || '').trim();
    if (!text) return;
    console.log('🟢 DEBUG - RISPOSTA FINALE PRONTA PER LA UI (publishSystemMessage):', text);
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
   * Multi-item → SequentialFoodWizard (niente bozza globale).
   */
  publishFoodDraftAfterGrams(currentState = {}, options = {}) {
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

    const userText = String(options.userText || '').trim();
    if (this.mustUseSequentialFoodWizard(payload, userText)) {
      console.log('🧙 DEBUG - publishFoodDraftAfterGrams → FORCE SEQUENTIAL WIZARD (multi-item)');
      return this.startSequentialFoodWizard(payload, currentState, userText);
    }

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
      userText,
      currentState,
    });
  }

  /**
   * Mute & Replace: scarta testo discorsivo Gemini su budget/cilindri (adviceMessage/uiMessage).
   * Conserva payload.message se breve e informale (nome utente + conferma pasto).
   */
  muteAddFoodLlmCopy(command = {}) {
    const next = command && typeof command === 'object' ? { ...command } : {};
    const strippedAdvice = String(next.adviceMessage || '').trim();
    const strippedUi = String(next.uiMessage || '').trim();
    if (strippedAdvice || strippedUi) {
      console.log('🔇 DEBUG - MUTE ADD_FOOD LLM COPY (scartato):', {
        adviceMessage: strippedAdvice.slice(0, 240),
        uiMessage: strippedUi.slice(0, 240),
      });
    }
    next.adviceMessage = '';
    next.uiMessage = '';
    if (next.payload && typeof next.payload === 'object') {
      next.payload = { ...next.payload };
      const items = expandFoodPayloadItems(next.payload);
      // Multi-item: il wizard genera la voce — scarta copy maggiordomo batch dal LLM.
      if (items.length > 1) {
        delete next.payload.message;
        return next;
      }
      const msg = String(next.payload.message || '').trim();
      // Tieni messaggi informali / maggiordomo (conferma solito + grammi). Scarta referti/budget.
      const looksFormalOrBudget = /budget|cilindr|rimanente|delta|metabol|sforamento|traiettoria/i.test(msg);
      const tooLongForChat = msg.length > 420;
      if (!msg || looksFormalOrBudget || tooLongForChat) {
        delete next.payload.message;
      } else {
        next.payload.message = msg;
      }
    }
    return next;
  }

  publishAddFoodContextAdvice(command) {
    // Solo se non c'è già un messaggio maggiordomo che cita le stime.
    const msg = String(command?.payload?.message || '').trim();
    if (/solito|come al solito|posso segnare|stimat/i.test(msg)) return;
    if (payloadHasEstimatedFoodWeights(command?.payload)) {
      this.publishSystemMessage(MEAL_DRAFT_ESTIMATED_WEIGHTS_ADVICE);
    }
  }

  /**
   * Feedback deterministico post-macro (proiezione in memoria). Nessun testo Gemini.
   */
  publishProjectedMealLogFeedback(payload, currentState = {}, options = {}) {
    const proposal = buildMealLogProposalFromPayload(payload, currentState, {
      userText: options.userText,
      conversationTexts: options.conversationTexts,
    });
    const mealTotals = proposal?.totals
      || (Array.isArray(proposal?.items) ? sumMealItemsMacros(proposal.items) : null);
    if (!mealTotals || !(Number(mealTotals.kcal) > 0 || Number(mealTotals.pro) > 0)) {
      return null;
    }

    const projection = projectNutritionAfterMeal(currentState, mealTotals);
    const mealReceipt = buildMealReceiptPayload({
      items: Array.isArray(proposal?.items) ? proposal.items : expandFoodPayloadItems(payload),
      mealType: proposal?.mealType || payload?.mealType || '',
      timeString: proposal?.exactTime || payload?.exactTime || payload?.timeString || '',
      mealTotals,
      projection,
    });
    const text = mealReceiptFallbackText(mealReceipt);
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'MEAL_RECEIPT',
        message: text,
        text,
        mealReceipt,
      },
      { source: 'CommandTerminalController' },
    );
    return mealReceipt;
  }

  async publishMealLogProposalCardDirect(payload, currentState = {}, userText = '', chatHistory = [], options = {}) {
    // Multi-item: SequentialFoodWizard obbligatorio — vietata bozza batch / butler globale.
    if (!options?.fromVoiceCorrection && !options?.skipWizard) {
      if (this.mustUseSequentialFoodWizard(payload, userText)) {
        const wizardResult = this.startSequentialFoodWizard(payload, currentState, userText);
        if (wizardResult?.ok) return wizardResult;
      }
    }

    const fromVoiceCorrection = options?.fromVoiceCorrection === true;
    // Dopo correzione vocale: non ri-espandere abitudini (rispetta «era rosetta»).
    const butler = fromVoiceCorrection
      ? {
          payload,
          butlerMeta: null,
          requestPhotoFor: null,
          butlerMessage: String(options.uiMessage || payload?.message || '').trim(),
        }
      : this.applyButlerMealEnrichment(payload, currentState);
    if (butler.requestPhotoFor) {
      return this.publishRequestFoodPhoto(
        {
          payload: {
            message: buildRequestFoodPhotoMessage(butler.requestPhotoFor),
            foodName: butler.requestPhotoFor,
            options: [...REQUEST_FOOD_PHOTO_QUICK_REPLIES],
          },
        },
        userText,
      );
    }

    const enrichedPayload = butler.payload || payload;
    const conversationTexts = buildConversationTextsFromChatHistory(chatHistory, userText);
    const proposal = buildMealLogProposalFromPayload(enrichedPayload, currentState, {
      userText,
      conversationTexts,
    });
    if (!proposal) {
      this.publishErrorMessage(USER_FACING_PARSE_ERROR_MESSAGE);
      return { ok: false, reason: 'meal_log_proposal_build_failed', userNotified: true };
    }

    const itemCount = Array.isArray(proposal.items) ? proposal.items.length : 0;
    const displayName = resolveUserDisplayName(currentState?.userProfile)
      || String(currentState?.userDisplayName || '').trim();
    const fromPayload = String(enrichedPayload?.message || options.uiMessage || '').trim();
    const butlerMessage = butler.butlerMessage
      || buildButlerConfirmationMessage(expandFoodPayloadItems(enrichedPayload), {
        habitProposals: butler.butlerMeta?.habitProposals,
      });
    const summaryText = fromPayload
      || butlerMessage
      || buildMealPreviewReadyMessage({
        displayName,
        userProfile: currentState?.userProfile,
        mealType: proposal.mealType || enrichedPayload?.mealType,
        itemCount,
      });
    const spokenText = String(options.spokenText || summaryText).trim();

    const useButlerReplies = Boolean(
      butler.butlerMeta?.anyHabitApplied
      || butler.butlerMeta?.anyGramsEstimated
      || /solito|come al solito|tipo diverso|cambiare le quantit|posso salvare/i.test(summaryText),
    );

    // McDrive: bozza in sospeso — correzioni vocali → UPDATE_MEAL_DRAFT, «Sì» → CONFIRM.
    this.stagePendingMealDraft(enrichedPayload, {
      uiMessage: summaryText,
      sourceText: String(userText || '').trim() || null,
    });

    this.publishAdviceMessage({
      text: summaryText,
      spokenText,
      mealProposals: [proposal],
      quickReplies: useButlerReplies
        ? [...BUTLER_MEAL_QUICK_REPLIES]
        : ['Sì, va bene', 'Oggi è diverso'],
    });

    return {
      ok: true,
      intent: 'ADD_FOOD',
      mealProposals: [proposal],
      userNotified: true,
      sourceText: String(userText || '').trim() || null,
      butler: Boolean(useButlerReplies),
      awaitingConfirmation: true,
      pendingMealDraft: this.getPendingMealDraft(),
    };
  }

  async publishMealLogProposalCard(payload, currentState = {}, userText = '', chatHistory = [], options = {}) {
    // Multi-item: salta slot-filling / bozza — wizard item-per-item subito.
    if (!options?.fromVoiceCorrection && !options?.skipWizard
      && this.mustUseSequentialFoodWizard(payload, userText)) {
      return this.startSequentialFoodWizard(payload, currentState, userText);
    }

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
      options,
    );
  }

  isMealRegistrationCandidate(userText) {
    return isConsumedMealLogDescription(userText) || looksLikeComplexMealLog(userText);
  }

  resolveEffectiveIntent(userText, options = {}) {
    const explicit = String(options.intent || '').trim().toUpperCase();
    if (explicit && explicit !== 'UNKNOWN') return explicit;

    if (this.pendingMealUpdate?.targetMealType) return 'UPDATE_LOGGED_MEAL';

    const wipItems = Array.isArray(options?.wipMealItems) ? options.wipMealItems : [];
    const wipMeta = {
      constraints: options?.wipConstraints || null,
      mealWipActive: Boolean(options?.mealWipActive)
        || wipItems.length > 0
        || hasMealWipConstraints(options?.wipConstraints),
    };

    // Meal WIP ha priorità su ADD_FOOD: domande/aggiunte non devono chiudere il pasto.
    if (
      isWipMealBuildIntent(userText, options?.chatHistory || [], wipItems, wipMeta)
      || isMealWipSessionStart(userText)
    ) {
      return 'WIP_MEAL_BUILD';
    }

    // Merge/update verso slot esistente PRIMA della registrazione (evita ghost pranzo_2).
    if (
      isMergeIntoExistingMealIntent(userText)
      || isUpdateLoggedMealIntent(userText, options?.chatHistory || [])
    ) {
      return 'UPDATE_LOGGED_MEAL';
    }

    // DATA ENTRY pasti PRIMA del consulto (evita "come snack, ho mangiato…" → CHAT_RESPONSE).
    // Follow-up a chiarimento (grammi/tipo) → sempre ADD_FOOD, anche senza "ho mangiato".
    if (
      isClarificationFollowUpReply(userText, options?.chatHistory || [])
      || isFoodRegistrationIntent(userText)
    ) {
      return 'ADD_FOOD';
    }

    // Domande sullo stato → mai forzare bozze pasto/workout (CASO 2).
    if (isConsultativeStateIntent(userText)) {
      if (isDayReviewIntent(userText)) return 'ASK_DAY_REVIEW';
      if (isMealAdviceIntent(userText, options?.chatHistory || [])) return 'ASK_MEAL_ADVICE';
      return 'CHAT_RESPONSE';
    }

    // Workout PRIMA di meal-advice / food registration.
    if (isWorkoutLogIntent(userText)) return 'ADD_WORKOUT';

    if (options?.hasImages && isCreateNewFoodIntent(userText)) return 'CREATE_NEW_FOOD';
    if (isDayReviewIntent(userText)) return 'ASK_DAY_REVIEW';
    if (isSubstituteMealDraftIntent(userText, options?.chatHistory || [])) return 'SUBSTITUTE_MEAL_DRAFT_ITEM';
    if (isFixMealDraftIntent(userText, options?.chatHistory || [])) return 'FIX_MEAL_DRAFT';
    if (isMealDraftEvaluationIntent(userText)) return 'EVALUATE_MEAL_DRAFT';
    if (isMealCompletionIntent(userText)) return 'ASK_MEAL_COMPLETION';
    if (isConsultantMealIntent(userText, options?.chatHistory || [])) return 'CONSULTANT_MEAL';
    if (isMealAdviceIntent(userText, options?.chatHistory || [])) return 'ASK_MEAL_ADVICE';

    const detected = this.composer.detectIntent(userText, {
      hasImages: options.hasImages,
      chatHistory: options?.chatHistory || [],
      pendingMealUpdate: this.getPendingMealUpdate(),
    });
    if (detected !== 'UNKNOWN') return detected;

    return detected;
  }

  tryParseAndPublishMealLog(userText, currentState = {}, chatHistory = [], options = {}) {
    const parsed = parseMealLogFromChatThread(userText, chatHistory)
      || parseConsumedMealFromNaturalText(userText);
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

    return this.publishMealLogProposalCard(payload, currentState, userText, chatHistory, options);
  }

  /**
   * Fallback tollerante: niente errore generico bloccante dopo fallimento LLM/parse.
   * Prova parser thread → altrimenti recovery soft con pulsanti di conferma.
   */
  async recoverAfterMealCommandFailure(userText, currentState = {}, chatHistory = [], options = {}) {
    const localResult = await this.tryParseAndPublishMealLog(userText, currentState, chatHistory, options);
    if (localResult) return localResult;

    const hint = String(options?.commandHint || '').trim().toUpperCase();
    const looksFood = Boolean(
      hint === 'ADD_FOOD'
      || isFoodRegistrationIntent(userText)
      || isClarificationFollowUpReply(userText, chatHistory)
      || looksLikeComplexMealLog(userText)
      || isConsumedMealLogDescription(userText)
      || parseMealLogFromChatThread(userText, chatHistory)?.items?.length
    );

    const displayName = resolveUserDisplayName(currentState?.userProfile)
      || String(currentState?.userDisplayName || '').trim();
    const namePrefix = displayName ? `${displayName}, ` : '';

    if (!looksFood) {
      this.publishClarification(
        {
          uiMessage: `${namePrefix}ho quasi capito — puoi riformulare in una frase più corta? Oppure scegli:`,
          payload: {
            message: `${namePrefix}ho quasi capito — puoi riformulare in una frase più corta? Oppure scegli:`,
            options: [
              'Riprovo con altre parole',
              'Annulla',
            ],
          },
        },
        userText,
      );
      return {
        ok: true,
        recovered: true,
        intent: 'ASK_CLARIFICATION',
        commandType: 'ASK_CLARIFICATION',
        softRecovery: true,
      };
    }

    const approx = buildApproximateMealLogForRecovery(userText, chatHistory);

    if (approx?.items?.length) {
      const summary = approx.items
        .map((item) => `${item.foodName} ~${Math.round(Number(item.grams) || 100)}g`)
        .join(', ');
      const confirmLabel = `Sì, registra: ${summary}`.slice(0, 90);
      this.publishClarification(
        {
          uiMessage: `${namePrefix}ho quasi capito — intendevi registrare questo come pasto? Conferma i grammi approssimativi oppure riscrivilo tipo «pane 80g, mortadella 50g».`,
          payload: {
            message: `${namePrefix}ho quasi capito — intendevi registrare questo come pasto? Conferma i grammi approssimativi oppure riscrivilo tipo «pane 80g, mortadella 50g».`,
            options: [
              confirmLabel,
              'No, te lo riscrivo meglio',
            ],
          },
        },
        userText,
      );
      this.pendingSoftMealRecovery = {
        confirmLabel,
        payload: normalizeFoodPayload(
          {
            items: approx.items,
            mealType: approx.mealType,
          },
          currentState,
          { inferMealTypeFromContext: true },
        ),
      };
      return {
        ok: true,
        recovered: true,
        intent: 'ASK_CLARIFICATION',
        commandType: 'ASK_CLARIFICATION',
        softRecovery: true,
      };
    }

    this.publishClarification(
      {
        uiMessage: `${namePrefix}ho quasi capito, ma mi manca un dettaglio. Scrivi tipo «pane 80g e mortadella 50g» oppure scegli:`,
        payload: {
          message: `${namePrefix}ho quasi capito, ma mi manca un dettaglio. Scrivi tipo «pane 80g e mortadella 50g» oppure scegli:`,
          options: [
            'Riprovo con alimento + grammi',
            'Annulla',
          ],
        },
      },
      userText,
    );
    return {
      ok: true,
      recovered: true,
      intent: 'ASK_CLARIFICATION',
      commandType: 'ASK_CLARIFICATION',
      softRecovery: true,
    };
  }

  shouldUseMealLogProposalCard(userText, payload) {
    if (!this.isMealRegistrationCandidate(userText)) {
      return false;
    }
    const normalized = normalizeFoodPayload(payload, {}, { inferMealTypeFromContext: false });
    return expandFoodPayloadItems(normalized).length > 0;
  }

  /**
   * Maggiordomo: espande generici → solito DB personale + grammi storici.
   * Se un alimento specifico resta irrisolvibile → REQUEST_FOOD_PHOTO.
   */
  applyButlerMealEnrichment(payload, currentState = {}) {
    const items = expandFoodPayloadItems(payload);
    if (items.length === 0) {
      return { payload, butlerMeta: null, requestPhotoFor: null };
    }

    const personalDb = currentState?.foodDatabase
      || currentState?.trackerFoodDatabase
      || currentState?.personalFoodDb
      || null;
    const userPortions = sanitizeUserPortionsDict(
      currentState?.userPortions
      || currentState?.nutrition?.userPortions
      || {},
    );
    const mealType = String(payload?.mealType || '').trim().toLowerCase() || null;
    const userHabitsForCurrentMeal = currentState?.userHabitsForCurrentMeal
      || buildUserHabitsForCurrentMeal(currentState, mealType);

    const butlerMeta = enrichFoodItemsAsButlerProposal(items, {
      personalDb,
      userPortions,
      userHabitsForCurrentMeal,
    });

    // Alimento specifico non associabile in cascata → foto etichetta.
    let requestPhotoFor = null;
    for (let i = 0; i < butlerMeta.items.length; i += 1) {
      const item = butlerMeta.items[i];
      const name = String(item.foodName || '').trim();
      if (!name || item.proposedFromHabit) continue;
      const match = findFoodDbMatchCascading({
        personalDb,
        kentuItDb: currentState?.kentuFoodDb || currentState?.kentuItDb || null,
        globalDb: currentState?.globalFoodDb || currentState?.kentuGlobalDb || null,
        nome: name,
        preferredDbKey: item.foodDbKey ?? null,
        searchKeywords: item.searchKeywords || null,
      });
      if (!match && butlerMeta.unresolvedNames.includes(String(item.spokenFoodName || name).trim())) {
        requestPhotoFor = name;
        break;
      }
      if (!match && !item.proposedFromHabit) {
        // Solo se il nome sembra specifico (2+ token o non generico mono-token senza hit).
        const tokens = name.split(/\s+/).filter(Boolean);
        if (tokens.length >= 2) {
          requestPhotoFor = name;
          break;
        }
      }
    }

    const butlerMessage = buildButlerConfirmationMessage(butlerMeta.items, {
      habitProposals: butlerMeta.habitProposals,
    });

    const nextPayload = {
      ...payload,
      items: butlerMeta.items,
      message: String(payload?.message || '').trim() || butlerMessage,
    };

    return { payload: nextPayload, butlerMeta, requestPhotoFor, butlerMessage };
  }

  publishRequestFoodPhoto(command = {}, userText = '') {
    const payload = command?.payload && typeof command.payload === 'object'
      ? command.payload
      : {};
    const foodName = String(payload?.foodName || '').trim();
    const text = String(
      command?.uiMessage
      || command?.adviceMessage
      || payload?.message
      || buildRequestFoodPhotoMessage(foodName),
    ).trim();
    const options = Array.isArray(payload?.options) && payload.options.length > 0
      ? payload.options.map((o) => String(o || '').trim()).filter(Boolean).slice(0, 4)
      : [...REQUEST_FOOD_PHOTO_QUICK_REPLIES];

    console.log('🟢 DEBUG - REQUEST_FOOD_PHOTO:', { text, foodName, userText: String(userText || '').trim() });
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'REQUEST_FOOD_PHOTO',
        text,
        message: text,
        foodName: foodName || null,
        quickReplies: options,
        requestFoodPhoto: true,
        clarification: true,
        mealProposals: null,
        suggestedAction: null,
        mealDraftProjection: null,
        wipSuggestions: null,
      },
      { source: 'CommandTerminalController' },
    );
    return {
      ok: true,
      intent: 'REQUEST_FOOD_PHOTO',
      commandType: 'REQUEST_FOOD_PHOTO',
      userText: String(userText || '').trim(),
      foodName: foodName || null,
    };
  }

  publishAdviceMessage({
    text,
    spokenText = null,
    displayText = null,
    suggestedAction = null,
    mealProposals = null,
    mealDraftProjection = null,
    wipSuggestions = null,
    pendingMealUpdate = null,
    quickReplies = null,
  }) {
    const adviceMessage = String(displayText || text || '').trim();
    if (!adviceMessage) return;
    const voice = String(spokenText || adviceMessage).trim();
    console.log('🟢 DEBUG - RISPOSTA FINALE PRONTA PER LA UI (publishAdviceMessage/ADVICE):', {
      text: adviceMessage,
      spokenText: voice,
      hasMealProposals: Array.isArray(mealProposals) && mealProposals.length > 0,
    });
    const replies = Array.isArray(quickReplies)
      ? quickReplies.map((o) => String(o || '').trim()).filter(Boolean).slice(0, 4)
      : [];
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'ADVICE',
        text: adviceMessage,
        message: adviceMessage,
        spokenText: voice,
        displayText: adviceMessage,
        suggestedAction: suggestedAction || null,
        mealProposals: Array.isArray(mealProposals) && mealProposals.length > 0
          ? mealProposals
          : null,
        wipSuggestions: Array.isArray(wipSuggestions) && wipSuggestions.length > 0
          ? wipSuggestions
          : null,
        mealDraftProjection: mealDraftProjection && typeof mealDraftProjection === 'object'
          ? mealDraftProjection
          : null,
        pendingMealUpdate: pendingMealUpdate && typeof pendingMealUpdate === 'object'
          ? pendingMealUpdate
          : null,
        adviceId: `advice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ...(replies.length > 0
          ? { quickReplies: replies }
          : {}),
      },
      { source: 'CommandTerminalController' },
    );
  }

  /**
   * CASO 2 Intent Routing: messaggio chat puro, senza MEAL_DRAFT / WORKOUT_DRAFT.
   * @param {object} command
   * @param {string} [userText]
   * @param {{ local?: boolean }} [options]
   */
  publishChatResponse(command = {}, userText = '', options = {}) {
    const payload = command?.payload && typeof command.payload === 'object'
      ? command.payload
      : {};
    const text = String(
      command?.uiMessage
      || command?.adviceMessage
      || payload?.message
      || '',
    ).trim();
    if (!text) {
      this.publishSystemMessage(
        'Ho letto il tuo stato attuale, ma non sono riuscito a formulare una risposta chiara. Riprova riformulando la domanda.',
      );
      return { ok: false, reason: 'empty_chat_response', commandType: 'CHAT_RESPONSE' };
    }
    const quickReplies = Array.isArray(payload?.options)
      ? payload.options.map((o) => String(o || '').trim()).filter(Boolean).slice(0, 4)
      : [];
    const isLocal = options?.local === true;
    console.log('🟢 DEBUG - RISPOSTA FINALE PRONTA PER LA UI (publishChatResponse/CHAT_RESPONSE):', {
      text,
      local: isLocal,
      source: isLocal ? 'local_receptionist' : 'gemini_structured_CHAT_RESPONSE',
      userText: String(userText || '').trim(),
      quickRepliesCount: quickReplies.length,
    });
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'CHAT_RESPONSE',
        text,
        message: text,
        local: isLocal,
        sourceTag: isLocal ? 'local_receptionist' : 'gemini',
        ...(quickReplies.length > 0 ? { quickReplies, clarification: true } : {}),
        // Nessuna proposta / bozza: solo bollo AI in chat.
        mealProposals: null,
        suggestedAction: null,
        mealDraftProjection: null,
        wipSuggestions: null,
      },
      { source: 'CommandTerminalController' },
    );
    return {
      ok: true,
      intent: 'CHAT_RESPONSE',
      commandType: 'CHAT_RESPONSE',
      local: isLocal,
      userText: String(userText || '').trim(),
    };
  }

  /**
   * Chiarimento interattivo (VUI): domanda breve + pulsanti options[].
   * @param {object} command
   * @param {string} [userText]
   */
  publishClarification(command = {}, userText = '') {
    const payload = command?.payload && typeof command.payload === 'object'
      ? command.payload
      : {};
    const text = String(
      command?.uiMessage
      || command?.adviceMessage
      || payload?.message
      || '',
    ).trim();
    const options = Array.isArray(payload?.options)
      ? payload.options.map((o) => String(o || '').trim()).filter(Boolean).slice(0, 4)
      : [];
    if (!text || options.length < 2) {
      this.publishSystemMessage(
        text || 'Dimmi un po\' di più così chiudo il cerchio senza indovinare.',
      );
      return { ok: false, reason: 'invalid_clarification', commandType: 'ASK_CLARIFICATION' };
    }
    console.log('🟢 DEBUG - ASK_CLARIFICATION:', {
      text,
      options,
      userText: String(userText || '').trim(),
    });
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'ASK_CLARIFICATION',
        text,
        message: text,
        quickReplies: options,
        clarification: true,
        mealProposals: null,
        suggestedAction: null,
        mealDraftProjection: null,
        wipSuggestions: null,
      },
      { source: 'CommandTerminalController' },
    );
    return {
      ok: true,
      intent: 'ASK_CLARIFICATION',
      commandType: 'ASK_CLARIFICATION',
      userText: String(userText || '').trim(),
      options,
    };
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
    items[index] = {
      ...items[index],
      grams: nextGrams,
      // Correzione utente: non più stima, ma resta learnable se era stimato.
      wasEstimated: items[index].isEstimated === true || items[index].wasEstimated === true,
      isEstimated: false,
    };
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

    // Defense-in-depth: multi-item ADD_FOOD non può diventare MEAL_DRAFT globale.
    if (
      normalizedType === 'ADD_FOOD'
      && !meta?.allowMultiItemDraft
      && this.mustUseSequentialFoodWizard(payload, meta.userText || '')
    ) {
      console.log('🧙 DEBUG - stagePendingAction → FORCE SEQUENTIAL WIZARD (blocked global draft)');
      return this.startSequentialFoodWizard(
        payload,
        meta.currentState || {},
        meta.userText || '',
      );
    }

    this.pendingAction = {
      commandType: normalizedType,
      payload: { ...payload },
      meta: { ...meta },
    };
    this.pendingCommandType = normalizedType;
    this.pendingCommandPayload = { ...payload };
    this.conversationState = CONVERSATION_STATE.AWAITING_CONFIRMATION;

    if (normalizedType === 'ADD_FOOD') {
      this.setPendingMealDraft(payload);
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
    let normalized = normalizeWorkoutPayload(payload, this.pendingWorkoutOriginUserText);

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
    payload = normalizeWorkoutPayload(payload, this.pendingWorkoutOriginUserText || '');
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
    const chatHistory = Array.isArray(options?.chatHistory) ? options.chatHistory : [];

    // Solo workout draft: mantieni flusso legacy se non c'è bozza pasto.
    const hasMealDraft = Boolean(
      this.pendingMealDraft
      || (this.pendingAction?.commandType === 'ADD_FOOD' && expandFoodPayloadItems(this.pendingAction.payload).length > 0),
    );

    if (hasMealDraft) {
      return this.processMealDraftVoiceLoop(text, currentState, { ...options, chatHistory });
    }

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
      this.publishSystemMessage('Dimmi pure cosa cambiare: grammi, tipo di alimento, aggiungi o togli. Ti ascolto.');
      return { ok: true, awaiting: true, conversationState: this.conversationState };
    }

    // Nuovo messaggio senza bozza pasto: annulla e riprocessa.
    this.resetConversationState();
    return this.processUserMessage(text, currentState, options);
  }

  /**
   * Loop McDrive: CONFIRM_MEAL_DRAFT | UPDATE_MEAL_DRAFT | CANCEL_MEAL_DRAFT.
   * Supporta chiarimenti mirati su correzioni incomplete (es. quantità senza grammi).
   */
  async processMealDraftVoiceLoop(userText, currentState = {}, options = {}) {
    const text = String(userText || '').trim();
    const draft = this.getPendingMealDraft()
      || (this.pendingAction?.commandType === 'ADD_FOOD' ? this.pendingAction.payload : null);

    if (!draft || expandFoodPayloadItems(draft).length === 0) {
      this.resetConversationState();
      return this.processUserMessage(text, currentState, options);
    }

    // Follow-up a domanda mirata (es. «80 grammi» dopo «Che quantità… per il pane?»).
    if (this.pendingMealDraftClarification) {
      const clarified = applyPartialClarificationReply(
        draft,
        this.pendingMealDraftClarification,
        text,
      );
      if (clarified.ok) {
        console.log('🎙️ DEBUG - MEAL DRAFT CLARIFICATION RESOLVED:', clarified.summaryBits);
        const spokenText = buildMcDriveClarificationDoneMessage(
          clarified.summaryBits,
          expandFoodPayloadItems(clarified.payload),
        );
        const published = await this.republishMealDraftAfterVoiceEdit(
          clarified.payload,
          currentState,
          { spokenText, userText: text, chatHistory: options?.chatHistory || [] },
        );
        return {
          ...published,
          intent: UPDATE_MEAL_DRAFT,
          commandType: UPDATE_MEAL_DRAFT,
          clarified: true,
        };
      }
      if (clarified.awaitingClarification) {
        const prompt = this.pendingMealDraftClarification.spokenPrompt
          || (this.pendingMealDraftClarification.field === 'grams'
            ? `Che quantità vorresti indicare per ${this.pendingMealDraftClarification.targetLabel || 'questo alimento'}?`
            : `Che tipo di ${this.pendingMealDraftClarification.targetLabel || 'alimento'} vuoi inserire?`);
        this.publishSystemMessage(prompt);
        return {
          ok: true,
          awaiting: true,
          intent: UPDATE_MEAL_DRAFT,
          reason: clarified.reason,
          conversationState: this.conversationState,
        };
      }
      // Risposta non applicabile al chiarimento → riprova come correzione completa sotto.
      this.pendingMealDraftClarification = null;
    }

    const voiceIntent = classifyMealDraftVoiceReply(text);
    console.log('🎙️ DEBUG - MEAL DRAFT VOICE LOOP:', { voiceIntent, text: text.slice(0, 120) });

    if (voiceIntent === CONFIRM_MEAL_DRAFT) {
      console.log('🟡 DEBUG - PATH SCELTO: CONFIRM_MEAL_DRAFT');
      this.pendingMealDraftClarification = null;
      if (this.pendingAction?.commandType === 'ADD_FOOD') {
        this.pendingAction.payload = { ...draft };
      } else {
        this.pendingAction = {
          commandType: 'ADD_FOOD',
          payload: { ...draft },
          meta: { requiresConfirmation: false },
        };
      }
      this.pendingCommandPayload = { ...draft };
      const result = this.executePendingAction();
      if (result?.ok) {
        this.publishSystemMessage('Perfetto, pasto salvato.');
      }
      return { ...result, intent: CONFIRM_MEAL_DRAFT, commandType: CONFIRM_MEAL_DRAFT };
    }

    if (voiceIntent === CANCEL_MEAL_DRAFT) {
      console.log('🟡 DEBUG - PATH SCELTO: CANCEL_MEAL_DRAFT');
      this.resetConversationState();
      this.publishSystemMessage('Ok, bozza annullata. Dimmi pure quando vuoi registrare di nuovo.');
      return { ok: true, cancelled: true, intent: CANCEL_MEAL_DRAFT };
    }

    // Correzione parziale → domanda mirata (mai prompt generico).
    const partialEarly = detectPartialMealDraftCorrection(text, draft);
    if (partialEarly) {
      console.log('🎙️ DEBUG - PARTIAL MEAL DRAFT CORRECTION:', partialEarly);
      this.askMealDraftClarification(partialEarly);
      return {
        ok: true,
        awaiting: true,
        intent: UPDATE_MEAL_DRAFT,
        reason: 'partial_correction',
        partial: partialEarly,
        conversationState: this.conversationState,
      };
    }

    if (voiceIntent === 'UNKNOWN') {
      // Nuova registrazione indipendente mentre la bozza è aperta → riparti pulito.
      if (
        (isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text))
        && !isUpdateMealDraftIntent(text)
      ) {
        this.resetConversationState();
        return this.processUserMessage(text, currentState, options);
      }
      this.conversationState = CONVERSATION_STATE.AWAITING_CONFIRMATION;
      this.publishSystemMessage(
        "Dimmi la correzione (es. «metti 80 grammi», «era rosetta») oppure «sì» per salvare, «annulla» per chiudere.",
      );
      return {
        ok: true,
        awaiting: true,
        intent: UPDATE_MEAL_DRAFT,
        reason: 'unknown_voice_reply',
        conversationState: this.conversationState,
      };
    }

    // «Oggi è diverso» senza dettagli → invita correzione vocale
    const strippedDiverso = text.replace(/^oggi\s+[eè]\s+diverso[.,!]?\s*/i, '').trim();
    if (/^oggi\s+[eè]\s+diverso\b/i.test(text) && !strippedDiverso) {
      this.conversationState = CONVERSATION_STATE.AWAITING_CONFIRMATION;
      this.publishAdviceMessage({
        text: 'Nessun problema. Dimmi cosa cambia: tipo di alimento, grammi, oppure cosa togliere o aggiungere.',
        mealProposals: null,
        quickReplies: ['Sì, va bene', 'Annulla'],
      });
      return {
        ok: true,
        awaiting: true,
        intent: UPDATE_MEAL_DRAFT,
        conversationState: this.conversationState,
      };
    }

    console.log('🟡 DEBUG - PATH SCELTO: UPDATE_MEAL_DRAFT');
    const correctionText = strippedDiverso && /^oggi\s+[eè]\s+diverso\b/i.test(text)
      ? strippedDiverso
      : text;
    const applied = applyVoiceCorrectionToMealDraft(draft, correctionText);
    if (!applied.ok) {
      if (applied.partial || applied.reason === 'partial_correction') {
        const partial = applied.partial || detectPartialMealDraftCorrection(correctionText, draft);
        if (partial) {
          this.askMealDraftClarification(partial);
          return {
            ok: true,
            awaiting: true,
            intent: UPDATE_MEAL_DRAFT,
            reason: 'partial_correction',
            partial,
            conversationState: this.conversationState,
          };
        }
      }
      this.conversationState = CONVERSATION_STATE.AWAITING_CONFIRMATION;
      this.publishSystemMessage(
        "Non ho colto la correzione. Prova tipo «metti 80 grammi», «togli il pomodoro», «era rosetta», oppure «sì» per salvare.",
      );
      return {
        ok: true,
        awaiting: true,
        intent: UPDATE_MEAL_DRAFT,
        reason: applied.reason,
        conversationState: this.conversationState,
      };
    }

    const voiceMessage = buildMcDriveUpdatedConfirmationMessage(
      expandFoodPayloadItems(applied.payload),
    );
    const published = await this.republishMealDraftAfterVoiceEdit(
      applied.payload,
      currentState,
      {
        spokenText: voiceMessage,
        userText: correctionText,
        chatHistory: options?.chatHistory || [],
      },
    );
    return {
      ...published,
      intent: UPDATE_MEAL_DRAFT,
      commandType: UPDATE_MEAL_DRAFT,
    };
  }

  beginFoodSlotFilling(partialPayload, currentState = {}, options = {}) {
    const userText = String(options.userText || '').trim();
    // Multi-item: mai bozza globale / butler batch — solo SequentialFoodWizard.
    if (this.mustUseSequentialFoodWizard(partialPayload, userText)) {
      console.log('🧙 DEBUG - beginFoodSlotFilling → FORCE SEQUENTIAL WIZARD (multi-item)');
      return this.startSequentialFoodWizard(partialPayload, currentState, userText);
    }

    const normalized = normalizeFoodPayload(partialPayload, currentState, {
      inferMealTypeFromContext: false,
      ...options,
    });

    // Maggiordomo: riempi grammi/varianti dallo storico invece di chiedere «quanti grammi?».
    const butler = this.applyButlerMealEnrichment(normalized, currentState);
    if (butler.requestPhotoFor) {
      return this.publishRequestFoodPhoto(
        {
          payload: {
            message: buildRequestFoodPhotoMessage(butler.requestPhotoFor),
            foodName: butler.requestPhotoFor,
            options: [...REQUEST_FOOD_PHOTO_QUICK_REPLIES],
          },
        },
        userText,
      );
    }

    this.pendingCommandType = 'ADD_FOOD';
    this.pendingCommandPayload = { ...(butler.payload || normalized) };

    const missingGrams = getFoodItemsMissingGrams(this.pendingCommandPayload);
    if (missingGrams.length === 0) {
      return this.publishFoodDraftAfterGrams(currentState, { userText });
    }

    // Ultima spiaggia: ancora senza grammi → proposta con default e conferma, non domanda aperta.
    const forced = enrichFoodItemsAsButlerProposal(
      expandFoodPayloadItems(this.pendingCommandPayload),
      {
        personalDb: currentState?.foodDatabase || null,
        userPortions: sanitizeUserPortionsDict(currentState?.userPortions || {}),
        userHabitsForCurrentMeal: buildUserHabitsForCurrentMeal(
          currentState,
          this.pendingCommandPayload?.mealType,
        ),
      },
    );
    this.pendingCommandPayload = {
      ...this.pendingCommandPayload,
      items: forced.items,
      message: buildButlerConfirmationMessage(forced.items, {
        habitProposals: forced.habitProposals,
      }),
    };
    return this.publishFoodDraftAfterGrams(currentState, { userText });
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
    // Una sola card di conferma: MealProposalCards invece di MEAL_DRAFT + quick replies.
    return this.publishMealLogProposalCardDirect(payload, currentState, options.userText || '', [], {
      upsertAction: 'append',
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

  /**
   * Pubblica preview card + messaggio di attesa modifica per UPDATE_LOGGED_MEAL.
   * @param {string} targetMealType
   * @param {object} existingMealNode
   * @param {string | null} [timeQualifier]
   * @returns {object}
   */
  publishUpdateMealWaitingWithPreview(targetMealType, existingMealNode, timeQualifier = null) {
    this.setPendingMealUpdate({
      state: MEAL_UPDATE_WAITING_STATE,
      targetMealType,
      targetNodeId: existingMealNode.targetNodeId,
      existingMealNode,
      timeQualifier,
    });
    const previewProposal = buildUpdateLoggedMealPreviewProposal(existingMealNode);
    this.publishAdviceMessage({
      text: buildUpdateWaitingPromptMessage(targetMealType),
      mealProposals: previewProposal ? [previewProposal] : null,
      pendingMealUpdate: this.getPendingMealUpdate(),
    });
    return {
      ok: true,
      intent: 'UPDATE_LOGGED_MEAL',
      waitingForDetails: true,
      targetMealType,
      mealProposals: previewProposal ? [previewProposal] : [],
    };
  }

  async processMealAdvice(userText, currentState = {}, options = {}) {
    const rawQuery = String(userText || '').trim();
    const chatHistory = Array.isArray(options?.chatHistory) ? options.chatHistory : [];
    const isCompletion = isMealCompletionIntent(rawQuery);
    const isDraftEval = isMealDraftEvaluationIntent(rawQuery);
    const isFixDraft = isFixMealDraftIntent(rawQuery, chatHistory);
    const isSubstituteDraft = isSubstituteMealDraftIntent(rawQuery, chatHistory);
    const pendingUpdate = this.getPendingMealUpdate()
      || findPendingUpdateLoggedMealContext(chatHistory);
    const isUpdateFollowUp = Boolean(pendingUpdate?.targetMealType);
    const isUpdateLogged = isUpdateFollowUp
      || isUpdateLoggedMealIntent(rawQuery, chatHistory)
      || String(options?.forcedIntent || '').toUpperCase() === 'UPDATE_LOGGED_MEAL';
    const partialMeal = isCompletion ? parseConsumedMealFromNaturalText(rawQuery) : null;
    const mealDraftProjection = isDraftEval
      ? parseMealDraftProjectionFromText(rawQuery)
      : isFixDraft || isSubstituteDraft
        ? findLatestMealDraftProjectionFromChatHistory(chatHistory)
        : null;
    const isDayReview = isDayReviewIntent(rawQuery);
    const isGeneric = isGenericMealSuggestionQuery(rawQuery);
    const isConsultantMeal = isConsultantMealIntent(rawQuery, chatHistory)
      || String(options?.forcedIntent || '').toUpperCase() === 'CONSULTANT_MEAL';
    const consultantMealRequest = isConsultantMeal
      ? parseConsultantMealIntent(rawQuery)
      : null;
    const wipMealSnapshot = Array.isArray(options?.wipMealItems) ? options.wipMealItems : [];
    const wipConstraintsIncoming = options?.wipConstraints || null;
    const parsedConstraints = parseMealConstraintsFromText(rawQuery);
    const wipConstraints = hasMealWipConstraints(parsedConstraints)
      ? {
          ...(wipConstraintsIncoming || {}),
          ...Object.fromEntries(
            Object.entries(parsedConstraints).filter(([, v]) => v != null),
          ),
        }
      : (wipConstraintsIncoming || null);
    const mealWipActive = Boolean(options?.mealWipActive)
      || wipMealSnapshot.length > 0
      || hasMealWipConstraints(wipConstraints)
      || isMealWipSessionStart(rawQuery);
    const wipSubIntent = classifyMealWipSubIntent(rawQuery, {
      hasActiveWip: mealWipActive,
      chatHistory,
    });
    const isWipMealBuild = isWipMealBuildIntent(
      rawQuery,
      chatHistory,
      wipMealSnapshot,
      { constraints: wipConstraints, mealWipActive },
    )
      || String(options?.forcedIntent || '').toUpperCase() === 'WIP_MEAL_BUILD'
      || mealWipActive;
    const wipMealDeclaration = isWipMealBuild && wipSubIntent !== MEAL_WIP_SUB_INTENTS.QUERY
      ? parseWipMealDeclaration(rawQuery)
      : null;
    const mergedWipMealItems = (() => {
      const base = deduplicateWipItems(wipMealSnapshot);
      if (!wipMealDeclaration?.items?.length) return base;
      // Within-batch: somma grammi; verso carrello: replace qty (no doppio conteggio se LLM rilista)
      return mergeWipMealItemsByName(base, wipMealDeclaration.items, { mode: 'replace' });
    })();

    if ((isFixDraft || isSubstituteDraft) && !mealDraftProjection?.items?.length) {
      this.publishSystemMessage(
        'Non trovo il pasto che stavamo valutando. Descrivi di nuovo cosa stai mangiando e cosa vorresti aggiungere.',
      );
      return { ok: false, reason: 'missing_meal_draft_projection' };
    }

    const targetMealTypeForUpdate = isUpdateLogged
      ? (parseTargetMealTypeFromUpdateText(rawQuery)?.mealType || pendingUpdate?.targetMealType)
      : null;
    const updateContext = isUpdateLogged
      ? resolveUpdateMealContext(
        Array.isArray(currentState?.activeLog) ? currentState.activeLog : [],
        rawQuery,
        currentState?.fullHistory || {},
        currentState?.activeDate || null,
        pendingUpdate,
      )
      : null;
    const existingMealNode = updateContext?.existingMealNode || null;

    if (isUpdateLogged && updateContext?.disambiguationUnresolved) {
      this.publishSystemMessage(
        'Non ho capito quale pasto intendi. Indica l\'orario (es. «10:30» o «19:00») o specifica mattina/pomeriggio/sera.',
      );
      return { ok: false, reason: 'ambiguous_meal_slot_unresolved' };
    }

    if (
      isUpdateLogged
      && updateContext?.resolvedFromDisambiguation
      && existingMealNode?.targetNodeId
      && hasExplicitUpdateAction(rawQuery)
    ) {
      this.setPendingMealUpdate({
        state: MEAL_UPDATE_WAITING_STATE,
        targetMealType: updateContext.targetMealType,
        targetNodeId: existingMealNode.targetNodeId,
        existingMealNode,
        timeQualifier: updateContext.timeQualifier || null,
      });
    }

    if (isUpdateLogged && updateContext?.resolution?.resolutionMethod === 'ambiguous') {
      const ambiguousMatches = updateContext.resolution.matches || [];
      this.setPendingMealUpdate({
        state: MEAL_UPDATE_DISAMBIGUATION_STATE,
        targetMealType: targetMealTypeForUpdate,
        candidateNodes: ambiguousMatches,
        timeQualifier: updateContext.timeQualifier || null,
      });
      this.publishAdviceMessage({
        text: buildUpdateMealDisambiguationMessage(targetMealTypeForUpdate, ambiguousMatches),
        pendingMealUpdate: this.getPendingMealUpdate(),
      });
      return {
        ok: true,
        intent: 'UPDATE_LOGGED_MEAL',
        waitingForMealSlot: true,
        targetMealType: targetMealTypeForUpdate,
      };
    }

    if (isUpdateLogged && updateContext?.resolution?.resolutionMethod === 'no_match') {
      const allMatches = updateContext.resolution.allMatches || [];
      this.setPendingMealUpdate({
        state: MEAL_UPDATE_DISAMBIGUATION_STATE,
        targetMealType: targetMealTypeForUpdate,
        candidateNodes: allMatches,
        timeQualifier: updateContext.timeQualifier || null,
      });
      this.publishAdviceMessage({
        text: buildUpdateMealNoMatchMessage(
          targetMealTypeForUpdate,
          updateContext.timeQualifier,
          allMatches,
        ),
        pendingMealUpdate: this.getPendingMealUpdate(),
      });
      return {
        ok: true,
        intent: 'UPDATE_LOGGED_MEAL',
        waitingForMealSlot: true,
        targetMealType: targetMealTypeForUpdate,
      };
    }

    if (isUpdateLogged && !existingMealNode?.targetNodeId) {
      const mealLabel = targetMealTypeForUpdate || 'pasto';
      this.publishSystemMessage(
        `Non trovo un ${mealLabel} registrato oggi nel diario. Registra prima il pasto o specifica quale vuoi modificare.`,
      );
      return { ok: false, reason: 'missing_existing_meal_node' };
    }

    // Niente gate a due turni: se manca l'azione esplicita, pubblica subito
    // una card editabile (unica conferma) invece di WAITING_FOR_UPDATE_DETAILS.
    if (isUpdateLogged && !hasExplicitUpdateAction(rawQuery)) {
      const previewProposal = buildUpdateLoggedMealPreviewProposal(existingMealNode);
      if (previewProposal) {
        previewProposal.upsertAction = isMergeIntoExistingMealIntent(rawQuery) ? 'merge' : 'replace';
        previewProposal.action = previewProposal.upsertAction;
        previewProposal.source = previewProposal.upsertAction === 'merge'
          ? 'logged_meal_merge'
          : 'logged_meal_update';
      }
      this.publishAdviceMessage({
        text: `Ho recuperato il tuo ${targetMealTypeForUpdate || 'pasto'}. Modifica gli alimenti sulla card e conferma — nessuna domanda intermedia.`,
        mealProposals: previewProposal ? [previewProposal] : null,
      });
      this.clearPendingMealUpdate();
      return {
        ok: true,
        intent: 'UPDATE_LOGGED_MEAL',
        mealProposals: previewProposal ? [previewProposal] : [],
        singleConfirm: true,
      };
    }

    const queryForAdvice = isUpdateLogged && pendingUpdate?.targetMealType
      ? buildUpdateLoggedMealCombinedQuery(pendingUpdate.targetMealType, rawQuery)
      : rawQuery;

    const targetFood = isDayReview
      ? rawQuery
      : isGeneric
      ? rawQuery
      : isUpdateLogged
        ? queryForAdvice
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
          : isUpdateLogged
            ? 'UPDATE_LOGGED_MEAL'
          : isConsultantMeal
            ? 'CONSULTANT_MEAL'
          : isWipMealBuild
            ? 'WIP_MEAL_BUILD'
          : isSubstituteDraft
            ? 'SUBSTITUTE_MEAL_DRAFT_ITEM'
          : isFixDraft
            ? 'FIX_MEAL_DRAFT'
            : isDraftEval
              ? 'EVALUATE_MEAL_DRAFT'
              : isCompletion
                ? 'ASK_MEAL_COMPLETION'
                : 'ASK_MEAL_ADVICE',
        partialMeal,
        mealDraftProjection,
        existingMealNode,
        consultantMealRequest,
        wipMealItems: mergedWipMealItems,
        wipMealDeclaration,
        wipMealMealType: wipMealDeclaration?.mealType || options?.wipMealMealType || null,
        wipConstraints,
        wipSubIntent: isWipMealBuild ? wipSubIntent : null,
        mealWip: isWipMealBuild
          ? serializeMealWipForPrompt({
              constraints: wipConstraints,
              items: mergedWipMealItems,
              mealType: wipMealDeclaration?.mealType || options?.wipMealMealType || null,
              subIntent: wipSubIntent,
            })
          : null,
        removedFoodQuery: isSubstituteDraft
          ? parseRemovedFoodQueryFromSubstituteText(rawQuery)
          : null,
        forcedUpsertAction: isMergeIntoExistingMealIntent(rawQuery) ? 'merge' : null,
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

    let globalStateText = '';
    try {
      globalStateText = buildKentuGlobalStateFromAppState(currentState).text;
    } catch (error) {
      console.warn('[CommandTerminalController] Kentu Global State failed', error);
    }

    const extraSystem = String(options?.systemInstructionExtra || '').trim();
    const displayName = resolveUserDisplayName(currentState?.userProfile)
      || String(currentState?.userDisplayName || '').trim();
    const wipSystemExtra = isWipMealBuild
      ? [MEAL_WIP_SYSTEM_PROMPT, buildChatPersonaSystemBlock({ displayName })].join('\n\n')
      : '';
    const baseConsultantSystem = appendKentuGlobalStateToSystemInstruction(
      generateConsultantSystemInstruction({ displayName }),
      globalStateText,
    );
    const consultantSystemInstruction = [baseConsultantSystem, wipSystemExtra, extraSystem]
      .filter(Boolean)
      .join('\n\n');

    try {
      const { adviceMessage, suggestedAction: rawAction, mealProposals: rawProposals, suggestions: rawSuggestions, model } =
        await this.llmClient.generateConsultantResponse({
          prompt: consultantPrompt,
          temperature: 0.35,
          chatHistory,
          systemInstruction: consultantSystemInstruction,
          ...(options?.signal ? { signal: options.signal } : {}),
        });
      const suggestedAction = sanitizeSuggestedAction(rawAction, adviceContext);
      let mealProposals = sanitizeMealProposals(rawProposals, adviceContext);
      let wipSuggestions = [];
      if (isSubstituteDraft) {
        mealProposals = ensureMealProposalsForSubstituteDraft(mealProposals, adviceContext);
      } else if (isFixDraft) {
        mealProposals = ensureMealProposalsForFixDraft(mealProposals, adviceContext);
      } else if (isUpdateLogged) {
        mealProposals = ensureMealProposalsForUpdateLoggedMeal(mealProposals, adviceContext);
      } else if (isConsultantMeal) {
        mealProposals = ensureMealProposalsForConsultantMeal(mealProposals, adviceContext);
      } else if (isWipMealBuild) {
        // QUERY: niente chips / niente chiusura pasto — solo risposta discorsiva
        // CONFIRM: riepilogo in mealProposals per salvataggio
        // UPDATE: chips scalate sul residuo calorico WIP
        if (wipSubIntent === MEAL_WIP_SUB_INTENTS.CONFIRM) {
          mealProposals = sanitizeMealProposals(rawProposals, adviceContext);
          wipSuggestions = [];
        } else if (wipSubIntent === MEAL_WIP_SUB_INTENTS.QUERY) {
          mealProposals = [];
          wipSuggestions = [];
        } else {
          mealProposals = [];
          const residual = residualCaloriesFromWip(
            wipConstraints,
            adviceContext?.wipMealProjection?.totals || { kcal: 0 },
          );
          wipSuggestions = sanitizeWipSuggestions(rawSuggestions, adviceContext)
            .map((chip) => scaleSuggestionToResidualCalories(chip, residual));
        }
      } else if (isGeneric || adviceContext.isGenericMealSuggestion) {
        mealProposals = ensureMealProposalsForAdvice(mealProposals, adviceContext);
      }
      if (isDayReview || isDraftEval) {
        mealProposals = [];
      }

      const finalAdviceMessage = isSubstituteDraft
        ? buildSubstituteMealDraftAdviceMessage(adviceContext)
        : isFixDraft
        ? buildFixMealDraftAdviceMessage(adviceContext)
        : isUpdateLogged
          ? buildUpdateLoggedMealAdviceMessage(adviceContext)
        : isConsultantMeal
          ? (String(adviceMessage || '').trim() || buildConsultantMealAdviceMessage(adviceContext))
        : isWipMealBuild && wipSubIntent === MEAL_WIP_SUB_INTENTS.CONFIRM
          ? (() => {
              const cartItems = Array.isArray(adviceContext?.wipMealProjection?.items)
                && adviceContext.wipMealProjection.items.length > 0
                ? adviceContext.wipMealProjection.items
                : mergedWipMealItems;
              return buildWipConfirmAdviceMessage(deduplicateWipItems(cartItems), {
                displayName,
                mealType: adviceContext?.wipMealProjection?.mealType
                  || adviceContext?.currentMealType
                  || options?.wipMealMealType,
              });
            })()
        : isWipMealBuild
          ? (String(adviceMessage || '').trim() || buildWipMealAdviceMessage(adviceContext))
        : adviceMessage;

      this.publishAdviceMessage({
        text: finalAdviceMessage,
        suggestedAction: isDraftEval || isFixDraft || isSubstituteDraft || isUpdateLogged || isConsultantMeal || isWipMealBuild
          ? null
          : suggestedAction,
        mealProposals: mealProposals.length > 0 ? mealProposals : null,
        wipSuggestions: wipSuggestions.length > 0 ? wipSuggestions : null,
        mealDraftProjection: isDraftEval
          ? adviceContext?.mealDraftProjection || null
          : isSubstituteDraft
            ? adviceContext?.keptDraftProjection || adviceContext?.mealDraftProjection || null
            : null,
      });
      if (isUpdateLogged && mealProposals.length > 0) {
        this.clearPendingMealUpdate();
      }
      return {
        ok: true,
        intent: isSubstituteDraft
          ? 'SUBSTITUTE_MEAL_DRAFT_ITEM'
          : isFixDraft
          ? 'FIX_MEAL_DRAFT'
          : isUpdateLogged
            ? 'UPDATE_LOGGED_MEAL'
          : isConsultantMeal
            ? 'CONSULTANT_MEAL'
          : isWipMealBuild
            ? 'WIP_MEAL_BUILD'
          : isDraftEval
            ? 'EVALUATE_MEAL_DRAFT'
            : isDayReview
              ? 'ASK_DAY_REVIEW'
              : isCompletion
                ? 'ASK_MEAL_COMPLETION'
                : 'ASK_MEAL_ADVICE',
        model,
        adviceContext,
        suggestedAction: isDraftEval || isFixDraft || isSubstituteDraft || isUpdateLogged || isConsultantMeal || isWipMealBuild
          ? null
          : suggestedAction,
        mealProposals,
        wipSuggestions,
        wipSeed: isWipMealBuild && wipSubIntent !== MEAL_WIP_SUB_INTENTS.QUERY
          ? (() => {
              const projectionItems = Array.isArray(adviceContext?.wipMealProjection?.items)
                ? adviceContext.wipMealProjection.items
                : [];
              const snapshotByName = new Map(
                wipMealSnapshot.map((entry) => {
                  const name = normalizeWipFoodNameKey(entry?.foodName || entry?.name);
                  const grams = Math.round(Number(entry?.grams ?? entry?.weight) || 0);
                  return [name, grams];
                }).filter(([name]) => Boolean(name)),
              );
              const snapshotKcal = wipMealSnapshot.reduce(
                (sum, entry) => sum + (Number(entry?.kcal ?? entry?.cal) || 0),
                0,
              );
              let remainingBudget = residualCaloriesFromWip(wipConstraints, { kcal: snapshotKcal });

              const items = [];
              for (const item of projectionItems) {
                const nameKey = normalizeWipFoodNameKey(item.foodName);
                if (!nameKey || !(item.grams > 0)) continue;
                const existingGrams = snapshotByName.get(nameKey);
                // Stesso alimento già in carrello con stessi grammi → skip; altrimenti upsert (update qty)
                if (existingGrams != null && existingGrams === Math.round(Number(item.grams) || 0)) {
                  continue;
                }
                let grams = Math.round(Number(item.grams) || 0);
                let kcal = Math.round(Number(item.kcal) || 0);
                if (remainingBudget != null && kcal > remainingBudget && grams > 0 && kcal > 0) {
                  const scaled = scaleSuggestionToResidualCalories(
                    { name: item.foodName, weight: grams, calories: kcal },
                    remainingBudget,
                  );
                  grams = Math.round(Number(scaled.weight) || grams);
                  kcal = Math.round(Number(scaled.calories) || 0);
                }
                if (remainingBudget != null) remainingBudget = Math.max(0, remainingBudget - kcal);
                items.push({
                  foodName: item.foodName,
                  grams,
                  kcal,
                  prot: item.pro,
                  carbo: item.carbo,
                  fat: item.fat,
                });
              }
              const seedConstraints = hasMealWipConstraints(wipConstraints) ? wipConstraints : null;
              const dedupedSeedItems = deduplicateWipItems(items);
              if (dedupedSeedItems.length === 0 && !seedConstraints) return null;
              return {
                items: dedupedSeedItems,
                mealType: wipMealDeclaration?.mealType || options?.wipMealMealType || null,
                exactTime: wipMealDeclaration?.exactTime || null,
                constraints: seedConstraints,
                subIntent: wipSubIntent,
              };
            })()
          : (isWipMealBuild && hasMealWipConstraints(wipConstraints)
            ? {
                items: [],
                mealType: options?.wipMealMealType || null,
                constraints: wipConstraints,
                subIntent: wipSubIntent,
              }
            : null),
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
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
      if (isAbortError(error)) {
        return { ok: false, aborted: true, reason: 'aborted', userNotified: false };
      }
      console.error('[CommandTerminalController] Unhandled processUserMessage error', error);
      const chatHistory = Array.isArray(options?.chatHistory) ? options.chatHistory : [];
      const userText = String(text || '').trim();
      try {
        const recovered = await this.recoverAfterMealCommandFailure(
          userText,
          currentState,
          chatHistory,
          options,
        );
        if (recovered) return recovered;
      } catch (recoveryError) {
        console.warn('[CommandTerminalController] soft recovery failed', recoveryError);
      }
      this.publishErrorMessage(USER_FACING_ERROR_MESSAGE);
      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        {
          reason: error?.message || 'unhandled_error',
          userText,
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

    console.log('🟣 DEBUG - processUserMessageCore START:', {
      userText,
      conversationState: this.conversationState,
      imageCount: images.length,
    });

    // Conferma recovery soft (grammi approssimativi proposti dopo fallimento LLM).
    if (this.pendingSoftMealRecovery?.payload) {
      const confirmLabel = String(this.pendingSoftMealRecovery.confirmLabel || '').trim();
      const normalizedReply = userText.toLowerCase();
      if (
        (confirmLabel && userText === confirmLabel)
        || /^s[iì]\b/i.test(userText)
        || (confirmLabel && normalizedReply.includes('registra'))
      ) {
        const payload = this.pendingSoftMealRecovery.payload;
        this.pendingSoftMealRecovery = null;
        return this.publishMealLogProposalCard(payload, currentState, userText, chatHistory, options);
      }
      if (/^(?:no|annulla|cancel)\b/i.test(userText) || /riscrivo|meglio/i.test(userText)) {
        this.pendingSoftMealRecovery = null;
        this.publishSystemMessage('Ok, riscrivimi il pasto quando vuoi — tipo «pane 80g e mortadella 50g».');
        return { ok: true, cancelled: true, softRecovery: true };
      }
    }
    if (
      this.conversationState === CONVERSATION_STATE.AWAITING_MEAL_WIZARD_ITEM
      || this.conversationState === CONVERSATION_STATE.AWAITING_MEAL_WIZARD_CONFIRM
      || this.mealWizardState
    ) {
      return this.processMealWizardResponse(userText, currentState, options);
    }

    if (this.conversationState === CONVERSATION_STATE.AWAITING_CONFIRMATION) {
      return await this.processConfirmationResponse(userText, currentState, options);
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

    // Local Receptionist: priorità massima assoluta su query di sola lettura (zero Gemini).
    if (userText && images.length === 0) {
      try {
        const globalPack = buildKentuGlobalStateFromAppState(currentState).object;
        const localAnswer = handleLocalQuery(userText, globalPack);
        if (localAnswer) {
          console.log('[LocalReceptionist] intercepted → skip Gemini');
          console.log('🟢 DEBUG - RISPOSTA FINALE PRONTA PER LA UI (LocalReceptionist):', localAnswer);
          return this.publishChatResponse(
            { uiMessage: localAnswer, payload: { message: localAnswer }, requiresConfirmation: false },
            userText,
            { local: true },
          );
        }
      } catch (error) {
        console.warn('[LocalReceptionist] failed, falling through to LLM', error);
      }
    }

    if (this.pendingMealUpdate?.targetMealType) {
      if (/^(?:annulla|cancel|stop)\b/i.test(userText)) {
        this.clearPendingMealUpdate();
        this.publishSystemMessage('Modifica pasto annullata.');
        return { ok: true, cancelled: true, intent: 'UPDATE_LOGGED_MEAL' };
      }
      return this.processMealAdvice(userText, currentState, {
        ...options,
        forcedIntent: 'UPDATE_LOGGED_MEAL',
      });
    }

    const inferredIntent = this.resolveEffectiveIntent(userText, {
      intent: options.intent,
      hasImages: images.length > 0,
      chatHistory,
    });

    if (
      inferredIntent === 'ASK_DAY_REVIEW'
      || inferredIntent === 'EVALUATE_MEAL_DRAFT'
      || inferredIntent === 'FIX_MEAL_DRAFT'
      || inferredIntent === 'SUBSTITUTE_MEAL_DRAFT_ITEM'
      || inferredIntent === 'ASK_MEAL_ADVICE'
      || inferredIntent === 'CONSULTANT_MEAL'
      || inferredIntent === 'WIP_MEAL_BUILD'
      || inferredIntent === 'ASK_MEAL_COMPLETION'
      || inferredIntent === 'UPDATE_LOGGED_MEAL'
      || (
        inferredIntent !== 'ADD_WORKOUT'
        && isMealAdviceIntent(userText, chatHistory)
        && !isConsumedMealLogDescription(userText)
        && !looksLikeComplexMealLog(userText)
      )
    ) {
      return this.processMealAdvice(userText, currentState, options);
    }

    const commandHint =
      inferredIntent === 'UNKNOWN'
      && isFoodRegistrationIntent(userText)
        ? 'ADD_FOOD'
        : inferredIntent;

    if (
      commandHint === 'ADD_FOOD'
      && (
        this.getPendingMealUpdate()?.targetMealType
        || isUpdateLoggedMealIntent(userText, chatHistory)
      )
    ) {
      return this.processMealAdvice(userText, currentState, {
        ...options,
        forcedIntent: 'UPDATE_LOGGED_MEAL',
      });
    }

    const contextBundle = this.composer.buildPromptContext(
      commandHint,
      currentState,
      userText,
      chatHistory,
      { pendingMealUpdate: this.getPendingMealUpdate() },
    );

    let commandResponse;
    try {
      commandResponse = await this.llmClient.generateStructuredCommand({
        userText,
        contextBundle,
        commandHint,
        images,
        chatHistory,
        ...(options?.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      const detail =
        error?.details
        || error?.message
        || error?.code
        || 'unknown error';
      const reason = `LLM failure: ${detail}`;
      console.error('[CommandTerminalController] LLM error', error);

      if (commandHint === 'ADD_WORKOUT' || isWorkoutLogIntent(userText)) {
        if (!isConsultativeStateIntent(userText)) {
          const localPayload = buildLocalWorkoutPayloadFromText(userText);
          return this.beginWorkoutRegistration(localPayload, currentState, userText);
        }
      }

      const soft = await this.recoverAfterMealCommandFailure(
        userText,
        currentState,
        chatHistory,
        {
          ...(options?.signal ? { signal: options.signal } : {}),
          commandHint,
        },
      );
      if (soft) return soft;

      this.bus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason, userText, intent: commandHint, silent: true },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason, userNotified: true };
    }

    let commandType = String(commandResponse.command?.commandType || '').trim().toUpperCase();
    let rawPayload = commandResponse.command?.payload || {};

    console.log('🟡 DEBUG - BRANCH DOPO LLM:', {
      commandType,
      commandHint,
      hasAdviceMessage: Boolean(String(commandResponse.command?.adviceMessage || '').trim()),
      hasUiMessage: Boolean(String(commandResponse.command?.uiMessage || '').trim()),
      advicePreview: String(commandResponse.command?.adviceMessage || commandResponse.command?.uiMessage || '').slice(0, 200),
    });

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

    // CASO 1b — chiarimento / proposta maggiordomo (prima di override cibo / dispatch).
    if (commandType === 'ASK_CLARIFICATION') {
      console.log('🟡 DEBUG - PATH SCELTO: ASK_CLARIFICATION');
      return this.publishClarification(commandResponse.command, userText);
    }

    if (commandType === 'REQUEST_FOOD_PHOTO') {
      console.log('🟡 DEBUG - PATH SCELTO: REQUEST_FOOD_PHOTO');
      return this.publishRequestFoodPhoto(commandResponse.command, userText);
    }

    // CASO 2 — risposta consulenziale: niente bozze pasto/workout.
    // Override: se l'utente stava registrando cibo, NON accettare CHAT_RESPONSE.
    if (commandType === 'CHAT_RESPONSE') {
      if (
        isClarificationFollowUpReply(userText, chatHistory)
        || isFoodRegistrationIntent(userText)
        || isConsumedMealLogDescription(userText)
        || looksLikeComplexMealLog(userText)
      ) {
        console.log('🟡 DEBUG - OVERRIDE CHAT_RESPONSE → ADD_FOOD (food registration rilevata)');
        const localResult = await this.tryParseAndPublishMealLog(userText, currentState, chatHistory, {
          ...(options?.signal ? { signal: options.signal } : {}),
        });
        if (localResult) return localResult;
        commandResponse.command = {
          ...commandResponse.command,
          commandType: 'ADD_FOOD',
          adviceMessage: '',
          uiMessage: '',
          payload: commandResponse.command?.payload && Array.isArray(commandResponse.command.payload.items)
            ? commandResponse.command.payload
            : { items: [] },
        };
        commandType = 'ADD_FOOD';
        rawPayload = commandResponse.command.payload || {};
      } else {
        console.log('🟡 DEBUG - PATH SCELTO: CHAT_RESPONSE (nessun ADD_FOOD / nessun secondo step tool)');
        return this.publishChatResponse(commandResponse.command, userText);
      }
    }

    if (
      commandType === 'ADD_FOOD'
      && isMealAdviceIntent(userText, chatHistory)
      && !isConsumedMealLogDescription(userText)
      && !looksLikeComplexMealLog(userText)
    ) {
      return this.processMealAdvice(userText, currentState, options);
    }

    if (commandType === 'ADD_WORKOUT') {
      rawPayload = normalizeWorkoutPayload({
        ...rawPayload,
        workoutType:
          normalizeChatWorkoutType(rawPayload?.workoutType)
          || inferWorkoutTypeFromText(userText)
          || rawPayload?.workoutType,
        timeString:
          rawPayload?.timeString
          || rawPayload?.exactTime
          || parseExactTimeFromUserText(userText)
          || undefined,
        exactTime:
          rawPayload?.exactTime
          || rawPayload?.timeString
          || parseExactTimeFromUserText(userText)
          || undefined,
      }, userText);
      commandResponse.command = { ...commandResponse.command, payload: rawPayload };
    }

    if (!COMMAND_TO_EVENT[commandType]) {
      const soft = await this.recoverAfterMealCommandFailure(
        userText,
        currentState,
        chatHistory,
        {
          ...(options?.signal ? { signal: options.signal } : {}),
          commandHint,
        },
      );
      if (soft) return soft;
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
      console.log('🟡 DEBUG - PATH SCELTO: ADD_FOOD (estrazione / bozza / proposal — non CHAT_RESPONSE)');
      // Mute & Replace: scarta subito qualsiasi copy Gemini (uiMessage/adviceMessage).
      commandResponse.command = this.muteAddFoodLlmCopy(commandResponse.command);
      rawPayload = commandResponse.command?.payload || rawPayload;

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
      const feedbackOpts = {
        ...(options?.signal ? { signal: options.signal } : {}),
      };

      // HARD RULE: multi-alimento → SequentialFoodWizard (blocca bozza globale / butler batch).
      if (this.mustUseSequentialFoodWizard(normalized, userText) || this.mustUseSequentialFoodWizard(rawPayload, userText)) {
        console.log('🧙 DEBUG - ADD_FOOD ROUTER → FORCE SEQUENTIAL WIZARD (items > 1)');
        const wizardPayload = hasFood ? normalized : (expandFoodPayloadItems(rawPayload).length > 0 ? rawPayload : normalized);
        return this.startSequentialFoodWizard(wizardPayload, currentState, userText);
      }

      if (this.isMealRegistrationCandidate(userText) && hasFood) {
        return this.publishMealLogProposalCard(
          normalized,
          currentState,
          userText,
          chatHistory,
          feedbackOpts,
        );
      }

      if (missing.length === 0 && this.shouldUseMealLogProposalCard(userText, normalized)) {
        return this.publishMealLogProposalCard(
          normalized,
          currentState,
          userText,
          chatHistory,
          feedbackOpts,
        );
      }

      if (missing.length > 0 && hasFood) {
        return this.beginFoodSlotFilling(normalized, currentState, { userText });
      }
    }

    const validationError = validateEnvelope(commandResponse.command);
    if (validationError) {
      if (commandType === 'ADD_FOOD' && expandFoodPayloadItems(rawPayload).length > 0) {
        if (this.mustUseSequentialFoodWizard(rawPayload, userText)) {
          return this.startSequentialFoodWizard(rawPayload, currentState, userText);
        }
        return this.beginFoodSlotFilling(rawPayload, currentState, { userText });
      }

      if (commandType === 'ADD_WORKOUT' || isWorkoutLogIntent(userText)) {
        if (!isConsultativeStateIntent(userText)) {
          const localPayload = normalizeWorkoutPayload({
            ...rawPayload,
            ...buildLocalWorkoutPayloadFromText(userText),
          }, userText);
          return this.beginWorkoutRegistration(localPayload, currentState, userText);
        }
      }

      const soft = await this.recoverAfterMealCommandFailure(
        userText,
        currentState,
        chatHistory,
        {
          ...(options?.signal ? { signal: options.signal } : {}),
          commandHint,
        },
      );
      if (soft) return soft;

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
        ? normalizeWorkoutPayload(rawPayload, userText)
        : { ...rawPayload };

    if (commandType === 'ADD_FOOD' && !payload.mealType) {
      const mealFromUser = parseMealTypeFromUserText(userText);
      if (mealFromUser) payload = { ...payload, mealType: mealFromUser };
    }

    if (commandType === 'ADD_FOOD' && this.shouldUseMealLogProposalCard(userText, payload)) {
      return this.publishMealLogProposalCard(payload, currentState, userText, chatHistory, {
        ...(options?.signal ? { signal: options.signal } : {}),
      });
    }

    if (commandType === 'ADD_WORKOUT') {
      return this.beginWorkoutRegistration(payload, currentState, userText);
    }

    // ADD_FOOD draft: solo card locale — niente budget Gemini; il residuo esce alla conferma.
    // Multi-item viene intercettato dentro stagePendingAction → wizard.
    return this.stagePendingAction(commandType, payload, {
      confidence: commandResponse.command.confidence ?? null,
      requiresConfirmation: true,
      uiMessage: commandType === 'ADD_FOOD'
        ? buildMealDraftUiMessage(payload)
        : commandResponse.command.uiMessage,
      userText,
      currentState,
    });
  }
}
export const commandTerminalController = new CommandTerminalController();
