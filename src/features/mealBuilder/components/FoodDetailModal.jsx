import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Minus, Plus, X } from 'lucide-react';
import { findDraftItemForFood } from '../utils/draftFoodMatchUtils';
import { getFoodEmoji } from '../utils/foodIconUtils';
import { FoodIconVisual } from '../utils/FoodIcons';
import { computeMacrosForWeight, getPer100Macros } from '../utils/foodMacroUtils';
import { roundToOneDecimal } from '../utils/numberFormatUtils';

const WEIGHT_STEP = 10;

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
  const [selectedWeight, setSelectedWeight] = useState(100);
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [weightInputValue, setWeightInputValue] = useState('');

  const displayTile = food?.displayTile;
  const tileVisual = food?.tileVisual;
  const defaultUnitWeight = Math.round(Number(food?.defaultUnitWeight) || 100);
  const name = displayTile?.label || displayTile?.desc || tileVisual?.name || 'Alimento';

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
    const initial = isInCart ? cartWeight : defaultUnitWeight;
    setSelectedWeight(roundToOneDecimal(initial));
    setIsEditingWeight(false);
    setWeightInputValue('');
  }, [food, defaultUnitWeight, cartWeight, isInCart]);

  if (!food || !displayTile) return null;

  const per100 = getPer100Macros(displayTile);
  const liveMacros = computeMacrosForWeight(per100, selectedWeight);
  const roundedWeight = roundToOneDecimal(selectedWeight);

  const weightFieldValue = isEditingWeight
    ? weightInputValue
    : String(roundedWeight > 0 ? roundedWeight : '');

  const handleWeightFocus = () => {
    setIsEditingWeight(true);
    setWeightInputValue(String(selectedWeight > 0 ? selectedWeight : ''));
  };

  const handleWeightChange = (event) => {
    const raw = event.target.value;
    setWeightInputValue(raw);
    if (raw === '' || raw === '.') return;
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) return;
    setSelectedWeight(next);
  };

  const handleWeightBlur = () => {
    setIsEditingWeight(false);
    const raw = weightInputValue.trim();
    if (raw === '' || raw === '.') {
      setWeightInputValue('');
      return;
    }
    setSelectedWeight(roundToOneDecimal(raw));
    setWeightInputValue('');
  };

  const handleStep = (direction) => {
    const next = Math.max(0, roundToOneDecimal(selectedWeight + direction * WEIGHT_STEP));
    setSelectedWeight(next);
  };

  const handleConfirm = () => {
    if (roundedWeight <= 0) return;
    onConfirm?.(roundedWeight);
  };

  const handleDeepEdit = () => {
    onDeepEdit?.();
  };

  return (
    <div
      className="fixed inset-0 z-[100055] flex items-end justify-center bg-black/65 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Dettaglio ${name}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-[#050a12] text-slate-100 shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={handleDeepEdit}
            aria-label={`Modifica ${name}`}
            className="absolute left-3 top-3 z-10 rounded-full bg-slate-800 p-2 text-slate-300 transition-transform active:scale-95 hover:bg-slate-700 hover:text-white"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi scheda prodotto"
            className="absolute right-3 top-3 z-10 rounded-full bg-slate-900/80 p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>

          {tileVisual?.customImage ? (
            <img
              src={tileVisual.customImage}
              alt={name}
              className="h-40 w-full object-cover"
            />
          ) : tileVisual?.customIcon ? (
            <div className="flex h-40 w-full items-center justify-center bg-slate-800/80">
              <FoodIconVisual
                iconId={tileVisual.customIcon}
                iconClassName="h-16 w-16"
                wrapperClassName="h-28 w-28"
              />
            </div>
          ) : (
            <div className="flex h-40 w-full items-center justify-center bg-slate-800/80 text-7xl">
              <span aria-hidden>
                {tileVisual?.customEmoji || getFoodEmoji(tileVisual?.name || name)}
              </span>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <h2 className="text-xl font-bold leading-snug text-slate-50">{name}</h2>
          <p className="mt-1 text-xs font-medium text-slate-400">
            Porzione base: {defaultUnitWeight}g
          </p>

          {isInCart ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3 py-1 text-xs font-medium text-cyan-300">
              <span aria-hidden>🛍️</span>
              Hai {cartWeight}g nel pasto di oggi
            </p>
          ) : null}

          <p className="mt-3 text-xs text-slate-500">
            Valori per {Math.round(roundedWeight)}g selezionati
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {MACRO_BOXES.map(({ id, label, accent, bg }) => (
              <div
                key={id}
                className={`rounded-xl border px-3 py-2.5 ${bg}`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {label}
                </p>
                <p className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${accent}`}>
                  {liveMacros[id]}
                  {id === 'kcal' ? '' : 'g'}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-[10px] text-slate-600">
            Base per 100g: {Math.round(per100.kcal)} kcal · P{per100.prot} · C{per100.carb} · F
            {per100.fat}
          </p>
        </div>

        <div className="shrink-0 space-y-3 border-t border-slate-800 bg-slate-950/90 px-4 py-4">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleStep(-1)}
              aria-label="Diminuisci peso"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-lg text-slate-200 transition-colors hover:border-slate-500 active:scale-95"
            >
              <Minus className="h-5 w-5" />
            </button>

            <div className="flex min-w-[7rem] flex-col items-center">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={weightFieldValue}
                onFocus={handleWeightFocus}
                onChange={handleWeightChange}
                onBlur={handleWeightBlur}
                aria-label={`Peso in grammi per ${name}`}
                className="w-full border-b-2 border-cyan-500/50 bg-transparent py-1 text-center font-mono text-2xl font-bold tabular-nums text-slate-100 outline-none focus:border-cyan-400"
              />
              <span className="mt-0.5 text-xs text-slate-500">grammi</span>
            </div>

            <button
              type="button"
              onClick={() => handleStep(1)}
              aria-label="Aumenta peso"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-lg text-slate-200 transition-colors hover:border-slate-500 active:scale-95"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={roundedWeight <= 0}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            {isInCart ? 'Aggiorna Carrello' : 'Aggiungi al Pasto'}
          </button>
        </div>
      </div>
    </div>
  );
}
