import React from 'react';
import {
  getAmountStep,
  getItemUnits,
  resolveUnitIdFromUnit,
  resolveUnitWeight,
} from '../utils/draftFoodUnits';

const numberInputClassName =
  'w-14 border-b border-slate-600 bg-transparent py-0.5 text-center text-sm text-slate-200 outline-none focus:border-cyan-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const stepButtonClassName =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 text-base text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700/80 active:scale-95';

export default function DraftCartSmartRow({ item, onUpdateAmount, onRemove }) {
  const name = item.desc || item.name || 'Alimento';
  const selectedUnit = item.selectedUnit || 'g';
  const multiplier = Number(item.multiplier ?? item.qta ?? item.weight) || 0;
  const weight = Number(item.weight ?? item.qta) || 0;
  const kcal = Number(item.kcal ?? item.cal) || 0;
  const units = getItemUnits(item);
  const step = getAmountStep(selectedUnit);

  const handleUnitChange = (event) => {
    const nextUnitId = event.target.value;
    const unitWeight = resolveUnitWeight(item, nextUnitId);
    const nextMultiplier = unitWeight > 0 ? weight / unitWeight : weight;
    onUpdateAmount(item.id, nextMultiplier, nextUnitId);
  };

  const handleMultiplierChange = (event) => {
    const raw = event.target.value;
    if (raw === '') return;
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) return;
    onUpdateAmount(item.id, next, selectedUnit);
  };

  const handleStep = (direction) => {
    const next = Math.max(0, multiplier + direction * step);
    onUpdateAmount(item.id, next, selectedUnit);
  };

  return (
    <li className="min-w-0 max-w-full rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium leading-snug text-slate-100">
          {name}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            {selectedUnit !== 'g' ? (
              <p className="text-[10px] leading-tight text-slate-500">= {Math.round(weight)}g</p>
            ) : null}
            <p className="text-xs font-medium text-cyan-400/90">{kcal} kcal</p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Rimuovi ${name}`}
            className="rounded-lg px-2 py-1 text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
        <select
          value={selectedUnit}
          onChange={handleUnitChange}
          aria-label={`Unità di misura per ${name}`}
          className="max-w-[7.5rem] min-w-0 shrink-0 truncate rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500"
        >
          <option value="g">g</option>
          {units.map((unit) => {
            const unitId = resolveUnitIdFromUnit(unit);
            return (
              <option key={`${unitId}-${unit.grams}`} value={unitId}>
                {unit.label} ({unit.grams}g)
              </option>
            );
          })}
        </select>

        <button
          type="button"
          onClick={() => handleStep(-1)}
          aria-label={`Diminuisci quantità ${name}`}
          className={stepButtonClassName}
        >
          −
        </button>

        <input
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          aria-label={`Quantità ${name}`}
          value={multiplier > 0 ? multiplier : ''}
          onChange={handleMultiplierChange}
          className={numberInputClassName}
        />

        <button
          type="button"
          onClick={() => handleStep(1)}
          aria-label={`Aumenta quantità ${name}`}
          className={stepButtonClassName}
        >
          +
        </button>
      </div>
    </li>
  );
}
