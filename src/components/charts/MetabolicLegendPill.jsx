import React, { useMemo } from 'react';
import {
  METABOLIC_PHASE_LEGEND,
  resolveMetabolicPhaseId,
  resolveMetabolicColorForHoursFasted,
} from '../../features/salaComandi/utils/metabolicPhaseColors';

/**
 * Barra orizzontale «Pillola Spettro»: 4 fasi metaboliche, segmento attivo illuminato.
 *
 * @param {{ hoursFasted?: number | null, activePhaseId?: string | null, style?: object, className?: string }} props
 */
export default function MetabolicLegendPill({
  hoursFasted,
  activePhaseId,
  style,
  className,
}) {
  const activeId = useMemo(() => {
    if (activePhaseId) return activePhaseId;
    return resolveMetabolicPhaseId(hoursFasted);
  }, [activePhaseId, hoursFasted]);

  const activeColor = useMemo(
    () => resolveMetabolicColorForHoursFasted(hoursFasted),
    [hoursFasted],
  );

  return (
    <div
      className={className}
      role="list"
      aria-label="Legenda fasi metaboliche"
      style={{
        width: '100%',
        height: 30,
        display: 'flex',
        flexDirection: 'row',
        borderRadius: 9999,
        overflow: 'hidden',
        border: '1px solid rgba(31, 41, 55, 0.95)',
        boxSizing: 'border-box',
        background: 'rgba(0, 0, 0, 0.35)',
        marginBottom: 6,
        ...style,
      }}
    >
      {METABOLIC_PHASE_LEGEND.map((phase, index) => {
        const isActive = phase.id === activeId;
        const isFirst = index === 0;
        const isLast = index === METABOLIC_PHASE_LEGEND.length - 1;
        return (
          <div
            key={phase.id}
            role="listitem"
            aria-current={isActive ? 'true' : undefined}
            title={`${phase.label} (${phase.rangeLabel})`}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: phase.color,
              opacity: isActive ? 1 : 0.28,
              boxShadow: isActive ? `0 0 14px ${activeColor}99, inset 0 0 8px rgba(255,255,255,0.12)` : 'none',
              borderRight: isLast ? 'none' : '1px solid rgba(0, 0, 0, 0.35)',
              borderTopLeftRadius: isFirst ? 9999 : 0,
              borderBottomLeftRadius: isFirst ? 9999 : 0,
              borderTopRightRadius: isLast ? 9999 : 0,
              borderBottomRightRadius: isLast ? 9999 : 0,
              transition: 'opacity 0.45s ease, box-shadow 0.45s ease, filter 0.45s ease',
              filter: isActive ? 'brightness(1.08) saturate(1.15)' : 'saturate(0.85)',
            }}
          >
            <span
              aria-hidden
              style={{
                fontSize: 14,
                lineHeight: 1,
                opacity: isActive ? 1 : 0.75,
                transform: isActive ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 0.35s ease, opacity 0.35s ease',
                userSelect: 'none',
              }}
            >
              {phase.icon}
            </span>
          </div>
        );
      })}
    </div>
  );
}
