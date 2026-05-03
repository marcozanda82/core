import React from 'react';

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

/**
 * Card Sleep Coach (solo presentazione; `data` è l’output di useSleepCoach).
 *
 * @param {{ data?: object }} props
 */
export default function SleepCoachCard({ data } = {}) {
  if (!data || typeof data !== 'object') return null;

  const status = data.status;

  const borderTint =
    status === 'sleep_ok'
      ? 'rgba(110, 170, 140, 0.42)'
      : status === 'sleep_disrupted'
        ? 'rgba(200, 160, 90, 0.45)'
        : 'rgba(140, 150, 160, 0.35)';

  const statusColor =
    status === 'sleep_ok'
      ? 'rgba(120, 200, 150, 0.95)'
      : status === 'sleep_disrupted'
        ? 'rgba(230, 185, 120, 0.95)'
        : 'rgba(160, 170, 185, 0.9)';

  const statusAria =
    status === 'sleep_ok' ? 'Sonno nella norma' : status === 'sleep_disrupted' ? 'Sonno disturbato' : 'Dati insufficienti';

  const narrativeText =
    status === 'insufficient_data'
      ? 'Nessun dato sufficiente per analizzare il sonno'
      : String(data.narrative ?? '');

  const causesRaw = Array.isArray(data.likelyCauses) ? data.likelyCauses : [];
  const causes = causesRaw.filter(Boolean).slice(0, 3);

  const stepsRaw = Array.isArray(data.guidanceSteps) ? data.guidanceSteps : [];
  const steps = stepsRaw.filter(Boolean);

  return (
    <section
      className="sleep-coach-card"
      aria-label="Sleep Coach"
      style={{
        marginTop: 14,
        padding: '14px 14px 16px',
        borderRadius: 10,
        border: `1px solid ${borderTint}`,
        background: 'rgba(18, 22, 26, 0.88)',
        maxWidth: 400,
        marginLeft: 'auto',
        marginRight: 'auto',
        boxSizing: 'border-box',
        fontFamily: FONT,
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              color: 'rgba(236, 240, 245, 0.96)',
            }}
          >
            Sleep Coach
          </h2>
          <span
            role="status"
            aria-label={statusAria}
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: statusColor,
              padding: '3px 8px',
              borderRadius: 6,
              border: `1px solid ${borderTint}`,
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            {String(status ?? '').replace(/_/g, ' ')}
          </span>
        </div>
      </header>

      <div style={{ marginBottom: causes.length > 0 ? 14 : steps.length > 0 ? 14 : 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.5,
            color: 'rgba(200, 210, 222, 0.92)',
          }}
        >
          {narrativeText}
        </p>
      </div>

      {causes.length > 0 ? (
        <div style={{ marginBottom: steps.length > 0 ? 16 : 0 }}>
          <h3
            style={{
              margin: '0 0 8px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(165, 180, 198, 0.7)',
            }}
          >
            Cause probabili
          </h3>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
            }}
          >
            {causes.map((c, idx) => (
              <li
                key={String(c.id ?? idx)}
                style={{
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom:
                    idx < causes.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <strong style={{ fontSize: 13, fontWeight: 650, color: 'rgba(236,240,245,0.95)' }}>
                    {String(c.label ?? '')}
                  </strong>
                  {c.severity ? (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: 'rgba(190,200,212,0.75)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {String(c.severity)}
                    </span>
                  ) : null}
                </div>
                {Array.isArray(c.evidence) && c.evidence.length > 0 ? (
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 16,
                      fontSize: 11,
                      lineHeight: 1.45,
                      color: 'rgba(188,200,212,0.88)',
                    }}
                  >
                    {c.evidence.map((ev, evIdx) => (
                      <li key={`${c.id}-${evIdx}`} style={{ marginBottom: 3 }}>
                        {String(ev)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div>
          <h3
            style={{
              margin: '0 0 8px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(165, 180, 198, 0.7)',
            }}
          >
            Azioni
          </h3>
          <ul
            className="metabolic-coach-actions"
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
            }}
          >
            {steps.map((g, gi) => (
              <li
                key={`${String(g.title ?? '')}-${gi}`}
                style={{
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom:
                    gi < steps.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 650, color: 'rgba(232,237,243,0.94)' }}>
                  {String(g.title ?? '')}
                </div>
                <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.45, color: 'rgba(198,208,218,0.9)' }}>
                  {String(g.action ?? '')}
                </div>
                {g.reason ? (
                  <div style={{ fontSize: 10, marginTop: 5, lineHeight: 1.4, color: 'rgba(160,175,190,0.78)' }}>
                    {String(g.reason)}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
