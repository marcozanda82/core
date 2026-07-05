import { useMemo } from 'react';

const BMR_TDEE_FRACTION = 0.7;
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

/**
 * Somma kcal degli allenamenti già terminati entro l'ora corrente.
 * @param {Array<Record<string, unknown>>} workoutsLog
 * @param {number} currentHour
 */
function sumActiveBurned(workoutsLog, currentHour) {
  const now = Number(currentHour);
  if (!Number.isFinite(now)) return 0;

  return (workoutsLog || []).reduce((sum, wk) => {
    const start = Number(wk?.time ?? wk?.mealTime);
    if (!Number.isFinite(start)) return sum;

    let durH = Number(wk?.duration);
    if (!Number.isFinite(durH) || durH <= 0) {
      const durMin = Number(wk?.durationMinutes);
      durH = Number.isFinite(durMin) && durMin > 0 ? durMin / 60 : 1;
    }

    const end = start + durH;
    if (end > now) return sum;

    return sum + (Number(wk?.kcal ?? wk?.cal) || 0);
  }, 0);
}

/**
 * Scaricamento metabolico reale (% Body Battery) da BMR orario + output attivo.
 */
function computeMetabolicDrain({
  recoveryScore,
  wakeTime,
  currentHour,
  dynamicDailyKcal,
  workoutsLog,
}) {
  const max = Math.max(0, Math.min(100, Math.round(Number(recoveryScore) || 0)));
  const tdee = Math.max(1, Number(dynamicDailyKcal) || 0);
  const hoursAwake = computeHoursAwake(wakeTime, currentHour);

  const bmrPerHour = (tdee * BMR_TDEE_FRACTION) / 24;
  const basalBurned = hoursAwake * bmrPerHour;
  const activeBurned = sumActiveBurned(workoutsLog, currentHour);
  const totalBurned = basalBurned + activeBurned;
  const drainPct = (totalBurned / tdee) * 100;
  const current = Math.max(0, Math.min(100, max - drainPct));

  return {
    maxCharge: max,
    currentLevel: current,
    fillRatio: current / 100,
    drainPct,
    basalBurned,
    activeBurned,
    totalBurned,
  };
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
 *   dynamicDailyKcal?: number,
 *   workoutsLog?: Array<Record<string, unknown>>,
 *   hasSleepData?: boolean,
 *   variant?: 'full' | 'mini',
 *   onClick?: () => void,
 *   className?: string,
 * }} props
 */
export default function EnergyArcWidget({
  recoveryScore = 0,
  wakeTime = 7,
  currentHour = 12,
  metabolicPhase = null,
  dynamicDailyKcal = 0,
  workoutsLog = [],
  hasSleepData = false,
  variant = 'full',
  onClick,
  className = '',
}) {
  const isMini = variant === 'mini';
  const phaseColor = resolvePhaseColor(metabolicPhase);
  const phaseLabel = resolvePhaseLabel(metabolicPhase);

  const { maxCharge, currentLevel, fillRatio } = useMemo(
    () => computeMetabolicDrain({
      recoveryScore,
      wakeTime,
      currentHour,
      dynamicDailyKcal,
      workoutsLog,
    }),
    [recoveryScore, wakeTime, currentHour, dynamicDailyKcal, workoutsLog],
  );

  const filledLength = ARC_LENGTH * fillRatio;
  const dashArray = `${filledLength} ${ARC_LENGTH}`;

  const centerValue = hasSleepData && maxCharge > 0
    ? `${Math.round(currentLevel)}%`
    : '—';
  const centerSub = hasSleepData && maxCharge > 0
    ? `${Math.round(maxCharge)}% al risveglio · ${phaseLabel}`
    : 'Registra il sonno';

  const rootClassName = [
    'energy-arc-widget',
    isMini ? 'energy-arc-widget--mini' : '',
    onClick ? 'energy-arc-widget--interactive' : '',
    className,
  ].filter(Boolean).join(' ');

  const ariaLabel = hasSleepData
    ? `Batteria energetica ${Math.round(currentLevel)} percento, fase ${phaseLabel}`
    : 'Batteria energetica, sonno non registrato';

  const content = (
    <>
      <svg
        viewBox="0 0 200 118"
        className="energy-arc-widget__svg"
        aria-hidden
      >
        <defs>
          <filter id={isMini ? 'energy-arc-glow-mini' : 'energy-arc-glow'} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d={ARC_PATH}
          fill="none"
          stroke="rgba(148, 163, 184, 0.18)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
        />

        <path
          d={ARC_PATH}
          fill="none"
          stroke={phaseColor}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          filter={isMini ? 'url(#energy-arc-glow-mini)' : 'url(#energy-arc-glow)'}
          className="energy-arc-widget__fill"
        />
      </svg>

      <div className="energy-arc-widget__center">
        <span className="energy-arc-widget__value" style={{ color: phaseColor }}>
          {centerValue}
        </span>
        {!isMini && (
          <>
            <span className="energy-arc-widget__label">Body Battery</span>
            <span className="energy-arc-widget__sub">{centerSub}</span>
          </>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={rootClassName}
        onClick={onClick}
        aria-label={ariaLabel}
        title={isMini ? centerSub : undefined}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={rootClassName} role="img" aria-label={ariaLabel}>
      {content}
    </div>
  );
}
