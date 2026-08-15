/**
 * Avatar contestuale Kentu: cambia asset in base all'attività AI / UI.
 *
 * Stati (priorità):
 * - thinking → /pensatore2.png  (consigli, strategia, NLP / elaborazione)
 * - coding   → /Hacker4.png     (debug, errori, loading, sistema)
 * - kitchen  → /Chef2.png       (nutrizione, pasti, McDrive)
 * - fitness  → /Trainer3.png    (workout / giorno ON)
 * - default  → /pensatore2.png  (chat neutra) — Health Score = cellule in header
 */

import {
  isAskDraftAdviceIntent,
  isConsultantMealIntent,
  isDayReviewIntent,
  isMealAdviceIntent,
  isMealDraftEvaluationIntent,
} from '../commandTerminal/conversation/mealLogIntent.js';
import { isConsultativeStateIntent } from '../commandTerminal/conversation/workoutRegistrationSlots.js';
import {
  CHAT_SUCCESS_AVATAR_SRC,
  getSystemNoticeTone,
  isSuccessConfirmationMessage,
} from './chatMessageKind.js';

/** Avatar neutro Kentu per bolle chat / typing (non legato allo Health Score). */
export const CHAT_DEFAULT_AVATAR_SRC = '/pensatore2.png';

export const AVATAR_MOOD = Object.freeze({
  DEFAULT: 'default',
  THINKING: 'thinking',
  CODING: 'coding',
  KITCHEN: 'kitchen',
  FITNESS: 'fitness',
});

export const AVATAR_MOOD_SRC = Object.freeze({
  [AVATAR_MOOD.THINKING]: '/pensatore2.png',
  [AVATAR_MOOD.CODING]: '/Hacker4.png',
  [AVATAR_MOOD.KITCHEN]: '/Chef2.png',
  [AVATAR_MOOD.FITNESS]: '/Trainer3.png',
});

/** Video loop opzionali (poster = AVATAR_MOOD_SRC). Solo UI di elaborazione — mai nel path API. */
export const AVATAR_MOOD_VIDEO = Object.freeze({
  [AVATAR_MOOD.CODING]: '/Hacker4animazione.mp4',
});

export const AVATAR_MOOD_LABEL = Object.freeze({
  [AVATAR_MOOD.THINKING]: 'Kentu sta ragionando',
  [AVATAR_MOOD.CODING]: 'Kentu sta elaborando',
  [AVATAR_MOOD.KITCHEN]: 'Modalità cucina',
  [AVATAR_MOOD.FITNESS]: 'Modalità allenamento',
  [AVATAR_MOOD.DEFAULT]: 'Kentu',
});

/**
 * True se il testo utente attiva il mood strategico (consigli / analisi, non log transazionale).
 * @param {string} userText
 * @param {Array<object>} [chatHistory]
 * @returns {boolean}
 */
export function isStrategicAvatarIntent(userText, chatHistory = []) {
  const text = String(userText || '').trim();
  if (!text) return false;

  if (isMealAdviceIntent(text, chatHistory)) return true;
  if (isConsultantMealIntent(text, chatHistory)) return true;
  if (isAskDraftAdviceIntent(text)) return true;
  if (isDayReviewIntent(text)) return true;
  if (isMealDraftEvaluationIntent(text)) return true;
  if (isConsultativeStateIntent(text)) return true;

  return false;
}

/**
 * Ultimo messaggio utente visibile nel thread (o hidden con intent strategico).
 * @param {Array<object>} [chatHistory]
 * @returns {string}
 */
export function getLastUserMessageText(chatHistory = []) {
  for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
    const entry = chatHistory[i];
    if (!entry || entry.isTyping || entry.sender !== 'user') continue;
    return String(entry.text || '').trim();
  }
  return '';
}

/**
 * Contesto strategico dal thread: ultimo input utente o intent nascosto (es. diagnosi Health Score).
 * @param {Array<object>} [chatHistory]
 * @param {{ forceStrategic?: boolean }} [opts]
 * @returns {boolean}
 */
