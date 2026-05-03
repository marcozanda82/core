import React, { useCallback, useState } from 'react';

import SleepCoachCard from '@/features/salaComandi/components/SleepCoachCard';

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

function statusLabel(status) {
  if (status === 'sleep_ok') return 'Buono';
  if (status === 'sleep_disrupted') return 'Disturbato';
  return 'Dati insufficienti';
}

function causesCount(data) {
  const raw = data && typeof data === 'object' && Array.isArray(data.likelyCauses)
    ? data.likelyCauses
    : [];
  return raw.filter(Boolean).length;
}

function subtitleForCauses(count) {
  if (count === 0) return 'Nessuna causa evidente';
  if (count === 1) return '1 possibile causa';
  return `${count} possibili cause`;
}

function borderTintFor(status) {
  if (status === 'sleep_ok') return 'rgba(110, 170, 140, 0.35)';
  if (status === 'sleep_disrupted') return 'rgba(200, 160, 90, 0.4)';
  return 'rgba(140, 150, 160, 0.28)';
}

/**
 * Riga compatta Sleep Coach + espansione nella card completa.
 * `data` è l’output di useSleepCoach (nessuna logica motore qui).
 *
 * @param {{ data?: object }} props
 */
export default function SleepCoachCompact({ data }) {
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(false);

  const toggle = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  if (!data || typeof data !== 'object') return null;

  const status = data.status;
  const tint = borderTintFor(status);
  const nCauses = causesCount(data);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto', boxSizing: 'border-box' }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          padding: '10px 12px',
          borderRadius: 10,
          border: `1px solid ${hover ? 'rgba(255,255,255,0.12)' : tint}`,
          background: hover ? 'rgba(24, 30, 38, 0.92)' : 'rgba(18, 22, 26, 0.82)',
          boxShadow: hover ? '0 4px 16px rgba(0, 0, 0, 0.35)' : 'none',
          cursor: 'pointer',
          boxSizing: 'border-box',
          fontFamily: FONT,
          outline: 'none',
          transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(236, 240, 245, 0.96)',
            }}
          >
            Sonno
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(180, 200, 210, 0.92)', whiteSpace: 'nowrap' }}>
            {statusLabel(status)}
          </span>
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            fontWeight: 500,
            color: 'rgba(160, 172, 186, 0.88)',
            lineHeight: 1.35,
          }}
        >
          {subtitleForCauses(nCauses)}
        </div>
      </div>
      {expanded ? <SleepCoachCard data={data} /> : null}
    </div>
  );
}
