import React, { useMemo } from 'react';

const TIMEFRAME_OPTIONS = ['AUTO', 'IERI', '7G', '14G', '30G'];
const BOTTOM_MENU_ITEMS = ['Oggi', 'Timeline', 'Salute', 'Progetti', 'Menu'];
const ROUTE_LABELS = ['STALLO', 'DEFINIZIONE', 'MANUTENZIONE', 'MASSA PULITA', 'MASSA SPORCA'];

function BrushedMetalPanel({ children, style }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px solid rgba(148, 163, 184, 0.22)',
        background:
          'linear-gradient(160deg, rgba(17, 24, 39, 0.96) 0%, rgba(30, 41, 59, 0.9) 50%, rgba(17, 24, 39, 0.95) 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 10px rgba(2,6,23,0.62), 0 12px 30px rgba(2,6,23,0.45)',
        backdropFilter: 'blur(8px)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CentralCompass({ angleDeg = -35 }) {
  const ticks = useMemo(() => Array.from({ length: 72 }, (_, index) => index), []);
  const screws = [
    { x: 70, y: 70 },
    { x: 330, y: 70 },
    { x: 70, y: 330 },
    { x: 330, y: 330 },
  ];

  return (
    <g transform="translate(200 200)">
      <defs>
        <filter id="kentu-neon-glow" x="-200%" y="-200%" width="400%" height="400%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="blur1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="5.2" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="kentu-metal-gradient" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="#4b5563" />
          <stop offset="35%" stopColor="#1f2937" />
          <stop offset="70%" stopColor="#111827" />
          <stop offset="100%" stopColor="#030712" />
        </radialGradient>
        <radialGradient id="kentu-pin-gradient" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#d1d5db" />
          <stop offset="50%" stopColor="#6b7280" />
          <stop offset="100%" stopColor="#111827" />
        </radialGradient>
        <path id="kentu-top-arc" d="M -132 0 A 132 132 0 0 1 132 0" />
        <path id="kentu-bottom-arc" d="M -128 0 A 128 128 0 0 0 128 0" />
      </defs>

      <circle r="146" fill="url(#kentu-metal-gradient)" stroke="rgba(148,163,184,0.45)" strokeWidth="2.2" />
      <circle r="132" fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="1.1" />

      <text fill="rgba(226,232,240,0.78)" fontSize="10" letterSpacing="2.4" fontWeight="700">
        <textPath href="#kentu-top-arc" startOffset="50%" textAnchor="middle">
          MAGNETIC METABOLIC COMPASS
        </textPath>
      </text>
      <text fill="rgba(203,213,225,0.62)" fontSize="8" letterSpacing="2.2" fontWeight="600">
        <textPath href="#kentu-bottom-arc" startOffset="50%" textAnchor="middle">
          ANALOGUE VETTORE PREDIZIONE
        </textPath>
      </text>
      <text
        x="0"
        y="-104"
        textAnchor="middle"
        fill="rgba(226,232,240,0.7)"
        fontSize="9"
        letterSpacing="2.5"
        fontWeight="700"
      >
        ANALYSIS
      </text>

      {screws.map((screw, index) => (
        <g key={`${screw.x}-${screw.y}-${index}`} transform={`translate(${screw.x - 200} ${screw.y - 200})`}>
          <circle r="10" fill="rgba(15,23,42,0.9)" stroke="rgba(148,163,184,0.55)" strokeWidth="1.2" />
          <line x1="-4" y1="0" x2="4" y2="0" stroke="rgba(203,213,225,0.65)" strokeWidth="1.2" />
          <line x1="0" y1="-4" x2="0" y2="4" stroke="rgba(203,213,225,0.65)" strokeWidth="1.2" />
        </g>
      ))}

      <circle r="98" fill="rgba(3, 7, 18, 0.94)" stroke="rgba(148,163,184,0.35)" strokeWidth="1.2" />
      {ticks.map((tick) => {
        const angle = tick * 5;
        const major = tick % 6 === 0;
        const inner = major ? 81 : 87;
        const outer = 95;
        const width = major ? 1.7 : 0.8;
        const alpha = major ? 0.62 : 0.26;
        return (
          <line
            key={tick}
            x1={Math.cos((angle * Math.PI) / 180) * inner}
            y1={Math.sin((angle * Math.PI) / 180) * inner}
            x2={Math.cos((angle * Math.PI) / 180) * outer}
            y2={Math.sin((angle * Math.PI) / 180) * outer}
            stroke={`rgba(203, 213, 225, ${alpha})`}
            strokeWidth={width}
            strokeLinecap="round"
          />
        );
      })}

      <circle
        r="90.5"
        fill="none"
        stroke="rgba(56, 189, 248, 0.98)"
        strokeWidth="1.6"
        strokeLinecap="round"
        filter="url(#kentu-neon-glow)"
      />

      {[
        { txt: 'N', x: 0, y: -100 },
        { txt: 'E', x: 100, y: 3 },
        { txt: 'S', x: 0, y: 106 },
        { txt: 'W', x: -102, y: 3 },
      ].map((cardinal) => (
        <text
          key={cardinal.txt}
          x={cardinal.x}
          y={cardinal.y}
          textAnchor="middle"
          fill="rgba(125, 211, 252, 0.96)"
          fontSize="14"
          fontWeight="700"
          letterSpacing="0.25em"
          filter="url(#kentu-neon-glow)"
        >
          {cardinal.txt}
        </text>
      ))}

      <text x="0" y="-28" textAnchor="middle" fill="rgba(148,163,184,0.72)" fontSize="8" letterSpacing="1.7">
        PRECISION FEEDBACK
      </text>
      <text x="0" y="40" textAnchor="middle" fill="rgba(148,163,184,0.58)" fontSize="7.5" letterSpacing="1.6">
        MAGNETIC INDUCTION
      </text>

      <g transform={`rotate(${angleDeg})`} style={{ transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
        <polygon points="0,-76 10,-8 0,6 -10,-8" fill="#ef4444" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
        <polygon points="0,76 10,8 0,-6 -10,8" fill="#0f172a" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
      </g>

      <g>
        <circle r="17" fill="url(#kentu-pin-gradient)" stroke="rgba(148,163,184,0.62)" strokeWidth="1.2" />
        <circle r="8.2" fill="rgba(15,23,42,0.85)" stroke="rgba(203,213,225,0.5)" strokeWidth="1" />
        <line x1="-4" y1="0" x2="4" y2="0" stroke="rgba(226,232,240,0.72)" strokeWidth="1.2" />
        <line x1="0" y1="-4" x2="0" y2="4" stroke="rgba(226,232,240,0.72)" strokeWidth="1.2" />
      </g>
    </g>
  );
}

function RouteNavigatorPanel() {
  return (
    <BrushedMetalPanel
      style={{
        marginTop: 14,
        padding: '12px 14px',
      }}
    >
      <div style={{ color: 'rgba(226,232,240,0.88)', fontSize: 11, letterSpacing: '0.18em', fontWeight: 700 }}>
        NAVIGATORE DI ROTTA
      </div>
      <svg viewBox="0 0 360 74" style={{ width: '100%', marginTop: 8 }}>
        <line x1="18" y1="42" x2="342" y2="42" stroke="rgba(148,163,184,0.4)" strokeWidth="1.2" />
        <polyline points="18,42 90,36 158,30 220,34 278,38 342,46" fill="none" stroke="rgba(56,189,248,0.7)" strokeWidth="1.8" />
        <polyline points="18,48 90,52 158,58 220,54 278,50 342,44" fill="none" stroke="rgba(239,68,68,0.62)" strokeWidth="1.4" />
        {ROUTE_LABELS.map((label, index) => (
          <text
            key={label}
            x={18 + index * 81}
            y="68"
            textAnchor="middle"
            fill="rgba(203,213,225,0.76)"
            fontSize="8.2"
            letterSpacing="0.08em"
          >
            {label}
          </text>
        ))}
        <text x="24" y="18" fill="rgba(148,163,184,0.78)" fontSize="7.8" letterSpacing="0.13em">
          PERFORMANCE
        </text>
        <text x="260" y="18" fill="rgba(148,163,184,0.78)" fontSize="7.8" letterSpacing="0.13em">
          LONGEVITA
        </text>
      </svg>
    </BrushedMetalPanel>
  );
}

export default function MetabolicUI() {
  return (
    <section
      style={{
        width: '100%',
        maxWidth: 460,
        margin: '0 auto',
        padding: '16px 12px 20px',
        color: '#e2e8f0',
        borderRadius: 22,
        background:
          'radial-gradient(circle at 50% 20%, rgba(30,41,59,0.42) 0%, rgba(2,6,23,0.98) 72%), linear-gradient(180deg, #020617 0%, #030712 100%)',
        boxShadow: '0 20px 48px rgba(2, 6, 23, 0.6)',
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
      }}
    >
      <BrushedMetalPanel style={{ padding: '12px 10px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            {TIMEFRAME_OPTIONS.map((option) => {
              const active = option === 'AUTO';
              return (
                <button
                  key={option}
                  type="button"
                  style={{
                    flex: 1,
                    borderRadius: 9,
                    border: active ? '1px solid rgba(56,189,248,0.62)' : '1px solid rgba(148,163,184,0.24)',
                    background: active ? 'rgba(56,189,248,0.16)' : 'rgba(15,23,42,0.62)',
                    color: active ? '#e0f2fe' : 'rgba(203,213,225,0.78)',
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    padding: '8px 0',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <div
            style={{
              minWidth: 94,
              borderRadius: 999,
              border: '1px solid rgba(248,250,252,0.26)',
              background: 'rgba(15,23,42,0.65)',
              padding: '7px 10px',
              textAlign: 'center',
              fontSize: 10,
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            Energia 30%
          </div>
        </div>
      </BrushedMetalPanel>

      <BrushedMetalPanel style={{ marginTop: 12, padding: 12 }}>
        <svg viewBox="0 0 400 400" role="img" aria-label="KentuOS Metabolic Map" style={{ width: '100%', borderRadius: 16 }}>
          <defs>
            <pattern id="kentu-grid-minor" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="0.8" />
            </pattern>
            <pattern id="kentu-grid-major" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M80 0H0V80" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect x="0" y="0" width="400" height="400" fill="rgba(2,6,23,0.65)" />
          <rect x="0" y="0" width="400" height="400" fill="url(#kentu-grid-minor)" />
          <rect x="0" y="0" width="400" height="400" fill="url(#kentu-grid-major)" />

          <line x1="200" y1="0" x2="200" y2="400" stroke="rgba(148,163,184,0.4)" strokeWidth="1.1" />
          <line x1="0" y1="200" x2="400" y2="200" stroke="rgba(148,163,184,0.4)" strokeWidth="1.1" />

          <text x="16" y="42" fill="rgba(244,114,182,0.72)" fontSize="11" letterSpacing="0.1em">
            TIRAGGIO ESTREMO
          </text>
          <text x="292" y="42" fill="rgba(251,191,36,0.72)" fontSize="11" letterSpacing="0.1em">
            MASSA SPORCA
          </text>
          <text x="18" y="198" fill="rgba(125,211,252,0.75)" fontSize="10" letterSpacing="0.1em">
            CONDIZIONE ESTETICA
          </text>
          <text x="262" y="198" fill="rgba(125,211,252,0.75)" fontSize="10" letterSpacing="0.1em">
            CONDIZIONE ESTETICA
          </text>
          <text x="18" y="382" fill="rgba(248,113,113,0.72)" fontSize="11" letterSpacing="0.1em">
            CATABOLISMO
          </text>
          <text x="278" y="382" fill="rgba(250,204,21,0.74)" fontSize="11" letterSpacing="0.1em">
            APPANNAMENTO
          </text>

          <polyline
            points="58,292 90,274 124,262 158,246 184,224 212,214 240,196 268,180 294,165 318,152"
            fill="none"
            stroke="rgba(148,163,184,0.54)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <CentralCompass angleDeg={-30} />
        </svg>
      </BrushedMetalPanel>

      <RouteNavigatorPanel />

      <BrushedMetalPanel
        style={{
          marginTop: 12,
          padding: '8px 9px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <button
          type="button"
          aria-label="Aggiungi"
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: '1px solid rgba(148,163,184,0.3)',
            background: 'rgba(15,23,42,0.72)',
            color: 'rgba(226,232,240,0.92)',
            fontSize: 22,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          +
        </button>
        <div
          style={{
            flex: 1,
            borderRadius: 10,
            border: '1px solid rgba(148,163,184,0.24)',
            background: 'rgba(15,23,42,0.62)',
            padding: '9px 12px',
            color: 'rgba(148,163,184,0.78)',
            fontSize: 14,
          }}
        >
          Chiedi a Kentu...
        </div>
      </BrushedMetalPanel>

      <BrushedMetalPanel
        style={{
          marginTop: 12,
          padding: '9px 8px',
          display: 'grid',
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          gap: 6,
        }}
      >
        {BOTTOM_MENU_ITEMS.map((item) => {
          const active = item === 'Salute';
          return (
            <button
              key={item}
              type="button"
              style={{
                borderRadius: 10,
                border: active ? '1px solid rgba(56,189,248,0.62)' : '1px solid rgba(148,163,184,0.2)',
                background: active ? 'rgba(56,189,248,0.16)' : 'rgba(15,23,42,0.6)',
                color: active ? '#e0f2fe' : 'rgba(203,213,225,0.84)',
                fontSize: 11,
                padding: '9px 0',
                letterSpacing: '0.08em',
                fontWeight: active ? 700 : 600,
                cursor: 'pointer',
              }}
            >
              {item}
            </button>
          );
        })}
      </BrushedMetalPanel>
    </section>
  );
}
