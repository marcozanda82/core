import React, { useCallback, useMemo } from 'react';

const STEP_MINUTES = 5;
const MINUTES_PER_DAY = 24 * 60;

const QUICK_OFFSETS = [
  { id: 'now', label: 'Adesso', minutes: 0 },
  { id: 'm15', label: '-15m', minutes: -15 },
  { id: 'm30', label: '-30m', minutes: -30 },
  { id: 'h1', label: '-1h', minutes: -60 },
  { id: 'h2', label: '-2h', minutes: -120 },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function wrapMinutes(totalMinutes) {
  return ((Math.round(Number(totalMinutes) || 0) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function minutesToHHmm(totalMinutes) {
  const wrapped = wrapMinutes(totalMinutes);
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

function roundToNearestStep(totalMinutes, step = STEP_MINUTES) {
  return Math.round(wrapMinutes(totalMinutes) / step) * step;
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * @param {string|number|Date|null|undefined} value
 * @returns {number} minuti da mezzanotte
 */
export function parseTimeValueToMinutes(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getHours() * 60 + value.getMinutes();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e11) {
      const d = new Date(value);
      return d.getHours() * 60 + d.getMinutes();
    }
    if (value > 1e9) {
      const d = new Date(value * 1000);
      return d.getHours() * 60 + d.getMinutes();
    }
    if (value >= 0 && value <= 24) {
      const hours = Math.min(23, Math.floor(value));
      const mins = Math.min(59, Math.round((value - Math.floor(value)) * 60));
      return hours * 60 + mins;
    }
  }

  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = Math.min(23, Math.max(0, Number(match[1])));
    const minutes = Math.min(59, Math.max(0, Number(match[2])));
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return hours * 60 + minutes;
    }
  }

  return nowMinutes();
}

function stepFromCurrent(currentMinutes, direction) {
  const step = STEP_MINUTES;
  if (direction > 0) {
    return Math.floor(currentMinutes / step) * step + step;
  }
  return Math.ceil(currentMinutes / step) * step - step;
}

/**
 * Selettore orario pasto (24h, step 5 min, offset rapidi). Nessun picker nativo OS.
 * @param {{ value?: string|number|Date|null, onChange?: (hhmm: string) => void, disabled?: boolean, className?: string }} props
 */
export default function KentuTimeSelector({
  value,
  onChange,
  disabled = false,
  className = '',
}) {
  const currentMinutes = useMemo(() => parseTimeValueToMinutes(value), [value]);
  const display = minutesToHHmm(currentMinutes);

  const emit = useCallback((totalMinutes) => {
    if (disabled) return;
    onChange?.(minutesToHHmm(totalMinutes));
  }, [disabled, onChange]);

  const handleStep = useCallback((direction) => {
    emit(stepFromCurrent(currentMinutes, direction));
  }, [currentMinutes, emit]);

  const handleOffset = useCallback((offsetMinutes) => {
    const roundedNow = roundToNearestStep(nowMinutes());
    emit(roundedNow + Number(offsetMinutes || 0));
  }, [emit]);

  return (
    <div
      className={[
        'bg-slate-900/60 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-3',
        disabled ? 'pointer-events-none opacity-40' : '',
        className,
      ].filter(Boolean).join(' ')}
      role="group"
      aria-label="Orario del pasto"
    >
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={disabled}
          aria-label="Indietro di 5 minuti"
          onClick={() => handleStep(-1)}
          className="w-9 h-9 rounded-full bg-slate-800/80 text-white hover:bg-cyan-500/20 active:scale-95 transition-all touch-manipulation select-none"
        >
          −
        </button>
        <p
          className="text-2xl font-bold font-mono text-cyan-300 tracking-wider tabular-nums"
          aria-live="polite"
        >
          {display}
        </p>
        <button
          type="button"
          disabled={disabled}
          aria-label="Avanza di 5 minuti"
          onClick={() => handleStep(1)}
          className="w-9 h-9 rounded-full bg-slate-800/80 text-white hover:bg-cyan-500/20 active:scale-95 transition-all touch-manipulation select-none"
        >
          +
        </button>
      </div>

      <div
        className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5"
        role="group"
        aria-label="Offset orario rapido"
      >
        {QUICK_OFFSETS.map((offset) => (
          <button
            key={offset.id}
            type="button"
            disabled={disabled}
            onClick={() => handleOffset(offset.minutes)}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-700 active:bg-cyan-500/30 transition-all border border-slate-700/50 touch-manipulation select-none"
          >
            {offset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
