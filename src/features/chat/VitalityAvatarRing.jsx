import { VITALITY_RING_CIRCUMFERENCE, VITALITY_RING_RADIUS } from './vitalityIndex.js';

/**
 * Progress ring Tamagotchi intorno all'avatar Kentu.
 *
 * @param {{
 *   score?: number,
 *   ringColor?: string,
 *   circumference?: number,
 *   strokeDashoffset?: number,
 *   className?: string,
 *   children?: import('react').ReactNode,
 * }} props
 */
export default function VitalityAvatarRing({
  score = 0,
  ringColor = '#06b6d4',
  circumference = VITALITY_RING_CIRCUMFERENCE,
  strokeDashoffset = null,
  className = '',
  children = null,
}) {
  const clamped = Math.max(0, Math.min(100, Number(score) || 0));
  const C = Number(circumference) > 0 ? Number(circumference) : VITALITY_RING_CIRCUMFERENCE;
  const offset = strokeDashoffset != null && Number.isFinite(Number(strokeDashoffset))
    ? Number(strokeDashoffset)
    : C - (C * clamped) / 100;

  return (
    <span
      className={[
        'relative inline-flex items-center justify-center',
        className,
      ].filter(Boolean).join(' ')}
      role="img"
      aria-label={`Indice di vitalità ${Math.round(clamped)} su 100`}
    >
      <svg
        className="pointer-events-none absolute -left-[10%] -top-[10%] h-[120%] w-[120%] -rotate-90 transform"
        viewBox="0 0 100 100"
        aria-hidden
      >
        <circle
          cx="50"
          cy="50"
          r={VITALITY_RING_RADIUS}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="3.5"
          fill="transparent"
        />
        <circle
          cx="50"
          cy="50"
          r={VITALITY_RING_RADIUS}
          stroke={ringColor}
          strokeWidth="3.5"
          fill="transparent"
          strokeDasharray={C}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 4px ${ringColor})` }}
        />
      </svg>
      <span className="relative z-[1] inline-flex">{children}</span>
    </span>
  );
}
