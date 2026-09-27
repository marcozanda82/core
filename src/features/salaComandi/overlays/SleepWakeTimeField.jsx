import React, { useCallback, useMemo, useRef } from 'react';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Normalizza `HH:mm` / `HH:mm:ss` per input time e select. */
export function normalizeWakeTimeStr(raw, fallback = '07:00') {
  const match = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hours = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const minutes = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return `${pad2(hours)}:${pad2(minutes)}`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => pad2(i));

const selectStyle = {
  flex: 1,
  minWidth: 0,
  padding: '12px 8px',
  borderRadius: '10px',
  background: '#0f1115',
  border: '1px solid #334155',
  color: '#fff',
  fontSize: '1.05rem',
  fontWeight: 700,
  textAlign: 'center',
  colorScheme: 'dark',
  boxSizing: 'border-box',
};

/**
 * Ora risveglio: select ore/minuti (affidabili su Android WebView) +
 * `type="time"` con showPicker, senza preventDefault sul wrapper.
 */
export default function SleepWakeTimeField({
  value,
  onChange,
  fieldStyle,
}) {
  const timeInputRef = useRef(null);
  const hhmm = useMemo(() => normalizeWakeTimeStr(value), [value]);
  const [hours, minutes] = hhmm.split(':');

  const emit = useCallback((next) => {
    const normalized = normalizeWakeTimeStr(next, hhmm);
    if (normalized !== hhmm) onChange?.(normalized);
  }, [hhmm, onChange]);

  const handleTimeChange = useCallback((event) => {
    const next = String(event.target.value || '').trim();
    // Android a volte emette "" durante lo spinner: non sovrascrivere.
    if (!next) return;
    emit(next);
  }, [emit]);

  const stopBubble = useCallback((event) => {
    event.stopPropagation();
  }, []);

  const openNativePicker = useCallback((event) => {
    event.stopPropagation();
    const input = timeInputRef.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.focus();
        input.click();
      }
    } catch {
      input.focus();
    }
  }, []);

  return (
    <div
      style={{ display: 'flex', alignItems: 'stretch', gap: '8px', position: 'relative' }}
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      onClick={stopBubble}
      onTouchStart={stopBubble}
    >
      <label style={{ flex: 1, margin: 0 }}>
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Ore</span>
        <select
          aria-label="Ora di risveglio"
          value={hours}
          onChange={(event) => emit(`${event.target.value}:${minutes}`)}
          style={selectStyle}
        >
          {HOUR_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <span
        aria-hidden
        style={{
          alignSelf: 'center',
          color: '#94a3b8',
          fontWeight: 800,
          fontSize: '1.1rem',
        }}
      >
        :
      </span>
      <label style={{ flex: 1, margin: 0 }}>
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>Minuti</span>
        <select
          aria-label="Minuti di risveglio"
          value={minutes}
          onChange={(event) => emit(`${hours}:${event.target.value}`)}
          style={selectStyle}
        >
          {MINUTE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-label="Apri orologio"
        onClick={openNativePicker}
        style={{
          width: 48,
          flexShrink: 0,
          borderRadius: '10px',
          border: '1px solid #334155',
          background: '#0f1115',
          color: '#22d3ee',
          fontSize: '1.15rem',
          cursor: 'pointer',
        }}
      >
        🕒
      </button>
      <input
        ref={timeInputRef}
        type="time"
        step={60}
        value={hhmm}
        onChange={handleTimeChange}
        onInput={handleTimeChange}
        tabIndex={-1}
        aria-hidden
        style={{
          ...(fieldStyle || {}),
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
          colorScheme: 'dark',
        }}
      />
    </div>
  );
}
