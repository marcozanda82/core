import React, { useEffect, useState } from 'react';

/**
 * Avatar ufficiale Kentu (Health Score, mood attività, o /avatar.png).
 * Scale raddoppiate per leggibilità in chat. Transizione opacity su cambio `src`.
 *
 * size: xs 48 · sm 64 · md 72 · lg 80 · xl 96 (px)
 */
export default function KentuAvatar({
  size = 'md',
  className = '',
  alt = 'Kentu',
  src = '/avatar.png',
  fit = 'contain',
}) {
  const sizeClass =
    size === 'xs'
      ? 'h-12 w-12'
      : size === 'sm'
        ? 'h-16 w-16'
        : size === 'lg'
          ? 'h-20 w-20'
          : size === 'xl'
            ? 'h-24 w-24'
            : 'h-[4.5rem] w-[4.5rem]';

  const resolvedSrc = String(src || '/avatar.png').trim() || '/avatar.png';
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
        'shrink-0 rounded-full border border-cyan-500/40',
        fitClass,
        'transition-opacity duration-200 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
        size === 'xs'
          ? 'shadow-sm'
          : 'shadow-[0_0_12px_rgba(34,211,238,0.28)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
