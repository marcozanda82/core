import React, { useState, useMemo } from 'react';
import Fuse from 'fuse.js';
import creaFoodsLite from './data/crea_foods_lite.json';

const fuse = new Fuse(creaFoodsLite, {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'category', weight: 0.3 },
  ],
  threshold: 0.3,
  minMatchCharLength: 2,
});

function macroAtPortion(per100, grams) {
  const g = Math.max(0, Number(grams));
  if (!Number.isFinite(g)) return 0;
  return (Number(per100) * g) / 100;
}

export default function FoodSearch({ onFoodAdded }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedFood, setSelectedFood] = useState(null);
  const [grams, setGrams] = useState(100);

  const showDropdown = useMemo(() => results.length > 0, [results]);

  const gramsNum = useMemo(() => {
    if (grams === '') return 0;
    const n = Number(grams);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [grams]);

  const preview = useMemo(() => {
    if (!selectedFood) return null;
    const kcal = macroAtPortion(selectedFood.kcal, gramsNum);
    const pro = macroAtPortion(selectedFood.pro, gramsNum);
    const fat = macroAtPortion(selectedFood.fat, gramsNum);
    const carbs = macroAtPortion(selectedFood.carbs, gramsNum);
    return {
      kcal: kcal.toFixed(1),
      pro: pro.toFixed(1),
      fat: fat.toFixed(1),
      carbs: carbs.toFixed(1),
    };
  }, [selectedFood, gramsNum]);

  function handleSearch(e) {
    const v = e.target.value;
    setQuery(v);
    if (v.trim().length <= 1) {
      setResults([]);
      return;
    }
    const searchResults = fuse.search(v);
    setResults(searchResults.slice(0, 15).map((res) => res.item));
  }

  function handleSelect(item) {
    setSelectedFood(item);
    setQuery('');
    setResults([]);
  }

  function handleCancel() {
    setSelectedFood(null);
    setGrams(100);
  }

  function handleAddConfirm() {
    if (!selectedFood) return;
    const g = grams === '' ? 0 : Number(grams);
    const gramsFinal = Number.isFinite(g) && g >= 0 ? g : 0;
    const finalItem = {
      id: selectedFood.id,
      name: selectedFood.name,
      category: selectedFood.category,
      grams: gramsFinal,
      kcal: (selectedFood.kcal * gramsFinal) / 100,
      pro: (selectedFood.pro * gramsFinal) / 100,
      fat: (selectedFood.fat * gramsFinal) / 100,
      carbs: (selectedFood.carbs * gramsFinal) / 100,
      timestamp: new Date().toISOString(),
    };
    if (typeof onFoodAdded === 'function') {
      onFoodAdded(finalItem);
    }
    setSelectedFood(null);
    setGrams(100);
  }

  if (selectedFood) {
    return (
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.78)',
            border: '1px solid rgba(15, 23, 42, 0.08)',
            borderRadius: 16,
            padding: '20px 20px 18px',
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: '1.05rem',
                color: '#0f172a',
                lineHeight: 1.35,
                wordBreak: 'break-word',
              }}
            >
              {selectedFood.name}
            </div>
            <div style={{ marginTop: 6, fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
              {selectedFood.category}
            </div>
          </div>

          <label
            htmlFor="food-search-grams"
            style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}
          >
            Grammi
          </label>
          <input
            id="food-search-grams"
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={grams === '' ? '' : grams}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                setGrams('');
                return;
              }
              const n = parseFloat(v);
              setGrams(Number.isNaN(n) ? v : n);
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '16px 18px',
              fontSize: '1.35rem',
              fontWeight: 600,
              color: '#0f172a',
              background: 'rgba(255, 255, 255, 0.85)',
              border: '1px solid rgba(15, 23, 42, 0.1)',
              borderRadius: 12,
              outline: 'none',
              marginBottom: 18,
            }}
          />

          {preview ? (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: 'rgba(14, 165, 233, 0.06)',
                border: '1px solid rgba(14, 165, 233, 0.15)',
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#0369a1', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                Anteprima porzione
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: '0.88rem', color: '#0f172a' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Kcal</span>
                  <div style={{ fontWeight: 700 }}>{preview.kcal}</div>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Proteine</span>
                  <div style={{ fontWeight: 700 }}>{preview.pro} g</div>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Grassi</span>
                  <div style={{ fontWeight: 700 }}>{preview.fat} g</div>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Carboidrati</span>
                  <div style={{ fontWeight: 700 }}>{preview.carbs} g</div>
                </div>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                flex: '1 1 100px',
                padding: '12px 16px',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#475569',
                background: 'rgba(15, 23, 42, 0.04)',
                border: '1px solid rgba(15, 23, 42, 0.1)',
                borderRadius: 12,
                cursor: 'pointer',
              }}
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleAddConfirm}
              style={{
                flex: '1 1 100px',
                padding: '12px 16px',
                fontSize: '0.9rem',
                fontWeight: 700,
                color: '#fff',
                background: 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)',
                border: '1px solid rgba(14, 165, 233, 0.5)',
                borderRadius: 12,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)',
              }}
            >
              Aggiungi
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
      <input
        type="search"
        value={query}
        onChange={handleSearch}
        placeholder="Cerca alimento CREA…"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '14px 18px',
          fontSize: '1rem',
          fontWeight: 500,
          color: '#0f172a',
          background: 'rgba(255, 255, 255, 0.72)',
          border: '1px solid rgba(15, 23, 42, 0.08)',
          borderRadius: 14,
          outline: 'none',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />
      {showDropdown ? (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 8px)',
            zIndex: 50,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(15, 23, 42, 0.08)',
            borderRadius: 14,
            boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(15, 23, 42, 0.06)',
            padding: '6px 0',
          }}
        >
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              onClick={() => handleSelect(item)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 16px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                borderRadius: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(15, 23, 42, 0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    color: '#0f172a',
                    lineHeight: 1.3,
                    wordBreak: 'break-word',
                  }}
                >
                  {item.name}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: '0.78rem',
                    color: '#64748b',
                    lineHeight: 1.25,
                  }}
                >
                  {item.category}
                </div>
              </div>
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#0369a1',
                    background: 'rgba(14, 165, 233, 0.14)',
                    border: '1px solid rgba(14, 165, 233, 0.25)',
                    borderRadius: 999,
                    padding: '4px 10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {Math.round(Number(item.kcal) || 0)} kcal
                </span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 600,
                    color: '#64748b',
                    letterSpacing: '0.02em',
                  }}
                >
                  P:{Number(item.pro).toFixed(1)} F:{Number(item.fat).toFixed(1)} C:
                  {Number(item.carbs).toFixed(1)}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
