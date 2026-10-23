import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, Moon, Sparkles, Utensils } from 'lucide-react';
import {
  FOCUS_PRODUCT_DEMO_BANNER,
  FOCUS_PRODUCT_PERIODS,
  buildFocusProductEdition,
} from '../features/kentuFocus/product/index.js';
import './kentuFocusPage.css';

function DomainIcon({ domain }) {
  if (domain === 'sleep') return <Moon size={16} strokeWidth={2.2} aria-hidden />;
  if (domain === 'nutrition') return <Utensils size={16} strokeWidth={2.2} aria-hidden />;
  if (domain === 'activity') return <Dumbbell size={16} strokeWidth={2.2} aria-hidden />;
  return <Sparkles size={16} strokeWidth={2.2} aria-hidden />;
}

/**
 * Barre SVG: valori null/missing = tick vuoto, mai zero finto.
 */
function SparkBars({ chart, accent = '#4ea1ff' }) {
  const points = chart?.points || [];
  if (!chart?.hasData) {
    return <p className="kf-card-empty">{chart?.emptyLabel || 'Nessun dato.'}</p>;
  }

  const recordedValues = points
    .filter((p) => p.status === 'recorded' && Number.isFinite(p.value))
    .map((p) => p.value);
  const max = Math.max(...recordedValues, 0.0001);
  const w = 320;
  const h = 76;
  const pad = 6;
  const n = Math.max(points.length, 1);
  const slot = (w - pad * 2) / n;
  const barW = Math.max(3, Math.min(14, slot * 0.55));

  return (
    <svg className="kf-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={chart.title}>
      {points.map((p, i) => {
        const x = pad + i * slot + (slot - barW) / 2;
        if (p.status !== 'recorded' || p.value == null) {
          return (
            <rect
              key={p.date}
              x={x}
              y={h - 10}
              width={barW}
              height={4}
              rx={1}
              fill="none"
              stroke="#6d7c91"
              strokeDasharray="2 2"
            />
          );
        }
        const barH = Math.max(4, ((p.value / max) * (h - 18)));
        return (
          <rect
            key={p.date}
            x={x}
            y={h - 8 - barH}
            width={barW}
            height={barH}
            rx={2}
            fill={accent}
            opacity={0.92}
          />
        );
      })}
    </svg>
  );
}

function InsightCard({ variant, section }) {
  const primary = section?.primary;
  return (
    <article className={`kf-card kf-card--${variant}`}>
      <p className="kf-card-kicker">{section?.cardLabel || section?.title}</p>
      {primary ? (
        <>
          <h3>{primary.title}</h3>
          {primary.body ? <p>{primary.body}</p> : null}
        </>
      ) : (
        <p className="kf-card-empty">{section?.emptyLabel}</p>
      )}
    </article>
  );
}

function provenanceLabel(tag) {
  if (tag === 'recorded') return 'dato registrato';
  if (tag === 'estimated') return 'dato stimato';
  if (tag === 'calculated') return 'osservazione calcolata';
  return tag;
}

