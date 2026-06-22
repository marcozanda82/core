import React, { useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { getFoodEmoji } from '../utils/foodIconUtils';
import QtyBadge from './QtyBadge';

export default function QuickFoodTile({
  displayTile,
  tileVisual,
  defaultUnitWeight,
  defaultUnitKcal,
  qty,
  onConfirmAdd,
  onRemoveOne,
  onOpenDetail,
  sourceBadge = null,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempQty, setTempQty] = useState(1);
  const [justConfirmed, setJustConfirmed] = useState(false);

  const name = displayTile?.label || displayTile?.desc || tileVisual?.name || 'Alimento';
  const baseWeight = Math.round(Number(defaultUnitWeight) || 100);
  const baseKcal = Math.round(Number(defaultUnitKcal) || 0);
  const tempWeight = Math.round(tempQty * baseWeight);
  const visual = tileVisual || { name, customImage: null, customEmoji: null };
  const emojiFallback = visual.customEmoji || getFoodEmoji(visual.name || name);

  const openDetail = (event) => {
    event.stopPropagation();
    onOpenDetail?.();
  };

  const handleFooterActivate = (event) => {
    event.stopPropagation();
    if (!isEditing) setIsEditing(true);
  };

  const handleDecrease = (event) => {
    event.stopPropagation();
    setTempQty((prev) => {
      const next = prev - 1;
      if (next <= 0) {
        setIsEditing(false);
        return 1;
      }
      return next;
    });
  };

  const handleIncrease = (event) => {
    event.stopPropagation();
    setTempQty((prev) => prev + 1);
  };

  const handleConfirm = (event) => {
    event.stopPropagation();
    if (tempQty <= 0) return;

    onConfirmAdd?.(tempQty);

    setJustConfirmed(true);
    window.setTimeout(() => setJustConfirmed(false), 500);
    setIsEditing(false);
    setTempQty(1);
  };

  return (
    <div className="relative w-full overflow-visible">
      {qty > 0 && !isEditing ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveOne?.();
          }}
          aria-label={`Rimuovi una porzione di ${name}`}
          className="absolute -left-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-transform active:scale-90"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      ) : null}
      {qty > 0 && !isEditing ? <QtyBadge qty={qty} className="z-20" /> : null}

      <div
        className={`relative flex min-h-[120px] w-full flex-col overflow-visible rounded-xl border bg-slate-800/40 p-0 transition-all ${
          isEditing
            ? 'border-cyan-500/70 ring-2 ring-cyan-500/30'
            : 'border-slate-700/50'
        }`}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={openDetail}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openDetail(event);
            }
          }}
          aria-label={`Apri dettaglio ${name}`}
          className="relative flex h-[55%] w-full cursor-pointer items-center justify-center rounded-t-xl bg-slate-800/60 transition-colors hover:bg-slate-800/80"
        >
          {visual.customImage ? (
            <img
              src={visual.customImage}
              alt={visual.name || name}
              className="h-full w-full rounded-t-xl object-cover"
            />
          ) : (
            <span className="text-3xl" aria-hidden>
              {emojiFallback}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={openDetail}
          aria-label={`Apri dettaglio ${name}`}
          className="flex w-full flex-1 cursor-pointer flex-col items-center justify-center px-1 py-1 text-left transition-colors hover:bg-slate-800/30"
        >
          <span className="line-clamp-2 w-full break-words text-center text-[11px] font-semibold leading-tight text-slate-200">
            {name}
          </span>
          {sourceBadge ? (
            <span
              className={`mt-1 inline-block rounded-full border px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide ${sourceBadge.className}`}
            >
              {sourceBadge.label}
            </span>
          ) : null}
        </button>

        {!isEditing ? (
          <button
            type="button"
            onClick={handleFooterActivate}
            aria-label={`Aggiunta rapida ${name}`}
            className="flex h-6 w-full cursor-pointer items-center justify-between rounded-b-xl border-t border-slate-800 bg-slate-900/80 px-2 transition-colors hover:bg-slate-900 active:scale-[0.98]"
          >
            <span className="font-mono text-[10px] font-medium tabular-nums text-slate-400">
              {baseWeight}g
            </span>
            <span className="font-mono text-[10px] font-bold tabular-nums text-cyan-400">
              {baseKcal}
            </span>
          </button>
        ) : (
          <div
            className="flex h-6 w-full items-center justify-between gap-0.5 rounded-b-xl border-t border-slate-800 bg-slate-900/80 px-0.5"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            role="group"
            aria-label={`Stepper quantità ${name}`}
          >
            <button
              type="button"
              onClick={handleDecrease}
              aria-label={`Diminuisci quantità ${name}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 active:scale-90"
            >
              <Minus className="h-3 w-3" strokeWidth={3} />
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              aria-label={`Aggiungi ${tempWeight}g di ${name} al piatto`}
              className={`flex min-w-0 flex-1 items-center justify-center rounded-md px-1 py-0.5 font-mono text-[10px] font-bold tabular-nums transition-colors duration-200 active:scale-95 ${
                justConfirmed
                  ? 'bg-green-500 text-white'
                  : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
              }`}
            >
              {justConfirmed ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
              ) : (
                <span>{tempWeight}g</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleIncrease}
              aria-label={`Aumenta quantità ${name}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 active:scale-90"
            >
              <Plus className="h-3 w-3" strokeWidth={3} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
