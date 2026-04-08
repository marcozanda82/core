import React, { useMemo, useState } from 'react';
import {
  computeMetabolicCompassOrientation,
  METABOLIC_COMPASS_DIRECTIONS,
  METABOLIC_GOAL,
} from './metabolicDirection';

const GOALS = [
  METABOLIC_GOAL.RICOMPOSIZIONE,
  METABOLIC_GOAL.MASSA,
  METABOLIC_GOAL.PERDITA_GRASSO,
];

const NEEDLE_MIN_PX = 28;
const NEEDLE_MAX_PX = 96;

/** Allineamento da |finalAngle|: ago + alone coerenti. */
const ALIGNMENT_TIERS = {
  aligned: {
    needleBg:
      'linear-gradient(180deg, rgba(130, 245, 205, 0.98) 0%, rgba(72, 205, 165, 0.62) 48%, rgba(38, 145, 118, 0.48) 100%)',
    needleGlow:
      '0 0 14px rgba(90, 235, 185, 0.55), 0 0 28px rgba(65, 215, 165, 0.32), 0 0 42px rgba(50, 195, 150, 0.14)',
    centerGlow:
      '0 0 10px rgba(110, 240, 190, 0.75), 0 0 24px rgba(75, 210, 170, 0.4), inset 0 0 6px rgba(255,255,255,0.38)',
    centerRing: 'rgba(120, 235, 195, 0.55)',
  },
  partial: {
    needleBg:
      'linear-gradient(180deg, rgba(175, 195, 205, 0.88) 0%, rgba(95, 120, 135, 0.42) 52%, rgba(52, 68, 80, 0.36) 100%)',
    needleGlow:
      '0 0 10px rgba(255,255,255,0.14), 0 0 22px rgba(150, 170, 185, 0.1)',
    centerGlow:
      '0 0 8px rgba(200, 210, 220, 0.35), 0 0 18px rgba(140, 155, 170, 0.15), inset 0 0 5px rgba(255,255,255,0.28)',
    centerRing: 'rgba(180, 195, 208, 0.35)',
  },
  off: {
    needleBg:
      'linear-gradient(180deg, rgba(255, 168, 158, 0.95) 0%, rgba(215, 95, 88, 0.52) 50%, rgba(130, 52, 55, 0.42) 100%)',
    needleGlow:
      '0 0 14px rgba(255, 130, 118, 0.38), 0 0 28px rgba(225, 85, 78, 0.2), 0 0 38px rgba(190, 60, 58, 0.1)',
    centerGlow:
      '0 0 10px rgba(255, 140, 125, 0.45), 0 0 22px rgba(210, 75, 70, 0.22), inset 0 0 5px rgba(255,255,255,0.22)',
    centerRing: 'rgba(255, 140, 125, 0.4)',
  },
};

function alignmentFromFinalAngle(finalAngle) {
  const difference = Math.abs(finalAngle);
  if (difference < 15) return { tier: 'aligned', difference };
  if (difference <= 45) return { tier: 'partial', difference };
  return { tier: 'off', difference };
}

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

  const { tier } = useMemo(() => alignmentFromFinalAngle(finalAngle), [finalAngle]);
  const tierStyle = ALIGNMENT_TIERS[tier];

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
        {/* Tacche cardinali (8 direzioni) */}
        {METABOLIC_COMPASS_DIRECTIONS.map(({ angleDeg }) => (
          <div
            key={`tick-${angleDeg}`}
            aria-hidden
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: angleDeg % 90 === 0 ? 2 : 1,
              height: '15%',
              marginLeft: angleDeg % 90 === 0 ? -1 : -0.5,
              transformOrigin: '50% 100%',
              transform: `translateY(-100%) rotate(${angleDeg}deg)`,
              background:
                angleDeg % 90 === 0
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 100%)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)',
              borderRadius: 1,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Etichette rosa — posizione da angolo bussola (0° = alto) */}
        {METABOLIC_COMPASS_DIRECTIONS.map(({ angleDeg, label }) => (
          <CompassLabel key={`lbl-${angleDeg}`} style={compassLabelStyleFromAngleDeg(angleDeg)}>
            {label}
          </CompassLabel>
        ))}

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
              transition:
                'transform 0.4s ease, height 0.4s ease, box-shadow 0.35s ease, background 0.35s ease',
              borderRadius: 2,
              background: tierStyle.needleBg,
              boxShadow: tierStyle.needleGlow,
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
            background:
              tier === 'aligned'
                ? 'radial-gradient(circle at 35% 35%, #ffffff 0%, #a8f0d8 42%, #2d8f78 100%)'
                : tier === 'partial'
                  ? 'radial-gradient(circle at 35% 35%, #f2f6f8 0%, #b8c5d0 45%, #5a6b78 100%)'
                  : 'radial-gradient(circle at 35% 35%, #fff5f4 0%, #f0b0a8 42%, #a84845 100%)',
            boxShadow: tierStyle.centerGlow,
            border: `1px solid ${tierStyle.centerRing}`,
            transition: 'box-shadow 0.35s ease, background 0.35s ease, border-color 0.35s ease',
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

/** Posizione % sul volto: 0° = Nord, positivo = orario. */
function compassLabelStyleFromAngleDeg(angleDeg, radiusPct = 40) {
  const rad = (angleDeg * Math.PI) / 180;
  const left = 50 + radiusPct * Math.sin(rad);
  const top = 50 - radiusPct * Math.cos(rad);
  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: 'translate(-50%, -50%)',
  };
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
