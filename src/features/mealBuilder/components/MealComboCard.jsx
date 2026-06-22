import React from 'react';
import { Minus, Plus } from 'lucide-react';
import QtyBadge from './QtyBadge';
import { formatComboIngredientLine } from '../utils/comboDisplayUtils';

export default function MealComboCard({
  combo,
  comboTitle,
  qty = 0,
  displayWeight = 0,
  displayKcal = 0,
  onAdd,
  onRemoveOne,
}) {
  return (
    <div className="relative w-[300px] shrink-0 snap-start overflow-visible">
      {qty > 0 ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveOne?.();
          }}
          aria-label={`Rimuovi una porzione di ${comboTitle}`}
          className="absolute -left-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-transform active:scale-90"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      ) : null}
      {qty > 0 ? <QtyBadge qty={qty} className="z-20" /> : null}
      <div
        role="button"
        tabIndex={0}
        onClick={onAdd}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onAdd?.();
          }
        }}
        className="flex w-full cursor-pointer flex-col rounded-2xl border border-slate-700 bg-slate-800/80 p-3.5 transition-all active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
      >
        <div className="flex items-start justify-between gap-2">
          <p
            className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-100"
            title={combo?.name}
          >
            {comboTitle}
          </p>
          <span className="shrink-0 text-xs font-bold text-cyan-400">
            {qty > 0 ? displayKcal : combo?.totalKcal} kcal
          </span>
        </div>
        <ul className="my-3 space-y-1.5">
          {(combo?.items || []).slice(0, 4).map((item) => (
            <li
              key={`${combo?.id}-${item.desc}-${item.qta}`}
              className="truncate text-sm leading-relaxed text-slate-300"
              title={formatComboIngredientLine(item)}
            >
              • {formatComboIngredientLine(item)}
            </li>
          ))}
          {(combo?.items || []).length > 4 ? (
            <li className="text-xs italic leading-relaxed text-slate-500">
              + altri {combo.items.length - 4} ingredienti
            </li>
          ) : null}
        </ul>
        {combo?.count != null ? (
          <p className="mb-2 text-xs text-slate-500">Usato ×{combo.count}</p>
        ) : null}
        {qty > 0 ? (
          <p className="mb-2 text-[10px] font-medium text-slate-400">
            Nel piatto: {displayWeight}g · {displayKcal} kcal
          </p>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAdd?.();
          }}
          aria-label={`Aggiungi ${comboTitle} al piatto`}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-600/20 px-3 py-2.5 text-xs font-semibold text-cyan-400 transition-colors hover:bg-cyan-600/35 active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" />
          {qty > 0 ? `Aggiungi ancora (×${qty})` : 'Aggiungi al Piatto'}
        </button>
      </div>
    </div>
  );
}
