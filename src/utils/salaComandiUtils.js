import {
  MAIN_BOTTOM_TAB_ORDER,
  PERSISTED_BOTTOM_TAB_IDS,
  ACTIVE_BOTTOM_TAB_LS_KEY,
  EVENT_USAGE_LS_KEY,
  EVENT_USAGE_DEFAULT,
  EVENT_USAGE_LEGACY_ALIASES,
  MEAL_CONFIRM_DEBOUNCE_MS,
} from '../constants/salaComandiConstants';

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

export function readPersistedActiveBottomTab() {
  if (typeof localStorage === 'undefined') return 'oggi';
  try {
    const v = localStorage.getItem(ACTIVE_BOTTOM_TAB_LS_KEY);
    if (v && PERSISTED_BOTTOM_TAB_IDS.includes(v)) return v;
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

export function readKentuChatHistoryFromLocalStorage(dateStr) {
  try {
    const raw = localStorage.getItem(kentuChatStorageKey(dateStr));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const cleaned = parsed.filter(
      (m) => m && (m.sender === 'user' || m.sender === 'ai') && !m.isTyping
    );
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
  return (messages || []).filter(isKentuChatPersistableMessage);
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
