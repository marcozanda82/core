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
      className="trend-radar-pillars relative mb-2 rounded-xl border border-white/[0.08] bg-[rgba(10,12,18,0.72)] px-2.5 py-2"
    >
      <div className="mb-1 text-[0.55rem] font-bold uppercase tracking-[0.12em] text-slate-400/80">
        Telemetria pilastri
      </div>
      <div className="flex flex-col gap-1">
        {PILLARS.map(({ key, label, color, glow, track }) => {
          const raw = Number(values[key]);
          const pct = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
          return (
            <div key={key} className="flex flex-col gap-px">
              <div className="flex items-baseline justify-between gap-1.5">
                <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.05em] text-zinc-200/90">
                  {label}
                </span>
                <span
                  className="text-[11px] font-bold tabular-nums leading-none"
                  style={{ color, textShadow: `0 0 6px ${glow}` }}
                >
                  {pct}%
                </span>
              </div>
              <div
                aria-hidden
                className="h-1 w-full overflow-hidden rounded-full shadow-[inset_0_0_3px_rgba(0,0,0,0.35)]"
                style={{ background: track }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`,
                    boxShadow: `0 0 10px ${glow}`,
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
