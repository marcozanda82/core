/**
 * Distingue messaggi AI generativi / dialogici dalle notifiche di sistema transazionali.
 */

const RICH_TYPES = new Set([
  'ADVICE',
  'ASK_CLARIFICATION',
  'REQUEST_FOOD_PHOTO',
  'NEW_FOOD_PREVIEW',
  'MEAL_DRAFT',
  'WORKOUT_DRAFT',
  'MEAL_RECEIPT',
  'DAILY_PLAN',
  'MEAL_PROPOSAL',
]);

const SUCCESS_RE =
  /\b(aggiunt[oi]|salvato|salvata|registrato|registrata|confermato|confermata|caricato|caricata|inserito|inserita|aggiornato|aggiornata)\b/i;
const CANCEL_RE =
  /\b(annullat[oa]|cancellat[oa]|generazione annullata|bozza annullata|modifica\s+pasto\s+annullata|inserimento\s+annullato|operazion[ei]\s+interrott)\b/i;
const ERROR_RE =
  /\b(fallit[oa]|errore|non\s+disponibile|problema|non\s+(riesco|trovo))\b/i;

const MEAL_ICON_RE =
  /\b(carrello|pasto|alimento|alimenti|cibo|cibi|cena|pranzo|colazione|spuntino|diario|food)\b/i;
const MACRO_ICON_RE =
  /\b(macro|macronutrient|usda|scomposizion|kcal|calorie|proteine|carboidrati|grassi|nutrienti|analisi\s+macro)\b/i;
const WORKOUT_ICON_RE =
  /\b(allenament|workout|esercizio|esercizi|sessione|palestra|cardio|spinta|trazione|gambe)\b/i;
const RECALIBRATE_ICON_RE =
  /\b(ricalibr|ricalcol|aggiornament[oi]\s+di\s+sistema|bmr|tdee|target\s+caloric|fabbisogn|budget\s+caloric|obiettiv[oi]\s+caloric)\b/i;

/** Frasi corte tipiche senza dialogo (nessun «?»). */
const EXACT_SYSTEM_RE =
  /^(aggiunt[oi]\s+al\s+carrello\.?|perfetto,?\s+pasto\s+salvato\.?|ok,?\s+bozza\s+annullata\.?|ok,?\s+wizard\s+annullato\.?|inserimento\s+annullato\.?|generazione\s+annullata\.?|modifica\s+pasto\s+annullata\.?|inserito\s+come\s+suggerito\.?)$/i;

/** @typedef {'meal' | 'macro' | 'workout' | 'cancel' | 'recalibrate'} SystemNoticeIconKind */

export const SYSTEM_NOTICE_ICONS = {
  meal: {
    src: '/pasto_registrato.png',
    alt: 'Pasto registrato',
  },
  macro: {
    src: '/analisi_macro.png',
    alt: 'Analisi macro',
  },
  workout: {
    src: '/allenamento_registrato.png',
    alt: 'Allenamento registrato',
  },
  cancel: {
    src: '/inserimento_annullato.png',
    alt: 'Inserimento annullato',
  },
  recalibrate: {
    src: '/ricalibrazione.png',
    alt: 'Ricalibrazione',
  },
};

function normalizeNoticeText(text) {
  return String(text || '')
    .replace(/^[\s]*[✅⚠️❌🛑🛌📋🗑️⚡📷]+[\s]*/u, '')
    .trim();
}

function hasRichInteractivePayload(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.mealProposal || msg.dailyPlan || msg.mealDraft || msg.workoutDraft || msg.mealReceipt) return true;
  if (msg.suggestedAction || msg.newFoodDraft) return true;
  if (Array.isArray(msg.mealProposals) && msg.mealProposals.length > 0) return true;
  if (Array.isArray(msg.wipSuggestions) && msg.wipSuggestions.length > 0) return true;
  if (msg.clarification === true || msg.requestFoodPhoto === true) return true;
  if (Array.isArray(msg.quickReplies) && msg.quickReplies.length > 0) return true;
  const type = String(msg.type || '').trim().toUpperCase();
  if (type && RICH_TYPES.has(type)) return true;
  return false;
}

