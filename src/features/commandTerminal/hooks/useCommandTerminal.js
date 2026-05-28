import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { commandBus } from '../dispatcher/CommandBus.js';
import { ContextComposer } from '../context/ContextComposer.js';
import { GeminiStructuredClient } from '../llm/GeminiStructuredClient.js';
import { CommandTerminalController } from '../CommandTerminalController.js';
import {
  DISPATCH_COMMAND_REJECTED,
  DISPATCH_LOG_SLEEP,
  DISPATCH_SYSTEM_MESSAGE,
} from '../contracts/eventTypes.js';
import { initNutritionHandlers } from '../handlers/NutritionCommandHandler.js';
import { initWorkoutHandlers } from '../handlers/WorkoutCommandHandler.js';

export function useCommandTerminal({
  apiKeys = [],
  getCurrentState = null,
  onAddFoodCommand = null,
  onAddWorkoutCommand = null,
  onLogSleepCommand = null,
  initialAiMessage = 'Terminale pronto.',
} = {}) {
  const [messages, setMessages] = useState(() => [
    { sender: 'ai', text: String(initialAiMessage || 'Terminale pronto.') },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatImages, setChatImages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
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

  const firstApiKey = useMemo(() => {
    if (!Array.isArray(apiKeys)) return '';
    const found = apiKeys.find((key) => String(key || '').trim());
    return String(found || '').trim();
  }, [apiKeys]);

  const controller = useMemo(() => {
    const llmClient = new GeminiStructuredClient({
      getApiKey: () => firstApiKey,
    });
    return new CommandTerminalController({
      bus: commandBus,
      llmClient,
      composer: new ContextComposer(),
    });
  }, [firstApiKey]);

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
        setMessages((prev) => [
          ...prev,
          { sender: 'ai', text: `🛌 Sonno registrato: ${hoursLabel} ore${suffix}.` },
        ]);
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
      const text = String(envelope?.payload?.message || '').trim();
      if (!text) return;
      setMessages((prev) => [...prev, { sender: 'ai', text }]);
    });

    const unsubscribeRejected = commandBus.subscribe(DISPATCH_COMMAND_REJECTED, (envelope) => {
      const reason = String(envelope?.payload?.reason || 'Comando rifiutato.').trim();
      setMessages((prev) => [...prev, { sender: 'ai', text: `⚠️ ${reason}` }]);
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
  }, []);

  const sendMessage = useCallback(
    async (text, options = {}) => {
      const resolvedText = String(text ?? chatInput ?? '').trim();
      const attachedImages = Array.isArray(options?.images) && options.images.length > 0
        ? options.images
        : chatImages;
      if (!resolvedText && attachedImages.length === 0) {
        return { ok: false, reason: 'empty_message' };
      }

      const userBubbleText =
        resolvedText || `📷 ${attachedImages.length} immagine/i allegata/e`;
      setMessages((prev) => [...prev, { sender: 'user', text: userBubbleText }]);
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
      }
    },
    [chatInput, chatImages, controller],
  );

  return {
    messages,
    setMessages,
    sendMessage,
    isLoading,
    // keep UI compatibility with existing KentuChatUI/AiCluster props
    chatHistory: messages,
    setChatHistory: setMessages,
    chatInput,
    setChatInput,
    chatImages,
    setChatImages,
  };
}
