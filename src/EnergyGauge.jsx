import React from 'react';

export function gaugeColorForPercentage(p) {
  const n = Number(p);
  if (n > 70) return '#00e676';
  if (n > 30) return '#ffea00';
  return '#ff4d4d';
}

/**
 * Semicerchio energia (TopBar small ~52×26, modale large ~140×70).
 */
export function EnergyGauge({ percentage, size = 'small' }) {
  const p = Math.min(100, Math.max(0, Number(percentage) || 0));
  const color = gaugeColorForPercentage(p);
  const large = size === 'large';
  const w = large ? 140 : 52;
  const h = large ? 70 : 26;
  const pctFontSize = large ? '1.35rem' : '0.75rem';
  const pctBottom = large ? '8px' : '2px';

  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <svg viewBox="0 0 100 50" style={{ width: '100%', height: '100%', overflow: 'visible' }} aria-hidden>
        <path d="M 10 45 A 40 40 0 0 1 90 45" fill="none" stroke="#222" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M 10 45 A 40 40 0 0 1 90 45"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray="125.6"
          strokeDashoffset={125.6 - (p / 100) * 125.6}
          style={{ transition: 'stroke-dashoffset 1s ease-in-out, stroke 0.5s' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: pctBottom,
          transform: 'translateX(-50%)',
          fontSize: pctFontSize,
          fontWeight: 'bold',
          color: '#e5e5e5',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {Math.round(p)}%
      </div>
    </div>
  );
}
