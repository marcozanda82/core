import React, { useEffect, useMemo, useState } from 'react';
import {
  getGoalCompassAngleDeg,
  getMetabolicTargetAngle,
  metabolicAngleDegToCompassBearingDeg,
  METABOLIC_COMPASS_DIRECTIONS,
  METABOLIC_GOAL,
  METABOLIC_KCAL_NORMALIZATION_REF,
  METABOLIC_TRAINING_NORMALIZATION_REF,
} from './metabolicDirection';
import { useMetabolicDirectionEngine } from './metabolicDirectionEngine';

const FINAL_ANGLE_MIN = -135;
const FINAL_ANGLE_MAX = 135;

const GOALS = [
  METABOLIC_GOAL.RICOMPOSIZIONE,
  METABOLIC_GOAL.MASSA,
  METABOLIC_GOAL.PERDITA_GRASSO,
];

const ARROW_MIN_PX = 12;
const ARROW_MAX_PX = 102;

const ARROW_TRANSITION =
  'transform 0.55s cubic-bezier(0.33, 0.86, 0.36, 1), height 0.55s cubic-bezier(0.33, 0.86, 0.36, 1), opacity 0.4s ease, box-shadow 0.45s ease, background 0.4s ease';

/** Griglia bussola: cerchi concentrici + raggi (viewBox 100×100, centro 50,50). */
const DIAL_GRID_RINGS = [12.5, 22.5, 32.5];
const DIAL_RADIAL_INNER = 10;
const DIAL_RADIAL_OUTER = 44.5;

function isCardinalCompassAngle(angleDeg) {
  return angleDeg === 0 || angleDeg === 90 || angleDeg === 180 || angleDeg === -90;
}

