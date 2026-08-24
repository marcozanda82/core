import { commandBus } from './dispatcher/CommandBus.js';
import { contextComposer } from './context/ContextComposer.js';
import { geminiStructuredClient } from './llm/GeminiStructuredClient.js';
import { isAbortError } from '../../services/aiService.js';
import {
  DISPATCH_ADD_FOOD,
  DISPATCH_ADD_WORKOUT,
  DISPATCH_LOG_SLEEP,
  DISPATCH_LOG_STIMULANT,
  DISPATCH_COMMAND_ACCEPTED,
  DISPATCH_COMMAND_REJECTED,
  DISPATCH_SYSTEM_MESSAGE,
  DISPATCH_UPSERT_MEAL,
} from './contracts/eventTypes.js';
import {
  CONVERSATION_STATE,
  ACTIVE_WIZARD,
  applyGramsSlotResponse,
  buildFoodConfirmationSummary,
  buildMealDraftUiMessage,
  buildMealPreviewReadyMessage,
  buildSleepConfirmationSummary,
  buildWorkoutConfirmationSummary,
  buildWorkoutDraftUiMessage,
  expandFoodPayloadItems,
  expandWorkoutPayloadExercises,
  draftItemsFromProposalItems,
  getFoodItemsMissingGrams,
  getFoodPayloadMissingFields,
  MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES,
  MEAL_DRAFT_ESTIMATED_WEIGHTS_ADVICE,
  normalizeFoodPayload,
  normalizeWorkoutPayload,
  parseConfirmationFromUserText,
  parseMealTypeFromUserText,
  inferDefaultMealType,
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
  isAskDraftAdviceIntent,
  isPriorityFreeTextMealLog,
  isGenericMealLogIntentOnly,
} from './conversation/mealLogIntent.js';
import { buildPhantomDailyReportData } from '../chat/buildPhantomDailyReportData.js';
import {
  REPORT_ANIMATION_SRC,
  REPORT_COVER_SRC,
  buildPeriodReportData,
  buildReportSystemInstruction,
  formatPeriodReportMarkdown,
  matchReportCommand,
} from './conversation/reportCommandIntent.js';
import {
  MCDRIVE_CANCEL_CHIP,
  MCDRIVE_FINISH_CHIP,
  MCDRIVE_START_MESSAGE,
  MCDRIVE_ADD_MORE_CHIP,
  MCDRIVE_MEAL_TYPE_PROMPT,
  MCDRIVE_MEAL_TYPE_QUICK_REPLIES,
  isMcdriveFinishCommand,
  isMcdriveCancelCommand,
  isMcdriveSaveConfirmCommand,
  createEmptyMcDriveDraft,
  buildLiveMealTrayPayload,
  buildMcdriveActionQuickReplies,
  parseMcdriveFoodInput,
  buildMcDriveItemFromMatch,
  buildMcDriveItemFromSearchResult,
  buildMcDriveRawItem,
  resolveMcdriveFoodViaSemanticMatchmaker,
  resolveMcdriveGramsWithHistory,
  rescaleMcDriveItemGrams,
  findNextRawMcDriveIndex,
  hasPendingMcDriveEnrichment,
  isMcDriveDisambiguationStatus,
  normalizeMcdriveMealType,
  formatMcdriveMealTypeLabel,
} from './conversation/mcdriveWizard.js';
import { getChatFallbackQuickReplies } from '../chat/chatFallbackMenu.js';
import { getFoodItemsForMealSlotFromLog } from '../../utils/mealProposalBuilders.js';
import { findNutritionalDonor, inheritMicrosFromDonor } from '../../utils/findNutritionalDonor.js';
import {
  buildConversationTextsFromChatHistory,
  getMealRegistrationMissingSlots,
  MEAL_REGISTRATION_SLOT_ORDER,
  mergeMealRegistrationFromConversation,
  promptForMissingMealRegistrationSlot,
  registrationSlotToConversationState,
} from './conversation/mealRegistrationSlots.js';
import { applyMealRegistrationSmartDefaults, applyMealTimingDefaultsOnly, deduceMealTypeFromDecimalHour, formatCurrentSystemTimeContext } from './conversation/mealSmartDefaults.js';
import {
  BUTLER_MEAL_QUICK_REPLIES,
  REQUEST_FOOD_PHOTO_QUICK_REPLIES,
  enrichFoodItemsAsButlerProposal,
  buildButlerConfirmationMessage,
  buildRequestFoodPhotoMessage,
} from './conversation/mealButlerProposal.js';
import { sanitizeUserPortionsDict } from './conversation/userPortionsMemory.js';
import { learnUserFoodAlias, sanitizeUserFoodAliasesDict } from './conversation/userFoodAliases.js';
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
  looksLikeClearMealDraftMutation,
} from './conversation/mealDraftVoiceEdit.js';
import {
  ASK_DRAFT_ADVICE_COACH_SYSTEM_BLOCK,
  buildDraftAdviceContext,
  buildDraftAdviceQuickReplies,
  generateDraftAdvicePrompt,
} from './conversation/draftAdviceCoach.js';
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
  sanitizeWizardFoodName,
  resolveWizardSelection,
} from './conversation/sequentialFoodWizard.js';
import {
  buildFastPathSummarySpokenText,
  buildAdaptiveLavagnaSpokenText,
  fastPathResolveMealPayload,
} from './conversation/fastPathMealResolve.js';
import {
  buildMealBuilderStepPrompt,
  isMealBuilderWizardTrigger,
  isUnrelatedCommandDuringMealBuilder,
} from './conversation/mealBuilderWizard.js';
import {
  processUnresolvedChatFoods,
  applyChatUsdaEnrichmentResult,
  collectPendingUsdaEnrichmentIndices,
} from './conversation/chatNewFoodPipeline.js';
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
import {
  calculateHealthScore,
  buildHealthDiagnosisPromptContext,
  HEALTH_DIAGNOSIS_SYSTEM_BLOCK,
} from '../health/HealthScoreEngine.js';
import {
  buildCoffeeLogAckMessage,
  buildCoffeeStimulantNode,
  buildFastingContextForLlm,
  COFFEE_VARIANT,
  COFFEE_VARIANT_QUICK_REPLIES,
  isCoffeeLogIntent,
  isInActiveFastingWindow,
  resolveCoffeeVariantFromText,
} from '../stimulants/coffeeLogEngine.js';
import { buildQuickEventConfirmPayload, resolveLocomotionConfirmKind } from '../quickEvents/quickEventConfirmAssets.js';

const USER_FACING_ERROR_MESSAGE =
  'Scusa, ho avuto un problema a elaborare questa frase. Puoi riformularla?';

const USER_FACING_PARSE_ERROR_MESSAGE =
  'Non sono riuscito a capire tutti gli alimenti e le grammature. Prova a elencarli così: «230g di gnocchi, 100g di passato di pomodoro».';

