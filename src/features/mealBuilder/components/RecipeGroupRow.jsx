import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { roundToOneDecimal } from '../utils/numberFormatUtils';
import FoodThumbnail from './FoodThumbnail';
import DraftCartSmartRow from './DraftCartSmartRow';
import { resolveFoodVisual } from '../utils/foodIconUtils';

const numberInputClassName =
  'w-16 border-b border-slate-600 bg-transparent py-0.5 text-center text-sm text-slate-200 outline-none focus:border-cyan-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const stepButtonClassName =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 text-base text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700/80 active:scale-95';

export default function RecipeGroupRow({
  group,
  personalDb,
  onUpdateGroupWeight,
  onUpdateChildAmount,
  onRemove,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [editWeightValue, setEditWeightValue] = useState('');

  const name = group.name || group.desc || 'Ricetta';
  const visual = resolveFoodVisual(
    { desc: name, customImage: group.customImage, customEmoji: group.customEmoji },
    personalDb,
  );
  const totalWeight = roundToOneDecimal(Number(group.weight ?? group.qta) || 0);
  const kcal = Math.round(Number(group.kcal ?? group.cal) || 0);
  const prot = Math.round((Number(group.prot) || 0) * 10) / 10;
  const carb = Math.round((Number(group.carb) || 0) * 10) / 10;
  const fat = Math.round((Number(group.fatTotal ?? group.fat) || 0) * 10) / 10;
  const childCount = Array.isArray(group.items) ? group.items.length : 0;
  const weightStep = 10;

  const weightInputValue = isEditingWeight
    ? editWeightValue
    : totalWeight > 0
      ? String(totalWeight)
      : '';

  const handleWeightFocus = () => {
    setIsEditingWeight(true);
    setEditWeightValue(totalWeight > 0 ? String(totalWeight) : '');
  };

  const handleWeightChange = (event) => {
    const raw = event.target.value;
    setEditWeightValue(raw);
    if (raw === '' || raw === '.') return;
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) return;
    onUpdateGroupWeight(group.id, next);
  };

  const handleWeightBlur = () => {
    setIsEditingWeight(false);
    const raw = editWeightValue.trim();
    if (raw === '' || raw === '.') {
      setEditWeightValue('');
      return;
    }
    const rounded = roundToOneDecimal(raw);
    if (rounded !== totalWeight) {
      onUpdateGroupWeight(group.id, rounded);
    }
    setEditWeightValue('');
  };

  const handleWeightStep = (direction) => {
    const next = Math.max(0, roundToOneDecimal(totalWeight + direction * weightStep));
    onUpdateGroupWeight(group.id, next);
  };

  return (
    <li className="min-w-0 max-w-full rounded-xl border border-violet-500/25 bg-slate-900/70">
      <div className="px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <FoodThumbnail
            name={visual.name}
            customImage={visual.customImage}
            customEmoji={visual.customEmoji}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-snug text-slate-100">{name}</p>
            <p className="mt-0.5 text-[10px] text-violet-300/80">
              Ricetta · {childCount} {childCount === 1 ? 'ingrediente' : 'ingredienti'}
            </p>
          </div>
          <div className="flex shrink-0 items-start gap-1.5">
            <div className="text-right">
              <p className="text-[10px] leading-tight text-slate-500">{Math.round(totalWeight)}g</p>
              <p className="text-xs font-medium text-cyan-400/90">{kcal} kcal</p>
              <p className="text-[10px] leading-tight text-slate-500">
                P{prot} · C{carb} · F{fat}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen((prev) => !prev)}
              aria-expanded={isOpen}
              aria-label={isOpen ? 'Chiudi ingredienti ricetta' : 'Mostra ingredienti ricetta'}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <button
              type="button"
              onClick={() => onRemove(group.id)}
              aria-label={`Rimuovi ${name}`}
              className="rounded-lg px-2 py-1 text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Peso totale</span>
          <button
            type="button"
            onClick={() => handleWeightStep(-1)}
            aria-label={`Diminuisci peso totale ${name}`}
            className={stepButtonClassName}
          >
            −
          </button>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            aria-label={`Peso totale ${name}`}
            value={weightInputValue}
            onFocus={handleWeightFocus}
            onChange={handleWeightChange}
            onBlur={handleWeightBlur}
            className={numberInputClassName}
          />
          <span className="text-xs text-slate-500">g</span>
          <button
            type="button"
            onClick={() => handleWeightStep(1)}
            aria-label={`Aumenta peso totale ${name}`}
            className={stepButtonClassName}
          >
            +
          </button>
        </div>
      </div>

      {isOpen ? (
        <ul className="space-y-2 border-t border-violet-500/15 px-2 py-2">
          {(group.items || []).map((child) => (
            <DraftCartSmartRow
              key={child.id}
              embedded
              item={child}
              personalDb={personalDb}
              onUpdateAmount={(childId, multiplier, unitId) =>
                onUpdateChildAmount(group.id, childId, multiplier, unitId)
              }
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
