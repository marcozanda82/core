import React, { useEffect, useState } from 'react';
import { CHAT_DEFAULT_AVATAR_SRC } from './avatarMood.js';

/**
 * Avatar ufficiale Kentu (mood chat / Health Score cellulare).
 * PNG a trasparenza libera sullo sfondo app — niente cerchio/bordo/ombra container.
 *
 * size (≈ +50% vs legacy chat): xs 72 · sm 96 · md 108 · header 90 · lg 120 · xl 144 (px)
 */
export default function KentuAvatar({
  size = 'md',
  className = '',
  alt = 'Kentu',
  src = CHAT_DEFAULT_AVATAR_SRC,
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
  const [displaySrc, setDisplaySrc] = useState(resolvedSrc);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
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
  }, [resolvedSrc, displaySrc]);

  const fitClass = fit === 'cover' ? 'object-cover' : 'object-contain';

  return (
    <img
      src={displaySrc}
      alt={alt}
      decoding="async"
      draggable={false}
      className={[
        sizeClass,
        'shrink-0 bg-transparent',
        fitClass,
        'transition-opacity duration-200 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
