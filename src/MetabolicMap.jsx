import React, { useMemo } from 'react';
import { calculateMetabolicMapPosition } from './metabolicMapEngine';

const ZONE_LABELS = {
  green: 'Verde (Omeostasi)',
  orange: 'Arancione (Adattamento)',
  red: 'Rossa (Pericolo)',
};

const QUADRANT_RISK_LABELS = {
  NW: 'BURNOUT / CORTISOLO',
  NE: 'INFIAMMAZIONE / BULK',
  SW: 'DEPERIMENTO / CATABOLISMO',
  SE: 'FEGATO GRASSO / INSULINA',
};

function buildMapBackground() {
  return `radial-gradient(circle at 50% 50%,
    rgba(6, 78, 62, 0.94) 0%,
    rgba(8, 92, 76, 0.9) 35%,
    rgba(110, 52, 14, 0.88) 35%,
    rgba(130, 62, 18, 0.82) 70%,
    rgba(92, 10, 24, 0.9) 70%,
    rgba(48, 6, 14, 0.95) 100%
  )`;
}

function buildGridBackground() {
  return `
    linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px),
    linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)
  `;
}

function buildGridSize() {
  return '12.5% 12.5%, 12.5% 12.5%, 100% 100%, 100% 100%';
}

function buildGridPosition() {
  return '0 0, 0 0, 50% 50%, 50% 50%';
}

/**
 * Testo opzionale sotto il pannello rischio: solo se mancano dati sonno nel periodo.
 *
 * @param {number} realSleepDays
 * @param {number} totalWindowDays
 * @returns {string | null}
 */
function sleepDataReliabilityText(realSleepDays, totalWindowDays) {
  if (totalWindowDays <= 0) return null;
  if (realSleepDays >= totalWindowDays) return null;
  if (realSleepDays <= 0) {
    return 'Dati sonno non rilevati (utilizzata stima 8h)';
  }
  return `Affidabilità dati sonno: ${realSleepDays}/${totalWindowDays} giorni registrati`;
}

/**
 * Mappa metabolica: coordinate da `metabolicMapEngine`, zone radiali e aura glicemica.
 */
export default function MetabolicMap({
  energyBalance = 0,
  trainingLoad = 0,
  sleepHours = 8,
  glycemicInstability = 0,
  realSleepDays = 0,
  totalWindowDays = 0,
}) {
  const { x, y, finalAura, distance, zone, quadrant } = useMemo(
    () =>
      calculateMetabolicMapPosition({
        energyBalance,
        trainingLoad,
        sleepHours,
        glycemicInstability,
      }),
    [energyBalance, trainingLoad, sleepHours, glycemicInstability],
  );

  const leftPct = 50 + x / 2;
  const topPct = 50 - y / 2;

  const t = finalAura / 100;
  const showAura = finalAura > 0.5;
  const auraR0 = 6 + t * 28;
  const auraR1 = 10 + t * 48;
  const o0 = 0.15 + t * 0.55;
  const o1 = 0.35 + t * 0.5;
  const rGlow = Math.round(255 * (0.55 + t * 0.45));
  const gGlow = Math.round(120 * (1 - t * 0.85));
  const bGlow = Math.round(90 * (1 - t * 0.5));

  const dotWrapperStyle = {
    position: 'absolute',
    left: `${leftPct}%`,
    top: `${topPct}%`,
    transform: 'translate(-50%, -50%)',
    zIndex: 2,
    pointerEvents: 'none',
  };

  const dotInnerStyle = {
    width: 12,
    height: 12,
    borderRadius: '50%',
    background:
      'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.95) 0%, rgba(120, 230, 255, 0.85) 45%, rgba(60, 180, 220, 0.75) 100%)',
    boxShadow: showAura
      ? `0 0 ${auraR0}px rgba(${rGlow},${gGlow},${bGlow},${o0}), 0 0 ${auraR1}px rgba(220, 60, 30, ${o1 * 0.6})`
      : '0 0 4px rgba(255,255,255,0.35)',
    animation: showAura ? 'metabolicMapAuraPulse 2.2s ease-in-out infinite' : 'none',
    transition: 'box-shadow 0.35s ease',
  };

  const labelStyle = {
    position: 'absolute',
    fontSize: '0.62rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.25,
    maxWidth: '42%',
    pointerEvents: 'none',
    userSelect: 'none',
  };

  const sleepReliabilityLine = sleepDataReliabilityText(realSleepDays, totalWindowDays);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 400,
        margin: '0 auto',
      }}
    >
      <style>
        {`
          @keyframes metabolicMapAuraPulse {
            0%, 100% {
              transform: scale(1);
              filter: brightness(1);
            }
            50% {
              transform: scale(1.15);
              filter: brightness(1.25);
            }
          }
        `}
      </style>

      <div
        role="img"
        aria-label={`Mappa metabolica: zona ${ZONE_LABELS[zone]}, quadrante ${QUADRANT_RISK_LABELS[quadrant]}, distanza ${Math.round(distance)}`}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          maxWidth: 400,
          borderRadius: 16,
          overflow: 'hidden',
          background: buildMapBackground(),
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.45)',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: buildGridBackground(),
            backgroundSize: buildGridSize(),
            backgroundPosition: buildGridPosition(),
            opacity: 0.35,
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 1,
            marginLeft: -0.5,
            background: 'rgba(255,255,255,0.1)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 1,
            marginTop: -0.5,
            background: 'rgba(255,255,255,0.1)',
            pointerEvents: 'none',
          }}
        />

        <span style={{ ...labelStyle, top: 8, left: 8, textAlign: 'left' }}>
          BURNOUT / CORTISOLO
        </span>
        <span style={{ ...labelStyle, top: 8, right: 8, textAlign: 'right' }}>
          INFIAMMAZIONE / BULK
        </span>
        <span style={{ ...labelStyle, bottom: 8, left: 8, textAlign: 'left' }}>
          DEPERIMENTO / CATABOLISMO
        </span>
        <span style={{ ...labelStyle, bottom: 8, right: 8, textAlign: 'right' }}>
          FEGATO GRASSO / INSULINA
        </span>

        <div style={dotWrapperStyle}>
          <div style={dotInnerStyle} />
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: '12px 14px',
          borderRadius: 12,
          background: 'rgba(20, 24, 28, 0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontSize: '0.8125rem',
          lineHeight: 1.45,
          color: 'rgba(230, 235, 240, 0.92)',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Zona attuale: {ZONE_LABELS[zone]} — Rischio: {QUADRANT_RISK_LABELS[quadrant]}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'rgba(200, 208, 216, 0.75)' }}>
          Distanza dal centro: {distance.toFixed(1)} · Aura glicemica: {Math.round(finalAura)}
        </div>
        {finalAura > 50 && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(120, 20, 28, 0.35)',
              border: '1px solid rgba(255, 80, 70, 0.45)',
              color: 'rgba(255, 160, 150, 0.98)',
              fontWeight: 600,
              fontSize: '0.78rem',
            }}
          >
            Allarme Infiammazione Glicemica in corso
          </div>
        )}
      </div>

      {sleepReliabilityLine && (
        <p
          style={{
            margin: '8px 0 0',
            padding: '0 2px',
            fontSize: 10,
            lineHeight: 1.35,
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: 'rgba(230, 235, 242, 0.45)',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          {sleepReliabilityLine}
        </p>
      )}
    </div>
  );
}
