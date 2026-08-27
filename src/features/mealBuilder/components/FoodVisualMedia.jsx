import React from 'react';
import { Utensils } from 'lucide-react';
import { renderIconFromTag } from '../../../utils/iconEngine';

/**
 * Renderer unificato per foto / icona semantica esplicita / emoji esplicita.
 * Fallback neutro: Utensils (nessuna euristica sul nome).
 */
export default function FoodVisualMedia({
  visual,
  name = 'Alimento',
  compact = false,
  className = '',
  imageClassName = 'h-full w-full object-cover',
  iconClassName,
  wrapperClassName = 'h-full w-full',
  emojiClassName,
}) {
  const displayName = visual?.name || name;
  const resolvedEmojiClass = emojiClassName || (compact ? 'text-2xl' : 'text-3xl');
  const resolvedIconClass = iconClassName || (compact ? 'h-7 w-7' : 'h-9 w-9');
  const resolvedWrapperClass = wrapperClassName;
  const resolvedSurfaceClass = className || (compact ? 'rounded-lg' : 'rounded-t-xl');

  if (visual?.customImage) {
    return (
      <img
        src={visual.customImage}
        alt={displayName}
        className={imageClassName}
      />
    );
  }

  const explicitTag = visual?.semanticIconTag || visual?.iconTag || visual?.iconOverride || visual?.customIcon || null;
  if (explicitTag) {
    const rendered = renderIconFromTag(explicitTag, {
      iconClassName: resolvedIconClass,
      wrapperClassName: resolvedWrapperClass,
      className: resolvedSurfaceClass,
    });
    if (rendered) return rendered;
  }

  const explicitEmoji = String(visual?.customEmoji || '').trim();
  if (explicitEmoji) {
    return (
      <span className={resolvedEmojiClass} aria-hidden>
        {explicitEmoji}
      </span>
    );
  }

  // Fallback neutro — mai indovinare verdura/insalata dal nome.
  return (
    <div
      className={`flex items-center justify-center bg-slate-900/80 ${resolvedWrapperClass} ${resolvedSurfaceClass}`}
      aria-hidden
      title={displayName}
    >
      <Utensils
        className={`text-slate-400 ${resolvedIconClass}`}
        strokeWidth={2}
      />
    </div>
  );
}
