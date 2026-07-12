import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { commandBus } from '../dispatcher/CommandBus.js';
import { ContextComposer } from '../context/ContextComposer.js';
import { GeminiStructuredClient } from '../llm/GeminiStructuredClient.js';
import { CommandTerminalController } from '../CommandTerminalController.js';
import {
  DISPATCH_ADD_FOOD,
  DISPATCH_COMMAND_REJECTED,
  DISPATCH_LOG_SLEEP,
  DISPATCH_SYSTEM_MESSAGE,
} from '../contracts/eventTypes.js';
import { initNutritionHandlers } from '../handlers/NutritionCommandHandler.js';
import { initWorkoutHandlers } from '../handlers/WorkoutCommandHandler.js';
import { quickRepliesForConversationState, CONVERSATION_STATE, buildMealDraftUiMessage } from '../conversation/conversationState.js';
import { enrichMealDraftWithHistoricalVariations } from '../conversation/recentFoodNames.js';

export function useCommandTerminal({
  chatHistory,
  setChatHistory,
  getCurrentState = null,
  onAddFoodCommand = null,
  onAddWorkoutCommand = null,
  onLogSleepCommand = null,
} = {}) {
  const [chatInput, setChatInput] = useState('');
  const [chatImages, setChatImages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeQuickReplies, setActiveQuickReplies] = useState([]);

  const setChatHistoryRef = useRef(setChatHistory);
  const chatHistoryRef = useRef(chatHistory);
  useEffect(() => {
    setChatHistoryRef.current = setChatHistory;
  }, [setChatHistory]);

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  const appendAiMessage = useCallback((text, extra = {}) => {
    const line = String(text || '').trim();
    if (!line || typeof setChatHistoryRef.current !== 'function') return;
    setChatHistoryRef.current((prev) => [
      ...(prev || []),
      { sender: 'ai', text: line, ...(extra && typeof extra === 'object' ? extra : {}) },
    ]);
  }, []);

  const onAddFoodRef = useRef(onAddFoodCommand);
  const onAddWorkoutRef = useRef(onAddWorkoutCommand);
  const onLogSleepRef = useRef(onLogSleepCommand);

  useEffect(() => {
    onAddFoodRef.current = onAddFoodCommand;
  }, [onAddFoodCommand]);

  useEffect(() => {
    onAddWorkoutRef.current = onAddWorkoutCommand;
  }, [onAddWorkoutCommand]);

  useEffect(() => {
    onLogSleepRef.current = onLogSleepCommand;
  }, [onLogSleepCommand]);

  const getCurrentStateRef = useRef(getCurrentState);
  useEffect(() => {
    getCurrentStateRef.current = getCurrentState;
  }, [getCurrentState]);

  const controller = useMemo(() => {
    const llmClient = new GeminiStructuredClient();
    return new CommandTerminalController({
      bus: commandBus,
      llmClient,
      composer: new ContextComposer(),
    });
  }, []);

  const syncDraftMessageInChat = useCallback((draftId, mealDraft, summaryText) => {
    if (!draftId || typeof setChatHistoryRef.current !== 'function') return;
    const currentState =
      typeof getCurrentStateRef.current === 'function' ? getCurrentStateRef.current() ?? {} : {};
    const enrichedMealDraft = enrichMealDraftWithHistoricalVariations(mealDraft, currentState, {
      limit: 5,
    });
    setChatHistoryRef.current((prev) =>
      (prev || []).map((entry) =>
        entry.draftId === draftId
          ? {
              ...entry,
              mealDraft: enrichedMealDraft,
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
              draftResolved: true,
              draftCancelled: cancelled,
            }
          : entry,
      ),
    );
  }, []);

  const syncActiveQuickRepliesFromController = useCallback(() => {
    const { conversationState } = controller.getConversationSnapshot();
    setActiveQuickReplies(quickRepliesForConversationState(conversationState));
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
        setActiveQuickReplies(
          Array.isArray(payload.quickReplies) && payload.quickReplies.length > 0
            ? payload.quickReplies
            : quickRepliesForConversationState(CONVERSATION_STATE.AWAITING_CONFIRMATION),
        );
        return;
      }
      const text = String(payload.text || payload.message || '').trim();
      if (!text) return;
      appendAiMessage(text, {
        type: payload.type || null,
        suggestedAction: payload.suggestedAction || null,
        mealProposals: Array.isArray(payload.mealProposals) ? payload.mealProposals : null,
        adviceId: payload.adviceId || null,
        isError: payload.type === 'ERROR',
      });
    });

    const unsubscribeRejected = commandBus.subscribe(DISPATCH_COMMAND_REJECTED, (envelope) => {
      if (envelope?.payload?.silent) return;
      const reason = String(envelope?.payload?.reason || 'Comando rifiutato.').trim();
      appendAiMessage(`⚠️ ${reason}`);
    });

    return () => {
      unsubscribeLogSleep();
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
  }, [appendAiMessage]);

  const sendMessage = useCallback(
    async (text, options = {}) => {
      if (typeof setChatHistoryRef.current !== 'function') {
        return { ok: false, reason: 'chat_history_not_configured' };
      }

      const resolvedText = String(text ?? chatInput ?? '').trim();
      const attachedImages = Array.isArray(options?.images) && options.images.length > 0
        ? options.images
        : chatImages;
      if (!resolvedText && attachedImages.length === 0) {
        return { ok: false, reason: 'empty_message' };
      }

      const userBubbleText =
        resolvedText || `📷 ${attachedImages.length} immagine/i allegata/e`;
      const priorHistory = chatHistoryRef.current || [];
      setChatHistoryRef.current((prev) => [...(prev || []), { sender: 'user', text: userBubbleText }]);
      // History completa (inclusi mealProposals/mealDraft): serializzazione memoria in
      // buildGeminiContentsFromChatHistory prima della chiamata LLM.
      const historyForLlm = [...priorHistory, { sender: 'user', text: userBubbleText }];
      setChatInput('');
      setChatImages([]);
      setIsLoading(true);
      try {
        const currentState =
          typeof getCurrentStateRef.current === 'function' ? getCurrentStateRef.current() : {};
        const imageOnly = !resolvedText && attachedImages.length > 0;
        const fallbackText =
          resolvedText ||
          'Analizza lo screenshot allegato dell app fitness/sonno (es. Xiaomi Fitness) ed estrai i dati per LOG_SLEEP.';
        const result = await controller.processUserMessage(fallbackText, currentState, {
          images: attachedImages,
          intent: imageOnly ? 'LOG_SLEEP' : undefined,
          chatHistory: historyForLlm,
        });
        if (result && result.ok === false && !result.userNotified) {
          appendAiMessage('Scusa, ho avuto un problema a elaborare questa frase. Puoi riformularla?', {
            type: 'ERROR',
            isError: true,
          });
        }
        return result;
      } catch (error) {
        console.error('[useCommandTerminal] sendMessage error', error);
        appendAiMessage('Scusa, ho avuto un problema a elaborare questa frase. Puoi riformularla?', {
          type: 'ERROR',
          isError: true,
        });
        return { ok: false, reason: error?.message || 'send_message_error', userNotified: true };
      } finally {
        setIsLoading(false);
        syncActiveQuickRepliesFromController();
      }
    },
    [chatInput, chatImages, controller, syncActiveQuickRepliesFromController],
  );

  const handleDraftCancel = useCallback(
    (draftId) => {
      controller.cancelPendingAction();
      resolveDraftMessage(draftId, { cancelled: true });
      setActiveQuickReplies([]);
      appendAiMessage('Inserimento annullato.');
      return { ok: true, cancelled: true };
    },
    [controller, resolveDraftMessage, appendAiMessage],
  );

  const handleQuickReplyClick = useCallback(
    (text) => {
      const label = String(text ?? '').trim();
      if (!label) return Promise.resolve({ ok: false, reason: 'empty_quick_reply' });

      const snap = controller.getConversationSnapshot();
      if (snap.conversationState === CONVERSATION_STATE.AWAITING_CONFIRMATION) {
        const draftId = snap.pendingAction?.draftId || null;
        if (/^s[iì]\s*,\s*salva\b/i.test(label) || /^s[iì]\s*,\s*confermo\b/i.test(label)) {
          if (draftId) resolveDraftMessage(draftId);
          setActiveQuickReplies([]);
          return Promise.resolve(controller.confirmPendingAction());
        }
        if (/^no\s*,\s*annulla\b/i.test(label)) {
          return Promise.resolve(handleDraftCancel(draftId));
        }
        if (/^modifica\b/i.test(label)) {
          return sendMessage(label, { fromSlotQuickReply: true });
        }
      }

      return sendMessage(label, { fromSlotQuickReply: true });
    },
    [controller, handleDraftCancel, resolveDraftMessage, sendMessage],
  );

  const handleDraftConfirm = useCallback(
    async (draftId) => {
      const snap = controller.getConversationSnapshot();
      if (snap.conversationState !== CONVERSATION_STATE.AWAITING_CONFIRMATION) {
        return { ok: false, reason: 'no_pending_draft' };
      }
      resolveDraftMessage(draftId);
      setActiveQuickReplies([]);
      return controller.confirmPendingAction();
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
          appendAiMessage('Bozza annullata (nessun alimento rimasto).');
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
      appendAiMessage('Inserito come suggerito.');
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
    const items = Array.isArray(proposal.items) ? proposal.items : [];
    const proposalId = String(proposal.id || `proposal_${proposalIndex ?? 0}`);

    const payloadItems = items
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

    const exactTime = String(proposal.exactTime || proposal.timeString || '').trim();
    const payload = {
      mealType,
      items: payloadItems,
      ...(exactTime ? { timeString: exactTime, exactTime } : {}),
    };

    try {
      commandBus.publish(DISPATCH_ADD_FOOD, payload, {
        source: 'useCommandTerminal',
        correlationId: 'meal_proposal_accept',
        dedupeKey: {
          adviceId: adviceId || proposalId,
          proposalId,
          mealType,
          items: payloadItems,
        },
      });
      appendAiMessage(`✅ Pasto caricato: ${String(proposal.label || proposal.name || mealType).trim()}.`);
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
  }, [appendAiMessage]);

  const handleModifyMealProposal = useCallback((proposal) => {
    const items = Array.isArray(proposal?.items) ? proposal.items : [];
    const parts = items
      .map((item) => {
        const name = String(item?.foodName || item?.name || '').trim();
        const grams = Math.round(Number(item?.grams ?? item?.qta) || 0);
        return grams > 0 && name ? `${name} ${grams}g` : name;
      })
      .filter(Boolean);
    const query = parts.length > 0
      ? `Modifica pasto: ${parts.join(', ')}`
      : `Modifica pasto: ${String(proposal?.label || 'proposta').trim()}`;
    setChatInput(query);
    return { ok: true, query };
  }, []);

  return {
    chatHistory,
    setChatHistory,
    sendMessage,
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
    handleModifyMealProposal,
    handleDraftConfirm,
    handleDraftCancel,
    handleDraftRemoveItem,
    handleDraftUpdateItemGrams,
    handleDraftUpdateMealMeta,
    handleDraftUpdateFoodItemName,
    getConversationSnapshot: () => controller.getConversationSnapshot(),
    resetConversationState,
  };
}
