/**
 * Ponte tra deep link vocale (App Actions) e commitAppendInboxDraft in SalaComandi.
 * Se il diario non è ancora montato, i payload restano in coda.
 */

let appendHandler = null;
const pendingPayloads = [];

export function registerInboxDraftAppendHandler(handler) {
  appendHandler = typeof handler === 'function' ? handler : null;
  if (typeof appendHandler === 'function' && pendingPayloads.length > 0) {
    const queued = pendingPayloads.splice(0, pendingPayloads.length);
    queued.forEach((payload) => {
      try {
        appendHandler(payload);
      } catch (error) {
        console.warn('[inboxDraftAppendBus] flush failed', error);
      }
    });
  }
  return () => {
    if (appendHandler === handler) appendHandler = null;
  };
}

export function enqueueInboxDraftAppend(payload) {
  if (!payload || typeof payload !== 'object') return { skipped: true };
  if (typeof appendHandler === 'function') {
    return appendHandler(payload);
  }
  pendingPayloads.push(payload);
  return { queued: true };
}
