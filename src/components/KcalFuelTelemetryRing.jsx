import { describeArc, kcalToAngleRad } from '../utils/kcalDialTelemetry';

const CX = 50;
const CY = 50;
/** Allineato a Recharts innerRadius 68% / outerRadius 85% (viewBox 100). */
const R_INNER = 34;
const R_OUTER = 42.5;

/**
 * Anello interno — carburante (kcal assunte su fondo scala).
 */
export default function KcalFuelTelemetryRing({ consumedKcal, maxScaleKcal }) {
  const max = Math.max(1, Number(maxScaleKcal) || 1);
  const consumed = Math.max(0, Number(consumedKcal) || 0);
  const fillRatio = Math.min(1, consumed / max);

  const trackPath = describeArc(CX, CY, (R_INNER + R_OUTER) / 2, -Math.PI / 2, (3 * Math.PI) / 2);
  const endAngle = kcalToAngleRad(consumed, max);
  const fillPath =
    fillRatio > 0
      ? describeArc(CX, CY, (R_INNER + R_OUTER) / 2, -Math.PI / 2, endAngle)
      : '';

  const strokeW = R_OUTER - R_INNER;

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
      <path
        d={trackPath}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={strokeW}
        strokeLinecap="butt"
        vectorEffect="non-scaling-stroke"
      />
      {fillPath ? (
        <path
          d={fillPath}
          fill="none"
          stroke="url(#kcalFuelGradient)"
          strokeWidth={strokeW}
          strokeLinecap="butt"
          vectorEffect="non-scaling-stroke"
          style={{
            filter: 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.4))',
          }}
        />
      ) : null}
      <defs>
        <linearGradient id="kcalFuelGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0891b2" />
          <stop offset="45%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
      </defs>
    </svg>
  );
}
