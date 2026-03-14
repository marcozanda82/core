/**
 * ReadyCoreSplash.jsx — Schermata di avvio con animazione e icone DNA, Flame, Dumbbell.
 * Chiama onComplete al termine dell'animazione.
 */
import React, { useEffect, useState } from 'react';

const SPLASH_DURATION_MS = 2600;

export default function ReadyCoreSplash({ onComplete }) {
  const [phase, setPhase] = useState('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('icons'), 400);
    const t2 = setTimeout(() => setPhase('out'), SPLASH_DURATION_MS - 500);
    const t3 = setTimeout(() => {
      if (typeof onComplete === 'function') onComplete();
    }, SPLASH_DURATION_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'linear-gradient(180deg, #050508 0%, #0a0a12 50%, #050508 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes splashFadeIn {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes splashIconPop {
          0% { opacity: 0; transform: scale(0.3); }
          55% { transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes splashPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes splashFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        .splash-logo { animation: splashFadeIn 0.5s ease-out forwards; }
        .splash-icon { animation: splashIconPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .splash-icon-1 { animation-delay: 0.15s; opacity: 0; }
        .splash-icon-2 { animation-delay: 0.3s; opacity: 0; }
        .splash-icon-3 { animation-delay: 0.45s; opacity: 0; }
        .splash-subtitle { animation: splashPulse 1.2s ease-in-out infinite; animation-delay: 0.8s; opacity: 0; animation-fill-mode: forwards; }
        .splash-exit { animation: splashFadeOut 0.5s ease-out forwards; }
      `}</style>

      <div
        style={{
          opacity: phase === 'out' ? 0 : 1,
          transition: phase === 'out' ? 'opacity 0.5s ease-out' : 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
        }}
      >
        <h1
          className="splash-logo"
          style={{
            margin: 0,
            fontSize: 'clamp(1.8rem, 6vw, 2.5rem)',
            fontWeight: 800,
            letterSpacing: '0.2em',
            color: '#00e5ff',
            textShadow: '0 0 30px rgba(0, 229, 255, 0.4)',
          }}
        >
          ReadyCore
        </h1>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '28px',
            marginTop: '8px',
          }}
        >
          <span
            className="splash-icon splash-icon-1"
            style={{ fontSize: '2rem', filter: 'drop-shadow(0 0 8px rgba(0, 229, 255, 0.5))' }}
            title="DNA"
          >
            🧬
          </span>
          <span
            className="splash-icon splash-icon-2"
            style={{ fontSize: '2rem', filter: 'drop-shadow(0 0 8px rgba(255, 152, 0, 0.5))' }}
            title="Flame"
          >
            🔥
          </span>
          <span
            className="splash-icon splash-icon-3"
            style={{ fontSize: '2rem', filter: 'drop-shadow(0 0 8px rgba(0, 230, 118, 0.5))' }}
            title="Dumbbell"
          >
            🏋️
          </span>
        </div>

        <p
          className="splash-subtitle"
          style={{
            margin: 0,
            fontSize: '0.75rem',
            color: 'rgba(255, 255, 255, 0.5)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          Motore biochimico
        </p>
      </div>
    </div>
  );
}
