import React from 'react';

/**
 * Modifica valori nutrizionali di un alimento dal log (ispezione / edit inline).
 */
export default function FoodInspectorModal({
  inspectedFood,
  editFoodData,
  setEditFoodData,
  isAIVerifying,
  onVerifyAI,
  onSave,
  onCancel,
}) {
  if (!inspectedFood || !editFoodData) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100020, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px', backdropFilter: 'blur(5px)' }}>
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: '20px', padding: '20px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '5px', textAlign: 'center' }}>
          {editFoodData.name || editFoodData.nome || editFoodData.desc || 'Alimento'}
        </h3>
        <div style={{ textAlign: 'center', color: '#888', fontSize: '0.8rem', marginBottom: '20px' }}>
          Modifica i valori nutrizionali
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ color: '#aaa', fontSize: '0.8rem', marginBottom: '5px' }}>Quantità (g/ml)</label>
            <input type="number" value={editFoodData.qty ?? editFoodData.quantita ?? editFoodData.weight ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, qty: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '8px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ color: '#aaa', fontSize: '0.8rem', marginBottom: '5px' }}>Calorie (kcal)</label>
            <input type="number" value={editFoodData.kcal ?? editFoodData.calorie ?? editFoodData.cal ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, kcal: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '8px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ color: '#b388ff', fontSize: '0.8rem', marginBottom: '5px' }}>Proteine (g)</label>
            <input type="number" value={editFoodData.prot ?? editFoodData.proteine ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, prot: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #b388ff55', color: '#fff', padding: '10px', borderRadius: '8px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ color: '#00e676', fontSize: '0.8rem', marginBottom: '5px' }}>Carboidrati (g)</label>
            <input type="number" value={editFoodData.carb ?? editFoodData.carboidrati ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, carb: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #00e67655', color: '#fff', padding: '10px', borderRadius: '8px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ color: '#ffea00', fontSize: '0.8rem', marginBottom: '5px' }}>Grassi (g)</label>
            <input type="number" value={editFoodData.fat ?? editFoodData.grassi ?? editFoodData.fatTotal ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, fat: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #ffea0055', color: '#fff', padding: '10px', borderRadius: '8px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ color: '#f97316', fontSize: '0.8rem', marginBottom: '5px' }}>Fibre (g)</label>
            <input type="number" value={editFoodData.fibre ?? 0} onChange={(e) => setEditFoodData({ ...editFoodData, fibre: Number(e.target.value) })} style={{ background: '#222', border: '1px solid #f9731655', color: '#fff', padding: '10px', borderRadius: '8px' }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            onClick={onSave}
            style={{ background: '#00e5ff', color: '#000', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
          >
            💾 Salva Modifiche
          </button>
          <button
            type="button"
            onClick={onVerifyAI}
            disabled={isAIVerifying}
            style={{ background: '#2a2a2a', color: isAIVerifying ? '#888' : '#00e5ff', border: `1px solid ${isAIVerifying ? '#444' : '#00e5ff'}`, padding: '14px', borderRadius: '10px', fontWeight: 'bold', fontSize: '1rem', cursor: isAIVerifying ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', gap: '8px', transition: 'all 0.3s' }}
          >
            {isAIVerifying ? (
              '⏳ Analisi in corso...'
            ) : (
              <>
                <img src="/nuova-icona.png" alt="" width={20} height={20} decoding="async" style={{ objectFit: 'contain' }} />
                Verifica Correttezza (AI)
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{ background: 'transparent', color: '#888', border: 'none', padding: '12px', borderRadius: '10px', fontSize: '0.9rem', cursor: 'pointer', marginTop: '5px' }}
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
