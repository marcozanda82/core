import React from 'react';

export default function PesataDrawer({
  showWeightModal,
  setShowWeightModal,
  inputWeight,
  setInputWeight,
  inputFat,
  setInputFat,
  drawerMuscleMass,
  setDrawerMuscleMass,
  drawerBodyWater,
  setDrawerBodyWater,
  drawerVisceralFat,
  setDrawerVisceralFat,
  handleSaveBodyMetrics,
}) {
  return showWeightModal && (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100020, padding: '20px' }} onClick={() => { setShowWeightModal(false); }}>
      <div style={{ background: '#1a1a1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '22px', width: '100%', maxWidth: '380px', boxShadow: '0 12px 48px rgba(0,0,0,0.75)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 6px 0', color: '#fff', fontSize: '1.05rem', letterSpacing: '0.5px' }}>Aggiorna Composizione</h3>
        <p style={{ margin: '0 0 18px 0', fontSize: '0.8rem', color: '#888' }}>Registra peso e, se vuoi, massa grassa. Lo storico è salvato nel database.</p>
        <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '6px' }}>Peso (kg) *</label>
        <input type="number" step="0.1" min="0.1" inputMode="decimal" value={inputWeight} onChange={(e) => setInputWeight(e.target.value)} placeholder="es. 75.5" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', marginBottom: '14px', borderRadius: '12px', border: '1px solid #333', background: '#0d0d0f', color: '#fff', fontSize: '1rem' }} />
        <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '6px' }}>Massa grassa (% — opzionale)</label>
        <input type="number" step="0.1" min="0" max="100" inputMode="decimal" value={inputFat} onChange={(e) => setInputFat(e.target.value)} placeholder="es. 18.5" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', marginBottom: '20px', borderRadius: '12px', border: '1px solid #333', background: '#0d0d0f', color: '#fff', fontSize: '1rem' }} />
        <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '6px' }}>Massa Muscolare (%)</label>
        <input type="number" step="0.1" min="0" max="100" inputMode="decimal" value={drawerMuscleMass} onChange={(e) => setDrawerMuscleMass(e.target.value)} placeholder="es. 42.0" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', marginBottom: '12px', borderRadius: '999px', border: '1px solid #3b82f6', background: '#0d0d0f', color: '#fff', fontSize: '1rem', fontWeight: 'bold' }} />
        <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '6px' }}>Acqua Corporea (%)</label>
        <input type="number" step="0.1" min="0" max="100" inputMode="decimal" value={drawerBodyWater} onChange={(e) => setDrawerBodyWater(e.target.value)} placeholder="es. 55.0" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', marginBottom: '12px', borderRadius: '999px', border: '1px solid #06b6d4', background: '#0d0d0f', color: '#fff', fontSize: '1rem', fontWeight: 'bold' }} />
        <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '6px' }}>Grasso Viscerale (Indice)</label>
        <input type="number" step="0.1" min="0" inputMode="decimal" value={drawerVisceralFat} onChange={(e) => setDrawerVisceralFat(e.target.value)} placeholder="es. 9" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', marginBottom: '20px', borderRadius: '999px', border: '1px solid #f59e0b', background: '#0d0d0f', color: '#fff', fontSize: '1rem', fontWeight: 'bold' }} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" onClick={() => { setShowWeightModal(false); }} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #444', background: 'transparent', color: '#aaa', fontWeight: 'bold', cursor: 'pointer' }}>Annulla</button>
          <button type="button" onClick={() => { handleSaveBodyMetrics(); }} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#00e5ff', color: '#000', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 20px rgba(0,229,255,0.35)' }}>Salva</button>
        </div>
      </div>
    </div>
  );
}
