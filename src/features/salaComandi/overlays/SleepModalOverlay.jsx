import React from 'react';

const STAR_LABELS = ['Pessima', 'Scarsa', 'Discreta', 'Buona', 'Ottima'];

const fieldStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '10px',
  background: '#0f1115',
  border: '1px solid #334155',
  color: '#fff',
  fontSize: '1rem',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  color: '#cbd5e1',
  fontSize: '0.75rem',
  marginBottom: '6px',
  fontWeight: 600,
};

export default function SleepModalOverlay({
  sleepModal,
  onClose,
  trackerDate,
  sleepFormWakeStr,
  setSleepFormWakeStr,
  sleepFormDurationHours = 7,
  setSleepFormDurationHours,
  sleepFormDurationMinutes = 0,
  setSleepFormDurationMinutes,
  sleepFormNotes = '',
  setSleepFormNotes,
  sleepFormQuality = 3,
  setSleepFormQuality,
  sleepDurationLabel,
  computedBedtimeLabel,
  onSave,
}) {
  if (sleepModal == null) return null;

  const title = sleepModal.editingId ? 'Modifica sonno' : 'Registra sonno';
  const dateLabel = (() => {
    const raw = String(trackerDate || '').trim();
    const parsed = raw ? new Date(`${raw}T12:00:00`) : new Date();
    if (Number.isNaN(parsed.getTime())) return raw || 'oggi';
    return parsed.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  })();

  return (
    <div
      className="modal-overlay sleep-quick-modal-overlay"
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
        className="modal-content sleep-quick-modal"
        style={{
          background: '#12141a',
          color: '#fff',
          padding: '24px',
          borderRadius: '18px',
          width: '100%',
          maxWidth: '380px',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '1.15rem', fontWeight: 700 }}>
          {title}
        </h3>
        <p style={{ margin: '0 0 18px 0', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.45 }}>
          Aggiorna risveglio, durata e note per {dateLabel}.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Ora risveglio</label>
            <input
              type="time"
              value={sleepFormWakeStr}
              onChange={(e) => setSleepFormWakeStr(e.target.value)}
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Durata stimata</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="number"
                min={0}
                max={24}
                value={sleepFormDurationHours}
                onChange={(e) => setSleepFormDurationHours(e.target.value)}
                style={fieldStyle}
                aria-label="Ore"
              />
              <input
                type="number"
                min={0}
                max={59}
                value={sleepFormDurationMinutes}
                onChange={(e) => setSleepFormDurationMinutes(e.target.value)}
                style={fieldStyle}
                aria-label="Minuti"
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Risvegli / Note</label>
            <textarea
              value={sleepFormNotes}
              onChange={(e) => setSleepFormNotes(e.target.value)}
              rows={3}
              style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <div>
            <label style={{ ...labelStyle, marginBottom: '8px' }}>Qualità del sonno</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[1, 2, 3, 4, 5].map((star) => {
                const active = Number(sleepFormQuality) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setSleepFormQuality?.(star)}
                    style={{
                      flex: 1,
                      padding: '10px 6px',
                      borderRadius: '10px',
                      border: active ? '1px solid rgba(250, 204, 21, 0.65)' : '1px solid #334155',
                      background: active ? 'rgba(250, 204, 21, 0.12)' : '#0f1115',
                      color: active ? '#fde047' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    ★
                  </button>
                );
              })}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
              {STAR_LABELS[Math.max(0, Math.min(4, Number(sleepFormQuality) - 1))]}
            </p>
          </div>
        </div>

        <div
          style={{
            marginBottom: '18px',
            padding: '12px',
            borderRadius: '10px',
            background: 'rgba(34, 211, 238, 0.08)',
            border: '1px solid rgba(34, 211, 238, 0.28)',
            fontSize: '0.85rem',
            color: '#e2e8f0',
          }}
        >
          Durata: <strong style={{ color: '#22d3ee' }}>{sleepDurationLabel}</strong>
          {computedBedtimeLabel ? (
            <span style={{ display: 'block', marginTop: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
              Addormentamento stimato: {computedBedtimeLabel}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px', background: '#1e293b', color: '#e2e8f0', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
            Annulla
          </button>
          <button type="button" onClick={onSave} style={{ flex: 1, padding: '12px', background: '#22d3ee', color: '#0f172a', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
