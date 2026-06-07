/**
 * Tacca di mantenimento (TDEE) sull'anello kcal quando il target include surplus pianificato.
 * @param {{ tdeeRatio: number, size?: number }} props — `tdeeRatio` = TDEE / target (0–1)
 */
export default function DialMaintenanceMarker({ tdeeRatio, size = 310 }) {
  const ratio = Math.max(0, Math.min(1, Number(tdeeRatio) || 0));
  const cx = size / 2;
  const cy = size / 2;
  const half = size / 2;
  const rInner = 0.68 * half;
  const rOuter = 0.85 * half;
  const angleRad = -Math.PI / 2 + ratio * 2 * Math.PI;
  const x1 = cx + rInner * Math.cos(angleRad);
  const y1 = cy + rInner * Math.sin(angleRad);
  const x2 = cx + (rOuter + 5) * Math.cos(angleRad);
  const y2 = cy + (rOuter + 5) * Math.sin(angleRad);

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
        stroke="rgba(226, 232, 240, 0.95)"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <circle
        cx={x2}
        cy={y2}
        r={4}
        fill="#e2e8f0"
        stroke="#94a3b8"
        strokeWidth={1}
      />
    </svg>
  );
}
