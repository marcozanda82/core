import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ChatOverlayContext = createContext(null);

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

  const registerHandlers = useCallback((handlersObject) => {
    setActionHandlers(
      handlersObject && typeof handlersObject === 'object' ? handlersObject : {},
    );
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
