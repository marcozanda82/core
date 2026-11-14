import { useEffect, useMemo } from 'react';
import {
  OIL_GRAMS,
  OIL_TYPES,
  SALT_LEVELS,
  resolveCondimentChoice,
} from './condiments.js';

/**
 * Riga a un tocco sotto un alimento che di solito si condisce.
 * commitDefault scrive subito il valore predefinito nella coda, prima del salvataggio.
 */
export default function CondimentChoices({ food, onChange, commitDefault = false }) {
  const choice = useMemo(() => resolveCondimentChoice(food), [food]);

  useEffect(() => {
    if (!commitDefault || !choice || food?.condiment) return;
    onChange?.(choice);
    // Il default si scrive una volta, quando il piatto entra in coda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitDefault, food?.id, food?.condiment]);

  if (!choice) return null;

  const set = (patch) => onChange?.({ ...choice, ...patch });

  return (
    <div
      className="kentu-condiment"
      onClick={(event) => event.stopPropagation()}
      style={{ marginTop: 8, display: 'grid', gap: 6 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginRight: 4 }}>Olio</span>
        <select
          aria-label="Tipo di olio"
          value={choice.oilType}
          onChange={(event) => set({ oilType: event.target.value })}
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            fontSize: '0.68rem',
            padding: '2px 6px',
          }}
        >
          {Object.values(OIL_TYPES).map((type) => (
            <option key={type.id} value={type.id}>{type.name}</option>
          ))}
        </select>
        {OIL_GRAMS.map((level) => (
          <button
            key={level.id}
            type="button"
            aria-pressed={choice.oil === level.id}
            onClick={() => set({ oil: level.id })}
            style={chip(choice.oil === level.id)}
          >
            {level.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginRight: 4 }}>Sale</span>
        {SALT_LEVELS.map((level) => (
          <button
            key={level.id}
            type="button"
            aria-pressed={choice.salt === level.id}
            onClick={() => set({ salt: level.id })}
            style={chip(choice.salt === level.id)}
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function chip(on) {
  return {
    borderRadius: 999,
    border: `1px solid ${on ? 'rgba(0,229,255,0.55)' : 'rgba(255,255,255,0.12)'}`,
    background: on ? 'rgba(0,229,255,0.16)' : 'transparent',
    color: on ? '#e0f7ff' : '#cbd5e1',
    fontSize: '0.68rem',
    padding: '3px 8px',
    cursor: 'pointer',
  };
}
