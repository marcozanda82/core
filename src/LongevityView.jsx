import React, { useMemo, useState } from 'react';
import { addDays, getTodayString } from './coreEngine';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const getColor = (value) => {
  if (value >= 75) return '#22c55e'; // verde
  if (value >= 50) return '#facc15'; // giallo
  return '#ef4444'; // rosso
};

const MATRIX_PILLAR_LABELS = {
  metabolic: 'Metabolico',
  cardio: 'Cardiovascolare',
  inflammatory: 'Infiammatorio',
  neuro: 'Neuro / sonno',
};

function formatAxisDate(entry) {
  const ts = Number(entry?.timestamp);
  if (Number.isFinite(ts)) {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (entry?.date) {
    const d = new Date(entry.date);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  return '—';
}

function BodyCompositionChart({ history }) {
  const { chartData, chartOptions } = useMemo(() => {
    const labels = history.map(formatAxisDate);
    const weightData = history.map((e) => {
      const w = Number(e.weight);
      return Number.isFinite(w) ? w : null;
    });
    const fatData = history.map((e) => {
      if (e.bodyFat == null || e.bodyFat === '') return null;
      const f = Number(e.bodyFat);
      return Number.isFinite(f) ? f : null;
    });
    const hasBodyFatLine = fatData.some((v) => v != null);

    const validWeights = weightData.filter((v) => v != null);
    let wMin = validWeights.length ? Math.min(...validWeights) : 0;
    let wMax = validWeights.length ? Math.max(...validWeights) : 80;
    if (validWeights.length === 1) {
      wMin -= 3;
      wMax += 3;
    } else {
      wMin -= 2;
      wMax += 2;
    }
    if (wMin < 1) wMin = 1;

    const validFats = fatData.filter((v) => v != null);
    let fMin = 0;
    let fMax = 40;
    if (validFats.length > 0) {
      fMin = Math.min(...validFats) - 2;
      fMax = Math.max(...validFats) + 2;
      fMin = Math.max(0, fMin);
      fMax = Math.min(100, fMax);
      if (fMin >= fMax) {
        fMax = fMin + 5;
      }
    }

    const datasets = [
      {
        label: 'Peso (kg)',
        data: weightData,
        borderColor: '#00d2ff',
        backgroundColor: 'rgba(0, 210, 255, 0.08)',
        borderWidth: 3,
        tension: 0.3,
        fill: false,
        pointRadius: 4,
        pointBackgroundColor: '#00d2ff',
        pointBorderColor: '#0a0a0a',
        pointBorderWidth: 1,
        yAxisID: 'y',
      },
    ];

    if (hasBodyFatLine) {
      datasets.push({
        label: 'Massa Grassa (%)',
        data: fatData,
        borderColor: '#ff5e62',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 5],
        tension: 0.3,
        fill: false,
        pointRadius: 3,
        pointBackgroundColor: '#ff5e62',
        pointBorderColor: '#0a0a0a',
        pointBorderWidth: 1,
        yAxisID: 'y1',
        spanGaps: false,
      });
    }

    const scales = {
      x: {
        grid: { display: false },
        ticks: { color: '#888', maxRotation: 45, font: { size: 11 } },
        border: { color: 'rgba(255,255,255,0.08)' },
      },
      y: {
        type: 'linear',
        position: 'left',
        min: wMin,
        max: wMax,
        grid: { color: 'rgba(255,255,255,0.06)', drawBorder: false },
        ticks: { color: '#00d2ff', font: { size: 11 } },
        border: { display: false },
      },
    };

    if (hasBodyFatLine) {
      scales.y1 = {
        type: 'linear',
        position: 'right',
        min: fMin,
        max: fMax,
        grid: { drawOnChartArea: false },
        ticks: { color: '#ff5e62', font: { size: 11 } },
        border: { display: false },
      };
    }

    return {
      chartData: { labels, datasets },
      chartOptions: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: 'rgba(255, 255, 255, 0.7)',
              usePointStyle: true,
              boxWidth: 8,
              font: { size: 11 },
            },
          },
          tooltip: {
            backgroundColor: 'rgba(15,15,18,0.95)',
            titleColor: '#e5e5e5',
            bodyColor: '#ccc',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
          },
        },
        scales,
      },
    };
  }, [history]);

  return (
    <div style={{ height: '250px', width: '100%', position: 'relative' }}>
      <Line data={chartData} options={chartOptions} />
    </div>
  );
}

