/**
 * Avatar ufficiale Kentu (public/avatar.png o stage Health Score).
 */
export default function KentuAvatar({
  size = 'md',
  className = '',
  alt = 'Kentu',
  src = '/avatar.png',
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

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      decoding="async"
      draggable={false}
      className={[
        sizeClass,
        'shrink-0 rounded-full border border-cyan-500/40 object-cover',
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
