import React from 'react';
import { X } from 'lucide-react';
import MealComboCard from './MealComboCard';
import { buildComboDraftPayload } from '../utils/recipePayloadUtils';
import {
  getDefaultUnitKcal,
  getDraftQtyForFood,
  getFoodUnitWeight,
  getTileDisplayStats,
} from '../utils/draftFoodMatchUtils';
import { resolveComboCardTitle } from '../utils/comboDisplayUtils';

export default function FrequentMealsModal({
  isOpen,
  onClose,
  mealLabel,
  combos = [],
  draftFoods = [],
  onAddCombo,
  onRemoveOne,
}) {
  if (!isOpen) return null;

  const label = String(mealLabel || 'Pasto').trim() || 'Pasto';

  return (
    <div
      className="fixed inset-0 z-[100055] flex flex-col justify-end bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Pasti frequenti per ${label}`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Chiudi pasti frequenti"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-[#050a12] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-amber-400/80">
              Pasti frequenti
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-100">{label}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-white"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {combos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-8 text-center text-sm text-slate-500">
              Nessun pasto frequente per questo momento.
            </p>
          ) : (
            <div className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {combos.map((combo, comboIndex) => {
                const comboTitle = resolveComboCardTitle(combo, comboIndex);
                const comboPayload = buildComboDraftPayload(combo);
                const unitWeight = comboPayload ? getFoodUnitWeight(comboPayload) : 100;
                const defaultUnitKcal = comboPayload ? getDefaultUnitKcal(comboPayload) : 0;
                const qty = comboPayload
                  ? getDraftQtyForFood(draftFoods, comboPayload, unitWeight)
                  : 0;
                const { displayWeight, displayKcal } = getTileDisplayStats(
                  qty,
                  unitWeight,
                  defaultUnitKcal,
                );

                return (
                  <MealComboCard
                    key={combo.id || comboTitle}
                    combo={combo}
                    comboTitle={comboTitle}
                    qty={qty}
                    displayWeight={displayWeight}
                    displayKcal={displayKcal}
                    onAdd={() => onAddCombo?.(combo, comboTitle)}
                    onRemoveOne={() => {
                      if (comboPayload) onRemoveOne?.(comboPayload, unitWeight);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
