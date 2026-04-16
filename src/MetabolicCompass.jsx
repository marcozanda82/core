import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  getCompassTargetAngleForGoal,
  getMetabolicTargetAngle,
  metabolicAngleDegToCompassBearingDeg,
  METABOLIC_COMPASS_DIRECTIONS,
  METABOLIC_GOAL,
} from './metabolicDirection';
import { getTodayString } from './coreEngine';
import { computeMetabolicEngineTargetVec, historyFingerprint } from './metabolicDirectionEngine';
import MetabolicMap from './MetabolicMap';
import { computeMetabolicMapInputsFromDailyHistory } from './metabolicMapPeriodInputs';

const FINAL_ANGLE_MIN = -135;
const FINAL_ANGLE_MAX = 135;

const GOALS = [
  METABOLIC_GOAL.RICOMPOSIZIONE,
  METABOLIC_GOAL.MASSA,
  METABOLIC_GOAL.PERDITA_GRASSO,
];

/** UI segmenti periodo; `value` = stato `selectedTimeframe`. */
const METABOLIC_COMPASS_TIMEFRAMES = [
  { value: '1d', label: 'IERI' },
  { value: '7d', label: '7G' },
  { value: '14d', label: '14G' },
  { value: '30d', label: '30G' },
];

/** Periodo predefinito al rientro nella schermata bussola. */
const DEFAULT_COMPASS_TIMEFRAME = '7d';

const MICRO_SUGGESTION_FINAL_OPACITY = 0.7;
/** Attesa ≈ durata fade-out prima di aggiornare il testo, poi fade-in. */
const MICRO_SUGGESTION_FADE_MS = 340;
const MICRO_SUGGESTION_TRANSITION = 'opacity 0.34s cubic-bezier(0.4, 0, 0.2, 1)';

/** Lunghezza fissa dal centro al vertice ≈ 75% del raggio (= 37.5% del lato del volto quadrato). */
const ARROW_LENGTH_FRAC_OF_FACE = 0.375;

/** Rotazione ago: fisica spring+damping via requestAnimationFrame (niente transition su transform). */
const ARROW_SPRING_STIFFNESS = 0.08;
const ARROW_SPRING_DAMPING = 0.85;
/** Solo proprietà visive; la rotazione è aggiornata ogni frame da ref. */
const ARROW_SHAFT_VISUAL_TRANSITION =
  'box-shadow 0.45s ease, background 0.45s ease, filter 0.45s ease, opacity 0.45s ease';

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

/** Differenza angolare minima in gradi (stesso piano dell’angolo motore `angleDeg`). */
function absShortestAngleDeltaDeg(fromDeg, toDeg) {
  let d = fromDeg - toDeg;
  d = ((((d + 180) % 360) + 360) % 360) - 180;
  return Math.abs(d);
}

/**
 * Differenza con segno da currentAngle a targetAngle nell’intervallo [−180, 180]
 * (percorso più breve; gestisce anche angoli non normalizzati dopo integrazione).
 */
