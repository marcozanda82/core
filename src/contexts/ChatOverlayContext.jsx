import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ChatOverlayContext = createContext(null);

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
 */
export function ChatOverlayProvider({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [actionHandlers, setActionHandlers] = useState({});

  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);
  const toggleChat = useCallback(() => setIsChatOpen((prev) => !prev), []);

  // 🔥 FIX LOOP DEFINITIVO: Shallow compare per bloccare aggiornamenti ridondanti
  const registerHandlers = useCallback((newHandlers) => {
    setActionHandlers((prevHandlers) => {
      const safeNewHandlers = newHandlers && typeof newHandlers === 'object' ? newHandlers : {};
      
      // 🛡️ DIGA: Se semanticamente identici, ritorna PREV per evitare re-render
      if (shallowEqual(prevHandlers, safeNewHandlers)) {
        console.log('🛡️ [ANTI-LOOP] Handlers identici, aggiornamento bloccato');
        return prevHandlers; // ← Blocca il re-render del context!
      }
      
      // 🔍 DIAGNOSTICA: Log delle chiavi che sono cambiate (per debug)
      if (process.env.NODE_ENV === 'development') {
        const changedKeys = Object.keys(safeNewHandlers).filter(
          key => !Object.is(prevHandlers[key], safeNewHandlers[key])
        );
        if (changedKeys.length > 0 && changedKeys.length < 10) {
          console.log('🔄 [CONTEXT] Handlers modificati:', changedKeys.join(', '));
        }
      }
      
      return safeNewHandlers;
    });
  }, []);

  const value = useMemo(
    () => ({
      isChatOpen,
      openChat,
      closeChat,
      toggleChat,
      actionHandlers,
      registerHandlers,
    }),
    [isChatOpen, openChat, closeChat, toggleChat, actionHandlers, registerHandlers],
  );

  return (
    <ChatOverlayContext.Provider value={value}>
      {children}
    </ChatOverlayContext.Provider>
  );
}

export function useChatOverlay() {
  const ctx = useContext(ChatOverlayContext);
  if (!ctx) {
    throw new Error('useChatOverlay must be used within ChatOverlayProvider');
  }
  return ctx;
}

export default ChatOverlayContext;
