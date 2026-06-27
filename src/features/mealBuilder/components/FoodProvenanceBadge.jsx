import React, { useRef, useState } from 'react';
import { FOOD_PROVENANCE_META } from '../../../foodDbSource';

export default function FoodProvenanceBadge({
  provenance,
  className = '',
  compact = false,
}) {
  const meta = FOOD_PROVENANCE_META[provenance];
  const [tooltip, setTooltip] = useState(false);
  const longPressTimerRef = useRef(null);

  if (!meta) return null;

  const showTooltip = (event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    setTooltip(true);
    window.setTimeout(() => setTooltip(false), 2200);
  };

  const handlePointerDown = (event) => {
    event.stopPropagation();
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => showTooltip(event), 450);
  };

  const handlePointerUp = (event) => {
    event.stopPropagation();
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <span className={`relative z-10 ${className}`}>
      <button
        type="button"
        onClick={showTooltip}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label={meta.tooltip}
        title={meta.tooltip}
        className={`pointer-events-auto flex items-center justify-center rounded-md px-1 py-px font-semibold leading-none opacity-50 transition-opacity hover:opacity-80 active:opacity-100 ${
          compact ? 'text-[9px]' : 'text-[10px]'
        } ${meta.badgeClass}`}
      >
        {meta.glyph}
      </button>
      {tooltip ? (
        <span
          role="status"
          className={`pointer-events-none absolute z-30 whitespace-nowrap rounded-lg border border-slate-700/80 bg-slate-950/95 px-2 py-1 text-[10px] font-medium text-slate-200 shadow-lg backdrop-blur-sm ${
            compact ? 'bottom-5 left-0' : 'bottom-6 left-0'
          }`}
        >
          {meta.tooltip}
        </span>
      ) : null}
    </span>
  );
}
