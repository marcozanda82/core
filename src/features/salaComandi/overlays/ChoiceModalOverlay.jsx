import React from 'react';
import AddEventMenuGrid from '../../../components/AddEventMenuGrid';

export default function ChoiceModalOverlay({
  showChoiceModal,
  onClose,
  addChoiceView,
  onBackToMain,
  stimulantSubtype,
  setStimulantSubtype,
  stimulantTime,
  setStimulantTime,
  onSaveStimulant,
  addEventMenuOrder,
  commitAddEventMenuOrder,
  handleAddEventMenuItem,
}) {
  if (!showChoiceModal) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100020, padding: '15px' }} onClick={onClose}>
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: '25px', padding: '20px', width: '100%', maxWidth: '350px', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 10px 50px rgba(0,0,0,0.9)' }} onClick={(e) => e.stopPropagation()}>
        {addChoiceView === 'stimulant' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <button type="button" onClick={onBackToMain} style={{ background: 'none', border: 'none', color: '#888', fontSize: '0.9rem', cursor: 'pointer' }}>← Indietro</button>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1rem', letterSpacing: '1px' }}>☕ Sostanza energizzante</h3>
              <div style={{ width: '70px' }} />
            </div>
            <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#aaa' }}>Tipo</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['caffè', 'tè', 'energy drink'].map((sub) => (
                <button key={sub} type="button" onClick={() => setStimulantSubtype(sub)} style={{ flex: 1, padding: '10px', borderRadius: '12px', border: stimulantSubtype === sub ? '2px solid #f59e0b' : '1px solid #333', background: stimulantSubtype === sub ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)', color: stimulantSubtype === sub ? '#f59e0b' : '#fff', fontSize: '0.85rem', fontWeight: stimulantSubtype === sub ? 'bold' : 'normal', cursor: 'pointer' }}>
                  {sub === 'caffè' ? '☕ Caffè' : sub === 'tè' ? '🍵 Tè' : '🥤 Energy'}
                </button>
              ))}
            </div>
            <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#aaa' }}>Orario</p>
            <input type="range" min={0} max={24} step={0.25} value={stimulantTime} onChange={(e) => setStimulantTime(Number(e.target.value))} style={{ width: '100%', marginBottom: '8px' }} />
            <span style={{ fontSize: '0.9rem', color: '#00e5ff', marginBottom: '16px' }}>{Math.floor(stimulantTime)}:{String(Math.round((stimulantTime % 1) * 60)).padStart(2, '0')}</span>
            <button type="button" onClick={onSaveStimulant} style={{ padding: '14px', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>
              Salva
            </button>
          </>
        ) : (
          <AddEventMenuGrid
            menuOrder={addEventMenuOrder}
            onOrderCommit={commitAddEventMenuOrder}
            onItemActivate={(id) => handleAddEventMenuItem(id, 'modal')}
            title="AGGIUNGI EVENTO"
            headingStyle={{ marginBottom: 0 }}
          />
        )}
      </div>
    </div>
  );
}
