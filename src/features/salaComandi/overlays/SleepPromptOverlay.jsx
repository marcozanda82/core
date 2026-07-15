import React from 'react';

const STAR_LABELS = ['Pessima', 'Scarsa', 'Discreta', 'Buona', 'Ottima'];

function formatTodayLabel(trackerDate) {
  const raw = String(trackerDate || '').trim();
  const parsed = raw
    ? new Date(`${raw}T12:00:00`)
    : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }
  return parsed.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

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

/**
 * Modulo rapido sonno — risveglio, durata stimata, note e qualità.
 */
export default function SleepPromptOverlay({
  showSleepPrompt,
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
  onUseAverage,
}) {
  if (!showSleepPrompt) return null;

  const dateLabel = formatTodayLabel(trackerDate);

  return (
    <div
      className="sleepPromptModal sleep-quick-modal-overlay"
      onClick={onClose}
    >
      <div
        className="sleepPromptCard sleep-quick-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '1.15rem', fontWeight: 700 }}>
          Com&apos;è andata la notte?
        </h3>
        <p style={{ margin: '0 0 18px 0', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.45 }}>
          Dimmi quando ti sei svegliato e quanto hai dormito — niente calcoli mentali. ({dateLabel})
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
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={1}
                  value={sleepFormDurationHours}
                  onChange={(e) => setSleepFormDurationHours(e.target.value)}
                  style={fieldStyle}
                  aria-label="Ore di sonno"
                />
                <span style={{ display: 'block', marginTop: '4px', fontSize: '0.68rem', color: '#64748b' }}>Ore</span>
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  min={0}
                  max={59}
                  step={5}
                  value={sleepFormDurationMinutes}
                  onChange={(e) => setSleepFormDurationMinutes(e.target.value)}
                  style={fieldStyle}
                  aria-label="Minuti di sonno"
                />
                <span style={{ display: 'block', marginTop: '4px', fontSize: '0.68rem', color: '#64748b' }}>Minuti</span>
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Risvegli / Note</label>
            <textarea
              value={sleepFormNotes}
              onChange={(e) => setSleepFormNotes(e.target.value)}
              placeholder='Es. "Svegliato un&apos;ora alle 3", "2 risvegli"'
              rows={3}
              style={{
                ...fieldStyle,
                resize: 'vertical',
                minHeight: '72px',
                fontFamily: 'inherit',
                lineHeight: 1.4,
              }}
            />
          </div>

          <div>
            <label style={{ ...labelStyle, marginBottom: '8px' }}>Qualità del sonno</label>
            <div className="sleep-quality-stars" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5].map((star) => {
                const active = Number(sleepFormQuality) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setSleepFormQuality?.(star)}
                    aria-label={`${star} stelle — ${STAR_LABELS[star - 1]}`}
                    style={{
                      flex: '1 1 0',
                      minWidth: '48px',
                      padding: '10px 6px',
                      borderRadius: '10px',
                      border: active ? '1px solid rgba(250, 204, 21, 0.65)' : '1px solid #334155',
                      background: active ? 'rgba(250, 204, 21, 0.12)' : '#0f1115',
                      color: active ? '#fde047' : '#64748b',
                      fontSize: '1.1rem',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    ★
                  </button>
                );
              })}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
              {STAR_LABELS[Math.max(0, Math.min(4, Number(sleepFormQuality) - 1))] || 'Seleziona una valutazione'}
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
            lineHeight: 1.45,
          }}
        >
          <div>
            Durata: <strong style={{ color: '#22d3ee' }}>{sleepDurationLabel}</strong>
          </div>
          {computedBedtimeLabel ? (
            <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
              Addormentamento stimato: <strong style={{ color: '#cbd5e1' }}>{computedBedtimeLabel}</strong>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: onUseAverage ? '10px' : 0 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px',
              background: '#1e293b',
              color: '#e2e8f0',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Dopo
          </button>
          <button
            type="button"
            onClick={onSave}
            style={{
              flex: 1,
              padding: '12px',
              background: '#22d3ee',
              color: '#0f172a',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Salva
          </button>
        </div>

        {onUseAverage ? (
          <button
            type="button"
            onClick={onUseAverage}
            style={{
              width: '100%',
              padding: '10px',
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: '10px',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Usa valori medi (sveglia 07:00 · 8h)
          </button>
        ) : null}
      </div>
    </div>
  );
}
