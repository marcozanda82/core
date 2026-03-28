import React from 'react';

const getColor = (value) => {
  if (value >= 75) return '#22c55e'; // verde
  if (value >= 50) return '#facc15'; // giallo
  return '#ef4444'; // rosso
};

const MATRIX_PILLAR_LABELS = {
  metabolic: 'Metabolico',
  cardio: 'Cardiovascolare',
  inflammatory: 'Infiammatorio',
  neuro: 'Neuro / sonno'
};

export default function LongevityView({ data, showPriorityFocus = true, userAge }) {
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

  const bioScore =
    data && typeof data.score === 'number'
      ? data.score
      : data && typeof data.masterScore === 'number'
        ? data.masterScore
        : null;

  const projectedAge =
    data && typeof userAge === 'number' && !Number.isNaN(userAge) && typeof bioScore === 'number'
      ? calculateProjectedAge(userAge, bioScore)
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
          Math.max(0, 100 - (data[key]?.score ?? 50))
        ])
      : [];

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>

      {/* Cruscotto: Età proiettata o fallback */}
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        {projectedAge != null ? (
          <>
            <div style={{ fontSize: '5rem', fontWeight: 900, color: getColor(bioScore), lineHeight: 1.05 }}>
              {projectedAge.toFixed(1)}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: 12, letterSpacing: '0.04em', color: '#e5e5e5' }}>
              Anni di Età Proiettata
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.6, marginTop: 10, color: '#a3a3a3' }}>
              Punteggio biochimico: {bioScore} / 100
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
                marginRight: 'auto'
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
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, value))}%`,
                  background: getColor(value),
                  height: '100%'
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
