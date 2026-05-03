import { useState } from 'react';

import MetabolicCoachCard from '@/features/salaComandi/components/MetabolicCoachCard';

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

function nonEmptyString(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/**
 * Titolo sintetico: priorità campo espliciti, poi `title` (output attuale del motore), infine fallback.
 *
 * @param {object} coach
 */
function compactStatusLine(coach) {
  const d = nonEmptyString(coach.diagnosisTitle);
  if (d) return d;
  const s = nonEmptyString(coach.statusLabel);
  if (s) return s;
  const t = nonEmptyString(coach.title);
  if (t) return t;
  return 'Analisi disponibile';
}

function guidanceStepsCount(coach) {
  const raw = coach && typeof coach === 'object' && Array.isArray(coach.guidanceSteps) ? coach.guidanceSteps : [];
  return raw.filter(Boolean).length;
}

function subtitleForSteps(n) {
  if (n === 0) return 'Nessuna azione urgente';
  if (n === 1) return '1 azione suggerita';
  return `${n} azioni suggerite`;
}

function borderTintFor(severity) {
  if (severity === 'warning') return 'rgba(200, 140, 110, 0.35)';
  if (severity === 'good') return 'rgba(110, 170, 140, 0.38)';
  return 'rgba(255, 255, 255, 0.1)';
}

/**
 * Coach metabolico collassabile; `coach` coincide con l’`insight` di useMetabolicCoach.
 *
 * @param {{ coach?: object | null, className?: string }} props
 */
export default function MetabolicCoachCompact({ coach, className } = {}) {
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(false);

  const toggle = () => {
    setExpanded((v) => !v);
  };

  if (!coach || typeof coach !== 'object') return null;

  const tint = borderTintFor(coach.severity);
  const nSteps = guidanceStepsCount(coach);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  const rootClass = [className].filter(Boolean).join(' ') || undefined;

  return (
    <div
      className={rootClass}
      style={{ width: '100%', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto', boxSizing: 'border-box' }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Coach metabolico, espandi dettaglio"
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
            Coach metabolico
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(180, 200, 210, 0.92)', textAlign: 'right', flex: '1 1 120px', minWidth: 0 }}>
            {compactStatusLine(coach)}
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
          {subtitleForSteps(nSteps)}
        </div>
      </div>
      {expanded ? <MetabolicCoachCard insight={coach} /> : null}
    </div>
  );
}
