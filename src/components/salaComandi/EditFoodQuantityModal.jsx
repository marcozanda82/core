/**
 * Modale modifica grammi di un alimento già nel diario / simulazione.
 */

import { useEffect, useState } from 'react';

export default function EditFoodQuantityModal({
  selectedFoodForEdit = null,
  initialQuantity = '',
  onClose = null,
  onConfirm = null,
}) {
  const [quantityValue, setQuantityValue] = useState(initialQuantity);

  useEffect(() => {
    if (selectedFoodForEdit) {
      setQuantityValue(initialQuantity ?? '');
    }
  }, [selectedFoodForEdit, initialQuantity]);

  if (!selectedFoodForEdit) return null;

  const foodLabel = selectedFoodForEdit.food?.desc || selectedFoodForEdit.food?.name;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}
      onClick={() => onClose?.()}
    >
      <div
        style={{ background: '#111', border: '1px solid #333', borderRadius: '16px', maxWidth: '340px', width: '100%', padding: '20px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#00e676' }}>Modifica quantità</h3>
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer' }}
            onClick={() => onClose?.()}
          >
            ✕
          </button>
        </div>
        <p style={{ fontSize: '0.85rem', color: '#ccc', marginBottom: '8px' }}>{foodLabel}</p>
        <input
          type="number"
          min="1"
          step="1"
          inputMode="decimal"
          value={quantityValue}
          onChange={(e) => setQuantityValue(e.target.value)}
          style={{ width: '100%', padding: '12px', background: '#222', border: '1px solid #444', borderRadius: '8px', color: '#fff', fontSize: '1rem', marginBottom: '16px' }}
          placeholder="Grammi"
        />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            style={{ padding: '10px 18px', background: '#333', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            onClick={() => onClose?.()}
          >
            Annulla
          </button>
          <button
            type="button"
            style={{ padding: '10px 18px', background: '#00e676', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={() => {
              const qta = parseFloat(quantityValue);
              if (!Number.isFinite(qta) || qta <= 0) return;
              onConfirm?.(qta, selectedFoodForEdit);
            }}
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
