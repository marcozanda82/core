/**
 * Diario alimentare giornaliero (tab Oggi): ricerca CREA, totali in tempo reale, lista porzioni.
 * Il drawer pasti completo resta in MealBuilder.jsx (activeAction === 'pasto').
 */
import React, { useState, useMemo, useCallback } from 'react';
import FoodSearch from './FoodSearch';

export default function MealDailyDiary() {
  const [consumedFoods, setConsumedFoods] = useState([]);

  const totals = useMemo(() => {
    return consumedFoods.reduce(
      (acc, curr) => ({
        kcal: acc.kcal + curr.kcal,
        pro: acc.pro + curr.pro,
        fat: acc.fat + curr.fat,
        carbs: acc.carbs + curr.carbs,
      }),
      { kcal: 0, pro: 0, fat: 0, carbs: 0 }
    );
  }, [consumedFoods]);

  const handleFoodAdded = useCallback((newFood) => {
    setConsumedFoods((prev) => [...prev, newFood]);
  }, []);

  const removeFood = useCallback((index) => {
    setConsumedFoods((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const glass = {
    background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 20,
    boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 440,
        margin: '0 auto 16px',
        padding: '0 4px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <FoodSearch onFoodAdded={handleFoodAdded} />
      </div>

      <div style={{ ...glass, padding: '22px 20px 20px', marginBottom: 16 }}>
        <div
          style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(148, 163, 184, 0.95)',
            marginBottom: 8,
            textAlign: 'center',
          }}
        >
          Oggi
        </div>
        <div
          style={{
            textAlign: 'center',
            fontSize: '2.65rem',
            fontWeight: 800,
            lineHeight: 1.1,
            background: 'linear-gradient(180deg, #f8fafc 0%, #94a3b8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: 4,
          }}
        >
          {totals.kcal.toFixed(0)}
          <span style={{ fontSize: '1rem', fontWeight: 700, opacity: 0.85 }}> kcal</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginTop: 18,
          }}
        >
          {[
            { label: 'Prot', val: totals.pro, color: '#38bdf8' },
            { label: 'Grassi', val: totals.fat, color: '#fbbf24' },
            { label: 'Carb', val: totals.carbs, color: '#a78bfa' },
          ].map(({ label, val, color }) => (
            <div
              key={label}
              style={{
                minWidth: 88,
                padding: '12px 14px',
                borderRadius: 999,
                background: 'rgba(15, 23, 42, 0.45)',
                border: `1px solid ${color}33`,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em' }}>
                {label}
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color, marginTop: 4 }}>
                {val.toFixed(1)} g
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ paddingBottom: 8 }}>
        <div
          style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#64748b',
            marginBottom: 10,
            paddingLeft: 4,
          }}
        >
          Alimenti registrati
        </div>
        {consumedFoods.length === 0 ? (
          <div
            style={{
              ...glass,
              padding: '28px 20px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '0.88rem',
              lineHeight: 1.5,
            }}
          >
            Nessun alimento ancora. Cerca sopra e aggiungi una porzione.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {consumedFoods.map((item, index) => (
              <li
                key={`${item.id}-${item.timestamp ?? index}-${index}`}
                style={{
                  ...glass,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 16,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      color: '#e2e8f0',
                      lineHeight: 1.3,
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.name}
                  </div>
                  <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>
                    <span>{Math.round(Number(item.grams) || 0)} g</span>
                    <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
                    <span style={{ color: '#7dd3fc' }}>{Number(item.kcal).toFixed(0)} kcal</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFood(index)}
                  aria-label="Rimuovi alimento"
                  style={{
                    flexShrink: 0,
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    border: '1px solid rgba(248, 113, 113, 0.35)',
                    background: 'rgba(248, 113, 113, 0.12)',
                    color: '#fca5a5',
                    fontSize: '1rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