function shortestAngleDeltaDeg(currentAngle, targetAngle) {
  let delta = targetAngle - currentAngle;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function normalizeCompassBearing0to360(deg) {
  let x = deg % 360;
  if (x < 0) x += 360;
  return x;
}

/**
 * Zone direzionali sul bearing bussola (0° = nord, senso orario), fasce ~45°.
 * → est ~90° · ↓ sud ~180° · ↙ sudovest ~225° · ↖ nordovest ~315°
 */
function metabolicCompassDirectionPhrase(bearingDeg) {
  const b = normalizeCompassBearing0to360(bearingDeg);
  if (b >= 67.5 && b < 112.5) return 'surplus non sfruttato';
  if (b >= 157.5 && b < 202.5) return 'stress elevato';
  if (b >= 202.5 && b < 247.5) return 'consumo attivo';
  if (b >= 292.5 && b < 337.5) return 'fase conservativa';
  return null;
}

/**
 * Un solo suggerimento: base da |current−target|, raffinamento da direzione corrente se 15°–45°.
 */
function metabolicCompassMicroSuggestion(angleDeg, targetMetabolicAngleDeg) {
  const diff = absShortestAngleDeltaDeg(angleDeg, targetMetabolicAngleDeg);
  if (diff < 15) return 'direzione corretta';
  if (diff > 45) return 'correggi direzione';
  const bearing = metabolicAngleDegToCompassBearingDeg(angleDeg);
  return metabolicCompassDirectionPhrase(bearing) ?? 'serve più stimolo';
}

const METABOLIC_COMPASS_SNAPSHOT_RAD_TO_DEG = 180 / Math.PI;

/**
 * Direzione metabolica per il periodo selezionato: stesso vettore del motore, senza smoothing né rumore angolare.
 *
 * @param {Array<{ date?: string, kcalBalance: number, trainingLoad: number }>} dailyHistory
 * @param {'1d' | '7d' | '14d' | '30d'} timeframe
 */
function computeMetabolicCompassDirection(dailyHistory, timeframe) {
  const { x, y } = computeMetabolicEngineTargetVec(dailyHistory, timeframe);
  const angleRad = Math.atan2(y, x);
  const angleDeg = Number.isFinite(angleRad) ? angleRad * METABOLIC_COMPASS_SNAPSHOT_RAD_TO_DEG : 0;
  const magnitude = Math.hypot(x, y);
  return { angleDeg, magnitude, x, y };
}

/** Allineato a {@link computeMetabolicEngineTargetVec} (escluso oggi, ultima finestra). */
const COMPASS_DEBUG_TIMEFRAME_DAYS = { '1d': 1, '7d': 7, '14d': 14, '30d': 30 };

function formatMetabolicCompassDebugDate(isoYmd) {
  if (!isoYmd || typeof isoYmd !== 'string') return '—';
  const ymd = isoYmd.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '—';
  const t = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(t.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(t);
}

function getMetabolicCompassWindowDateRange(dailyHistory, timeframe) {
  const today = getTodayString();
  const safe = (dailyHistory || []).filter((e) => e?.date !== today);
  const windowLen = COMPASS_DEBUG_TIMEFRAME_DAYS[timeframe] ?? COMPASS_DEBUG_TIMEFRAME_DAYS['7d'];
  const slice = safe.length <= windowLen ? safe : safe.slice(-windowLen);
  return {
    startDate: slice[0]?.date,
    endDate: slice[slice.length - 1]?.date,
  };
}

/**
 * @param {{ dailyHistory?: Array<{ date?: string, kcalBalance: number, trainingLoad: number }>, compassScreenActive?: boolean }} props
 * `dailyHistory`: serie dal tracker (ultimo = ieri; oggi escluso dal motore). Passare `[]` se assente.
 * `compassScreenActive`: quando passa da false a true, ripristina il periodo al default (es. rientro tab bussola).
 */
export default function MetabolicCompass({
  dailyHistory: dailyHistoryProp = [],
  compassScreenActive = true,
} = {}) {
  const dailyHistory = Array.isArray(dailyHistoryProp) ? dailyHistoryProp : [];

  const prevCompassScreenActiveRef = useRef(false);
  const [goal, setGoal] = useState(METABOLIC_GOAL.RICOMPOSIZIONE);
  const [selectedTimeframe, setSelectedTimeframe] = useState(DEFAULT_COMPASS_TIMEFRAME);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    if (!compassScreenActive) {
      prevCompassScreenActiveRef.current = false;
      return;
    }
    if (!prevCompassScreenActiveRef.current) {
      setSelectedTimeframe(DEFAULT_COMPASS_TIMEFRAME);
    }
    prevCompassScreenActiveRef.current = true;
  }, [compassScreenActive]);

  const compassHistoryKey = useMemo(
    () => historyFingerprint(dailyHistory, selectedTimeframe),
    [dailyHistory, selectedTimeframe]
  );

  /** Medie periodo + instabilità glicemica teorica per la mappa (stessa finestra della bussola). */
  const metabolicMapInputs = useMemo(
    () => computeMetabolicMapInputsFromDailyHistory(dailyHistory, selectedTimeframe),
    [compassHistoryKey]
  );

  useEffect(() => {
    const result = computeMetabolicCompassDirection(dailyHistory, selectedTimeframe);
    setSnapshot(result);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- compassHistoryKey = historyFingerprint(dailyHistory, selectedTimeframe)
  }, [compassHistoryKey]);

  const angleDeg = snapshot?.angleDeg ?? 0;
  const magnitude = snapshot?.magnitude ?? 0;

  /** TEMPORARY: verifica finestra date in test */
  const compassDebugRangeLine = useMemo(() => {
    const tfLabel =
      METABOLIC_COMPASS_TIMEFRAMES.find((t) => t.value === selectedTimeframe)?.label ??
      selectedTimeframe;
    const { startDate, endDate } = getMetabolicCompassWindowDateRange(
      dailyHistory,
      selectedTimeframe
    );
    return `${tfLabel} · ${formatMetabolicCompassDebugDate(startDate)} → ${formatMetabolicCompassDebugDate(endDate)}`;
  }, [dailyHistory, selectedTimeframe]);

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

  const targetMetabolicAngle = useMemo(() => getMetabolicTargetAngle(goal), [goal]);
  const microSuggestionText = useMemo(
    () => metabolicCompassMicroSuggestion(angleDeg, targetMetabolicAngle),
    [angleDeg, targetMetabolicAngle]
  );

  const suggestionMountedRef = useRef(false);
  const [displaySuggestion, setDisplaySuggestion] = useState(microSuggestionText);
  const [suggestionLineOpacity, setSuggestionLineOpacity] = useState(MICRO_SUGGESTION_FINAL_OPACITY);

  useEffect(() => {
    if (!suggestionMountedRef.current) {
      suggestionMountedRef.current = true;
      return;
    }
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setDisplaySuggestion(microSuggestionText);
      setSuggestionLineOpacity(MICRO_SUGGESTION_FINAL_OPACITY);
      return;
    }
    setSuggestionLineOpacity(0);
    const t = window.setTimeout(() => {
      setDisplaySuggestion(microSuggestionText);
      setSuggestionLineOpacity(MICRO_SUGGESTION_FINAL_OPACITY);
    }, MICRO_SUGGESTION_FADE_MS);
    return () => window.clearTimeout(t);
  }, [microSuggestionText]);

  /** Angolo rosa dell’obiettivo (da {@link METABOLIC_COMPASS_DIRECTIONS}). */
  const targetAngle = useMemo(() => getCompassTargetAngleForGoal(goal), [goal]);
  /** Solo sfondo rosa: Nord visivo = obiettivo → rotazione opposta all’angolo target. */
  const compassRotation = -targetAngle;
  /** Bearing metabolico reale + rotazione sfondo (freccia non è nel contenitore ruotato). */
  const arrowRotationDeg =
    metabolicAngleDegToCompassBearingDeg(angleDeg) + compassRotation;

  const arrowShaftRef = useRef(null);
  const angleRef = useRef(null);
  const velocityRef = useRef(0);
  const targetAngleRef = useRef(arrowRotationDeg);

  useEffect(() => {
    targetAngleRef.current = arrowRotationDeg;
  }, [arrowRotationDeg]);

  useLayoutEffect(() => {
    if (angleRef.current !== null) return;
    angleRef.current = arrowRotationDeg;
    velocityRef.current = 0;
    const el = arrowShaftRef.current;
    if (el) {
      el.style.transformOrigin = '50% 100%';
      el.style.transform = `rotate(${angleRef.current}deg)`;
    }
    // Solo primo frame: allinea DOM prima della prima rAF; `arrowRotationDeg` è quello del mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per mount
  }, []);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const el = arrowShaftRef.current;
      const target = targetAngleRef.current;
      if (angleRef.current === null) {
        angleRef.current = target;
        velocityRef.current = 0;
      }
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) {
        angleRef.current = target;
        velocityRef.current = 0;
      } else {
        const current = angleRef.current;
        const delta = shortestAngleDeltaDeg(current, target);
        const force = delta * ARROW_SPRING_STIFFNESS;
        let v = velocityRef.current + force;
        v *= ARROW_SPRING_DAMPING;
        velocityRef.current = v;
        angleRef.current = current + v;
      }
      if (el) {
        el.style.transformOrigin = '50% 100%';
        el.style.transform = `rotate(${angleRef.current}deg)`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      className="metabolic-compass-root"
      style={{
        width: '100%',
        maxWidth: 400,
        margin: '0 auto',
        padding: 'clamp(1rem, 4vw, 1.25rem)',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="metabolic-compass-interaction-surface"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          width: '100%',
          touchAction: 'pan-y',
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
              onClick={() => setSelectedTimeframe(value)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 5px',
                borderRadius: 9,
                border: 'none',
                margin: 0,
                cursor: 'pointer',
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
              ref={arrowShaftRef}
              className="metabolic-compass-arrow-shaft"
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '50%',
                width: ARROW_SHAFT_WIDTH_PX,
                height: `${ARROW_LENGTH_FRAC_OF_FACE * 100}%`,
                marginLeft: -ARROW_SHAFT_WIDTH_PX / 2,
                transformOrigin: '50% 100%',
                transition: ARROW_SHAFT_VISUAL_TRANSITION,
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

      {/* TEMPORARY DEBUG — rimuovere dopo test */}
      <div
        className="metabolic-compass-debug-range"
        aria-hidden
        style={{
          margin: '8px 0 0',
          width: '100%',
          maxWidth: 340,
          fontSize: 8,
          fontWeight: 500,
          letterSpacing: '0.05em',
          lineHeight: 1.35,
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          color: 'rgba(232, 235, 242, 0.38)',
          textAlign: 'center',
          opacity: 0.55,
          userSelect: 'none',
        }}
      >
        {compassDebugRangeLine}
      </div>

      <div
        className="metabolic-compass-micro-suggestion"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          margin: '16px 0 0',
          width: '100%',
          maxWidth: 340,
          minHeight: '1.25em',
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: '0.045em',
          lineHeight: 1.4,
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          color: 'rgb(232, 235, 242)',
          textAlign: 'center',
          textTransform: 'lowercase',
          background: 'none',
          border: 'none',
          padding: 0,
          opacity: suggestionLineOpacity,
          transition: MICRO_SUGGESTION_TRANSITION,
        }}
      >
        {displaySuggestion}
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 400,
          marginTop: 8,
          paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          boxSizing: 'border-box',
        }}
      >
        <h3
          style={{
            margin: '0 0 10px',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.42)',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          Analisi Stato Metabolico
        </h3>
        <MetabolicMap
          energyBalance={metabolicMapInputs.energyBalance}
          trainingLoad={metabolicMapInputs.trainingLoad}
          sleepHours={metabolicMapInputs.sleepHours}
          glycemicInstability={metabolicMapInputs.glycemicInstability}
        />
      </div>
      </div>
    </div>
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

function CompassDirectionLabel({ labelText, selected, onSelect, layoutStyle }) {
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
      onClick={() => onSelect(labelText)}
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
        cursor: 'pointer',
        border: 'none',
        margin: 0,
        padding: '6px 8px',
        borderRadius: 8,
        transition:
          'color 0.35s ease, background 0.35s ease, text-shadow 0.35s ease, box-shadow 0.35s ease, filter 0.25s ease',
        pointerEvents: 'auto',
        touchAction: 'manipulation',
        zIndex: selected ? 5 : 2,
        WebkitTapHighlightColor: 'transparent',
        ...layoutStyle,
      }}
    >
      {labelText}
    </button>
  );
}