export default function KentuFocusPage() {
  const navigate = useNavigate();
  const [periodId, setPeriodId] = useState('ieri');
  const [status, setStatus] = useState('loading');
  const [edition, setEdition] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setEdition(null);

    buildFocusProductEdition(periodId)
      .then((result) => {
        if (cancelled) return;
        setEdition(result);
        setStatus(result.ok ? (result.empty ? 'empty' : 'ready') : 'error');
      })
      .catch((err) => {
        if (cancelled) return;
        setEdition({
          ok: false,
          demo: true,
          demoBanner: FOCUS_PRODUCT_DEMO_BANNER,
          error: { code: 'unexpected', message: err?.message || 'Errore inatteso' },
        });
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [periodId]);

  const coach = edition?.coachView;
  const dates = edition?.dates;
  const headline = edition?.headline;
  const charts = edition?.charts?.charts || [];

  return (
    <div className="kf-page">
      <div className="kf-shell">
        <div className="kf-topbar">
          <button
            type="button"
            className="kf-back"
            onClick={() => navigate('/', { replace: false })}
          >
            ← Sala Comandi
          </button>
          <div className="kf-brand">
            <p className="kf-brand-kicker">Kentu</p>
            <h1 className="kf-brand-title">Focus</h1>
          </div>
        </div>

        <div className="kf-banner" role="status">
          {edition?.demoBanner || FOCUS_PRODUCT_DEMO_BANNER}
        </div>

        <header className="kf-hero">
          <div className="kf-hero-icons" aria-hidden>
            <span className="kf-domain-chip"><Moon size={15} /></span>
            <span className="kf-domain-chip"><Utensils size={15} /></span>
            <span className="kf-domain-chip"><Dumbbell size={15} /></span>
          </div>
          <h2>{headline?.title || 'Dashboard benessere'}</h2>
          <p>
            {headline?.subtitle
              || 'Scegli Ieri, Settimana o Mese. Solo evidenze del motore Focus su dati dimostrativi.'}
          </p>
        </header>

        <div className="kf-period-tabs" role="tablist" aria-label="Periodo Focus">
          {FOCUS_PRODUCT_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              className="kf-period-tab"
              aria-selected={periodId === p.id}
              onClick={() => setPeriodId(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {dates ? (
          <p className="kf-meta">
            Pubblicazione {dates.publicationDate}
            {dates.editionKind ? ` · ${dates.editionKind}` : ''}
            {edition?.usedFallback ? ' · prosa fallback' : ''}
          </p>
        ) : null}

        {status === 'loading' ? (
          <div className="kf-state" aria-live="polite">Sto preparando la dashboard…</div>
        ) : null}

        {status === 'error' ? (
          <div className="kf-state kf-state--error" role="alert">
            {edition?.error?.message || 'Dashboard non disponibile.'}
          </div>
        ) : null}

        {(status === 'ready' || status === 'empty') && coach ? (
          <>
            <div className="kf-cards">
              <InsightCard variant="bene" section={coach.sections.bene} />
              <InsightCard variant="attenzione" section={coach.sections.attenzione} />
              <InsightCard variant="migliora" section={coach.sections.migliora} />
            </div>

            <section className="kf-block" aria-label="Grafici">
              <h2 className="kf-block-title">Grafici del periodo</h2>
              {charts.length === 0 ? (
                <p className="kf-card-empty">Nessuna serie disponibile per questo periodo.</p>
              ) : (
                charts.map((chart) => (
                  <div key={chart.id} className="kf-chart">
                    <div className="kf-chart-head">
                      <span className="kf-domain-chip">
                        <DomainIcon domain={chart.domain} />
                      </span>
                      <h4>{chart.title}</h4>
                    </div>
                    <p className="kf-chart-meta">
                      {chart.windowLabel} · unità {chart.unit}
                      {' · '}
                      {chart.recordedCount} registrati
                      {' · '}
                      {chart.missingCount} senza registrazione
                    </p>
                    <SparkBars
                      chart={chart}
                      accent={
                        chart.domain === 'sleep'
                          ? '#8b9cff'
                          : chart.domain === 'nutrition'
                            ? '#2fbf7a'
                            : '#4ea1ff'
                      }
                    />
                    <div className="kf-legend">
                      <span className="kf-legend-rec">giorno registrato</span>
                      <span className="kf-legend-miss">giorno senza registrazione</span>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="kf-block" aria-label="Consiglio del coach">
              <h2 className="kf-block-title">Il consiglio del coach</h2>
              {coach.coachAdvice ? (
                <div className="kf-coach">
                  <div className="kf-coach-avatar" aria-hidden>
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3>{coach.coachAdvice.title}</h3>
                    <p>{coach.coachAdvice.body}</p>
                  </div>
                </div>
              ) : (
                <p className="kf-card-empty">
                  Nessun consiglio del coach fondato sui dati in questa edizione.
                </p>
              )}
            </section>

            <details className="kf-block kf-deepen">
              <summary>Leggi l’approfondimento</summary>
              {(coach.deepenArticles || []).length === 0 ? (
                <p className="kf-card-empty">Nessun articolo editoriale in questa edizione.</p>
              ) : (
                coach.deepenArticles.map((item) => (
                  <article key={item.id || item.title} className="kf-article">
                    <h4>{item.title}</h4>
                    {item.body ? <p>{item.body}</p> : null}
                    <div className="kf-tags">
                      {(item.provenanceTags || []).map((tag) => (
                        <span key={tag} className="kf-tag">{provenanceLabel(tag)}</span>
                      ))}
                      {item.role ? <span className="kf-tag">{item.role}</span> : null}
                    </div>
                  </article>
                ))
              )}
            </details>
          </>
        ) : null}
      </div>
    </div>
  );
}
