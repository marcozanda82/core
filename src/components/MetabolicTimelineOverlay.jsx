import React, { useMemo } from 'react';
import { METABOLIC_PHASES } from '../features/salaComandi/utils/metabolicPhaseConfig';
import { buildUnifiedMetabolicSegments } from '../utils/buildUnifiedMetabolicSegments';
import { formatDecimalHourClock, getLeftPercentage } from '../utils/unifiedTimelineLayout';
import { CHART_AXIS_GUTTER_LEFT_PX, CHART_AXIS_GUTTER_RIGHT_PX } from '../timeLayout';

const OVERLAY_HEIGHT = 40;
/** Spazio sopra il bordo inferiore del grafico: libera le etichette Recharts XAxis (~fontSize 10–13). */
const X_AXIS_LABEL_CLEARANCE_BOTTOM = 28;
const ICON_SIZE_ACTIVE = 30;
const ICON_SIZE_IDLE = 20;

function resolvePhaseById(phaseId) {
  return METABOLIC_PHASES.find((phase) => phase.id === phaseId) ?? METABOLIC_PHASES[0];
}

function resolveActiveSegmentId(segments, nowHour) {
  if (nowHour == null || !Number.isFinite(Number(nowHour))) return null;
  const hour = Number(nowHour);

  const sorted = [...segments]
    .filter((segment) => Number.isFinite(Number(segment.hour)))
    .sort((a, b) => a.hour - b.hour);

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const end = current.endHour ?? (next ? next.hour : 24);
    if (hour >= current.hour - 0.001 && hour < end - 0.001) {
      return current.id;
    }
  }

  return null;
}

function MetabolicPhaseIcon({ segment, phase, isActive, onPhaseClick }) {
  const hour = Number(segment.hour);
  const size = isActive ? ICON_SIZE_ACTIVE : ICON_SIZE_IDLE;

  if (!Number.isFinite(hour) || !phase?.iconPath) return null;

  const handleOpenRadar = (event) => {
    event.stopPropagation();
    event.preventDefault();
    onPhaseClick?.({
      segment,
      phase,
      phaseId: phase.id,
      hour,
      label: segment.label ?? phase.label,
    });
  };

  return (
    <button
      type="button"
      title={`${segment.label ?? phase.label} · ${formatDecimalHourClock(hour)}`}
      aria-label={`Apri radar metabolico: ${phase.label} (${formatDecimalHourClock(hour)})`}
      onClick={handleOpenRadar}
      style={{
        position: 'absolute',
        left: `${getLeftPercentage(hour)}%`,
        bottom: 0,
        width: size,
        height: size,
        padding: 0,
        margin: 0,
        border: 'none',
        background: 'transparent',
        transform: isActive ? 'translateX(-50%) scale(1.15)' : 'translateX(-50%)',
        opacity: isActive ? 1 : 0.6,
        zIndex: isActive ? 4 : 1,
        pointerEvents: 'auto',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, opacity 0.2s ease, filter 0.2s ease',
        filter: isActive
          ? `drop-shadow(0 0 10px ${phase.iconColor}) drop-shadow(0 0 4px rgba(255,255,255,0.35))`
          : 'grayscale(20%)',
      }}
    >
      <img
        src={phase.iconPath}
        alt=""
        draggable={false}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />
    </button>
  );
}

/**
 * Livello fantasma sopra il grafico: icone fase metabolica ancorate all'asse 0–24h.
 */
export default function MetabolicTimelineOverlay({
  activeLog = [],
  options = {},
  nowHour = null,
  onPhaseClick,
  className = '',
}) {
  const visibleSegments = useMemo(() => {
    const segments = buildUnifiedMetabolicSegments(activeLog, options);
    return segments
      .filter((segment) => segment && Number.isFinite(Number(segment.hour)) && (segment.phase || segment.phaseId))
      .sort((a, b) => a.hour - b.hour);
  }, [activeLog, options]);

  const activeSegmentId = useMemo(
    () => resolveActiveSegmentId(visibleSegments, nowHour),
    [visibleSegments, nowHour],
  );

  if (visibleSegments.length === 0) return null;

  return (
    <div
      className={className}
      aria-label="Stati metabolici sulla timeline"
      style={{
        position: 'absolute',
        bottom: X_AXIS_LABEL_CLEARANCE_BOTTOM,
        left: 0,
        width: '100%',
        height: OVERLAY_HEIGHT,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          paddingLeft: CHART_AXIS_GUTTER_LEFT_PX,
          paddingRight: CHART_AXIS_GUTTER_RIGHT_PX,
          boxSizing: 'border-box',
        }}
      >
        {visibleSegments.map((segment) => {
          const phase = segment.phase ?? resolvePhaseById(segment.phaseId);
          return (
            <MetabolicPhaseIcon
              key={segment.id}
              segment={segment}
              phase={phase}
              isActive={segment.id === activeSegmentId}
              onPhaseClick={onPhaseClick}
            />
          );
        })}
      </div>
    </div>
  );
}