export function detectStrategicConsultContext(chatHistory = [], opts = {}) {
  if (opts.forceStrategic === true) return true;

  for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
    const entry = chatHistory[i];
    if (!entry || entry.isTyping || entry.sender !== 'user') continue;

    const text = String(entry.text || '').trim();
    if (entry.isHiddenUserMessage || entry.skipUserBubble) {
      if (/REQUEST_HEALTH_DIAGNOSIS/i.test(text)) return true;
      return false;
    }

    return isStrategicAvatarIntent(text, chatHistory);
  }

  return false;
}

/**
 * @param {{
 *   isProcessing?: boolean,
 *   isTyping?: boolean,
 *   isTranscribing?: boolean,
 *   isStrategicConsult?: boolean,
 *   hasActiveMealTray?: boolean,
 *   hasActiveWorkoutDraft?: boolean,
 *   isTrainingDay?: boolean,
 * }} flags
 * @returns {'default' | 'thinking' | 'coding' | 'kitchen' | 'fitness'}
 */
export function resolveAvatarMood(flags = {}) {
  const isBusy = flags.isProcessing === true
    || flags.isTyping === true
    || flags.isTranscribing === true;

  if (isBusy && flags.isStrategicConsult === true) {
    return AVATAR_MOOD.THINKING;
  }
  if (isBusy) {
    return AVATAR_MOOD.CODING;
  }
  if (flags.isStrategicConsult === true) {
    return AVATAR_MOOD.THINKING;
  }
  if (flags.hasActiveMealTray === true) {
    return AVATAR_MOOD.KITCHEN;
  }
  if (flags.hasActiveWorkoutDraft === true || flags.isTrainingDay === true) {
    return AVATAR_MOOD.FITNESS;
  }
  return AVATAR_MOOD.DEFAULT;
}

/**
 * @param {'default' | 'thinking' | 'coding' | 'kitchen' | 'fitness'} mood
 * @param {string} [defaultSrc]
 * @returns {string}
 */
export function getAvatarSrcForMood(mood, defaultSrc = CHAT_DEFAULT_AVATAR_SRC) {
  const key = String(mood || AVATAR_MOOD.DEFAULT);
  if (key !== AVATAR_MOOD.DEFAULT && AVATAR_MOOD_SRC[key]) {
    return AVATAR_MOOD_SRC[key];
  }
  const fallback = String(defaultSrc || CHAT_DEFAULT_AVATAR_SRC).trim();
  return fallback || CHAT_DEFAULT_AVATAR_SRC;
}

/**
 * Video loop per mood (es. coding → Hacker4animazione). Stringa vuota se assente.
 * @param {'default' | 'thinking' | 'coding' | 'kitchen' | 'fitness'} mood
 * @returns {string}
 */
export function getAvatarVideoForMood(mood) {
  const key = String(mood || AVATAR_MOOD.DEFAULT);
  return String(AVATAR_MOOD_VIDEO[key] || '').trim();
}

/**
 * Asset avatar congelato su un messaggio chat (fallback al default Kentu).
 * @param {object | null | undefined} message
 * @param {string} [fallback]
 * @returns {string}
 */
export function resolveMessageAvatarSrc(message, fallback = CHAT_DEFAULT_AVATAR_SRC) {
  if (isSuccessConfirmationMessage(message)) {
    return CHAT_SUCCESS_AVATAR_SRC;
  }
  const asset = String(message?.avatarAsset || '').trim();
  if (asset) return asset;
  const safeFallback = String(fallback || CHAT_DEFAULT_AVATAR_SRC).trim();
  return safeFallback || CHAT_DEFAULT_AVATAR_SRC;
}

/**
 * Snapshot dell'avatar contestuale al momento in cui un messaggio AI viene creato.
 * Non usa mood di loading (coding/Hacker4) — solo stati semantici del messaggio.
 *
 * @param {object} [extra]
 * @param {{
 *   chatHistory?: Array<object>,
 *   wipMealItems?: Array<object>,
 *   mealBuilder?: object | null,
 *   isTrainingDay?: boolean,
 *   forceStrategic?: boolean,
 * }} [context]
 * @returns {string}
 */