function looksLikeTransactionalNotice(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  // Domande / inviti al dialogo → restano messaggi AI.
  if (/[?]/.test(raw) || /\b(cos['’]altro|dimmi|raccont|vuoi|posso|quando|quanto|quale)\b/i.test(raw)) {
    return false;
  }
  const cleaned = normalizeNoticeText(raw);
  if (!cleaned) return false;
  if (cleaned.length > 140) return false;
  if (EXACT_SYSTEM_RE.test(cleaned)) return true;
  if (
    SUCCESS_RE.test(cleaned)
    || CANCEL_RE.test(cleaned)
    || ERROR_RE.test(cleaned)
    || MACRO_ICON_RE.test(cleaned)
    || WORKOUT_ICON_RE.test(cleaned)
    || RECALIBRATE_ICON_RE.test(cleaned)
  ) {
    // Evita frasi narrative lunghe che citano casualmente "salvato".
    return cleaned.length <= 110 && cleaned.split(/\n/).length <= 2;
  }
  return false;
}

/**
 * @param {object|null|undefined} msg
 * @returns {boolean}
 */
export function isSystemNoticeMessage(msg) {
  if (!msg || msg.sender !== 'ai' || msg.isTyping) return false;
  if (hasRichInteractivePayload(msg)) return false;

  const type = String(msg.type || '').trim().toLowerCase();
  if (type === 'system' || type === 'error') return true;
  if (msg.kind === 'system' || msg.isSystem === true || msg.isError === true) return true;

  return looksLikeTransactionalNotice(msg.text);
}

/**
 * @param {object|null|undefined} msg
 * @returns {'success' | 'cancel' | 'error' | 'neutral'}
 */
export function getSystemNoticeTone(msg) {
  if (!msg) return 'neutral';
  if (msg.isError === true || String(msg.type || '').toUpperCase() === 'ERROR') return 'error';

  const text = normalizeNoticeText(msg.text);
  if (CANCEL_RE.test(text)) return 'cancel';
  if (ERROR_RE.test(text)) return 'error';
  if (SUCCESS_RE.test(text) || EXACT_SYSTEM_RE.test(text)) return 'success';
  return 'neutral';
}

/**
 * Seleziona l'icona 3D in `public/` in base a intent / testo.
 * @param {object|null|undefined} msg
 * @returns {SystemNoticeIconKind}
 */
export function getSystemNoticeIconKind(msg) {
  if (!msg) return 'meal';

  const explicit = String(
    msg.systemIcon || msg.noticeIcon || msg.iconKind || msg.systemNoticeKind || '',
  ).trim().toLowerCase();
  if (explicit === 'meal' || explicit === 'pasto' || explicit === 'pasto_registrato') return 'meal';
  if (explicit === 'macro' || explicit === 'analisi_macro' || explicit === 'usda') return 'macro';
  if (explicit === 'workout' || explicit === 'allenamento' || explicit === 'allenamento_registrato') {
    return 'workout';
  }
  if (explicit === 'cancel' || explicit === 'annullato' || explicit === 'inserimento_annullato') {
    return 'cancel';
  }
  if (explicit === 'recalibrate' || explicit === 'ricalibrazione' || explicit === 'ricalcolo') {
    return 'recalibrate';
  }

  if (msg.isError === true || String(msg.type || '').toUpperCase() === 'ERROR') return 'cancel';

  const text = normalizeNoticeText(msg.text);
  if (CANCEL_RE.test(text) || ERROR_RE.test(text)) return 'cancel';
  if (WORKOUT_ICON_RE.test(text)) return 'workout';
  if (MACRO_ICON_RE.test(text)) return 'macro';
  if (RECALIBRATE_ICON_RE.test(text)) return 'recalibrate';
  if (MEAL_ICON_RE.test(text) || EXACT_SYSTEM_RE.test(text) || SUCCESS_RE.test(text)) return 'meal';

  return 'meal';
}

/**
 * @param {object|null|undefined} msg
 * @returns {{ src: string, alt: string, kind: SystemNoticeIconKind }}
 */
export function getSystemNoticeIcon(msg) {
  const kind = getSystemNoticeIconKind(msg);
  const asset = SYSTEM_NOTICE_ICONS[kind] || SYSTEM_NOTICE_ICONS.meal;
  return { ...asset, kind };
}

/**
 * Testo display senza emoji di stato redundant (l'icona le sostituisce).
 * @param {unknown} text
 * @returns {string}
 */
export function formatSystemNoticeText(text) {
  return normalizeNoticeText(text) || String(text || '').trim() || '—';
}
