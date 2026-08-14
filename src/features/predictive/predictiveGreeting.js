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
  LOG_WATER: 'LOG_WATER',
  LOG_SNACK: 'LOG_SNACK',
  START_MCDRIVE_WIZARD: 'START_MCDRIVE_WIZARD',
});

/** Saluti di cortesia quando HabitEngine è IDLE (check-in per fascia oraria). */
export const COURTESY_CHECKIN_STATE = Object.freeze({
  MORNING: 'COURTESY_MORNING',
  MIDDAY: 'COURTESY_MIDDAY',
  AFTERNOON: 'COURTESY_AFTERNOON',
  EVENING: 'COURTESY_EVENING',
  NIGHT: 'COURTESY_NIGHT',
});

/** Finestre orarie (ore decimali) per fallback IDLE. */
export const COURTESY_CLOCK_WINDOWS = Object.freeze({
  MORNING: Object.freeze({ start: 5, end: 11.5 }),
  MIDDAY: Object.freeze({ start: 11.5, end: 15.5 }),
  AFTERNOON: Object.freeze({ start: 15.5, end: 18.5 }),
  EVENING: Object.freeze({ start: 18.5, end: 22.5 }),
});

const MORNING_GREETING_TEXT = [
  'Buongiorno! Come è andato il riposo stanotte?',
  'Partiamo con il nostro caffè di rito (rigorosamente amaro per mantenere il digiuno pulito) o c\'è qualche variazione?',
].join(' ');

/**
 * @param {number} [decimalHour]
 * @param {Date} [now]
 * @returns {string}
 */
export function resolveCourtesyCheckInState(decimalHour, now = new Date()) {
  const h = Number.isFinite(Number(decimalHour))
    ? Number(decimalHour)
    : now.getHours() + now.getMinutes() / 60;

  if (h >= COURTESY_CLOCK_WINDOWS.MORNING.start && h < COURTESY_CLOCK_WINDOWS.MORNING.end) {
    return COURTESY_CHECKIN_STATE.MORNING;
  }
  if (h >= COURTESY_CLOCK_WINDOWS.MIDDAY.start && h < COURTESY_CLOCK_WINDOWS.MIDDAY.end) {
    return COURTESY_CHECKIN_STATE.MIDDAY;
  }
  if (h >= COURTESY_CLOCK_WINDOWS.AFTERNOON.start && h < COURTESY_CLOCK_WINDOWS.AFTERNOON.end) {
    return COURTESY_CHECKIN_STATE.AFTERNOON;
  }
  if (h >= COURTESY_CLOCK_WINDOWS.EVENING.start && h < COURTESY_CLOCK_WINDOWS.EVENING.end) {
    return COURTESY_CHECKIN_STATE.EVENING;
  }
  return COURTESY_CHECKIN_STATE.NIGHT;
}

/**
 * Stato effettivo per saluto: abitudine HabitEngine oppure check-in di cortesia (IDLE).
 * @param {{ state?: string, decimalHour?: number }} [ctx]
 * @returns {string}
 */
export function resolveEffectivePredictiveState(ctx = {}) {
  const habitState = String(ctx?.state || PREDICTIVE_STATE.IDLE).trim() || PREDICTIVE_STATE.IDLE;
  if (habitState !== PREDICTIVE_STATE.IDLE) return habitState;
  return resolveCourtesyCheckInState(ctx?.decimalHour);
}

/**
 * @param {string} courtesyState
 * @returns {{ text: string, avatarAsset: string, quickReplies: object[], predictiveState: string } | null}
 */
