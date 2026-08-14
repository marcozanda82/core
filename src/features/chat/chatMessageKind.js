/**
 * Distingue messaggi AI generativi / dialogici dalle notifiche di sistema transazionali.
 */

const RICH_TYPES = new Set([
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
  /\b(carrello|pasto|alimento|alimenti|cibo|cibi|cena|pranzo|colazione|spuntino|diario|food|registrat[oa])\b/i;
const MACRO_ICON_RE =
  /\b(macro|macronutrient|usda|scomposizion|kcal|calorie|proteine|carboidrati|grassi|nutrienti|analisi\s+macro)\b/i;
const WORKOUT_ICON_RE =
  /\b(allenament|workout|esercizio|esercizi|sessione|palestra|cardio|spinta|trazione|gambe)\b/i;
const RECALIBRATE_ICON_RE =
  /\b(ricalibr|ricalcol|aggiornament[oi]\s+di\s+sistema|bmr|tdee|target\s+caloric|fabbisogn|budget\s+caloric|obiettiv[oi]\s+caloric)\b/i;

/** Frasi corte tipiche senza dialogo (nessun «?»). */
const EXACT_SYSTEM_RE =
  /^(aggiunt[oi]\s+al\s+carrello\.?|perfetto,?\s+pasto\s+salvato\.?|ok,?\s+bozza\s+annullata\.?|ok,?\s+wizard\s+annullato\.?|inserimento\s+annullato\.?|generazione\s+annullata\.?|modifica\s+pasto\s+annullata\.?|inserito\s+come\s+suggerito\.?)$/i;

/** Avatar 3D per operazioni annullate / bozze scartate. */
export const CHAT_CANCEL_AVATAR_SRC = '/annulla2.png';

/** Avatar 3D universale per conferme di inserimento e successo. */
export const CHAT_SUCCESS_AVATAR_SRC = '/flag2.png';

/** @typedef {'meal' | 'macro' | 'workout' | 'cancel' | 'recalibrate' | 'success'} SystemNoticeIconKind */

export const SYSTEM_NOTICE_ICONS = {
  success: {
    src: CHAT_SUCCESS_AVATAR_SRC,
    alt: 'Operazione completata',
  },
  meal: {
    src: CHAT_SUCCESS_AVATAR_SRC,
    alt: 'Pasto registrato',
  },
  macro: {
    src: '/analisi_macro.png',
    alt: 'Analisi macro',
  },
  workout: {
    src: CHAT_SUCCESS_AVATAR_SRC,
    alt: 'Allenamento registrato',
  },
  cancel: {
    src: CHAT_CANCEL_AVATAR_SRC,
    alt: 'Operazione annullata',
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
  if (msg.liveMealTray || msg.type === 'MCDRIVE_TRAY' || msg.mcdriveWizard === true) return true;
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
 * Chrome UI «system notice» anche se il messaggio ha allegati (proposal card, etc.).
 * Usato per evitare l'avatar AI su ack brevi tipo «Aggiunti al carrello».
 * @param {object|null|undefined} msg
 * @returns {boolean}
 */
export function shouldRenderSystemNoticeChrome(msg) {
  if (!msg || msg.sender !== 'ai' || msg.isTyping) return false;
  if (msg.mealReceipt && typeof msg.mealReceipt === 'object') return false;
  if (msg.liveMealTray || msg.type === 'MCDRIVE_TRAY' || msg.mcdriveWizard === true) return false;
  if (msg.mealDraft || msg.workoutDraft || msg.mealProposal || msg.dailyPlan) return false;
  if (msg.clarification === true || msg.requestFoodPhoto === true) return false;
  if (msg.type === 'ASK_CLARIFICATION' || msg.type === 'REQUEST_FOOD_PHOTO') return false;
  if (msg.type === 'NEW_FOOD_PREVIEW' || msg.newFoodDraft) return false;
  if (Array.isArray(msg.quickReplies) && msg.quickReplies.length > 0 && msg.clarification === true) {
    return false;
  }

  const type = String(msg.type || '').trim().toLowerCase();
  if (type === 'success_confirmation' || type === 'system' || type === 'error') return true;
  if (msg.kind === 'system' || msg.isSystem === true || msg.isError === true) return true;
  return looksLikeTransactionalNotice(msg.text);
}

/**
 * @param {object|null|undefined} msg
 * @returns {boolean}
 */
export function isSystemNoticeMessage(msg) {
  if (!shouldRenderSystemNoticeChrome(msg)) return false;
  if (hasRichInteractivePayload(msg)) return false;
  return true;
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
 * Messaggio di conferma inserimento / successo (avatar bandiera verde).
 * @param {object|null|undefined} msg
 * @returns {boolean}
 */
export function isSuccessConfirmationMessage(msg) {
  if (!msg || msg.isTyping || msg.sender !== 'ai') return false;

  const type = String(msg.type || '').trim().toUpperCase();
  if (type === 'SUCCESS_CONFIRMATION' || type === 'MEAL_RECEIPT') return true;
  if (msg.mealReceipt && typeof msg.mealReceipt === 'object') return true;

  const intent = String(msg.intent || msg.commandIntent || '').trim().toUpperCase();
  if (
    intent === 'LOG_MEAL_SUCCESS'
    || intent === 'LOG_WORKOUT_SUCCESS'
    || intent === 'LOG_HABIT_SUCCESS'
  ) {
    return true;
  }

  if (msg.isError === true || type === 'ERROR') return false;
  if (getSystemNoticeTone(msg) === 'cancel' || getSystemNoticeTone(msg) === 'error') return false;

  if (type === 'SYSTEM' || msg.kind === 'system' || msg.isSystem === true) {
    return getSystemNoticeTone(msg) === 'success';
  }

  const text = normalizeNoticeText(msg.text);
  if (!text || text.length > 110) return false;
  if (/[?]/.test(String(msg.text || ''))) return false;
  return SUCCESS_RE.test(text) || EXACT_SYSTEM_RE.test(text);
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
  if (explicit === 'success' || explicit === 'flag' || explicit === 'conferma') return 'success';
  if (explicit === 'macro' || explicit === 'analisi_macro' || explicit === 'usda') return 'macro';
  if (explicit === 'workout' || explicit === 'allenamento' || explicit === 'allenamento_registrato') {
    return 'workout';
  }
  if (explicit === 'cancel' || explicit === 'annullato' || explicit === 'annulla' || explicit === 'inserimento_annullato') {
    return 'cancel';
  }
  if (explicit === 'recalibrate' || explicit === 'ricalibrazione' || explicit === 'ricalcolo') {
    return 'recalibrate';
  }

  if (msg.isError === true || String(msg.type || '').toUpperCase() === 'ERROR') return 'cancel';

  const text = normalizeNoticeText(msg.text);
  if (CANCEL_RE.test(text) || ERROR_RE.test(text)) return 'cancel';
  if (SUCCESS_RE.test(text) || EXACT_SYSTEM_RE.test(text)) return 'success';
  if (WORKOUT_ICON_RE.test(text)) return 'workout';
  if (MACRO_ICON_RE.test(text)) return 'macro';
  if (RECALIBRATE_ICON_RE.test(text)) return 'recalibrate';
  if (MEAL_ICON_RE.test(text)) return 'meal';

  return 'meal';
}

/**
 * @param {object|null|undefined} msg
 * @returns {{ src: string, alt: string, kind: SystemNoticeIconKind }}
 */
export function getSystemNoticeIcon(msg) {
  const kind = getSystemNoticeIconKind(msg);
  const asset = SYSTEM_NOTICE_ICONS[kind] || SYSTEM_NOTICE_ICONS.meal;
  const explicitAsset = String(msg?.avatarAsset || '').trim();
  if (explicitAsset) {
    return { src: explicitAsset, alt: asset.alt, kind };
  }
  return { ...asset, kind };
}

/**
 * Arricchisce payload messaggio system con icona/avatar cancel quando pertinente.
 * @param {string} text
 * @param {object} [extra]
 * @returns {object}
 */
export function withSystemNoticeDefaults(text, extra = {}) {
  const merged = { sender: 'ai', text, ...extra };
  const tone = getSystemNoticeTone(merged);

  if (tone === 'cancel') {
    return {
      ...extra,
      type: extra.type || 'system',
      systemIcon: extra.systemIcon || extra.noticeIcon || 'cancel',
      avatarAsset: extra.avatarAsset || CHAT_CANCEL_AVATAR_SRC,
    };
  }

  if (tone === 'success' || isSuccessConfirmationMessage(merged)) {
    return {
      ...extra,
      type: extra.type || 'system',
      systemIcon: extra.systemIcon || extra.noticeIcon || 'success',
      avatarAsset: extra.avatarAsset || CHAT_SUCCESS_AVATAR_SRC,
    };
  }

  return extra;
}

/**
 * Testo display senza emoji di stato redundant (l'icona le sostituisce).
 * @param {unknown} text
 * @returns {string}
 */
export function formatSystemNoticeText(text) {
  return normalizeNoticeText(text) || String(text || '').trim() || '—';
}
