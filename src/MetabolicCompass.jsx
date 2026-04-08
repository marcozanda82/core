import React, { useState } from 'react';

const NAVY = '#0f172a';
const CERAMIC_BG =
  'linear-gradient(165deg, #ffffff 0%, #f4f6f8 45%, #eceff2 100%)';

/**
 * Mockup interattivo statico: bussola metabolica stile Premium Light/Ceramic.
 * Nessuna rotazione o modello biochimico — solo UI e stato locale slider.
 */
export default function MetabolicCompass() {
  const [aderenza, setAderenza] = useState(72);
  const [surplusDeficit, setSurplusDeficit] = useState(0);
  const [allenamento, setAllenamento] = useState(50);

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
          }}
        />

        {/* Ore 12 — Obiettivo */}
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
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, letterSpacing: '0.06em' }}>
            OBIETTIVO
          </div>
          <div style={{ fontSize: 13, fontWeight: 650, marginTop: 2 }}>Ricomposizione</div>
        </div>

        {/* Ore 2 — Progresso (mock) */}
        <div
          className="metabolic-compass-glass"
          style={{
            position: 'absolute',
            left: 'calc(50% + 38% * 0.8660254)',
            top: 'calc(50% - 38% * 0.5)',
            transform: 'translate(-50%, -50%)',
            minWidth: 88,
            padding: '10px 12px',
            borderRadius: 999,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.75, letterSpacing: '0.06em' }}>
            PROGRESSO
          </div>
          <div style={{ fontSize: 13, fontWeight: 650, marginTop: 2 }}>Massa</div>
        </div>
      </div>

      {/* Stato in basso (mock) */}
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
          STATO (MOCK)
        </p>
        <p style={{ margin: 0, fontSize: 'clamp(0.9rem, 2.8vw, 1rem)', fontWeight: 600, lineHeight: 1.45 }}>
          Zona neutra · indicatori collegati in una versione futura
        </p>
        <p
          style={{
            margin: '0.5rem 0 0',
            fontSize: 12,
            opacity: 0.5,
            lineHeight: 1.4,
          }}
        >
          Aderenza {aderenza}% · bilancio {surplusDeficit >= 0 ? '+' : ''}
          {surplusDeficit} · allenamento {allenamento}%
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
