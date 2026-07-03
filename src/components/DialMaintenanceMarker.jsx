/**
 * Tacca di mantenimento (TDEE) sull'anello kcal rispetto al target pianificato.
 * Coordinate normalizzate viewBox 0–100 (allineate a innerRadius 68% / outerRadius 85%).
 *
 * @param {{
 *   tdeeRatio: number,
 *   isDeficit?: boolean,
 * }} props — `tdeeRatio` = TDEE / target (può essere > 1 in deficit)
 */
export default function DialMaintenanceMarker({ tdeeRatio, isDeficit = false }) {
  const rawRatio = Math.max(0, Number(tdeeRatio) || 0);
  const arcPosition = rawRatio > 1 ? 1 : rawRatio;
  const cx = 50;
  const cy = 50;
  const rInner = 34;
  const rOuter = 42.5;
  const angleRad = -Math.PI / 2 + arcPosition * 2 * Math.PI;
  const x1 = cx + rInner * Math.cos(angleRad);
  const y1 = cy + rInner * Math.sin(angleRad);
  const x2 = cx + (rOuter + 1.6) * Math.cos(angleRad);
  const y2 = cy + (rOuter + 1.6) * Math.sin(angleRad);

  const lineStroke = isDeficit ? '#0ea5e9' : '#f97316';
  const lineDash = isDeficit ? '4 4' : undefined;
  const dotFill = isDeficit ? 'rgba(14, 165, 233, 0.55)' : '#fb923c';
  const dotStroke = isDeficit ? '#0369a1' : '#ea580c';

  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 12,
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
      }}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={lineStroke}
        strokeWidth={0.8}
        strokeLinecap="round"
        strokeDasharray={lineDash}
        opacity={isDeficit ? 0.85 : 1}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x2} cy={y2} r={1.3} fill={dotFill} stroke={dotStroke} strokeWidth={0.25} />
    </svg>
  );
}
