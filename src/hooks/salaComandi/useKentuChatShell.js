/**
 * Persistenza chat Kentu, mount shell fullscreen, open/close.
 * Vista principale: solo il giorno di calendario corrente (reset a mezzanotte).
 * Lo storico dei giorni precedenti resta in localStorage/Firebase e si prepende on-demand.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getTodayString } from '../../coreEngine';
import {
  kentuChatStorageKey,
  readKentuChatHistoryFromLocalStorage,
  kentuChatHistoryForPersistence,
  coerceLiveChatHistory,
  seedKentuChatHistory,
  filterKentuChatMessagesForVisibleDay,
  stripKentuIntroSeedMessages,
  msUntilNextLocalMidnight,
} from '../../utils/salaComandiUtils';
import {
  archiveKentuChatDay,
  archivePreviousLocalKentuChats,
  loadPreviousKentuChatDay,
  probeHasPreviousKentuChat,
} from '../../utils/kentuChatArchive';

function persistBoundDay(dateStr, messages) {
  const d = String(dateStr || '').slice(0, 10);
  if (!d) return null;
  try {
    const payload = kentuChatHistoryForPersistence(messages).filter(
      (m) => m?.fromArchive !== true,
    );
    const cleaned = stripKentuIntroSeedMessages(payload);
    localStorage.setItem(kentuChatStorageKey(d), JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return stripKentuIntroSeedMessages(
      kentuChatHistoryForPersistence(messages).filter((m) => m?.fromArchive !== true),
    );
  }
}

function readVisibleToday(introPhrase, todayStr) {
  const today = todayStr || getTodayString();
  try {
    const stored = readKentuChatHistoryFromLocalStorage(today);
    if (stored) {
      return stripKentuIntroSeedMessages(
        filterKentuChatMessagesForVisibleDay(stored, today),
      );
    }
  } catch {
    /* noop */
  }
  return seedKentuChatHistory(introPhrase);
}

/**
 * @param {{
 *   introPhrase?: string,
 *   userUid?: string|null,
 *   activeAction?: string|null,
 *   setActiveAction?: (updater: any) => void,
 *   setIsDrawerOpen?: (v: boolean) => void,
 *   setIsFabOpen?: (v: boolean) => void,
 *   closeOverlayChatRef?: React.MutableRefObject<(() => void)|null>,
 * }} params
 */
