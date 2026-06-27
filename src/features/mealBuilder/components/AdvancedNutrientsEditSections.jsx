import React from 'react';
import {
  getNutrientLabel,
  getNutrientUnit,
  NUTRIENT_UI_CATEGORIES,
} from '../utils/nutrientsUiConfig';

const detailsClassName =
  'rounded-xl border border-white/[0.06] bg-slate-950/40 open:border-cyan-500/20';

const summaryClassName =
  'flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-slate-200 marker:content-none [&::-webkit-details-marker]:hidden';

export default function AdvancedNutrientsEditSections({
  form,
  onFieldChange,
  inputClassName,
  defaultOpen = false,
}) {
  return (
    <div className="space-y-2">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-amber-500/30 bg-amber-950/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
          Valori per 100g
        </span>
        <span className="text-xs text-slate-500">
          Inserisci i micronutrienti sempre riferiti a 100 g di prodotto.
        </span>
      </div>

      {NUTRIENT_UI_CATEGORIES.map((category) => (
        <details key={category.id} className={detailsClassName} open={defaultOpen}>
          <summary className={summaryClassName}>
            <span>{category.label}</span>
            <span className="text-xs font-normal text-slate-500">{category.keys.length} campi</span>
          </summary>
          <div className="grid grid-cols-2 gap-3 border-t border-slate-800/80 px-3 pb-3 pt-2">
            {category.keys.map((key) => {
              const unit = getNutrientUnit(key, category);
              return (
                <label key={key} className="block min-w-0">
                  <span className="mb-1 block truncate text-xs text-slate-400">
                    {getNutrientLabel(key)} ({unit})
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={form[key] ?? ''}
                    onChange={(event) => onFieldChange(key, event.target.value)}
                    placeholder="0"
                    className={inputClassName}
                  />
                </label>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
