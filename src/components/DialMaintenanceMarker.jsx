/**
 * Tacca di mantenimento (TDEE) sull'anello kcal rispetto al target pianificato.
 * @param {{
 *   tdeeRatio: number,
 *   isDeficit?: boolean,
 *   size?: number,
 * }} props — `tdeeRatio` = TDEE / target (può essere > 1 in deficit)
 */
export default function DialMaintenanceMarker({ tdeeRatio, isDeficit = false, size = 310 }) {
  const rawRatio = Math.max(0, Number(tdeeRatio) || 0);
  // Oltre il 100% del target (deficit): tacca al termine del giro anello
  const arcPosition = rawRatio > 1 ? 1 : rawRatio;
  const cx = size / 2;
  const cy = size / 2;
  const half = size / 2;
  const rInner = 0.68 * half;
  const rOuter = 0.85 * half;
  const angleRad = -Math.PI / 2 + arcPosition * 2 * Math.PI;
  const x1 = cx + rInner * Math.cos(angleRad);
  const y1 = cy + rInner * Math.sin(angleRad);
  const x2 = cx + (rOuter + 5) * Math.cos(angleRad);
  const y2 = cy + (rOuter + 5) * Math.sin(angleRad);

  const lineStroke = isDeficit ? '#0ea5e9' : '#f97316';
  const lineDash = isDeficit ? '4 4' : undefined;
  const dotFill = isDeficit ? 'rgba(14, 165, 233, 0.55)' : '#fb923c';
  const dotStroke = isDeficit ? '#0369a1' : '#ea580c';

  return (
    <svg
      aria-hidden
      style={{ position: 'absolute', inset: 0, zIndex: 12, pointerEvents: 'none' }}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={lineStroke}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={lineDash}
        opacity={isDeficit ? 0.85 : 1}
      />
      <circle
        cx={x2}
        cy={y2}
        r={4}
        fill={dotFill}
        stroke={dotStroke}
        strokeWidth={1}
      />
    </svg>
  );
}
