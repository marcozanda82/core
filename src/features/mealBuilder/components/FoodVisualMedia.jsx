import React from 'react';
import { Utensils } from 'lucide-react';
import { renderIconFromTag } from '../../../utils/iconEngine';
import { NEUTRAL_FOOD_VISUAL_EMOJI } from '../../../utils/foodVisualResolver';

/**
 * Renderer unificato: foto / emoji keyword / tag SVG / fallback piatto.
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
  const resolvedEmojiClass = emojiClassName || (compact ? 'text-3xl leading-none' : 'text-4xl leading-none');
  const resolvedIconClass = iconClassName || (compact ? 'h-7 w-7' : 'h-9 w-9');
  const resolvedWrapperClass = wrapperClassName;
  const resolvedSurfaceClass = className || '';
  const glowShellClass = compact
    ? 'flex h-12 w-12 items-center justify-center rounded-full bg-slate-950/55 shadow-[0_0_18px_rgba(34,211,238,0.12)] ring-1 ring-white/[0.06]'
    : 'flex h-16 w-16 items-center justify-center rounded-full bg-slate-950/55 shadow-[0_0_22px_rgba(34,211,238,0.14)] ring-1 ring-white/[0.07]';

  if (visual?.customImage) {
    return (
      <img
        src={visual.customImage}
        alt={displayName}
        className={imageClassName}
      />
    );
  }

  const emoji = String(visual?.customEmoji || '').trim();
  if (emoji) {
    return (
      <div
        className={`${glowShellClass} ${resolvedWrapperClass} ${resolvedSurfaceClass}`}
        aria-hidden
        title={displayName}
      >
        <span className={resolvedEmojiClass}>{emoji}</span>
      </div>
    );
  }

  const explicitTag = visual?.semanticIconTag || visual?.iconTag || visual?.iconOverride || visual?.customIcon || null;
  if (explicitTag) {
    const rendered = renderIconFromTag(explicitTag, {
      iconClassName: resolvedIconClass,
      wrapperClassName: 'contents',
      className: '',
    });
    if (rendered) {
      return (
        <div
          className={`${glowShellClass} ${resolvedWrapperClass} ${resolvedSurfaceClass}`}
          aria-hidden
          title={displayName}
        >
          {rendered}
        </div>
      );
    }
  }

  const fallback = String(visual?.fallbackEmoji || NEUTRAL_FOOD_VISUAL_EMOJI).trim()
    || NEUTRAL_FOOD_VISUAL_EMOJI;

  if (fallback === NEUTRAL_FOOD_VISUAL_EMOJI || visual?.useNeutralIcon) {
    return (
      <div
        className={`${glowShellClass} ${resolvedWrapperClass} ${resolvedSurfaceClass}`}
        aria-hidden
        title={displayName}
      >
        <Utensils className={`text-slate-400 ${resolvedIconClass}`} strokeWidth={2} />
      </div>
    );
  }

  return (
    <div
      className={`${glowShellClass} ${resolvedWrapperClass} ${resolvedSurfaceClass}`}
      aria-hidden
      title={displayName}
    >
      <span className={resolvedEmojiClass}>{fallback}</span>
    </div>
  );
}
