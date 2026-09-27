export const DRAFT_TYPES = Object.freeze({
  meal: 'meal',
  workout: 'workout',
  unknown: 'unknown',
});

const MEAL_KEYWORDS = [
  'mangiato',
  'pranzo',
  'cena',
  'colazione',
  'pane',
  'sardine',
];

const WORKOUT_KEYWORDS = [
  'fatto',
  'allenamento',
  'addominali',
  'pettorali',
  'manubri',
  'corsa',
  'passi',
];

function includesKeyword(haystack, keywords) {
  return keywords.some((keyword) => haystack.includes(keyword));
}

/**
 * Pre-categorizza una bozza vocale dal testo intero.
 * @param {string} rawText
 * @returns {'meal' | 'workout' | 'unknown'}
 */
export function inferDraftType(rawText) {
  const haystack = String(rawText || '').toLowerCase();
  if (!haystack.trim()) return DRAFT_TYPES.unknown;
  if (includesKeyword(haystack, MEAL_KEYWORDS)) return DRAFT_TYPES.meal;
  if (includesKeyword(haystack, WORKOUT_KEYWORDS)) return DRAFT_TYPES.workout;
  return DRAFT_TYPES.unknown;
}

export function isDraftType(value) {
  return value === DRAFT_TYPES.meal
    || value === DRAFT_TYPES.workout
    || value === DRAFT_TYPES.unknown;
}

/**
 * Bozza Inbox in attesa di convalida utente.
 * @param {string} rawText
 * @param {{ id?: string, timestamp?: number }} [extras]
 */
export function createPendingInboxDraft(rawText, extras = {}) {
  const text = String(rawText || '').trim();
  const timestamp = Number(extras.timestamp);
  const stamp = Number.isFinite(timestamp) && timestamp > 0 ? Math.round(timestamp) : Date.now();
  const id = String(extras.id || '').trim()
    || `inbox_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    rawText: text,
    inferredType: inferDraftType(text),
    timestamp: stamp,
    status: 'pending',
  };
}

export function toastMessageForDraftType(inferredType) {
  if (inferredType === DRAFT_TYPES.meal) {
    return 'Bozza pasto salvata in attesa di convalida';
  }
  if (inferredType === DRAFT_TYPES.workout) {
    return 'Bozza allenamento registrata';
  }
  return 'Bozza salvata in attesa di convalida';
}
