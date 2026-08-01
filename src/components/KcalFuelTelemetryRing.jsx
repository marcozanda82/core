import { describeArc } from '../utils/kcalDialTelemetry';

const CX = 50;
const CY = 50;
/** Allineato a Recharts innerRadius 68% / outerRadius 85% (viewBox 100). */
const R_INNER = 34;
const R_OUTER = 42.5;

/**
 * Anello interno — carburante rispetto al target giornaliero.
 * A target raggiunto: anello pieno al 100%. In surplus: overfill rosso da ore 12.
 *
 * @param {{
 *   consumedKcal: number,
 *   dailyTargetKcal: number,
 *   maxScaleKcal?: number,
 * }} props
 */
export default function KcalFuelTelemetryRing({
  consumedKcal,
  dailyTargetKcal,
  maxScaleKcal,
}) {
  const target = Math.max(
    1,
    Number(dailyTargetKcal) || Number(maxScaleKcal) || 1,
  );
  const consumed = Math.max(0, Number(consumedKcal) || 0);
  const surplus = Math.max(0, consumed - target);

  // Base: clamp esatto al 100% del target (mai buco quando >= target).
  const baseRatio = Math.min(1, consumed / target);
  const overfillRatio = surplus > 0 ? Math.min(1, surplus / target) : 0;

  const midR = (R_INNER + R_OUTER) / 2;
  const strokeW = R_OUTER - R_INNER;
  const trackPath = describeArc(CX, CY, midR, -Math.PI / 2, (3 * Math.PI) / 2);

  const baseEndAngle = -Math.PI / 2 + baseRatio * 2 * Math.PI;
  const basePath =
    baseRatio > 0
      ? describeArc(CX, CY, midR, -Math.PI / 2, baseEndAngle)
      : '';

  // Overfill: riparte da ore 12 e si sovrappone in rosso intenso.
  const overfillEndAngle = -Math.PI / 2 + overfillRatio * 2 * Math.PI;
  const overfillPath =
    overfillRatio > 0
      ? describeArc(CX, CY, midR, -Math.PI / 2, overfillEndAngle)
      : '';

  return (
    <svg
      aria-hidden
      className="kcal-fuel-ring"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 8,
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
      }}
    >
      <defs>
        <linearGradient id="kcalFuelGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0891b2" />
          <stop offset="45%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
        <linearGradient id="kcalSurplusGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="55%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
      </defs>

      <path
        d={trackPath}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={strokeW}
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
      />
      {basePath ? (
        <path
          d={basePath}
          fill="none"
          stroke={surplus > 0 ? 'rgba(239, 68, 68, 0.35)' : 'url(#kcalFuelGradient)'}
          strokeWidth={strokeW}
          strokeLinecap="butt"
          vectorEffect="non-scaling-stroke"
          style={{
            filter:
              surplus > 0
                ? 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.25))'
                : 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.4))',
          }}
        />
      ) : null}
      {overfillPath ? (
        <path
          d={overfillPath}
          fill="none"
          stroke="url(#kcalSurplusGradient)"
          strokeWidth={strokeW * 0.72}
          strokeLinecap="butt"
          vectorEffect="non-scaling-stroke"
          style={{
            filter: 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.65))',
          }}
        />
      ) : null}
    </svg>
  );
}
