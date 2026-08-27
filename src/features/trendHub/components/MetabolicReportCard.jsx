import React, { useMemo } from 'react';
import {
  buildLongevityPagellaInsight,
  longevityStatusLabel,
} from '../utils/longevityInsightGenerator';

const BAR_FILL = {
  good: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.45)]',
  mid: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]',
  low: 'bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]',
};

const PILLAR_GLOW = {
  cardio: 'from-rose-500/15 via-transparent to-transparent',
  weights: 'from-amber-500/15 via-transparent to-transparent',
  sleep: 'from-cyan-500/15 via-transparent to-transparent',
  nutrition: 'from-emerald-500/15 via-transparent to-transparent',
};

function InsightBullet({ item, variant }) {
  const shell = variant === 'strength'
    ? 'border-emerald-500/25 bg-emerald-950/35'
    : item.severity === 'red'
      ? 'border-rose-500/30 bg-rose-950/40'
      : 'border-amber-500/30 bg-amber-950/35';
  const titleClass = variant === 'strength'
    ? 'text-emerald-200'
    : item.severity === 'red'
      ? 'text-rose-200'
      : 'text-amber-200';

  return (
    <li className={`rounded-xl border px-3 py-2 ${shell}`}>
      <p className={`text-[12px] font-semibold leading-snug ${titleClass}`}>
        <span className="mr-1.5" aria-hidden>{item.badge}</span>
        {item.title}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-300/95">
        {item.body}
      </p>
    </li>
  );
}

function PagellaSection({ title, tone, children }) {
  const titleTone = tone === 'good'
    ? 'text-emerald-300/90'
    : tone === 'warn'
      ? 'text-amber-300/90'
      : 'text-slate-400';
  return (
    <div className="mt-2.5 first:mt-0">
      <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${titleTone}`}>
        {title}
      </p>
      <ul className="space-y-1.5">
        {children}
      </ul>
    </div>
  );
}

function PillarBars({ bars }) {
  return (
    <div className="mt-2.5 space-y-1.5 border-t border-white/5 pt-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Riepilogo pilastri
      </p>
      {bars.map((bar) => (
        <div key={bar.id} className="space-y-0.5">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-slate-300">{bar.label}</span>
            <span className="tabular-nums text-slate-400">
              <span className="font-semibold text-slate-200">{bar.pct}%</span>
              <span className="ml-1.5 text-slate-500">({bar.detail})</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800/90">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${BAR_FILL[bar.tone] || BAR_FILL.mid}`}
              style={{ width: `${Math.max(0, Math.min(100, bar.pct))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Livello 2 — Pagella Metabolica sempre visibile sotto l'anello Longevità.
 */
export default function MetabolicReportCard({
  score = null,
  breakdown = null,
} = {}) {
  const value = Number.isFinite(Number(score))
    ? Math.max(0, Math.min(100, Math.round(Number(score))))
    : null;

  const b = breakdown && typeof breakdown === 'object' ? breakdown : {};
  const cardioScore = Number(b.cardioScore) || 0;
  const weightsScore = Number(b.weightsScore) || 0;
  const sleepScore = Number(b.sleepScore) || 0;
  const nutritionScore = Number(b.nutritionScore) || 0;
  const longevityNutrition = b.longevityNutrition && typeof b.longevityNutrition === 'object'
    ? b.longevityNutrition
    : null;
  const whtrMultiplier = Number.isFinite(Number(b.whtrMultiplier)) ? Number(b.whtrMultiplier) : 1;
  const cardioMins = Math.round(Number(b.cardioMins) || 0);
  const uniqueGroups = Math.max(0, Math.min(5, Math.round(Number(b.uniqueGroups) || 0)));
  const sleepAvg = Number.isFinite(Number(b.sleepAvg)) && Number(b.sleepAvg) > 0
    ? Number(b.sleepAvg)
    : null;
  const criticalThreshold = Number.isFinite(Number(b.criticalThreshold))
    ? Number(b.criticalThreshold)
    : null;
  const userHeight = Number.isFinite(Number(b.userHeight)) ? Number(b.userHeight) : null;

  const insight = useMemo(
    () => buildLongevityPagellaInsight(value, {
      cardioMins,
      uniqueGroups,
      sleepAvg,
      whtrMultiplier,
      criticalThreshold,
      userHeight,
      cardioScore,
      weightsScore,
      sleepScore,
      nutritionScore,
      longevityNutrition,
    }),
    [
      value,
      cardioMins,
      uniqueGroups,
      sleepAvg,
      whtrMultiplier,
      criticalThreshold,
      userHeight,
      cardioScore,
      weightsScore,
      sleepScore,
      nutritionScore,
      longevityNutrition,
    ],
  );

  const weakestBar = useMemo(() => {
    if (!Array.isArray(insight.bars) || insight.bars.length === 0) return null;
    return insight.bars.reduce((min, bar) => (
      !min || bar.pct < min.pct ? bar : min
    ), null);
  }, [insight.bars]);

  const ambientGlow = PILLAR_GLOW[weakestBar?.id] || 'from-cyan-500/10 via-transparent to-transparent';

  return (
    <article
      className="relative w-full min-w-0 shrink-0 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      aria-label="Pagella metabolica"
    >
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br ${ambientGlow}`}
        aria-hidden
      />
      <div className="relative z-[1]">
        <header className="border-b border-white/5 pb-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Pagella metabolica
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-snug tabular-nums text-slate-50">
            {insight.scoreLabel || `${value != null ? value : '—'}/100 — ${longevityStatusLabel(value)}`}
          </p>
        </header>

        {insight.strengths.length > 0 ? (
          <PagellaSection title="Cosa va bene" tone="good">
            {insight.strengths.map((item) => (
              <InsightBullet key={item.id} item={item} variant="strength" />
            ))}
          </PagellaSection>
        ) : null}

        {insight.penalties.length > 0 ? (
          <PagellaSection title="Priorità di recupero" tone="warn">
            {insight.penalties.map((item) => (
              <InsightBullet key={item.id} item={item} variant="penalty" />
            ))}
          </PagellaSection>
        ) : (
          <div className="mt-2.5 rounded-xl border border-emerald-500/20 bg-emerald-950/25 px-3 py-2">
            <p className="text-[12px] font-semibold text-emerald-200">
              ✅ Nessuna penalità critica
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
              Continua così: la costanza sui pilastri consolida il punteggio.
            </p>
          </div>
        )}

        <div className="mt-2.5 rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/50 to-slate-950/60 px-3 py-2.5 shadow-[0_0_20px_rgba(34,211,238,0.08)]">
          <p className="text-[12px] font-semibold leading-snug text-cyan-100">
            <span className="mr-1.5" aria-hidden>{insight.cta?.badge || '🎯'}</span>
            {insight.cta?.title || 'Prossimo obiettivo'}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-200/95">
            💡
            {' '}
            {insight.cta?.body || 'Mantieni i pilastri in equilibrio sulla media 14 giorni.'}
          </p>
        </div>

        <PillarBars bars={insight.bars} />

        <p className="mt-2 text-center text-[10px] text-slate-500">
          Filtro strutturale
          {' '}
          <span className="tabular-nums text-slate-400">×{whtrMultiplier}</span>
          {criticalThreshold != null ? (
            <span>
              {' '}
              · soglia
              {' '}
              {criticalThreshold.toFixed(0)}
              {' '}
              cm
              {userHeight != null ? ` · h ${userHeight.toFixed(0)}` : ''}
            </span>
          ) : null}
        </p>
      </div>
    </article>
  );
}
