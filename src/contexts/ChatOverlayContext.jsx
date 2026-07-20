import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ChatOverlayContext = createContext(null);

/**
 * Stato globale overlay chat (FAB + bottom sheet).
 * Indipendente da SalaComandi / router interni.
 */
export function ChatOverlayProvider({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);

  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);
  const toggleChat = useCallback(() => setIsChatOpen((prev) => !prev), []);

  const value = useMemo(
    () => ({
      isChatOpen,
      openChat,
      closeChat,
      toggleChat,
    }),
    [isChatOpen, openChat, closeChat, toggleChat],
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
