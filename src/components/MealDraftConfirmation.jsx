import React, { useState } from 'react';
import { KentuButton } from './kentuos/KentuOSUI';
import { buildFoodNameSelectOptions } from '../features/commandTerminal/conversation/recentFoodNames.js';

const MEAL_OPTIONS = [
  { value: 'colazione', label: 'Colazione' },
  { value: 'pranzo', label: 'Pranzo' },
  { value: 'cena', label: 'Cena' },
  { value: 'snack', label: 'Snack' },
];

function normalizeMealTypeValue(mealType) {
  const base = String(mealType || '').split('_')[0].trim().toLowerCase();
  return MEAL_OPTIONS.some((opt) => opt.value === base) ? base : 'pranzo';
}

function normalizeTimeValue(exactTime, timeString) {
  const raw = String(exactTime || timeString || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '12:00';
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

/**
 * Bozza interattiva in chat: tipo pasto, orario, alimenti, conferma o annulla.
 */
export default function MealDraftConfirmation({
  mealDraft,
  draftId,
  onConfirm,
  onCancel,
  onRemoveItem,
  onUpdateItemGrams,
  onUpdateMealMeta,
  onUpdateFoodItemName,
}) {
  const payload = mealDraft?.payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const [editingIndex, setEditingIndex] = useState(null);
  const [editGrams, setEditGrams] = useState('');

  const mealTypeValue = normalizeMealTypeValue(payload.mealType);
  const timeValue = normalizeTimeValue(payload.exactTime, payload.timeString);

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
        <div className="kentu-meal-draft__meta">
          <label className="kentu-meal-draft__meta-field">
            <span className="kentu-meal-draft__meta-label">Pasto</span>
            <select
              className="kentu-meal-draft__select"
              value={mealTypeValue}
              onChange={(e) => onUpdateMealMeta?.(draftId, { mealType: e.target.value })}
              aria-label="Tipo di pasto"
            >
              {MEAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="kentu-meal-draft__meta-field">
            <span className="kentu-meal-draft__meta-label">Orario</span>
            <input
              type="time"
              className="kentu-meal-draft__time-input"
              value={timeValue}
              onChange={(e) => onUpdateMealMeta?.(draftId, { exactTime: e.target.value })}
              aria-label="Orario del pasto"
            />
          </label>
        </div>
      </div>

      <ul className="kentu-meal-draft__list">
        {items.map((item, index) => {
          const name = String(item.foodName || item.name || 'Alimento').trim();
          const grams = Math.round(Number(item.grams ?? item.qty) || 0);
          const isEditing = editingIndex === index;
          const nameOptions = buildFoodNameSelectOptions(
            name,
            Array.isArray(item?.historicalVariations) ? item.historicalVariations : [],
          );

          return (
            <li key={`${draftId}_${index}_${name}`} className="kentu-meal-draft__row">
              <div className="kentu-meal-draft__row-main">
                <label className="kentu-meal-draft__food-field">
                  <span className="kentu-meal-draft__meta-label">Alimento</span>
                  <select
                    className="kentu-meal-draft__select kentu-meal-draft__food-select"
                    value={name}
                    onChange={(e) => onUpdateFoodItemName?.(draftId, index, e.target.value)}
                    aria-label={`Alimento ${index + 1}`}
                  >
                    {nameOptions.map((optionName) => (
                      <option key={`${draftId}_${index}_${optionName}`} value={optionName}>
                        {optionName}
                      </option>
                    ))}
                  </select>
                </label>
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
