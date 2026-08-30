import React, { useMemo } from 'react';
import { buildProgressionPagellaInsight } from '../utils/progressionInsightGenerator';

const BAR_FILL = {
  good: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.45)]',
  mid: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]',
  low: 'bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.4)]',
  info: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.35)]',
};

function ObjectiveBullet({ item }) {
  return (
    <li className="rounded-xl border border-cyan-500/25 bg-cyan-950/30 px-3 py-2">
      <p className="text-[12px] font-semibold leading-snug text-cyan-100">
        <span className="mr-1.5" aria-hidden>{item.badge}</span>
        {item.title}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-300/95">{item.body}</p>
    </li>
  );
}

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
      <p className="mt-1 text-[11px] leading-relaxed text-slate-300/95">{item.body}</p>
    </li>
  );
}

function PagellaSection({ title, tone, children }) {
  const titleTone = tone === 'good'
    ? 'text-emerald-300/90'
    : tone === 'warn'
      ? 'text-amber-300/90'
      : tone === 'alarm'
        ? 'text-rose-300/90'
        : tone === 'info'
          ? 'text-cyan-300/90'
          : 'text-slate-400';
  return (
    <div className="mt-2.5 first:mt-0">
      <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${titleTone}`}>{title}</p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

/**
 * L2 — Pagella di Ricomposizione (sempre visibile).
 */
export default function ProgressionePagellaCard({
  score = null,
  breakdown = null,
  macroPillars = [],
  dayEvaluationContext = null,
} = {}) {
  const insight = useMemo(
    () => buildProgressionPagellaInsight(score, breakdown, macroPillars, dayEvaluationContext),
    [score, breakdown, macroPillars, dayEvaluationContext],
  );

  return (
    <article
      className="relative w-full min-w-0 shrink-0 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      aria-label="Pagella di ricomposizione"
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/10 via-transparent to-cyan-500/5"
        aria-hidden
      />
      <div className="relative z-[1]">
        <header className="border-b border-white/5 pb-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Pagella di ricomposizione
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-snug tabular-nums text-slate-50">
            {insight.scoreLabel}
          </p>
        </header>

        {insight.strengths.length > 0 ? (
          <PagellaSection title="Punti di forza" tone="good">
            {insight.strengths.map((item) => (
              <InsightBullet key={item.id} item={item} variant="strength" />
            ))}
          </PagellaSection>
        ) : null}

        {insight.isDayInProgress && insight.todayObjectives?.length > 0 ? (
          <PagellaSection title="Obiettivi di oggi (in corso)" tone="info">
            {insight.todayObjectives.map((item) => (
              <ObjectiveBullet key={item.id} item={item} />
            ))}
          </PagellaSection>
        ) : null}

        {insight.penalties.filter((item) => item.severity !== 'red').length > 0 ? (
          <PagellaSection title="Aree di miglioramento" tone="warn">
            {insight.penalties.filter((item) => item.severity !== 'red').map((item) => (
              <InsightBullet key={item.id} item={item} variant="penalty" />
            ))}
          </PagellaSection>
        ) : null}

        {insight.penalties.filter((item) => item.severity === 'red').length > 0 ? (
          <PagellaSection title="Aree di Allarme" tone="alarm">
            {insight.penalties.filter((item) => item.severity === 'red').map((item) => (
              <InsightBullet key={item.id} item={item} variant="penalty" />
            ))}
          </PagellaSection>
        ) : !insight.isDayInProgress && insight.penalties.length === 0 ? (
          <div className="mt-2.5 rounded-xl border border-emerald-500/20 bg-emerald-950/25 px-3 py-2">
            <p className="text-[12px] font-semibold text-emerald-200">✅ Nessun freno critico oggi</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
              I macro sono in linea: mantieni la costanza sul prossimo pasto.
            </p>
          </div>
        ) : insight.isDayInProgress && insight.penalties.length === 0 ? (
          <div className="mt-2.5 rounded-xl border border-cyan-500/20 bg-cyan-950/25 px-3 py-2">
            <p className="text-[12px] font-semibold text-cyan-100">ℹ️ Giornata ancora aperta</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
              I deficit macro non ancora coperti non sono allarmi finché non chiudi la finestra alimentare.
            </p>
          </div>
        ) : null}

        <div className="mt-2.5 rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-950/45 to-slate-950/60 px-3 py-2.5 shadow-[0_0_20px_rgba(139,92,246,0.1)]">
          <p className="text-[12px] font-semibold leading-snug text-violet-100">
            <span className="mr-1.5" aria-hidden>{insight.cta?.badge || '🎯'}</span>
            {insight.cta?.title || 'Prossimo pasto'}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-200/95">
            💡
            {' '}
            {insight.cta?.body}
          </p>
        </div>

        {insight.bars?.length > 0 ? (
          <div className="mt-2.5 space-y-1.5 border-t border-white/5 pt-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              {insight.isDayInProgress ? 'Macro oggi (in corso)' : 'Macro oggi'}
            </p>
            {insight.bars.map((bar) => (
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
        ) : null}
      </div>
    </article>
  );
}
