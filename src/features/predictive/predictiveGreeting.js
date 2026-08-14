import { AVATAR_MOOD, AVATAR_MOOD_SRC, CHAT_DEFAULT_AVATAR_SRC } from '../chat/avatarMood.js';
import { PREDICTIVE_STATE } from './HabitEngine.js';

export const PREDICTIVE_GREETING_TYPE = 'PREDICTIVE_GREETING';

export const PREDICTIVE_INTENT = Object.freeze({
  START_MEAL_WIZARD: 'START_MEAL_WIZARD',
  FREE_MEAL_LOG: 'FREE_MEAL_LOG',
  LOG_COFFEE: 'LOG_COFFEE',
  LOG_COFFEE_AMARO: 'LOG_COFFEE_AMARO',
  LOG_COFFEE_SWEET: 'LOG_COFFEE_SWEET',
  LOG_BREAKFAST: 'LOG_BREAKFAST',
  LOG_SLEEP_STATUS: 'LOG_SLEEP_STATUS',
  START_WORKOUT: 'START_WORKOUT',
  SNOOZE: 'SNOOZE',
  DAY_REVIEW: 'DAY_REVIEW',
  LOG_DINNER: 'LOG_DINNER',
});

const MORNING_GREETING_TEXT = [
  'Buongiorno! Come è andato il riposo stanotte?',
  'Partiamo con il nostro caffè di rito (rigorosamente amaro per mantenere il digiuno pulito) o c\'è qualche variazione?',
].join(' ');

/**
 * @param {object | null | undefined} message
 * @returns {boolean}
 */
export function isPredictiveGreetingMessage(message) {
  if (!message || message.isTyping) return false;
  return message.type === PREDICTIVE_GREETING_TYPE || message.predictiveGreeting === true;
}

/**
 * Ultimo messaggio reale del thread (ignora typing).
 * @param {Array<object>} [chatHistory]
 * @returns {object | null}
 */
export function getLastConversationMessage(chatHistory = []) {
  for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
    const entry = chatHistory[i];
    if (!entry || entry.isTyping) continue;
    return entry;
  }
  return null;
}

/**
 * @param {object | null | undefined} greeting
 * @param {string} currentState
 * @param {string} [anchorDate]
 * @returns {boolean}
 */
export function isStalePredictiveGreeting(greeting, currentState, anchorDate = '') {
  if (!isPredictiveGreetingMessage(greeting) || greeting.predictiveSuperseded === true) {
    return false;
  }
  const greetingState = String(greeting.predictiveState || '').trim();
  const nextState = String(currentState || '').trim();
  if (greetingState && nextState && greetingState !== nextState) return true;

  const greetingDate = String(greeting.anchorDate || '').trim().slice(0, 10);
  const today = String(anchorDate || '').trim().slice(0, 10);
  if (greetingDate && today && greetingDate !== today) return true;

  return false;
}

/**
 * Gate conversazione: niente cooldown temporali.
 * - Ultimo msg = proposta predittiva inevasa e stesso contesto → skip
 * - Ultimo msg = proposta predittiva ma contesto orario cambiato → supersede
 * - Altrimenti (azione utente / chat pulita / altro AI) → emit
 *
 * @param {Array<object>} [chatHistory]
 * @param {{ state?: string }} [ctx]
 * @param {{ anchorDate?: string }} [opts]
 * @returns {{ action: 'skip' | 'emit' | 'supersede' | 'clear_stale', lastGreeting: object | null }}
 */
export function evaluatePredictiveGreetingDecision(chatHistory = [], ctx = {}, opts = {}) {
  const currentState = String(ctx?.state || PREDICTIVE_STATE.IDLE).trim() || PREDICTIVE_STATE.IDLE;
  const last = getLastConversationMessage(chatHistory);
  const lastGreeting = isPredictiveGreetingMessage(last) ? last : null;

  if (currentState === PREDICTIVE_STATE.IDLE) {
    if (lastGreeting && isStalePredictiveGreeting(lastGreeting, currentState, opts.anchorDate)) {
      return { action: 'clear_stale', lastGreeting };
    }
    return { action: 'skip', lastGreeting };
  }

  if (lastGreeting && lastGreeting.predictiveSuperseded !== true) {
    if (isStalePredictiveGreeting(lastGreeting, currentState, opts.anchorDate)) {
      return { action: 'supersede', lastGreeting };
    }
    return { action: 'skip', lastGreeting };
  }

  return { action: 'emit', lastGreeting: null };
}

/**
 * Marca le proposte predittive inevase come superate (nasconde le chip).
 * @param {Array<object>} prev
 * @returns {Array<object>}
 */
export function markPredictiveGreetingsSuperseded(prev = []) {
  return (prev || []).map((entry) => {
    if (!isPredictiveGreetingMessage(entry) || entry.predictiveSuperseded === true) return entry;
    return {
      ...entry,
      predictiveSuperseded: true,
      quickReplies: [],
    };
  });
}

/**
 * @param {ReturnType<import('./HabitEngine.js').getCurrentPredictiveContext>} ctx
 * @returns {{ text: string, avatarAsset: string, quickReplies: object[], predictiveState: string } | null}
 */
