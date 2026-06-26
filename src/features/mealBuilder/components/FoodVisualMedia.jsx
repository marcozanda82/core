import React from 'react';
import { getFoodEmoji } from '../utils/foodIconUtils';
import { renderIconFromTag } from '../../../utils/iconEngine';

/**
 * Renderer unificato per foto / icona semantica / emoji.
 * Priorità: customImage → semanticIconTag → customEmoji → emoji euristico.
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

  if (visual?.semanticIconTag) {
    return renderIconFromTag(visual.semanticIconTag, {
      iconClassName: resolvedIconClass,
      wrapperClassName: resolvedWrapperClass,
      className: resolvedSurfaceClass,
    });
  }

  return (
    <span className={resolvedEmojiClass} aria-hidden>
      {visual?.customEmoji || getFoodEmoji(displayName)}
    </span>
  );
}
