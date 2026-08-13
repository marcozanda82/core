import React from 'react';
import KentuAvatar from './KentuAvatar';

/**
 * Indicatore visivo mentre Kentu elabora (avatar + tre puntini, allineato a sinistra come i fumetti AI).
 */
export default function TypingIndicator({
  label = 'Kentu sta elaborando...',
  avatarSrc = '/avatar.png',
}) {
  const ariaLabel = String(label || 'Kentu sta elaborando...').trim();

  return (
    <div
      className="kentu-typing-row flex w-full max-w-[min(92%,28rem)] flex-col items-start justify-start gap-2 py-2"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
      role="status"
    >
      <KentuAvatar
        size="sm"
        src={avatarSrc}
        className="h-8 w-8 animate-pulse"
        alt=""
      />
      <div className="typing-indicator kentu-typing-indicator pl-1" aria-hidden>
        <div className="dot" />
        <div className="dot" />
        <div className="dot" />
      </div>
    </div>
  );
}
