/**
 * Progress ring Tamagotchi intorno all'avatar Kentu.
 * pathLength=100: strokeDashoffset = 100 - score (nessun 2πr).
 *
 * @param {{
 *   score?: number,
 *   ringColor?: string,
 *   ringClass?: string,
 *   className?: string,
 *   children?: import('react').ReactNode,
 * }} props
 */
export default function VitalityAvatarRing({
  score = 0,
  ringColor = '#22d3ee',
  ringClass = 'stroke-cyan-400',
  className = '',
  children = null,
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const offset = 100 - clamped;

  return (
    <span
      className={[
        'relative inline-flex h-16 w-16 shrink-0 items-center justify-center',
        className,
      ].filter(Boolean).join(' ')}
      role="img"
      aria-label={`Indice di vitalità ${clamped} su 100`}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full -rotate-90 transform"
        viewBox="0 0 100 100"
        aria-hidden
      >
        <circle
          cx="50%"
          cy="50%"
          r="45%"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="3"
          fill="transparent"
        />
        <circle
          cx="50%"
          cy="50%"
          r="45%"
          stroke="currentColor"
          strokeWidth="3"
          fill="transparent"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={offset}
          className={`transition-all duration-1000 ease-out drop-shadow-lg ${ringClass}`}
          style={{ color: ringColor, filter: `drop-shadow(0 0 6px ${ringColor})` }}
        />
      </svg>
      <span className="relative z-10 inline-flex items-center justify-center">
        {children}
      </span>
    </span>
  );
}
