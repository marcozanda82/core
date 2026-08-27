import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  isHealthReportGeneratedToday,
  stripClinicalBulletinImages,
} from '../engines/HealthAnalyzerEngine';

/** Copertina fissa del bollettino (niente immagini generate dall'AI). */
const CLINICAL_INSIGHT_COVER_SRC = '/analisi_macro.png';

function scoreTone(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 75) return 'good';
  if (n >= 50) return 'mid';
  return 'low';
}

/**
 * Preferisce il bollettino Markdown v2; fallback ai campi plain-text legacy.
 * @param {object | null} report
 */
export function resolveClinicalInsightMarkdown(report) {
  if (!report || typeof report !== 'object') return '';
  const bulletin = stripClinicalBulletinImages(
    String(report.clinicalBulletinMarkdown || '').trim(),
  );
  if (bulletin) return bulletin;
  return [
    report.inflammationSummary,
    report.timingFeedback,
    report.sleepCorrelationInsight,
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

const markdownComponents = {
  // Copertina fissa in UI: ignora eventuali immagini residue nel Markdown
  img: () => null,
  h1: ({ children }) => (
    <h1 className="mb-3 mt-0 text-base font-bold leading-snug text-slate-50">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-sm font-bold text-slate-100">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-[13px] font-semibold text-cyan-200/90">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-2 mt-0 text-[13px] leading-relaxed text-slate-300">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 mt-1 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-slate-300">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 mt-1 list-decimal space-y-1 pl-4 text-[13px] leading-relaxed text-slate-300">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-100">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-cyan-300 underline underline-offset-2"
    >
      {children}
    </a>
  ),
};

/**
 * Insight Clinico — bollettino Markdown + copertina fissa, max 1 aggiornamento/giorno.
 */
export default function SaluteClinicalInsight({
  report = null,
  analysisDate = '',
  todayDate = '',
  status = 'idle',
  errorMessage = null,
  isRefreshing = false,
  isUpdatedToday: isUpdatedTodayProp = null,
  onRefresh = null,
  /** true = niente accordion; insight sempre visibile al 100%. */
  defaultExpanded = false,
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

  const markdown = useMemo(() => resolveClinicalInsightMarkdown(report), [report]);
  const isMarkdownBulletin = Boolean(
    stripClinicalBulletinImages(String(report?.clinicalBulletinMarkdown || '').trim()),
  );

  const isUpdatedToday = useMemo(() => {
    if (typeof isUpdatedTodayProp === 'boolean') return isUpdatedTodayProp;
    return isHealthReportGeneratedToday(report, todayDate);
  }, [isUpdatedTodayProp, report, todayDate]);

  const refreshDisabled = isRefreshing
    || status === 'empty'
    || isUpdatedToday
    || typeof onRefresh !== 'function';

  const insightBody = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 text-[11px] text-slate-500">
          {analysisDate ? `Analisi ${analysisDate}` : 'Bollettino IA'}
          {isUpdatedToday ? ' · aggiornato oggi' : ''}
        </p>
        {typeof onRefresh === 'function' ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshDisabled}
            title={isUpdatedToday ? 'Già aggiornato oggi — riprova domani' : 'Genera di nuovo'}
            className="rounded-lg border border-white/10 bg-slate-950/40 px-2 py-1 text-[10px] font-semibold text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRefreshing ? '…' : isUpdatedToday ? 'Aggiornato' : 'Aggiorna'}
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
      {report && markdown ? (
        <div className={`h-auto max-h-none break-words border-l-2 pl-2.5 ${borderTone}`}>
          <img
            src={CLINICAL_INSIGHT_COVER_SRC}
            alt="Copertina Insight Clinico"
            className="mb-4 h-32 w-full rounded-lg object-cover shadow-sm"
            loading="lazy"
          />
          {isMarkdownBulletin ? (
            <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
          ) : (
            <p className="m-0 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300">
              {markdown}
            </p>
          )}
        </div>
      ) : null}
      {report && !markdown ? (
        <p className="m-0 text-xs text-slate-500">Score calcolato · nessun testo aggiuntivo.</p>
      ) : null}
    </>
  );

  if (defaultExpanded) {
    return (
      <section
        className="w-full min-w-0 rounded-2xl border border-cyan-500/20 bg-cyan-950/25"
        aria-label="Insight Clinico"
      >
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-white/5 px-3.5 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-300/90">
            Insight Clinico
          </span>
          {report?.dailyScore != null ? (
            <span className="rounded-md bg-slate-950/50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
              Score {Math.round(Number(report.dailyScore) || 0)}
            </span>
          ) : null}
        </div>
        <div className="h-auto max-h-none space-y-2 px-3.5 pb-3.5 pt-2.5">
          {insightBody}
        </div>
      </section>
    );
  }

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

      <div className="h-auto max-h-none space-y-2 border-t border-white/5 px-3.5 pb-3.5 pt-2">
        {insightBody}
      </div>
    </details>
  );
}
