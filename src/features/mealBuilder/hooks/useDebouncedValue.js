import { useEffect, useState } from 'react';

/**
 * Ritarda l'aggiornamento del valore (es. query ricerca) per evitare lavoro pesante a ogni keystroke.
 * @param {*} value
 * @param {number} delayMs
 */
export function useDebouncedValue(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), Math.max(0, delayMs));
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export default useDebouncedValue;
