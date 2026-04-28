import React from 'react';

export default function ReportModalOverlay({
  showReportModal,
  dailyReport,
  dailyReportDisplay,
  onClose,
  currentDateObj,
  setTrendModalMetric,
}) {
  if (!(showReportModal && dailyReport?.ready && dailyReportDisplay)) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100020, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: '20px', padding: '25px', maxWidth: '380px', width: '100%', position: 'relative', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '8px', borderBottom: '1px solid #222', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#ffc107' }}>★</span> Report Giornaliero
        </h3>
        <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '20px' }}>
          {currentDateObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        {[
          { key: 'muscle', label: 'Crescita Muscolare', emoji: '💪' },
          { key: 'fat', label: 'Perdita di Grasso', emoji: '🔥' },
          { key: 'neuro', label: 'Recupero Neurologico', emoji: '🧠' },
          { key: 'fast', label: 'Pulizia Cellulare (Digiuno)', emoji: '🕐' }
        ].map(({ key, label, emoji }) => {
          const item = dailyReportDisplay[key];
          const score = typeof item === 'object' && item != null && 'score' in item ? item.score : (Number(item) || 0);
          const reason = typeof item === 'object' && item != null && 'reason' in item ? item.reason : '';
          return (
            <div key={key} style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span>{emoji} {label}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setTrendModalMetric(key); }}
                  style={{ background: 'transparent', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', padding: '4px 8px', marginLeft: '10px' }}
                  title="Vedi Trend Storico"
                >
                  📈
                </button>
              </div>
              <div style={{ display: 'flex', gap: '2px' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} style={{ color: n <= score ? '#ffc107' : '#333', fontSize: '1.1rem' }}>★</span>
                ))}
              </div>
              {reason ? (
                <div style={{ fontSize: '0.85rem', color: '#888', fontStyle: 'italic', marginTop: '4px', lineHeight: '1.2' }}>
                  {reason}
                </div>
              ) : null}
            </div>
          );
        })}
        <button onClick={onClose} style={{ background: '#00e5ff', color: '#000', border: 'none', padding: '12px', width: '100%', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}>
          Chiudi
        </button>
      </div>
    </div>
  );
}
