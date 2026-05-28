import React, { useId } from 'react';

/** Arco semicircolare Body Battery — look neon sottile; 💤 cyan se boost sonnellino. */
export default function EnergyArc({
  percentage,
  size = 'small',
  hasNapBoost = false,
  showText = true,
  accentColor = '#22d3ee',
}) {
  const arcColor = String(accentColor || '#22d3ee').trim() || '#22d3ee';
  const filterUid = useId().replace(/:/g, '');
  const energyVal = Number(percentage);
  const arcP = Math.min(100, Math.max(0, Number.isFinite(energyVal) ? energyVal : 0));
  const large = size === 'large';
  const w = large ? 200 : 52;
  const h = large ? 118 : 38;
  const r = large ? 82 : 21;
  const sw = large ? 5 : 2.25;
  const cx = w / 2;
  const cy = h - (large ? 10 : 7);
  const x1 = cx - r;
  const x2 = cx + r;
  const arcLen = Math.PI * r;
  const dashOffset = arcLen * (1 - arcP / 100);
  const gid = `${large ? 'eaL' : 'eaS'}_${filterUid}`;
  const pctRounded = Math.round(Number.isFinite(energyVal) ? energyVal : 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: large ? 8 : 2,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: large ? 8 : 4 }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
          <defs>
            <filter id={gid} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation={large ? 3.2 : 1.4} result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d={`M ${x1} ${cy} A ${r} ${r} 0 0 1 ${x2} ${cy}`}
            fill="none"
            stroke="#27272a"
            strokeWidth={sw + 1}
            strokeLinecap="round"
            opacity={0.95}
          />
          <path
            d={`M ${x1} ${cy} A ${r} ${r} 0 0 1 ${x2} ${cy}`}
            fill="none"
            stroke={arcColor}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={arcLen}
            strokeDashoffset={dashOffset}
            style={{
              transition: 'stroke-dashoffset 0.55s ease-out, stroke 0.45s ease-out',
              filter: `url(#${gid})`,
            }}
          />
        </svg>
        {hasNapBoost ? (
          <span
            style={{
              fontSize: large ? '1.75rem' : '0.85rem',
              lineHeight: 1,
              filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.85))',
              color: '#22d3ee',
              marginBottom: large ? 18 : 4,
            }}
            title="Boost sonnellino"
            aria-hidden
          >
            💤
          </span>
        ) : null}
      </div>
      {showText ? (
        <span
          style={{
            fontSize: large ? '1.35rem' : '0.62rem',
            fontWeight: 800,
            color: '#ecfdf5',
            letterSpacing: large ? '0.06em' : '-0.02em',
            textShadow: `0 0 12px ${arcColor}73`,
            lineHeight: 1,
          }}
        >
          {pctRounded}%
        </span>
      ) : null}
    </div>
  );
}
