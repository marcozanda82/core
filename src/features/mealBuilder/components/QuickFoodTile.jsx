import React, { useEffect, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import FoodVisualMedia from './FoodVisualMedia';
import QtyBadge from './QtyBadge';
import { triggerSelectionHaptic } from '../utils/hapticFeedback';

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
  viewMode = 'grid',
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempQty, setTempQty] = useState(1);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const isList = viewMode === 'list';
  const name = displayTile?.label || displayTile?.desc || tileVisual?.name || 'Alimento';
  const baseWeight = Math.round(Number(defaultUnitWeight) || 100);
  const baseKcal = Math.round(Number(defaultUnitKcal) || 0);
  const tempWeight = Math.round(tempQty * baseWeight);
  const visual = tileVisual || {
    name,
    customImage: null,
    customEmoji: null,
    customIcon: null,
    semanticIconTag: null,
  };

  useEffect(() => {
    if (!isEditing) setTempQty(1);
  }, [isEditing]);

  const openDetail = (event) => {
    event.stopPropagation();
    onOpenDetail?.();
  };

  const flashConfirm = () => {
    setJustConfirmed(true);
    window.setTimeout(() => setJustConfirmed(false), 550);
  };

  const handleQuickAdd = (event) => {
    event.stopPropagation();
    triggerSelectionHaptic(15);
    onConfirmAdd?.(1);
    flashConfirm();
    setIsEditing(false);
    setTempQty(1);
  };

  const handleOpenStepper = (event) => {
    event.stopPropagation();
    setIsEditing(true);
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
    flashConfirm();
    setIsEditing(false);
    setTempQty(1);
  };

  const cardShellClass = `relative overflow-visible rounded-2xl border bg-gradient-to-b from-slate-800/70 to-slate-900/90 shadow-lg shadow-black/25 transition-all duration-200 ${
    isEditing
      ? 'border-cyan-400/50 ring-2 ring-cyan-500/20 shadow-cyan-950/20'
      : 'border-white/[0.06] hover:border-cyan-500/25 hover:shadow-cyan-950/15'
  } ${isPressed ? 'scale-[0.97]' : 'scale-100'}`;

  const renderStepper = (compact = false) => (
    <div
      className={`vetrina-stepper-expand flex items-center justify-between gap-1 bg-slate-950/70 ${
        compact
          ? 'h-10 w-[7.5rem] shrink-0 rounded-xl border border-slate-700/80 px-1 shadow-inner'
          : 'h-9 w-full rounded-b-2xl border-t border-slate-700/60 px-1.5'
      }`}
      onClick={(event) => event.stopPropagation()}
      role="group"
      aria-label={`Stepper quantità ${name}`}
    >
      <button
        type="button"
        onClick={handleDecrease}
        aria-label={`Diminuisci quantità ${name}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-all hover:bg-slate-800 active:scale-90"
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={3} />
      </button>

      <button
        type="button"
        onClick={handleConfirm}
        aria-label={`Aggiungi ${tempWeight}g di ${name} al piatto`}
        className={`flex min-w-0 flex-1 items-center justify-center rounded-lg px-1.5 py-1 font-mono text-[11px] font-bold tabular-nums transition-all duration-200 active:scale-95 ${
          justConfirmed
            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
            : 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 hover:bg-cyan-400'
        }`}
      >
        {justConfirmed ? (
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
        ) : (
          <span>{tempWeight}g</span>
        )}
      </button>

      <button
        type="button"
        onClick={handleIncrease}
        aria-label={`Aumenta quantità ${name}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-all hover:bg-slate-800 active:scale-90"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
    </div>
  );

  const renderQuickFooter = (compact = false) => (
    <div
      className={`flex items-stretch overflow-hidden bg-slate-950/50 ${
        compact
          ? 'h-10 w-[7.5rem] shrink-0 rounded-xl border border-slate-700/80'
          : 'h-9 w-full rounded-b-2xl border-t border-slate-700/60'
      }`}
    >
      <button
        type="button"
        onClick={handleOpenStepper}
        aria-label={`Regola porzione ${name}`}
        className="flex min-w-0 flex-1 flex-col items-center justify-center px-2 transition-colors hover:bg-slate-800/60 active:bg-slate-800/80"
      >
        <span className="font-mono text-[10px] font-medium tabular-nums text-slate-400">
          {baseWeight}g
        </span>
      </button>
      <button
        type="button"
        onClick={handleQuickAdd}
        aria-label={`Aggiungi rapidamente ${baseWeight}g di ${name}`}
        className={`flex shrink-0 items-center justify-center px-3 font-mono text-[11px] font-bold tabular-nums transition-all duration-200 active:scale-95 ${
          justConfirmed
            ? 'bg-emerald-500 text-white'
            : 'bg-cyan-500/90 text-slate-950 hover:bg-cyan-400'
        } ${compact ? 'min-w-[3rem]' : 'min-w-[3.25rem]'}`}
      >
        {justConfirmed ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        ) : (
          <span>+{baseKcal}</span>
        )}
      </button>
    </div>
  );

  const renderOverlayControls = () => (
    <>
      {qty > 0 && !isEditing ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveOne?.();
          }}
          aria-label={`Rimuovi una porzione di ${name}`}
          className={`absolute z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition-transform active:scale-90 ${
            isList ? '-left-1 -top-1' : '-left-2 -top-2'
          }`}
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      ) : null}
      {qty > 0 && !isEditing ? <QtyBadge qty={qty} className="z-20" /> : null}
    </>
  );

  const renderIconArea = (compact = false) => (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-700/40 to-slate-900/60 ${
        compact
          ? 'h-16 w-16 shrink-0 rounded-xl ring-1 ring-white/[0.06]'
          : 'h-full w-full rounded-t-2xl'
      }`}
    >
      <div className={`flex items-center justify-center ${compact ? 'h-12 w-12' : 'h-14 w-14'}`}>
        <FoodVisualMedia visual={visual} name={name} compact={compact} />
      </div>
    </div>
  );

  if (isList) {
    return (
      <div className="relative w-full overflow-visible vetrina-tile-enter">
        {renderOverlayControls()}
        <div
          className={`${cardShellClass} flex flex-row items-center gap-3 p-2.5`}
          onPointerDown={() => setIsPressed(true)}
          onPointerUp={() => setIsPressed(false)}
          onPointerLeave={() => setIsPressed(false)}
        >
          <button
            type="button"
            onClick={openDetail}
            aria-label={`Apri dettaglio ${name}`}
            className="shrink-0 transition-transform active:scale-95"
          >
            {renderIconArea(true)}
          </button>

          <button
            type="button"
            onClick={openDetail}
            aria-label={`Apri dettaglio ${name}`}
            className="min-w-0 flex-1 py-0.5 text-left"
          >
            <p className="truncate text-sm font-semibold leading-snug tracking-tight text-slate-50">
              {name}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              <span className="font-mono tabular-nums text-slate-400">{baseWeight}g</span>
              <span className="mx-1.5 text-slate-700">·</span>
              <span className="font-mono tabular-nums text-cyan-400/90">{baseKcal} kcal</span>
            </p>
            {sourceBadge ? (
              <span
                className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sourceBadge.className}`}
              >
                {sourceBadge.label}
              </span>
            ) : null}
          </button>

          {isEditing ? renderStepper(true) : renderQuickFooter(true)}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-visible vetrina-tile-enter">
      {renderOverlayControls()}
      <div
        className={`${cardShellClass} flex min-h-[128px] flex-col`}
        onPointerDown={() => setIsPressed(true)}
        onPointerUp={() => setIsPressed(false)}
        onPointerLeave={() => setIsPressed(false)}
      >
        <button
          type="button"
          onClick={openDetail}
          aria-label={`Apri dettaglio ${name}`}
          className="relative flex h-[58%] min-h-[72px] w-full cursor-pointer items-center justify-center transition-colors hover:from-slate-700/50 active:scale-[0.99]"
        >
          {renderIconArea(false)}
        </button>

        <button
          type="button"
          onClick={openDetail}
          aria-label={`Apri dettaglio ${name}`}
          className="flex w-full flex-1 flex-col items-center justify-center px-2 py-1.5 text-center transition-colors hover:bg-slate-800/30"
        >
          <span className="line-clamp-2 w-full text-[11px] font-semibold leading-tight tracking-tight text-slate-100">
            {name}
          </span>
          {sourceBadge ? (
            <span
              className={`mt-1 inline-block rounded-full border px-1.5 py-px text-[8px] font-bold uppercase tracking-wider ${sourceBadge.className}`}
            >
              {sourceBadge.label}
            </span>
          ) : null}
        </button>

        {isEditing ? renderStepper(false) : renderQuickFooter(false)}
      </div>
    </div>
  );
}
