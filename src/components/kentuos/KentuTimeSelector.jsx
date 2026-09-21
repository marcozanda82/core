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

function minutesFromClockParts(hours, minutes) {
  const h = Math.min(23, Math.max(0, Math.round(Number(hours))));
  const m = Math.min(59, Math.max(0, Math.round(Number(minutes))));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * @param {string|number|Date|null|undefined} value
 * @returns {number|null} minuti da mezzanotte, oppure null se non interpretabile
 */
export function parseTimeValueToMinutes(value, fallbackMinutes = null) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getHours() * 60 + value.getMinutes();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e11) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
    }
    if (value > 1e9) {
      const d = new Date(value * 1000);
      if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
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
    return minutesFromClockParts(match[1], match[2]);
  }

  if (fallbackMinutes != null && Number.isFinite(Number(fallbackMinutes))) {
    return wrapMinutes(fallbackMinutes);
  }
  return null;
}

/**
 * Selettore orario pasto: pill + input nativo `type=time`.
 * @param {{ value?: string|number|Date|null, onChange?: (hhmm: string) => void, disabled?: boolean, className?: string }} props
 */
export default function KentuTimeSelector({
  value,
  onChange,
  disabled = false,
  className = '',
}) {
  const rootRef = useRef(null);
  const lastValidMinutesRef = useRef(null);
  const [isTimeEditorOpen, setIsTimeEditorOpen] = useState(false);
  const parsedMinutes = useMemo(
    () => parseTimeValueToMinutes(value, null),
    [value],
  );
  if (parsedMinutes != null) {
    lastValidMinutesRef.current = wrapMinutes(parsedMinutes);
  }
  const currentMinutes = parsedMinutes != null
    ? wrapMinutes(parsedMinutes)
    : lastValidMinutesRef.current;
  const display = minutesToHHmm(
    currentMinutes != null ? currentMinutes : nowMinutes(),
  );

  const emit = useCallback((totalMinutes) => {
    if (disabled) return;
    if (totalMinutes == null || !Number.isFinite(Number(totalMinutes))) return;
    onChange?.(minutesToHHmm(totalMinutes));
  }, [disabled, onChange]);

  // Seed once when the field has no clock — avoid showing/saving 00:00.
  useEffect(() => {
    if (disabled) return undefined;
    if (parseTimeValueToMinutes(value, null) != null) return undefined;
    emit(nowMinutes());
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTimeInput = useCallback((event) => {
    const next = String(event.target.value || '').trim();
    const match = next.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return;
    const parsed = minutesFromClockParts(match[1], match[2]);
    if (parsed == null) return;
    emit(parsed);
  }, [emit]);

  const handleQuick = useCallback((offset) => {
    if (offset.id === 'now') {
      emit(nowMinutes());
      return;
    }
    const base = currentMinutes != null ? currentMinutes : nowMinutes();
    emit(wrapMinutes(base + Number(offset.minutes || 0)));
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
          onBlur={handleTimeInput}
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