function CompassDialGrid({ directions }) {
  return (
    <svg
      className="metabolic-compass-dial-grid"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {DIAL_GRID_RINGS.map((r) => (
        <circle
          key={`ring-${r}`}
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.045)"
          strokeWidth={0.35}
          vectorEffect="nonScalingStroke"
        />
      ))}
      {directions.map(({ angleDeg }) => {
        const rad = (angleDeg * Math.PI) / 180;
        const sin = Math.sin(rad);
        const cos = Math.cos(rad);
        const x1 = 50 + DIAL_RADIAL_INNER * sin;
        const y1 = 50 - DIAL_RADIAL_INNER * cos;
        const x2 = 50 + DIAL_RADIAL_OUTER * sin;
        const y2 = 50 - DIAL_RADIAL_OUTER * cos;
        const card = isCardinalCompassAngle(angleDeg);
        return (
          <line
            key={`rad-${angleDeg}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={card ? 'rgba(255,255,255,0.085)' : 'rgba(255,255,255,0.038)'}
            strokeWidth={card ? 0.45 : 0.28}
            vectorEffect="nonScalingStroke"
          />
        );
      })}
    </svg>
  );
}

/** Allineamento da |finalAngle|: alone coerenti (freccia = direzione reale). */
const ALIGNMENT_TIERS = {
  aligned: {
    needleBg:
      'linear-gradient(180deg, rgba(200, 255, 235, 0.95) 0%, rgba(95, 235, 195, 0.55) 45%, rgba(45, 165, 135, 0.25) 100%)',
    needleGlow:
      '0 0 4px rgba(160, 255, 220, 0.9), 0 0 12px rgba(80, 220, 175, 0.65), 0 0 24px rgba(50, 190, 155, 0.35), 0 0 40px rgba(40, 160, 130, 0.12)',
    centerGlow:
      '0 0 10px rgba(110, 240, 190, 0.75), 0 0 24px rgba(75, 210, 170, 0.4), inset 0 0 6px rgba(255,255,255,0.38)',
    centerRing: 'rgba(120, 235, 195, 0.55)',
  },
  partial: {
    needleBg:
      'linear-gradient(180deg, rgba(230, 238, 245, 0.9) 0%, rgba(130, 155, 175, 0.5) 50%, rgba(70, 90, 105, 0.2) 100%)',
    needleGlow:
      '0 0 3px rgba(255,255,255,0.35), 0 0 10px rgba(170, 195, 215, 0.35), 0 0 22px rgba(120, 145, 165, 0.18)',
    centerGlow:
      '0 0 8px rgba(200, 210, 220, 0.35), 0 0 18px rgba(140, 155, 170, 0.15), inset 0 0 5px rgba(255,255,255,0.28)',
    centerRing: 'rgba(180, 195, 208, 0.35)',
  },
  off: {
    needleBg:
      'linear-gradient(180deg, rgba(255, 210, 200, 0.95) 0%, rgba(235, 120, 105, 0.55) 50%, rgba(175, 65, 60, 0.22) 100%)',
    needleGlow:
      '0 0 4px rgba(255, 180, 165, 0.85), 0 0 12px rgba(255, 120, 105, 0.45), 0 0 26px rgba(220, 80, 72, 0.22)',
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
 * @param {{ dailyHistory?: Array<{ kcalBalance: number, trainingLoad: number }> }} props
 * Se `dailyHistory` è fornito (non vuoto), il motore usa solo quello; altrimenti storico demo + slider su “oggi”.
 */
export default function MetabolicCompass({ dailyHistory: dailyHistoryProp } = {}) {
  const isControlled =
    Array.isArray(dailyHistoryProp) && dailyHistoryProp.length > 0;

  const [internalHistory, setInternalHistory] = useState(
    () =>
      Array.from({ length: 30 }, () => ({
        kcalBalance: 0,
        trainingLoad: 45,
      }))
  );

  const [goal, setGoal] = useState(METABOLIC_GOAL.RICOMPOSIZIONE);
  const [kcalBalance, setKcalBalance] = useState(0);
  const [trainingLoad, setTrainingLoad] = useState(45);

  useEffect(() => {
    if (isControlled) return;
    setInternalHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = { kcalBalance, trainingLoad };
      return next;
    });
  }, [kcalBalance, trainingLoad, isControlled]);

  const dailyHistory = isControlled ? dailyHistoryProp : internalHistory;

  const { angleDeg, magnitude } = useMetabolicDirectionEngine(dailyHistory);

  const finalAngle = useMemo(() => {
    const targetAngle = getMetabolicTargetAngle(goal);
    const raw = angleDeg - targetAngle;
    return Math.max(FINAL_ANGLE_MIN, Math.min(FINAL_ANGLE_MAX, raw));
  }, [angleDeg, goal]);

  const { tier } = useMemo(() => alignmentFromFinalAngle(finalAngle), [finalAngle]);
  const tierStyle = ALIGNMENT_TIERS[tier];

  const magnitude01 = Math.min(1, magnitude);
  const arrowLengthPx = ARROW_MIN_PX + magnitude01 * (ARROW_MAX_PX - ARROW_MIN_PX);

  const goalCompassAngleDeg = useMemo(() => getGoalCompassAngleDeg(goal), [goal]);
  /** Volto ruotato così l’obiettivo coincide con il Nord visivo; la freccia resta nel sistema schermo. */
  const dialRotationDeg = -goalCompassAngleDeg;
  /** Bearing reale sul volto + rotazione del volto → angolo schermo (CSS, 0° = alto, orario +). */
  const arrowRotationDeg = metabolicAngleDegToCompassBearingDeg(angleDeg) + dialRotationDeg;

  return (
    <div
      className="metabolic-compass-root"
      style={{
        width: '100%',
        maxWidth: 400,
        margin: '0 auto',
        padding: 'clamp(1rem, 4vw, 1.25rem)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}
    >
      {/* Obiettivo */}
      <div
        role="tablist"
        aria-label="Obiettivo"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 6,
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
              padding: '7px 13px',
              borderRadius: 100,
              border:
                goal === g
                  ? '1px solid rgba(255,255,255,0.18)'
                  : '1px solid rgba(255,255,255,0.06)',
              background:
                goal === g ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
              color: goal === g ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.4)',
              fontSize: 11,
              fontWeight: 560,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Volto bussola — strumento di navigazione */}
      <div
        className="metabolic-compass-bezel"
        style={{
          position: 'relative',
          width: 'min(100%, 320px)',
          padding: '2.25%',
          borderRadius: '50%',
          background:
            'linear-gradient(155deg, rgba(58,64,76,0.5) 0%, rgba(22,24,32,0.92) 38%, rgba(10,11,16,1) 100%)',
          boxShadow: `
            inset 0 1px 0 rgba(255,255,255,0.1),
            inset 0 -1px 0 rgba(0,0,0,0.55),
            0 20px 50px rgba(0,0,0,0.5),
            0 4px 16px rgba(0,0,0,0.35)
          `,
        }}
      >
        <div
          role="img"
          aria-label="Bussola metabolica"
          className="metabolic-compass-face"
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1',
            borderRadius: '50%',
            overflow: 'hidden',
            boxShadow: `
              inset 0 0 0 1px rgba(255,255,255,0.05),
              inset 0 2px 24px rgba(0,0,0,0.45)
            `,
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              transformOrigin: '50% 50%',
              transform: `rotate(${dialRotationDeg}deg)`,
              transition: 'transform 0.45s cubic-bezier(0.33, 0.86, 0.36, 1)',
              background: `
                radial-gradient(ellipse 72% 72% at 50% 38%, rgba(35, 42, 54, 0.95) 0%, #12151c 48%, #07080c 100%),
                radial-gradient(circle at 50% 35%, rgba(120, 140, 165, 0.06) 0%, transparent 55%)
              `,
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle at 50% 42%, transparent 0%, transparent 48%, rgba(0,0,0,0.4) 100%)',
                pointerEvents: 'none',
              }}
            />
            <CompassDialGrid directions={METABOLIC_COMPASS_DIRECTIONS} />
            {METABOLIC_COMPASS_DIRECTIONS.map(({ angleDeg, label }) => (
              <CompassLabel key={`lbl-${angleDeg}`} style={compassLabelStyleFromAngleDeg(angleDeg)}>
                {label}
              </CompassLabel>
            ))}
          </div>

          {/* Freccia — sistema schermo */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 0,
              height: 0,
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                width: 1.5,
                height: arrowLengthPx,
                marginLeft: -0.75,
                transformOrigin: '50% 100%',
                transform: `rotate(${arrowRotationDeg}deg)`,
                transition: ARROW_TRANSITION,
                borderRadius: 1,
                background: tierStyle.needleBg,
                boxShadow: tierStyle.needleGlow,
              }}
            />
          </div>

          {/* Origine utente */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 3,
              width: 22,
              height: 22,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              background: 'rgba(0,0,0,0.25)',
              boxShadow: 'inset 0 0 10px rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background:
                  tier === 'aligned'
                    ? 'radial-gradient(circle at 35% 30%, #ffffff 0%, #9ee8d0 38%, #2a8f72 100%)'
                    : tier === 'partial'
                      ? 'radial-gradient(circle at 35% 30%, #f8fbfd 0%, #b0c2d2 42%, #4a5d6c 100%)'
                      : 'radial-gradient(circle at 35% 30%, #fff8f6 0%, #f0a898 40%, #a84842 100%)',
                boxShadow: tierStyle.centerGlow,
                border: `1px solid ${tierStyle.centerRing}`,
                transition: 'box-shadow 0.35s ease, background 0.35s ease, border-color 0.35s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Input qualitativi — senza cifre visibili */}
      {!isControlled && (
        <div
          className="metabolic-compass-controls"
          style={{
            width: '100%',
            maxWidth: 320,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            paddingTop: 6,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            marginTop: 2,
          }}
        >
          <RangeBare
            aria-label="Bilancio energetico"
            min={-METABOLIC_KCAL_NORMALIZATION_REF}
            max={METABOLIC_KCAL_NORMALIZATION_REF}
            value={kcalBalance}
            onChange={setKcalBalance}
          />
          <RangeBare
            aria-label="Carico allenamento"
            min={0}
            max={METABOLIC_TRAINING_NORMALIZATION_REF}
            value={trainingLoad}
            onChange={setTrainingLoad}
          />
        </div>
      )}
    </div>
  );
}

/** Posizione % sul volto: 0° = Nord, positivo = orario. */
function compassLabelStyleFromAngleDeg(angleDeg, radiusPct = 41.5) {
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
        maxWidth: '30%',
        textAlign: 'center',
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color: 'rgba(235, 238, 245, 0.48)',
        lineHeight: 1.2,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        textShadow: '0 1px 3px rgba(0,0,0,0.85)',
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
