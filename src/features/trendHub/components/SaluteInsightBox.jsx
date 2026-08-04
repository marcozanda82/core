import React, { useMemo } from 'react';

function scoreTone(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 75) return 'good';
  if (n >= 50) return 'mid';
  return 'low';
}

/**
 * Unico box testuale in fondo: sintesi IA breve (niente referto lungo).
 */
export default function SaluteInsightBox({
  report = null,
  analysisDate = '',
  status = 'idle',
  errorMessage = null,
  isRefreshing = false,
  onRefresh = null,
} = {}) {
  const tone = scoreTone(report?.dailyScore);

  const synthesis = useMemo(() => {
    if (!report) return '';
    const parts = [
      report.inflammationSummary,
      report.timingFeedback,
      report.sleepCorrelationInsight,
    ]
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    if (parts.length === 0) return '';
    // Una sola riga densa: primo insight + eventuale recupero
    if (parts.length === 1) return parts[0];
    const head = parts[0].length > 140 ? `${parts[0].slice(0, 137)}…` : parts[0];
    const tail = parts[parts.length - 1];
    if (parts.length === 2) return `${head} · ${tail.length > 90 ? `${tail.slice(0, 87)}…` : tail}`;
    return `${head} · ${tail.length > 80 ? `${tail.slice(0, 77)}…` : tail}`;
  }, [report]);

  return (
    <section className="salute-insight-box" aria-label="Sintesi salute">
      <header className="salute-insight-box__head">
        <div>
          <h3 className="salute-insight-box__title">Sintesi</h3>
          <p className="salute-insight-box__meta">
            {analysisDate ? `Analisi ${analysisDate}` : 'Insight IA'}
            {report?.dailyScore != null ? ` · Score ${Math.round(Number(report.dailyScore) || 0)}` : ''}
          </p>
        </div>
        {typeof onRefresh === 'function' ? (
          <button
            type="button"
            className="salute-insight-box__refresh"
            onClick={onRefresh}
            disabled={isRefreshing || status === 'empty'}
          >
            {isRefreshing ? '…' : '↻'}
          </button>
        ) : null}
      </header>

      {(status === 'loading' || status === 'idle') && !report ? (
        <p className="salute-insight-box__state">Generazione insight…</p>
      ) : null}

      {status === 'empty' && !report ? (
        <p className="salute-insight-box__state">
          Nessun diario ieri — l&apos;insight comparirà dopo il primo giorno completo.
        </p>
      ) : null}

      {status === 'error' && !report ? (
        <p className="salute-insight-box__state salute-insight-box__state--error">
          {errorMessage || 'Insight non disponibile.'}
        </p>
      ) : null}

      {report && synthesis ? (
        <p className={`salute-insight-box__text salute-insight-box__text--${tone}`}>
          {synthesis}
        </p>
      ) : null}

      {report && !synthesis ? (
        <p className="salute-insight-box__state">Score calcolato · nessun testo aggiuntivo.</p>
      ) : null}
    </section>
  );
}
