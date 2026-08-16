import React from 'react';
import KentuAvatar from './KentuAvatar';
import { AVATAR_MOOD_SRC } from './avatarMood.js';

/**
 * Indicatore visivo mentre Kentu elabora (avatar contestuale + tre puntini).
 * Con hideAvatar: solo i puntini (il video vive nella fascia cinema sotto l'header).
 */
export default function TypingIndicator({
  label = 'Kentu sta elaborando...',
  avatarSrc = AVATAR_MOOD_SRC.coding,
  /** Se valorizzato (es. Hacker4animazione), poster = avatarSrc a 0ms. */
  avatarVideoSrc = null,
  /** Nasconde l'avatar/video inline (usato quando c'è KentuProcessingBanner). */
  hideAvatar = false,
}) {
  const ariaLabel = String(label || 'Kentu sta elaborando...').trim();
  const src = String(avatarSrc || AVATAR_MOOD_SRC.coding).trim() || AVATAR_MOOD_SRC.coding;
  const videoSrc = hideAvatar ? null : (String(avatarVideoSrc || '').trim() || null);

  return (
    <div
      className={[
        'kentu-typing-row flex w-full max-w-[min(92%,28rem)] flex-col items-start justify-start gap-2.5 py-2',
        hideAvatar ? 'kentu-typing-row--compact' : '',
      ].filter(Boolean).join(' ')}
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
      role="status"
    >
      {!hideAvatar ? (
        <KentuAvatar
          size="sm"
          src={src}
          videoSrc={videoSrc}
          fit="contain"
          className={videoSrc ? undefined : 'animate-pulse'}
          alt=""
        />
      ) : null}
      <div className="typing-indicator kentu-typing-indicator pl-1" aria-hidden>
        <div className="dot" />
        <div className="dot" />
        <div className="dot" />
      </div>
    </div>
  );
}
