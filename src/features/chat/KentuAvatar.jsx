import React, { useEffect, useState } from 'react';
import { CHAT_DEFAULT_AVATAR_SRC } from './avatarMood.js';

/**
 * Avatar ufficiale Kentu (mood chat / Health Score cellulare).
 * PNG a trasparenza libera sullo sfondo app — niente cerchio/bordo/ombra container.
 * Con `videoSrc`: poster statico a 0ms, mp4 in background (nessun await / nessuna API).
 *
 * size (≈ +50% vs legacy chat): xs 72 · sm 96 · md 108 · header 90 · lg 120 · xl 144 (px)
 */
export default function KentuAvatar({
  size = 'md',
  className = '',
  alt = 'Kentu',
  src = CHAT_DEFAULT_AVATAR_SRC,
  /** Loop mp4 opzionale (es. elaborazione AI). Poster = `src`. */
  videoSrc = null,
  fit = 'contain',
}) {
  const sizeClass =
    size === 'xs'
      ? 'h-[72px] w-[72px]'
      : size === 'sm'
        ? 'h-24 w-24'
        : size === 'header'
          ? 'h-[90px] w-[90px]'
          : size === 'lg'
            ? 'h-[120px] w-[120px]'
            : size === 'xl'
              ? 'h-36 w-36'
              : 'h-[108px] w-[108px]';

  const resolvedSrc = String(src || CHAT_DEFAULT_AVATAR_SRC).trim() || CHAT_DEFAULT_AVATAR_SRC;
  const resolvedVideo = String(videoSrc || '').trim() || null;
  const [displaySrc, setDisplaySrc] = useState(resolvedSrc);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Video: poster immediato — niente fade che ritarda la UI presentazionale.
    if (resolvedVideo) {
      setDisplaySrc(resolvedSrc);
      setVisible(true);
      return undefined;
    }
    if (resolvedSrc === displaySrc) {
      setVisible(true);
      return undefined;
    }
    setVisible(false);
    const timer = window.setTimeout(() => {
      setDisplaySrc(resolvedSrc);
      setVisible(true);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [resolvedSrc, resolvedVideo, displaySrc]);

  const fitClass = fit === 'cover' ? 'object-cover' : 'object-contain';
  const sharedClass = [
    sizeClass,
    'shrink-0 bg-transparent',
    fitClass,
    'transform-gpu will-change-transform [transform:translateZ(0)]',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (resolvedVideo) {
    return (
      <video
        src={resolvedVideo}
        poster={resolvedSrc}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        draggable={false}
        aria-label={alt}
        className={sharedClass}
      />
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      decoding="async"
      draggable={false}
      className={[
        sharedClass,
        'transition-opacity duration-200 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
