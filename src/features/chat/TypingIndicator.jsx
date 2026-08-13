import React from 'react';

/**
 * Indicatore visivo mentre Kentu elabora (testo, voce, Gemini).
 */
export default function TypingIndicator({ label = 'Kentu sta elaborando...' }) {
  const ariaLabel = String(label || 'Kentu sta elaborando...').trim();

  return (
    <div
      className="kentu-typing-row"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
    >
      <div className="kentu-typing-bubble">
        <span className="kentu-typing-bubble__label">{ariaLabel}</span>
        <div className="typing-indicator kentu-typing-indicator">
          <div className="dot" />
          <div className="dot" />
          <div className="dot" />
        </div>
      </div>
    </div>
  );
}
