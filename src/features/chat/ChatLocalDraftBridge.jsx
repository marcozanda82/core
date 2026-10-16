import { useState } from 'react';

/**
 * Isola chatInput/chatImages dal parent (SalaComandi / overlay handlers).
 * La digitazione aggiorna solo questo subtree; submit/voce restano su onSendMessage del parent.
 */
export default function ChatLocalDraftBridge({ children, initialImages = [] }) {
  const [chatInput, setChatInput] = useState('');
  const [chatImages, setChatImages] = useState(() => (
    Array.isArray(initialImages) ? initialImages : []
  ));

  return children({
    chatInput,
    setChatInput,
    chatImages,
    setChatImages,
  });
}
