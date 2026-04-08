import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCompassTargetAngleForGoal,
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

/** UI segmenti periodo; `value` = stato `selectedTimeframe`. */
const METABOLIC_COMPASS_TIMEFRAMES = [
  { value: '1d', label: 'OGGI' },
  { value: '7d', label: '7G' },
  { value: '14d', label: '14G' },
  { value: '30d', label: '30G' },
];

/** Stato iniziale ogni volta che si entra nella schermata bussola; niente persistenza (localStorage). */
const DEFAULT_COMPASS_LOCKED = true;
const DEFAULT_COMPASS_TIMEFRAME = '7d';

/** Lunghezza fissa dal centro al vertice ≈ 75% del raggio (= 37.5% del lato del volto quadrato). */
const ARROW_LENGTH_FRAC_OF_FACE = 0.375;

/** Comportamento analogico: rotazione smussata; magnitudine modula alone / opacità, non l’altezza. */
const ARROW_ANALOG_TRANSITION =
  'transform 0.4s ease, box-shadow 0.45s ease, background 0.45s ease, filter 0.45s ease, opacity 0.45s ease';

const ARROW_SHAFT_WIDTH_PX = 1.15;

/** Rotazione volto + etichette: curva morbida al cambio obiettivo. */
const COMPASS_ROTATION_TRANSITION = 'transform 0.48s cubic-bezier(0.45, 0, 0.2, 1)';

/** Griglia bussola: cerchi concentrici + raggi (viewBox 100×100, centro 50,50). */
const DIAL_GRID_RINGS = [12.5, 22.5, 32.5];
const DIAL_RADIAL_INNER = 10;
const DIAL_RADIAL_OUTER = 44.5;

