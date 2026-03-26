import React from 'react';

const getColor = (value) => {
  if (value >= 75) return '#22c55e'; // verde
  if (value >= 50) return '#facc15'; // giallo
  return '#ef4444'; // rosso
};

export default function LongevityView({ data, showPriorityFocus = true }) {
  if (!data) return <div style={{ padding: 20 }}>Nessun dato disponibile</div>;

  const { score, breakdown, drivers, suggestions, priorityFocus } = data;

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>

      {/* 🔵 SCORE */}
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <div style={{ fontSize: 64, fontWeight: 'bold', color: getColor(score) }}>
          {score}
        </div>
        <div style={{ fontSize: 18, opacity: 0.7 }}>Punteggio Longevità</div>
      </div>

      {/* 🔴 PRIORITY FOCUS */}
      {showPriorityFocus && priorityFocus && (
        <div style={{
          background: '#111',
          padding: 16,
          borderRadius: 12,
          marginBottom: 24,
          border: '1px solid #333'
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

      {/* 🧬 BREAKDOWN */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 10, fontWeight: 'bold' }}>Dettaglio Parametri</div>

        {Object.entries(breakdown).map(([key, value]) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ textTransform: 'capitalize' }}>{key}</span>
              <span>{value}</span>
            </div>
            <div style={{
              height: 6,
              background: '#222',
              borderRadius: 4,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${value}%`,
                background: getColor(value),
                height: '100%'
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* 🔥 DRIVERS */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 10, fontWeight: 'bold' }}>Indicatori Chiave</div>

        {drivers?.map((d, i) => (
          <div key={`${d.type}-${d.key}-${i}`} style={{ marginBottom: 6 }}>
            {d.type === 'negative' ? '⚠️' : '✅'} {d.message}
          </div>
        ))}
      </div>

      {/* 🎯 SUGGESTIONS */}
      <div>
        <div style={{ marginBottom: 10, fontWeight: 'bold' }}>Azioni Consigliate</div>

        {suggestions?.map((s, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            → {s}
          </div>
        ))}
      </div>

    </div>
  );
}
