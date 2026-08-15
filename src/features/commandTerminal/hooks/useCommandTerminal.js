import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { commandBus } from '../dispatcher/CommandBus.js';
import { ContextComposer } from '../context/ContextComposer.js';
import { GeminiStructuredClient } from '../llm/GeminiStructuredClient.js';
import { CommandTerminalController } from '../CommandTerminalController.js';
import {
  DISPATCH_ADD_FOOD,
  DISPATCH_UPSERT_MEAL,
  DISPATCH_COMMAND_REJECTED,
  DISPATCH_LOG_SLEEP,
  DISPATCH_LOG_STIMULANT,
  DISPATCH_SYSTEM_MESSAGE,
} from '../contracts/eventTypes.js';
import { initNutritionHandlers } from '../handlers/NutritionCommandHandler.js';
import { initWorkoutHandlers } from '../handlers/WorkoutCommandHandler.js';
import { quickRepliesForConversationState, CONVERSATION_STATE, ACTIVE_WIZARD, buildMealDraftUiMessage, buildWorkoutDraftUiMessage, expandFoodPayloadItems } from '../conversation/conversationState.js';
import { isAskDraftAdviceIntent } from '../conversation/mealLogIntent.js';
import { enrichMealDraftWithHistoricalVariations } from '../conversation/recentFoodNames.js';
import { isAbortError } from '../../../services/aiService.js';
import { processHealthChatMessage, formatClinicalSaveAck } from '../../../services/healthChatService.js';
import { isHealthDiabetesChatMode } from '../../chat/healthChatMode.js';
import { classifyDiabetesChatIntent } from '../../chat/diabetesChatRouter.js';
import {
  projectNutritionAfterMeal,
  sumMealItemsMacros,
} from '../../../conversation/ConsultantEngine.js';
import {
  buildMealReceiptPayload,
  mealReceiptFallbackText,
} from '../../chat/mealReceiptUtils.js';
import { isSystemNoticeMessage, withSystemNoticeDefaults } from '../../chat/chatMessageKind.js';
import { getChatFallbackQuickReplies } from '../../chat/chatFallbackMenu.js';
import {
  snapshotChatAvatarAsset,
  isStrategicAvatarIntent,
} from '../../chat/avatarMood.js';
import { getTodayString } from '../../../coreEngine.jsx';
import { getCurrentPredictiveContext } from '../../predictive/HabitEngine.js';
import {
  buildPredictiveGreeting,
  evaluatePredictiveGreetingDecision,
  markPredictiveGreetingsSuperseded,
  PREDICTIVE_GREETING_TYPE,
  resolveEffectivePredictiveState,
  resolvePredictiveIntentAction,
} from '../../predictive/predictiveGreeting.js';

const MCDRIVE_TRAY_SESSION_ID = 'mcdrive_tray_singleton';

function isActiveMcDriveTrayEntry(entry) {
  if (!entry || entry.liveMealTrayResolved === true) return false;
  return Boolean(
    entry.liveMealTray
    || entry.type === 'MCDRIVE_TRAY'
    || entry.mcdriveWizard === true
    || entry.mcdriveSessionId === MCDRIVE_TRAY_SESSION_ID,
  );
}

/**
 * Se la lavagna McDrive attiva non è già l'ultimo messaggio, la sposta in fondo.
 * @param {Array<object>} prev
 * @returns {Array<object>}
 */
function bumpActiveMcDriveTrayToEnd(prev) {
  const list = Array.isArray(prev) ? [...prev] : [];
  let idx = -1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (isActiveMcDriveTrayEntry(list[i])) {
      idx = i;
      break;
    }
  }
  if (idx < 0 || idx === list.length - 1) return list;
  const [trayEntry] = list.splice(idx, 1);
  return [...list, trayEntry];
}

/**
 * Una sola card lavagna in cronologia: aggiorna quella attiva, la sposta in fondo, o ne crea una.
 * Timestamp/id sempre rinnovati così nessun sort/cronologia la riporta in alto.
 * @param {Array<object>} prev
 * @param {{ tray: object, quickReplies?: Array|null, text?: string, keepText?: boolean }} opts
 */
function upsertMcDriveTrayChatEntry(prev, {
  tray,
  quickReplies = null,
  text = '',
  keepText = false,
} = {}) {
  const list = Array.isArray(prev) ? [...prev] : [];
  let idx = -1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (isActiveMcDriveTrayEntry(list[i])) {
      idx = i;
      break;
    }
  }

  const safeTray = tray && typeof tray === 'object'
    ? tray
    : { items: [], totals: { kcal: 0, pro: 0, carbo: 0, fat: 0 } };
  const nextReplies = Array.isArray(quickReplies) ? quickReplies : null;
  const nextText = keepText && idx >= 0
    ? String(list[idx]?.text || list[idx]?.displayText || '').trim()
    : String(text || '').trim();

  const now = Date.now();
  const basePrev = idx >= 0 ? list[idx] : null;
  const nextEntry = {
    ...(basePrev && typeof basePrev === 'object' ? basePrev : {}),
    id: `mcdrive_tray_${now}`,
    timestamp: now,
    createdAt: now,
    sender: 'ai',
    type: 'MCDRIVE_TRAY',
    mcdriveWizard: true,
    mcdriveSessionId: MCDRIVE_TRAY_SESSION_ID,
    liveMealTray: safeTray,
    liveMealTrayResolved: false,
    text: nextText,
    displayText: nextText,
    spokenText: nextText,
    ...(nextReplies
      ? { quickReplies: nextReplies }
      : (basePrev && Array.isArray(basePrev.quickReplies)
        ? { quickReplies: basePrev.quickReplies }
        : { quickReplies: [] })),
  };

  // Estrai la card attiva e risolvi eventuali altre tray; poi push in coda (bump to bottom).
  const rest = [];
  for (let i = 0; i < list.length; i += 1) {
    if (i === idx) continue;
    const entry = list[i];
    if (
      entry?.liveMealTray
      || entry?.type === 'MCDRIVE_TRAY'
      || entry?.mcdriveWizard
      || entry?.mcdriveSessionId === MCDRIVE_TRAY_SESSION_ID
    ) {
      rest.push({ ...entry, liveMealTrayResolved: true });
    } else {
      rest.push(entry);
    }
  }

  return [...rest, nextEntry];
}

/** Rimuove la lavagna attiva dalla cronologia (passa al dock UI / chiusura). */
function purgeActiveMcDriveTrayEntries(prev) {
  return (Array.isArray(prev) ? prev : []).filter((entry) => !isActiveMcDriveTrayEntry(entry));
}

import {
  applyMealOperations,
  mergeMealItems,
  resolveUpsertActionFromPayload,
  buildMealCommitFingerprint,
} from '../meals/mealUpsert.js';

/**
 * Salvagente conferma bozza: existingMealNode attivo → replace + targetNodeId
 * (il Vassoio porta già il pasto intero aggiornato).
 */
function applyDraftConfirmReplaceGuard(controller) {
  if (!controller || typeof controller.applyExistingMealReplaceConfirmGuard !== 'function') {
    return null;
  }
  return controller.applyExistingMealReplaceConfirmGuard();
}

const CHAT_CLOSE_AFTER_MEAL_COMMIT_MS = 400;