function isCardinalCompassAngle(angle) {
  return angle === 0 || angle === 90 || angle === 180 || angle === -90;
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
      {directions.map(({ angle }) => {
        const rad = (angle * Math.PI) / 180;
        const sin = Math.sin(rad);
        const cos = Math.cos(rad);
        const x1 = 50 + DIAL_RADIAL_INNER * sin;
        const y1 = 50 - DIAL_RADIAL_INNER * cos;
        const x2 = 50 + DIAL_RADIAL_OUTER * sin;
        const y2 = 50 - DIAL_RADIAL_OUTER * cos;
        const card = isCardinalCompassAngle(angle);
        return (
          <line
            key={`rad-${angle}`}
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

/** Allineamento: freccia + alone — verde morbido / neutro / rosso morbido. */
const ALIGNMENT_TIERS = {
  aligned: {
    needleBg:
      'linear-gradient(180deg, rgba(200, 255, 235, 0.9) 0%, rgba(95, 225, 185, 0.48) 52%, rgba(45, 170, 138, 0.2) 100%)',
    needleFilter:
      'blur(0.35px) drop-shadow(0 0 6px rgba(100, 235, 190, 0.55)) drop-shadow(0 0 18px rgba(55, 200, 160, 0.28))',
    centerGlow:
      '0 0 10px rgba(110, 240, 190, 0.75), 0 0 24px rgba(75, 210, 170, 0.4), inset 0 0 6px rgba(255,255,255,0.38)',
    centerRing: 'rgba(120, 235, 195, 0.55)',
  },
  partial: {
    needleBg:
      'linear-gradient(180deg, rgba(236, 240, 248, 0.84) 0%, rgba(150, 172, 192, 0.4) 52%, rgba(88, 108, 128, 0.15) 100%)',
    needleFilter:
      'blur(0.35px) drop-shadow(0 0 5px rgba(200, 210, 228, 0.38)) drop-shadow(0 0 16px rgba(145, 160, 180, 0.14))',
    centerGlow:
      '0 0 8px rgba(200, 210, 220, 0.35), 0 0 18px rgba(140, 155, 170, 0.15), inset 0 0 5px rgba(255,255,255,0.28)',
    centerRing: 'rgba(180, 195, 208, 0.35)',
  },
  off: {
    needleBg:
      'linear-gradient(180deg, rgba(255, 212, 200, 0.9) 0%, rgba(238, 125, 108, 0.46) 52%, rgba(190, 72, 65, 0.18) 100%)',
    needleFilter:
      'blur(0.35px) drop-shadow(0 0 6px rgba(255, 140, 120, 0.5)) drop-shadow(0 0 18px rgba(225, 85, 72, 0.26))',
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

/** Tint alone freccia per tier (allineata ai gradienti allineamento). */
const ARROW_HALO_RGB = {
  aligned: { r: 118, g: 224, b: 192 },
  partial: { r: 172, g: 184, b: 204 },
  off: { r: 232, g: 124, b: 108 },
};

function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Intensità metabolica: alone e luminosità crescono con la magnitudine; opacità leggermente più bassa se debole.
 * Resta sobrio (niente bloom aggressivo).
 */
function metabolicArrowMagnitudeStyle(tier, magnitude01, tierNeedleFilter) {
  const m = Math.max(0, Math.min(1, magnitude01));
  const s = smoothstep01(m);
  const { r, g, b } = ARROW_HALO_RGB[tier] ?? ARROW_HALO_RGB.partial;

  const aNear = 0.09 + 0.3 * s;
  const aMid = 0.04 + 0.17 * s;
  const aFar = 0.012 + 0.068 * s;
  const blurNear = 3.5 + 5.5 * s;
  const blurMid = 11 + 17 * s;
  const blurFar = 22 + 30 * s;

  const boxShadow = [
    `0 0 ${blurNear}px rgba(${r},${g},${b},${aNear})`,
    `0 0 ${blurMid}px rgba(${r},${g},${b},${aMid})`,
    `0 0 ${blurFar}px rgba(${r},${g},${b},${aFar})`,
  ].join(', ');

  const brightness = 1 + 0.036 * s;
  const filter = `${tierNeedleFilter} brightness(${brightness})`;

  const opacityLow = 0.66;
  const opacityHigh = 1;
  const opacityT = 0.35 * m + 0.65 * s;
  const opacity = opacityLow + (opacityHigh - opacityLow) * opacityT;

  return { boxShadow, filter, opacity };
}

/**
 * @param {{ dailyHistory?: Array<{ kcalBalance: number, trainingLoad: number }>, onCompassInteractionUnlockChange?: (unlocked: boolean) => void, compassScreenActive?: boolean }} props
 * Se `dailyHistory` è fornito (non vuoto), il motore usa solo quello; altrimenti storico demo + slider su “oggi”.
 * `onCompassInteractionUnlockChange`: notifica il parent (es. per disabilitare lo swipe tra tab quando la bussola è sbloccata).
 * `compassScreenActive`: quando passa da false a true, ripristina blocco + periodo ai default (nessuno stato sbloccato persistito tra sessioni o rientri).
 */
export default function MetabolicCompass({
  dailyHistory: dailyHistoryProp,
  onCompassInteractionUnlockChange,
  compassScreenActive = true,
} = {}) {
  const isControlled =
    Array.isArray(dailyHistoryProp) && dailyHistoryProp.length > 0;

  const [internalHistory, setInternalHistory] = useState(
    () =>
      Array.from({ length: 30 }, () => ({
        kcalBalance: 0,
        trainingLoad: 45,
      }))
  );

  const [isLocked, setIsLocked] = useState(DEFAULT_COMPASS_LOCKED);
  const interactionSurfaceRef = useRef(null);
  const prevCompassScreenActiveRef = useRef(false);
  const [goal, setGoal] = useState(METABOLIC_GOAL.RICOMPOSIZIONE);
  const [selectedTimeframe, setSelectedTimeframe] = useState(DEFAULT_COMPASS_TIMEFRAME);
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

  useEffect(() => {
    onCompassInteractionUnlockChange?.(!isLocked);
  }, [isLocked, onCompassInteractionUnlockChange]);

  useEffect(() => {
    const cb = onCompassInteractionUnlockChange;
    return () => {
      cb?.(false);
    };
  }, [onCompassInteractionUnlockChange]);

  useEffect(() => {
    const node = interactionSurfaceRef.current;
    if (!node || typeof HTMLElement === 'undefined') return;
    if ('inert' in HTMLElement.prototype) {
      node.inert = isLocked;
    }
  }, [isLocked]);

  useEffect(() => {
    if (!compassScreenActive) {
      prevCompassScreenActiveRef.current = false;
      return;
    }
    if (!prevCompassScreenActiveRef.current) {
      setIsLocked(DEFAULT_COMPASS_LOCKED);
      setSelectedTimeframe(DEFAULT_COMPASS_TIMEFRAME);
    }
    prevCompassScreenActiveRef.current = true;
  }, [compassScreenActive]);

  const dailyHistory = isControlled ? dailyHistoryProp : internalHistory;

  const { angleDeg, magnitude } = useMetabolicDirectionEngine(
    dailyHistory,
    selectedTimeframe
  );

  const finalAngle = useMemo(() => {
    const targetAngle = getMetabolicTargetAngle(goal);
    const raw = angleDeg - targetAngle;
    return Math.max(FINAL_ANGLE_MIN, Math.min(FINAL_ANGLE_MAX, raw));
  }, [angleDeg, goal]);

  const { tier } = useMemo(() => alignmentFromFinalAngle(finalAngle), [finalAngle]);
  const tierStyle = ALIGNMENT_TIERS[tier];

  const magnitude01 = Math.min(1, magnitude);
  const arrowMagStyle = useMemo(
    () => metabolicArrowMagnitudeStyle(tier, magnitude01, tierStyle.needleFilter),
    [tier, magnitude01, tierStyle.needleFilter]
  );

  /** Angolo rosa dell’obiettivo (da {@link METABOLIC_COMPASS_DIRECTIONS}). */
  const targetAngle = useMemo(() => getCompassTargetAngleForGoal(goal), [goal]);
  /** Solo sfondo rosa: Nord visivo = obiettivo → rotazione opposta all’angolo target. */
  const compassRotation = -targetAngle;
  /** Bearing metabolico reale + rotazione sfondo (freccia non è nel contenitore ruotato). */
  const arrowRotationDeg =
    metabolicAngleDegToCompassBearingDeg(angleDeg) + compassRotation;

  return (
    <div
      className="metabolic-compass-root"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 400,
        margin: '0 auto',
        padding: 'clamp(1rem, 4vw, 1.25rem)',
        boxSizing: 'border-box',
      }}
    >
      <CompassLockToggle
        isLocked={isLocked}
        onToggle={() => setIsLocked((v) => !v)}
      />
      <div
        ref={interactionSurfaceRef}
        className="metabolic-compass-interaction-surface"
        data-locked={isLocked ? 'true' : 'false'}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          width: '100%',
          pointerEvents: isLocked ? 'none' : 'auto',
          touchAction: isLocked ? 'none' : 'pan-y',
          userSelect: isLocked ? 'none' : undefined,
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
            disabled={isLocked}
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
              cursor: isLocked ? 'default' : 'pointer',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Periodo — controllo segmentato orizzontale */}
      <div
        role="tablist"
        aria-label="Periodo analisi"
        className="metabolic-compass-timeframe"
        style={{
          display: 'flex',
          width: '100%',
          maxWidth: 340,
          padding: 3,
          gap: 2,
          borderRadius: 12,
          boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        {METABOLIC_COMPASS_TIMEFRAMES.map(({ value, label }) => {
          const active = selectedTimeframe === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={isLocked}
              onClick={() => setSelectedTimeframe(value)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 5px',
                borderRadius: 9,
                border: 'none',
                margin: 0,
                cursor: isLocked ? 'default' : 'pointer',
                fontSize: 10,
                fontWeight: 650,
                letterSpacing: '0.11em',
                textTransform: 'uppercase',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
                color: active ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.36)',
                background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                boxShadow: active ? '0 0 18px rgba(255,255,255,0.05)' : 'none',
                transition:
                  'background 0.35s ease, color 0.35s ease, box-shadow 0.35s ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {label}
            </button>
          );
        })}
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
          role="group"
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
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              transformOrigin: '50% 50%',
              transform: `rotate(${compassRotation}deg)`,
              transition: COMPASS_ROTATION_TRANSITION,
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
            {METABOLIC_COMPASS_DIRECTIONS.map(({ angle, label }) => (
              <CompassDirectionLabel
                key={`lbl-${angle}`}
                labelText={label}
                selected={goal === label}
                disabled={isLocked}
                onSelect={setGoal}
                layoutStyle={compassLabelStyleFromAngle(angle, compassRotation)}
              />
            ))}
          </div>

          {/* Freccia: lunghezza fissa; magnitudine → alone + opacità + luminosità leggera */}
          <div
            className="metabolic-compass-arrow-layer"
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <div
              className="metabolic-compass-arrow-shaft"
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '50%',
                width: ARROW_SHAFT_WIDTH_PX,
                height: `${ARROW_LENGTH_FRAC_OF_FACE * 100}%`,
                marginLeft: -ARROW_SHAFT_WIDTH_PX / 2,
                transformOrigin: '50% 100%',
                transform: `rotate(${arrowRotationDeg}deg)`,
                transition: ARROW_ANALOG_TRANSITION,
                borderRadius: 9999,
                background: tierStyle.needleBg,
                boxShadow: arrowMagStyle.boxShadow,
                filter: arrowMagStyle.filter,
                opacity: arrowMagStyle.opacity,
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
              className="metabolic-compass-center-dot"
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
                transition:
                  'box-shadow 0.45s ease, background 0.45s ease, border-color 0.45s ease, transform 0.45s ease, opacity 0.45s ease',
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
            disabled={isLocked}
          />
          <RangeBare
            aria-label="Carico allenamento"
            min={0}
            max={METABOLIC_TRAINING_NORMALIZATION_REF}
            value={trainingLoad}
            onChange={setTrainingLoad}
            disabled={isLocked}
          />
        </div>
      )}
      </div>
    </div>
  );
}

function CompassLockToggle({ isLocked, onToggle }) {
  return (
    <button
      type="button"
      className="metabolic-compass-lock-toggle"
      aria-pressed={!isLocked}
      aria-label={
        isLocked
          ? 'Sblocca la bussola per interagire'
          : 'Blocca la bussola per scorrere tra le schede'
      }
      title={isLocked ? 'Sblocca' : 'Blocca'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{
        position: 'absolute',
        top: 4,
        right: 4,
        zIndex: 20,
        width: 38,
        height: 38,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(12, 14, 18, 0.55)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: isLocked ? 'rgba(255,255,255,0.5)' : 'rgba(120, 220, 190, 0.95)',
        boxShadow: isLocked
          ? 'none'
          : '0 0 16px rgba(80, 200, 165, 0.2), inset 0 1px 0 rgba(255,255,255,0.08)',
        transition:
          'color 0.3s ease, background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
        pointerEvents: 'auto',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {isLocked ? (
          <>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </>
        ) : (
          <>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M12 11V7a4 4 0 0 1 7.2-2.4" />
          </>
        )}
      </svg>
    </button>
  );
}

const LABEL_COUNTER_ROTATION_TRANSITION = COMPASS_ROTATION_TRANSITION;

/** Posizione % sul volto: 0° = Nord, positivo = orario. Contro-rotazione = testo sempre orizzontale. */
function compassLabelStyleFromAngle(angle, compassRotationDeg, radiusPct = 41.5) {
  const rad = (angle * Math.PI) / 180;
  const left = 50 + radiusPct * Math.sin(rad);
  const top = 50 - radiusPct * Math.cos(rad);
  return {
    left: `${left}%`,
    top: `${top}%`,
    transformOrigin: '50% 50%',
    transform: `translate(-50%, -50%) rotate(${-compassRotationDeg}deg)`,
    transition: LABEL_COUNTER_ROTATION_TRANSITION,
  };
}

function CompassDirectionLabel({ labelText, selected, disabled, onSelect, layoutStyle }) {
  return (
    <button
      type="button"
      className={
        selected
          ? 'metabolic-compass-direction-label metabolic-compass-direction-label--selected'
          : 'metabolic-compass-direction-label'
      }
      aria-pressed={selected}
      aria-label={`Obiettivo ${labelText}`}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onSelect(labelText);
      }}
      style={{
        position: 'absolute',
        maxWidth: '34%',
        minHeight: 32,
        textAlign: 'center',
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        lineHeight: 1.2,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        cursor: disabled ? 'default' : 'pointer',
        border: 'none',
        margin: 0,
        padding: '6px 8px',
        borderRadius: 8,
        transition:
          'color 0.35s ease, background 0.35s ease, text-shadow 0.35s ease, box-shadow 0.35s ease, filter 0.25s ease',
        pointerEvents: 'auto',
        touchAction: disabled ? 'auto' : 'manipulation',
        zIndex: selected ? 5 : 2,
        WebkitTapHighlightColor: 'transparent',
        ...layoutStyle,
      }}
    >
      {labelText}
    </button>
  );
}

function RangeBare({ 'aria-label': ariaLabel, min, max, value, onChange, disabled }) {
  return (
    <input
      type="range"
      aria-label={ariaLabel}
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        width: '100%',
        height: 4,
        borderRadius: 4,
        appearance: 'none',
        WebkitAppearance: 'none',
        background: 'rgba(255,255,255,0.08)',
        outline: 'none',
        cursor: disabled ? 'default' : 'pointer',
      }}
      className="metabolic-compass-range"
    />
  );
}
