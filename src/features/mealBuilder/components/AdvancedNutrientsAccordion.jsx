import React from 'react';
import {
  formatNutrientDisplayValue,
  getNutrientLabel,
  getNutrientUnit,
  getVisibleNutrientCategories,
  isNutrientValueVisible,
  NUTRIENT_UI_CATEGORIES,
} from '../utils/nutrientsUiConfig';

const detailsClassName =
  'group rounded-xl border border-white/[0.06] bg-slate-950/40 open:border-cyan-500/20';

const summaryClassName =
  'flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-slate-200 marker:content-none [&::-webkit-details-marker]:hidden';

export default function AdvancedNutrientsAccordion({
  nutrients = {},
  className = '',
  emptyMessage = null,
}) {
  const visibleCategories = getVisibleNutrientCategories(nutrients);

  if (visibleCategories.length === 0) {
    if (!emptyMessage) return null;
    return (
      <p className={`text-center text-xs text-slate-600 ${className}`}>{emptyMessage}</p>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
        Micronutrienti
      </p>
      {visibleCategories.map((category) => (
        <details key={category.id} className={detailsClassName}>
          <summary className={summaryClassName}>
            <span>{category.label}</span>
            <span className="text-xs font-normal text-slate-500 group-open:text-cyan-400/80">
              espandi
            </span>
          </summary>
          <div className="border-t border-slate-800/80 px-3 pb-2 pt-1">
            {category.keys
              .filter((key) => isNutrientValueVisible(nutrients[key]))
              .map((key) => {
              const value = nutrients[key];
              const unit = getNutrientUnit(key, category);
              return (
                <div
                  key={key}
                  className="flex items-center justify-between border-b border-slate-800 py-1.5 text-sm last:border-b-0"
                >
                  <span className="pr-3 text-slate-400">{getNutrientLabel(key)}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-slate-200">
                    {formatNutrientDisplayValue(value, unit)}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

export { NUTRIENT_UI_CATEGORIES };
