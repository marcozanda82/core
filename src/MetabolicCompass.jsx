import React, { useMemo, useState } from 'react';

const NAVY = '#0f172a';
const CERAMIC_BG =
  'linear-gradient(165deg, #ffffff 0%, #f4f6f8 45%, #eceff2 100%)';

const OBIETTIVO_OPTIONS = ['Ricomposizione', 'Massa', 'Perdita Grasso'];

const RADIUS = 110;

function clampAngle(deg) {
  return Math.max(-135, Math.min(135, deg));
}

/**
 * Angolo bussola (Nord = 0°, positivo = orario verso Est/Sud).
 * Surplus slider -50…50 → scala ×10 per confronti tipo ±500 kcal nel copy.
 */
function computeActualAngle(obiettivo, surplusDeficit, allenamento) {
  const s = surplusDeficit * 10;
  const a = allenamento;

  if (obiettivo === 'Massa') {
    const onTrack = s > 80 && a >= 45;
    if (onTrack) return clampAngle(a - 50);
    let ang = 0;
    if (s <= 0) ang -= Math.min(135, (-s) / 10);
    if (a < 40) ang += (40 - a) * 1.1;
    return clampAngle(ang + (a - 50) * 0.15);
  }

  if (obiettivo === 'Perdita Grasso') {
    const onTrack = s < -80 && a >= 40;
    if (onTrack) return clampAngle((a - 50) * 0.12);
    let ang = 0;
    if (s > 0) ang += Math.min(135, s / 10);
    if (a < 35) ang += (35 - a) * 0.9;
    return clampAngle(ang + (a - 50) * 0.1);
  }

  // Ricomposizione
  if (Math.abs(s) < 120 && a >= 38 && a <= 82) {
    return clampAngle((s / 25) + (a - 50) * 0.08);
  }
  let ang = s / 12;
  if (a < 38) ang += (38 - a) * 0.9;
  if (a > 82) ang -= (a - 82) * 0.7;
  return clampAngle(ang);
}

/**
 * Bussola metabolica — Premium Light/Ceramic, freccia e bolla progresso da vettori.
 */
