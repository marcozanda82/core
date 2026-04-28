import React from 'react';

export default function SleepModalOverlay({
  sleepModal,
  onClose,
  sleepFormBedStr,
  setSleepFormBedStr,
  sleepFormWakeStr,
  setSleepFormWakeStr,
  sleepDurationLabel,
  onSave,
}) {
  if (sleepModal == null) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.85)',
        zIndex: 100025,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{
          background: '#1a1a20',
          color: '#fff',
          padding: '24px',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '380px',
          border: '1px solid #333',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 8px 0', color: '#4ba3e3', fontSize: '1.05rem' }}>
          {sleepModal.editingId ? 'Modifica sonno' : 'Registra sonno'}
        </h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.45 }}>
          Inserisci ora di addormentamento e di risveglio; la durata si calcola automaticamente (anche oltre mezzanotte).
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '6px', fontWeight: 600 }}>
              Ora in cui ti sei addormentato
            </label>
            <input
              type="time"
              value={sleepFormBedStr}
              onChange={(e) => setSleepFormBedStr(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                background: '#111',
                border: '1px solid #444',
                color: '#fff',
                fontSize: '1rem',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', color: '#aaa', fontSize: '0.75rem', marginBottom: '6px', fontWeight: 600 }}>
              Ora del risveglio
            </label>
            <input
              type="time"
              value={sleepFormWakeStr}
              onChange={(e) => setSleepFormWakeStr(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                background: '#111',
                border: '1px solid #444',
                color: '#fff',
                fontSize: '1rem',
              }}
            />
          </div>
        </div>
        <div
          style={{
            marginBottom: '18px',
            padding: '12px',
            borderRadius: '10px',
            background: 'rgba(75, 163, 227, 0.12)',
            border: '1px solid rgba(75, 163, 227, 0.35)',
            fontSize: '0.9rem',
            color: '#e2e8f0',
          }}
        >
          Durata stimata: <strong style={{ color: '#4ba3e3' }}>{sleepDurationLabel}</strong>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              background: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onSave}
            style={{
              flex: 1,
              padding: '12px',
              background: '#4ba3e3',
              color: '#000',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
