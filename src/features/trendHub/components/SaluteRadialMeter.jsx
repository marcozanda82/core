import React, { useId, useMemo } from 'react';

function toneFromScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 75) return 'good';
  if (n >= 50) return 'mid';
  return 'low';
}

/**
 * Misuratore circolare SVG (stesso linguaggio visuale Progressione / score).
 * @param {{
 *   label: string,
 *   value: number | null,
 *   max?: number,
 *   display?: string,
 *   sublabel?: string,
 *   size?: number,
 * }} props
 */
export default function SaluteRadialMeter({
  label,
  value = null,
  max = 100,
  display = null,
  sublabel = '',
  size = 118,
} = {}) {
  const uid = useId().replace(/:/g, '');
  const gradId = `salute-radial-grad-${uid}`;
  const pct = useMemo(() => {
    const n = Number(value);
    const m = Number(max) > 0 ? Number(max) : 100;
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, (n / m) * 100));
  }, [value, max]);

  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const tone = toneFromScore(pct);
  const center = size / 2;
  const shown = display != null
    ? display
    : (value == null || !Number.isFinite(Number(value)) ? '—' : String(Math.round(Number(value))));

  return (
    <article className={`salute-radial-meter salute-radial-meter--${tone}`} aria-label={`${label}: ${shown}`}>
      <svg
        className="salute-radial-meter__svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tone === 'good' ? '#34d399' : tone === 'mid' ? '#fbbf24' : '#f87171'} />
            <stop offset="100%" stopColor={tone === 'good' ? '#22d3ee' : tone === 'mid' ? '#fb923c' : '#fb7185'} />
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dasharray 0.45s ease' }}
        />
        <text
          x={center}
          y={center - 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="salute-radial-meter__num"
        >
          {shown}
        </text>
      </svg>
      <div className="salute-radial-meter__meta">
        <span className="salute-radial-meter__label">{label}</span>
        {sublabel ? <span className="salute-radial-meter__sub">{sublabel}</span> : null}
      </div>
    </article>
  );
}
