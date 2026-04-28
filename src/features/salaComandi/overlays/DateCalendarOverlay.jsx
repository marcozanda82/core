import React from 'react';

export default function DateCalendarOverlay({
  showDateCalendarModal,
  onClose,
  calendarMonthIso,
  onPrevMonth,
  onNextMonth,
  calendarGridDays,
  calendarZoneByDate,
  currentTrackerDate,
  onSelectDate,
}) {
  if (!showDateCalendarModal) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100040,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#0b0b0c',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 16,
          padding: 14,
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button
            type="button"
            onClick={onPrevMonth}
            style={{ background: 'none', border: 'none', color: '#7dd3fc', fontSize: '1rem', cursor: 'pointer' }}
            aria-label="Mese precedente"
          >
            ◀
          </button>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
            {(() => {
              const [y, m] = calendarMonthIso.split('-').map(Number);
              return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
            })()}
          </div>
          <button
            type="button"
            onClick={onNextMonth}
            style={{ background: 'none', border: 'none', color: '#7dd3fc', fontSize: '1rem', cursor: 'pointer' }}
            aria-label="Mese successivo"
          >
            ▶
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
          {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((wd, idx) => (
            <div key={`${wd}_${idx}`} style={{ textAlign: 'center', color: '#71717a', fontSize: '0.68rem', fontWeight: 700 }}>
              {wd}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {calendarGridDays.map((iso, idx) => {
            if (!iso) return <div key={`empty_${idx}`} style={{ height: 36 }} />;
            const zone = calendarZoneByDate[iso]?.zone ?? null;
            const zoneStyle =
              zone === 'blue'
                ? { background: 'linear-gradient(180deg, #1d4ed8 0%, #0ea5e9 100%)', color: '#e0f2fe' }
                : zone === 'green'
                  ? { background: 'linear-gradient(180deg, #15803d 0%, #22c55e 100%)', color: '#ecfdf5' }
                  : zone === 'orange'
                    ? { background: 'linear-gradient(180deg, #c2410c 0%, #f59e0b 100%)', color: '#fff7ed' }
                    : zone === 'red'
                      ? { background: 'linear-gradient(180deg, #b91c1c 0%, #ef4444 100%)', color: '#fee2e2' }
                      : { background: 'rgba(255,255,255,0.04)', color: '#cbd5e1' };
            const isSelected = iso === currentTrackerDate;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSelectDate(iso)}
                style={{
                  height: 36,
                  borderRadius: 10,
                  border: isSelected ? '2px solid #e2e8f0' : '1px solid rgba(255,255,255,0.1)',
                  fontSize: '0.78rem',
                  fontWeight: isSelected ? 800 : 600,
                  cursor: 'pointer',
                  ...zoneStyle,
                }}
                title={calendarZoneByDate[iso]?.score != null ? `Score ${calendarZoneByDate[iso].score}` : iso}
              >
                {iso.slice(-2)}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: '0.64rem', color: '#94a3b8', flexWrap: 'wrap' }}>
          <span>🔵 ottimale</span>
          <span>🟢 buono</span>
          <span>🟠 warning</span>
          <span>🔴 critico</span>
        </div>
      </div>
    </div>
  );
}
