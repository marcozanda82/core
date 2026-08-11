import React, { useMemo } from 'react';
import { KentuButton } from './kentuos/KentuOSUI';
import AmountStepper from '../features/mealBuilder/components/AmountStepper';

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

function computeMealTotals(items) {
  return (items || []).reduce(
    (acc, item) => ({
      kcal: acc.kcal + (Number(item?.kcal) || 0),
      pro: acc.pro + (Number(item?.pro) || 0),
      carbo: acc.carbo + (Number(item?.carbo) || 0),
      fat: acc.fat + (Number(item?.fat) || 0),
    }),
    { kcal: 0, pro: 0, carbo: 0, fat: 0 },
  );
}

/**
 * Vassoio dinamico in chat: bozza pasto con stepper +/- e totali.
 */
export default function MealDraftTrayBubble({
  mealDraft,
  draftId,
  onConfirm,
  onCancel,
  onRemoveItem,
  onUpdateGrams,
  onUpdateMealMeta,
}) {
  const payload = mealDraft?.payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const mealTypeValue = normalizeMealTypeValue(payload.mealType);
  const timeValue = normalizeTimeValue(payload.exactTime, payload.timeString);
  const hasEstimatedWeights = items.some((item) => item?.isEstimated === true);

  const totals = useMemo(() => computeMealTotals(items), [items]);

  if (!items.length) return null;

  return (
    <div className="kentu-meal-tray" role="group" aria-label="Bozza pasto">
      <div className="kentu-meal-tray__header">
        <span className="kentu-meal-tray__badge">Vassoio</span>
        <div className="kentu-meal-tray__meta">
          <label className="kentu-meal-tray__meta-field">
            <span className="kentu-meal-tray__meta-label">Pasto</span>
            <select
              className="kentu-meal-tray__select"
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
          <label className="kentu-meal-tray__meta-field">
            <span className="kentu-meal-tray__meta-label">Orario</span>
            <input
              type="time"
              className="kentu-meal-tray__time-input"
              value={timeValue}
              onChange={(e) => onUpdateMealMeta?.(draftId, { exactTime: e.target.value })}
              aria-label="Orario del pasto"
            />
          </label>
        </div>
      </div>

      {hasEstimatedWeights ? (
        <p className="kentu-meal-tray__estimate-banner" role="status">
          ⚠️ Pesi stimati: regola le quantità prima di confermare.
        </p>
      ) : null}

      <ul className="kentu-meal-tray__list">
        {items.map((item, index) => {
          const name = String(item.foodName || item.name || 'Alimento').trim();
          const icon = String(item?.icon || '').trim() || '🍽️';
          const grams = Math.max(1, Math.round(Number(item.grams ?? item.qty) || 0));
          const kcal = Math.round(Number(item?.kcal) || 0);
          const isEstimated = item?.isEstimated === true;

          return (
            <li
              key={`${draftId}_${index}_${name}`}
              className={`kentu-meal-tray__row${isEstimated ? ' kentu-meal-tray__row--estimated' : ''}`}
            >
              <div className="kentu-meal-tray__row-info">
                <span className="kentu-meal-tray__icon" aria-hidden>{icon}</span>
                <div className="kentu-meal-tray__row-text">
                  <span className="kentu-meal-tray__name">{name}</span>
                  <span className="kentu-meal-tray__kcal">
                    {kcal > 0 ? `${kcal} kcal` : '— kcal'}
                    {isEstimated ? (
                      <span className="kentu-meal-tray__estimate-tag" title="Peso stimato">stima</span>
                    ) : null}
                  </span>
                </div>
              </div>
              <div className="kentu-meal-tray__row-controls">
                <AmountStepper
                  variant="kentu"
                  size="sm"
                  unitLabel="g"
                  step={5}
                  min={1}
                  value={grams}
                  className="kentu-meal-tray__stepper"
                  onChange={(nextGrams) => {
                    const parsed = Math.max(1, Math.round(Number(nextGrams) || 0));
                    onUpdateGrams?.(index, parsed);
                  }}
                />
                {typeof onRemoveItem === 'function' ? (
                  <button
                    type="button"
                    className="kentu-meal-tray__remove"
                    onClick={() => onRemoveItem(draftId, index)}
                    aria-label={`Rimuovi ${name}`}
                    title="Rimuovi"
                  >
                    🗑
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="kentu-meal-tray__totals" aria-label="Totali pasto">
        <span>{Math.round(totals.kcal)} kcal</span>
        <span>P {Math.round(totals.pro)}g</span>
        <span>C {Math.round(totals.carbo)}g</span>
        <span>G {Math.round(totals.fat)}g</span>
      </div>

      <div className="kentu-meal-tray__footer">
        <KentuButton
          variant="primary"
          className="kentu-meal-tray__confirm"
          onClick={() => onConfirm?.(draftId)}
        >
          Conferma
        </KentuButton>
        <KentuButton
          variant="secondary"
          className="kentu-meal-tray__cancel"
          onClick={() => onCancel?.(draftId)}
        >
          Annulla
        </KentuButton>
      </div>
    </div>
  );
}
