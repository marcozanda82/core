import React, { memo, useState } from 'react';
import AmountStepper from '../mealBuilder/components/AmountStepper';
import { KentuButton } from '../../components/kentuos/KentuOSUI';
import {
  EMPTY_MCDRIVE_TOTALS,
  MCDRIVE_CANCEL_CHIP,
  MCDRIVE_FINISH_CHIP,
} from '../commandTerminal/conversation/mcdriveWizard.js';

/**
 * Lavagna McDrive: vassoio interattivo (modifica grammi / elimina) + totali live.
 */
function LiveMealTray({
  tray = null,
  active = true,
  disabled = false,
  onCancel,
  onFinish,
  onRemoveItem,
  onUpdateGrams,
}) {
  const items = Array.isArray(tray?.items) ? tray.items : [];
  const totals = tray?.totals && typeof tray.totals === 'object'
    ? tray.totals
    : EMPTY_MCDRIVE_TOTALS;
  const [editingIndex, setEditingIndex] = useState(null);

  return (
    <div className="kentu-meal-tray" role="group" aria-label="Vassoio in lavorazione">
      <div className="kentu-meal-tray__header">
        <span className="kentu-meal-tray__badge">Vassoio in lavorazione</span>
      </div>

      {items.length === 0 ? (
        <p className="kentu-meal-tray__estimate-banner" role="status">
          Nessun alimento sul vassoio.
        </p>
      ) : (
        <ul className="kentu-meal-tray__list">
          {items.map((item, index) => {
            const name = String(item?.foodName || item?.name || 'Alimento').trim();
            const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta) || 0));
            const kcal = Math.round(Number(item?.kcal) || 0);
            const key = String(item?.id || item?.foodDbKey || `${name}-${index}`);
            const isEditing = editingIndex === index && active;

            return (
              <li key={key} className="kentu-meal-tray__row">
                <div className="kentu-meal-tray__row-info">
                  <div className="kentu-meal-tray__row-text">
                    <span className="kentu-meal-tray__name">{name}</span>
                    <span className="kentu-meal-tray__kcal">
                      {grams > 0 ? `${grams} g · ` : ''}
                      {kcal} kcal
                    </span>
                  </div>
                </div>
                {active ? (
                  <div className="kentu-meal-tray__row-controls">
                    {isEditing ? (
                      <AmountStepper
                        variant="kentu"
                        size="sm"
                        unitLabel="g"
                        step={5}
                        min={1}
                        value={grams}
                        disabled={disabled}
                        autoFocusInput
                        className="kentu-meal-tray__stepper"
                        onChange={(nextGrams) => {
                          const parsed = Math.max(1, Math.round(Number(nextGrams) || 0));
                          onUpdateGrams?.(index, parsed);
                        }}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="kentu-meal-tray__remove"
                      disabled={disabled}
                      onClick={() => setEditingIndex((prev) => (prev === index ? null : index))}
                      aria-label={`Modifica grammi di ${name}`}
                      title="Modifica"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="kentu-meal-tray__remove"
                      disabled={disabled}
                      onClick={() => {
                        setEditingIndex(null);
                        onRemoveItem?.(index);
                      }}
                      aria-label={`Elimina ${name}`}
                      title="Elimina"
                    >
                      ❌
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="kentu-meal-tray__totals" aria-label="Totali pasto">
        <span>{Math.round(Number(totals.kcal) || 0)} kcal</span>
        <span>P {Math.round(Number(totals.pro) || 0)}g</span>
        <span>C {Math.round(Number(totals.carbo) || 0)}g</span>
        <span>G {Math.round(Number(totals.fat) || 0)}g</span>
      </div>

      {active ? (
        <div className="kentu-meal-tray__footer">
          <KentuButton
            variant="secondary"
            className="kentu-meal-tray__cancel"
            disabled={disabled}
            onClick={() => onCancel?.()}
          >
            {MCDRIVE_CANCEL_CHIP.label}
          </KentuButton>
          <KentuButton
            variant="primary"
            className="kentu-meal-tray__confirm"
            disabled={disabled || items.length === 0}
            onClick={() => onFinish?.()}
          >
            {MCDRIVE_FINISH_CHIP.label}
          </KentuButton>
        </div>
      ) : null}
    </div>
  );
}

export default memo(LiveMealTray);