export function useKentuChatShell({
  introPhrase = '',
  userUid = null,
  activeAction = null,
  setActiveAction = null,
  setIsDrawerOpen = null,
  setIsFabOpen = null,
  closeOverlayChatRef = null,
} = {}) {
  const [chatShellMounted, setChatShellMounted] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => getTodayString());
  const [chatHistory, setChatHistoryState] = useState(() => readVisibleToday(introPhrase));
  const [olderHistory, setOlderHistory] = useState([]);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [oldestLoadedDate, setOldestLoadedDate] = useState(() => getTodayString());
  const [canLoadPrevious, setCanLoadPrevious] = useState(false);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(false);
  const skipKentuChatPersistRef = useRef(false);
  const kentuChatBoundDateRef = useRef(getTodayString());
  const chatHistoryRef = useRef(chatHistory);
  const olderHistoryRef = useRef(olderHistory);
  const introPhraseRef = useRef(introPhrase);
  const userUidRef = useRef(userUid);
  const oldestLoadedDateRef = useRef(oldestLoadedDate);

  chatHistoryRef.current = chatHistory;
  olderHistoryRef.current = olderHistory;
  introPhraseRef.current = introPhrase;
  userUidRef.current = userUid;
  oldestLoadedDateRef.current = oldestLoadedDate;

  const setChatHistory = useCallback((updater) => {
    setChatHistoryState((prev) => {
      const base = coerceLiveChatHistory(prev);
      const next = typeof updater === 'function' ? updater(base) : updater;
      return stripKentuIntroSeedMessages(coerceLiveChatHistory(next));
    });
  }, []);

  useEffect(() => {
    if (activeAction === 'ai_chat') setChatShellMounted(true);
  }, [activeAction]);

  useEffect(() => {
    const syncCalendarDay = () => {
      const today = getTodayString();
      setCalendarDate((prev) => (prev === today ? prev : today));
    };

    let timerId = 0;
    const scheduleMidnight = () => {
      const wait = Math.min(msUntilNextLocalMidnight(), 60 * 60 * 1000);
      timerId = window.setTimeout(() => {
        syncCalendarDay();
        scheduleMidnight();
      }, wait);
    };

    scheduleMidnight();
    document.addEventListener('visibilitychange', syncCalendarDay);
    window.addEventListener('focus', syncCalendarDay);
    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', syncCalendarDay);
      window.removeEventListener('focus', syncCalendarDay);
    };
  }, []);

  useEffect(() => {
    const today = calendarDate || getTodayString();
    const prevBound = kentuChatBoundDateRef.current;

    if (prevBound && prevBound !== today) {
      skipKentuChatPersistRef.current = true;
      const previousPayload = persistBoundDay(prevBound, chatHistoryRef.current);
      if (previousPayload?.length) {
        void archiveKentuChatDay({
          uid: userUidRef.current,
          dateStr: prevBound,
          messages: previousPayload,
        });
      }
      kentuChatBoundDateRef.current = today;
      setOlderHistory([]);
      olderHistoryRef.current = [];
      setIsHistoryVisible(false);
      setOldestLoadedDate(today);
      setChatHistoryState(readVisibleToday(introPhraseRef.current, today));
      return;
    }

    if (!prevBound) {
      kentuChatBoundDateRef.current = today;
    }
  }, [calendarDate]);

  useEffect(() => {
    if (!userUid) return undefined;
    void archivePreviousLocalKentuChats({ uid: userUid, todayStr: getTodayString() });
    return undefined;
  }, [userUid]);

  useEffect(() => {
    let cancelled = false;
    void probeHasPreviousKentuChat({
      uid: userUid,
      beforeDate: oldestLoadedDate || getTodayString(),
    }).then((has) => {
      if (!cancelled) setCanLoadPrevious(Boolean(has));
    });
    return () => {
      cancelled = true;
    };
  }, [userUid, oldestLoadedDate]);

  useEffect(() => {
    if (skipKentuChatPersistRef.current) {
      skipKentuChatPersistRef.current = false;
      return;
    }
    const d = kentuChatBoundDateRef.current || getTodayString();
    persistBoundDay(d, chatHistory);
  }, [chatHistory]);

  const loadPreviousMessages = useCallback(async () => {
    if (isLoadingPrevious) return false;
    if (isHistoryVisible) {
      setIsHistoryVisible(false);
      return true;
    }
    if (olderHistoryRef.current.length > 0) {
      setIsHistoryVisible(true);
      return true;
    }
    setIsLoadingPrevious(true);
    try {
      const loaded = await loadPreviousKentuChatDay({
        uid: userUidRef.current,
        beforeDate: oldestLoadedDateRef.current || getTodayString(),
      });
      if (!loaded?.messages?.length) {
        setCanLoadPrevious(false);
        return false;
      }
      setOlderHistory((prev) => [...loaded.messages, ...coerceLiveChatHistory(prev)]);
      setOldestLoadedDate(loaded.date);
      setIsHistoryVisible(true);
      return true;
    } catch (error) {
      console.warn('[KentuChat] load previous failed', error);
      return false;
    } finally {
      setIsLoadingPrevious(false);
    }
  }, [isLoadingPrevious, isHistoryVisible]);

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

  const today = calendarDate || getTodayString();
  const todayLive = stripKentuIntroSeedMessages(
    filterKentuChatMessagesForVisibleDay(coerceLiveChatHistory(chatHistory), today),
  );
  const archivedLive = isHistoryVisible
    ? stripKentuIntroSeedMessages(coerceLiveChatHistory(olderHistory))
    : [];
  const liveHistory = [...archivedLive, ...todayLive];
  const showHistoryToggle = isHistoryVisible || olderHistory.length > 0 || canLoadPrevious;

  return {
    chatShellMounted,
    setChatShellMounted,
    chatHistory: liveHistory,
    setChatHistory,
    isChatOpen,
    openChat,
    closeChat,
    canLoadPrevious: showHistoryToggle,
    isLoadingPrevious,
    isHistoryVisible,
    loadPreviousMessages,
  };
}

export default useKentuChatShell;
