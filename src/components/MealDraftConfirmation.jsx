import React, { useState } from 'react';
import { KentuButton } from './kentuos/KentuOSUI';

const MEAL_LABELS = {
  colazione: 'Colazione',
  snack: 'Snack',
  pranzo: 'Pranzo',
  cena: 'Cena',
};

function mealLabel(mealType) {
  const base = String(mealType || '').split('_')[0].toLowerCase();
  return MEAL_LABELS[base] || base || 'Pasto';
}

/**
 * Bozza interattiva in chat: lista alimenti, modifica/rimuovi, conferma o annulla.
 */
export default function MealDraftConfirmation({
  mealDraft,
  draftId,
  onConfirm,
  onCancel,
  onRemoveItem,
  onUpdateItemGrams,
}) {
  const payload = mealDraft?.payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const [editingIndex, setEditingIndex] = useState(null);
  const [editGrams, setEditGrams] = useState('');

  if (!items.length) return null;

  const startEdit = (index, currentGrams) => {
    setEditingIndex(index);
    setEditGrams(String(currentGrams || ''));
  };

  const commitEdit = (index) => {
    const grams = Math.max(1, Math.round(Number(editGrams) || 0));
    if (!Number.isFinite(grams) || grams <= 0) return;
    onUpdateItemGrams?.(draftId, index, grams);
    setEditingIndex(null);
    setEditGrams('');
  };

  return (
    <div className="kentu-meal-draft">
      <div className="kentu-meal-draft__header">
        <span className="kentu-meal-draft__badge">Bozza</span>
        <span className="kentu-meal-draft__title">
          {mealLabel(payload.mealType)}
          {payload.timeString ? ` · ${payload.timeString}` : ''}
        </span>
      </div>

      <ul className="kentu-meal-draft__list">
        {items.map((item, index) => {
          const name = String(item.foodName || item.name || 'Alimento').trim();
          const grams = Math.round(Number(item.grams ?? item.qty) || 0);
          const isEditing = editingIndex === index;

          return (
            <li key={`${draftId}_${index}_${name}`} className="kentu-meal-draft__row">
              <div className="kentu-meal-draft__row-main">
                <span className="kentu-meal-draft__name">{name}</span>
                {isEditing ? (
                  <div className="kentu-meal-draft__edit-inline">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={editGrams}
                      onChange={(e) => setEditGrams(e.target.value)}
                      className="kentu-meal-draft__grams-input"
                      aria-label={`Grammi ${name}`}
                    />
                    <span className="kentu-meal-draft__grams-suffix">g</span>
                    <button
                      type="button"
                      className="kentu-meal-draft__icon-btn kentu-meal-draft__icon-btn--ok"
                      onClick={() => commitEdit(index)}
                      aria-label="Salva quantità"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="kentu-meal-draft__icon-btn"
                      onClick={() => setEditingIndex(null)}
                      aria-label="Annulla modifica"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span className="kentu-meal-draft__grams">{grams}g</span>
                )}
              </div>
              {!isEditing ? (
                <div className="kentu-meal-draft__actions">
                  <button
                    type="button"
                    className="kentu-meal-draft__icon-btn"
                    onClick={() => startEdit(index, grams)}
                    aria-label={`Modifica quantità ${name}`}
                    title="Modifica quantità"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="kentu-meal-draft__icon-btn kentu-meal-draft__icon-btn--danger"
                    onClick={() => onRemoveItem?.(draftId, index)}
                    aria-label={`Rimuovi ${name}`}
                    title="Rimuovi"
                  >
                    🗑
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="kentu-meal-draft__footer">
        <KentuButton
          variant="primary"
          className="kentu-meal-draft__confirm"
          onClick={() => onConfirm?.(draftId)}
        >
          Conferma inserimento
        </KentuButton>
        <KentuButton
          variant="secondary"
          className="kentu-meal-draft__cancel"
          onClick={() => onCancel?.(draftId)}
        >
          Annulla
        </KentuButton>
      </div>
    </div>
  );
}