export function useCommandTerminal({
  chatHistory,
  setChatHistory,
  getCurrentState = null,
  getWipMealSnapshot = null,
  onWipMealSeed = null,
  onAddFoodCommand = null,
  onAddWorkoutCommand = null,
  onLogSleepCommand = null,
  onLogStimulantCommand = null,
  onSaveFoodDbEntry = null,
  onPopulateMealLavagna = null,
  onSaveFoodEntryPer100ToFoodDb = null,
  onChatClose = null,
  onManualShortcutFromChat = null,
} = {}) {
  const [chatInput, setChatInput] = useState('');
  const [chatImages, setChatImages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeQuickReplies, setActiveQuickReplies] = useState([]);

  const setChatHistoryRef = useRef(setChatHistory);
  const chatHistoryRef = useRef(chatHistory);
  const getCurrentStateRef = useRef(getCurrentState);
  const getWipMealSnapshotRef = useRef(getWipMealSnapshot);
  const onManualShortcutFromChatRef = useRef(onManualShortcutFromChat);
  const pendingMealUpdateRef = useRef(null);
  const abortControllerRef = useRef(null);
  const generationTokenRef = useRef(0);
  const strategicGenerationRef = useRef(false);
  useEffect(() => {
    setChatHistoryRef.current = setChatHistory;
  }, [setChatHistory]);

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  useEffect(() => {
    getCurrentStateRef.current = getCurrentState;
    getWipMealSnapshotRef.current = getWipMealSnapshot;
    onManualShortcutFromChatRef.current = onManualShortcutFromChat;
  }, [getCurrentState, getWipMealSnapshot, onManualShortcutFromChat]);

  const buildAvatarSnapshotContext = useCallback((forceStrategic = false) => {
    const currentState =
      typeof getCurrentStateRef.current === 'function' ? getCurrentStateRef.current() ?? {} : {};
    const wipSnapshot = typeof getWipMealSnapshotRef.current === 'function'
      ? getWipMealSnapshotRef.current()
      : { wipMealItems: [] };
    return {
      chatHistory: chatHistoryRef.current || [],
      wipMealItems: wipSnapshot.wipMealItems || [],
      mealBuilder: currentState.mealBuilder ?? null,
      isTrainingDay: currentState.isTrainingDay === true,
      forceStrategic: forceStrategic || strategicGenerationRef.current === true,
    };
  }, []);

  const appendAiMessage = useCallback((text, extra = {}) => {
    const line = String(text || '').trim();
    const hasReceipt = Boolean(extra?.mealReceipt && typeof extra.mealReceipt === 'object');
    if ((!line && !hasReceipt) || typeof setChatHistoryRef.current !== 'function') return;
    const noticeExtra = withSystemNoticeDefaults(line, extra && typeof extra === 'object' ? extra : {});
    const avatarAsset = String(noticeExtra?.avatarAsset || '').trim()
      || snapshotChatAvatarAsset(noticeExtra, buildAvatarSnapshotContext(noticeExtra?.forceStrategic === true));
    const purgeTray = noticeExtra?.purgeMcDriveTray === true
      || noticeExtra?.resolveMcDriveTray === true;
    console.log('🟢 DEBUG - RISPOSTA FINALE PRONTA PER LA UI (appendAiMessage→chatHistory):', {
      text: line || '(mealReceipt)',
      type: noticeExtra?.type || null,
      sourceTag: noticeExtra?.sourceTag || null,
      local: noticeExtra?.local === true,
      hasMealReceipt: hasReceipt,
      avatarAsset,
      purgeTray,
    });
    setChatHistoryRef.current((prev) => {
      let base = Array.isArray(prev) ? prev : [];
      if (purgeTray) {
        base = purgeActiveMcDriveTrayEntries(base);
      }
      const {
        purgeMcDriveTray: _purgeFlag,
        resolveMcDriveTray: _resolveFlag,
        ...safeExtra
      } = noticeExtra;
      const next = [
        ...base,
        {
          ...safeExtra,
          sender: 'ai',
          text: line || (hasReceipt ? mealReceiptFallbackText(extra.mealReceipt) : ''),
          avatarAsset,
        },
      ];
      // McDrive attivo: la lavagna resta sempre l'ultimo messaggio in chat (dato per il dock).
      return purgeTray ? next : bumpActiveMcDriveTrayToEnd(next);
    });
  }, [buildAvatarSnapshotContext]);

  const onAddFoodRef = useRef(onAddFoodCommand);
  const onChatCloseRef = useRef(onChatClose);
  const chatCloseTimerRef = useRef(null);
  const onAddWorkoutRef = useRef(onAddWorkoutCommand);
  const onLogSleepRef = useRef(onLogSleepCommand);
  const onLogStimulantRef = useRef(onLogStimulantCommand);
  const onSaveFoodDbEntryRef = useRef(onSaveFoodDbEntry);
  const handleAcceptMealProposalRef = useRef(null);

  useEffect(() => {
    onAddFoodRef.current = onAddFoodCommand;
  }, [onAddFoodCommand]);

  useEffect(() => {
    onChatCloseRef.current = onChatClose;
  }, [onChatClose]);

  const scheduleChatCloseAfterMealCommit = useCallback(() => {
    if (typeof onChatCloseRef.current !== 'function') return;
    if (chatCloseTimerRef.current) {
      clearTimeout(chatCloseTimerRef.current);
    }
    chatCloseTimerRef.current = setTimeout(() => {
      chatCloseTimerRef.current = null;
      onChatCloseRef.current?.();
    }, CHAT_CLOSE_AFTER_MEAL_COMMIT_MS);
  }, []);

  useEffect(() => () => {
    if (chatCloseTimerRef.current) {
      clearTimeout(chatCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    onAddWorkoutRef.current = onAddWorkoutCommand;
  }, [onAddWorkoutCommand]);

  useEffect(() => {
    onLogSleepRef.current = onLogSleepCommand;
  }, [onLogSleepCommand]);

  useEffect(() => {
    onLogStimulantRef.current = onLogStimulantCommand;
  }, [onLogStimulantCommand]);

  useEffect(() => {
    onSaveFoodDbEntryRef.current = onSaveFoodDbEntry;
  }, [onSaveFoodDbEntry]);

  const onWipMealSeedRef = useRef(onWipMealSeed);
  const onPopulateMealLavagnaRef = useRef(onPopulateMealLavagna);
  const onSaveFoodEntryPer100Ref = useRef(onSaveFoodEntryPer100ToFoodDb);
  const chatUsdaResumeRef = useRef(null);
  const [chatUsdaEnrichmentSession, setChatUsdaEnrichmentSession] = useState(null);
  useEffect(() => {
    onWipMealSeedRef.current = onWipMealSeed;
  }, [onWipMealSeed]);
  useEffect(() => {
    onPopulateMealLavagnaRef.current = onPopulateMealLavagna;
  }, [onPopulateMealLavagna]);
  useEffect(() => {
    onSaveFoodEntryPer100Ref.current = onSaveFoodEntryPer100ToFoodDb;
  }, [onSaveFoodEntryPer100ToFoodDb]);

  const controller = useMemo(() => {
    const llmClient = new GeminiStructuredClient();
    return new CommandTerminalController({
      bus: commandBus,
      llmClient,
      composer: new ContextComposer(),
      onPopulateMealLavagna: (payload) => {
        const fn = onPopulateMealLavagnaRef.current;
        return typeof fn === 'function' ? fn(payload) : false;
      },
      onSaveFoodEntryPer100ToFoodDb: (entry, options) => {
        const fn = onSaveFoodEntryPer100Ref.current;
        return typeof fn === 'function' ? fn(entry, options) : Promise.resolve(null);
      },
      onRequestUsdaEnrichment: (payload) => {
        const foodName = String(payload?.foodName || '').trim();
        chatUsdaResumeRef.current = typeof payload?.resume === 'function' ? payload.resume : null;
        if (!foodName) {
          setChatUsdaEnrichmentSession(null);
          return;
        }
        setChatUsdaEnrichmentSession({
          foodName,
          mode: payload?.mode === 'mcdrive' ? 'mcdrive' : 'chat',
          kentuItDb: payload?.kentuItDb && typeof payload.kentuItDb === 'object' ? payload.kentuItDb : null,
          personalDb: payload?.personalDb && typeof payload.personalDb === 'object' ? payload.personalDb : null,
          globalDb: payload?.globalDb && typeof payload.globalDb === 'object' ? payload.globalDb : null,
        });
      },
    });
  }, []);

  const syncDraftMessageInChat = useCallback((draftId, draft, summaryText) => {
    if (!draftId || typeof setChatHistoryRef.current !== 'function') return;
    const isWorkout = draft?.commandType === 'ADD_WORKOUT';
    const currentState =
      typeof getCurrentStateRef.current === 'function' ? getCurrentStateRef.current() ?? {} : {};
    const enrichedMealDraft = !isWorkout
      ? enrichMealDraftWithHistoricalVariations(draft, currentState, { limit: 5 })
      : null;
    setChatHistoryRef.current((prev) =>
      (prev || []).map((entry) =>
        entry.draftId === draftId
          ? {
              ...entry,
              mealDraft: isWorkout ? entry.mealDraft : enrichedMealDraft,
              workoutDraft: isWorkout ? draft : entry.workoutDraft,
              ...(summaryText ? { text: summaryText } : {}),
              draftResolved: false,
            }
          : entry,
      ),
    );
  }, []);

  const resolveDraftMessage = useCallback((draftId, { cancelled = false } = {}) => {
    if (!draftId || typeof setChatHistoryRef.current !== 'function') return;
    setChatHistoryRef.current((prev) =>
      (prev || []).map((entry) =>
        entry.draftId === draftId
          ? {
              ...entry,
              mealDraft: null,
              workoutDraft: null,
              draftResolved: true,
              draftCancelled: cancelled,
            }
          : entry,
      ),
    );
  }, []);

  const handleSaveNewFoodEntry = useCallback(async (entryPer100, donorMeta = null) => {
    if (typeof onSaveFoodDbEntryRef.current !== 'function') {
      appendAiMessage('⚠️ Salvataggio non disponibile in questa vista.', { type: 'system', isError: true });
      return { ok: false, reason: 'save_food_db_not_configured' };
    }
    try {
      await onSaveFoodDbEntryRef.current(entryPer100, donorMeta);
      appendAiMessage('✅ Alimento salvato nel database.', { type: 'system' });
      return { ok: true };
    } catch (error) {
      const reason = error?.message || 'save_failed';
      appendAiMessage(`⚠️ Salvataggio fallito: ${reason}`, { type: 'system', isError: true });
      return { ok: false, reason };
    }
  }, [appendAiMessage]);

  const confirmingDraftRef = useRef(false);

  const hasActiveWorkoutDraftInChat = useCallback(() => (
    (chatHistoryRef.current || []).some((m) => m.workoutDraft && !m.draftResolved)
  ), []);

  const syncActiveQuickRepliesFromController = useCallback(() => {
    const hasActiveDraftWidget = (chatHistoryRef.current || []).some(
      (m) => (m?.mealDraft && !m?.draftResolved)
        || (m?.workoutDraft && !m?.draftResolved)
        || (Array.isArray(m?.mealProposals) && m.mealProposals.length > 0),
    );
    if (hasActiveDraftWidget) {
      setActiveQuickReplies([]);
      return;
    }
    const { conversationState } = controller.getConversationSnapshot();
    const replies = quickRepliesForConversationState(conversationState);
    const hasActiveWorkoutDraft = (chatHistoryRef.current || []).some(
      (m) => m.workoutDraft && !m.draftResolved,
    );
    setActiveQuickReplies(
      hasActiveWorkoutDraft
        ? replies.filter((label) => !/^s[iì]\s*,\s*salva\b/i.test(String(label ?? '').trim()))
        : replies,
    );
  }, [controller]);

  const resetConversationState = useCallback(() => {
    controller.resetConversationState();
    setActiveQuickReplies([]);
  }, [controller]);

  useEffect(() => {
    const cleanupFns = [];

    cleanupFns.push(
      initNutritionHandlers({
        bus: commandBus,
        onAddFoodCommand: (payload, envelope) => {
          if (typeof onAddFoodRef.current !== 'function') return null;
          return onAddFoodRef.current(payload, envelope);
        },
        onMealCommitSuccess: () => {
          scheduleChatCloseAfterMealCommit();
        },
      }),
    );
    cleanupFns.push(
      initWorkoutHandlers({
        bus: commandBus,
        onAddWorkoutCommand: (payload, envelope) => {
          if (typeof onAddWorkoutRef.current !== 'function') return null;
          return onAddWorkoutRef.current(payload, envelope);
        },
      }),
    );

    const unsubscribeLogSleep = commandBus.subscribe(DISPATCH_LOG_SLEEP, async (envelope) => {
      const payload = envelope?.payload || {};
      try {
        if (typeof onLogSleepRef.current === 'function') {
          await onLogSleepRef.current(payload, envelope);
        }
        const hours = Number(payload?.durationHours);
        const hoursLabel = Number.isFinite(hours) ? Math.round(hours * 100) / 100 : '?';
        const deepSleepPhase = Number(payload?.deepSleepPhase);
        const qualityScore = Number(payload?.qualityScore);
        const extras = [];
        if (Number.isFinite(deepSleepPhase)) {
          extras.push(`profondo ${Math.round(deepSleepPhase * 100) / 100}h`);
        }
        if (Number.isFinite(qualityScore)) {
          extras.push(`punteggio ${Math.round(qualityScore)}`);
        }
        const suffix = extras.length ? ` (${extras.join(', ')})` : '';
        appendAiMessage(`🛌 Sonno registrato: ${hoursLabel} ore${suffix}.`);
      } catch (error) {
        const reason = `Sleep handler failure: ${error?.message || 'unknown error'}`;
        commandBus.publish(
          DISPATCH_COMMAND_REJECTED,
          { reason, command: payload },
          { source: 'useCommandTerminal' },
        );
      }
    });

    const unsubscribeLogStimulant = commandBus.subscribe(DISPATCH_LOG_STIMULANT, async (envelope) => {
      const payload = envelope?.payload || {};
      try {
        if (typeof onLogStimulantRef.current === 'function') {
          await onLogStimulantRef.current(payload, envelope);
        }
      } catch (error) {
        const reason = `Stimulant handler failure: ${error?.message || 'unknown error'}`;
        commandBus.publish(
          DISPATCH_COMMAND_REJECTED,
          { reason, command: payload },
          { source: 'useCommandTerminal' },
        );
      }
    });

    const unsubscribeSystem = commandBus.subscribe(DISPATCH_SYSTEM_MESSAGE, (envelope) => {
      const payload = envelope?.payload || {};
      if (payload.type === 'MEAL_DRAFT') {
        const summaryText = String(payload.text || '').trim();
        const currentState =
          typeof getCurrentStateRef.current === 'function' ? getCurrentStateRef.current() ?? {} : {};
        const enrichedMealDraft = enrichMealDraftWithHistoricalVariations(
          payload.mealDraft || null,
          currentState,
          { limit: 5 },
        );
        appendAiMessage(summaryText, {
          type: 'MEAL_DRAFT',
          mealDraft: enrichedMealDraft,
          draftId: payload.draftId || null,
        });
        setActiveQuickReplies([]);
        return;
      }
      if (payload.type === 'WORKOUT_DRAFT') {
        const summaryText = String(payload.text || '').trim();
        appendAiMessage(summaryText, {
          type: 'WORKOUT_DRAFT',
          workoutDraft: payload.workoutDraft || null,
          draftId: payload.draftId || null,
        });
        const workoutQuickReplies = (
          Array.isArray(payload.quickReplies) && payload.quickReplies.length > 0
            ? payload.quickReplies
            : []
        ).filter((label) => !/^s[iì]\s*,\s*salva\b/i.test(String(label ?? '').trim()));
        setActiveQuickReplies(workoutQuickReplies);
        return;
      }
      if (payload.type === 'MEAL_RECEIPT' || (payload.mealReceipt && typeof payload.mealReceipt === 'object')) {
        const text = String(payload.text || payload.message || '').trim()
          || mealReceiptFallbackText(payload.mealReceipt);
        appendAiMessage(text, {
          type: 'MEAL_RECEIPT',
          mealReceipt: payload.mealReceipt,
          local: payload.local === true,
          sourceTag: payload.sourceTag || null,
          purgeMcDriveTray: payload.resolveMcDriveTray === true,
        });
        return;
      }
      if (payload.type === 'QUICK_EVENT_CONFIRM' || payload.quickEventConfirm) {
        const confirm = payload.quickEventConfirm && typeof payload.quickEventConfirm === 'object'
          ? payload.quickEventConfirm
          : null;
        const text = String(payload.displayText || payload.text || payload.message || confirm?.title || '').trim()
          || 'Evento registrato';
        appendAiMessage(text, {
          type: 'QUICK_EVENT_CONFIRM',
          quickEventConfirm: confirm,
          isSystem: true,
          local: payload.local === true,
          sourceTag: payload.sourceTag || null,
          timestamp: Date.now(),
          createdAt: Date.now(),
        });
        return;
      }
      if (payload.type === 'MCDRIVE_TRAY_SYNC' || payload.syncMcDriveTrayOnly === true) {
        const tray = payload.liveMealTray;
        const syncQuickReplies = Array.isArray(payload.quickReplies) ? payload.quickReplies : null;
        if (tray && typeof setChatHistoryRef.current === 'function') {
          setChatHistoryRef.current((prev) => upsertMcDriveTrayChatEntry(prev, {
            tray,
            quickReplies: syncQuickReplies,
            keepText: true,
          }));
        }
        if (syncQuickReplies) {
          setActiveQuickReplies(syncQuickReplies);
        }
        return;
      }
      if (payload.type === 'MCDRIVE_TRAY' || payload.mcdriveWizard === true || payload.mcdriveTraySingleton === true) {
        const text = String(payload.displayText || payload.text || payload.message || '').trim();
        const quickReplies = Array.isArray(payload.quickReplies)
          ? payload.quickReplies
            .map((o) => (o && typeof o === 'object' ? o : String(o || '').trim()))
            .filter((o) => (typeof o === 'object' ? String(o.label || '').trim() : o))
          : [];
        const tray = payload.liveMealTray || { items: [], totals: { kcal: 0, pro: 0, carbo: 0, fat: 0 } };
        if (typeof setChatHistoryRef.current === 'function') {
          setChatHistoryRef.current((prev) => upsertMcDriveTrayChatEntry(prev, {
            tray,
            quickReplies,
            text,
            keepText: false,
          }));
        }
        if (quickReplies.length > 0) {
          setActiveQuickReplies(quickReplies);
        }
        return;
      }
      if (payload.type === 'REQUEST_FOOD_PHOTO' || payload.requestFoodPhoto === true) {
        const text = String(payload.text || payload.message || '').trim();
        const quickReplies = Array.isArray(payload.quickReplies)
          ? payload.quickReplies.map((o) => String(o || '').trim()).filter(Boolean).slice(0, 4)
          : ['📷 Scatta foto etichetta', 'Te lo descrivo a parole'];
        if (!text) return;
        appendAiMessage(text, {
          type: 'REQUEST_FOOD_PHOTO',
          clarification: true,
          requestFoodPhoto: true,
          foodName: payload.foodName || null,
          quickReplies,
          local: payload.local === true,
          sourceTag: payload.sourceTag || null,
        });
        setActiveQuickReplies(quickReplies);
        return;
      }
      if (payload.type === 'ASK_CLARIFICATION' || payload.clarification === true) {
        const text = String(payload.displayText || payload.text || payload.message || '').trim();
        const spokenText = String(payload.spokenText || text).trim();
        const quickReplies = Array.isArray(payload.quickReplies)
          ? payload.quickReplies
            .map((o) => (o && typeof o === 'object' ? o : String(o || '').trim()))
            .filter((o) => (typeof o === 'object' ? String(o.label || '').trim() : o))
            .slice(0, 5)
          : [];
        if (!text) return;
        appendAiMessage(text, {
          type: 'ASK_CLARIFICATION',
          clarification: true,
          spokenText,
          displayText: text,
          quickReplies,
          local: payload.local === true,
          sourceTag: payload.sourceTag || null,
          mealWizard: payload.mealWizard === true,
          mealWizardPhase: payload.mealWizardPhase || null,
        });
        if (quickReplies.length > 0) {
          setActiveQuickReplies(quickReplies);
        }
        return;
      }
      const text = String(payload.displayText || payload.text || payload.message || '').trim();
      if (!text) return;
      const spokenText = String(payload.spokenText || text).trim();
      const rawQuickReplies = Array.isArray(payload.quickReplies) ? payload.quickReplies : [];
      const lightQuickReplies = rawQuickReplies
        .map((o) => (o && typeof o === 'object' ? o : String(o || '').trim()))
        .filter((o) => (typeof o === 'object' ? String(o.label || o.text || '').trim() : Boolean(o)))
        .slice(0, 5);
      const payloadType = payload.type || null;
      const inferredSystem = !payloadType
        && lightQuickReplies.length === 0
        && isSystemNoticeMessage({ sender: 'ai', text });
      appendAiMessage(text, {
        type: payloadType || (inferredSystem ? 'system' : null),
        spokenText,
        displayText: text,
        local: payload.local === true,
        sourceTag: payload.sourceTag || null,
        suggestedAction: payload.suggestedAction || null,
        mealProposals: Array.isArray(payload.mealProposals) ? payload.mealProposals : null,
        mealDraftProjection: payload.mealDraftProjection && typeof payload.mealDraftProjection === 'object'
          ? payload.mealDraftProjection
          : null,
        pendingMealUpdate: payload.pendingMealUpdate && typeof payload.pendingMealUpdate === 'object'
          ? payload.pendingMealUpdate
          : null,
        wipSuggestions: Array.isArray(payload.wipSuggestions) ? payload.wipSuggestions : null,
        wipAddedChipIds: [],
        adviceId: payload.adviceId || null,
        newFoodDraft: payload.newFoodDraft || null,
        isError: payloadType === 'ERROR',
        isSystem: inferredSystem || payloadType === 'ERROR' || payload.isSystem === true,
        systemIcon: payload.systemIcon || null,
        avatarAsset: payload.avatarAsset || null,
        mealReceipt: payload.mealReceipt && typeof payload.mealReceipt === 'object'
          ? payload.mealReceipt
          : null,
        purgeMcDriveTray: payload.resolveMcDriveTray === true,
        ...(lightQuickReplies.length > 0
          ? { quickReplies: lightQuickReplies, clarification: payload.clarification === true }
          : {}),
      });
      if (lightQuickReplies.length > 0) {
        setActiveQuickReplies(lightQuickReplies);
      }
    });

    const unsubscribeRejected = commandBus.subscribe(DISPATCH_COMMAND_REJECTED, (envelope) => {
      if (envelope?.payload?.silent) return;
      const reason = String(envelope?.payload?.reason || 'Comando rifiutato.').trim();
      appendAiMessage(`⚠️ ${reason}`);
    });

    return () => {
      unsubscribeLogSleep();
      unsubscribeLogStimulant();
      unsubscribeSystem();
      unsubscribeRejected();
      cleanupFns.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore cleanup failures
        }
      });
    };
  }, [appendAiMessage, scheduleChatCloseAfterMealCommit]);

  const sendMessage = useCallback(
    async (text, options = {}) => {
      if (typeof setChatHistoryRef.current !== 'function') {
        return { ok: false, reason: 'chat_history_not_configured' };
      }

      const resolvedText = String(text ?? chatInput ?? '').trim();
      const attachedImages = Array.isArray(options?.images) && options.images.length > 0
        ? options.images
        : chatImages;
      const isFreeMealListen = String(options?.intent || '').trim().toUpperCase() === 'FREE_MEAL_LISTEN';
      const intentUpper = String(options?.intent || '').trim().toUpperCase();
      const isMcdriveWizardIntent = intentUpper === 'START_MCDRIVE_WIZARD'
        || intentUpper === 'FINISH_MCDRIVE_WIZARD'
        || intentUpper === 'SAVE_MCDRIVE_MEAL'
        || intentUpper === 'ADD_MORE_MCDRIVE'
        || intentUpper === 'SET_MCDRIVE_MEAL_TYPE'
        || intentUpper === 'CANCEL_MCDRIVE_WIZARD';
      if (!resolvedText && attachedImages.length === 0 && !isFreeMealListen && !isMcdriveWizardIntent) {
        return { ok: false, reason: 'empty_message' };
      }

      const mcdriveSnap = controller.getConversationSnapshot?.() || {};
      const inMcdriveLoop = mcdriveSnap.activeWizard === ACTIVE_WIZARD.MCDRIVE_LOOP;
      // Loop McDrive: nessun bubble utente — solo aggiornamento lavagna.
      const skipUserBubble = Boolean(options?.skipUserBubble) || inMcdriveLoop;
      const quietMcdriveAppend = inMcdriveLoop && !isMcdriveWizardIntent && Boolean(resolvedText);

      const userBubbleText =
        resolvedText || `📷 ${attachedImages.length} immagine/i allegata/e`;
      const hideUserPrompt = Boolean(options?.isHiddenUserMessage);
      const visibleBubbleText = hideUserPrompt
        ? String(options?.visibleUserText || '📊 Analizzo la giornata...').trim()
        : userBubbleText;
      const priorHistory = chatHistoryRef.current || [];
      if (!skipUserBubble) {
        setChatHistoryRef.current((prev) => {
          const base = (!options?.fromQuickReply && !options?.clarificationReply && !options?.fromSlotQuickReply)
            ? markPredictiveGreetingsSuperseded(prev || [])
            : (prev || []);
          return [
            ...base,
            { sender: 'user', text: visibleBubbleText },
          ];
        });
      }

      if (options?.intent === 'MANUAL_SHORTCUT' && options?.manualShortcutId) {
        const shortcutId = String(options.manualShortcutId || '').trim();
        if (shortcutId && typeof onManualShortcutFromChatRef.current === 'function') {
          onManualShortcutFromChatRef.current(shortcutId);
        }
        setActiveQuickReplies([]);
        return { ok: true, manualShortcut: shortcutId || true };
      }

      // Per richieste con contesto nascosto: in chat resta il testo pulito;
      // all'LLM arriva resolvedText (richiesta utente) + systemInstructionExtra.
      const historyForLlm = [...priorHistory, { sender: 'user', text: userBubbleText }];
      if (!options?.keepInput) {
        setChatInput('');
        setChatImages([]);
      }
      if (options?.fromQuickReply || options?.clarificationReply || options?.fromSlotQuickReply) {
        setActiveQuickReplies([]);
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const generationToken = ++generationTokenRef.current;

      if (!quietMcdriveAppend) {
        setIsLoading(true);
      }
      try {
        const currentState =
          typeof getCurrentStateRef.current === 'function' ? getCurrentStateRef.current() : {};
        const wipSnapshot = typeof getWipMealSnapshotRef.current === 'function'
          ? getWipMealSnapshotRef.current()
          : { wipMealItems: [], mealType: null, constraints: null, mealWipActive: false };

        // Modalità salute/diabete: router rigidamente separato
        // NUTRITION → motore pasti/macro (RTDB)
        // HEALTH → glicemia/farmaci (Firestore)
        // SPLIT → entrambi (pasto RTDB + clinico Firestore)
        const healthUid = String(
          currentState?.userUid
          || currentState?.userProfile?.uid
          || '',
        ).trim();
        const diabetesMode = isHealthDiabetesChatMode(currentState?.userProfile, healthUid);
        let diabetesSplitAck = '';
        let classified = null;
        const mealQuickReply = Boolean(
          options?.fromQuickReply
          || options?.clarificationReply
          || options?.fromSlotQuickReply,
        );

        if (diabetesMode) {
          if (!resolvedText && !isFreeMealListen && !isMcdriveWizardIntent) {
            appendAiMessage(
              'In modalità diabete puoi dirmi la glicemia, variazioni sui farmaci, oppure registrare un pasto come al solito (es. “a colazione ho mangiato yogurt”).',
              { type: 'HEALTH_CHAT', sourceTag: 'healthChatService' },
            );
            return { ok: true, healthMode: true, reason: 'text_required' };
          }

          // History PRIMA del messaggio corrente: altrimenti i detector di chiarimento
          // vedono subito lo user e falliscono (es. tap su «100g»).
          classified = classifyDiabetesChatIntent(resolvedText, {
            chatHistory: priorHistory,
            wipMealItems: wipSnapshot.wipMealItems || [],
          });

          // Pulsanti grammi / chiarimento pasto: stesso percorso della versione standard.
          if (mealQuickReply && !classified.isGlycemia && !classified.isTherapy) {
            classified = {
              ...classified,
              route: 'NUTRITION',
              isMeal: true,
              isClarificationFollowUp: true,
            };
          }

          // Solo glicemia/farmaci puri → health. Tutto il cibo (anche follow-up) → nutrizione.
          if (
            classified.route === 'HEALTH'
            && !classified.isMeal
            && !classified.isClarificationFollowUp
            && !mealQuickReply
          ) {
            try {
              const healthResult = await processHealthChatMessage(resolvedText, {
                uid: healthUid || undefined,
                signal: abortController.signal,
              });

              if (
                abortController.signal.aborted
                || generationToken !== generationTokenRef.current
              ) {
                appendAiMessage('Generazione annullata.', { type: 'system' });
                return { ok: false, aborted: true, userNotified: true };
              }

              const reply = String(healthResult?.risposta_utente || '').trim()
                || 'Messaggio ricevuto. Se vuoi, dimmi pure glicemia o variazioni sui farmaci.';
              appendAiMessage(reply, {
                type: 'HEALTH_CHAT',
                sourceTag: 'healthChatService',
                healthSaved: healthResult?.saved || null,
              });
              return {
                ok: true,
                healthMode: true,
                saved: healthResult?.saved || null,
                data: healthResult?.data || null,
              };
            } catch (healthError) {
              if (isAbortError(healthError) || abortController.signal.aborted) {
                appendAiMessage('Generazione annullata.', { type: 'system' });
                return { ok: false, aborted: true, userNotified: true };
              }
              console.error('[useCommandTerminal] healthChat error', healthError);
              appendAiMessage(
                'Non sono riuscito a salvare il dato salute in questo momento. Riprova tra poco: la chat resta attiva.',
                { type: 'ERROR', isError: true, sourceTag: 'healthChatService' },
              );
              return {
                ok: false,
                healthMode: true,
                reason: healthError?.message || 'health_chat_error',
                userNotified: true,
              };
            }
          }

          if (classified.route === 'SPLIT') {
            // Clinico in parallelo silenzioso; il pasto passa al motore nutrizione sotto.
            try {
              const healthResult = await processHealthChatMessage(resolvedText, {
                uid: healthUid || undefined,
                signal: abortController.signal,
                replyMode: 'silent_ack',
              });
              diabetesSplitAck = formatClinicalSaveAck(
                healthResult?.saved,
                healthResult?.data,
              ) || String(healthResult?.risposta_utente || '').trim();
            } catch (splitErr) {
              if (!(isAbortError(splitErr) || abortController.signal.aborted)) {
                console.warn('[useCommandTerminal] SPLIT clinical save failed', splitErr);
              }
            }
            // fall-through → NUTRITION
          }
          // NUTRITION / follow-up pasti / SPLIT: fall-through al controller pasti (RTDB + macro)
        }

        const imageOnly = !resolvedText && attachedImages.length > 0;
        const fallbackText =
          resolvedText ||
          'Analizza lo screenshot allegato dell app fitness/sonno (es. Xiaomi Fitness) ed estrai i dati per LOG_SLEEP.';
        let forcedIntent = String(options?.intent || '').trim().toUpperCase() || undefined;
        if (!forcedIntent && diabetesMode) {
          // Continuity pasti: elenco alimenti / follow-up / tap grammi → ADD_FOOD standard.
          const mealRoute = classified && typeof classified === 'object'
            ? classified
            : classifyDiabetesChatIntent(resolvedText, {
              chatHistory: priorHistory,
              wipMealItems: wipSnapshot.wipMealItems || [],
            });
          if (
            mealQuickReply
            || mealRoute.isMeal
            || mealRoute.isClarificationFollowUp
            || mealRoute.route === 'NUTRITION'
            || mealRoute.route === 'SPLIT'
          ) {
            forcedIntent = 'ADD_FOOD';
          }
        }
        if (!forcedIntent) {
          const pendingDraft = typeof controller.getPendingMealDraft === 'function'
            ? controller.getPendingMealDraft()
            : null;
          if (
            pendingDraft
            && expandFoodPayloadItems(pendingDraft).length > 0
            && isAskDraftAdviceIntent(resolvedText)
          ) {
            forcedIntent = 'ASK_DRAFT_ADVICE';
          }
        }
        if (!forcedIntent && imageOnly) forcedIntent = 'LOG_SLEEP';

        strategicGenerationRef.current = options?.forceStrategic === true
          || forcedIntent === 'REQUEST_HEALTH_DIAGNOSIS'
          || forcedIntent === 'ASK_DRAFT_ADVICE'
          || forcedIntent === 'ASK_MEAL_ADVICE'
          || forcedIntent === 'CONSULTANT_MEAL'
          || isStrategicAvatarIntent(resolvedText, priorHistory);

        const result = await controller.processUserMessage(fallbackText, {
          ...currentState,
          wipMealItems: wipSnapshot.wipMealItems || [],
          wipConstraints: wipSnapshot.constraints || null,
          mealWipActive: Boolean(wipSnapshot.mealWipActive),
        }, {
          images: attachedImages,
          intent: forcedIntent,
          mealTypeHint: options?.mealTypeHint || options?.mealType || null,
          mealType: options?.mealType || options?.mealTypeHint || null,
          chatHistory: historyForLlm,
          wipMealItems: wipSnapshot.wipMealItems || [],
          wipMealMealType: wipSnapshot.mealType || null,
          wipConstraints: wipSnapshot.constraints || null,
          mealWipActive: Boolean(wipSnapshot.mealWipActive),
          systemInstructionExtra: options?.systemInstructionExtra || null,
          signal: abortController.signal,
          fromQuickReply: Boolean(options?.fromQuickReply),
          clarificationReply: Boolean(options?.clarificationReply),
          fromVoice: Boolean(options?.fromVoice),
          wizardSelection: options?.wizardSelection && typeof options.wizardSelection === 'object'
            ? options.wizardSelection
            : null,
        });

        if (
          abortController.signal.aborted
          || generationToken !== generationTokenRef.current
          || result?.aborted
        ) {
          appendAiMessage('Generazione annullata.', { type: 'system' });
          return { ok: false, aborted: true, userNotified: true };
        }

        if (result?.wipSeed && typeof onWipMealSeedRef.current === 'function') {
          onWipMealSeedRef.current(result.wipSeed);
        }
        if (result?.openUi && typeof onManualShortcutFromChatRef.current === 'function') {
          onManualShortcutFromChatRef.current(result.openUi);
        }
        pendingMealUpdateRef.current = controller.getPendingMealUpdate();
        if (result && result.ok === false && !result.userNotified) {
          appendAiMessage('Scusa, ho avuto un problema a elaborare questa frase. Puoi riformularla?', {
            type: 'ERROR',
            isError: true,
          });
        }
        if (diabetesSplitAck) {
          appendAiMessage(diabetesSplitAck, {
            type: 'HEALTH_CHAT',
            sourceTag: 'healthChatService',
          });
        }
        return result;
      } catch (error) {
        if (isAbortError(error) || abortController.signal.aborted) {
          appendAiMessage('Generazione annullata.', { type: 'system' });
          return { ok: false, aborted: true, userNotified: true };
        }
        console.error('[useCommandTerminal] sendMessage error', error);
        appendAiMessage('Scusa, ho avuto un problema a elaborare questa frase. Puoi riformularla?', {
          type: 'ERROR',
          isError: true,
        });
        return { ok: false, reason: error?.message || 'send_message_error', userNotified: true };
      } finally {
        strategicGenerationRef.current = false;
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        if (generationToken === generationTokenRef.current) {
          setIsLoading(false);
        }
        syncActiveQuickRepliesFromController();
      }
    },
    [chatInput, chatImages, controller, syncActiveQuickRepliesFromController, appendAiMessage],
  );

  const sendMessageRef = useRef(sendMessage);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const handlePredictiveIntent = useCallback((intent, extra = {}) => {
    const resolved = resolvePredictiveIntentAction(String(intent || ''), {
      predictiveState: extra?.predictiveState,
      label: extra?.label,
    });
    if (!resolved) {
      return Promise.resolve({ ok: false, reason: 'unknown_predictive_intent' });
    }
    if (resolved.options?.snoozeOnly) {
      appendAiMessage('Ok, ti ricorderò più tardi. 💪', { type: 'system' });
      return Promise.resolve({ ok: true, snoozed: true });
    }
    const send = sendMessageRef.current;
    if (typeof send !== 'function') {
      return Promise.resolve({ ok: false, reason: 'send_message_unavailable' });
    }
    return send(resolved.userText, {
      ...resolved.options,
      fromPredictiveGreeting: true,
      fromQuickReply: true,
    });
  }, [appendAiMessage]);

  const tryEmitPredictiveGreeting = useCallback(() => {
    if (isLoading) return { ok: false, reason: 'processing' };

    const currentState =
      typeof getCurrentStateRef.current === 'function' ? getCurrentStateRef.current() ?? {} : {};
    const anchorDate = String(currentState.activeDate || getTodayString()).trim() || getTodayString();
    const history = chatHistoryRef.current || [];

    const ctx = getCurrentPredictiveContext({
      fullHistory: currentState.fullHistory || {},
      dailyLog: currentState.activeLog || [],
      manualNodes: currentState.manualNodes || [],
      anchorDate,
    });

    const decision = evaluatePredictiveGreetingDecision(history, ctx, { anchorDate });
    if (decision.action === 'skip') {
      return { ok: false, reason: 'conversation_gate', ctx };
    }

    const greeting = decision.action === 'clear_stale' ? null : buildPredictiveGreeting(ctx);
    if (decision.action !== 'clear_stale' && !greeting) {
      if (typeof setChatHistoryRef.current === 'function') {
        setChatHistoryRef.current((prev) => markPredictiveGreetingsSuperseded(prev));
      }
      return { ok: false, reason: 'no_template', ctx };
    }

    if (typeof setChatHistoryRef.current !== 'function') {
      return { ok: false, reason: 'chat_history_not_configured' };
    }

    const greetingMessage = greeting
      ? {
          sender: 'ai',
          type: PREDICTIVE_GREETING_TYPE,
          text: greeting.text,
          avatarAsset: greeting.avatarAsset,
          quickReplies: greeting.quickReplies,
          predictiveState: greeting.predictiveState,
          predictiveGreeting: true,
          anchorDate,
          createdAt: new Date().toISOString(),
        }
      : null;

    const applyGreeting = () => {
      setChatHistoryRef.current((prev) => {
        const withoutTyping = (prev || []).filter((entry) => !entry?.isTyping);
        const base = (decision.action === 'supersede' || decision.action === 'clear_stale')
          ? markPredictiveGreetingsSuperseded(withoutTyping)
          : withoutTyping;
        if (!greetingMessage) return base;
        return [...base, greetingMessage];
      });
    };

    setChatHistoryRef.current((prev) => {
      const base = (decision.action === 'supersede' || decision.action === 'clear_stale')
        ? markPredictiveGreetingsSuperseded(prev)
        : (prev || []);
      if (!greetingMessage) return base;
      return [...base, { sender: 'ai', isTyping: true }];
    });

    window.setTimeout(applyGreeting, 450);

    setActiveQuickReplies([]);
    return {
      ok: true,
      state: resolveEffectivePredictiveState(ctx),
      confidence: ctx.confidence,
      superseded: decision.action === 'supersede',
      cleared: decision.action === 'clear_stale',
    };
  }, [isLoading]);

  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    generationTokenRef.current += 1;
        setIsLoading(false);
  }, []);

  const handleDraftCancel = useCallback(
    (draftId) => {
      controller.cancelPendingAction();
      controller.clearPendingMealUpdate();
      pendingMealUpdateRef.current = null;
      resolveDraftMessage(draftId, { cancelled: true });
      setActiveQuickReplies(getChatFallbackQuickReplies());
      appendAiMessage('Inserimento annullato.', {
        type: 'system',
        quickReplies: getChatFallbackQuickReplies(),
      });
      return { ok: true, cancelled: true };
    },
    [controller, resolveDraftMessage, appendAiMessage],
  );

  const handleQuickReplyClick = useCallback(
    (text, extra = {}) => {
      if (extra?.predictiveIntent) {
        return handlePredictiveIntent(extra.predictiveIntent, extra);
      }

      const label = String(text ?? '').trim();
      if (!label) return Promise.resolve({ ok: false, reason: 'empty_quick_reply' });
      const wizardSelection = extra?.wizardSelection && typeof extra.wizardSelection === 'object'
        ? extra.wizardSelection
        : null;

      const snap = controller.getConversationSnapshot();

      if (snap.conversationState === CONVERSATION_STATE.AWAITING_WORKOUT_CONFLICT_RESOLUTION) {
        if (/^annulla\b/i.test(label)) {
          controller.resetConversationState();
          setActiveQuickReplies([]);
          appendAiMessage('Inserimento annullato.', {
            type: 'system',
            quickReplies: getChatFallbackQuickReplies(),
          });
          setActiveQuickReplies(getChatFallbackQuickReplies());
          return Promise.resolve({ ok: true, cancelled: true });
        }
        return sendMessage(label, { fromSlotQuickReply: true, wizardSelection });
      }

      if (snap.conversationState === CONVERSATION_STATE.AWAITING_WORKOUT_TIME) {
        return sendMessage(label, { fromSlotQuickReply: true, wizardSelection });
      }

      if (snap.conversationState === CONVERSATION_STATE.AWAITING_COFFEE_VARIANT) {
        return sendMessage(label, { fromSlotQuickReply: true, clarificationReply: true, wizardSelection });
      }

      const mcdriveIntent = extra?.predictiveIntent || extra?.intent;
      if (
        snap.activeWizard === ACTIVE_WIZARD.MCDRIVE_LOOP
        || snap.conversationState === CONVERSATION_STATE.AWAITING_MCDRIVE_SAVE_CONFIRM
        || snap.conversationState === CONVERSATION_STATE.AWAITING_MCDRIVE_MEAL_TYPE
      ) {
        if (mcdriveIntent === 'SET_MCDRIVE_MEAL_TYPE' || extra?.mealType) {
          return sendMessage(label, {
            intent: 'SET_MCDRIVE_MEAL_TYPE',
            mealType: extra?.mealType || null,
            skipUserBubble: true,
            fromQuickReply: true,
          });
        }
        if (
          mcdriveIntent === 'SAVE_MCDRIVE_MEAL'
          || /salva\s+(?:nel\s+)?(?:diario|pasto)/i.test(label)
        ) {
          return sendMessage('', {
            intent: 'SAVE_MCDRIVE_MEAL',
            skipUserBubble: true,
            fromQuickReply: true,
          });
        }
        if (
          mcdriveIntent === 'ADD_MORE_MCDRIVE'
          || /aggiungi\s+ancora/i.test(label)
        ) {
          return sendMessage('', {
            intent: 'ADD_MORE_MCDRIVE',
            skipUserBubble: true,
            fromQuickReply: true,
          });
        }
        if (
          mcdriveIntent === 'FINISH_MCDRIVE_WIZARD'
          || /calcola\s+valori/i.test(label)
          || /termina\s+e\s+salva/i.test(label)
        ) {
          return sendMessage('', {
            intent: 'FINISH_MCDRIVE_WIZARD',
            skipUserBubble: true,
            fromQuickReply: true,
          });
        }
        if (
          mcdriveIntent === 'CANCEL_MCDRIVE_WIZARD'
          || /^❌?\s*annulla\b/i.test(label)
        ) {
          return sendMessage('', {
            intent: 'CANCEL_MCDRIVE_WIZARD',
            skipUserBubble: true,
            fromQuickReply: true,
          });
        }
      }

      if (
        snap.conversationState === CONVERSATION_STATE.AWAITING_MEAL_BUILDER_STEP
        || snap.activeWizard === ACTIVE_WIZARD.MEAL_BUILDER
      ) {
        return sendMessage(label, {
          fromSlotQuickReply: true,
          fromQuickReply: true,
          wizardSelection: wizardSelection || { foodName: label },
        });
      }

      if (snap.conversationState === CONVERSATION_STATE.AWAITING_CONFIRMATION) {
        const draftId = snap.pendingAction?.draftId || null;
        const hasActiveWorkoutDraft = (chatHistoryRef.current || []).some(
          (m) => m.workoutDraft && !m.draftResolved,
        );

        const lastProposalEntry = [...(chatHistoryRef.current || [])]
          .reverse()
          .find((m) => Array.isArray(m?.mealProposals) && m.mealProposals.length > 0);
        const pendingProposal = lastProposalEntry
          ? (lastProposalEntry.mealProposals || []).find((p) => {
              const pid = String(p?.id || '');
              const loaded = new Set(lastProposalEntry.mealProposalsLoadedIds || []);
              return pid && !loaded.has(pid);
            })
          : null;

        if (
          pendingProposal
          && (/^s[iì]\s*,?\s*salva\b/i.test(label)
            || /^s[iì]\s*,\s*confermo\b/i.test(label)
            || /^s[iì]\s*,?\s*va\s+bene\b/i.test(label))
        ) {
          if (confirmingDraftRef.current) {
            return Promise.resolve({ ok: false, reason: 'confirm_in_flight' });
          }
          confirmingDraftRef.current = true;
          setActiveQuickReplies([]);
          return Promise.resolve(
            handleAcceptMealProposalRef.current?.(
              pendingProposal,
              0,
              lastProposalEntry.adviceId,
            ) ?? { ok: false, reason: 'accept_handler_missing' },
          ).finally(() => {
            confirmingDraftRef.current = false;
          });
        }

        if (
          /^s[iì]\s*,?\s*salva\b/i.test(label)
          || /^s[iì]\s*,\s*confermo\b/i.test(label)
          || /^s[iì]\s*,?\s*va\s+bene\b/i.test(label)
        ) {
          if (hasActiveWorkoutDraft && snap.pendingAction?.commandType === 'ADD_WORKOUT') {
            return Promise.resolve({ ok: false, reason: 'use_workout_card_confirm' });
          }
          // Preferisci conferma card meal proposal se presente.
          if (snap.pendingMealDraft || snap.pendingAction?.commandType === 'ADD_FOOD') {
            if (confirmingDraftRef.current) {
              return Promise.resolve({ ok: false, reason: 'confirm_in_flight' });
            }
            confirmingDraftRef.current = true;
            setActiveQuickReplies([]);
            applyDraftConfirmReplaceGuard(controller);
            return Promise.resolve(controller.confirmPendingAction()).finally(() => {
              confirmingDraftRef.current = false;
            });
          }
          if (confirmingDraftRef.current) {
            return Promise.resolve({ ok: false, reason: 'confirm_in_flight' });
          }
          confirmingDraftRef.current = true;
          if (draftId) resolveDraftMessage(draftId);
          setActiveQuickReplies([]);
          applyDraftConfirmReplaceGuard(controller);
          return Promise.resolve(controller.confirmPendingAction()).finally(() => {
            confirmingDraftRef.current = false;
          });
        }
        if (/^(?:no\s*,\s*)?annulla\b/i.test(label)) {
          return Promise.resolve(handleDraftCancel(draftId));
        }
        if (/^modifica\b/i.test(label)) {
          if (hasActiveWorkoutDraftInChat() && snap.pendingAction?.commandType === 'ADD_WORKOUT') {
            appendAiMessage('Modifica i dati nella card qui sopra, poi conferma.');
            return Promise.resolve({ ok: true, awaiting: true, reason: 'inline_workout_edit' });
          }
          // Bozza interattiva: righe cliccabili sulla card.
          if (typeof setChatHistoryRef.current === 'function') {
            setChatHistoryRef.current((prev) => {
              const list = Array.isArray(prev) ? [...prev] : [];
              for (let i = list.length - 1; i >= 0; i -= 1) {
                if (Array.isArray(list[i]?.mealProposals) && list[i].mealProposals.length > 0) {
                  list[i] = { ...list[i], mealDraftInteractiveEdit: true };
                  break;
                }
              }
              return list;
            });
          }
          return Promise.resolve(controller.enableMealDraftInteractiveEdit());
        }
      }

      return sendMessage(label, {
        fromSlotQuickReply: true,
        clarificationReply: Boolean(wizardSelection),
        wizardSelection,
      });
    },
    [controller, handleDraftCancel, resolveDraftMessage, sendMessage, appendAiMessage, hasActiveWorkoutDraftInChat, handlePredictiveIntent],
  );

  const handleDraftConfirm = useCallback(
    async (draftId) => {
      if (confirmingDraftRef.current) {
        return { ok: false, reason: 'confirm_in_flight' };
      }
      const snap = controller.getConversationSnapshot();
      if (snap.conversationState !== CONVERSATION_STATE.AWAITING_CONFIRMATION) {
        return { ok: false, reason: 'no_pending_draft' };
      }
      if (snap.pendingAction?.draftId && draftId && snap.pendingAction.draftId !== draftId) {
        return { ok: false, reason: 'stale_draft_confirm' };
      }
      // ADD_WORKOUT: conferma solo via card inline — mai aprire drawer/cassetto nativo.
      confirmingDraftRef.current = true;
      try {
        resolveDraftMessage(draftId);
        setActiveQuickReplies([]);
        applyDraftConfirmReplaceGuard(controller);
        return controller.confirmPendingAction();
      } finally {
        confirmingDraftRef.current = false;
      }
    },
    [controller, resolveDraftMessage],
  );

  const handleDraftRemoveItem = useCallback(
    (draftId, itemIndex) => {
      const updated = controller.removePendingFoodItem(itemIndex);
      if (!updated) {
        resolveDraftMessage(draftId, { cancelled: true });
        setActiveQuickReplies([]);
        if (controller.getConversationSnapshot().conversationState === CONVERSATION_STATE.IDLE) {
          appendAiMessage('Bozza annullata (nessun alimento rimasto).', { type: 'system' });
        }
        return { ok: true, cancelled: true };
      }
      syncDraftMessageInChat(draftId, updated);
      return { ok: true, mealDraft: updated };
    },
    [controller, resolveDraftMessage, syncDraftMessageInChat, appendAiMessage],
  );

  const handleDraftUpdateItemGrams = useCallback(
    (draftId, itemIndex, grams) => {
      const updated = controller.updatePendingFoodItemGrams(itemIndex, grams);
      if (!updated) return { ok: false, reason: 'invalid_draft_update' };
      syncDraftMessageInChat(draftId, updated, buildMealDraftUiMessage(updated.payload));
      return { ok: true, mealDraft: updated };
    },
    [controller, syncDraftMessageInChat],
  );

  const handleDraftUpdateMealMeta = useCallback(
    (draftId, { mealType, exactTime } = {}) => {
      const updated = controller.updatePendingFoodMealMeta({ mealType, exactTime });
      if (!updated) return { ok: false, reason: 'invalid_draft_meta_update' };
      syncDraftMessageInChat(draftId, updated, buildMealDraftUiMessage(updated.payload));
      return { ok: true, mealDraft: updated };
    },
    [controller, syncDraftMessageInChat],
  );

  const handleDraftUpdateFoodItemName = useCallback(
    (draftId, itemIndex, foodName) => {
      const updated = controller.updatePendingFoodItemName(itemIndex, foodName);
      if (!updated) return { ok: false, reason: 'invalid_draft_food_name_update' };
      syncDraftMessageInChat(draftId, updated, buildMealDraftUiMessage(updated.payload));
      return { ok: true, mealDraft: updated };
    },
    [controller, syncDraftMessageInChat],
  );

  const handleWorkoutDraftUpdateMeta = useCallback(
    (draftId, { workoutName, durationMinutes, exactTime, estimatedKcal } = {}) => {
      const currentState =
        typeof getCurrentStateRef.current === 'function' ? getCurrentStateRef.current() ?? {} : {};
      const updated = controller.updatePendingWorkoutMeta({
        workoutName,
        durationMinutes,
        exactTime,
        estimatedKcal,
      }, currentState);
      if (!updated) return { ok: false, reason: 'invalid_workout_draft_meta_update' };
      syncDraftMessageInChat(draftId, updated, buildWorkoutDraftUiMessage(updated.payload));
      return { ok: true, workoutDraft: updated };
    },
    [controller, syncDraftMessageInChat],
  );

  const handleWorkoutDraftUpdateExercise = useCallback(
    (draftId, itemIndex, fields) => {
      const updated = controller.updatePendingWorkoutExercise(itemIndex, fields);
      if (!updated) return { ok: false, reason: 'invalid_workout_exercise_update' };
      syncDraftMessageInChat(draftId, updated, buildWorkoutDraftUiMessage(updated.payload));
      return { ok: true, workoutDraft: updated };
    },
    [controller, syncDraftMessageInChat],
  );

  const handleWorkoutDraftRemoveExercise = useCallback(
    (draftId, itemIndex) => {
      const updated = controller.removePendingWorkoutExercise(itemIndex);
      if (!updated) {
        resolveDraftMessage(draftId, { cancelled: true });
        setActiveQuickReplies([]);
        if (controller.getConversationSnapshot().conversationState === CONVERSATION_STATE.IDLE) {
          appendAiMessage('Bozza annullata (nessun esercizio rimasto).', { type: 'system' });
        }
        return { ok: true, cancelled: true };
      }
      syncDraftMessageInChat(draftId, updated, buildWorkoutDraftUiMessage(updated.payload));
      return { ok: true, workoutDraft: updated };
    },
    [controller, resolveDraftMessage, syncDraftMessageInChat, appendAiMessage],
  );

  const handleAcceptAdvice = useCallback(async (suggestedAction, adviceId) => {
    if (!suggestedAction || typeof suggestedAction !== 'object') {
      return { ok: false, reason: 'missing_suggested_action' };
    }

    const foodName = String(suggestedAction.foodName || '').trim();
    const grams = Math.max(1, Math.round(Number(suggestedAction.grams) || 0));
    const mealType = String(suggestedAction.mealType || 'pranzo').trim().toLowerCase();

    if (!foodName || !Number.isFinite(grams) || grams <= 0) {
      return { ok: false, reason: 'invalid_suggested_action' };
    }

    if (typeof setChatHistoryRef.current === 'function' && adviceId) {
      setChatHistoryRef.current((prev) =>
        (prev || []).map((entry) =>
          entry.adviceId === adviceId
            ? { ...entry, suggestedAction: null, adviceAccepted: true }
            : entry,
        ),
      );
    }

    const payload = { foodName, grams, mealType };

    try {
      commandBus.publish(DISPATCH_ADD_FOOD, payload, {
        source: 'useCommandTerminal',
        correlationId: 'advice_accept',
        dedupeKey: { adviceId: adviceId || foodName, foodName, grams, mealType },
      });
      appendAiMessage('Inserito come suggerito.', { type: 'system' });
      return { ok: true };
    } catch (error) {
      const reason = `Advice accept failure: ${error?.message || 'unknown error'}`;
      commandBus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason, command: payload },
        { source: 'useCommandTerminal' },
      );
      return { ok: false, reason };
    }
  }, [appendAiMessage]);

  const handleAcceptMealProposal = useCallback(async (proposal, proposalIndex, adviceId) => {
    if (!proposal || typeof proposal !== 'object') {
      return { ok: false, reason: 'missing_meal_proposal' };
    }

    const mealType = String(proposal.mealType || 'pranzo').trim().toLowerCase();
    let upsertAction = resolveUpsertActionFromPayload(proposal);
    const baselineItems = Array.isArray(proposal.baselineItems) ? proposal.baselineItems : [];
    const operations = Array.isArray(proposal.operations) ? proposal.operations : [];

    // Salvagente: existingMealNode → la proposal/bozza è il pasto intero → replace.
    const pendingUpdate = typeof controller.getPendingMealUpdate === 'function'
      ? controller.getPendingMealUpdate()
      : pendingMealUpdateRef.current;
    const existingTarget = String(
      pendingUpdate?.existingMealNode?.targetNodeId
      || pendingUpdate?.targetNodeId
      || proposal.targetNodeId
      || '',
    ).trim();
    if (pendingUpdate?.existingMealNode && existingTarget) {
      upsertAction = 'replace';
    }

    let sourceItems;
    if (operations.length > 0) {
      sourceItems = applyMealOperations(baselineItems, operations);
    } else if (upsertAction === 'merge' && baselineItems.length > 0) {
      const incoming = Array.isArray(proposal.items) ? proposal.items : [];
      // Se items già include il baseline (resulting), usali; altrimenti merge.
      const looksComplete = incoming.length >= baselineItems.length;
      sourceItems = looksComplete
        ? incoming
        : mergeMealItems(baselineItems, incoming);
    } else if (Array.isArray(proposal.resultingItems) && proposal.resultingItems.length > 0) {
      sourceItems = proposal.resultingItems;
    } else {
      sourceItems = Array.isArray(proposal.items) ? proposal.items : [];
    }

    const proposalId = String(proposal.id || `proposal_${proposalIndex ?? 0}`);

    const payloadItems = sourceItems
      .map((item) => {
        const foodName = String(item?.foodName || item?.name || '').trim();
        const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta) || 0));
        const foodDbKey = item?.foodDbKey != null ? String(item.foodDbKey).trim() : '';
        if (!foodName || !Number.isFinite(grams) || grams <= 0) return null;
        return {
          foodName,
          grams,
          ...(foodDbKey ? { foodDbKey, matchedKey: foodDbKey } : {}),
        };
      })
      .filter(Boolean);

    if (payloadItems.length === 0) {
      return { ok: false, reason: 'empty_meal_proposal' };
    }

    // Per merge: invia solo i nuovi items se operations sono solo add.
    let itemsForCommit = payloadItems;
    if (upsertAction === 'merge' && operations.length > 0 && operations.every((op) => String(op?.action || '').toLowerCase() === 'add')) {
      const added = applyMealOperations([], operations.filter((op) => String(op?.action || '').toLowerCase() === 'add'));
      const mapped = added
        .map((item) => {
          const foodName = String(item?.foodName || item?.name || '').trim();
          const grams = Math.max(1, Math.round(Number(item?.grams) || 0));
          if (!foodName || grams <= 0) return null;
          const foodDbKey = item?.foodDbKey != null ? String(item.foodDbKey).trim() : '';
          return {
            foodName,
            grams,
            ...(foodDbKey ? { foodDbKey, matchedKey: foodDbKey } : {}),
          };
        })
        .filter(Boolean);
      if (mapped.length > 0) itemsForCommit = mapped;
    }

    const stateBeforeCommit =
      typeof getCurrentStateRef.current === 'function' ? (getCurrentStateRef.current() ?? {}) : {};
    const mealTotals = proposal.totals && typeof proposal.totals === 'object'
      ? proposal.totals
      : sumMealItemsMacros(sourceItems);
    const projection = projectNutritionAfterMeal(stateBeforeCommit, mealTotals);

    const exactTime = String(proposal.exactTime || proposal.timeString || '').trim();
    const targetNodeId = existingTarget || String(proposal.targetNodeId || '').trim();

    const payload = {
      mealType,
      items: itemsForCommit,
      action: upsertAction,
      upsertAction,
      source: proposal.source || null,
      operations,
      ...(exactTime ? { timeString: exactTime, exactTime } : {}),
      ...(targetNodeId ? { targetNodeId } : {}),
      // Propaga flag: nuovo pasto → snack_2 / pranzo_2 invece di merge nello slot canonico.
      ...(proposal.forceNewMealSlot === true || (upsertAction === 'append' && !targetNodeId)
        ? { forceNewMealSlot: true }
        : {}),
    };

    const trackerDate = String(stateBeforeCommit?.activeDate || '').trim();
    const mealCommitFingerprint = buildMealCommitFingerprint(payload, trackerDate);

    if (typeof setChatHistoryRef.current === 'function' && adviceId) {
      setChatHistoryRef.current((prev) =>
        (prev || []).map((entry) => {
          if (entry.adviceId !== adviceId) return entry;
          const loaded = new Set(entry.mealProposalsLoadedIds || []);
          loaded.add(proposalId);
          return {
            ...entry,
            mealProposalsLoadedIds: Array.from(loaded),
          };
        }),
      );
    }

    controller.clearPendingMealUpdate();
    pendingMealUpdateRef.current = null;
    if (typeof controller.clearPendingMealDraft === 'function') {
      controller.clearPendingMealDraft();
    }
    if (typeof controller.clearMealWizardState === 'function') {
      controller.clearMealWizardState();
    }
    if (typeof controller.resetConversationState === 'function') {
      controller.resetConversationState();
    }
    setActiveQuickReplies([]);

    try {
      commandBus.publish(DISPATCH_UPSERT_MEAL, payload, {
        source: 'useCommandTerminal',
        correlationId: upsertAction === 'merge'
          ? 'meal_proposal_merge'
          : (targetNodeId || upsertAction === 'replace'
            ? 'meal_proposal_update'
            : 'meal_proposal_accept'),
        dedupeKey: mealCommitFingerprint || {
          adviceId: adviceId || proposalId,
          proposalId,
          mealType,
          action: upsertAction,
          items: itemsForCommit,
          ...(targetNodeId ? { targetNodeId } : {}),
        },
        dedupeWindowMs: 5000,
      });
      const label = String(proposal.label || proposal.name || mealType).trim();
      if (upsertAction === 'merge') {
        appendAiMessage(`✅ Aggiunto al ${mealType}: ${label}.`, {
          type: 'system',
          systemIcon: 'meal',
        });
      } else if (upsertAction === 'replace' || targetNodeId) {
        appendAiMessage(`✅ Pasto aggiornato: ${label}.`, {
          type: 'system',
          systemIcon: 'meal',
        });
      } else {
        const mealReceipt = buildMealReceiptPayload({
          items: Array.isArray(proposal.items) ? proposal.items : itemsForCommit,
          mealType,
          timeString: exactTime,
          mealTotals,
          projection,
        });
        appendAiMessage(mealReceiptFallbackText(mealReceipt), {
          type: 'MEAL_RECEIPT',
          mealReceipt,
        });
      }
      return { ok: true };
    } catch (error) {
      const reason = `Meal proposal accept failure: ${error?.message || 'unknown error'}`;
      commandBus.publish(
        DISPATCH_COMMAND_REJECTED,
        { reason, command: payload },
        { source: 'useCommandTerminal' },
      );
      return { ok: false, reason };
    }
  }, [appendAiMessage, controller]);

  useEffect(() => {
    handleAcceptMealProposalRef.current = handleAcceptMealProposal;
  }, [handleAcceptMealProposal]);

  const handleEnableMealDraftInteractiveEdit = useCallback(() => {
    if (typeof setChatHistoryRef.current === 'function') {
      setChatHistoryRef.current((prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        for (let i = list.length - 1; i >= 0; i -= 1) {
          if (Array.isArray(list[i]?.mealProposals) && list[i].mealProposals.length > 0) {
            list[i] = { ...list[i], mealDraftInteractiveEdit: true };
            break;
          }
        }
        return list;
      });
    }
    return controller.enableMealDraftInteractiveEdit();
  }, [controller]);

  const handleRequestMealItemEdit = useCallback((itemIndex, _item, _meta = {}) => {
    const state =
      typeof getCurrentStateRef.current === 'function' ? (getCurrentStateRef.current() ?? {}) : {};
    if (typeof setChatHistoryRef.current === 'function') {
      setChatHistoryRef.current((prev) =>
        (prev || []).map((entry) => (
          entry?.mealDraftInteractiveEdit
            ? { ...entry, mealDraftInteractiveEdit: false }
            : entry
        )),
      );
    }
    setActiveQuickReplies([]);
    return controller.startIsolatedFoodItemWizard(itemIndex, state);
  }, [controller]);

  const handleCancelMealDraftProposal = useCallback(() => {
    controller.resetConversationState();
    setActiveQuickReplies([]);
    if (typeof setChatHistoryRef.current === 'function') {
      setChatHistoryRef.current((prev) =>
        (prev || []).map((entry) => (
          Array.isArray(entry?.mealProposals) && entry.mealProposals.length > 0
            ? { ...entry, mealProposalsLoadedIds: (entry.mealProposals || []).map((p) => String(p.id || '')), mealDraftInteractiveEdit: false }
            : entry
        )),
      );
    }
    appendAiMessage('Ok, bozza annullata.', {
      type: 'system',
      quickReplies: getChatFallbackQuickReplies(),
    });
    setActiveQuickReplies(getChatFallbackQuickReplies());
    return { ok: true, cancelled: true };
  }, [appendAiMessage, controller]);

  const syncMcDriveTrayInChat = useCallback((liveMealTray) => {
    if (!liveMealTray || typeof setChatHistoryRef.current !== 'function') return;
    setChatHistoryRef.current((prev) => upsertMcDriveTrayChatEntry(prev, {
      tray: liveMealTray,
      keepText: true,
    }));
  }, []);

  const handleMcDriveRemoveItem = useCallback((index) => {
    if (typeof controller.removeMcDriveDraftItem !== 'function') {
      return { ok: false, reason: 'mcdrive_remove_unavailable' };
    }
    const result = controller.removeMcDriveDraftItem(index);
    if (result?.liveMealTray) syncMcDriveTrayInChat(result.liveMealTray);
    return result;
  }, [controller, syncMcDriveTrayInChat]);

  const handleMcDriveUpdateGrams = useCallback((index, grams) => {
    if (typeof controller.updateMcDriveDraftItemGrams !== 'function') {
      return { ok: false, reason: 'mcdrive_update_unavailable' };
    }
    const result = controller.updateMcDriveDraftItemGrams(index, grams);
    if (result?.liveMealTray) syncMcDriveTrayInChat(result.liveMealTray);
    return result;
  }, [controller, syncMcDriveTrayInChat]);

  const handleMcDriveApplyAlternative = useCallback((index, alternative) => {
    if (typeof controller.applyMcDriveDraftAlternative !== 'function') {
      return { ok: false, reason: 'mcdrive_alt_unavailable' };
    }
    const result = controller.applyMcDriveDraftAlternative(index, alternative);
    if (result?.liveMealTray) syncMcDriveTrayInChat(result.liveMealTray);
    return result;
  }, [controller, syncMcDriveTrayInChat]);

  const handleMcDriveReplaceFromSearch = useCallback((index, searchResult) => {
    if (typeof controller.replaceMcDriveDraftItemFromSearch !== 'function') {
      return { ok: false, reason: 'mcdrive_replace_unavailable' };
    }
    const result = controller.replaceMcDriveDraftItemFromSearch(index, searchResult);
    if (result?.liveMealTray) syncMcDriveTrayInChat(result.liveMealTray);
    return result;
  }, [controller, syncMcDriveTrayInChat]);

  const handleChatUsdaEnrichmentSelect = useCallback(async (match) => {
    const resume = chatUsdaResumeRef.current;
    chatUsdaResumeRef.current = null;
    setChatUsdaEnrichmentSession(null);
    if (typeof resume !== 'function') return;
    try {
      await resume(match);
    } catch (error) {
      console.warn('[useCommandTerminal] chat USDA resume (select) failed', error);
    }
  }, []);

  const handleChatUsdaEnrichmentSkip = useCallback(async () => {
    const resume = chatUsdaResumeRef.current;
    chatUsdaResumeRef.current = null;
    setChatUsdaEnrichmentSession(null);
    if (typeof resume !== 'function') return;
    try {
      await resume(null);
    } catch (error) {
      console.warn('[useCommandTerminal] chat USDA resume (skip) failed', error);
    }
  }, []);

  return {
    chatHistory,
    setChatHistory,
    sendMessage,
    cancelGeneration,
    isLoading,
    isProcessing: isLoading,
    chatInput,
    setChatInput,
    chatImages,
    setChatImages,
    activeQuickReplies,
    handleQuickReplyClick,
    handleAcceptAdvice,
    handleAcceptMealProposal,
    handleEnableMealDraftInteractiveEdit,
    handleRequestMealItemEdit,
    handleCancelMealDraftProposal,
    handleDraftConfirm,
    handleDraftCancel,
    handleDraftRemoveItem,
    handleDraftUpdateItemGrams,
    handleDraftUpdateMealMeta,
    handleDraftUpdateFoodItemName,
    handleWorkoutDraftUpdateMeta,
    handleWorkoutDraftUpdateExercise,
    handleWorkoutDraftRemoveExercise,
    handleSaveNewFoodEntry,
    handleMcDriveRemoveItem,
    handleMcDriveUpdateGrams,
    handleMcDriveApplyAlternative,
    handleMcDriveReplaceFromSearch,
    chatUsdaEnrichmentSession,
    handleChatUsdaEnrichmentSelect,
    handleChatUsdaEnrichmentSkip,
    tryEmitPredictiveGreeting,
    handlePredictiveIntent,
    getConversationSnapshot: () => controller.getConversationSnapshot(),
    resetConversationState,
  };
}
