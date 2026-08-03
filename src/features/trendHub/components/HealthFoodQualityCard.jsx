import React from 'react';

function scoreTone(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 75) return 'good';
  if (n >= 50) return 'mid';
  return 'low';
}

function ReportSkeleton({ label = 'Generazione referto in corso…' }) {
  return (
    <div
      className="health-food-quality-card__skeleton"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
    >
      <div className="health-food-quality-card__skeleton-score" />
      <div className="health-food-quality-card__skeleton-block">
        <div className="health-food-quality-card__skeleton-line" />
        <div className="health-food-quality-card__skeleton-line health-food-quality-card__skeleton-line--mid" />
        <div className="health-food-quality-card__skeleton-line health-food-quality-card__skeleton-line--short" />
      </div>
      <div className="health-food-quality-card__skeleton-block">
        <div className="health-food-quality-card__skeleton-line" />
        <div className="health-food-quality-card__skeleton-line health-food-quality-card__skeleton-line--mid" />
      </div>
      <p className="health-food-quality-card__skeleton-caption">{label}</p>
    </div>
  );
}

/**
 * Referto salute giornaliero (Area IA e Qualità Cibo).
 * P2: skeleton a altezza stabile durante loading/idle per evitare layout shift.
 */
export default function HealthFoodQualityCard({
  report = null,
  analysisDate = '',
  status = 'idle',
  errorMessage = null,
  isRefreshing = false,
  unknownCount = 0,
  foodCount = 0,
  onRefresh = null,
} = {}) {
  const tone = scoreTone(report?.dailyScore);
  const showSkeleton = !report && (status === 'loading' || status === 'idle');

  return (
    <section className="health-food-quality-card" aria-label="Area IA e Qualità Cibo">
      <div className="health-food-quality-card__header">
        <div>
          <h3 className="health-food-quality-card__title">Area IA e Qualità Cibo</h3>
          <p className="health-food-quality-card__subtitle">
            {analysisDate
              ? `Referto del ${analysisDate}`
              : 'Referto salute giornaliero'}
            {foodCount > 0 ? ` · ${foodCount} alimenti` : ''}
            {unknownCount > 0 ? ` · ${unknownCount} da etichettare` : ''}
          </p>
        </div>
        {typeof onRefresh === 'function' && (
          <button
            type="button"
            className="health-food-quality-card__refresh"
            onClick={onRefresh}
            disabled={isRefreshing || status === 'empty'}
          >
            {isRefreshing ? 'Analisi…' : 'Aggiorna'}
          </button>
        )}
      </div>

      {showSkeleton && (
        <ReportSkeleton
          label={
            status === 'loading'
              ? 'Generazione referto in corso…'
              : 'Preparazione referto…'
          }
        />
      )}

      {status === 'empty' && !report && (
        <div className="health-food-quality-card__state-panel" role="status">
          <p className="health-food-quality-card__state">
            Nessun alimento nel giorno precedente. Il referto comparirà dopo il primo diario completo.
          </p>
        </div>
      )}

      {status === 'error' && !report && (
        <div className="health-food-quality-card__state-panel health-food-quality-card__state-panel--error" role="alert">
          <p className="health-food-quality-card__state health-food-quality-card__state--error">
            {errorMessage || 'Impossibile generare il referto.'}
          </p>
        </div>
      )}

      {report && (
        <div className="health-food-quality-card__body">
          <div className={`health-food-quality-card__score health-food-quality-card__score--${tone}`}>
            <span className="health-food-quality-card__score-value">{Math.round(Number(report.dailyScore) || 0)}</span>
            <span className="health-food-quality-card__score-label">Daily Score</span>
          </div>
          <div className="health-food-quality-card__blocks">
            <div className="health-food-quality-card__block">
              <span className="health-food-quality-card__block-label">Bilancio infiammatorio</span>
              <p className="health-food-quality-card__block-text">{report.inflammationSummary}</p>
            </div>
            <div className="health-food-quality-card__block">
              <span className="health-food-quality-card__block-label">Timing pasti</span>
              <p className="health-food-quality-card__block-text">{report.timingFeedback}</p>
            </div>
            {report.sleepCorrelationInsight ? (
              <div className="health-food-quality-card__block health-food-quality-card__block--sleep">
                <span className="health-food-quality-card__block-label">Analisi Recupero</span>
                <p className="health-food-quality-card__block-text">{report.sleepCorrelationInsight}</p>
              </div>
            ) : null}
          </div>
          {isRefreshing && (
            <p className="health-food-quality-card__footnote">Aggiornamento etichette / referto in corso…</p>
          )}
        </div>
      )}
    </section>
  );
}
