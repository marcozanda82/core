import React from 'react';

export default function SpieInfoOverlay({ showSpieInfo, onClose }) {
  if (!showSpieInfo) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100020, padding: '15px' }} onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: '25px', padding: '20px', width: '100%', maxWidth: '350px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 10px 50px rgba(0,0,0,0.9)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 15px 0', color: '#00e5ff', fontSize: '1rem', letterSpacing: '2px', textAlign: 'center' }}>TELEMETRIA SISTEMA</h3>

        <div style={{ marginBottom: '12px' }}>
          <strong style={{ color: '#00e676', fontSize: '0.9rem' }}>🟢 Micro OK:</strong>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#aaa', lineHeight: '1.4' }}>Vitamine e minerali essenziali sono coperti dai pasti inseriti.</p>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <strong style={{ color: '#ff9800', fontSize: '0.9rem' }}>🟠 Livelli Serali:</strong>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#aaa', lineHeight: '1.4' }}>Stato del serbatoio energetico. Previene il rischio di picchi di cortisolo.</p>
        </div>

        <div>
          <strong style={{ color: '#00e5ff', fontSize: '0.9rem' }}>🔥 Deficit / Surplus:</strong>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#aaa', lineHeight: '1.4' }}>Il bilancio istantaneo rispetto al tuo target di calorie giornaliere.</p>
        </div>

        <button onClick={onClose} style={{ width: '100%', marginTop: '20px', background: '#333', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0 }}>CHIUDI</button>
      </div>
    </div>
  );
}
