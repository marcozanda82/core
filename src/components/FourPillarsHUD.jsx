import { KENTU_PILLARS, PILLAR_IDS } from '../features/metabolic/pillarsMapper';

const STATUS_VISUAL = {
  ok: {
    dot: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.45)',
    label: 'OK',
  },
  warning: {
    dot: '#eab308',
    glow: 'rgba(234, 179, 8, 0.45)',
    label: 'Attenzione',
  },
  alert: {
    dot: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.5)',
    label: 'Critico',
  },
};

/**
 * HUD orizzontale — 4 pilastri fisiologici KentuOS (Fase 1).
 *
 * @param {{
 *   physiologySnapshot?: Record<string, { status?: string, summary?: string, value?: string }> | null,
 * }} props
 */
export default function FourPillarsHUD({ physiologySnapshot }) {
  if (!physiologySnapshot || typeof physiologySnapshot !== 'object') return null;

  return (
    <section
      aria-label="Pilastri fisiologici della giornata"
      className="four-pillars-hud"
    >
      {PILLAR_IDS.map((pillarId) => {
        const meta = KENTU_PILLARS[pillarId];
        const pillar = physiologySnapshot[pillarId] || {};
        const statusKey = String(pillar.status || 'warning').toLowerCase();
        const statusVisual = STATUS_VISUAL[statusKey] || STATUS_VISUAL.warning;
        const summary = String(pillar.summary || '—').trim() || '—';

        return (
          <article
            key={pillarId}
            className="four-pillars-hud__card"
            style={{
              borderColor: `${meta.color}44`,
              background: `linear-gradient(145deg, ${meta.color}14 0%, rgba(10, 12, 18, 0.85) 100%)`,
            }}
          >
            <div className="four-pillars-hud__head">
              <span className="four-pillars-hud__icon" aria-hidden>
                {meta.icon}
              </span>
              <span
                className="four-pillars-hud__status-dot"
                title={statusVisual.label}
                aria-label={statusVisual.label}
                style={{
                  background: statusVisual.dot,
                  boxShadow: `0 0 8px ${statusVisual.glow}`,
                }}
              />
            </div>
            <span className="four-pillars-hud__label" style={{ color: meta.color }}>
              {meta.label}
            </span>
            <p className="four-pillars-hud__summary">{summary}</p>
          </article>
        );
      })}
    </section>
  );
}
