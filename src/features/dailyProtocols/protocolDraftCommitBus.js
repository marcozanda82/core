/**
 * Ponte tra l'approvazione del protocollo e `addActivityDraft` in SalaComandi.
 * Se il diario non è ancora montato, i payload restano in coda.
 */

let commitHandler = null;
const pendingPayloads = [];

export function registerProtocolDraftCommitHandler(handler) {
  commitHandler = typeof handler === 'function' ? handler : null;
  if (typeof commitHandler === 'function' && pendingPayloads.length > 0) {
    const queued = pendingPayloads.splice(0, pendingPayloads.length);
    queued.forEach((payload) => {
      try {
        commitHandler(payload);
      } catch (error) {
        console.warn('[protocolDraftCommitBus] flush failed', error);
      }
    });
  }
  return () => {
    if (commitHandler === handler) commitHandler = null;
  };
}

export function enqueueProtocolActivityDrafts(payload) {
  if (!payload || typeof payload !== 'object') return { skipped: true };
  if (typeof commitHandler === 'function') {
    return commitHandler(payload);
  }
  pendingPayloads.push(payload);
  return { queued: true };
}
