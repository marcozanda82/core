import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ChatOverlayApiContext = createContext(null);
const ChatOverlayHandlersContext = createContext(null);

/**
 * 🛡️ DIGA ANTI-LOOP: Shallow equality check per oggetti
 * Previene aggiornamenti del context se i nuovi handler sono semanticamente identici
 */
function shallowEqual(objA, objB) {
  if (Object.is(objA, objB)) return true;
  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false;
  }
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(objB, key) || !Object.is(objA[key], objB[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Stato globale overlay chat (FAB + bottom sheet).
 * actionHandlers: props AiCluster iniettate da SalaComandi via registerHandlers.
 *
 * Due context: SalaComandi si iscrive solo all'API (registerHandlers / closeChat)
 * così un aggiornamento degli handler non re-renderizza SalaComandi (React #185).
 */
export function ChatOverlayProvider({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [actionHandlers, setActionHandlers] = useState({});

  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);
  const toggleChat = useCallback(() => setIsChatOpen((prev) => !prev), []);

  const registerHandlers = useCallback((newHandlers) => {
    setActionHandlers((prevHandlers) => {
      const safeNewHandlers = newHandlers && typeof newHandlers === 'object' ? newHandlers : {};
      if (shallowEqual(prevHandlers, safeNewHandlers)) {
        return prevHandlers;
      }
      return safeNewHandlers;
    });
  }, []);

  const api = useMemo(
    () => ({
      isChatOpen,
      openChat,
      closeChat,
      toggleChat,
      registerHandlers,
    }),
    [isChatOpen, openChat, closeChat, toggleChat, registerHandlers],
  );

  return (
    <ChatOverlayApiContext.Provider value={api}>
      <ChatOverlayHandlersContext.Provider value={actionHandlers}>
        {children}
      </ChatOverlayHandlersContext.Provider>
    </ChatOverlayApiContext.Provider>
  );
}

export function useChatOverlayApi() {
  const ctx = useContext(ChatOverlayApiContext);
  if (!ctx) {
    throw new Error('useChatOverlayApi must be used within ChatOverlayProvider');
  }
  return ctx;
}

export function useChatOverlay() {
  const api = useChatOverlayApi();
  const actionHandlers = useContext(ChatOverlayHandlersContext);
  return { ...api, actionHandlers: actionHandlers || {} };
}

export default ChatOverlayApiContext;