function buildCourtesyCheckInGreeting(courtesyState) {
  switch (courtesyState) {
    case COURTESY_CHECKIN_STATE.MORNING:
      return {
        text: 'Buongiorno! Come posso aiutarti in questo momento?',
        avatarAsset: CHAT_DEFAULT_AVATAR_SRC,
        predictiveState: courtesyState,
        quickReplies: [
          { label: '☕ Caffè', intent: PREDICTIVE_INTENT.LOG_COFFEE, variant: 'primary' },
          { label: '🍳 Colazione', intent: PREDICTIVE_INTENT.LOG_BREAKFAST },
          { label: '📊 Resoconto', intent: PREDICTIVE_INTENT.DAY_REVIEW },
        ],
      };
    case COURTESY_CHECKIN_STATE.MIDDAY:
      return {
        text: 'Metà giornata in corso. Vuoi registrare un pasto o fare il punto sui macro?',
        avatarAsset: AVATAR_MOOD_SRC[AVATAR_MOOD.KITCHEN],
        predictiveState: courtesyState,
        quickReplies: [
          { label: '🍽️ Pranzo', intent: PREDICTIVE_INTENT.START_MEAL_WIZARD, variant: 'primary' },
          { label: '🍔 Inserimento Guidato', intent: PREDICTIVE_INTENT.START_MCDRIVE_WIZARD },
          { label: '⚡ Inserimento Libero', intent: PREDICTIVE_INTENT.FREE_MEAL_LOG },
          { label: '📊 Resoconto', intent: PREDICTIVE_INTENT.DAY_REVIEW },
        ],
      };
    case COURTESY_CHECKIN_STATE.AFTERNOON:
      return {
        text: 'Pomeriggio inoltrato. Come procede la giornata? Hai bisogno di registrare qualcosa o controllare i target?',
        avatarAsset: AVATAR_MOOD_SRC[AVATAR_MOOD.THINKING] || CHAT_DEFAULT_AVATAR_SRC,
        predictiveState: courtesyState,
        quickReplies: [
          { label: '💧 Acqua', intent: PREDICTIVE_INTENT.LOG_WATER, variant: 'primary' },
          { label: '🍎 Spuntino', intent: PREDICTIVE_INTENT.LOG_SNACK },
          { label: '🍔 Inserimento Guidato', intent: PREDICTIVE_INTENT.START_MCDRIVE_WIZARD },
          { label: '📊 Resoconto', intent: PREDICTIVE_INTENT.DAY_REVIEW },
        ],
      };
    case COURTESY_CHECKIN_STATE.EVENING:
      return {
        text: 'Si avvicina la sera. Chiudiamo la giornata o registriamo qualcosa?',
        avatarAsset: AVATAR_MOOD_SRC[AVATAR_MOOD.THINKING] || CHAT_DEFAULT_AVATAR_SRC,
        predictiveState: courtesyState,
        quickReplies: [
          { label: '🍽️ Cena', intent: PREDICTIVE_INTENT.LOG_DINNER, variant: 'primary' },
          { label: '🍔 Inserimento Guidato', intent: PREDICTIVE_INTENT.START_MCDRIVE_WIZARD },
          { label: '📊 Resoconto', intent: PREDICTIVE_INTENT.DAY_REVIEW },
          { label: '💧 Acqua', intent: PREDICTIVE_INTENT.LOG_WATER },
        ],
      };
    case COURTESY_CHECKIN_STATE.NIGHT:
      return {
        text: 'Ancora sveglio? Posso aiutarti a registrare qualcosa o fare un rapido resoconto.',
        avatarAsset: CHAT_DEFAULT_AVATAR_SRC,
        predictiveState: courtesyState,
        quickReplies: [
          { label: '📊 Resoconto', intent: PREDICTIVE_INTENT.DAY_REVIEW, variant: 'primary' },
          { label: '🍎 Spuntino', intent: PREDICTIVE_INTENT.LOG_SNACK },
          { label: '💧 Acqua', intent: PREDICTIVE_INTENT.LOG_WATER },
        ],
      };
    default:
      return null;
  }
}

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
  const currentState = resolveEffectivePredictiveState(ctx);
  const last = getLastConversationMessage(chatHistory);
  const lastGreeting = isPredictiveGreetingMessage(last) ? last : null;

  if (lastGreeting && lastGreeting.predictiveSuperseded !== true) {
    if (isStalePredictiveGreeting(lastGreeting, currentState, opts.anchorDate)) {
      return { action: 'supersede', lastGreeting };
    }
    // Stesso slot ancora inevaso in cima al thread → non ripetere.
    return { action: 'skip', lastGreeting };
  }

  // Nota: non bloccare su "già mostrato nella giornata" se l'utente ha già risposto
  // o il saluto è stato superseded — altrimenti la riapertura chat resta muta.
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
  if (!ctx) return null;

  const effectiveState = resolveEffectivePredictiveState(ctx);
  if (effectiveState.startsWith('COURTESY_')) {
    return buildCourtesyCheckInGreeting(effectiveState);
  }

  switch (effectiveState) {
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
          { label: '🍔 Inserimento Guidato', intent: PREDICTIVE_INTENT.START_MCDRIVE_WIZARD },
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
        userText: '',
        options: {
          intent: 'START_MCDRIVE_WIZARD',
          skipUserBubble: true,
          fromPredictiveGreeting: true,
        },
      };
    case PREDICTIVE_INTENT.FREE_MEAL_LOG:
      return {
        userText: '',
        options: {
          intent: 'FREE_MEAL_LISTEN',
          skipUserBubble: true,
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
        userText: '',
        options: {
          intent: 'START_MCDRIVE_WIZARD',
          skipUserBubble: true,
          fromPredictiveGreeting: true,
        },
      };
    case PREDICTIVE_INTENT.LOG_WATER:
      return {
        userText: '💧 Acqua',
        options: {
          intent: 'MANUAL_SHORTCUT',
          manualShortcutId: 'water',
          fromPredictiveGreeting: true,
        },
      };
    case PREDICTIVE_INTENT.LOG_SNACK:
      return {
        userText: '',
        options: {
          intent: 'FREE_MEAL_LISTEN',
          skipUserBubble: true,
          mealTypeHint: 'snack',
          fromPredictiveGreeting: true,
        },
      };
    case PREDICTIVE_INTENT.START_MCDRIVE_WIZARD:
      return {
        userText: '',
        options: {
          intent: 'START_MCDRIVE_WIZARD',
          skipUserBubble: true,
          fromPredictiveGreeting: true,
        },
      };
    default:
      return null;
  }
}
