import React, { useState } from 'react';
import { KentuButton } from './kentuos/KentuOSUI';
import { buildFoodNameSelectOptions } from '../features/commandTerminal/conversation/recentFoodNames.js';
import { clampFoodGrams } from '../utils/inputSanity';
import { getFoodIcon } from '../utils/getFoodIcon';
import { withMealSavingOverlay } from '../utils/mealSavingOverlayController';

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
 * isEstimated=true → peso ambra + icona avviso (stima AI da unita/pezzi).
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
  onAddFood,
}) {
  const payload = mealDraft?.payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const [editingIndex, setEditingIndex] = useState(null);
  const [editGrams, setEditGrams] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const mealTypeValue = normalizeMealTypeValue(payload.mealType);
  const timeValue = normalizeTimeValue(payload.exactTime, payload.timeString);
  const hasEstimatedWeights = items.some((item) => item?.isEstimated === true);

  if (!items.length) return null;

  const startEdit = (index, currentGrams) => {
    setEditingIndex(index);
    setEditGrams(String(currentGrams || ''));
  };

  const commitEdit = (index) => {
    const grams = clampFoodGrams(editGrams);
    if (grams == null || grams <= 0) return;
    onUpdateItemGrams?.(draftId, index, grams);
    setEditingIndex(null);
    setEditGrams('');
  };

  const handleConfirmClick = async () => {
    if (isSaving) return;
    try {
      await withMealSavingOverlay(async () => {
        setIsSaving(true);
        await Promise.resolve(onConfirm?.(draftId));
      });
    } catch (err) {
      console.error('[MealDraftConfirmation] salvataggio fallito', err);
      setIsSaving(false);
    }
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
              disabled={isSaving}
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
              disabled={isSaving}
              onChange={(e) => onUpdateMealMeta?.(draftId, { exactTime: e.target.value })}
              aria-label="Orario del pasto"
            />
          </label>
        </div>
      </div>

      {hasEstimatedWeights ? (
        <p className="kentu-meal-draft__estimate-banner" role="status">
          ⚠️ Pesi stimati (valori medi): controlla e correggi prima di confermare.
        </p>
      ) : null}

      <ul className="kentu-meal-draft__list">
        {items.map((item, index) => {
          const name = String(item.foodName || item.name || 'Alimento').trim();
          const grams = Math.round(Number(item.grams ?? item.qty) || 0);
          const isEstimated = item?.isEstimated === true;
          const isEditing = editingIndex === index;
          const icon = String(item?.icon || '').trim()
            || getFoodIcon(name, {
              kcal: item?.kcal,
              prot: item?.pro ?? item?.prot,
              carb: item?.carbo ?? item?.carb,
              fat: item?.fat,
            });
          const nameOptions = buildFoodNameSelectOptions(
            name,
            Array.isArray(item?.historicalVariations) ? item.historicalVariations : [],
          );

          return (
            <li
              key={`${draftId}_${index}_${name}`}
              className={`kentu-meal-draft__row${isEstimated ? ' kentu-meal-draft__row--estimated' : ''}`}
            >
              <div className="kentu-meal-draft__row-main">
                <span className="kentu-meal-draft__food-icon shrink-0 text-base" aria-hidden>
                  {icon}
                </span>
                <label className="kentu-meal-draft__food-field">
                  <span className="kentu-meal-draft__meta-label">Alimento</span>
                  <select
                    className="kentu-meal-draft__select kentu-meal-draft__food-select"
                    value={name}
                    disabled={isSaving}
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
                    {isEstimated ? (
                      <span
                        className="kentu-meal-draft__estimate-icon"
                        title="Peso stimato dall'AI"
                        aria-label="Peso stimato"
                      >
                        ⚠️
                      </span>
                    ) : null}
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={editGrams}
                      onChange={(e) => setEditGrams(e.target.value)}
                      className={`kentu-meal-draft__grams-input${isEstimated ? ' kentu-meal-draft__grams-input--estimated' : ''}`}
                      aria-label={`Grammi ${name}${isEstimated ? ' (stimati)' : ''}`}
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
                  <button
                    type="button"
                    className={`kentu-meal-draft__grams${isEstimated ? ' kentu-meal-draft__grams--estimated' : ''}`}
                    onClick={() => startEdit(index, grams)}
                    disabled={isSaving}
                    title={isEstimated ? 'Peso stimato — tocca per correggere' : 'Modifica quantità'}
                    aria-label={`Grammi ${name}${isEstimated ? ' stimati' : ''}: ${grams}g. Modifica`}
                  >
                    {isEstimated ? (
                      <span className="kentu-meal-draft__estimate-icon" aria-hidden>
                        ⚠️
                      </span>
                    ) : null}
                    <span>{grams}g</span>
                    {isEstimated ? (
                      <span className="kentu-meal-draft__estimate-label">stima</span>
                    ) : null}
                  </button>
                )}
              </div>
              {!isEditing ? (
                <div className="kentu-meal-draft__actions">
                  <button
                    type="button"
                    className="kentu-meal-draft__icon-btn"
                    onClick={() => startEdit(index, grams)}
                    disabled={isSaving}
                    aria-label={`Modifica quantità ${name}`}
                    title="Modifica quantità"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="kentu-meal-draft__icon-btn kentu-meal-draft__icon-btn--danger"
                    onClick={() => onRemoveItem?.(draftId, index)}
                    disabled={isSaving}
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
        <li className="kentu-meal-draft__row kentu-meal-draft__row--add">
          <button
            type="button"
            className="kentu-meal-draft__add-food"
            disabled={isSaving}
            onClick={() => onAddFood?.(draftId)}
            style={{
              width: '100%',
              border: '1px dashed rgba(34,211,238,0.35)',
              borderRadius: 12,
              background: 'rgba(34,211,238,0.06)',
              color: '#67e8f9',
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            + Aggiungi un altro alimento
          </button>
        </li>
      </ul>

      <div className="kentu-meal-draft__footer">
        <KentuButton
          variant="primary"
          className="kentu-meal-draft__confirm"
          disabled={isSaving}
          onClick={handleConfirmClick}
        >
          {isSaving ? 'Salvataggio…' : 'Conferma inserimento'}
        </KentuButton>
        <KentuButton
          variant="secondary"
          className="kentu-meal-draft__cancel"
          disabled={isSaving}
          onClick={() => onCancel?.(draftId)}
        >
          Annulla
        </KentuButton>
      </div>
    </div>
  );
}
