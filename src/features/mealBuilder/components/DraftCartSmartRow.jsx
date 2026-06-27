import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  FOOD_PROVENANCE,
  FOOD_PROVENANCE_META,
  resolveProvenanceFromDraftItem,
} from '../../../foodDbSource';
import {
  getAmountStep,
  getItemUnits,
  resolveUnitIdFromUnit,
  resolveUnitWeight,
} from '../utils/draftFoodUnits';
import { roundToOneDecimal } from '../utils/numberFormatUtils';
import FoodProvenanceBadge from './FoodProvenanceBadge';
import FoodThumbnail from './FoodThumbnail';
import UnitChips from './UnitChips';
import AmountStepper from './AmountStepper';
import { resolveFoodVisual } from '../utils/foodIconUtils';

export default function DraftCartSmartRow({
  item,
  personalDb,
  onUpdateAmount,
  onRemove,
  onDeepEdit,
  embedded = false,
}) {
  const name = item.desc || item.name || 'Alimento';
  const provenance = resolveProvenanceFromDraftItem(item);
  const provenanceMeta = FOOD_PROVENANCE_META[provenance];
  const visual = resolveFoodVisual(item, personalDb);
  const selectedUnit = item.selectedUnit || 'g';
  const multiplier = Number(item.multiplier ?? item.qta ?? item.weight) || 0;
  const weight = roundToOneDecimal(Number(item.weight ?? item.qta) || 0);
  const kcal = Math.round(Number(item.kcal ?? item.cal) || 0);
  const units = getItemUnits(item);
  const step = getAmountStep(selectedUnit);
  const amountInputRef = useRef(null);
  const [isRowHighlighted, setIsRowHighlighted] = useState(false);

  const unitLabel = selectedUnit === 'g'
    ? 'g'
    : units.find((u) => resolveUnitIdFromUnit(u) === selectedUnit)?.label || selectedUnit;

  const handleUnitSelect = (nextUnitId) => {
    const unitWeight = resolveUnitWeight(item, nextUnitId);
    const nextMultiplier = unitWeight > 0 ? roundToOneDecimal(weight / unitWeight) : weight;
    onUpdateAmount(item.id, nextMultiplier, nextUnitId);
    setIsRowHighlighted(true);
    window.setTimeout(() => setIsRowHighlighted(false), 300);
    window.setTimeout(() => amountInputRef.current?.focus(), 50);
  };

  const handleAmountChange = (next) => {
    onUpdateAmount(item.id, next, selectedUnit);
  };

  const Wrapper = embedded ? 'div' : 'li';

  return (
    <Wrapper
      className={`vetrina-cart-row-enter relative min-w-0 max-w-full transition-all duration-200 ${
        embedded
          ? `rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-2.5 ${
            provenance === FOOD_PROVENANCE.PERSONAL && provenanceMeta?.borderClass
              ? provenanceMeta.borderClass
              : 'border-l-2 border-l-cyan-500/40'
          }`
          : `rounded-2xl border bg-gradient-to-br from-slate-800/50 to-slate-900/80 px-3.5 py-3 shadow-md shadow-black/20 ${
            isRowHighlighted
              ? 'border-cyan-500/40 ring-1 ring-cyan-500/15'
              : provenance === FOOD_PROVENANCE.PERSONAL && provenanceMeta?.borderClass
                ? `border-white/[0.06] ${provenanceMeta.borderClass}`
                : 'border-white/[0.06]'
          }`
      }`}
    >
      <FoodProvenanceBadge provenance={provenance} compact className="absolute bottom-2 left-2" />
      <div className="flex min-w-0 items-start gap-3">
        <div className="relative shrink-0">
          <FoodThumbnail
            visual={visual}
            name={visual.name}
            sizeClassName="h-11 w-11"
            className="rounded-xl ring-1 ring-white/[0.08] shadow-sm"
          />
        </div>
        <div className="min-w-0 flex-1">
          {embedded ? (
            <p className="truncate text-sm font-semibold leading-snug tracking-tight text-slate-50">
              {name}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => onDeepEdit?.(item)}
              className="w-full truncate text-left text-sm font-semibold leading-snug tracking-tight text-slate-50 transition-colors hover:text-cyan-300"
            >
              {name}
            </button>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {selectedUnit !== 'g' ? (
              <span className="text-[10px] font-medium text-slate-500">
                = <span className="font-mono tabular-nums text-slate-400">{Math.round(weight)}g</span>
              </span>
            ) : null}
            <span className="font-mono text-xs font-bold tabular-nums text-cyan-400">
              {kcal} kcal
            </span>
          </div>
        </div>
        {!embedded ? (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Rimuovi ${name}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-500 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 active:scale-90"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 space-y-2.5">
        {(units.length > 0 || selectedUnit !== 'g') ? (
          <UnitChips
            item={item}
            selectedUnit={selectedUnit}
            onSelect={handleUnitSelect}
            size="sm"
          />
        ) : null}

        <AmountStepper
          inputRef={amountInputRef}
          value={multiplier}
          onChange={handleAmountChange}
          step={step}
          unitLabel={unitLabel}
          size="sm"
          className="justify-start"
        />
      </div>
    </Wrapper>
  );
}
