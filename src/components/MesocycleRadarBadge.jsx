/**
 * HUD compatto: fase mesociclo (Spinta / Scarico) e settimana corrente.
 * @param {{
 *   inDeload: boolean,
 *   currentWeek: number,
 *   totalWeeks: number,
 * }} props
 */
export default function MesocycleRadarBadge({ inDeload, currentWeek, totalWeeks }) {
  const label = inDeload
    ? '⚠️ SCARICO • Mantenimento'
    : `SPINTA • Sett. ${currentWeek}/${totalWeeks}`;

  const style = inDeload
    ? {
        color: '#fbbf24',
        background: 'rgba(251, 191, 36, 0.12)',
        border: '1px solid rgba(251, 191, 36, 0.35)',
      }
    : {
        color: '#22d3ee',
        background: 'rgba(34, 211, 238, 0.08)',
        border: '1px solid rgba(34, 211, 238, 0.28)',
      };

  return (
    <span
      role="status"
      aria-label={inDeload ? 'Fase mesociclo: scarico, mantenimento calorico' : `Fase mesociclo: spinta, settimana ${currentWeek} di ${totalWeeks}`}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </span>
  );
}
