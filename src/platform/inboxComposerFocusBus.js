/**
 * Apre la vista Inbox (sottomenu Pasti) e il campo testo per una bozza vocale vuota.
 */

const handlers = new Map();
let pendingOpen = false;

export function subscribeInboxComposerFocus(handler, { embedded = false } = {}) {
  if (typeof handler !== 'function') return () => {};
  const id = Symbol('inbox-composer');
  handlers.set(id, { embedded: Boolean(embedded), fn: handler });
  if (pendingOpen) {
    pendingOpen = false;
    const target = [...handlers.values()].find((item) => item.embedded) || handlers.get(id);
    target?.fn?.();
  }
  return () => {
    handlers.delete(id);
  };
}

export function requestOpenInboxComposer() {
  const list = [...handlers.values()];
  const target = list.find((item) => item.embedded) || list[0];
  if (typeof target?.fn !== 'function') {
    pendingOpen = true;
    return { queued: true };
  }
  target.fn();
  return { opened: true };
}
