/**
 * Decide se serve una scelta utente. Le stime e le piccole differenze non bastano.
 * Canale: tray, mai cascata di domande in chat.
 */

export function shouldAskMealClarification(item = {}) {
  if (!item || typeof item !== 'object') {
    return { ask: false, channel: 'none', reason: 'empty' };
  }

  if (item.identityAmbiguous === true) {
    return { ask: true, channel: 'tray', reason: 'identity' };
  }

  const status = String(item.status || '').toLowerCase();
  if (status === 'requires_disambiguation' || status === 'pending_enrichment') {
    const alts = Array.isArray(item.alternatives) ? item.alternatives : [];
    const cands = Array.isArray(item.candidates) ? item.candidates : [];
    if (alts.length + cands.length >= 2) {
      return { ask: true, channel: 'tray', reason: 'identity' };
    }
  }

  if (item.quantitySource === 'estimated' || item.restaurantGuess === true) {
    return { ask: false, channel: 'none', reason: 'estimate_ok' };
  }

  return { ask: false, channel: 'none', reason: 'resolved' };
}

export function mealUsesTrayAsPrimaryCorrection() {
  return true;
}

/**
 * Interazioni stimate fino al save: input + tap disambiguazione in tray + save.
 * Nessun follow-up chat per le stime.
 */
export function estimateAssistedSaveInteractions(draft = {}) {
  const items = Array.isArray(draft?.items) ? draft.items : [];
  const disambiguationTaps = items.filter((item) => shouldAskMealClarification(item).ask).length;
  const chatFollowups = 0;
  const save = items.length > 0 ? 1 : 0;
  return {
    input: 1,
    disambiguationTaps,
    chatFollowups,
    save,
    total: 1 + disambiguationTaps + save,
  };
}
