import React, { useMemo, useState } from 'react';
import {
  computeMetabolicCompassOrientation,
  METABOLIC_GOAL,
} from './metabolicDirection';

const GOALS = [
  METABOLIC_GOAL.RICOMPOSIZIONE,
  METABOLIC_GOAL.MASSA,
  METABOLIC_GOAL.PERDITA_GRASSO,
];

const NEEDLE_MIN_PX = 28;
const NEEDLE_MAX_PX = 96;

/**
 * Bussola metabolica — lettura immediata, stile scuro premium (Whoop / Apple).
 */
export default function MetabolicCompass() {
  const [goal, setGoal] = useState(METABOLIC_GOAL.RICOMPOSIZIONE);
  const [kcalBalance, setKcalBalance] = useState(0);
  const [trainingLoad, setTrainingLoad] = useState(45);

  const { finalAngle, magnitude } = useMemo(
    () => computeMetabolicCompassOrientation(kcalBalance, trainingLoad, goal),
    [kcalBalance, trainingLoad, goal]
  );

  const needleLengthPx = NEEDLE_MIN_PX + magnitude * (NEEDLE_MAX_PX - NEEDLE_MIN_PX);

  return (
    <div
      className="metabolic-compass-root"
      style={{
        width: '100%',
        maxWidth: 380,
        margin: '0 auto',
        padding: 'clamp(1rem, 4vw, 1.25rem)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}
    >
      {/* Obiettivo — solo parole */}
      <div
        role="tablist"
        aria-label="Obiettivo"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {GOALS.map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={goal === g}
            onClick={() => setGoal(g)}
            style={{
              padding: '8px 14px',
              borderRadius: 100,
              border:
                goal === g
                  ? '1px solid rgba(255,255,255,0.22)'
                  : '1px solid rgba(255,255,255,0.08)',
              background:
                goal === g ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              color: goal === g ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
              fontSize: 12,
              fontWeight: 560,
              letterSpacing: '0.02em',
              cursor: 'pointer',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Volto bussola */}
      <div
        style={{
          position: 'relative',
          width: 'min(100%, 300px)',
          aspectRatio: '1',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse 85% 85% at 50% 42%, #1c2128 0%, #0d0f12 52%, #060708 100%)',
          boxShadow: `
            inset 0 0 0 1px rgba(255,255,255,0.06),
            inset 0 1px 20px rgba(255,255,255,0.04),
            0 24px 48px rgba(0,0,0,0.45)
          `,
        }}
      >
        {/* Etichette bordo */}
        <CompassLabel style={{ left: '50%', top: '7%', transform: 'translateX(-50%)' }}>
          Ricomposizione
        </CompassLabel>
        <CompassLabel style={{ left: '78%', top: '20%', transform: 'translate(-50%, -50%)' }}>
          Massa
        </CompassLabel>
        <CompassLabel style={{ left: '22%', top: '78%', transform: 'translate(-50%, -50%)' }}>
          Perdita Grasso
        </CompassLabel>
        <CompassLabel style={{ left: '50%', bottom: '6%', transform: 'translateX(-50%)' }}>
          Catabolismo
        </CompassLabel>

        {/* Ago */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: 3,
              height: needleLengthPx,
              marginLeft: -1.5,
              transformOrigin: '50% 100%',
              transform: `rotate(${finalAngle}deg)`,
              transition: 'transform 0.4s ease, height 0.4s ease',
              borderRadius: 2,
              background:
                'linear-gradient(180deg, rgba(120, 220, 200, 0.95) 0%, rgba(72, 180, 170, 0.5) 55%, rgba(45, 120, 115, 0.35) 100%)',
              boxShadow:
                '0 0 12px rgba(100, 210, 190, 0.35), 0 0 24px rgba(80, 200, 180, 0.12)',
            }}
          />
        </div>

        {/* Utente al centro */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #a8e8e0 40%, #3d9a8f 100%)',
            boxShadow:
              '0 0 10px rgba(130, 230, 210, 0.65), 0 0 22px rgba(90, 200, 185, 0.35), inset 0 0 6px rgba(255,255,255,0.35)',
            zIndex: 2,
          }}
        />
      </div>

      {/* Input qualitativi — senza cifre visibili */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingTop: 4,
        }}
      >
        <RangeBare
          aria-label="Bilancio energetico"
          min={-500}
          max={500}
          value={kcalBalance}
          onChange={setKcalBalance}
        />
        <RangeBare
          aria-label="Carico allenamento"
          min={0}
          max={100}
          value={trainingLoad}
          onChange={setTrainingLoad}
        />
      </div>
    </div>
  );
}

function CompassLabel({ children, style }) {
  return (
    <span
      style={{
        position: 'absolute',
        maxWidth: '34%',
        textAlign: 'center',
        fontSize: 10,
        fontWeight: 550,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.38)',
        lineHeight: 1.25,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function RangeBare({ 'aria-label': ariaLabel, min, max, value, onChange }) {
  return (
    <input
      type="range"
      aria-label={ariaLabel}
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        width: '100%',
        height: 4,
        borderRadius: 4,
        appearance: 'none',
        WebkitAppearance: 'none',
        background: 'rgba(255,255,255,0.08)',
        outline: 'none',
        cursor: 'pointer',
      }}
      className="metabolic-compass-range"
    />
  );
}