export function buildPredictiveGreeting(ctx) {
  if (!ctx || ctx.state === PREDICTIVE_STATE.IDLE) return null;

  switch (ctx.state) {
    case PREDICTIVE_STATE.MORNING_ROUTINE:
      return {
        text: MORNING_GREETING_TEXT,
        avatarAsset: CHAT_DEFAULT_AVATAR_SRC,
        predictiveState: ctx.state,
        quickReplies: [
          { label: '☕ Caffè Amaro (Digiuno OK)', intent: PREDICTIVE_INTENT.LOG_COFFEE_AMARO, variant: 'primary' },
          { label: '☕ Caffè Zuccherato', intent: PREDICTIVE_INTENT.LOG_COFFEE_SWEET },
          { label: '😴 Riposo Ottimale', intent: PREDICTIVE_INTENT.LOG_SLEEP_STATUS },
          { label: '🥱 Stanchezza', intent: PREDICTIVE_INTENT.LOG_SLEEP_STATUS },
        ],
      };

    case PREDICTIVE_STATE.LUNCH_APPROACHING:
      return {
        text: 'Metà giornata! Costruiamo il pranzo per centrare i macro?',
        avatarAsset: AVATAR_MOOD_SRC[AVATAR_MOOD.KITCHEN],
        predictiveState: ctx.state,
        quickReplies: [
          { label: '👨‍🍳 Guidami', intent: PREDICTIVE_INTENT.START_MEAL_WIZARD, variant: 'primary' },
          { label: '⚡ Inserimento Libero', intent: PREDICTIVE_INTENT.FREE_MEAL_LOG },
        ],
      };

    case PREDICTIVE_STATE.WORKOUT_WINDOW:
      return {
        text: 'Le scorte sono cariche. Iniziamo il workout?',
        avatarAsset: AVATAR_MOOD_SRC[AVATAR_MOOD.FITNESS],
        predictiveState: ctx.state,
        quickReplies: [
          { label: '🏋️ Inizia', intent: PREDICTIVE_INTENT.START_WORKOUT, variant: 'primary' },
          { label: 'Rimanda', intent: PREDICTIVE_INTENT.SNOOZE },
        ],
      };

    case PREDICTIVE_STATE.EVENING_REVIEW:
      return {
        text: 'Si avvicina la tua finestra serale. Facciamo il punto e chiudiamo bene la giornata?',
        avatarAsset: AVATAR_MOOD_SRC[AVATAR_MOOD.THINKING] || CHAT_DEFAULT_AVATAR_SRC,
        predictiveState: ctx.state,
        quickReplies: [
          { label: '📊 Resoconto', intent: PREDICTIVE_INTENT.DAY_REVIEW, variant: 'primary' },
          { label: '🍽️ Cena', intent: PREDICTIVE_INTENT.LOG_DINNER },
        ],
      };

    default:
      return null;
  }
}

/**
 * Risolve testo + opzioni sendMessage per chip predittive.
 * @param {string} intent
 * @param {{ predictiveState?: string, label?: string }} [ctx]
 * @returns {{ userText: string, options: object } | null}
 */
export function resolvePredictiveIntentAction(intent, ctx = {}) {
  const state = String(ctx.predictiveState || '').trim();
  const label = String(ctx.label || '').trim().toLowerCase();

  switch (intent) {
    case PREDICTIVE_INTENT.START_MEAL_WIZARD:
      return {
        userText: 'Guidami per il pranzo bilanciando i macro rimanenti di oggi',
        options: {
          intent: 'START_MEAL_BUILDER_WIZARD',
          fromPredictiveGreeting: true,
        },
      };
    case PREDICTIVE_INTENT.FREE_MEAL_LOG:
      return {
        userText: 'Voglio registrare il pranzo liberamente',
        options: {
          intent: 'ADD_FOOD',
          fromPredictiveGreeting: true,
        },
      };
    case PREDICTIVE_INTENT.LOG_COFFEE_AMARO:
      return {
        userText: 'Ho preso un caffè amaro',
        options: {
          intent: 'LOG_COFFEE',
          fromPredictiveGreeting: true,
        },
      };
    case PREDICTIVE_INTENT.LOG_COFFEE_SWEET:
      return {
        userText: 'Ho preso un caffè zuccherato',
        options: {
          intent: 'LOG_COFFEE',
          fromPredictiveGreeting: true,
        },
      };
    case PREDICTIVE_INTENT.LOG_COFFEE:
      return {
        userText: 'Ho preso un caffè',
        options: {
          intent: 'LOG_COFFEE',
          fromPredictiveGreeting: true,
        },
      };
    case PREDICTIVE_INTENT.LOG_BREAKFAST:
      return {
        userText: 'Registro colazione',
        options: {
          intent: 'ADD_FOOD',
          fromPredictiveGreeting: true,
        },
      };
    case PREDICTIVE_INTENT.LOG_SLEEP_STATUS: {
      const tired = /stanchezza|stanco|poco|male|pessimo/.test(label);
      return {
        userText: tired
          ? 'Stanotte ho dormito poco, mi sento stanco'
          : 'Stanotte ho riposato bene',
        options: {
          intent: 'CHAT_RESPONSE',
          fromPredictiveGreeting: true,
          forceStrategic: true,
        },
      };
    }
    case PREDICTIVE_INTENT.START_WORKOUT:
      return {
        userText: 'Registra il mio allenamento di oggi',
        options: {
          intent: 'ADD_WORKOUT',
          fromPredictiveGreeting: true,
        },
      };
    case PREDICTIVE_INTENT.SNOOZE:
      return {
        userText: '',
        options: {
          snoozeOnly: true,
          fromPredictiveGreeting: true,
          predictiveState: state,
        },
      };
    case PREDICTIVE_INTENT.DAY_REVIEW:
      return {
        userText: 'Fammi un resoconto della giornata finora',
        options: {
          intent: 'ASK_DAY_REVIEW',
          fromPredictiveGreeting: true,
          forceStrategic: true,
        },
      };
    case PREDICTIVE_INTENT.LOG_DINNER:
      return {
        userText: 'Guidami per la cena bilanciando i macro rimanenti',
        options: {
          intent: 'START_MEAL_BUILDER_WIZARD',
          fromPredictiveGreeting: true,
        },
      };
    default:
      return null;
  }
}
