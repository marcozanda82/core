import {
  MAIN_BOTTOM_TAB_ORDER,
  ACTIVE_BOTTOM_TAB_LS_KEY,
  EVENT_USAGE_LS_KEY,
  EVENT_USAGE_DEFAULT,
  EVENT_USAGE_LEGACY_ALIASES,
  MEAL_CONFIRM_DEBOUNCE_MS,
} from '../constants/salaComandiConstants';
import { KENTU_INTRO_PHRASES } from '../kentuIntroPhrases';

export function migrateIdealStrategy(raw) {
  const defaults = {
    colazione: 400,
    snack: 250,
    pranzo: 700,
    cena: 500,
    allenamento: 300,
  };
  if (!raw || typeof raw !== 'object') return { ...defaults };
  const legacySnack =
    Number(raw.snack ?? raw.merenda_pm ?? raw.merenda_am ?? raw.spuntino) || 250;
  const next = { ...defaults, ...raw };
  if (next.snack == null || Number.isNaN(Number(next.snack))) next.snack = legacySnack;
  delete next.merenda_am;
  delete next.merenda_pm;
  delete next.spuntino;
  return next;
}

/** Landing sempre Home (`oggi`). Non ripristina Diario/Salute da localStorage. */
export function readPersistedActiveBottomTab() {
  if (typeof localStorage === 'undefined') return 'oggi';
  try {
    localStorage.setItem(ACTIVE_BOTTOM_TAB_LS_KEY, 'oggi');
  } catch {
    /* ignore */
  }
  return 'oggi';
}

export function readPersistedEventUsage() {
  if (typeof localStorage === 'undefined') return { ...EVENT_USAGE_DEFAULT };
  try {
    const raw = localStorage.getItem(EVENT_USAGE_LS_KEY);
    if (!raw) return { ...EVENT_USAGE_DEFAULT };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EVENT_USAGE_DEFAULT };
    const next = { ...EVENT_USAGE_DEFAULT };
    Object.keys(EVENT_USAGE_DEFAULT).forEach((key) => {
      next[key] = Math.max(0, Number(parsed[key]) || 0);
    });
    Object.entries(EVENT_USAGE_LEGACY_ALIASES).forEach(([legacy, canonical]) => {
      next[canonical] = (Number(next[canonical]) || 0) + Math.max(0, Number(parsed[legacy]) || 0);
    });
    return next;
  } catch {
    return { ...EVENT_USAGE_DEFAULT };
  }
}

/** Ore decimali di sonno da addormentamento a risveglio (attraversa mezzanotte). */
export function computeSleepDurationHours(bedDecimal, wakeDecimal) {
  const b = Number(bedDecimal);
  const w = Number(wakeDecimal);
  if (!Number.isFinite(b) || !Number.isFinite(w)) return 0;
  let dur = w - b;
  if (dur <= 0) dur += 24;
  return Math.round(Math.min(24, Math.max(0, dur)) * 100) / 100;
}

/** Calcola l'ora di addormentamento sottraendo la durata all'ora di risveglio. */
export function computeBedtimeFromWakeAndDuration(wakeDecimal, durationHours) {
  const w = Number(wakeDecimal);
  const dur = Number(durationHours);
  if (!Number.isFinite(w) || !Number.isFinite(dur) || dur <= 0) return NaN;
  let bed = w - dur;
  while (bed < 0) bed += 24;
  while (bed >= 24) bed -= 24;
  return Math.round(bed * 100) / 100;
}

/** Etichetta leggibile per durata ore + minuti (es. "6h 30m"). */
export function formatSleepDurationParts(hoursPart, minutesPart) {
  const h = Math.max(0, Math.floor(Number(hoursPart) || 0));
  const m = Math.max(0, Math.min(59, Math.floor(Number(minutesPart) || 0)));
  if (h === 0 && m === 0) return '—';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function kentuChatStorageKey(dateStr) {
  return `kentu_chat_${dateStr}`;
}

const KENTU_CHAT_DATE_KEY_RE = /^kentu_chat_(\d{4}-\d{2}-\d{2})$/;

/** Data locale YYYY-MM-DD (allineata a getTodayString / timezone offset). */
export function getLocalIsoDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

/** Millisecondi al prossimo mezzanotte locale (min 250ms). */
export function msUntilNextLocalMidnight(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return Math.max(250, next.getTime() - d.getTime());
}

export function listLocalKentuChatDates() {
  if (typeof localStorage === 'undefined') return [];
  const dates = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      const match = KENTU_CHAT_DATE_KEY_RE.exec(String(key || ''));
      if (match) dates.push(match[1]);
    }
  } catch {
    /* private mode */
  }
  return dates.sort();
}

function messageCalendarDate(message) {
  if (!message || typeof message !== 'object') return '';
  const raw = message.createdAt ?? message.timestamp ?? message.at ?? message.anchorDate;
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return getLocalIsoDateString(new Date(raw));
  }
  const asString = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) return asString;
  const parsed = Date.parse(asString);
  if (!Number.isFinite(parsed)) return '';
  return getLocalIsoDateString(new Date(parsed));
}

