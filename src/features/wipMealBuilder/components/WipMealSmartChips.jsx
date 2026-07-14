import React, { useMemo } from 'react';
import { Check } from 'lucide-react';

import { buildSuggestionChipId } from '../utils/wipMealItemUtils.js';

export default function WipMealSmartChips({
  suggestions = [],
  addedChipIds = [],
  onAddSuggestion,
}) {
  const chips = useMemo(
    () => (Array.isArray(suggestions) ? suggestions : []).filter(
      (entry) => String(entry?.name || '').trim() && Number(entry?.weight) > 0,
    ),
    [suggestions],
  );

  if (chips.length === 0) return null;

  const addedSet = new Set(Array.isArray(addedChipIds) ? addedChipIds : []);

  return (
    <div className="wip-meal-smart-chips">
      {chips.map((suggestion, index) => {
        const chipId = suggestion.id || buildSuggestionChipId(suggestion, index);
        const isAdded = addedSet.has(chipId);
        return (
          <button
            key={chipId}
            type="button"
            className={`wip-meal-smart-chip${isAdded ? ' wip-meal-smart-chip--added' : ''}`}
            disabled={isAdded}
            onClick={() => {
              if (isAdded || typeof onAddSuggestion !== 'function') return;
              onAddSuggestion(suggestion, chipId);
            }}
            title={suggestion.reason || undefined}
          >
            {isAdded ? <Check size={14} aria-hidden /> : <span aria-hidden>+</span>}
            <span>
              {Math.round(Number(suggestion.weight) || 0)}
              g
              {' '}
              {suggestion.name}
            </span>
            {isAdded ? <span className="wip-meal-smart-chip__added-label">Aggiunto</span> : null}
          </button>
        );
      })}
    </div>
  );
}
