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

export default function FoodSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const showDropdown = useMemo(() => results.length > 0, [results]);

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
    console.log('Selezionato:', item);
    setQuery('');
    setResults([]);
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