export function snapshotChatAvatarAsset(extra = {}, context = {}) {
  const defaultSrc = CHAT_DEFAULT_AVATAR_SRC;
  const {
    chatHistory = [],
    wipMealItems = [],
    mealBuilder = null,
    isTrainingDay = false,
    forceStrategic = false,
  } = context;

  if (
    extra?.type === 'SUCCESS_CONFIRMATION'
    || extra?.type === 'MEAL_RECEIPT'
    || extra?.mealReceipt
    || String(extra?.intent || '').toUpperCase() === 'LOG_MEAL_SUCCESS'
    || String(extra?.intent || '').toUpperCase() === 'LOG_WORKOUT_SUCCESS'
  ) {
    return CHAT_SUCCESS_AVATAR_SRC;
  }

  if (extra?.type === 'system' || extra?.isSystem === true) {
    const tone = getSystemNoticeTone({ sender: 'ai', text: extra?.text || extra?.displayText, ...extra });
    if (tone === 'success') return CHAT_SUCCESS_AVATAR_SRC;
    if (tone === 'cancel' || tone === 'error' || extra?.isError === true) {
      return getAvatarSrcForMood(AVATAR_MOOD.CODING, defaultSrc);
    }
  }

  if (extra?.type === 'MEAL_DRAFT' || extra?.mealDraft) {
    return getAvatarSrcForMood(AVATAR_MOOD.KITCHEN, defaultSrc);
  }
  if (extra?.type === 'WORKOUT_DRAFT' || extra?.workoutDraft) {
    return getAvatarSrcForMood(AVATAR_MOOD.FITNESS, defaultSrc);
  }
  if (extra?.type === 'system' || extra?.isError === true || extra?.type === 'ERROR') {
    return getAvatarSrcForMood(AVATAR_MOOD.CODING, defaultSrc);
  }
  if (
    extra?.type === 'ADVICE'
    || (Array.isArray(extra?.mealProposals) && extra.mealProposals.length > 0)
    || extra?.mealDraftProjection
  ) {
    return getAvatarSrcForMood(AVATAR_MOOD.THINKING, defaultSrc);
  }

  const isStrategicConsult = detectStrategicConsultContext(chatHistory, { forceStrategic });
  if (isStrategicConsult) {
    return getAvatarSrcForMood(AVATAR_MOOD.THINKING, defaultSrc);
  }

  const hasActiveMealTray = detectActiveMealTray({ chatHistory, wipMealItems, mealBuilder });
  if (hasActiveMealTray) {
    return getAvatarSrcForMood(AVATAR_MOOD.KITCHEN, defaultSrc);
  }

  const hasActiveWorkoutDraft = chatHistory.some((m) => m?.workoutDraft && !m?.draftResolved);
  if (hasActiveWorkoutDraft || isTrainingDay === true) {
    return getAvatarSrcForMood(AVATAR_MOOD.FITNESS, defaultSrc);
  }

  return defaultSrc;
}

/**
 * True se nel thread c'è un vassoio pasti attivo (bozza, proposal card, WIP, meal builder).
 * @param {{
 *   chatHistory?: Array<object>,
 *   wipMealItems?: Array<object>,
 *   mealBuilder?: object | null,
 * }} opts
 */
export function detectActiveMealTray({
  chatHistory = [],
  wipMealItems = [],
  mealBuilder = null,
} = {}) {
  if (mealBuilder && typeof mealBuilder === 'object' && mealBuilder.active === true) return true;
  if (Array.isArray(wipMealItems) && wipMealItems.length > 0) return true;
  return (chatHistory || []).some((m) => {
    if (!m || m.isTyping || m.draftResolved) return false;
    if (m.mealDraft && !m.draftResolved) return true;
    if (Array.isArray(m.mealProposals) && m.mealProposals.length > 0) {
      // Proposal ancora non salvata (niente loaded ids, o card ancora interattiva).
      const loaded = Array.isArray(m.mealProposalsLoadedIds) ? m.mealProposalsLoadedIds : [];
      if (loaded.length === 0) return true;
      const allLoaded = m.mealProposals.every((p) => loaded.includes(String(p?.id || '')));
      return !allLoaded;
    }
    if (m.mealProposal) return true;
    if (m.mealDraftInteractiveEdit === true) return true;
    return false;
  });
}
