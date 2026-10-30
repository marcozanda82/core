import React from 'react';
import { resolveFocusArea } from '../focusAreas.js';

/**
 * Cerchio colorato con icona area (40 px default; 34 px in intestazioni).
 * @param {{
 *   area: string,
 *   size?: 'md'|'sm'|number,
 *   className?: string,
 *   title?: string,
 * }} props
 */
export function AreaChip({ area, size = 'md', className = '', title }) {
  const def = resolveFocusArea(area);
  if (!def) return null;

  const px = typeof size === 'number'
    ? size
    : (size === 'sm' ? 34 : 40);
  const iconPx = Math.round(px * 0.48);
  const Icon = def.Icon;

  return (
    <span
      className={`kf-area-chip${className ? ` ${className}` : ''}`}
      style={{
        width: px,
        height: px,
        background: def.chipBg,
        color: def.iconColor,
      }}
      title={title || def.label}
      aria-hidden="true"
    >
      <Icon size={iconPx} strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}

export default AreaChip;
