import { useMemo } from 'react';

const DRAIN_PCT_PER_HOUR = 4;
const ARC_RADIUS = 72;
const STROKE_WIDTH = 10;
const CX = 100;
const CY = 92;

/** Mezzo cerchio superiore (gauge Body Battery). */
const ARC_PATH = `M ${CX - ARC_RADIUS} ${CY} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${CX + ARC_RADIUS} ${CY}`;
const ARC_LENGTH = Math.PI * ARC_RADIUS;

function computeHoursAwake(wakeTime, currentHour) {
  const wake = Number(wakeTime);
  const now = Number(currentHour);
  if (!Number.isFinite(wake) || !Number.isFinite(now)) return 0;
  if (now >= wake) return now - wake;
  return 0;
}

function resolvePhaseColor(metabolicPhase) {
  if (metabolicPhase?.iconColor) return metabolicPhase.iconColor;
  const id = String(metabolicPhase?.id ?? '').toLowerCase();
  if (id.includes('sovraccarico')) return '#ef4444';
  if (id.includes('assorbimento') || id.includes('anabol')) return '#22c55e';
  if (id.includes('digest') || id.includes('gastric')) return '#f97316';
  if (id.includes('glicogeno')) return '#06b6d4';
  if (id.includes('transizione') || id.includes('catabol')) return '#fb923c';
  return '#22d3ee';
}

function resolvePhaseLabel(metabolicPhase) {
  if (!metabolicPhase?.label) return 'Ricarica';
  return metabolicPhase.label;
}

/**
 * Arco energetico (Body Battery) — carica al risveglio + scaricamento orario.
 *
 * @param {{
 *   recoveryScore?: number,
 *   wakeTime?: number,
 *   currentHour?: number,
 *   metabolicPhase?: { id?: string, label?: string, iconColor?: string } | null,
 *   hasSleepData?: boolean,
 *   className?: string,
 * }} props
 */
export default function EnergyArcWidget({
  recoveryScore = 0,
  wakeTime = 7,
  currentHour = 12,
  metabolicPhase = null,
  hasSleepData = false,
  className = '',
}) {
  const phaseColor = resolvePhaseColor(metabolicPhase);
  const phaseLabel = resolvePhaseLabel(metabolicPhase);

  const { maxCharge, currentLevel, fillRatio } = useMemo(() => {
    const max = Math.max(0, Math.min(100, Math.round(Number(recoveryScore) || 0)));
    const hoursAwake = computeHoursAwake(wakeTime, currentHour);
    const drained = hoursAwake * DRAIN_PCT_PER_HOUR;
    const current = Math.max(0, Math.min(100, max - drained));
    return {
      maxCharge: max,
      currentLevel: current,
      fillRatio: current / 100,
    };
  }, [recoveryScore, wakeTime, currentHour]);

  const filledLength = ARC_LENGTH * fillRatio;
  const dashArray = `${filledLength} ${ARC_LENGTH}`;

  const centerValue = hasSleepData && maxCharge > 0
    ? `${Math.round(currentLevel)}%`
    : '—';
  const centerSub = hasSleepData && maxCharge > 0
    ? `${Math.round(maxCharge)}% al risveglio · ${phaseLabel}`
    : 'Registra il sonno';

  return (
    <div
      className={`energy-arc-widget ${className}`.trim()}
      role="img"
      aria-label={
        hasSleepData
          ? `Batteria energetica ${Math.round(currentLevel)} percento, fase ${phaseLabel}`
          : 'Batteria energetica, sonno non registrato'
      }
    >
      <svg
        viewBox="0 0 200 118"
        className="energy-arc-widget__svg"
        aria-hidden
      >
        <defs>
          <filter id="energy-arc-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke="rgba(148, 163, 184, 0.18)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
        />

        {/* Fill — stroke-dasharray */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke={phaseColor}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          filter="url(#energy-arc-glow)"
          className="energy-arc-widget__fill"
        />
      </svg>

      <div className="energy-arc-widget__center">
        <span className="energy-arc-widget__value" style={{ color: phaseColor }}>
          {centerValue}
        </span>
        <span className="energy-arc-widget__label">Body Battery</span>
        <span className="energy-arc-widget__sub">{centerSub}</span>
      </div>
    </div>
  );
}