export default function MetabolicCompass() {
  const [obiettivo, setObiettivo] = useState('Ricomposizione');
  const [aderenza, setAderenza] = useState(72);
  const [surplusDeficit, setSurplusDeficit] = useState(0);
  const [allenamento, setAllenamento] = useState(50);

  const actualAngle = useMemo(
    () => computeActualAngle(obiettivo, surplusDeficit, allenamento),
    [obiettivo, surplusDeficit, allenamento]
  );

  const { translateX, translateY } = useMemo(() => {
    const progressRatio = aderenza / 100;
    const angleRad = (actualAngle - 90) * (Math.PI / 180);
    return {
      translateX: Math.cos(angleRad) * progressRatio * RADIUS,
      translateY: Math.sin(angleRad) * progressRatio * RADIUS,
    };
  }, [aderenza, actualAngle]);

  const aligned = Math.abs(actualAngle) < 15;
  const statoLabel = aligned ? 'In Cammino (Allineato)' : 'Fuori Rotta';
  const suggerimento = aligned
    ? null
    : 'Correggi i macro o l\'allenamento per riallinearti al Nord.';

  const compassSize = 'min(300px, 92vw)';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 'clamp(1rem, 4vw, 1.75rem)',
        width: '100%',
        maxWidth: 420,
        margin: '0 auto',
        padding: 'clamp(1rem, 4vw, 1.5rem)',
        minHeight: 'min(100%, 640px)',
        background: CERAMIC_BG,
        color: NAVY,
        borderRadius: 20,
        boxShadow: '0 24px 48px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.06)',
      }}
    >
      {/* Controlli */}
      <section
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
        aria-label="Controlli mockup"
      >
        <h2
          style={{
            margin: 0,
            fontSize: 'clamp(1rem, 3.5vw, 1.125rem)',
            fontWeight: 650,
            letterSpacing: '-0.02em',
          }}
        >
          Metabolic Compass
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Obiettivo</span>
          <div
            role="group"
            aria-label="Selezione obiettivo"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
          >
            {OBIETTIVO_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setObiettivo(opt)}
                style={{
                  flex: '1 1 auto',
                  minWidth: 'min(100%, 108px)',
                  padding: '8px 10px',
                  borderRadius: 12,
                  border:
                    obiettivo === opt
                      ? '1px solid rgba(14, 165, 233, 0.55)'
                      : '1px solid rgba(15, 23, 42, 0.12)',
                  background:
                    obiettivo === opt ? 'rgba(14, 165, 233, 0.12)' : 'rgba(255,255,255,0.65)',
                  color: NAVY,
                  fontSize: 11,
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <SliderRow
          label="Aderenza"
          value={aderenza}
          min={0}
          max={100}
          suffix="%"
          onChange={setAderenza}
        />
        <SliderRow
          label="Surplus / Deficit"
          value={surplusDeficit}
          min={-50}
          max={50}
          suffix=""
          onChange={setSurplusDeficit}
        />
        <SliderRow
          label="Allenamento"
          value={allenamento}
          min={0}
          max={100}
          suffix="%"
          onChange={setAllenamento}
        />
      </section>

      {/* Quadrante */}
      <div
        style={{
          position: 'relative',
          width: compassSize,
          height: compassSize,
          flexShrink: 0,
        }}
      >
        <div
          role="presentation"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'linear-gradient(145deg, #fafbfc 0%, #eef1f4 55%, #e4e9ee 100%)',
            border: '14px solid #d8dee6',
            boxShadow: `
              inset 0 8px 24px rgba(15, 23, 42, 0.12),
              inset 0 -4px 12px rgba(255, 255, 255, 0.85),
              inset 0 0 0 2px rgba(255, 255, 255, 0.5),
              0 12px 28px rgba(15, 23, 42, 0.1)
            `,
          }}
        />

        {/* Freccia / ago */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 8,
            height: RADIUS,
            pointerEvents: 'none',
            zIndex: 2,
            transformOrigin: 'bottom center',
            transform: `translate(-50%, -100%) rotate(${actualAngle}deg)`,
            transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            borderRadius: 4,
            background: 'linear-gradient(180deg, #0f172a 0%, #475569 55%, #64748b 100%)',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)',
          }}
        />

        {/* Cerchio partenza */}
        <button
          type="button"
          aria-label="Partenza"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 22,
            height: 22,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.9)',
            background: NAVY,
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
            cursor: 'default',
            padding: 0,
            zIndex: 4,
          }}
        />

        {/* Ore 12 — Obiettivo (etichetta fissa) */}
        <div
          className="metabolic-compass-glass"
          style={{
            position: 'absolute',
            left: '50%',
            top: 'calc(50% - 38%)',
            transform: 'translate(-50%, -50%)',
            minWidth: 88,
            padding: '10px 12px',
            borderRadius: 999,
            textAlign: 'center',
            zIndex: 3,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, letterSpacing: '0.06em' }}>
            OBIETTIVO
          </div>
          <div style={{ fontSize: 13, fontWeight: 650, marginTop: 2 }}>{obiettivo}</div>
        </div>

        {/* Progressi cumulativi — lungo la freccia (aderenza) */}
        <div
          className="metabolic-compass-glass"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            zIndex: 5,
            minWidth: 92,
            maxWidth: 120,
            padding: '8px 10px',
            borderRadius: 999,
            textAlign: 'center',
            transform: `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px))`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(255,255,255,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                flexShrink: 0,
              }}
              aria-hidden
            >
              👤
            </span>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  opacity: 0.72,
                  letterSpacing: '0.05em',
                  lineHeight: 1.2,
                }}
              >
                PROGRESSI CUMULATIVI
              </div>
              <div style={{ fontSize: 12, fontWeight: 650, marginTop: 2, lineHeight: 1.25 }}>
                {aderenza}% aderenza
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stato */}
      <footer
        style={{
          width: '100%',
          textAlign: 'center',
          paddingTop: '0.25rem',
          borderTop: '1px solid rgba(15, 23, 42, 0.08)',
        }}
      >
        <p
          style={{
            margin: '0 0 0.35rem',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            opacity: 0.55,
          }}
        >
          STATO
        </p>
        <p style={{ margin: 0, fontSize: 'clamp(0.9rem, 2.8vw, 1rem)', fontWeight: 600, lineHeight: 1.45 }}>
          {statoLabel}
        </p>
        {suggerimento ? (
          <p
            style={{
              margin: '0.45rem 0 0',
              fontSize: 12,
              opacity: 0.72,
              lineHeight: 1.45,
              fontWeight: 500,
            }}
          >
            {suggerimento}
          </p>
        ) : null}
        <p
          style={{
            margin: '0.5rem 0 0',
            fontSize: 12,
            opacity: 0.5,
            lineHeight: 1.4,
          }}
        >
          {obiettivo} · aderenza {aderenza}% · bilancio slider {surplusDeficit >= 0 ? '+' : ''}
          {surplusDeficit} (×10 nel modello) · allenamento {allenamento}%
        </p>
      </footer>
    </div>
  );
}

function SliderRow({ label, value, min, max, suffix, onChange }) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color: NAVY,
      }}
    >
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          accentColor: '#0ea5e9',
          cursor: 'pointer',
        }}
      />
    </label>
  );
}
