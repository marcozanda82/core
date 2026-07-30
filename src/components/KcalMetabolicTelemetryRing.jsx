import {
  describeArc,
  kcalToAngleRad,
  polarToCartesian,
} from '../utils/kcalDialTelemetry';

const CX = 50;
const CY = 50;
const R_TRACK = 47.5;
const R_NODE = 47.5;

/**
 * Anello esterno Minimal HUD — solo zone + nodi (nessuna etichetta testo).
 *
 * @param {{
 *   maxScaleKcal: number,
 *   deficitKcal: number,
 *   targetStartKcal: number,
 *   targetEndKcal: number,
 *   surplusKcal: number,
 * }} props
 */
export default function KcalMetabolicTelemetryRing({
  maxScaleKcal,
  deficitKcal,
  targetStartKcal,
  targetEndKcal,
  surplusKcal,
}) {
  const max = Math.max(1, Number(maxScaleKcal) || 1);

  const zones = [
    { from: 0, to: deficitKcal, color: 'rgba(168, 85, 247, 0.22)', width: 1.2 },
    { from: deficitKcal, to: targetStartKcal, color: 'rgba(129, 140, 248, 0.35)', width: 1.3 },
    { from: targetStartKcal, to: targetEndKcal, color: 'rgba(34, 197, 94, 0.8)', width: 1.8 },
    { from: targetEndKcal, to: surplusKcal, color: 'rgba(249, 115, 22, 0.7)', width: 1.4 },
    { from: surplusKcal, to: max, color: 'rgba(220, 38, 38, 0.55)', width: 1.3 },
  ];

  /** Pallini vuoti colorati — stessa scala angolare dell'anello carburante. */
  const nodes = [
    { id: 'deficit', kcal: deficitKcal, stroke: '#a855f7' },
    { id: 'target-start', kcal: targetStartKcal, stroke: '#4ade80' },
    { id: 'target-end', kcal: targetEndKcal, stroke: '#fb923c' },
    { id: 'surplus', kcal: surplusKcal, stroke: '#f87171' },
  ];

  return (
    <svg
      aria-hidden
      className="kcal-metabolic-ring"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 9,
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
        overflow: 'visible',
      }}
    >
      <circle
        cx={CX}
        cy={CY}
        r={R_TRACK}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={1.1}
      />

      {zones.map((zone) => {
        const a0 = kcalToAngleRad(zone.from, max);
        const a1 = kcalToAngleRad(zone.to, max);
        const d = describeArc(CX, CY, R_TRACK, a0, a1);
        if (!d) return null;
        return (
          <path
            key={`${zone.from}-${zone.to}`}
            d={d}
            fill="none"
            stroke={zone.color}
            strokeWidth={zone.width}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {nodes.map((node) => {
        const angle = kcalToAngleRad(node.kcal, max);
        const { x, y } = polarToCartesian(CX, CY, R_NODE, angle);
        return (
          <circle
            key={node.id}
            cx={x}
            cy={y}
            r={1.85}
            fill="#050a12"
            stroke={node.stroke}
            strokeWidth={0.55}
          />
        );
      })}
    </svg>
  );
}
