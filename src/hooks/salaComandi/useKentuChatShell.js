/**
 * Persistenza chat Kentu, mount shell fullscreen, open/close.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getTodayString } from '../../coreEngine';
import {
  kentuChatStorageKey,
  readKentuChatHistoryFromLocalStorage,
  kentuChatHistoryForPersistence,
} from '../../utils/salaComandiUtils';

/**
 * @param {{
 *   introPhrase?: string,
 *   currentTrackerDate?: string|null,
 *   activeAction?: string|null,
 *   setActiveAction?: (updater: any) => void,
 *   setIsDrawerOpen?: (v: boolean) => void,
 *   setIsFabOpen?: (v: boolean) => void,
 *   closeOverlayChatRef?: React.MutableRefObject<(() => void)|null>,
 * }} params
 */
export function useKentuChatShell({
  introPhrase = '',
  currentTrackerDate = null,
  activeAction = null,
  setActiveAction = null,
  setIsDrawerOpen = null,
  setIsFabOpen = null,
  closeOverlayChatRef = null,
} = {}) {
  const [chatShellMounted, setChatShellMounted] = useState(false);
  const [chatHistory, setChatHistory] = useState(() => {
    try {
      const stored = readKentuChatHistoryFromLocalStorage(getTodayString());
      if (stored) return stored;
    } catch {
      /* noop */
    }
    return [{ sender: 'ai', text: introPhrase }];
  });
  const skipKentuChatPersistRef = useRef(false);
  const kentuChatBoundDateRef = useRef(null);

  useEffect(() => {
    if (activeAction === 'ai_chat') setChatShellMounted(true);
  }, [activeAction]);

  useEffect(() => {
    const d = currentTrackerDate || getTodayString();
    skipKentuChatPersistRef.current = true;
    const stored = readKentuChatHistoryFromLocalStorage(d);
    const prevBound = kentuChatBoundDateRef.current;
    kentuChatBoundDateRef.current = d;
    if (stored) {
      setChatHistory(stored);
    } else if (prevBound != null && prevBound !== d) {
      setChatHistory([{ sender: 'ai', text: introPhrase }]);
    }
  }, [currentTrackerDate, introPhrase]);

  useEffect(() => {
    if (skipKentuChatPersistRef.current) {
      skipKentuChatPersistRef.current = false;
      return;
    }
    const d = currentTrackerDate || getTodayString();
    if (kentuChatBoundDateRef.current !== d) return;
    try {
      const payload = kentuChatHistoryForPersistence(chatHistory);
      localStorage.setItem(kentuChatStorageKey(d), JSON.stringify(payload));
    } catch {
      /* quota / private mode */
    }
  }, [chatHistory, currentTrackerDate]);

  const isChatOpen = activeAction === 'ai_chat';

  const openChat = useCallback(() => {
    setIsDrawerOpen?.(false);
    setIsFabOpen?.(false);
    setActiveAction?.('ai_chat');
  }, [setActiveAction, setIsDrawerOpen, setIsFabOpen]);

  const closeChat = useCallback(() => {
    setActiveAction?.((prev) => (prev === 'ai_chat' ? null : prev));
    try {
      closeOverlayChatRef?.current?.();
    } catch {
      /* noop */
    }
  }, [setActiveAction, closeOverlayChatRef]);

  return {
    chatShellMounted,
    setChatShellMounted,
    chatHistory,
    setChatHistory,
    isChatOpen,
    openChat,
    closeChat,
  };
}

export default useKentuChatShell;
