import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { roundToOneDecimal } from '../utils/numberFormatUtils';

const btnBase =
  'flex shrink-0 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/90 text-slate-200 shadow-sm transition-all duration-150 hover:border-slate-500 hover:bg-slate-700/80 active:scale-90';

/**
 * Stepper quantità riutilizzabile (carrello, modale dettaglio, tile).
 */
export default function AmountStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  unitLabel = '',
  size = 'md',
  onConfirm = null,
  confirmLabel = null,
  justConfirmed = false,
  inputRef = null,
  autoFocusInput = false,
  className = '',
}) {
  const rounded = roundToOneDecimal(value);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const sizeConfig =
    size === 'lg'
      ? { btn: 'h-12 w-12', input: 'text-2xl', gap: 'gap-3' }
      : size === 'sm'
        ? { btn: 'h-8 w-8', input: 'text-sm', gap: 'gap-1.5' }
        : { btn: 'h-10 w-10', input: 'text-lg', gap: 'gap-2' };

  useEffect(() => {
    if (!isEditing) setEditValue('');
  }, [rounded, isEditing]);

  const handleStep = (direction) => {
    const next = Math.max(min, roundToOneDecimal(rounded + direction * step));
    onChange(next);
  };

  const handleFocus = () => {
    setIsEditing(true);
    setEditValue(rounded > 0 ? String(rounded) : '');
  };

  const handleInputChange = (event) => {
    const raw = event.target.value;
    setEditValue(raw);
    if (raw === '' || raw === '.') return;
    const next = Number(raw);
    if (!Number.isFinite(next) || next < min) return;
    onChange(next);
  };

  const handleBlur = () => {
    setIsEditing(false);
    const raw = editValue.trim();
    if (raw === '' || raw === '.') {
      setEditValue('');
      return;
    }
    const next = roundToOneDecimal(raw);
    if (next !== rounded) onChange(next);
    setEditValue('');
  };

  const displayValue = isEditing
    ? editValue
    : rounded > 0
      ? String(rounded)
      : '';

  return (
    <div className={`flex items-center justify-center ${sizeConfig.gap} ${className}`}>
      <button
        type="button"
        onClick={() => handleStep(-1)}
        aria-label="Diminuisci quantità"
        className={`${btnBase} ${sizeConfig.btn}`}
      >
        <Minus className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} strokeWidth={2.5} />
      </button>

      <div className="flex min-w-[4.5rem] flex-col items-center">
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          step="any"
          min={min}
          value={displayValue}
          onFocus={handleFocus}
          onChange={handleInputChange}
          onBlur={handleBlur}
          autoFocus={autoFocusInput}
          aria-label={`Quantità${unitLabel ? ` in ${unitLabel}` : ''}`}
          className={`w-full border-b-2 border-cyan-500/40 bg-transparent py-0.5 text-center font-mono font-bold tabular-nums text-slate-100 outline-none transition-colors focus:border-cyan-400 ${sizeConfig.input} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        />
        {unitLabel ? (
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {unitLabel}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => handleStep(1)}
        aria-label="Aumenta quantità"
        className={`${btnBase} ${sizeConfig.btn}`}
      >
        <Plus className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} strokeWidth={2.5} />
      </button>

      {onConfirm ? (
        <button
          type="button"
          onClick={onConfirm}
          aria-label={confirmLabel || 'Conferma'}
          className={`ml-1 flex shrink-0 items-center justify-center rounded-xl px-4 py-2 text-sm font-bold transition-all duration-200 active:scale-95 ${
            justConfirmed
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
              : 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400'
          }`}
        >
          {confirmLabel || 'OK'}
        </button>
      ) : null}
    </div>
  );
}