const COMMAND_TO_EVENT = Object.freeze({
  ADD_FOOD: DISPATCH_ADD_FOOD,
  ADD_WORKOUT: DISPATCH_ADD_WORKOUT,
  LOG_SLEEP: DISPATCH_LOG_SLEEP,
  LOG_STIMULANT: DISPATCH_LOG_STIMULANT,
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
  constructor({
    bus = commandBus,
    llmClient = geminiStructuredClient,
    composer = contextComposer,
    onPopulateMealLavagna = null,
    onSaveFoodEntryPer100ToFoodDb = null,
    onRequestUsdaEnrichment = null,
    onUserFoodAliasesMerge = null,
  } = {}) {
    this.bus = bus;
    this.llmClient = llmClient;
    this.composer = composer;
    /** @type {((payload: object) => boolean|void)|null} Voice → FastMealLogger draft (no diary save). */
    this.onPopulateMealLavagna = typeof onPopulateMealLavagna === 'function' ? onPopulateMealLavagna : null;
    /** @type {((entry: object, options?: object) => Promise<{ key?: string, row?: object }|void>)|null} Chat new food → DB personale. */
    this.onSaveFoodEntryPer100ToFoodDb = typeof onSaveFoodEntryPer100ToFoodDb === 'function'
      ? onSaveFoodEntryPer100ToFoodDb
      : null;
    /** @type {((payload: object) => void)|null} Chat USDA enrichment UI hook. */
    this.onRequestUsdaEnrichment = typeof onRequestUsdaEnrichment === 'function'
      ? onRequestUsdaEnrichment
      : null;
    /** @type {((patch: Record<string, string>) => void)|null} Merge locale dizionario alias. */
    this.onUserFoodAliasesMerge = typeof onUserFoodAliasesMerge === 'function'
      ? onUserFoodAliasesMerge
      : null;
    /** @type {object|null} Proposal ADD_FOOD in sospeso (Fase 3 USDA). */
    this.suspendedMealPublication = null;
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
    /** Editing chirurgico: le righe della card sono cliccabili. */
    this.mealDraftInteractiveEdit = false;
    /** @type {{ confirmLabel?: string, payload?: object } | null} Recovery soft post-errore LLM. */
    this.pendingSoftMealRecovery = null;
    /** @type {{ originText?: string, time?: number } | null} Caffè da chat in attesa variante. */
    this.pendingCoffeeLog = null;
    /** @type {{ mealType?: string|null } | null} McDrive: ascolto libero dopo chip spuntino/inserimento. */
    this.pendingFreeMealLogContext = null;
    /** @type {string|null} Wizard attivo (es. MEAL_BUILDER). */
    this.activeWizard = null;
    /** @type {object|null} Bozza pasto del wizard guidato in memoria. */
    this.pendingWizardDraft = null;
    /** @type {object[]} Vassoio McDrive (ciclo aperto, isolato dal wizard Guidami). */
    this.pendingMcDriveDraft = [];
    /** @type {'colazione'|'snack'|'pranzo'|'cena'|null} */
    this.mcdriveMealType = null;
    /** @type {object|null} Ultimo currentState per target / historical qty. */
    this.mcdriveContextState = null;
    /** @type {{ foodName: string, grams: number, isEstimated?: boolean, currentState?: object } | null} */
    this.pendingMcDriveUnknown = null;
    /** @type {{ currentState?: object } | null} Contesto validazione sequenziale post-Termina. */
    this.mcdriveValidationContext = null;
    /** Evita overlap se processNext viene richiamato mentre è in corso. */
    this.mcdriveValidationRunning = false;
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
      mealDraftInteractiveEdit: this.mealDraftInteractiveEdit === true,
      activeWizard: this.activeWizard,
      pendingWizardDraft: this.pendingWizardDraft
        ? { ...this.pendingWizardDraft, items: [...(this.pendingWizardDraft.items || [])] }
        : null,
      pendingMcDriveDraft: Array.isArray(this.pendingMcDriveDraft)
        ? this.pendingMcDriveDraft.map((item) => ({ ...item }))
        : [],
      mcdriveMealType: this.mcdriveMealType || null,
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
    this.mealDraftInteractiveEdit = false;
    this.pendingSoftMealRecovery = null;
    this.pendingCoffeeLog = null;
    this.pendingFreeMealLogContext = null;
    this.activeWizard = null;
    this.pendingWizardDraft = null;
    this.pendingMcDriveDraft = [];
    this.pendingMcDriveUnknown = null;
    this.mcdriveMealType = null;
    this.mcdriveValidationContext = null;
    this.mcdriveValidationRunning = false;
  }

  clearChipWaitingState() {
    const slotStates = new Set([
      CONVERSATION_STATE.AWAITING_FOOD_GRAMS,
      CONVERSATION_STATE.AWAITING_TIME,
      CONVERSATION_STATE.AWAITING_EXACT_TIME,
    ]);
    if (slotStates.has(this.conversationState)) {
      this.conversationState = CONVERSATION_STATE.IDLE;
      this.pendingCommandPayload = null;
      this.pendingCommandType = null;
      this.pendingMealRegistration = false;
    }
  }

  clearMealBuilderWizard() {
    this.activeWizard = null;
    this.pendingWizardDraft = null;
    if (this.conversationState === CONVERSATION_STATE.AWAITING_MEAL_BUILDER_STEP) {
      this.conversationState = CONVERSATION_STATE.IDLE;
    }
  }

  clearMcdriveWizard() {
    this.activeWizard = null;
    this.pendingMcDriveDraft = [];
    this.pendingMcDriveUnknown = null;
    this.mcdriveMealType = null;
    this.mcdriveEditingMealId = null;
    this.mcdriveExactTime = null;
    this.mcdriveTimeString = null;
    this.mcdriveContextState = null;
    this.mcdriveValidationContext = null;
    this.mcdriveValidationRunning = false;
    if (
      this.conversationState === CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP
      || this.conversationState === CONVERSATION_STATE.AWAITING_MCDRIVE_MEAL_TYPE
      || this.conversationState === CONVERSATION_STATE.AWAITING_MCDRIVE_SAVE_CONFIRM
    ) {
      this.conversationState = CONVERSATION_STATE.IDLE;
    }
  }

  /** Payload lavagna con mealType corrente. */
  buildMcdriveTrayPayload() {
    return buildLiveMealTrayPayload(this.pendingMcDriveDraft, {
      mealType: this.mcdriveMealType,
      exactTime: this.mcdriveExactTime,
      timeString: this.mcdriveTimeString,
      currentState: this.mcdriveContextState
        || this.mcdriveValidationContext?.currentState
        || {},
    });
  }

  rememberMcdriveContextState(currentState = {}) {
    if (currentState && typeof currentState === 'object') {
      this.mcdriveContextState = currentState;
    }
  }

  /** Aggiorna la lavagna in chat senza creare una nuova bolla. */
  publishMcdriveTraySync(extra = {}) {
    const quickReplies = buildMcdriveActionQuickReplies(this.pendingMcDriveDraft);
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'MCDRIVE_TRAY_SYNC',
        syncMcDriveTrayOnly: true,
        liveMealTray: this.buildMcdriveTrayPayload(),
        quickReplies,
        ...(extra && typeof extra === 'object' ? extra : {}),
      },
      { source: 'CommandTerminalController' },
    );
  }

  /** Apre/aggiorna la lavagna singleton (una sola card in chat). Testo opzionale. */
  publishMcdriveTrayMessage(message = '') {
    const text = String(message || '').trim();
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    const quickReplies = buildMcdriveActionQuickReplies(this.pendingMcDriveDraft);
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'MCDRIVE_TRAY',
        text,
        message: text,
        displayText: text,
        quickReplies,
        liveMealTray: this.buildMcdriveTrayPayload(),
        mcdriveWizard: true,
        mcdriveMealType: this.mcdriveMealType,
        mcdriveTraySingleton: true,
      },
      { source: 'CommandTerminalController' },
    );
    return {
      ok: true,
      awaiting: true,
      intent: 'MCDRIVE_LOOP',
      activeWizard: this.activeWizard,
      conversationState: this.conversationState,
      pendingMcDriveDraft: [...this.pendingMcDriveDraft],
      mcdriveMealType: this.mcdriveMealType,
      liveMealTray: this.buildMcdriveTrayPayload(),
    };
  }

  promptMcdriveMealType() {
    this.clearChipWaitingState();
    this.clearMealBuilderWizard();
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_MEAL_TYPE;
    this.pendingMcDriveDraft = createEmptyMcDriveDraft();
    this.mcdriveMealType = null;
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'ASK_CLARIFICATION',
        clarification: true,
        text: MCDRIVE_MEAL_TYPE_PROMPT,
        message: MCDRIVE_MEAL_TYPE_PROMPT,
        spokenText: MCDRIVE_MEAL_TYPE_PROMPT,
        displayText: MCDRIVE_MEAL_TYPE_PROMPT,
        quickReplies: [...MCDRIVE_MEAL_TYPE_QUICK_REPLIES],
      },
      { source: 'CommandTerminalController' },
    );
    return {
      ok: true,
      awaiting: true,
      intent: 'AWAITING_MCDRIVE_MEAL_TYPE',
      conversationState: this.conversationState,
    };
  }

  setMcdriveMealTypeAndOpen(mealTypeRaw) {
    const mealType = normalizeMcdriveMealType(mealTypeRaw);
    if (!mealType) {
      return this.promptMcdriveMealType();
    }
    this.mcdriveMealType = mealType;
    this.pendingMcDriveDraft = createEmptyMcDriveDraft();
    if (!String(this.mcdriveExactTime || '').trim()) {
      const timeCtx = formatCurrentSystemTimeContext();
      this.mcdriveExactTime = timeCtx.timeHHmm;
      this.mcdriveTimeString = timeCtx.timeHHmm;
    }
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
    // Card unica: nessun testo chat — l'header della lavagna mostra già il pasto.
    return this.publishMcdriveTrayMessage('');
  }

  startMcdriveWizard(currentState = {}, options = {}) {
    this.rememberMcdriveContextState(currentState);
    void currentState;
    this.clearChipWaitingState();
    this.clearMealBuilderWizard();
    this.pendingFreeMealLogContext = null;
    this.mcdriveValidationContext = null;
    this.mcdriveValidationRunning = false;

    const editingMealId = options?.editingMealId != null
      ? String(options.editingMealId).trim()
      : null;
    const isEditing = Boolean(editingMealId);
    this.mcdriveEditingMealId = editingMealId;

    const fromOptions = normalizeMcdriveMealType(
      options?.mealTypeHint || options?.mealType || null,
    );
    const fromText = parseMealTypeFromUserText(options?.userText || '');
    const mealType = fromOptions || normalizeMcdriveMealType(fromText);

    if (!mealType) {
      return this.promptMcdriveMealType();
    }

    // Default tempo: ora corrente, a meno di override (editing).
    const timeCtx = formatCurrentSystemTimeContext();
    const nextTime = isEditing
      ? String(
        options?.editingExactTime
        || options?.exactTime
        || options?.timeString
        || options?.mealTime
        || timeCtx.timeHHmm,
      ).trim()
      : timeCtx.timeHHmm;
    this.mcdriveExactTime = nextTime;
    this.mcdriveTimeString = nextTime;

    if (!isEditing) {
      return this.setMcdriveMealTypeAndOpen(mealType);
    }

    // Hydration: pre-popoliamo la lavagna con gli alimenti del pasto esistente.
    let editingFoods = Array.isArray(options?.editingFoods) ? options.editingFoods : [];
    if (editingFoods.length === 0 && editingMealId) {
      const log = Array.isArray(currentState?.activeLog) ? currentState.activeLog : [];
      editingFoods = getFoodItemsForMealSlotFromLog(log, editingMealId).map((f) => ({
        foodName: f.foodName || f.name || f.desc || f.label || '',
        grams: f.grams ?? f.qta ?? f.weight ?? f.qty ?? 0,
        kcal: f.kcal ?? f.cal ?? 0,
        pro: f.pro ?? f.prot ?? 0,
        carb: f.carb ?? f.carbo ?? f.cho ?? 0,
        fat: f.fat ?? f.fatTotal ?? 0,
        foodDbKey: f.foodDbKey ?? f.matchedKey ?? null,
        itemId: f.itemId ?? f.id ?? null,
      }));
    }
    const hydratedDraft = editingFoods
      .map((f, idx) => {
        if (!f || typeof f !== 'object') return null;
        const foodName = String(f.foodName || f.name || f.desc || f.label || '').trim();
        const grams = Math.max(
          1,
          Math.round(Number(f.grams ?? f.qta ?? f.weight ?? f.qty ?? 0) || 0),
        );
        if (!foodName) return null;

        const kcal = Math.round(Number(f.kcal ?? f.cal ?? 0) || 0);
        const pro = Number(f.pro ?? f.prot ?? 0) || 0;
        const carbo = Number(f.carbo ?? f.carb ?? f.cho ?? 0) || 0;
        const fat = Number(f.fatTotal ?? f.fat ?? 0) || 0;
        const foodDbKey = f.foodDbKey ?? f.matchedKey ?? f.foodDbKey;
        const id = String(f.itemId || f.id || f.key || `mcdrive_edit_${idx}`).trim();

        return {
          id,
          foodName,
          spokenFoodName: foodName,
          grams,
          kcal,
          pro,
          carbo,
          fat,
          foodDbKey: foodDbKey != null && String(foodDbKey).trim() ? String(foodDbKey).trim() : null,
          status: 'resolved',
          isEstimated: false,
          alternatives: Array.isArray(f.alternatives) ? f.alternatives.slice(0, 4) : [],
          row: f.row && typeof f.row === 'object' ? { ...f.row } : undefined,
        };
      })
      .filter(Boolean);

    this.mcdriveMealType = mealType;
    this.pendingMcDriveDraft = hydratedDraft;
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
    return this.publishMcdriveTrayMessage('');
  }

  continueMcdriveAddMore() {
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
    this.publishMcdriveTraySync();
    return {
      ok: true,
      intent: 'ADD_MORE_MCDRIVE',
      conversationState: this.conversationState,
    };
  }

  async processMcdriveWizardResponse(userText, currentState = {}, options = {}) {
    this.rememberMcdriveContextState(currentState);
    const text = String(userText || '').trim();
    const forcedIntent = String(options?.intent || '').trim().toUpperCase();

    if (forcedIntent === 'CANCEL_MCDRIVE_WIZARD' || isMcdriveCancelCommand(text)) {
      return this.cancelMcdriveWizard();
    }

    if (forcedIntent === 'SET_MCDRIVE_MEAL_TYPE' || this.conversationState === CONVERSATION_STATE.AWAITING_MCDRIVE_MEAL_TYPE) {
      const mealType = normalizeMcdriveMealType(options?.mealType)
        || parseMealTypeFromUserText(text)
        || normalizeMcdriveMealType(text);
      if (!mealType) {
        return this.promptMcdriveMealType();
      }
      return this.setMcdriveMealTypeAndOpen(mealType);
    }

    if (forcedIntent === 'ADD_MORE_MCDRIVE') {
      return this.continueMcdriveAddMore();
    }

    if (forcedIntent === 'SAVE_MCDRIVE_MEAL' || isMcdriveSaveConfirmCommand(text)) {
      return this.commitMcdriveValidatedMeal(currentState);
    }

    if (forcedIntent === 'FINISH_MCDRIVE_WIZARD' || isMcdriveFinishCommand(text)) {
      if (this.conversationState === CONVERSATION_STATE.AWAITING_MCDRIVE_SAVE_CONFIRM) {
        return this.commitMcdriveValidatedMeal(currentState);
      }
      return this.finishMcdriveWizard(currentState);
    }

    if (this.conversationState === CONVERSATION_STATE.AWAITING_MCDRIVE_SAVE_CONFIRM) {
      // Testo libero in conferma: tratta come append se sembra cibo, altrimenti ripropone i chip.
      const maybeFood = parseMcdriveFoodInput(text);
      if (maybeFood?.foodName) {
        this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
        const draftItem = buildMcDriveRawItem(maybeFood);
        this.appendMcDriveDraftItem(draftItem);
        this.publishMcdriveTraySync();
        return { ok: true, appended: true, intent: 'MCDRIVE_APPEND_RAW' };
      }
      return this.promptMcdriveSaveConfirm();
    }

    if (!this.mcdriveMealType) {
      return this.promptMcdriveMealType();
    }

    const parsed = parseMcdriveFoodInput(text);
    if (!parsed?.foodName) {
      this.publishMcdriveTraySync();
      this.bus.publish(
        DISPATCH_SYSTEM_MESSAGE,
        {
          type: 'system',
          text: 'Non ho riconosciuto l\'alimento. Prova tipo «100g sardine».',
          message: 'Non ho riconosciuto l\'alimento. Prova tipo «100g sardine».',
          isSystem: true,
        },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason: 'unparsed_food' };
    }

    // Append raw sulla lavagna esistente (nessun reset, nessun match DB, nessuna bolla testuale).
    const draftItem = buildMcDriveRawItem(parsed);
    this.appendMcDriveDraftItem(draftItem);
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
    this.publishMcdriveTraySync();
    return {
      ok: true,
      appended: true,
      intent: 'MCDRIVE_APPEND_RAW',
      pendingMcDriveDraft: [...this.pendingMcDriveDraft],
    };
  }

  appendMcDriveDraftItem(item) {
    if (!item?.foodName) return;
    const list = Array.isArray(this.pendingMcDriveDraft) ? this.pendingMcDriveDraft : [];
    this.pendingMcDriveDraft = [...list, item];
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
  }

  appendMcDriveDraftItems(items = []) {
    const list = Array.isArray(this.pendingMcDriveDraft) ? this.pendingMcDriveDraft : [];
    const toAdd = (Array.isArray(items) ? items : []).filter((item) => item?.foodName);
    if (toAdd.length === 0) {
      return {
        ok: false,
        reason: 'empty_items',
        liveMealTray: this.buildMcdriveTrayPayload(),
      };
    }
    this.pendingMcDriveDraft = [...list, ...toAdd];
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
    return {
      ok: true,
      liveMealTray: this.buildMcdriveTrayPayload(),
      pendingMcDriveDraft: [...this.pendingMcDriveDraft],
      addedCount: toAdd.length,
    };
  }

  removeMcDriveDraftItem(index) {
    const list = Array.isArray(this.pendingMcDriveDraft) ? this.pendingMcDriveDraft : [];
    const idx = Math.round(Number(index));
    if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) {
      return {
        ok: false,
        reason: 'invalid_index',
        liveMealTray: this.buildMcdriveTrayPayload(),
      };
    }
    this.pendingMcDriveDraft = list.filter((_, i) => i !== idx);
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
    return {
      ok: true,
      liveMealTray: this.buildMcdriveTrayPayload(),
      pendingMcDriveDraft: [...this.pendingMcDriveDraft],
    };
  }

  updateMcDriveDraftItemGrams(index, grams) {
    const list = Array.isArray(this.pendingMcDriveDraft) ? this.pendingMcDriveDraft : [];
    const idx = Math.round(Number(index));
    if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) {
      return {
        ok: false,
        reason: 'invalid_index',
        liveMealTray: this.buildMcdriveTrayPayload(),
      };
    }
    const next = [...list];
    next[idx] = rescaleMcDriveItemGrams(next[idx], grams);
    this.pendingMcDriveDraft = next;
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
    return {
      ok: true,
      liveMealTray: this.buildMcdriveTrayPayload(),
      pendingMcDriveDraft: [...this.pendingMcDriveDraft],
    };
  }

  updateMcDriveMealTime(exactTimeStr) {
    const raw = String(exactTimeStr || '').trim();
    if (!raw) return { ok: false, reason: 'empty_time' };
    // Validazione base: HH:mm
    const ok = /^\d{2}:\d{2}$/.test(raw);
    if (!ok) return { ok: false, reason: 'invalid_time_format' };
    this.mcdriveExactTime = raw;
    this.mcdriveTimeString = raw;
    this.publishMcdriveTraySync();
    return {
      ok: true,
      liveMealTray: this.buildMcdriveTrayPayload(),
    };
  }

  /**
   * Sostituisce l'alimento della riga con un candidato `alternatives`.
   * @param {number} index
   * @param {object} alternative
   */
  applyMcDriveDraftAlternative(index, alternative) {
    const list = Array.isArray(this.pendingMcDriveDraft) ? this.pendingMcDriveDraft : [];
    const idx = Math.round(Number(index));
    if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) {
      return { ok: false, reason: 'invalid_index', liveMealTray: this.buildMcdriveTrayPayload() };
    }
    if (!alternative?.row && !alternative?.foodDbKey) {
      return { ok: false, reason: 'invalid_alternative', liveMealTray: this.buildMcdriveTrayPayload() };
    }
    const prev = list[idx] || {};
    const grams = Math.max(1, Math.round(Number(prev.grams) || 100));
    const match = {
      name: alternative.foodName || alternative.name,
      fdcId: alternative.foodDbKey,
      row: alternative.row,
    };
    const otherAlts = (Array.isArray(prev.alternatives) ? prev.alternatives : [])
      .filter((a) => String(a?.foodDbKey || '') !== String(alternative.foodDbKey || ''));
    // Mantieni il precedente come alternativa se aveva una row.
    if (prev.row) {
      otherAlts.unshift({
        foodDbKey: prev.foodDbKey || null,
        foodName: prev.foodName || prev.name || '',
        confidence: null,
        row: prev.row,
      });
    }
    const built = buildMcDriveItemFromMatch(
      prev.spokenFoodName || prev.foodName || match.name,
      grams,
      match,
      prev.source || 'kentu',
      {
        id: prev.id,
        isEstimated: false,
        alternatives: otherAlts.slice(0, 4),
      },
    );
    const next = [...list];
    next[idx] = built;
    this.pendingMcDriveDraft = next;
    this.learnMcDriveFoodAlias(
      prev.spokenFoodName || prev.foodName || built.spokenFoodName,
      built.foodDbKey,
    );
    this.publishMcdriveTraySync();
    return {
      ok: true,
      liveMealTray: this.buildMcdriveTrayPayload(),
      pendingMcDriveDraft: [...this.pendingMcDriveDraft],
    };
  }

  /**
   * Sovrascrive la riga con un risultato UniversalSearchModal.
   * @param {number} index
   * @param {object} searchResult
   */
  replaceMcDriveDraftItemFromSearch(index, searchResult) {
    const list = Array.isArray(this.pendingMcDriveDraft) ? this.pendingMcDriveDraft : [];
    const idx = Math.round(Number(index));
    if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) {
      return { ok: false, reason: 'invalid_index', liveMealTray: this.buildMcdriveTrayPayload() };
    }
    if (!searchResult || typeof searchResult !== 'object') {
      return { ok: false, reason: 'invalid_search_result', liveMealTray: this.buildMcdriveTrayPayload() };
    }
    const prev = list[idx] || {};
    const grams = Math.max(1, Math.round(Number(prev.grams) || 100));
    const built = buildMcDriveItemFromSearchResult(searchResult, grams, {
      id: prev.id,
      spokenFoodName: prev.spokenFoodName || prev.foodName,
      alternatives: Array.isArray(prev.alternatives) ? prev.alternatives : [],
    });
    const next = [...list];
    next[idx] = built;
    this.pendingMcDriveDraft = next;
    this.learnMcDriveFoodAlias(
      prev.spokenFoodName || prev.foodName || built.spokenFoodName,
      built.foodDbKey,
    );
    this.publishMcdriveTraySync();
    return {
      ok: true,
      liveMealTray: this.buildMcdriveTrayPayload(),
      pendingMcDriveDraft: [...this.pendingMcDriveDraft],
    };
  }

  pauseMcdriveForUnknown(parsed, currentState = {}) {
    const foodName = String(parsed?.foodName || '').trim();
    const grams = Math.max(1, Math.round(Number(parsed?.grams) || 100));
    this.pendingMcDriveUnknown = {
      foodName,
      grams,
      isEstimated: parsed?.isEstimated === true,
      currentState,
    };
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;

    if (typeof this.onRequestUsdaEnrichment === 'function') {
      const dbCtx = this.getFastPathContext(currentState);
      this.onRequestUsdaEnrichment({
        foodName,
        mode: 'mcdrive',
        variant: 'disambiguation',
        kentuItDb: dbCtx.kentuItDb,
        personalDb: dbCtx.personalDb,
        globalDb: dbCtx.globalDb,
        offDb: dbCtx.offDb,
        resume: (match) => this.resumeMcdriveUnknown(match),
      });
    }

    return this.publishMcdriveTraySync();
  }

  async resumeMcdriveUnknown(match) {
    const pending = this.pendingMcDriveUnknown;
    this.pendingMcDriveUnknown = null;
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;

    if (!pending?.foodName) {
      this.publishMcdriveTraySync();
      return { ok: true, intent: 'MCDRIVE_LOOP' };
    }

    if (!match?.row) {
      this.publishMcdriveTraySync();
      return { ok: true, skipped: true, intent: 'MCDRIVE_LOOP' };
    }

    const grams = Math.max(1, Math.round(Number(pending.grams) || 100));
    let draftItem = buildMcDriveItemFromMatch(
      pending.foodName,
      grams,
      match,
      'learned',
      { isEstimated: pending.isEstimated === true },
    );

    try {
      const enriched = await applyChatUsdaEnrichmentResult(
        { foodName: pending.foodName, grams },
        match,
        this.buildChatFoodPipelineContext(pending.currentState || {}),
      );
      if (enriched?.foodName) {
        draftItem = {
          ...draftItem,
          foodName: String(enriched.foodName || draftItem.foodName).trim(),
          grams: Math.max(1, Math.round(Number(enriched.grams) || grams)),
          kcal: Math.round(Number(enriched.kcal) || draftItem.kcal || 0),
          pro: Number(enriched.pro) || draftItem.pro || 0,
          carbo: Number(enriched.carbo) || draftItem.carbo || 0,
          fat: Number(enriched.fat) || draftItem.fat || 0,
          foodDbKey: enriched.foodDbKey || draftItem.foodDbKey,
          isNewFood: true,
          source: 'learned',
        };
      }
    } catch (error) {
      console.warn('[CommandTerminalController] McDrive unknown resume persist failed', error);
    }

    this.appendMcDriveDraftItem(draftItem);
    this.learnMcDriveFoodAlias(pending.foodName, draftItem.foodDbKey);
    this.publishMcdriveTraySync();
    return {
      ok: true,
      appended: true,
      intent: 'MCDRIVE_APPEND_RAW',
      pendingMcDriveDraft: [...this.pendingMcDriveDraft],
    };
  }

  cancelMcdriveWizard() {
    this.clearMcdriveWizard();
    if (typeof this.onRequestUsdaEnrichment === 'function') {
      this.onRequestUsdaEnrichment({ foodName: '', resume: null });
    }
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'system',
        text: 'Inserimento guidato annullato.',
        message: 'Inserimento guidato annullato.',
        isSystem: true,
        systemIcon: 'cancel',
        avatarAsset: '/Hacker4.png',
        resolveMcDriveTray: true,
        quickReplies: getChatFallbackQuickReplies(),
      },
      { source: 'CommandTerminalController' },
    );
    return { ok: true, cancelled: true, intent: 'CANCEL_MCDRIVE_WIZARD' };
  }

  /**
   * Termina → avvia validazione sequenziale (nessun DISPATCH_UPSERT_MEAL diretto).
   */
  async finishMcdriveWizard(currentState = {}) {
    const draftItems = Array.isArray(this.pendingMcDriveDraft) ? this.pendingMcDriveDraft : [];
    if (draftItems.length === 0) {
      this.publishMcdriveTraySync();
      return { ok: false, reason: 'empty_tray', liveMealTray: this.buildMcdriveTrayPayload() };
    }

    this.rememberMcdriveContextState(currentState);
    this.mcdriveValidationContext = { currentState: currentState || {} };
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
    this.publishMcdriveTraySync();
    return this.processNextRawMcdriveItem();
  }

  /**
   * Ciclo validazione: primo raw → processing (+ delay UI) → match DB → resolved e continua; fail → enrichment pause.
   * Parte solo da «Calcola Valori» (finishMcdriveWizard) — mai in automatico sull'append.
   */
  async processNextRawMcdriveItem() {
    if (this.mcdriveValidationRunning) {
      return { ok: true, busy: true };
    }

    const list = Array.isArray(this.pendingMcDriveDraft) ? this.pendingMcDriveDraft : [];
    if (hasPendingMcDriveEnrichment(list)) {
      return { ok: true, paused: true, reason: 'requires_disambiguation' };
    }

    const idx = findNextRawMcDriveIndex(list);
    if (idx < 0) {
      return this.promptMcdriveSaveConfirm();
    }

    this.mcdriveValidationRunning = true;
    const item = list[idx];
    const foodName = String(item?.foodName || item?.name || '').trim();
    const currentState = this.mcdriveValidationContext?.currentState || this.mcdriveContextState || {};
    this.rememberMcdriveContextState(currentState);

    // Nome vuoto: fallimento immediato, niente delay / lookup.
    if (!foodName) {
      this.mcdriveValidationRunning = false;
      const afterEmpty = [...this.pendingMcDriveDraft];
      afterEmpty[idx] = {
        ...item,
        id: item.id,
        foodName: '',
        spokenFoodName: '',
        status: 'requires_disambiguation',
        candidates: [],
        alternatives: [],
        confidenceScore: 0,
        needsExternalSearch: false,
        searchLevel: 1,
        kcal: 0,
        pro: 0,
        carbo: 0,
        fat: 0,
        foodDbKey: null,
      };
      this.pendingMcDriveDraft = afterEmpty;
      this.publishMcdriveTraySync();
      this.openMcdriveDisambiguationForItem(idx);
      return { ok: true, paused: true, reason: 'requires_disambiguation' };
    }

    // Paint minimo "processing" senza timer artificiali (niente 80ms per elemento).
    const nextList = [...list];
    nextList[idx] = { ...item, status: 'processing' };
    this.pendingMcDriveDraft = nextList;
    this.publishMcdriveTraySync();
    await new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
      } else {
        queueMicrotask(resolve);
      }
    });

    let resolved = null;
    try {
      const dbCtx = this.getFastPathContext(currentState);
      resolved = await resolveMcdriveFoodViaSemanticMatchmaker(foodName, {
        personalDb: dbCtx.personalDb,
        kentuItDb: dbCtx.kentuItDb,
        globalDb: dbCtx.globalDb,
        offDb: dbCtx.offDb,
        userFoodAliases: dbCtx.userFoodAliases,
      });
    } catch (error) {
      if (isAbortError(error)) {
        this.mcdriveValidationRunning = false;
        throw error;
      }
      console.warn('[CommandTerminalController] McDrive sequential match failed', error);
      // Fallimento ricerca: esci subito verso disambiguazione (niente retry/wait).
      resolved = {
        match: null,
        needsDisambiguation: true,
        candidates: [],
        alternatives: [],
        confidenceScore: 0,
        source: null,
      };
    }

    this.mcdriveValidationRunning = false;

    if (resolved?.match && !resolved?.needsDisambiguation) {
      const matchFoodDbKey = String(
        resolved.match?.fdcId || resolved.match?.row?.id || resolved.match?.row?.foodDbKey || '',
      ).trim() || null;
      const matchName = String(resolved.match?.name || foodName).trim();
      const grams = resolveMcdriveGramsWithHistory(
        item,
        { foodDbKey: matchFoodDbKey, foodName: matchName },
        currentState,
      );
      const built = buildMcDriveItemFromMatch(
        foodName,
        grams,
        resolved.match,
        resolved.source,
        {
          id: item.id,
          isEstimated: item?.isEstimated === true,
          alternatives: resolved.alternatives || [],
        },
      );
      const after = [...this.pendingMcDriveDraft];
      after[idx] = {
        ...built,
        id: item.id || built.id,
        status: 'resolved',
        confidenceScore: Number(resolved.confidenceScore) || null,
      };
      this.pendingMcDriveDraft = after;
      this.publishMcdriveTraySync();
      // Passaggio coda immediato (microtask): niente delay tra item risolti.
      await Promise.resolve();
      return this.processNextRawMcdriveItem();
    }

    // Confidenza insufficiente o più candidati simili: non indovinare — scheda disambiguazione.
    const candidates = Array.isArray(resolved?.candidates) ? resolved.candidates : [];
    const afterAmbiguous = [...this.pendingMcDriveDraft];
    afterAmbiguous[idx] = {
      ...item,
      id: item.id,
      foodName,
      spokenFoodName: foodName,
      status: 'requires_disambiguation',
      candidates,
      alternatives: resolved?.alternatives || [],
      confidenceScore: Number(resolved?.confidenceScore) || 0,
      needsExternalSearch: resolved?.needsExternalSearch === true,
      searchLevel: Number(resolved?.searchLevel) || 1,
      kcal: 0,
      pro: 0,
      carbo: 0,
      fat: 0,
      foodDbKey: null,
    };
    this.pendingMcDriveDraft = afterAmbiguous;
    this.publishMcdriveTraySync();
    this.openMcdriveDisambiguationForItem(idx);
    return { ok: true, paused: true, reason: 'requires_disambiguation' };
  }

  /**
   * Apre la Scheda di Risoluzione Alimento per una voce requires_disambiguation.
   * @param {number} index
   */
  openMcdriveDisambiguationForItem(index) {
    const list = Array.isArray(this.pendingMcDriveDraft) ? this.pendingMcDriveDraft : [];
    const idx = Number.isFinite(Number(index)) ? Number(index) : -1;
    const item = idx >= 0 ? list[idx] : null;
    if (!item || !isMcDriveDisambiguationStatus(item)) {
      return { ok: false, reason: 'no_disambiguation_item' };
    }

    const foodName = String(item.spokenFoodName || item.foodName || item.name || '').trim();
    const currentState = this.mcdriveValidationContext?.currentState || this.mcdriveContextState || {};
    const dbCtx = this.getFastPathContext(currentState);
    this.mcdriveDisambiguationIndex = idx;

    if (typeof this.onRequestUsdaEnrichment === 'function') {
      this.onRequestUsdaEnrichment({
        foodName,
        mode: 'mcdrive',
        variant: 'disambiguation',
        matches: Array.isArray(item.candidates) ? item.candidates : [],
        needsExternalSearch: item.needsExternalSearch === true
          || (Array.isArray(item.candidates) && item.candidates.length === 0),
        personalDb: dbCtx.personalDb,
        kentuItDb: dbCtx.kentuItDb,
        globalDb: dbCtx.globalDb,
        offDb: dbCtx.offDb,
        resume: (match) => this.resumeMcdriveValidationEnrichment(match, idx),
      });
    }

    return { ok: true, foodName };
  }

  /**
   * Ripresa dopo ChatFoodEnrichmentModal (match trovato o skip/tralascia).
   */
  async resumeMcdriveValidationEnrichment(match, forcedIndex = null) {
    const list = Array.isArray(this.pendingMcDriveDraft) ? [...this.pendingMcDriveDraft] : [];
    let idx = Number.isFinite(Number(forcedIndex)) ? Number(forcedIndex) : -1;
    if (idx < 0 || !isMcDriveDisambiguationStatus(list[idx])) {
      idx = list.findIndex((item) => isMcDriveDisambiguationStatus(item));
    }
    if (idx < 0) {
      return this.processNextRawMcdriveItem();
    }

    const pending = list[idx];
    const foodName = String(pending?.spokenFoodName || pending?.foodName || '').trim();

    if (!match?.row) {
      list[idx] = {
        ...pending,
        status: 'skipped',
        kcal: 0,
        pro: 0,
        carbo: 0,
        fat: 0,
        foodDbKey: null,
        candidates: [],
      };
    } else {
      const matchFoodDbKey = String(match?.fdcId || match?.row?.id || match?.row?.foodDbKey || '').trim() || null;
      const matchSource = String(match?.source || match?.dbSource || 'learned').trim() || 'learned';
      const grams = resolveMcdriveGramsWithHistory(
        pending,
        { foodDbKey: matchFoodDbKey, foodName: match?.name || foodName },
        this.mcdriveContextState || {},
      );
      const built = buildMcDriveItemFromMatch(
        foodName,
        grams,
        match,
        matchSource,
        {
          id: pending.id,
          isEstimated: pending?.isEstimated === true || match?.isCustom === true,
          alternatives: Array.isArray(pending.alternatives) ? pending.alternatives : [],
        },
      );
      list[idx] = {
        ...built,
        id: pending.id || built.id,
        status: 'resolved',
        isCustom: match?.isCustom === true,
        candidates: [],
      };
      this.learnMcDriveFoodAlias(foodName, built.foodDbKey);
    }

    this.mcdriveDisambiguationIndex = null;
    this.pendingMcDriveDraft = list;
    this.publishMcdriveTraySync();
    return this.processNextRawMcdriveItem();
  }

  /** Fine ciclo: aggiorna lavagna + chip in silenzio (nessuna bolla «Calcolo completato»). */
  promptMcdriveSaveConfirm() {
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_SAVE_CONFIRM;
    // Solo sync tray: footer/chip si aggiornano da buildMcdriveActionQuickReplies.
    this.publishMcdriveTraySync();
    return {
      ok: true,
      awaiting: true,
      intent: 'AWAITING_MCDRIVE_SAVE_CONFIRM',
      conversationState: this.conversationState,
      pendingMcDriveDraft: [...this.pendingMcDriveDraft],
    };
  }

  /**
   * Chip 🏁 Salva Pasto → DISPATCH_UPSERT_MEAL (solo resolved; skipped a zero / esclusi).
   */
  commitMcdriveValidatedMeal(currentState = {}) {
    const draftItems = Array.isArray(this.pendingMcDriveDraft) ? this.pendingMcDriveDraft : [];
    const state = currentState || this.mcdriveValidationContext?.currentState || {};
    const editingMealId = this.mcdriveEditingMealId;
    const isEditingLoggedMeal = Boolean(editingMealId);

    // Solo voci verificate; skipped esclusi dal commit (zero macro / scartati).
    const commitSource = draftItems.filter((item) => {
      const status = String(item?.status || '').toLowerCase();
      if (status === 'skipped' || status === 'raw' || status === 'pending_enrichment'
        || status === 'requires_disambiguation'
        || status === 'processing' || status === 'validating') {
        return false;
      }
      return status === 'resolved' || Number(item?.kcal) > 0 || item?.foodDbKey;
    });

    if (commitSource.length === 0) {
      this.bus.publish(
        DISPATCH_SYSTEM_MESSAGE,
        {
          type: 'system',
          text: 'Nessun alimento verificato da salvare. Aggiungi voci o risolvi quelle in sospeso.',
          message: 'Nessun alimento verificato da salvare. Aggiungi voci o risolvi quelle in sospeso.',
          isSystem: true,
          quickReplies: getChatFallbackQuickReplies(),
        },
        { source: 'CommandTerminalController' },
      );
      return { ok: false, reason: 'no_resolved_items' };
    }

    const timeCtx = formatCurrentSystemTimeContext();
    const selectedExactTime = String(this.mcdriveExactTime || this.mcdriveTimeString || timeCtx.timeHHmm).trim();
    const mealType = String(
      normalizeMcdriveMealType(this.mcdriveMealType)
      || inferDefaultMealType(state)
      || deduceMealTypeFromDecimalHour(timeCtx.decimalHour)
      || 'pranzo',
    ).trim().toLowerCase();
    const mealTypeForPayload = isEditingLoggedMeal
      ? String(editingMealId).split('_')[0].trim().toLowerCase() || mealType
      : mealType;

    let payload = normalizeFoodPayload(
      {
        items: commitSource.map((item) => ({
          foodName: String(item?.foodName || item?.name || '').trim(),
          grams: Math.max(1, Math.round(Number(item?.grams) || 0)),
          kcal: Math.round(Number(item?.kcal) || 0),
          pro: Number(item?.pro ?? item?.prot) || 0,
          carbo: Number(item?.carbo ?? item?.carb) || 0,
          fat: Number(item?.fat ?? item?.fatTotal) || 0,
          ...(item?.foodDbKey != null ? { foodDbKey: item.foodDbKey, matchedKey: item.foodDbKey } : {}),
          ...(item?.spokenFoodName ? { spokenFoodName: item.spokenFoodName } : {}),
          ...(item?.isEstimated === true ? { isEstimated: true } : {}),
        })),
        mealType: mealTypeForPayload,
        exactTime: selectedExactTime,
        timeString: selectedExactTime,
      },
      state,
      { inferMealTypeFromContext: false },
    );
    payload = applyMealTimingDefaultsOnly(payload);

    const proposal = buildMealLogProposalFromPayload(
      { ...payload, forceNewMealSlot: !isEditingLoggedMeal },
      state,
      { userText: 'McDrive Salva Pasto' },
    );
    const itemsForCommit = (proposal?.items || expandFoodPayloadItems(payload))
      .map((item) => {
        const foodName = String(item?.foodName || item?.name || '').trim();
        const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta) || 0));
        const foodDbKey = item?.foodDbKey != null ? String(item.foodDbKey).trim() : '';
        if (!foodName || grams <= 0) return null;
        return {
          foodName,
          grams,
          ...(foodDbKey ? { foodDbKey, matchedKey: foodDbKey } : {}),
          ...(Number.isFinite(Number(item?.kcal)) ? { kcal: Math.round(Number(item.kcal)) } : {}),
          ...(Number.isFinite(Number(item?.pro ?? item?.prot))
            ? { pro: Number(item.pro ?? item.prot) }
            : {}),
          ...(Number.isFinite(Number(item?.carbo ?? item?.carb))
            ? { carbo: Number(item.carbo ?? item.carb) }
            : {}),
          ...(Number.isFinite(Number(item?.fat ?? item?.fatTotal))
            ? { fat: Number(item.fat ?? item.fatTotal) }
            : {}),
        };
      })
      .filter(Boolean);

    if (itemsForCommit.length === 0) {
      return {
        ok: false,
        reason: 'empty_commit',
      };
    }

    const exactTime = String(payload?.exactTime || payload?.timeString || selectedExactTime || timeCtx.timeHHmm).trim();
    const resolvedMealType = String(payload?.mealType || mealTypeForPayload).trim().toLowerCase() || mealTypeForPayload;

    this.clearMcdriveWizard();
    if (typeof this.onRequestUsdaEnrichment === 'function') {
      this.onRequestUsdaEnrichment({ foodName: '', resume: null });
    }

    this.bus.publish(
      DISPATCH_UPSERT_MEAL,
      {
        mealType: resolvedMealType,
        items: itemsForCommit,
        action: isEditingLoggedMeal ? 'replace' : 'add',
        upsertAction: isEditingLoggedMeal ? 'replace' : 'add',
        forceNewMealSlot: isEditingLoggedMeal ? false : true,
        ...(isEditingLoggedMeal ? { targetNodeId: editingMealId } : {}),
        source: isEditingLoggedMeal ? 'mcdrive_wizard_edit' : 'mcdrive_wizard',
        ...(exactTime ? { exactTime, timeString: exactTime } : {}),
      },
      {
        source: 'CommandTerminalController',
        correlationId: 'mcdrive_save_confirm',
      },
    );

    this.publishProjectedMealLogFeedback(
      {
        items: proposal?.items || itemsForCommit,
        mealType: resolvedMealType,
        exactTime,
        timeString: exactTime,
      },
      state,
      { userText: 'McDrive Salva Pasto', resolveMcDriveTray: true },
    );

    return {
      ok: true,
      intent: 'SAVE_MCDRIVE_MEAL',
      saved: true,
      mealType: resolvedMealType,
      itemCount: itemsForCommit.length,
    };
  }

  shouldBypassSlotFillingForFreeText(userText, chatHistory = [], options = {}) {
    const text = String(userText || '').trim();
    if (!text) return false;
    if (options?.fromQuickReply || options?.clarificationReply || options?.fromSlotQuickReply) {
      return false;
    }
    if (isPriorityFreeTextMealLog(text)) return true;
    if (isWorkoutLogIntent(text)) return true;
    if (/\b(?:peso|pesata)\s+\d+/i.test(text) || /\d+(?:[.,]\d+)?\s*kg\b/i.test(text)) return true;
    return false;
  }

  publishMealBuilderStepPrompt(state) {
    const prompt = buildMealBuilderStepPrompt(state);
    this.conversationState = CONVERSATION_STATE.AWAITING_MEAL_BUILDER_STEP;
    this.activeWizard = ACTIVE_WIZARD.MEAL_BUILDER;
    this.pendingWizardDraft = state;
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'ASK_CLARIFICATION',
        text: prompt.text,
        message: prompt.text,
        spokenText: prompt.text,
        displayText: prompt.text,
        quickReplies: prompt.quickReplies,
        clarification: true,
        mealWizard: prompt.mealWizard,
        mealWizardPhase: prompt.mealWizardPhase,
        mealProposals: null,
      },
      { source: 'CommandTerminalController' },
    );
    return {
      ok: true,
      awaiting: true,
      intent: 'MEAL_BUILDER_WIZARD',
      activeWizard: this.activeWizard,
      pendingWizardDraft: this.getPendingWizardDraft(),
      conversationState: this.conversationState,
    };
  }

  getPendingWizardDraft() {
    return this.pendingWizardDraft
      ? {
          ...this.pendingWizardDraft,
          items: [...(this.pendingWizardDraft.items || [])],
        }
      : null;
  }

  /**
   * @deprecated Guidami testuale (base/proteina/extra) → dirottato su McDrive / LiveMealTray.
   * Mantenuto come alias per chip/intent legacy START_MEAL_BUILDER_WIZARD.
   */
  startMealBuilderWizard(userText, currentState = {}, options = {}) {
    void userText;
    console.log('🧙 DEBUG - START MEAL BUILDER → McDrive redirect:', {
      userText: String(userText || '').slice(0, 80),
    });
    this.clearMealBuilderWizard();
    return this.startMcdriveWizard(currentState, options);
  }

  /**
   * @deprecated Loop Guidami step-by-step dismesso (causava falso positivo «ho corretto…»).
   * Qualsiasi residuo di stato MEAL_BUILDER viene ripulito e passato a McDrive.
   */
  async processMealBuilderWizardResponse(userText, currentState = {}, options = {}) {
    const text = String(userText || '').trim();
    this.clearMealBuilderWizard();

    if (this.activeWizard === ACTIVE_WIZARD.MCDRIVE_LOOP) {
      if (!text) {
        return {
          ok: true,
          redirected: true,
          intent: 'MCDRIVE_LOOP',
          activeWizard: this.activeWizard,
        };
      }
      return this.processMcdriveWizardResponse(text, currentState, options);
    }

    // Nessun testo: avvio lavagna con messaggio standard.
    if (!text) {
      return this.startMcdriveWizard(currentState, options);
    }

    // Testo presente (residuo Guidami): init silenzioso + parsing McDrive (niente doppio bollo).
    this.clearChipWaitingState();
    this.activeWizard = ACTIVE_WIZARD.MCDRIVE_LOOP;
    this.pendingMcDriveDraft = createEmptyMcDriveDraft();
    this.pendingFreeMealLogContext = null;
    this.conversationState = CONVERSATION_STATE.AWAITING_MCDRIVE_LOOP;
    return this.processMcdriveWizardResponse(text, currentState, options);
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
   * Fonte di verità unica: allinea pendingMealDraft al pasto recuperato dal diario
   * (evita desync UI card vs bozza McDrive / chatHistory precedente).
   */
  stageRecoveredMealDraft(existingMealNode, options = {}) {
    if (!existingMealNode || typeof existingMealNode !== 'object') return null;
    const items = Array.isArray(existingMealNode.items)
      ? existingMealNode.items
        .map((item) => ({
          foodName: String(item?.foodName || item?.name || '').trim(),
          foodDbKey: item?.foodDbKey ?? null,
          grams: Math.round(Number(item?.grams ?? item?.qta) || 0),
          kcal: Math.round(Number(item?.kcal) || 0),
          pro: Number(item?.pro) || 0,
          carbo: Number(item?.carbo) || 0,
          fat: Number(item?.fat) || 0,
          ...(item?.itemId != null ? { itemId: String(item.itemId) } : {}),
        }))
        .filter((item) => item.foodName && item.grams > 0)
      : [];
    if (!items.length) return null;

    const upsertAction = String(options.upsertAction || 'replace').trim() || 'replace';
    const draftPayload = {
      mealType: existingMealNode.mealType || null,
      exactTime: existingMealNode.exactTime || null,
      timeString: existingMealNode.exactTime || existingMealNode.timeString || null,
      items,
      targetNodeId: existingMealNode.targetNodeId || null,
      upsertAction,
      action: upsertAction,
      source: options.source || 'logged_meal_recovered',
    };
    return this.stagePendingMealDraft(draftPayload, {
      uiMessage: options.uiMessage || 'Pasto recuperato.',
      recoveredFromDiary: true,
    });
  }

  /**
   * Risolve la bozza attiva: pendingMealDraft, altrimenti nodo diario in pendingMealUpdate.
   * Mai affidarsi alla sola chatHistory.
   */
  resolveActiveMealDraftPayload() {
    const staged = this.getPendingMealDraft();
    if (staged && expandFoodPayloadItems(staged).length > 0) {
      return staged;
    }
    const node = this.pendingMealUpdate?.existingMealNode;
    if (node && Array.isArray(node.items) && node.items.length > 0) {
      this.stageRecoveredMealDraft(node, {
        upsertAction: 'replace',
        source: 'logged_meal_resync',
      });
      return this.getPendingMealDraft();
    }
    if (this.pendingAction?.commandType === 'ADD_FOOD') {
      const fromAction = this.pendingAction.payload;
      if (expandFoodPayloadItems(fromAction).length > 0) return { ...fromAction };
    }
    return null;
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

    // Mantieni pendingMealUpdate allineato alla bozza mutata (source of truth).
    if (this.pendingMealUpdate?.existingMealNode && items.length > 0) {
      this.setPendingMealUpdate({
        ...this.pendingMealUpdate,
        existingMealNode: {
          ...this.pendingMealUpdate.existingMealNode,
          items,
          mealType: payload.mealType || this.pendingMealUpdate.existingMealNode.mealType,
          exactTime: payload.exactTime || this.pendingMealUpdate.existingMealNode.exactTime,
          targetNodeId: payload.targetNodeId || this.pendingMealUpdate.existingMealNode.targetNodeId,
        },
        targetNodeId: payload.targetNodeId || this.pendingMealUpdate.targetNodeId,
      });
    }

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
          ...(this.mealWizardState.isolatedEdit
            ? { isolatedEdit: { ...this.mealWizardState.isolatedEdit } }
            : {}),
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
   * Fast-Path: non forza più il wizard sequenziale su multi-item.
   * Il wizard resta solo per editing chirurgico isolato (singola riga).
   */
  mustUseSequentialFoodWizard(_payload, _userText = '') {
    return false;
  }

  getFastPathContext(currentState = {}) {
    return {
      personalDb: currentState?.foodDatabase
        || currentState?.trackerFoodDatabase
        || currentState?.personalFoodDb
        || null,
      kentuItDb: currentState?.kentuFoodDb
        || currentState?.kentuItDb
        || currentState?.kentuItDatabase
        || null,
      globalDb: currentState?.globalFoodDb
        || currentState?.kentuGlobalDb
        || currentState?.globalFoodDatabase
        || null,
      offDb: currentState?.offDb
        || currentState?.offDatabase
        || currentState?.openFoodFactsDb
        || null,
      userPortions: sanitizeUserPortionsDict(
        currentState?.userPortions
        || currentState?.nutrition?.userPortions
        || {},
      ),
      userFoodAliases: sanitizeUserFoodAliasesDict(
        currentState?.userFoodAliases
        || currentState?.nutrition?.userFoodAliases
        || {},
      ),
    };
  }

  /**
   * Memorizza mappatura nome parlato → foodDbKey (memoria semantica AI).
   * @param {string} spokenTerm
   * @param {string|null|undefined} foodDbKey
   */
  learnMcDriveFoodAlias(spokenTerm, foodDbKey) {
    const spoken = String(spokenTerm || '').trim();
    const key = String(foodDbKey || '').trim();
    if (!spoken || !key) return;

    const state = this.mcdriveValidationContext?.currentState
      || this.mcdriveContextState
      || {};
    const uid = String(state?.userUid || '').trim();
    const firebaseDb = state?.firebaseDb || state?.db || null;
    if (!uid || !firebaseDb) return;

    learnUserFoodAlias({
      db: firebaseDb,
      uid,
      spokenTerm: spoken,
      foodDbKey: key,
      onLocalMerge: this.onUserFoodAliasesMerge,
    });
  }

  /**
   * Attiva bozza interattiva: le righe della card diventano cliccabili.
   */
  enableMealDraftInteractiveEdit() {
    if (!this.getPendingMealDraft() && this.pendingAction?.commandType !== 'ADD_FOOD') {
      return { ok: false, reason: 'no_pending_draft' };
    }
    this.mealDraftInteractiveEdit = true;
    this.conversationState = CONVERSATION_STATE.AWAITING_CONFIRMATION;
    const text = 'Tocca sulla card l\'alimento che vuoi correggere.';
    this.publishAdviceMessage({
      text,
      spokenText: text,
      mealProposals: null,
      quickReplies: ['Annulla'],
      mealDraftInteractiveEdit: true,
    });
    return {
      ok: true,
      awaiting: true,
      intent: 'MEAL_DRAFT_INTERACTIVE_EDIT',
      mealDraftInteractiveEdit: true,
      conversationState: this.conversationState,
    };
  }

  /**
   * Wizard isolato su UN solo alimento della bozza (dopo click riga).
   * @param {number} itemIndex
   * @param {object} [currentState]
   */
  startIsolatedFoodItemWizard(itemIndex, currentState = {}) {
    const draft = this.getPendingMealDraft()
      || (this.pendingAction?.commandType === 'ADD_FOOD' ? this.pendingAction.payload : null);
    const items = expandFoodPayloadItems(draft || {});
    const idx = Math.round(Number(itemIndex));
    if (!draft || !Number.isFinite(idx) || idx < 0 || idx >= items.length) {
      return { ok: false, reason: 'invalid_item_index' };
    }

    const target = items[idx];
    const spokenName = String(target.spokenFoodName || target.foodName || '').trim();
    if (!spokenName) return { ok: false, reason: 'empty_item' };

    const ctx = this.getWizardContext(currentState);
    const grams = Number(target.grams);
    const state = createMealWizardState({
      pendingItems: [{
        spokenName,
        gramsHint: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null,
        searchKeywords: target.searchKeywords || null,
      }],
      mealType: draft.mealType || null,
      exactTime: draft.exactTime || draft.timeString || null,
      personalDb: ctx.personalDb,
      userPortions: ctx.userPortions,
      isolatedEdit: {
        itemIndex: idx,
        draftBefore: {
          ...draft,
          items: items.map((i) => ({ ...i })),
        },
      },
    });

    this.mealWizardState = state;
    this.mealDraftInteractiveEdit = false;
    // Mantieni pendingMealDraft: il wizard isolato non cancella la bozza globale.
    console.log('🧙 DEBUG - START ISOLATED FOOD WIZARD:', {
      itemIndex: idx,
      spokenName,
    });

    if (state.phase === 'confirm') {
      return this.finishIsolatedFoodItemEdit(state, currentState);
    }

    this.publishWizardItemPrompt(state, { allSpokenNames: [] });
    return {
      ok: true,
      intent: 'MEAL_WIZARD_ISOLATED',
      phase: 'item',
      mealWizardState: this.getMealWizardState(),
    };
  }

  /**
   * Dopo risoluzione isolata: aggiorna la riga nella bozza e ripubblica la card.
   */
  async finishIsolatedFoodItemEdit(wizardState, currentState = {}) {
    const isolated = wizardState?.isolatedEdit;
    const resolved = (wizardState?.resolvedItems || [])[0];
    const draftBefore = isolated?.draftBefore || this.getPendingMealDraft();
    const items = expandFoodPayloadItems(draftBefore || {});
    const idx = Number(isolated?.itemIndex);

    if (resolved && Number.isFinite(idx) && idx >= 0 && idx < items.length) {
      items[idx] = {
        ...items[idx],
        foodName: sanitizeWizardFoodName(resolved.foodName) || resolved.foodName,
        grams: Math.round(Number(resolved.grams) || items[idx].grams || 100),
        foodDbKey: resolved.foodDbKey ?? items[idx].foodDbKey ?? null,
        spokenFoodName: resolved.spokenName || items[idx].spokenFoodName || items[idx].foodName,
        isEstimated: resolved.isEstimated === true,
      };
    }

    const nextPayload = {
      ...(draftBefore || {}),
      items,
    };
    this.clearMealWizardState();
    this.mealDraftInteractiveEdit = false;

    const label = String(resolved?.foodName || items[idx]?.foodName || 'alimento').trim();
    const spokenText = `Ho aggiornato ${label}. Confermi il salvataggio o vuoi modificare qualcosa?`;

    return this.publishMealLogProposalCardDirect(
      nextPayload,
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

  /**
   * @deprecated Fast-Path: non avviare più il wizard batch. Usa publishMealLogProposalCardDirect.
   */
  startSequentialFoodWizard(payload, currentState = {}, userText = '') {
    console.log('🚀 DEBUG - FAST-PATH (skip sequential wizard batch):', {
      items: expandFoodPayloadItems(payload).map((i) => i.foodName),
      userText: String(userText || '').slice(0, 80),
    });
    return this.publishMealLogProposalCardDirect(payload, currentState, userText, [], {
      skipWizard: true,
    });
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
      if (state.isolatedEdit) {
        return this.finishIsolatedFoodItemEdit(state, currentState);
      }
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
        this.publishSystemMessage('Ok, bozza annullata.', { withFallbackMenu: true });
        return { ok: true, cancelled: true, intent: 'MEAL_WIZARD_CANCEL' };
      }
      return this.publishWizardFinalProposalCard(state, currentState);
    }

    // Fase item
    if (/^(?:annulla|cancel|stop)\b/i.test(text)) {
      if (state.isolatedEdit?.draftBefore) {
        this.clearMealWizardState();
        this.mealDraftInteractiveEdit = true;
        const spokenText = 'Ok, nessuna modifica. Tocca un altro alimento oppure conferma il salvataggio.';
        return this.publishMealLogProposalCardDirect(
          state.isolatedEdit.draftBefore,
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
      this.resetConversationState();
      this.publishSystemMessage('Ok, wizard annullato.', { withFallbackMenu: true });
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
      if (nextState.isolatedEdit || state.isolatedEdit) {
        return this.finishIsolatedFoodItemEdit(
          { ...nextState, isolatedEdit: nextState.isolatedEdit || state.isolatedEdit },
          currentState,
        );
      }
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
    const targetNodeId = String(payload?.targetNodeId || '').trim();
    const upsertActionRaw = String(payload?.upsertAction || payload?.action || '').trim();
    const source = String(payload?.source || '').trim();
    const draftPayload = {
      ...normalized,
      items,
      mealType: payload?.mealType || normalized.mealType,
      exactTime: payload?.exactTime || normalized.exactTime,
      timeString: payload?.timeString || normalized.timeString,
      ...(payload?.message ? { message: payload.message } : {}),
      // Critico: normalizeFoodPayload strippa i metadati upsert — re-iniettali.
      ...(targetNodeId ? { targetNodeId } : {}),
      ...(upsertActionRaw
        ? { upsertAction: upsertActionRaw, action: upsertActionRaw }
        : {}),
      ...(source ? { source } : {}),
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

  /**
   * Prima del confirm: se esiste un existingMealNode, la bozza (Vassoio) è il pasto intero
   * aggiornato → forza replace + targetNodeId (niente addMeal / merge-append).
   */
  applyExistingMealReplaceConfirmGuard() {
    const update = this.getPendingMealUpdate();
    const node = update?.existingMealNode;
    const targetNodeId = String(
      node?.targetNodeId || update?.targetNodeId || this.pendingAction?.payload?.targetNodeId || '',
    ).trim();
    if (!targetNodeId) return null;

    const patch = {
      targetNodeId,
      action: 'replace',
      upsertAction: 'replace',
      source: String(this.pendingAction?.payload?.source || node?.source || 'logged_meal_update').trim()
        || 'logged_meal_update',
    };

    if (this.pendingAction?.commandType === 'ADD_FOOD' && this.pendingAction.payload) {
      this.pendingAction = {
        ...this.pendingAction,
        payload: { ...this.pendingAction.payload, ...patch },
      };
    }
    if (this.pendingCommandPayload && this.pendingCommandType === 'ADD_FOOD') {
      this.pendingCommandPayload = { ...this.pendingCommandPayload, ...patch };
    }
    if (this.pendingMealDraft) {
      this.setPendingMealDraft({ ...this.pendingMealDraft, ...patch });
    }
    return patch;
  }

  publishSystemMessage(message, options = {}) {
    const text = String(message || '').trim();
    if (!text) return;
    console.log('🟢 DEBUG - RISPOSTA FINALE PRONTA PER LA UI (publishSystemMessage):', text);
    const quickReplies = Array.isArray(options?.quickReplies)
      ? options.quickReplies
      : null;
    const withFallback = options?.withFallbackMenu === true
      ? getChatFallbackQuickReplies()
      : quickReplies;
    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        message: text,
        text,
        ...(options?.type ? { type: options.type } : {}),
        ...(options?.isSystem === true ? { isSystem: true } : {}),
        ...(options?.systemIcon ? { systemIcon: options.systemIcon } : {}),
        ...(options?.avatarAsset ? { avatarAsset: options.avatarAsset } : {}),
        ...(options?.reportCard && typeof options.reportCard === 'object'
          ? { reportCard: options.reportCard }
          : {}),
        ...(Array.isArray(withFallback) && withFallback.length > 0
          ? { quickReplies: withFallback }
          : {}),
      },
      { source: 'CommandTerminalController' },
    );
  }

  /**
   * Intent Router — report/bollettino telemetrico (zero food parser).
   * @param {string} userText
   * @param {object} currentState
   * @param {object} [options]
   */
  async processReportCommand(userText, currentState = {}, options = {}) {
    const matched = matchReportCommand(userText, {
      intent: options?.intent,
      reportKind: options?.reportKind || options?.kind,
    });
    if (!matched) {
      return { ok: false, reason: 'not_a_report_command' };
    }

    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'REPORT_LOADING',
        text: '',
        message: '',
        reportLoading: true,
        playIntro: true,
        reportSessionId: `report-${Date.now()}`,
        videoSrc: REPORT_ANIMATION_SRC,
        coverSrc: REPORT_COVER_SRC,
        reportCard: {
          title: matched.label,
          markdown: '',
          kind: matched.kind,
          periodLabel: matched.label,
          coverSrc: REPORT_COVER_SRC,
          videoSrc: REPORT_ANIMATION_SRC,
        },
        isSystem: false,
        sourceTag: 'period_report_loading',
        avatarAsset: REPORT_COVER_SRC,
      },
      { source: 'CommandTerminalController' },
    );

    const data = buildPeriodReportData(currentState, matched.kind);
    const fallbackMarkdown = formatPeriodReportMarkdown(data);
    let markdown = fallbackMarkdown;

    try {
      const { adviceMessage } = await this.llmClient.generateConsultantResponse({
        prompt: [
          `Genera il bollettino: ${matched.label}.`,
          `DATI_PERIODO_JSON: ${JSON.stringify(data)}`,
        ].join('\n'),
        systemInstruction: buildReportSystemInstruction(data),
        temperature: 0.35,
        chatHistory: Array.isArray(options?.chatHistory) ? options.chatHistory : [],
        signal: options?.signal || null,
      });
      const polished = String(adviceMessage || '').trim();
      if (polished.length > 40) {
        markdown = polished
          .replace(/!\[[^\]]*\]\([^)]*\)\s*/g, '')
          .trim();
      }
    } catch (error) {
      if (isAbortError(error)) {
        this.publishSystemMessage('Generazione report annullata.');
        return { ok: false, aborted: true, intent: 'GENERATE_PERIOD_REPORT' };
      }
      console.warn('[ReportCommand] LLM failed, using local telemetry markdown', error);
    }

    const reportCard = {
      title: data.title,
      markdown,
      kind: matched.kind,
      periodLabel: data.periodLabel,
      coverSrc: REPORT_COVER_SRC,
      videoSrc: REPORT_ANIMATION_SRC,
      phantomData: buildPhantomDailyReportData({
        dailyLog: Array.isArray(currentState?.activeLog) ? currentState.activeLog : [],
        userTargets: currentState?.userTargets || null,
        healthScore: currentState?.healthScore ?? null,
        userDisplayName: String(
          currentState?.userDisplayName
          || currentState?.userProfile?.displayName
          || currentState?.userProfile?.name
          || '',
        ).trim(),
        insight: markdown.slice(0, 480),
        reportLabel: String(data.title || matched.label || 'DAILY REPORT')
          .replace(/^[^A-Za-z0-9]+/, '')
          .toUpperCase() || 'DAILY REPORT',
        date: currentState?.todayDate || currentState?.activeDate || new Date(),
      }),
    };

    this.bus.publish(
      DISPATCH_SYSTEM_MESSAGE,
      {
        type: 'PERIOD_REPORT',
        text: markdown,
        message: markdown,
        displayText: markdown,
        isSystem: false,
        sourceTag: 'period_report',
        systemIcon: 'macro',
        avatarAsset: REPORT_COVER_SRC,
        playIntro: true,
        videoSrc: REPORT_ANIMATION_SRC,
        coverSrc: REPORT_COVER_SRC,
        reportCard,
      },
      { source: 'CommandTerminalController' },
    );

    return {
      ok: true,
      intent: 'GENERATE_PERIOD_REPORT',
      reportKind: matched.kind,
      commandType: 'PERIOD_REPORT',
    };
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
    // Fast-Path: vai diretto alla card (wizard solo su edit isolato).
    return this.publishMealLogProposalCardDirect(payload, currentState, userText, [], {
      skipWizard: true,
      upsertAction: 'append',
      uiMessage: options.uiMessage,
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
      const msg = String(next.payload.message || '').trim();
      // Adaptive UI: tieni Speed / Step-by-Step brevi; scarta referti/budget.
      const looksFormalOrBudget = /budget|cilindr|rimanente|delta|metabol|sforamento|traiettoria/i.test(msg);
      const tooLongForChat = msg.length > 160;
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
        ...(options?.resolveMcDriveTray === true ? { resolveMcDriveTray: true } : {}),
      },
      { source: 'CommandTerminalController' },
    );
    return mealReceipt;
  }

  buildChatFoodPipelineContext(currentState = {}, mealType = null) {
    return {
      saveFoodEntryPer100ToFoodDb: this.onSaveFoodEntryPer100ToFoodDb,
      foodDb: currentState?.foodDatabase
        || currentState?.trackerFoodDatabase
        || currentState?.personalFoodDb
        || {},
      fullHistory: currentState?.fullHistory || {},
      mealType: mealType || null,
      kentuItDb: currentState?.kentuItDatabase || currentState?.kentuFoodDb || null,
      globalDb: currentState?.globalFoodDatabase || currentState?.globalFoodDb || null,
    };
  }

  syncEnrichedPayloadItem(enrichedPayload, proposalItemIndex, updatedItem) {
    if (!enrichedPayload || proposalItemIndex == null || !updatedItem) return enrichedPayload;
    const rawItems = expandFoodPayloadItems(enrichedPayload);
    if (proposalItemIndex < 0 || proposalItemIndex >= rawItems.length) return enrichedPayload;
    rawItems[proposalItemIndex] = {
      ...rawItems[proposalItemIndex],
      foodName: updatedItem.foodName,
      grams: updatedItem.grams,
      ...(updatedItem.foodDbKey != null ? { foodDbKey: updatedItem.foodDbKey } : {}),
      ...(updatedItem.icon ? { icon: updatedItem.icon } : {}),
      ...(updatedItem.isNewFood === true ? { isNewFood: true } : {}),
      pendingUsdaEnrichment: false,
    };
    return { ...enrichedPayload, items: rawItems };
  }

  processNextUsdaEnrichment() {
    const state = this.suspendedMealPublication;
    if (!state) return;

    while (state.currentIndex < state.pendingIndices.length) {
      const proposalItemIndex = state.pendingIndices[state.currentIndex];
      const item = state.proposal?.items?.[proposalItemIndex];
      if (!item?.pendingUsdaEnrichment) {
        state.currentIndex += 1;
        continue;
      }

      if (typeof this.onRequestUsdaEnrichment !== 'function') {
        state.currentIndex += 1;
        continue;
      }

      this.onRequestUsdaEnrichment({
        foodName: String(item.foodName || item.name || '').trim(),
        item,
        proposalItemIndex,
        kentuItDb: state.currentState?.kentuItDatabase
          || state.currentState?.kentuItDb
          || state.currentState?.kentuFoodDb
          || null,
        personalDb: state.currentState?.foodDatabase
          || state.currentState?.trackerFoodDatabase
          || state.currentState?.personalFoodDb
          || null,
        globalDb: state.currentState?.globalFoodDatabase
          || state.currentState?.globalDb
          || null,
        offDb: state.currentState?.offDb
          || state.currentState?.offDatabase
          || null,
        resume: (usdaMatch) => this.resumeChatUsdaEnrichment(usdaMatch),
      });
      return;
    }

    void this.finishSuspendedMealPublication();
  }

  async resumeChatUsdaEnrichment(usdaMatch) {
    const state = this.suspendedMealPublication;
    if (!state) {
      return { ok: false, reason: 'no_suspended_publication' };
    }

    const proposalItemIndex = state.pendingIndices[state.currentIndex];
    const item = state.proposal?.items?.[proposalItemIndex];
    if (!item) {
      return { ok: false, reason: 'missing_suspended_item' };
    }

    try {
      const updated = await applyChatUsdaEnrichmentResult(
        item,
        usdaMatch,
        this.buildChatFoodPipelineContext(state.currentState, state.proposal?.mealType),
      );
      state.proposal.items[proposalItemIndex] = updated;
      state.proposal.totals = sumMealItemsMacros(state.proposal.items);
      state.enrichedPayload = this.syncEnrichedPayloadItem(
        state.enrichedPayload,
        proposalItemIndex,
        updated,
      );
    } catch (error) {
      console.warn('[CommandTerminalController] resumeChatUsdaEnrichment failed', error);
    }

    state.currentIndex += 1;
    if (state.currentIndex < state.pendingIndices.length) {
      this.processNextUsdaEnrichment();
      return { ok: true, continued: true };
    }

    return this.finishSuspendedMealPublication();
  }

  async finishSuspendedMealPublication() {
    const state = this.suspendedMealPublication;
    if (!state) {
      return { ok: false, reason: 'no_suspended_publication' };
    }

    this.suspendedMealPublication = null;

    const {
      proposal,
      enrichedPayload,
      userText,
      options = {},
      butler = {},
      summaryText,
      spokenText,
      fromVoice,
    } = state;

    this.mealDraftInteractiveEdit = false;
    const items = expandFoodPayloadItems(enrichedPayload);

    if (fromVoice && typeof this.onPopulateMealLavagna === 'function') {
      const lavagnaItems = (proposal?.items || items).map((item, idx) => ({
        foodName: item.foodName,
        name: item.foodName,
        grams: item.grams,
        qty: item.grams,
        foodDbKey: item.foodDbKey ?? null,
        matchedKey: item.foodDbKey ?? null,
        icon: item.icon,
        spokenFoodName: item.spokenFoodName,
      }));
      const lavagnaOk = this.onPopulateMealLavagna({
        items: lavagnaItems,
        mealType: enrichedPayload?.mealType || null,
        exactTime: enrichedPayload?.exactTime || enrichedPayload?.timeString || null,
        message: summaryText,
      });
      if (lavagnaOk !== false) {
        if (typeof this.clearPendingMealDraft === 'function') {
          this.clearPendingMealDraft();
        }
        this.conversationState = CONVERSATION_STATE.IDLE;
        this.publishAdviceMessage({
          text: summaryText,
          spokenText,
          mealProposals: null,
          quickReplies: [],
        });
        return {
          ok: true,
          intent: 'ADD_FOOD',
          mealLavagna: true,
          userNotified: true,
          sourceText: String(userText || '').trim() || null,
          fastPath: true,
          awaitingConfirmation: false,
          fromVoice: true,
        };
      }
    }

    const stagedItems = draftItemsFromProposalItems(proposal?.items);
    this.stagePendingMealDraft({
      ...enrichedPayload,
      items: stagedItems.length > 0
        ? stagedItems
        : expandFoodPayloadItems(enrichedPayload),
      mealType: proposal?.mealType || enrichedPayload?.mealType,
      exactTime: proposal?.exactTime || enrichedPayload?.exactTime || enrichedPayload?.timeString,
    }, {
      uiMessage: summaryText,
      sourceText: String(userText || '').trim() || null,
    });

    this.publishAdviceMessage({
      text: summaryText,
      spokenText,
      mealProposals: [proposal],
      quickReplies: [...MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES],
      mealDraftInteractiveEdit: false,
    });

    return {
      ok: true,
      intent: 'ADD_FOOD',
      mealProposals: [proposal],
      userNotified: true,
      sourceText: String(userText || '').trim() || null,
      fastPath: true,
      awaitingConfirmation: true,
      pendingMealDraft: this.getPendingMealDraft(),
    };
  }

  async publishMealLogProposalCardDirect(payload, currentState = {}, userText = '', chatHistory = [], options = {}) {
    // Fast-Path: mai più wizard batch — solo card riepilogo (wizard solo su edit isolato).
    void options?.skipWizard;

    const fromVoiceCorrection = options?.fromVoiceCorrection === true;
    let workingPayload = payload;

    if (!fromVoiceCorrection) {
      // Auto-risoluzione silenziosa: Top Hit per ogni alimento + grammi espliciti/storici.
      const fast = fastPathResolveMealPayload(workingPayload, this.getFastPathContext(currentState));
      workingPayload = fast.payload;
      console.log('🚀 DEBUG - FAST-PATH RESOLVED:', {
        items: fast.items.map((i) => ({
          spoken: i.spokenFoodName,
          food: i.foodName,
          grams: i.grams,
          key: i.foodDbKey,
        })),
      });
    }

    // Dopo fast-path / correzione: non ri-mappare abitudini (rispetta Top Hit / edit).
    const butler = fromVoiceCorrection || workingPayload?.items?.some?.((i) => i?.fastPath)
      ? {
          payload: workingPayload,
          butlerMeta: null,
          requestPhotoFor: null,
          butlerMessage: String(options.uiMessage || workingPayload?.message || '').trim(),
        }
      : this.applyButlerMealEnrichment(workingPayload, currentState);
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

    const enrichedPayload = butler.payload || workingPayload;
    const conversationTexts = buildConversationTextsFromChatHistory(chatHistory, userText);
    const mergeIntoExisting = isMergeIntoExistingMealIntent(userText);
    const proposal = buildMealLogProposalFromPayload(
      {
        ...enrichedPayload,
        // Pasto nuovo da NLP: slot ghost autonomo. «Aggiungi al pranzo» → merge (niente force).
        ...(mergeIntoExisting
          ? { forceNewMealSlot: false, action: enrichedPayload?.action || 'merge', upsertAction: enrichedPayload?.upsertAction || 'merge' }
          : { forceNewMealSlot: enrichedPayload?.forceNewMealSlot !== false }),
      },
      currentState,
      {
        userText,
        conversationTexts,
        ...(mergeIntoExisting ? { allowCanonicalSlotMerge: true } : {}),
      },
    );
    if (!proposal) {
      this.publishErrorMessage(USER_FACING_PARSE_ERROR_MESSAGE);
      return { ok: false, reason: 'meal_log_proposal_build_failed', userNotified: true };
    }

    if (Array.isArray(proposal.items) && proposal.items.length > 0) {
      try {
        const pipelineResult = await processUnresolvedChatFoods(proposal.items, {
          ...this.buildChatFoodPipelineContext(currentState, proposal.mealType || enrichedPayload?.mealType),
        });
        proposal.items = pipelineResult.items;
        proposal.totals = sumMealItemsMacros(pipelineResult.items);
        if (pipelineResult.savedCount > 0 || pipelineResult.pendingUsdaCount > 0) {
          console.log('🍽️ DEBUG - chatNewFoodPipeline:', {
            savedCount: pipelineResult.savedCount,
            pendingUsdaCount: pipelineResult.pendingUsdaCount,
          });
        }
      } catch (error) {
        console.warn('[CommandTerminalController] chatNewFoodPipeline failed', error);
      }
    }

    const pendingUsdaIndices = collectPendingUsdaEnrichmentIndices(proposal.items);
    const items = expandFoodPayloadItems(enrichedPayload);
    const fromVoice = options?.fromVoice === true;
    const adaptiveFallback = buildAdaptiveLavagnaSpokenText(items);
    const fromPayload = String(options.uiMessage || enrichedPayload?.message || '').trim();
    const summaryText = fromVoice
      ? (fromPayload || butler.butlerMessage || adaptiveFallback)
      : (fromPayload
        || butler.butlerMessage
        || buildFastPathSummarySpokenText(items));
    const spokenText = String(options.spokenText || summaryText).trim();

    if (pendingUsdaIndices.length > 0 && typeof this.onRequestUsdaEnrichment === 'function') {
      this.suspendedMealPublication = {
        proposal: {
          ...proposal,
          items: Array.isArray(proposal.items) ? proposal.items.map((item) => ({ ...item })) : [],
        },
        enrichedPayload: {
          ...enrichedPayload,
          items: Array.isArray(enrichedPayload?.items)
            ? enrichedPayload.items.map((item) => ({ ...item }))
            : items.map((item) => ({ ...item })),
        },
        userText,
        chatHistory,
        options,
        butler,
        summaryText,
        spokenText,
        fromVoice,
        currentState,
        pendingIndices: pendingUsdaIndices,
        currentIndex: 0,
      };
      this.processNextUsdaEnrichment();
      return {
        ok: true,
        intent: 'ADD_FOOD',
        awaitingUsdaEnrichment: true,
        userNotified: false,
        sourceText: String(userText || '').trim() || null,
        fastPath: true,
      };
    }

    this.mealDraftInteractiveEdit = false;

    // Nota vocale + lavagna aperta: popola FastMealLogger, NESSUN auto-save / pending confirm.
    if (fromVoice && typeof this.onPopulateMealLavagna === 'function') {
      const lavagnaOk = this.onPopulateMealLavagna({
        items,
        mealType: enrichedPayload?.mealType || null,
        exactTime: enrichedPayload?.exactTime || enrichedPayload?.timeString || null,
        message: summaryText,
      });
      if (lavagnaOk !== false) {
        if (typeof this.clearPendingMealDraft === 'function') {
          this.clearPendingMealDraft();
        }
        this.conversationState = CONVERSATION_STATE.IDLE;
        this.publishAdviceMessage({
          text: summaryText,
          spokenText,
          mealProposals: null,
          quickReplies: [],
        });
        return {
          ok: true,
          intent: 'ADD_FOOD',
          mealLavagna: true,
          userNotified: true,
          sourceText: String(userText || '').trim() || null,
          fastPath: true,
          awaitingConfirmation: false,
          fromVoice: true,
        };
      }
    }

    // McDrive: bozza in sospeso — allinea pending agli item della proposal (macro + foodDbKey).
    const stagedItems = draftItemsFromProposalItems(proposal?.items);
    this.stagePendingMealDraft({
      ...enrichedPayload,
      items: stagedItems.length > 0
        ? stagedItems
        : expandFoodPayloadItems(enrichedPayload),
      mealType: proposal?.mealType || enrichedPayload?.mealType,
      exactTime: proposal?.exactTime || enrichedPayload?.exactTime || enrichedPayload?.timeString,
    }, {
      uiMessage: summaryText,
      sourceText: String(userText || '').trim() || null,
    });

    this.publishAdviceMessage({
      text: summaryText,
      spokenText,
      mealProposals: [proposal],
      quickReplies: [...MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES],
      mealDraftInteractiveEdit: false,
    });

    return {
      ok: true,
      intent: 'ADD_FOOD',
      mealProposals: [proposal],
      userNotified: true,
      sourceText: String(userText || '').trim() || null,
      fastPath: true,
      awaitingConfirmation: true,
      pendingMealDraft: this.getPendingMealDraft(),
    };
  }

  async publishMealLogProposalCard(payload, currentState = {}, userText = '', chatHistory = [], options = {}) {
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

    if (this.activeWizard === ACTIVE_WIZARD.MCDRIVE_LOOP) {
      const forced = String(options?.intent || '').trim().toUpperCase();
      if (forced === 'SET_MCDRIVE_MEAL_TYPE') return 'SET_MCDRIVE_MEAL_TYPE';
      if (forced === 'ADD_MORE_MCDRIVE') return 'ADD_MORE_MCDRIVE';
      if (forced === 'SAVE_MCDRIVE_MEAL' || isMcdriveSaveConfirmCommand(userText)) {
        return 'SAVE_MCDRIVE_MEAL';
      }
      if (forced === 'FINISH_MCDRIVE_WIZARD' || isMcdriveFinishCommand(userText)) {
        return 'FINISH_MCDRIVE_WIZARD';
      }
      if (forced === 'CANCEL_MCDRIVE_WIZARD' || isMcdriveCancelCommand(userText)) {
        return 'CANCEL_MCDRIVE_WIZARD';
      }
      return 'MCDRIVE_LOOP';
    }

    if (isGenericMealLogIntentOnly(userText)) {
      return 'FREE_MEAL_LISTEN';
    }

    // «Guidami» / meal builder testuale → stesso ingresso McDrive (niente loop step).
    if (isMealBuilderWizardTrigger(userText)) {
      return 'START_MCDRIVE_WIZARD';
    }

    // Residuo stato MEAL_BUILDER (sessioni vecchie): tratta come McDrive.
    if (
      this.activeWizard === ACTIVE_WIZARD.MEAL_BUILDER
      && !isUnrelatedCommandDuringMealBuilder(userText)
      && !isPriorityFreeTextMealLog(userText)
    ) {
      return 'START_MCDRIVE_WIZARD';
    }

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

    // Coach Vassoio: domanda discorsiva su come completare la bozza attiva.
    const activeDraftItems = expandFoodPayloadItems(this.getPendingMealDraft() || {});
    if (activeDraftItems.length > 0 && isAskDraftAdviceIntent(userText)) {
      return 'ASK_DRAFT_ADVICE';
    }

    // DATA ENTRY pasti PRIMA del consulto (evita "come snack, ho mangiato…" → CHAT_RESPONSE).
    // Caffè puro → flusso stimolante (Amaro/Zuccherato), non USDA.
    if (isCoffeeLogIntent(userText)) {
      return 'LOG_COFFEE';
    }

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
      pendingMealDraft: this.getPendingMealDraft(),
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

    const mealType = parsed.mealType
      || options?.mealTypeHint
      || null;

    const payload = normalizeFoodPayload(
      {
        items: parsed.items,
        mealType,
        ...(parsed.exactTime ? { exactTime: parsed.exactTime, timeString: parsed.exactTime } : {}),
      },
      currentState,
      { inferMealTypeFromContext: !options?.mealTypeHint },
    );

    return this.publishMealLogProposalCard(payload, currentState, userText, chatHistory, options);
  }

  /**
   * McDrive: chip inserimento libero / spuntino — ascolto attivo, zero previsione storica.
   * @param {string|null} [mealTypeHint]
   * @param {object} [options]
   */
  startFreeMealListen(mealTypeHint = null, options = {}) {
    void options;
    this.clearChipWaitingState();
    this.conversationState = CONVERSATION_STATE.AWAITING_FREE_MEAL_LOG;
    this.pendingFreeMealLogContext = {
      mealType: mealTypeHint || null,
    };
    const message = 'Perfetto, dimmi pure cosa hai mangiato.';
    this.publishSystemMessage(message);
    return {
      ok: true,
      intent: 'FREE_MEAL_LISTEN',
      awaitingFreeText: true,
      conversationState: this.conversationState,
    };
  }

  /**
   * Input libero dopo startFreeMealListen → parsing NLP standard (ADD_FOOD).
   * @param {string} userText
   * @param {object} currentState
   * @param {object} options
   */
  async processFreeMealLogInput(userText, currentState = {}, options = {}) {
    const text = String(userText || '').trim();
    const mealTypeHint = this.pendingFreeMealLogContext?.mealType || options?.mealTypeHint || null;
    this.conversationState = CONVERSATION_STATE.IDLE;
    this.pendingFreeMealLogContext = null;

    if (/^(?:annulla|cancel|stop)\b/i.test(text)) {
      this.publishSystemMessage('Ok, quando vuoi registrare dimmi pure cosa hai mangiato.', {
        withFallbackMenu: true,
      });
      return { ok: true, cancelled: true, intent: 'FREE_MEAL_LISTEN' };
    }

    if (!text) {
      return this.startFreeMealListen(mealTypeHint, options);
    }

    return this.processUserMessageCore(text, currentState, {
      ...options,
      intent: undefined,
      mealTypeHint,
      fromFreeMealListen: true,
      skipFreeMealListenGate: true,
    });
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
      // Nuovo alimento da chat: bypass foto etichetta — pipeline USDA/macro intercetta dopo.
      if (item.isNewFood === true) continue;
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

    if (meta.quickEventConfirm && typeof meta.quickEventConfirm === 'object') {
      this.bus.publish(
        DISPATCH_SYSTEM_MESSAGE,
        {
          type: 'QUICK_EVENT_CONFIRM',
          text: meta.quickEventConfirm.title || meta.uiMessage || 'Evento registrato',
          message: meta.quickEventConfirm.title || meta.uiMessage || 'Evento registrato',
          displayText: meta.quickEventConfirm.title || meta.uiMessage || 'Evento registrato',
          quickEventConfirm: meta.quickEventConfirm,
          isSystem: true,
        },
        { source: 'CommandTerminalController' },
      );
    } else if (meta.uiMessage) {
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
        quickReplies: Array.isArray(options.quickReplies) ? options.quickReplies : [],
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
    const current = items[index];
    const oldGrams = Math.round(Number(current?.grams ?? current?.qty) || 0);
    let scaled = { ...current, grams: nextGrams };
    if (oldGrams > 0 && oldGrams !== nextGrams) {
      const ratio = nextGrams / oldGrams;
      const scaleMacro = (value) => Math.round((Number(value) || 0) * ratio * 10) / 10;
      scaled = {
        ...scaled,
        kcal: scaleMacro(current.kcal),
        pro: scaleMacro(current.pro),
        carbo: scaleMacro(current.carbo),
        fat: scaleMacro(current.fat),
      };
    }
    items[index] = {
      ...scaled,
      wasEstimated: current.isEstimated === true || current.wasEstimated === true,
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
    this.applyExistingMealReplaceConfirmGuard();
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
        originUserText: this.pendingWorkoutOriginUserText || '',
      };
      this.resetConversationState();

      const { uiMessage: _uiMessage, ...execMeta } = snapshot.meta;
      const cmd = snapshot.commandType;
      const isFood = cmd === 'ADD_FOOD';
      if (
        cmd === 'ADD_WORKOUT'
        && !execMeta.quickEventConfirm
      ) {
        const locomotionKind = resolveLocomotionConfirmKind({
          kind: 'workout',
          workoutType: snapshot.payload?.workoutType,
          activityType: snapshot.payload?.activityType,
          subType: snapshot.payload?.subType,
          workoutName: snapshot.payload?.workoutName,
          title: snapshot.payload?.workoutName,
          desc: snapshot.originUserText,
        });
        if (locomotionKind) {
          execMeta.quickEventConfirm = buildQuickEventConfirmPayload(locomotionKind, {
            workoutType: snapshot.payload?.workoutType,
            workoutName: snapshot.payload?.workoutName,
            subtitle: _uiMessage || undefined,
          });
        }
      }
      const correlationId = snapshot.draftId
        ? (isFood ? `meal_draft_confirm_${snapshot.draftId}` : `workout_draft_confirm_${snapshot.draftId}`)
        : (isFood ? `meal_confirm_${Date.now()}` : `workout_confirm_${Date.now()}`);
      const result = this.dispatchCommand(snapshot.commandType, snapshot.payload, {
        ...execMeta,
        requiresConfirmation: false,
        correlationId,
        dedupeKey: {
          commandType: snapshot.commandType,
          draftId: snapshot.draftId,
          mealCommit: isFood ? 'pending_food_draft' : null,
          payload: snapshot.payload,
        },
        dedupeWindowMs: isFood ? 5000 : 1200,
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
        this.publishSystemMessage('Inserimento annullato.', { withFallbackMenu: true });
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
      this.publishSystemMessage('Inserimento annullato.', { withFallbackMenu: true });
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
    const draft = this.resolveActiveMealDraftPayload();

    if (!draft || expandFoodPayloadItems(draft).length === 0) {
      this.resetConversationState();
      return this.processUserMessage(text, currentState, options);
    }

    // Coach proattivo: domanda su come completare il Vassoio (non mutazione diretta).
    if (isAskDraftAdviceIntent(text)) {
      return this.handleDraftAdviceRequest(text, currentState, options);
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

    // «Modifica» nudo → attiva bozza interattiva (righe cliccabili), non UPDATE vocale.
    if (/^modifica\b/i.test(text) && !/\d/.test(text) && text.length <= 24) {
      return this.enableMealDraftInteractiveEdit();
    }

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
      this.publishSystemMessage('Ok, bozza annullata. Dimmi pure quando vuoi registrare di nuovo.', {
        withFallbackMenu: true,
      });
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
      // Coach Vassoio prima del fallback generico «Dimmi la correzione…».
      if (isAskDraftAdviceIntent(text)) {
        return this.handleDraftAdviceRequest(text, currentState, options);
      }

      // Nuova registrazione indipendente mentre la bozza è aperta → riparti pulito.
      if (
        (isConsumedMealLogDescription(text) || looksLikeComplexMealLog(text))
        && !isUpdateMealDraftIntent(text)
        && !looksLikeClearMealDraftMutation(text)
      ) {
        this.resetConversationState();
        return this.processUserMessage(text, currentState, options);
      }

      // Ultimo tentativo merge locale (varianti soft / filler) prima del fallback.
      const looseApply = applyVoiceCorrectionToMealDraft(draft, text);
      if (looseApply.ok) {
        const voiceMessage = buildMcDriveUpdatedConfirmationMessage(
          expandFoodPayloadItems(looseApply.payload),
        );
        const published = await this.republishMealDraftAfterVoiceEdit(
          looseApply.payload,
          currentState,
          {
            spokenText: voiceMessage,
            userText: text,
            chatHistory: options?.chatHistory || [],
          },
        );
        return {
          ...published,
          intent: UPDATE_MEAL_DRAFT,
          commandType: UPDATE_MEAL_DRAFT,
        };
      }

      // Entità già presenti (aggiungi/togli/olio/…) → MAI prompt generico «Dimmi la correzione».
      if (looksLikeClearMealDraftMutation(text)) {
        this.conversationState = CONVERSATION_STATE.AWAITING_CONFIRMATION;
        this.publishSystemMessage(
          'Non sono riuscito ad aggiornare la bozza con quella richiesta. Ripeti tipo «aggiungi 10g di olio» o «togli il riso».',
        );
        return {
          ok: true,
          awaiting: true,
          intent: UPDATE_MEAL_DRAFT,
          reason: 'clear_mutation_unparsed',
          conversationState: this.conversationState,
        };
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
      if (looksLikeClearMealDraftMutation(correctionText)) {
        this.publishSystemMessage(
          'Non sono riuscito ad aggiornare la bozza con quella richiesta. Ripeti tipo «aggiungi 10g di olio» o «togli il riso».',
        );
      } else {
        this.publishSystemMessage(
          "Non ho colto la correzione. Prova tipo «metti 80 grammi», «togli il pomodoro», «era rosetta», oppure «sì» per salvare.",
        );
      }
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
    // Fast-Path: bozza interattiva diretta (niente wizard batch).
    const normalized = normalizeFoodPayload(partialPayload, currentState, {
      inferMealTypeFromContext: false,
      ...options,
    });
    return this.publishMealLogProposalCardDirect(normalized, currentState, userText, [], {
      skipWizard: true,
    });
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
    // Allinea McDrive draft al nodo diario (source of truth), non alla chatHistory.
    this.stageRecoveredMealDraft(existingMealNode, {
      upsertAction: 'replace',
      source: 'logged_meal_update_preview',
      uiMessage: buildUpdateWaitingPromptMessage(targetMealType),
    });
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

  /**
   * Registra caffè (stimulant node) — Amaro 0 kcal o Zuccherato +20 kcal/+5g CHO.
   */
  commitCoffeeLog(variant, timeDecimal, currentState = {}, options = {}) {
    const hoursFasted = Number(
      currentState?.metabolicSnapshot?.activeFastingStatus?.hoursSinceLastMeal
      ?? currentState?.metabolicSnapshot?.hoursSinceLastMeal
      ?? currentState?.healthScoreMetrics?.hoursFasted,
    );
    const inFastingWindow = isInActiveFastingWindow(hoursFasted)
      || currentState?.metabolicSnapshot?.activeFastingStatus?.isFastingActive === true;
    const node = buildCoffeeStimulantNode(variant, timeDecimal, {
      coffeeType: options.coffeeType || options.type,
      type: options.coffeeType || options.type,
      sugar: variant === COFFEE_VARIANT.ZUCCHERATO,
    });
    const ack = buildCoffeeLogAckMessage(variant, { hoursFasted, inFastingWindow });

    this.resetConversationState();
    const quickEventConfirm = buildQuickEventConfirmPayload('coffee', { subtitle: ack });

    this.dispatchCommand('LOG_STIMULANT', node, {
      // Media in chat: titolo + subtitle (ack digiuno); niente bolla solo testo.
      uiMessage: '',
      quickEventConfirm: quickEventConfirm
        ? { ...quickEventConfirm, subtitle: ack }
        : null,
      fastingContext: buildFastingContextForLlm({
        hoursFasted,
        manualNodes: [
          ...(Array.isArray(currentState?.manualNodes) ? currentState.manualNodes : []),
          node,
        ],
        fastingBrokenBySweetCoffee: variant === COFFEE_VARIANT.ZUCCHERATO && inFastingWindow,
        bitterCoffeeDuringFast: variant === COFFEE_VARIANT.AMARO && inFastingWindow,
        phaseName: currentState?.metabolicSnapshot?.activeFastingStatus?.phaseLabel
          ?? currentState?.metabolicSnapshot?.phase?.label
          ?? currentState?.fastingData?.phaseName
          ?? null,
        phaseId: currentState?.metabolicSnapshot?.activeFastingStatus?.phaseId
          ?? currentState?.metabolicSnapshot?.phase?.id
          ?? null,
        metabolicSnapshot: currentState?.metabolicSnapshot ?? null,
      }),
    });

    return {
      ok: true,
      intent: 'LOG_COFFEE',
      commandType: 'LOG_STIMULANT',
      variant,
      node,
    };
  }

  processCoffeeVariantResponse(userText, currentState = {}, options = {}) {
    const text = String(userText || '').trim();
    if (/^(?:annulla|cancel|stop)\b/i.test(text)) {
      this.pendingCoffeeLog = null;
      this.resetConversationState();
      this.publishSystemMessage('Registrazione caffè annullata.');
      return { ok: true, cancelled: true, intent: 'LOG_COFFEE' };
    }

    const variant = resolveCoffeeVariantFromText(text);
    if (!variant) {
      this.publishClarification(
        {
          uiMessage: '☕ Scegli sotto: Amaro (digiuno OK) o Zuccherato (+20 kcal).',
          payload: {
            message: '☕ Scegli sotto: Amaro (digiuno OK) o Zuccherato (+20 kcal).',
            options: [...COFFEE_VARIANT_QUICK_REPLIES],
          },
        },
        text,
      );
      return { ok: true, awaiting: true, intent: 'LOG_COFFEE' };
    }

    const time = Number(this.pendingCoffeeLog?.time)
      ?? Number(currentState?.decimalHour)
      ?? 8;
    this.pendingCoffeeLog = null;
    return this.commitCoffeeLog(variant, time, currentState);
  }

  handleCoffeeLogRequest(userText, currentState = {}, options = {}) {
    const text = String(userText || '').trim();
    const presetVariant = resolveCoffeeVariantFromText(text);
    const time = Number(currentState?.decimalHour) || 8;

    if (presetVariant) {
      return this.commitCoffeeLog(presetVariant, time, currentState);
    }

    this.conversationState = CONVERSATION_STATE.AWAITING_COFFEE_VARIANT;
    this.pendingCoffeeLog = { originText: text, time };
    this.publishClarification(
      {
        uiMessage: '☕ Caffè — come l\'hai preso? Il digiuno resta attivo solo con caffè amaro.',
        payload: {
          message: '☕ Caffè — come l\'hai preso? Il digiuno resta attivo solo con caffè amaro.',
          options: [...COFFEE_VARIANT_QUICK_REPLIES],
        },
      },
      text,
    );
    return {
      ok: true,
      intent: 'LOG_COFFEE',
      commandType: 'ASK_CLARIFICATION',
      awaiting: true,
    };
  }

  /**
   * Diagnosi avatar Health Score — risposta in prima persona sui malus maggiori.
   */
  async handleHealthDiagnosisRequest(userText, currentState = {}, options = {}) {
    const healthResult = currentState?.healthScore
      && typeof currentState.healthScore === 'object'
      ? currentState.healthScore
      : calculateHealthScore(
        currentState?.healthScoreMetrics || {},
        Boolean(currentState?.isTrainingDay),
      );

    const metabolicSnapshot = currentState?.metabolicSnapshot
      && typeof currentState.metabolicSnapshot === 'object'
      ? currentState.metabolicSnapshot
      : null;

    const displayName = resolveUserDisplayName(currentState?.userProfile)
      || String(currentState?.userDisplayName || '').trim();
    const chatHistory = Array.isArray(options?.chatHistory) ? options.chatHistory : [];
    const diagnosisContext = buildHealthDiagnosisPromptContext(healthResult, metabolicSnapshot);
    const phaseLabel = String(
      metabolicSnapshot?.phase?.label
      || metabolicSnapshot?.phase?.name
      || currentState?.fastingData?.phaseName
      || '',
    ).trim();
    const hoursFasted = Number(
      metabolicSnapshot?.hoursSinceLastMeal
      ?? currentState?.healthScoreMetrics?.hoursFasted
      ?? currentState?.fastingData?.hoursFasted,
    );
    const systemInstruction = [
      buildChatPersonaSystemBlock({ displayName }),
      HEALTH_DIAGNOSIS_SYSTEM_BLOCK,
      diagnosisContext,
      String(options?.systemInstructionExtra || '').trim(),
    ].filter(Boolean).join('\n\n');

    const prompt = [
      'L\'utente ha toccato il mio avatar Health Score nell\'header.',
      'Formula la diagnosi in prima persona (2 frasi max) basata sul Monitor Metabolico + breakdown malus.',
      `Score attuale: ${healthResult?.score ?? 'n/d'} · Stato avatar: ${healthResult?.avatar?.label || 'n/d'}.`,
      phaseLabel
        ? `Monitor Metabolico (fonte di verità): fase «${phaseLabel}» · ore dall'ultimo pasto calorico: ${
          Number.isFinite(hoursFasted) ? `${Math.round(hoursFasted * 10) / 10}h` : 'n/d'
        }.`
        : '',
      userText ? `Nota utente: ${String(userText).trim()}` : '',
    ].filter(Boolean).join('\n');

    try {
      const { adviceMessage } = await this.llmClient.generateConsultantResponse({
        prompt,
        systemInstruction,
        temperature: 0.4,
        chatHistory,
        ...(options?.signal ? { signal: options.signal } : {}),
      });
      const text = String(adviceMessage || '').trim()
        || 'Ho poca energia oggi — aiutami a recuperare: un pasto bilanciato ci rimetterà in carreggiata.';

      return this.publishChatResponse(
        {
          uiMessage: text,
          adviceMessage: text,
          payload: { message: text },
          requiresConfirmation: false,
        },
        userText,
        { local: false },
      );
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.error('[CommandTerminalController] handleHealthDiagnosisRequest failed', error);
      this.publishSystemMessage(
        'Non riesco a leggere il mio stato adesso. Riprova tra un attimo.',
      );
      return { ok: false, reason: 'health_diagnosis_failed', userNotified: true };
    }
  }

  /**
   * Coach proattivo — suggerimenti per completare il Vassoio (bozza pasto attiva).
   * Non modifica né chiude la bozza; espone smart chips tap-to-add.
   */
  async handleDraftAdviceRequest(userText, currentState = {}, options = {}) {
    const draft = this.resolveActiveMealDraftPayload();
    if (!draft || expandFoodPayloadItems(draft).length === 0) {
      this.publishSystemMessage('Non trovo una bozza pasto attiva da completare.');
      return { ok: false, reason: 'no_active_draft' };
    }

    let adviceContext;
    try {
      adviceContext = await buildDraftAdviceContext(userText, currentState, draft);
    } catch (error) {
      console.error('[CommandTerminalController] buildDraftAdviceContext failed', error);
      this.publishSystemMessage('Non riesco a leggere la bozza. Riprova tra poco.');
      return { ok: false, reason: 'draft_advice_context_failed', userNotified: true };
    }

    const displayName = resolveUserDisplayName(currentState?.userProfile)
      || String(currentState?.userDisplayName || '').trim();
    const chatHistory = Array.isArray(options?.chatHistory) ? options.chatHistory : [];
    const systemInstruction = [
      generateConsultantSystemInstruction({ displayName }),
      ASK_DRAFT_ADVICE_COACH_SYSTEM_BLOCK,
      buildChatPersonaSystemBlock({ displayName }),
    ].join('\n\n');
    const prompt = generateDraftAdvicePrompt(adviceContext, userText);

    try {
      const { adviceMessage, suggestions } = await this.llmClient.generateConsultantResponse({
        prompt,
        systemInstruction,
        temperature: 0.35,
        chatHistory,
        ...(options?.signal ? { signal: options.signal } : {}),
      });

      const quickReplies = buildDraftAdviceQuickReplies(
        suggestions,
        adviceContext.historicalFoodBlocks,
        {
          draftItems: adviceContext.activeDraft?.items || [],
          adviceMessage: String(adviceMessage || '').trim(),
          userText,
          physiologicalPolicy: adviceContext.physiologicalPolicy || null,
        },
      );

      this.conversationState = CONVERSATION_STATE.AWAITING_CONFIRMATION;
      this.publishAdviceMessage({
        text: String(adviceMessage || '').trim(),
        quickReplies: quickReplies.length > 0 ? quickReplies : null,
      });

      return {
        ok: true,
        intent: 'ASK_DRAFT_ADVICE',
        awaiting: true,
        quickReplies,
        conversationState: this.conversationState,
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.error('[CommandTerminalController] handleDraftAdviceRequest LLM failed', error);
      this.publishSystemMessage(
        'Non sono riuscito a suggerirti un complemento. Riprova o dimmi cosa aggiungere (es. «aggiungi 90g sgombro»).',
      );
      return { ok: false, reason: 'draft_advice_llm_failed', userNotified: true };
    }
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
      || isMergeIntoExistingMealIntent(rawQuery)
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
      // Critico: bozza McDrive = items del diario, non residui chat (Pollo/Riso).
      this.stageRecoveredMealDraft(existingMealNode, {
        upsertAction: previewProposal?.upsertAction || 'replace',
        source: previewProposal?.source || 'logged_meal_recovered',
        uiMessage: `Ho recuperato il tuo ${targetMealTypeForUpdate || 'pasto'}.`,
      });
      this.setPendingMealUpdate({
        state: MEAL_UPDATE_WAITING_STATE,
        targetMealType: targetMealTypeForUpdate || existingMealNode.mealType,
        targetNodeId: existingMealNode.targetNodeId,
        existingMealNode,
        timeQualifier: updateContext?.timeQualifier || null,
      });
      this.publishAdviceMessage({
        text: `Ho recuperato il tuo ${targetMealTypeForUpdate || 'pasto'}. Modifica gli alimenti sulla card e conferma — nessuna domanda intermedia.`,
        mealProposals: previewProposal ? [previewProposal] : null,
        pendingMealUpdate: this.getPendingMealUpdate(),
      });
      return {
        ok: true,
        intent: 'UPDATE_LOGGED_MEAL',
        mealProposals: previewProposal ? [previewProposal] : [],
        singleConfirm: true,
        awaitingConfirmation: true,
        pendingMealDraft: this.getPendingMealDraft(),
      };
    }

    // Follow-up UPDATE con mutazione chiara: merge locale su existingMealNode / draft attivo.
    if (isUpdateLogged && existingMealNode?.targetNodeId && hasExplicitUpdateAction(rawQuery)) {
      this.setPendingMealUpdate({
        state: MEAL_UPDATE_WAITING_STATE,
        targetMealType: targetMealTypeForUpdate || existingMealNode.mealType,
        targetNodeId: existingMealNode.targetNodeId,
        existingMealNode,
        timeQualifier: updateContext?.timeQualifier || null,
      });
      const active = this.getPendingMealDraft();
      const activeTarget = String(active?.targetNodeId || '').trim();
      const nodeTarget = String(existingMealNode.targetNodeId || '').trim();
      if (!active || !expandFoodPayloadItems(active).length
        || (nodeTarget && activeTarget && activeTarget !== nodeTarget)
        || !activeTarget) {
        // Seed bozza = pasto intero + targetNodeId (confirm → replace, non nuovo slot).
        this.stageRecoveredMealDraft(existingMealNode, {
          upsertAction: 'replace',
          source: isMergeIntoExistingMealIntent(rawQuery)
            ? 'logged_meal_merge'
            : 'logged_meal_before_explicit_mutate',
        });
      } else if (!String(active?.targetNodeId || '').trim()) {
        this.stagePendingMealDraft({
          ...active,
          targetNodeId: nodeTarget,
          upsertAction: 'replace',
          action: 'replace',
          source: active?.source || 'logged_meal_resync',
        });
      }
      if (looksLikeClearMealDraftMutation(rawQuery) || isUpdateMealDraftIntent(rawQuery)) {
        const local = await this.processMealDraftVoiceLoop(rawQuery, currentState, options);
        if (local?.ok) return local;
      }
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
      activeWizard: this.activeWizard,
      imageCount: images.length,
    });

    const forcedIntentEarly = String(options?.intent || '').trim().toUpperCase();
    if (forcedIntentEarly === 'START_MCDRIVE_WIZARD') {
      return this.startMcdriveWizard(currentState, {
        ...options,
        mealTypeHint: options?.mealTypeHint || options?.mealType || null,
        userText,
      });
    }
    if (forcedIntentEarly === 'START_MEAL_BUILDER_WIZARD') {
      // Legacy Guidami → McDrive
      return this.startMealBuilderWizard(userText, currentState, options);
    }
    if (forcedIntentEarly === 'FINISH_MCDRIVE_WIZARD') {
      return this.finishMcdriveWizard(currentState);
    }
    if (forcedIntentEarly === 'SAVE_MCDRIVE_MEAL') {
      return this.commitMcdriveValidatedMeal(currentState);
    }
    if (forcedIntentEarly === 'ADD_MORE_MCDRIVE') {
      return this.continueMcdriveAddMore();
    }
    if (forcedIntentEarly === 'SET_MCDRIVE_MEAL_TYPE') {
      return this.setMcdriveMealTypeAndOpen(options?.mealType || userText);
    }
    if (forcedIntentEarly === 'CANCEL_MCDRIVE_WIZARD') {
      return this.cancelMcdriveWizard();
    }
    if (forcedIntentEarly === 'FREE_MEAL_LISTEN') {
      return this.startFreeMealListen(options?.mealTypeHint || null, options);
    }

    // One-tap exact match (voce/testo): bypass motore AI alimentare.
    const exactOneTap = userText.toLowerCase();
    const canOneTap =
      this.conversationState === CONVERSATION_STATE.IDLE
      && !this.activeWizard
      && images.length === 0
      && !options?.skipExactOneTap;
    if (canOneTap) {
      if (exactOneTap === 'caffè' || exactOneTap === 'caffe') {
        return {
          ok: true,
          intent: 'OPEN_COFFEE_UI',
          openUi: 'caffe',
        };
      }
      if (exactOneTap === 'tè' || exactOneTap === 'te' || exactOneTap === 'tea') {
        return {
          ok: true,
          intent: 'OPEN_TEA_UI',
          openUi: 'tea',
        };
      }
      if (
        exactOneTap === 'energy'
        || exactOneTap === 'energy drink'
        || exactOneTap === 'energydrink'
      ) {
        return {
          ok: true,
          intent: 'OPEN_ENERGY_UI',
          openUi: 'energy',
        };
      }
      if (exactOneTap === 'acqua') {
        return {
          ok: true,
          intent: 'OPEN_WATER_UI',
          openUi: 'acqua',
        };
      }
    }

    if (
      this.activeWizard === ACTIVE_WIZARD.MCDRIVE_LOOP
      && !options?.skipMcdriveGate
    ) {
      return this.processMcdriveWizardResponse(userText, currentState, options);
    }

    if (
      !options?.skipFreeMealListenGate
      && this.conversationState === CONVERSATION_STATE.AWAITING_FREE_MEAL_LOG
    ) {
      return this.processFreeMealLogInput(userText, currentState, options);
    }

    const bypassSlotFilling = this.shouldBypassSlotFillingForFreeText(userText, chatHistory, options);
    if (bypassSlotFilling) {
      this.clearChipWaitingState();
    }

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
      this.activeWizard === ACTIVE_WIZARD.MEAL_BUILDER
      || this.conversationState === CONVERSATION_STATE.AWAITING_MEAL_BUILDER_STEP
    ) {
      // Legacy Guidami: dirotta su McDrive (niente inserimento progressivo testuale).
      return this.processMealBuilderWizardResponse(userText, currentState, options);
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

    if (this.conversationState === CONVERSATION_STATE.AWAITING_COFFEE_VARIANT) {
      return this.processCoffeeVariantResponse(userText, currentState, options);
    }

    if (this.conversationState !== CONVERSATION_STATE.IDLE && !bypassSlotFilling) {
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
    if (forcedIntentEarly === 'REQUEST_HEALTH_DIAGNOSIS') {
      return this.handleHealthDiagnosisRequest(userText, currentState, options);
    }

    // Intent Router: report/bollettino (ieri / settimana / mese) — prima del food parser.
    {
      const reportMatch = matchReportCommand(userText, {
        intent: forcedIntentEarly || options?.intent,
        reportKind: options?.reportKind || options?.kind,
      });
      if (
        reportMatch
        || forcedIntentEarly === 'GENERATE_PERIOD_REPORT'
        || forcedIntentEarly === 'GENERATE_REPORT'
      ) {
        console.log('[ReportIntentRouter] intercepted → skip food/Gemini structured', reportMatch);
        return this.processReportCommand(userText, currentState, {
          ...options,
          intent: forcedIntentEarly || options?.intent || 'GENERATE_PERIOD_REPORT',
          reportKind: options?.reportKind || reportMatch?.kind,
        });
      }
    }

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
        this.clearPendingMealDraft();
        this.publishSystemMessage('Modifica pasto annullata.', { withFallbackMenu: true });
        return { ok: true, cancelled: true, intent: 'UPDATE_LOGGED_MEAL' };
      }

      // Append/remove chiaro → merge locale sulla bozza attiva (source of truth), non chatHistory.
      const node = this.pendingMealUpdate.existingMealNode;
      if (
        node
        && (looksLikeClearMealDraftMutation(userText) || isUpdateMealDraftIntent(userText))
      ) {
        const active = this.getPendingMealDraft();
        const activeTarget = String(active?.targetNodeId || '').trim();
        const nodeTarget = String(node.targetNodeId || '').trim();
        if (!active || !expandFoodPayloadItems(active).length
          || (nodeTarget && activeTarget && activeTarget !== nodeTarget)) {
          this.stageRecoveredMealDraft(node, {
            upsertAction: 'replace',
            source: isMergeIntoExistingMealIntent(userText)
              ? 'logged_meal_merge'
              : 'logged_meal_before_local_mutate',
          });
        }
        return this.processMealDraftVoiceLoop(userText, currentState, options);
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

    if (inferredIntent === 'START_MEAL_BUILDER_WIZARD') {
      return this.startMealBuilderWizard(userText, currentState, options);
    }

    if (inferredIntent === 'START_MCDRIVE_WIZARD') {
      return this.startMcdriveWizard(currentState, {
        ...options,
        mealTypeHint: options?.mealTypeHint || options?.mealType || null,
        userText,
      });
    }

    if (inferredIntent === 'MCDRIVE_LOOP') {
      return this.processMcdriveWizardResponse(userText, currentState, options);
    }

    if (inferredIntent === 'FINISH_MCDRIVE_WIZARD') {
      return this.finishMcdriveWizard(currentState);
    }

    if (inferredIntent === 'SAVE_MCDRIVE_MEAL') {
      return this.commitMcdriveValidatedMeal(currentState);
    }

    if (inferredIntent === 'ADD_MORE_MCDRIVE') {
      return this.continueMcdriveAddMore();
    }

    if (inferredIntent === 'SET_MCDRIVE_MEAL_TYPE') {
      return this.setMcdriveMealTypeAndOpen(options?.mealType || userText);
    }

    if (inferredIntent === 'CANCEL_MCDRIVE_WIZARD') {
      return this.cancelMcdriveWizard();
    }

    if (inferredIntent === 'MEAL_BUILDER_WIZARD') {
      return this.processMealBuilderWizardResponse(userText, currentState, options);
    }

    if (inferredIntent === 'REQUEST_HEALTH_DIAGNOSIS') {
      return this.handleHealthDiagnosisRequest(userText, currentState, options);
    }

    if (inferredIntent === 'LOG_COFFEE') {
      return this.handleCoffeeLogRequest(userText, currentState, options);
    }

    if (inferredIntent === 'FREE_MEAL_LISTEN') {
      return this.startFreeMealListen(
        options?.mealTypeHint || parseMealTypeFromUserText(userText) || null,
        options,
      );
    }

    if (inferredIntent === 'ASK_DRAFT_ADVICE') {
      return this.handleDraftAdviceRequest(userText, currentState, options);
    }

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
      return this.processMealAdvice(userText, currentState, {
        ...options,
        ...(inferredIntent === 'UPDATE_LOGGED_MEAL'
          ? { forcedIntent: 'UPDATE_LOGGED_MEAL' }
          : {}),
      });
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
      {
        pendingMealUpdate: this.getPendingMealUpdate(),
        pendingMealDraft: this.resolveActiveMealDraftPayload(),
      },
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
        ...(options?.fromVoice === true ? { fromVoice: true } : {}),
      };

      // Nota vocale → lavagna FastMealLogger (nessun auto-save), se ci sono alimenti.
      if (options?.fromVoice === true && hasFood) {
        return this.publishMealLogProposalCard(
          normalized,
          currentState,
          userText,
          chatHistory,
          feedbackOpts,
        );
      }

      // Fast-Path: card riepilogo immediata (wizard solo su edit chirurgico).
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
        ...(options?.fromVoice === true ? { fromVoice: true } : {}),
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
