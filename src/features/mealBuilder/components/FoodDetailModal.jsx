import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Edit2, X } from 'lucide-react';
import { findDraftItemForFood } from '../utils/draftFoodMatchUtils';
import { getFoodEmoji } from '../utils/foodIconUtils';
import { renderIconFromTag } from '../../../utils/iconEngine';
import { computeMacrosForWeight, getPer100Macros, scaleNutrientsForWeight } from '../utils/foodMacroUtils';
import AdvancedNutrientsAccordion from './AdvancedNutrientsAccordion';
import {
  getItemUnits,
  resolveUnitIdFromUnit,
  resolveUnitWeight,
} from '../utils/draftFoodUnits';
import { roundToOneDecimal } from '../utils/numberFormatUtils';
import AmountStepper from './AmountStepper';
import UnitChips from './UnitChips';

const MACRO_BOXES = [
  { id: 'kcal', label: 'Kcal', accent: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25' },
  { id: 'prot', label: 'Proteine', accent: 'text-red-400', bg: 'bg-red-500/10 border-red-500/25' },
  { id: 'carb', label: 'Carboidrati', accent: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/25' },
  { id: 'fat', label: 'Grassi', accent: 'text-amber-600', bg: 'bg-amber-700/10 border-amber-700/25' },
];

export default function FoodDetailModal({
  food,
  draftFoods,
  onClose,
  onConfirm,
  onDeepEdit,
}) {
  const weightInputRef = useRef(null);
  const [selectedUnit, setSelectedUnit] = useState('g');
  const [amount, setAmount] = useState(100);
  const [justConfirmed, setJustConfirmed] = useState(false);

  const displayTile = food?.displayTile;
  const tileVisual = food?.tileVisual;
  const defaultUnitWeight = Math.round(Number(food?.defaultUnitWeight) || 100);
  const name = displayTile?.label || displayTile?.desc || tileVisual?.name || 'Alimento';
  const units = getItemUnits(displayTile || {});

  const draftItem = useMemo(
    () => (displayTile ? findDraftItemForFood(draftFoods, displayTile) : null),
    [draftFoods, displayTile],
  );

  const cartWeight = draftItem
    ? Math.round(Number(draftItem.weight ?? draftItem.qta) || 0)
    : 0;
  const isInCart = cartWeight > 0;

  useEffect(() => {
    if (!food) return;
    const initialWeight = isInCart ? cartWeight : defaultUnitWeight;
    setSelectedUnit('g');
    setAmount(roundToOneDecimal(initialWeight));
    setJustConfirmed(false);
    const focusTimer = window.setTimeout(() => weightInputRef.current?.focus(), 280);
    return () => window.clearTimeout(focusTimer);
  }, [food, defaultUnitWeight, cartWeight, isInCart]);

  const selectedWeight = useMemo(() => {
    if (!displayTile) return 0;
    if (selectedUnit === 'g') return roundToOneDecimal(amount);
    return roundToOneDecimal(amount * resolveUnitWeight(displayTile, selectedUnit));
  }, [displayTile, selectedUnit, amount]);

  const liveNutrients = useMemo(() => {
    if (!displayTile || selectedWeight <= 0) return {};
    const row = displayTile.row || displayTile;
    return scaleNutrientsForWeight({ row }, selectedWeight);
  }, [displayTile, selectedWeight]);

  if (!food || !displayTile) return null;

  const per100 = getPer100Macros(displayTile);
  const liveMacros = computeMacrosForWeight(per100, selectedWeight);
  const step = selectedUnit === 'g' ? 10 : 0.25;
  const unitLabel = selectedUnit === 'g'
    ? 'grammi'
    : units.find((u) => resolveUnitIdFromUnit(u) === selectedUnit)?.label || selectedUnit;

  const handleUnitSelect = (nextUnitId) => {
    if (nextUnitId === selectedUnit) return;
    const currentWeight = selectedWeight;
    const nextUnitWeight = resolveUnitWeight(displayTile, nextUnitId);
    const nextAmount = nextUnitId === 'g'
      ? currentWeight
      : Math.max(0.25, roundToOneDecimal(currentWeight / nextUnitWeight) || 1);
    setSelectedUnit(nextUnitId);
    setAmount(nextAmount);
    window.setTimeout(() => weightInputRef.current?.focus(), 50);
  };

  const handleConfirm = () => {
    if (selectedWeight <= 0) return;
    onConfirm?.(selectedWeight);
    setJustConfirmed(true);
    window.setTimeout(() => setJustConfirmed(false), 500);
  };

  return (
    <div
      className="fixed inset-0 z-[100055] flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Dettaglio ${name}`}
      onClick={onClose}
    >
      <div
        className="vetrina-sheet-enter flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-[#050a12] text-slate-100 shadow-2xl shadow-black/50 sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => onDeepEdit?.()}
            aria-label={`Modifica ${name}`}
            className="absolute left-3 top-3 z-10 rounded-full border border-white/10 bg-slate-900/80 p-2.5 text-slate-300 backdrop-blur-sm transition-all hover:bg-slate-800 hover:text-white active:scale-95"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi scheda prodotto"
            className="absolute right-3 top-3 z-10 rounded-full border border-white/10 bg-slate-900/80 p-2.5 text-slate-300 backdrop-blur-sm transition-all hover:bg-slate-800 hover:text-white active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>

          {tileVisual?.customImage ? (
            <img src={tileVisual.customImage} alt={name} className="h-44 w-full object-cover" />
          ) : tileVisual?.semanticIconTag ? (
            <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-slate-800/90 to-slate-900">
              {renderIconFromTag(tileVisual.semanticIconTag, {
                iconClassName: 'h-16 w-16',
                wrapperClassName: 'h-28 w-28',
              })}
            </div>
          ) : (
            <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-slate-800/90 to-slate-900 text-7xl">
              <span aria-hidden>
                {tileVisual?.customEmoji || getFoodEmoji(tileVisual?.name || name)}
              </span>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <h2 className="text-xl font-bold leading-snug tracking-tight text-slate-50">{name}</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Porzione base · <span className="font-mono tabular-nums text-slate-400">{defaultUnitWeight}g</span>
          </p>

          {isInCart ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/50 px-3 py-1 text-xs font-semibold text-cyan-300">
              Nel pasto: <span className="font-mono tabular-nums">{cartWeight}g</span>
            </p>
          ) : null}

          <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-600">
            Valori per {Math.round(selectedWeight)}g
          </p>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {MACRO_BOXES.map(({ id, label, accent, bg }) => (
              <div key={id} className={`rounded-2xl border px-3 py-2.5 ${bg}`}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                <p className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${accent}`}>
                  {liveMacros[id]}
                  {id === 'kcal' ? '' : 'g'}
                </p>
              </div>
            ))}
          </div>

          <AdvancedNutrientsAccordion
            nutrients={liveNutrients}
            className="mt-4"
          />

          <p className="mt-3 text-[10px] text-slate-600">
            Base 100g: {Math.round(per100.kcal)} kcal · P{per100.prot} · C{per100.carb} · F{per100.fat}
          </p>
        </div>

        <div className="shrink-0 space-y-4 border-t border-slate-800/80 bg-slate-950/90 px-5 py-4">
          {units.length > 0 ? (
            <UnitChips
              item={displayTile}
              selectedUnit={selectedUnit}
              onSelect={handleUnitSelect}
            />
          ) : null}

          <AmountStepper
            inputRef={weightInputRef}
            value={amount}
            onChange={setAmount}
            step={step}
            unitLabel={unitLabel}
            size="lg"
            className="w-full"
          />

          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedWeight <= 0}
            className={`w-full rounded-2xl px-4 py-3.5 text-sm font-bold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 ${
              justConfirmed
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                : 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400'
            }`}
          >
            {justConfirmed ? '✓ Aggiunto' : isInCart ? 'Aggiorna pasto' : 'Aggiungi al pasto'}
          </button>
        </div>
      </div>
    </div>
  );
}
