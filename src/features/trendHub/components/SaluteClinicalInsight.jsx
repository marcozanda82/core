import React from 'react';

function scoreTone(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 75) return 'good';
  if (n >= 50) return 'mid';
  return 'low';
}

/**
 * Insight Clinico — box compatto / chiuso di default (progressive disclosure).
 */
export default function SaluteClinicalInsight({
  report = null,
  analysisDate = '',
  status = 'idle',
  errorMessage = null,
  isRefreshing = false,
  onRefresh = null,
} = {}) {
  const tone = scoreTone(report?.dailyScore);
  const borderTone =
    tone === 'good'
      ? 'border-l-emerald-400'
      : tone === 'mid'
        ? 'border-l-amber-400'
        : tone === 'low'
          ? 'border-l-rose-400'
          : 'border-l-cyan-500/50';

  const parts = [
    report?.inflammationSummary,
    report?.timingFeedback,
    report?.sleepCorrelationInsight,
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  const synthesis = parts.length === 0
    ? ''
    : parts.length === 1
      ? parts[0]
      : `${parts[0].length > 120 ? `${parts[0].slice(0, 117)}…` : parts[0]} · ${
          parts[parts.length - 1].length > 80
            ? `${parts[parts.length - 1].slice(0, 77)}…`
            : parts[parts.length - 1]
        }`;

  return (
    <details className="group w-full min-w-0 rounded-2xl border border-cyan-500/20 bg-cyan-950/20 open:bg-cyan-950/30">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300/90 [&::-webkit-details-marker]:hidden">
        <span>Insight Clinico</span>
        <span className="flex items-center gap-2 normal-case tracking-normal">
          {report?.dailyScore != null ? (
            <span className="rounded-md bg-slate-950/50 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-300">
              Score {Math.round(Number(report.dailyScore) || 0)}
            </span>
          ) : null}
          <span className="text-cyan-400 group-open:hidden" aria-hidden>+</span>
          <span className="hidden text-cyan-400 group-open:inline" aria-hidden>−</span>
        </span>
      </summary>

      <div className="space-y-2 border-t border-white/5 px-3.5 pb-3.5 pt-2">
        <div className="flex items-start justify-between gap-2">
          <p className="m-0 text-[11px] text-slate-500">
            {analysisDate ? `Analisi ${analysisDate}` : 'Sintesi IA'}
          </p>
          {typeof onRefresh === 'function' ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing || status === 'empty'}
              className="rounded-lg border border-white/10 bg-slate-950/40 px-2 py-1 text-[10px] font-semibold text-cyan-300 disabled:opacity-40"
            >
              {isRefreshing ? '…' : 'Aggiorna'}
            </button>
          ) : null}
        </div>

        {(status === 'loading' || status === 'idle') && !report ? (
          <p className="m-0 text-xs text-slate-500">Generazione insight…</p>
        ) : null}
        {status === 'empty' && !report ? (
          <p className="m-0 text-xs text-slate-500">
            Nessun diario ieri — l&apos;insight comparirà dopo il primo giorno completo.
          </p>
        ) : null}
        {status === 'error' && !report ? (
          <p className="m-0 text-xs text-rose-400">{errorMessage || 'Insight non disponibile.'}</p>
        ) : null}
        {report && synthesis ? (
          <p className={`m-0 border-l-2 pl-2.5 text-[13px] leading-snug text-slate-300 ${borderTone}`}>
            {synthesis}
          </p>
        ) : null}
        {report && !synthesis ? (
          <p className="m-0 text-xs text-slate-500">Score calcolato · nessun testo aggiuntivo.</p>
        ) : null}
      </div>
    </details>
  );
}
