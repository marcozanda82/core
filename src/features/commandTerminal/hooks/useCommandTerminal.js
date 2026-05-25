import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { commandBus } from '../dispatcher/CommandBus.js';
import { ContextComposer } from '../context/ContextComposer.js';
import { GeminiStructuredClient } from '../llm/GeminiStructuredClient.js';
import { CommandTerminalController } from '../CommandTerminalController.js';
import {
  DISPATCH_COMMAND_REJECTED,
  DISPATCH_SYSTEM_MESSAGE,
} from '../contracts/eventTypes.js';
import { initNutritionHandlers } from '../handlers/NutritionCommandHandler.js';
import { initWorkoutHandlers } from '../handlers/WorkoutCommandHandler.js';

export function useCommandTerminal({
  apiKeys = [],
  getCurrentState = null,
  onAddFoodCommand = null,
  onAddWorkoutCommand = null,
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

  useEffect(() => {
    onAddFoodRef.current = onAddFoodCommand;
  }, [onAddFoodCommand]);

  useEffect(() => {
    onAddWorkoutRef.current = onAddWorkoutCommand;
  }, [onAddWorkoutCommand]);

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
    async (text) => {
      const resolvedText = String(text ?? chatInput ?? '').trim();
      if (!resolvedText) return { ok: false, reason: 'empty_message' };

      setMessages((prev) => [...prev, { sender: 'user', text: resolvedText }]);
      setChatInput('');
      setChatImages([]);
      setIsLoading(true);
      try {
        const currentState =
          typeof getCurrentStateRef.current === 'function' ? getCurrentStateRef.current() : {};
        return await controller.processUserMessage(resolvedText, currentState);
      } finally {
        setIsLoading(false);
      }
    },
    [chatInput, controller],
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
