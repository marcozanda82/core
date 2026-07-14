import React from 'react';
import { X } from 'lucide-react';

const MEAL_LABELS = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Snack',
};

export default function WipMealCartBar({
  items = [],
  totals = {},
  mealType = 'pranzo',
  onRemoveItem,
  onClear,
}) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const mealLabel = MEAL_LABELS[String(mealType || '').toLowerCase()] || 'Pasto in corso';

  return (
    <div className="wip-meal-cart-bar">
      <div className="wip-meal-cart-bar__header">
        <div>
          <div className="wip-meal-cart-bar__eyebrow">Costruzione pasto</div>
          <div className="wip-meal-cart-bar__title">{mealLabel}</div>
        </div>
        <div className="wip-meal-cart-bar__totals">
          <span>{Math.round(Number(totals.kcal) || 0)} kcal</span>
          <span>P {Math.round(Number(totals.pro) || 0)}g</span>
          <span>C {Math.round(Number(totals.carbo) || 0)}g</span>
          <span>G {Math.round(Number(totals.fat) || 0)}g</span>
        </div>
        {typeof onClear === 'function' ? (
          <button
            type="button"
            className="wip-meal-cart-bar__clear"
            onClick={onClear}
            aria-label="Svuota carrello pasto"
          >
            Svuota
          </button>
        ) : null}
      </div>
      <div className="wip-meal-cart-bar__items">
        {items.map((item) => {
          const name = String(item?.foodName || item?.name || 'Alimento').trim();
          const grams = Math.round(Number(item?.grams ?? item?.weight) || 0);
          const kcal = Math.round(Number(item?.kcal ?? item?.cal) || 0);
          return (
            <div key={item.id || `${name}_${grams}`} className="wip-meal-cart-bar__chip">
              <span className="wip-meal-cart-bar__chip-name">{name}</span>
              <span className="wip-meal-cart-bar__chip-meta">
                {grams}
                g
                {kcal > 0 ? ` · ${kcal} kcal` : ''}
              </span>
              {typeof onRemoveItem === 'function' ? (
                <button
                  type="button"
                  className="wip-meal-cart-bar__chip-remove"
                  onClick={() => onRemoveItem(item.id)}
                  aria-label={`Rimuovi ${name}`}
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
