import React from 'react';
import { MEALS, MEAL_KEYS, MACRO_KEYS, AMINO_KEYS } from './constants';
import './MealTracker.css';

const LABELS = {
  kcal: 'Kcal',
  prot: 'Proteine (g)',
  carb: 'Carboidrati (g)',
  fat: 'Grassi (g)',
  fibre: 'Fibre (g)',
  leucina: 'Leucina (g)',
  isoleucina: 'Isoleucina (g)',
  valina: 'Valina (g)',
};

const defaultReal = () => ({ kcal: 0, prot: 0, carb: 0, fat: 0, fibre: 0, leucina: 0, isoleucina: 0, valina: 0 });

export default function MealTracker({ mealsData, onUpdateMeal }) {
  const handleChange = (mealKey, field, value) => {
    const real = mealsData[mealKey]?.real ?? defaultReal();
    const num = field === 'kcal' || field === 'prot' || field === 'carb' || field === 'fat' || field === 'fibre' || field === 'leucina' || field === 'isoleucina' || field === 'valina'
      ? parseFloat(value) || 0
      : value;
    onUpdateMeal(mealKey, { ...real, [field]: num });
  };

  return (
    <section className="meal-tracker" aria-label="Inserimento pasti">
      <h2 className="meal-tracker-title">Tracker pasti</h2>
      <p className="meal-tracker-desc">Inserisci i valori reali per ogni pasto: il grafico Ghost si aggiorna in tempo reale.</p>
      <div className="meal-tracker-grid">
        {MEAL_KEYS.map((mealKey, i) => {
          const real = mealsData[mealKey]?.real ?? defaultReal();
          return (
            <div key={mealKey} className="meal-tracker-card">
              <h3 className="meal-tracker-card-title">{MEALS[i]}</h3>
              <div className="meal-tracker-fields">
                {MACRO_KEYS.map((key) => (
                  <label key={key} className="meal-tracker-label">
                    <span className="meal-tracker-label-text">{LABELS[key]}</span>
                    <input
                      type="number"
                      min={0}
                      step={key === 'kcal' ? 1 : 0.1}
                      value={real[key] ?? ''}
                      onChange={(e) => handleChange(mealKey, key, e.target.value)}
                      className="meal-tracker-input"
                      aria-label={`${MEALS[i]} - ${LABELS[key]}`}
                    />
                  </label>
                ))}
                <div className="meal-tracker-amino">
                  <span className="meal-tracker-amino-title">Amminoacidi (BCAA)</span>
                  {AMINO_KEYS.map((key) => (
                    <label key={key} className="meal-tracker-label">
                      <span className="meal-tracker-label-text">{LABELS[key]}</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={real[key] ?? ''}
                        onChange={(e) => handleChange(mealKey, key, e.target.value)}
                        className="meal-tracker-input meal-tracker-input-amino"
                        aria-label={`${MEALS[i]} - ${LABELS[key]}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
