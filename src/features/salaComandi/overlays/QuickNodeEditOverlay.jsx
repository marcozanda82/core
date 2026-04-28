import React from 'react';

export default function QuickNodeEditOverlay({
  editingQuickNode,
  onClose,
  defaultStartValue,
  defaultEndValue,
  onDelete,
  onSave,
}) {
  if (!editingQuickNode) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100020, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '12px', width: '90%', maxWidth: '350px', border: '1px solid #333' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '20px', textAlign: 'center' }}>
          Modifica {editingQuickNode.name || (editingQuickNode.type === 'nap' ? 'Pisolino' : editingQuickNode.type === 'meditation' ? 'Meditazione' : 'Attività')}
        </h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ width: '45%' }}>
            <label style={{ display: 'block', color: '#aaa', fontSize: '0.8rem', marginBottom: '5px' }}>Ora Inizio</label>
            <input
              type="time"
              defaultValue={defaultStartValue}
              id="quick-start-time"
              style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#333', color: '#fff', border: 'none' }}
            />
          </div>
          <div style={{ width: '45%' }}>
            <label style={{ display: 'block', color: '#aaa', fontSize: '0.8rem', marginBottom: '5px' }}>Ora Fine</label>
            <input
              type="time"
              defaultValue={defaultEndValue}
              id="quick-end-time"
              style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#333', color: '#fff', border: 'none' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onDelete}
            style={{ flex: 1, padding: '12px', background: '#ff3b30', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
          >
            Elimina
          </button>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '12px', background: '#333', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
          >
            Annulla
          </button>
          <button
            onClick={onSave}
            style={{ flex: 1, padding: '12px', background: '#00e5ff', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
