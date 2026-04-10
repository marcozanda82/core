import React, { useState, useMemo, useCallback } from 'react';
import Fuse from 'fuse.js';
import creaFoodsLite from './data/crea_foods_lite.json';

const fuse = new Fuse(creaFoodsLite, {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'category', weight: 0.3 },
  ],
  threshold: 0.3,
  minMatchCharLength: 2,
  includeMatches: true,
});

/** Unisce intervalli [start,end] inclusivi evitando sovrapposizioni. */
function mergeInclusiveIndices(indices) {
  if (!indices?.length) return [];
  const sorted = [...indices].sort((a, b) => a[0] - b[0]);
  const out = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    const last = out[out.length - 1];
    if (s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/**
 * Evidenzia i caratteri indicati da Fuse (`matches`) per il campo `keyName`.
 * Azzurro neon allineato al tema app (SalaComandi).
 */
function HighlightMatch({ text, matches, keyName }) {
  const str = text == null ? '' : String(text);
  const matchEntry = matches?.find((m) => m.key === keyName);
  const rawIndices = matchEntry?.indices;
  if (!str || !rawIndices?.length) {
    return <span>{str}</span>;
  }
  const ranges = mergeInclusiveIndices(rawIndices);
  const nodes = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) {
      nodes.push(<span key={`n-${i}-a`}>{str.slice(cursor, start)}</span>);
    }
    nodes.push(
      <span key={`h-${i}`} className="food-search-match-highlight">
        {str.slice(start, end + 1)}
      </span>
    );
    cursor = end + 1;
  });
  if (cursor < str.length) {
    nodes.push(<span key="n-tail">{str.slice(cursor)}</span>);
  }
  return <span>{nodes}</span>;
}

function macroAtPortion(per100, grams) {
  const g = Math.max(0, Number(grams));
  if (!Number.isFinite(g)) return 0;
  return (Number(per100) * g) / 100;
}

function getGeminiApiKeyFromStorage() {
  try {
    const raw = localStorage.getItem('ghost_api_cluster');
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return null;
    const key = arr.find((k) => k && String(k).trim());
    return key ? String(key).trim() : null;
  } catch {
    return null;
  }
}

function stripJsonFence(text) {
  return String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

export default function FoodSearch({ onFoodAdded }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedFood, setSelectedFood] = useState(null);
  const [grams, setGrams] = useState(100);
  const [isTranslating, setIsTranslating] = useState(false);

  const qTrim = query.trim();
  const showAiFallback = qTrim.length > 2 && results.length === 0;
  const showListDropdown = results.length > 0 || showAiFallback;

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
    setResults(searchResults.slice(0, 15));
  }

  const handleAiTranslation = useCallback(async () => {
    const q = query.trim();
    if (q.length < 3) return;
    setIsTranslating(true);
    try {
      const apiKey = getGeminiApiKeyFromStorage();
      if (!apiKey) {
        alert('Configura una chiave API Gemini nelle impostazioni dell’app (cluster API).');
        setIsTranslating(false);
        return;
      }

      const qEsc = String(q).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const systemText = `Sei un nutrizionista esperto e un traduttore di dati. L'utente ha inserito questa stringa di testo: '${qEsc}'. Il tuo compito è estrarre o stimare i dati nutrizionali con massima precisione. Se la stringa contiene una grammatura (es. 'due fette' o '150g'), calcola i valori su quella grammatura, altrimenti usa 100g. Devi rispondere ESCLUSIVAMENTE con un oggetto JSON valido (senza markdown o backtick) con le seguenti chiavi: "name" (nome pulito e professionale dell'alimento), "grams" (numero), "kcal" (numero), "pro" (numero), "fat" (numero), "carbs" (numero), "category" (stringa, es. 'AI Translation').`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemText }] },
            contents: [{ role: 'user', parts: [{ text: 'Rispondi solo con l\'oggetto JSON richiesto.' }] }],
            generationConfig: { temperature: 0.2 },
          }),
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText.slice(0, 200) || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) throw new Error('Risposta vuota dal modello');

      const cleaned = stripJsonFence(raw);
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) throw new Error('JSON non trovato');
      const parsed = JSON.parse(cleaned.slice(start, end + 1));

      const gramsNum = Math.max(0, Number(parsed.grams) || 100);
      const finalItem = {
        id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        name: String(parsed.name || 'Alimento').trim() || 'Alimento',
        category: String(parsed.category || 'AI Translation').trim() || 'AI Translation',
        grams: gramsNum,
        kcal: Math.max(0, Number(parsed.kcal) || 0),
        pro: Math.max(0, Number(parsed.pro) || 0),
        fat: Math.max(0, Number(parsed.fat) || 0),
        carbs: Math.max(0, Number(parsed.carbs) || 0),
        timestamp: new Date().toISOString(),
      };

      if (typeof onFoodAdded === 'function') {
        onFoodAdded(finalItem);
      }
      setQuery('');
      setResults([]);
    } catch (e) {
      console.error('FoodSearch AI translation:', e);
      alert("Non sono riuscito a capire l'alimento, riprova con parole diverse");
    } finally {
      setIsTranslating(false);
    }
  }, [query, onFoodAdded]);

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
        aria-expanded={showListDropdown}
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
      {showListDropdown ? (
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
          {results.map((result) => (
            <button
              key={result.item.id}
              type="button"
              role="option"
              onClick={() => handleSelect(result.item)}
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
                  <HighlightMatch text={result.item.name} matches={result.matches} keyName="name" />
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: '0.78rem',
                    color: '#64748b',
                    lineHeight: 1.25,
                  }}
                >
                  <HighlightMatch text={result.item.category} matches={result.matches} keyName="category" />
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
                  {Math.round(Number(result.item.kcal) || 0)} kcal
                </span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 600,
                    color: '#64748b',
                    letterSpacing: '0.02em',
                  }}
                >
                  P:{Number(result.item.pro).toFixed(1)} F:{Number(result.item.fat).toFixed(1)} C:
                  {Number(result.item.carbs).toFixed(1)}
                </span>
              </div>
            </button>
          ))}
          {(results.length > 0 || showAiFallback) && qTrim.length > 2 ? (
            <div style={{ padding: '8px 10px 10px', borderTop: '1px solid rgba(15, 23, 42, 0.06)' }}>
              <button
                type="button"
                disabled={isTranslating}
                onClick={() => void handleAiTranslation()}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: isTranslating ? '#64748b' : '#0f172a',
                  cursor: isTranslating ? 'wait' : 'pointer',
                  textAlign: 'center',
                  borderRadius: 12,
                  border: '1px solid transparent',
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(224, 231, 255, 0.45) 50%, rgba(207, 250, 254, 0.5) 100%)',
                  boxShadow:
                    '0 0 0 1px rgba(99, 102, 241, 0.25), 0 0 0 1px rgba(14, 165, 233, 0.2) inset, 0 4px 16px rgba(15, 23, 42, 0.08)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  opacity: isTranslating ? 0.85 : 1,
                }}
              >
                {isTranslating ? (
                  'Sto decifrando l\'alimento…'
                ) : (
                  <span>
                    {`✨ Analizza '${qTrim.length > 40 ? `${qTrim.slice(0, 40)}…` : qTrim}' con l'AI`}
                  </span>
                )}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
