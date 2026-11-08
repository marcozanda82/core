/**
 * Apre la destinazione inserimento pasti (AI picker / manuale) da fuori Pulsantiera.
 * Usato dallo switch in FastMealLogger → Guidato AI senza riaprire il hub Pasti.
 */

const handlers = new Map();
/** @type {'ai'|'manual'|null} */
let pendingMode = null;

/**
 * @param {(mode: 'ai'|'manual') => void} handler
 * @param {{ embedded?: boolean }} [opts]
 */
export function subscribeMealEntryOpen(handler, { embedded = false } = {}) {
  if (typeof handler !== 'function') return () => {};
  const id = Symbol('meal-entry-open');
  handlers.set(id, { embedded: Boolean(embedded), fn: handler });
  if (pendingMode) {
    const mode = pendingMode;
    pendingMode = null;
    const list = [...handlers.values()];
    // Preferisci la pulsantiera chat (non embedded) se presente — evita overlay nascosti sotto Home.
    const target = list.find((item) => !item.embedded) || handlers.get(id);
    target?.fn?.(mode);
  }
  return () => {
    handlers.delete(id);
  };
}

/**
 * @param {'ai'|'manual'|string} mode
 */
export function requestOpenMealEntry(mode) {
  const normalized = mode === 'manual' ? 'manual' : 'ai';
  const list = [...handlers.values()];
  const target = list.find((item) => !item.embedded) || list[0];
  if (typeof target?.fn !== 'function') {
    pendingMode = normalized;
    return { queued: true };
  }
  target.fn(normalized);
  return { opened: true };
}
