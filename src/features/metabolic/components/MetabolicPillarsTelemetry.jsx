const PILLARS = [
  {
    key: 'ipertrofia',
    label: 'Ipertrofia',
    color: '#f472b6',
    glow: 'rgba(244, 114, 182, 0.45)',
    track: 'rgba(244, 114, 182, 0.12)',
  },
  {
    key: 'definizione',
    label: 'Definizione',
    color: '#22d3ee',
    glow: 'rgba(34, 211, 238, 0.45)',
    track: 'rgba(34, 211, 238, 0.12)',
  },
  {
    key: 'longevita',
    label: 'Longevità',
    color: '#818cf8',
    glow: 'rgba(129, 140, 248, 0.45)',
    track: 'rgba(129, 140, 248, 0.12)',
  },
  {
    key: 'energia',
    label: 'Energia',
    color: '#a3e635',
    glow: 'rgba(163, 230, 53, 0.42)',
    track: 'rgba(163, 230, 53, 0.12)',
  },
];

/**
 * Telemetria a 4 barre HUD per la Bussola Metabolica (Fase 1).
 *
 * @param {{
 *   pillars?: { ipertrofia?: number, definizione?: number, longevita?: number, energia?: number } | null,
 * }} props
 */
export default function MetabolicPillarsTelemetry({ pillars }) {
  const values = pillars != null && typeof pillars === 'object' ? pillars : {};

  return (
    <section
      aria-label="Telemetria pilastri metabolici"
      style={{
        width: '100%',
        marginTop: 10,
        marginBottom: 4,
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(10, 12, 18, 0.72)',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'rgba(148, 163, 184, 0.75)',
          marginBottom: 8,
        }}
      >
        Telemetria pilastri
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {PILLARS.map(({ key, label, color, glow, track }) => {
          const raw = Number(values[key]);
          const pct = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 650,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'rgba(226, 232, 240, 0.88)',
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color,
                    textShadow: `0 0 8px ${glow}`,
                  }}
                >
                  {pct}%
                </span>
              </div>
              <div
                aria-hidden
                style={{
                  height: 4,
                  width: '100%',
                  borderRadius: 999,
                  background: track,
                  overflow: 'hidden',
                  boxShadow: 'inset 0 0 4px rgba(0,0,0,0.35)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    borderRadius: 999,
                    background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`,
                    boxShadow: `0 0 10px ${glow}`,
                    transition: 'width 0.45s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
