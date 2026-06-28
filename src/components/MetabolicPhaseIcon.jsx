import React from 'react';

const CONTAINER_SIZE_CLASS = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-5 w-5',
  md: 'h-5 w-5',
  timeline: 'h-10 w-10',
  'timeline-lg': 'h-12 w-12',
  lg: 'h-24 w-24',
  xl: 'h-24 w-24',
};

const IMG_CLASS =
  'h-full w-full object-contain drop-shadow-[0_0_15px_currentColor] transition-transform duration-500';

function phaseTextColorClass(phase) {
  const token = String(phase?.color ?? '')
    .split(/\s+/)
    .find((part) => part.startsWith('text-'));
  return token ?? 'text-slate-300';
}

function resolveContainerSizeClass(size) {
  if (typeof size === 'number' && Number.isFinite(size)) return null;
  return CONTAINER_SIZE_CLASS[size] ?? CONTAINER_SIZE_CLASS.md;
}

/**
 * Renderer icone fase metabolica (PNG premium da public/assets/metabolic).
 */
export default function MetabolicPhaseIcon({
  phase,
  size = 'md',
  muted = false,
  className = '',
  withHalo = false,
}) {
  if (!phase?.iconPath) return null;

  const containerSizeClass = resolveContainerSizeClass(size);
  const textColorClass = muted ? 'text-slate-500' : phaseTextColorClass(phase);

  const imageNode = (
    <img
      src={phase.iconPath}
      alt={phase.label}
      draggable={false}
      className={`${IMG_CLASS}${muted ? ' opacity-45 grayscale' : ''}`}
    />
  );

  const iconContainer = (
    <div
      className={`flex shrink-0 items-center justify-center ${containerSizeClass ?? ''} ${textColorClass} ${className}`}
      style={
        containerSizeClass
          ? undefined
          : { width: size, height: size }
      }
    >
      {imageNode}
    </div>
  );

  if (!withHalo) return iconContainer;

  return (
    <div
      className={`relative mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-slate-950/40 ring-2 ring-current/50 shadow-[0_0_30px_currentColor] ${textColorClass}`}
    >
      <div className="flex h-24 w-24 items-center justify-center">
        {imageNode}
      </div>
    </div>
  );
}