function calculateAverageScore(days, anchorDate, scoreHistory, todayScore) {
  const t = typeof todayScore === 'number' && !Number.isNaN(todayScore) ? todayScore : 0;
  if (days === 1 || !Array.isArray(scoreHistory) || scoreHistory.length === 0) {
    return Math.round(t);
  }
  const byDate = new Map();
  for (const r of scoreHistory) {
    const key = r?.date;
    if (!key) continue;
    const s =
      typeof r.score === 'number'
        ? r.score
        : typeof r.masterScore === 'number'
          ? r.masterScore
          : null;
    if (s != null && !Number.isNaN(s)) byDate.set(key, s);
  }
  const values = [t];
  for (let i = 1; i < days; i++) {
    const dStr = addDays(anchorDate, -i);
    if (byDate.has(dStr)) values.push(byDate.get(dStr));
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

export default function LongevityView({
  data,
  showPriorityFocus = true,
  userAge,
  bodyMetricsHistory = [],
  scoreHistory = [],
  todayScore: todayScoreProp,
  periodAnchorDate,
}) {
  const calculateProjectedAge = (age, score) => {
    if (!age || typeof age !== 'number' || typeof score !== 'number') return null;
    const maxAge = 100;
    const baseAge = 85;
    const minAge = age + (age * 0.1);

    if (score >= 50) {
      return baseAge + ((score - 50) / 50) * (maxAge - baseAge);
    }
    return minAge + (score / 50) * (baseAge - minAge);
  };

  const [timeWindow, setTimeWindow] = useState(30);
  const timeOptions = [
    { label: 'Oggi', value: 1 },
    { label: '7g', value: 7 },
    { label: '14g', value: 14 },
    { label: '30g', value: 30 },
  ];

  const anchorDate = periodAnchorDate || getTodayString();
  const todayScore =
    typeof todayScoreProp === 'number' && !Number.isNaN(todayScoreProp)
      ? todayScoreProp
      : data?.score || data?.masterScore || 0;

  const averageScore = useMemo(
    () => calculateAverageScore(timeWindow, anchorDate, scoreHistory, todayScore),
    [timeWindow, anchorDate, scoreHistory, todayScore]
  );

  const bioScore =
    data && typeof data.score === 'number'
      ? data.score
      : data && typeof data.masterScore === 'number'
        ? data.masterScore
        : null;

  const projectedAge =
    data && typeof userAge === 'number' && !Number.isNaN(userAge) && typeof averageScore === 'number'
      ? calculateProjectedAge(userAge, averageScore)
      : null;

  if (!data) {
    return (
      <div style={{ padding: 20, maxWidth: 600, margin: '0 auto', color: '#e5e5e5' }}>
        Nessun dato disponibile
      </div>
    );
  }

  const { breakdown, drivers, suggestions, priorityFocus } = data;
  const hasEngineBreakdown = breakdown && typeof breakdown === 'object' && breakdown.energia !== undefined;
  const breakdownEntries = hasEngineBreakdown
    ? Object.entries(breakdown)
    : data.metabolic && data.cardio && data.inflammatory && data.neuro
      ? ['metabolic', 'cardio', 'inflammatory', 'neuro'].map((key) => [
          key,
          Math.max(0, 100 - (data[key]?.score ?? 50)),
        ])
      : [];

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>

      {/* Cruscotto: Età proiettata o fallback */}
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        {projectedAge != null ? (
          <>
            <div style={{ fontSize: '5rem', fontWeight: 900, color: getColor(averageScore), lineHeight: 1.05 }}>
              {projectedAge.toFixed(1)}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: 12, letterSpacing: '0.04em', color: '#e5e5e5' }}>
              Anni di Età Proiettata
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.6, marginTop: 10, color: '#a3a3a3' }}>
              Punteggio biochimico
              {timeWindow > 1 ? ' (media inerzia temporale)' : ''}: {averageScore} / 100
            </div>
            <div
              role="tablist"
              aria-label="Periodo media mobile età proiettata"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 8,
                marginTop: 16,
              }}
            >
              {timeOptions.map((opt) => {
                const active = timeWindow === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTimeWindow(opt.value)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 999,
                      border: active ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.12)',
                      background: active ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                      color: active ? '#fff' : 'rgba(255,255,255,0.75)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '0.75rem', opacity: 0.55, marginTop: 10, color: '#94a3b8', lineHeight: 1.4 }}>
              {timeWindow === 1
                ? 'Proiezione basata solo sulle scelte odierne.'
                : `Basato sulla media degli ultimi ${timeWindow} giorni (solo giorni con dati disponibili).`}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: '0.95rem',
                opacity: 0.85,
                color: '#94a3b8',
                marginBottom: 20,
                lineHeight: 1.45,
                maxWidth: 340,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              Inserisci la tua Data di Nascita nel Profilo (Menu ≡) per sbloccare la tua Età Proiettata.
            </div>
            {bioScore != null && (
              <>
                <div style={{ fontSize: 64, fontWeight: 'bold', color: getColor(bioScore) }}>
                  {bioScore}
                </div>
                <div style={{ fontSize: 18, opacity: 0.7, color: '#a3a3a3' }}>Punteggio statistiche</div>
              </>
            )}
          </>
        )}
      </div>

      {/* Trend composizione corporea */}
      <div
        className="chart-card"
        style={{
          background: '#111',
          padding: 16,
          borderRadius: 12,
          marginBottom: 24,
          border: '1px solid #333',
        }}
      >
        <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: 14, color: '#e5e5e5', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden>⚖️</span>
          Trend Composizione Corporea
        </div>
        {bodyMetricsHistory.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#888', lineHeight: 1.5 }}>
            Nessuna pesata registrata. Usa il tasto + per inserire il tuo primo dato.
          </p>
        ) : (
          <BodyCompositionChart history={bodyMetricsHistory} />
        )}
      </div>

      {showPriorityFocus && priorityFocus && (
        <div style={{
          background: '#111',
          padding: 16,
          borderRadius: 12,
          marginBottom: 24,
          border: '1px solid #333',
        }}>
          <div style={{ fontSize: 14, opacity: 0.6 }}>PRIORITÀ DI OGGI</div>
          <div style={{ fontSize: 18, fontWeight: 'bold', marginTop: 4 }}>
            {priorityFocus.title}
          </div>
          <div style={{ marginTop: 8, color: '#00e5ff' }}>
            → {priorityFocus.action}
          </div>
        </div>
      )}

      {breakdownEntries.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 10, fontWeight: 'bold' }}>Dettaglio Parametri</div>

          {breakdownEntries.map(([key, value]) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ textTransform: 'capitalize' }}>
                  {MATRIX_PILLAR_LABELS[key] || key}
                </span>
                <span>{Math.round(value)}</span>
              </div>
              <div style={{
                height: 6,
                background: '#222',
                borderRadius: 4,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, value))}%`,
                  background: getColor(value),
                  height: '100%',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {drivers && drivers.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 10, fontWeight: 'bold' }}>Indicatori Chiave</div>

          {drivers.map((d, i) => (
            <div key={`${d.type}-${d.key}-${i}`} style={{ marginBottom: 6 }}>
              {d.type === 'negative' ? '⚠️' : '✅'} {d.message}
            </div>
          ))}
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div>
          <div style={{ marginBottom: 10, fontWeight: 'bold' }}>Azioni Consigliate</div>

          {suggestions.map((s, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              → {s}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
