/**
 * Indicatori di salute Home — Stimolo Muscolare + Longevità.
 * Design premium allineato alle card macro (bg-zinc-900/50, barre di riempimento).
 */

import React from 'react';

/**
 * Colore tema per metrica.
 * @param {string} metricType - 'strength' | 'cardio' | 'longevity'
 * @returns {{ primary: string, bg: string, border: string }}
 */
function getMetricColors(metricType) {
  switch (metricType) {
    case 'strength':
      return {
        primary: '#a855f7', // viola
        bg: 'from-purple-950/80 via-purple-900/40',
        border: 'border-purple-500/25',
      };
    case 'cardio':
      return {
        primary: '#06b6d4', // azzurro
        bg: 'from-cyan-950/80 via-cyan-900/40',
        border: 'border-cyan-500/25',
      };
    case 'longevity':
      return {
        primary: '#84cc16', // verde lime
        bg: 'from-lime-950/80 via-lime-900/40',
        border: 'border-lime-500/25',
      };
    default:
      return {
        primary: '#64748b',
        bg: 'from-slate-950/80 via-slate-900/40',
        border: 'border-slate-500/25',
      };
  }
}

/**
 * Card singola indicatore salute.
 */
function HealthIndicatorCard({
  icon = '📊',
  title = 'Metrica',
  score = null,
  maxScore = 100,
  metricType = 'cardio',
  onClick = null,
}) {
  const colors = getMetricColors(metricType);
  const value = Number.isFinite(Number(score)) ? Math.max(0, Math.min(maxScore, Math.round(Number(score)))) : null;
  const pct = value != null ? (value / maxScore) * 100 : 0;
  
  const isClickable = typeof onClick === 'function';
  
  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={`
        flex flex-col justify-between overflow-hidden
        rounded-2xl border ${colors.border}
        bg-gradient-to-br ${colors.bg} to-zinc-900/50
        px-3 py-2.5
        backdrop-blur-sm
        shadow-lg shadow-black/20
        ${isClickable ? 'cursor-pointer active:scale-95 transition-transform hover:shadow-xl' : 'cursor-default'}
        disabled:cursor-not-allowed
      `}
      aria-label={`${title} ${value != null ? value : '—'} su ${maxScore}`}
    >
      {/* Header: Icona + Titolo */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-lg leading-none" aria-hidden="true">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          {title}
        </span>
      </div>
      
      {/* Valore Centrale */}
      <div className="mb-2 text-center">
        <span
          className="text-3xl font-black tabular-nums leading-none text-white"
          style={{ textShadow: `0 0 20px ${colors.primary}66` }}
        >
          {value != null ? value : '—'}
        </span>
        <span className="ml-1 text-sm font-semibold text-zinc-500">
          / {maxScore}
        </span>
      </div>
      
      {/* Barra di Riempimento (Footer) */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: colors.primary,
            boxShadow: `0 0 8px ${colors.primary}99`,
          }}
        />
      </div>
    </button>
  );
}

/**
 * Sezione indicatori salute Home: Stimolo Muscolare (sempre) + Longevità.
 *
 * @param {{
 *   progressionScore: number | null,
 *   longevityScore: number | null,
 *   onOpenProgressione: (() => void) | null,
 *   onOpenLongevity: (() => void) | null,
 * }} props
 */
export default function HomeHealthIndicators({
  progressionScore = null,
  longevityScore = null,
  onOpenProgressione = null,
  onOpenLongevity = null,
} = {}) {
  return (
    <div
      className="grid w-full grid-cols-2 gap-3"
      aria-label="Indicatori di salute"
    >
      <HealthIndicatorCard
        icon="🏋️"
        title="STIMOLO MUSCOLARE"
        score={progressionScore}
        maxScore={100}
        metricType="strength"
        onClick={onOpenProgressione}
      />
      <HealthIndicatorCard
        icon="🍃"
        title="LONGEVITÀ"
        score={longevityScore}
        maxScore={100}
        metricType="longevity"
        onClick={onOpenLongevity}
      />
    </div>
  );
}
