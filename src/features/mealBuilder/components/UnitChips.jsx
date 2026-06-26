import React from 'react';
import { resolveUnitIdFromUnit } from '../utils/draftFoodUnits';

/**
 * Selettore orizzontale di unità di misura (sostituisce i <select> nativi).
 */
export default function UnitChips({
  item,
  selectedUnit,
  onSelect,
  className = '',
  size = 'md',
}) {
  const units = item?.units ?? item?.row?.units;
  const unitList = Array.isArray(units) ? units : [];

  const options = [
    { id: 'g', label: 'g', sublabel: null },
    ...unitList.map((unit) => ({
      id: resolveUnitIdFromUnit(unit),
      label: unit.label || 'Porzione',
      sublabel: unit.grams ? `${unit.grams}g` : null,
    })),
  ];

  const chipSizeClass =
    size === 'sm'
      ? 'px-2.5 py-1 text-[10px]'
      : 'px-3 py-1.5 text-xs';

  return (
    <div
      className={`flex gap-1.5 overflow-x-auto scrollbar-hide ${className}`}
      role="tablist"
      aria-label="Unità di misura"
    >
      {options.map((option) => {
        const isActive = selectedUnit === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(option.id)}
            className={`shrink-0 rounded-full border font-semibold transition-all duration-200 active:scale-95 ${chipSizeClass} ${
              isActive
                ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200 shadow-sm shadow-cyan-500/10'
                : 'border-slate-700/80 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            <span>{option.label}</span>
            {option.sublabel ? (
              <span className={`ml-1 font-normal ${isActive ? 'text-cyan-300/70' : 'text-slate-500'}`}>
                {option.sublabel}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
