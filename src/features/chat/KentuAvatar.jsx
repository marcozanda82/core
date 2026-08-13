import React, { useEffect, useState } from 'react';

/**
 * Avatar ufficiale Kentu (Health Score, mood attività, o /avatar.png).
 * Transizione opacity quando cambia `src`.
 */
export default function KentuAvatar({
  size = 'md',
  className = '',
  alt = 'Kentu',
  src = '/avatar.png',
  fit = 'cover',
}) {
  const sizeClass =
    size === 'xs'
      ? 'h-6 w-6'
      : size === 'sm'
        ? 'h-8 w-8'
        : size === 'lg'
          ? 'h-10 w-10'
          : size === 'xl'
            ? 'h-12 w-12'
            : 'h-9 w-9';

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

  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover';

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
