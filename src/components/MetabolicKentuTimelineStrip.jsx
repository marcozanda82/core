import React, { useMemo } from 'react';
import { METABOLIC_PHASES } from '../features/salaComandi/utils/metabolicPhaseConfig';
import { buildMetabolicTimelineCssGradient } from '../features/salaComandi/utils/metabolicPhaseColors';
import MetabolicPhaseIcon from './MetabolicPhaseIcon';

const DISPLAY_HOURS_MAX = 24;

function phaseMarkerLeftPercent(phase) {
  const end = phase.maxHours === Infinity
    ? DISPLAY_HOURS_MAX
    : Math.min(phase.maxHours, DISPLAY_HOURS_MAX);
  const center = (phase.minHours + end) / 2;
  return Math.min(100, Math.max(0, (center / DISPLAY_HOURS_MAX) * 100));
}

function phaseTextColorClass(phase) {
  const token = String(phase?.color ?? '')
    .split(/\s+/)
    .find((part) => part.startsWith('text-'));
  return token ?? 'text-slate-300';
}

/**
 * Striscia timeline Kentu read-only: gradiente metabolico + nodi fase.
 */
export default function MetabolicKentuTimelineStrip({
  metabolicGradientStops,
  phaseIndex = 0,
  hoursSinceLastMeal = 0,
  showNowMarker = true,
}) {
  const stripGradient = useMemo(
    () => buildMetabolicTimelineCssGradient(metabolicGradientStops),
    [metabolicGradientStops],
  );

  const nowLeft = Math.min(
    100,
    Math.max(0, (Math.min(DISPLAY_HOURS_MAX, Number(hoursSinceLastMeal) || 0) / DISPLAY_HOURS_MAX) * 100),
  );

  return (
    <div className="w-full">
      <div className="relative h-14 w-full overflow-visible rounded-xl border border-[#222] bg-[rgba(255,255,255,0.03)]">
        {stripGradient ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ background: stripGradient }}
          />
        ) : null}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-white/15"
        />
        {showNowMarker ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 w-px -translate-x-1/2 bg-cyan-400/90 shadow-[0_0_8px_rgba(34,211,238,0.75)]"
            style={{ left: `${nowLeft}%` }}
          />
        ) : null}
        <div className="absolute inset-0 flex items-center">
          {METABOLIC_PHASES.map((item, index) => {
            const isActive = index === phaseIndex;
            const left = phaseMarkerLeftPercent(item);
            return (
              <div
                key={item.id}
                className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                style={{ left: `${left}%` }}
              >
                <div
                  className={`transition-all duration-300 ${isActive ? 'scale-125' : 'opacity-50 grayscale'} ${phaseTextColorClass(item)}`}
                >
                  <MetabolicPhaseIcon
                    phase={item}
                    size={isActive ? 'timeline-lg' : 'timeline'}
                    muted={!isActive}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="relative mt-2 h-8 w-full">
        {METABOLIC_PHASES.map((item, index) => {
          const isActive = index === phaseIndex;
          const left = phaseMarkerLeftPercent(item);
          return (
            <span
              key={`${item.id}-label`}
              className={`absolute top-0 max-w-[3.25rem] -translate-x-1/2 text-center text-[8px] leading-tight font-semibold ${
                isActive ? phaseTextColorClass(item) : 'text-slate-600 opacity-60'
              }`}
              style={{ left: `${left}%` }}
            >
              {item.label.split(' ').slice(-1)[0]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
