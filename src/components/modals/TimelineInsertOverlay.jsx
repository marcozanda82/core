import React from 'react';

/**
 * Sheet bottom: inserimento rapido sulla timeline (pasto / attività / altri eventi).
 */
export default function TimelineInsertOverlay({
  timelineInsertUI,
  onDismiss,
  decimalToTimeStr,
  onAddMealAtHour,
  onAddWorkoutAtHour,
  onShowEventsView,
  onBackToMainView,
  onAddWaterAtHour,
  onAddNapAtHour,
  onAddMeditationAtHour,
  onAddSupplementsAtHour,
}) {
  if (timelineInsertUI == null) return null;

  const hour = timelineInsertUI.hour;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100019,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        paddingLeft: 12,
        paddingRight: 12,
      }}
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Aggiungi sulla timeline"
        onClick={(ev) => ev.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 400,
          marginBottom: 8,
          borderRadius: 20,
          background: 'linear-gradient(180deg, #1a1f2e 0%, #12151c 100%)',
          border: '1px solid rgba(0,229,255,0.25)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.45)',
          padding: '18px 16px 20px',
          color: '#e8f4ff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#7dd3fc', letterSpacing: '0.12em', fontWeight: 700 }}>
              INSERIMENTO TIMELINE
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              🕐 {decimalToTimeStr(hour)}
            </div>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onDismiss}
            style={{
              width: 36,
              height: 36,
              border: 'none',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.08)',
              color: '#cbd5e1',
              fontSize: '1.25rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {timelineInsertUI.view === 'main' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={() => onAddMealAtHour(hour)}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px solid rgba(0,229,255,0.35)',
                background: 'rgba(0,229,255,0.12)',
                color: '#e0f2fe',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              🍽️ Aggiungi pasto
            </button>
            <button
              type="button"
              onClick={() => onAddWorkoutAtHour(hour)}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px solid rgba(255,109,0,0.4)',
                background: 'rgba(255,109,0,0.12)',
                color: '#ffedd5',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              ⚡ Aggiungi attività / allenamento
            </button>
            <button
              type="button"
              onClick={onShowEventsView}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(255,255,255,0.05)',
                color: '#cbd5e1',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              📌 Altro evento (acqua, riposo…)
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={onBackToMainView}
              style={{
                fontSize: '0.8rem',
                color: '#94a3b8',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                marginBottom: 2,
                padding: '4px 0',
              }}
            >
              ‹ Indietro
            </button>
            <button
              type="button"
              onClick={() => onAddWaterAtHour(hour)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid rgba(0,229,255,0.3)',
                background: 'rgba(0,229,255,0.08)',
                color: '#bae6fd',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              💧 Acqua
            </button>
            <button
              type="button"
              onClick={() => onAddNapAtHour(hour)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid rgba(129,140,248,0.35)',
                background: 'rgba(99,102,241,0.1)',
                color: '#c7d2fe',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              😴 Pisolino
            </button>
            <button
              type="button"
              onClick={() => onAddMeditationAtHour(hour)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid rgba(34,197,94,0.35)',
                background: 'rgba(22,163,74,0.1)',
                color: '#bbf7d0',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              🧘 Meditazione
            </button>
            <button
              type="button"
              onClick={() => onAddSupplementsAtHour(hour)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid rgba(168,85,247,0.35)',
                background: 'rgba(126,34,206,0.12)',
                color: '#e9d5ff',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              💊 Integrazione
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
