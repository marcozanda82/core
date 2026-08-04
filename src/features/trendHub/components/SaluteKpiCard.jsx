import React from 'react';

/**
 * KPI compatta: icona, valore grande, micro-trend colorato.
 * @param {{
 *   icon?: string,
 *   label: string,
 *   value: string | number,
 *   unit?: string,
 *   trend?: 'up' | 'down' | 'flat' | 'none',
 *   trendLabel?: string,
 *   tone?: 'neutral' | 'good' | 'warn' | 'bad',
 * }} props
 */
export default function SaluteKpiCard({
  icon = '•',
  label,
  value,
  unit = '',
  trend = 'none',
  trendLabel = '',
  tone = 'neutral',
} = {}) {
  const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : trend === 'flat' ? '●' : '';
  return (
    <article className={`salute-kpi-card salute-kpi-card--${tone}`} aria-label={label}>
      <div className="salute-kpi-card__top">
        <span className="salute-kpi-card__icon" aria-hidden>{icon}</span>
        <span className="salute-kpi-card__label">{label}</span>
      </div>
      <div className="salute-kpi-card__value-row">
        <span className="salute-kpi-card__value">{value}</span>
        {unit ? <span className="salute-kpi-card__unit">{unit}</span> : null}
      </div>
      <div
        className={`salute-kpi-card__trend salute-kpi-card__trend--${trend}`}
        title={trendLabel || undefined}
      >
        {arrow ? <span aria-hidden>{arrow}</span> : null}
        <span>{trendLabel || '—'}</span>
      </div>
    </article>
  );
}