/**
 * Vista principale: solo messaggi del giorno in corso.
 * I messaggi senza data restano visibili (seed / legacy).
 */
export function filterKentuChatMessagesForVisibleDay(messages, dateStr) {
  const day = String(dateStr || '').slice(0, 10);
  const list = asArrayOrEmpty(messages);
  if (!day) return list;
  return list.filter((m) => {
    if (m?.fromArchive === true) return true;
    const msgDay = messageCalendarDate(m);
    return !msgDay || msgDay === day;
  });
}

const KENTU_INTRO_SEED_TEXTS = new Set([
  ...(Array.isArray(KENTU_INTRO_PHRASES) ? KENTU_INTRO_PHRASES : []),
  'Ciao, come posso aiutarti?',
  'La direzione vale più della fretta.',
]);

/** Balloon «frase del giorno» (seed chat): non va mostrato né regenerato. */
export function isKentuIntroSeedMessage(message) {
  if (!message || typeof message !== 'object') return false;
  if (message.sender !== 'ai' || message.isTyping) return false;
  if (message.predictiveGreeting === true || String(message.type || '') === 'PREDICTIVE_GREETING') {
    return false;
  }
  if (Array.isArray(message.quickReplies) && message.quickReplies.length > 0) return false;
  if (
    message.mealProposal
    || message.mealDraft
    || message.workoutDraft
    || message.dailyPlan
    || message.clarification === true
  ) {
    return false;
  }
  const text = String(message.text || '').trim();
  return Boolean(text) && KENTU_INTRO_SEED_TEXTS.has(text);
}

export function stripKentuIntroSeedMessages(messages) {
  return asArrayOrEmpty(messages).filter((m) => !isKentuIntroSeedMessage(m));
}

function asArrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Normalizza la cronologia chat: mai null, mai oggetto Firebase-style.
 * @param {unknown} messages
 * @param {{ keepTyping?: boolean }} [opts]
 */
export function sanitizeKentuChatMessages(messages, opts = {}) {
  const keepTyping = opts.keepTyping === true;
  return asArrayOrEmpty(messages)
    .filter((m) => m && typeof m === 'object' && (m.sender === 'user' || m.sender === 'ai'))
    .map((m) => {
      if (!keepTyping && m.isTyping) return null;
      const next = { ...m };
      if (next.quickReplies != null && !Array.isArray(next.quickReplies)) next.quickReplies = [];
      if (next.dinnerOptions != null && !Array.isArray(next.dinnerOptions)) next.dinnerOptions = [];
      if (next.agendaOptions != null && !Array.isArray(next.agendaOptions)) next.agendaOptions = [];
      if (next.mealProposals != null && !Array.isArray(next.mealProposals)) next.mealProposals = [];
      if (next.wipSuggestions != null && !Array.isArray(next.wipSuggestions)) next.wipSuggestions = [];
      return next;
    })
    .filter(Boolean);
}

export function coerceLiveChatHistory(messages) {
  return sanitizeKentuChatMessages(messages, { keepTyping: true });
}

/** Chat del giorno: nessun balloon di «frase del giorno». */
export function seedKentuChatHistory(_introPhrase = '') {
  return [];
}

export function readKentuChatHistoryFromLocalStorage(dateStr) {
  try {
    if (!dateStr || typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(kentuChatStorageKey(dateStr));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const cleaned = sanitizeKentuChatMessages(parsed);
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

function isKentuChatPersistableMessage(m) {
  if (!m || m.isTyping) return false;
  const t = (m.text || '').trim();
  if (
    m.sender === 'ai' &&
    (t.startsWith('❌') || t.includes('Errore Server') || t.includes('Nessuna API Key'))
  ) {
    return false;
  }
  return true;
}

export function kentuChatHistoryForPersistence(messages) {
  return sanitizeKentuChatMessages(messages).filter(isKentuChatPersistableMessage);
}

export function getNowDecimalHourForPlanMerge() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

export function tryAcquireMealConfirmGuard(guardRef) {
  const g = guardRef.current;
  const now = Date.now();
  if (g.busy || now - g.lastAt < MEAL_CONFIRM_DEBOUNCE_MS) return false;
  g.busy = true;
  g.lastAt = now;
  return true;
}

export function releaseMealConfirmGuard(guardRef) {
  guardRef.current.busy = false;
}

/** Anti-NaN: mai passare valori non finiti a Recharts / divisioni UI. */
export function safeNum(val) {
  return Number.isFinite(Number(val)) ? Number(val) : 0;
}

/**
 * Parse "HH:mm" o cifre grezze → ora decimale (0–24).
 * @param {string} value
 * @returns {number}
 */
export function parseTimeStrToDecimal(value) {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 0) return 12;
  const formatted = digits.length > 2 ? digits.slice(0, 2) + ':' + digits.slice(2, 4) : digits;
  const [hh, mm] = formatted.includes(':')
    ? formatted.split(':')
    : [formatted.slice(0, 2) || '0', formatted.slice(2) || '0'];
  const h = Math.min(23, Math.max(0, parseInt(hh, 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(mm, 10) || 0));
  return h + m / 60;
}
