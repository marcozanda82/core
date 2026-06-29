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
import { quickRepliesForConversationState } from '../conversation/conversationState.js';

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
  useEffect(() => {
    setChatHistoryRef.current = setChatHistory;
  }, [setChatHistory]);

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
      const text = String(payload.text || payload.message || '').trim();
      if (!text) return;
      appendAiMessage(text, {
        type: payload.type || null,
        suggestedAction: payload.suggestedAction || null,
        adviceId: payload.adviceId || null,
      });
    });

    const unsubscribeRejected = commandBus.subscribe(DISPATCH_COMMAND_REJECTED, (envelope) => {
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
      setChatHistoryRef.current((prev) => [...(prev || []), { sender: 'user', text: userBubbleText }]);
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
        return await controller.processUserMessage(fallbackText, currentState, {
          images: attachedImages,
          intent: imageOnly ? 'LOG_SLEEP' : undefined,
        });
      } finally {
        setIsLoading(false);
        syncActiveQuickRepliesFromController();
      }
    },
    [chatInput, chatImages, controller, syncActiveQuickRepliesFromController],
  );

  const handleQuickReplyClick = useCallback(
    (text) => {
      const label = String(text ?? '').trim();
      if (!label) return Promise.resolve({ ok: false, reason: 'empty_quick_reply' });
      return sendMessage(label, { fromSlotQuickReply: true });
    },
    [sendMessage],
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

  return {
    chatHistory,
    setChatHistory,
    sendMessage,
    isLoading,
    chatInput,
    setChatInput,
    chatImages,
    setChatImages,
    activeQuickReplies,
    handleQuickReplyClick,
    handleAcceptAdvice,
    getConversationSnapshot: () => controller.getConversationSnapshot(),
    resetConversationState,
  };
}
