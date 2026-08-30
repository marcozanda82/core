import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MINUTES_PER_DAY = 24 * 60;

const QUICK_OFFSETS = [
  { id: 'now', label: 'Adesso', minutes: 0 },
  { id: 'm15', label: '-15m', minutes: -15 },
  { id: 'm30', label: '-30m', minutes: -30 },
  { id: 'h1', label: '-1h', minutes: -60 },
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

/**
 * Selettore orario pasto: pill compatta, input nativo, offset cumulativi.
 * @param {{ value?: string|number|Date|null, onChange?: (hhmm: string) => void, disabled?: boolean, className?: string }} props
 */
export default function KentuTimeSelector({
  value,
  onChange,
  disabled = false,
  className = '',
}) {
  const rootRef = useRef(null);
  const [isTimeEditorOpen, setIsTimeEditorOpen] = useState(false);
  const currentMinutes = useMemo(() => parseTimeValueToMinutes(value), [value]);
  const display = minutesToHHmm(currentMinutes);

  const emit = useCallback((totalMinutes) => {
    if (disabled) return;
    onChange?.(minutesToHHmm(totalMinutes));
  }, [disabled, onChange]);

  const handleTimeInput = useCallback((event) => {
    const next = String(event.target.value || '').trim();
    if (!next) return;
    emit(parseTimeValueToMinutes(next));
  }, [emit]);

  const handleQuick = useCallback((offset) => {
    if (offset.id === 'now') {
      emit(nowMinutes());
      return;
    }
    emit(wrapMinutes(currentMinutes + Number(offset.minutes || 0)));
  }, [currentMinutes, emit]);

  const toggleEditor = useCallback(() => {
    if (disabled) return;
    setIsTimeEditorOpen((open) => !open);
  }, [disabled]);

  useEffect(() => {
    if (!isTimeEditorOpen) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsTimeEditorOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [isTimeEditorOpen]);

  return (
    <div
      ref={rootRef}
      className={[
        'relative inline-flex flex-col items-end',
        disabled ? 'pointer-events-none opacity-40' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div
        className={[
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
          'border-white/15 bg-slate-900/80 backdrop-blur-sm',
          isTimeEditorOpen ? 'border-cyan-400/40' : '',
        ].filter(Boolean).join(' ')}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={toggleEditor}
          aria-expanded={isTimeEditorOpen}
          aria-label={isTimeEditorOpen ? 'Chiudi modifica orario' : 'Apri modifica orario'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base leading-none text-cyan-300 hover:bg-white/5"
        >
          🕒
        </button>
        <input
          type="time"
          value={display}
          disabled={disabled}
          onChange={handleTimeInput}
          onFocus={() => {
            if (!disabled) setIsTimeEditorOpen(true);
          }}
          aria-label="Orario del pasto"
          className={[
            'w-[5.6rem] bg-transparent border-none outline-none appearance-none',
            'cursor-pointer text-cyan-400 font-bold text-lg tabular-nums',
            'p-0 m-0 leading-none',
            '[color-scheme:dark]',
            '[&::-webkit-calendar-picker-indicator]:opacity-0',
            '[&::-webkit-calendar-picker-indicator]:absolute',
            '[&::-webkit-datetime-edit]:p-0',
            '[&::-webkit-datetime-edit-fields-wrapper]:p-0',
          ].join(' ')}
        />
      </div>

      {isTimeEditorOpen ? (
        <div
          className="z-20 mt-1.5 flex flex-wrap items-center justify-end gap-1"
          role="group"
          aria-label="Offset orario rapido"
        >
          {QUICK_OFFSETS.map((offset) => (
            <button
              key={offset.id}
              type="button"
              disabled={disabled}
              onClick={() => handleQuick(offset)}
              className={[
                'rounded-lg border border-slate-700/50 bg-slate-800/80 px-2 py-1',
                'text-[11px] font-medium text-slate-300',
                'hover:bg-slate-700 hover:text-white active:bg-cyan-500/30',
                'touch-manipulation select-none',
              ].join(' ')}
            >
              {offset.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
