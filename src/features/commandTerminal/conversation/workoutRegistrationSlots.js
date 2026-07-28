import { addDays } from '../../../calendarDateUtils';
import { getLogFromStoricoTree } from '../../../coreEngine';
import { normalizeExactTime, parseExactTimeFromUserText } from './mealLogIntent.js';
import { formatCurrentSystemTimeContext } from './mealSmartDefaults.js';

export const WORKOUT_CONFLICT_QUICK_REPLIES = Object.freeze(['Procedi', 'Annulla']);

export const WORKOUT_TIME_QUICK_REPLIES = Object.freeze([
  '08:00',
  '12:30',
  '18:00',
  '20:00',
]);

/** Tipi cilindro/chat per ADD_WORKOUT (normalizzati da Gemini). */
export const WORKOUT_TYPE_ENUM = Object.freeze([
  'spinta',
  'trazione',
  'gambe',
  'cardio',
  'altro',
]);

const WORKOUT_TYPE_LABELS = Object.freeze({
  spinta: 'Allenamento spinta',
  trazione: 'Allenamento trazione',
  gambe: 'Allenamento gambe',
  cardio: 'Cardio',
  altro: 'Allenamento',
});

const WORKOUT_TYPE_ALIASES = Object.freeze({
  push: 'spinta',
  pull: 'trazione',
  legs: 'gambe',
  lower: 'gambe',
  upper: 'spinta',
  petto: 'spinta',
  spalle: 'spinta',
  tricipiti: 'spinta',
  dorso: 'trazione',
  schiena: 'trazione',
  bicipiti: 'trazione',
  legsday: 'gambe',
  legday: 'gambe',
  hiit: 'cardio',
  corsa: 'cardio',
  running: 'cardio',
  bike: 'cardio',
});

function asTrimmedString(value) {
  return String(value ?? '').trim();
}

/**
 * True se il testo sembra una registrazione allenamento (non consiglio pasto).
 * @param {string} userText
 * @returns {boolean}
 */
export function isWorkoutLogIntent(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return false;
  if (/\b(allenamento|workout|training|pesi|cardio|corsa|sessione)\b/.test(t)) return true;
  if (
    /\b(spinta|trazione|gambe|push|pull|legs|petto|dorso|upper|lower|leg\s*day)\b/.test(t)
    && /\b(fatto|fatta|completato|oggi|ieri|alle|ore|ho\s+fatto|session)\b/.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Normalizza un raw LLM/utente verso enum chat workoutType.
 * @param {unknown} value
 * @returns {'spinta'|'trazione'|'gambe'|'cardio'|'altro'|null}
 */
export function normalizeChatWorkoutType(value) {
  const raw = asTrimmedString(value).toLowerCase().replace(/\s+/g, '');
  if (!raw) return null;
  if (WORKOUT_TYPE_ENUM.includes(raw)) return raw;
  const aliased = WORKOUT_TYPE_ALIASES[raw];
  if (aliased) return aliased;
  return null;
}

/**
 * Inferisce workoutType dal testo libero.
 * @param {string} userText
 * @returns {'spinta'|'trazione'|'gambe'|'cardio'|'altro'|null}
 */
export function inferWorkoutTypeFromText(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return null;
  if (/\b(gambe|legs|lower|squat|leg\s*day|quadricip|affondi)\b/.test(t)) return 'gambe';
  if (/\b(spinta|push|petto|spalle|tricipit|panca|shoulder|military)\b/.test(t)) return 'spinta';
  if (/\b(trazione|pull|dorso|schiena|bicipit|remat|trazioni|chin\s*up|pull\s*up)\b/.test(t)) {
    return 'trazione';
  }
  if (/\b(cardio|corsa|run|bike|hiit|nuoto|swim|tapis|ellittica)\b/.test(t)) return 'cardio';
  if (/\b(allenamento|workout|pesi|training|sessione)\b/.test(t)) return 'altro';
  return null;
}

/**
 * Payload minimo locale quando Gemini fallisce ma l'intent è chiaro.
 * @param {string} userText
 * @returns {object}
 */
export function buildLocalWorkoutPayloadFromText(userText) {
  const workoutType = inferWorkoutTypeFromText(userText) || 'altro';
  const time = parseExactTimeFromUserText(userText);
  return {
    workoutType,
    workoutName: WORKOUT_TYPE_LABELS[workoutType] || 'Allenamento',
    exercises: [],
    ...(time ? { timeString: time, exactTime: time } : {}),
  };
}

/** Solo HH:mm valido — evita di interpretare decimalHour (es. 12.13) come orario. */
export function isClockTimeString(value) {
  const raw = asTrimmedString(value);
  if (!raw) return false;
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return Number.isFinite(hours) && Number.isFinite(minutes)
    && hours >= 0 && hours <= 23
    && minutes >= 0 && minutes < 60;
}

export function resolveWorkoutTimeDefault(now = new Date()) {
  return formatCurrentSystemTimeContext(now).timeHHmm;
}

export function applyWorkoutTimeSmartDefault(payload = {}, now = new Date()) {
  const next = { ...(payload || {}) };
  if (isClockTimeString(next.exactTime) || isClockTimeString(next.timeString)) {
    const clock = asTrimmedString(next.exactTime || next.timeString);
    return { ...next, exactTime: clock, timeString: clock };
  }
  const nowTime = resolveWorkoutTimeDefault(now);
  return { ...next, exactTime: nowTime, timeString: nowTime };
}

export function hasWorkoutToday(activeLog = []) {
  return (Array.isArray(activeLog) ? activeLog : []).some(
    (item) => item && String(item?.type || '').toLowerCase() === 'workout',
  );
}

export function workoutPayloadHasExplicitTime(payload = {}, userText = '') {
  if (isClockTimeString(payload?.exactTime) || isClockTimeString(payload?.timeString)) {
    return true;
  }
  return Boolean(parseExactTimeFromUserText(userText));
}

export function parseWorkoutConflictResponse(text) {
  const t = asTrimmedString(text).toLowerCase();
  if (!t) return null;
  if (/^(annulla|no|stop|cancel)\b/.test(t)) return 'cancel';
  if (/^(procedi|continua|vai|ok|s[iì])\b/.test(t)) return 'proceed';
  return null;
}

/**
 * Applica l'orario dallo slot AWAITING_WORKOUT_TIME al payload in sospeso.
 */
export function applyWorkoutTimeSlotResponse(payload = {}, userText = '') {
  const exactTime =
    parseExactTimeFromUserText(userText)
    || normalizeExactTime(userText);
  if (!exactTime) {
    return { ok: false, payload: { ...payload } };
  }
  return {
    ok: true,
    payload: {
      ...payload,
      exactTime,
      timeString: exactTime,
    },
  };
}

function normalizeWorkoutMatchKey(value) {
  return asTrimmedString(value).toLowerCase();
}

function fuzzyIncludesMatch(needle, haystack) {
  const a = normalizeWorkoutMatchKey(needle);
  const b = normalizeWorkoutMatchKey(haystack);
  if (!a || !b) return false;
  return b.includes(a) || a.includes(b);
}

function collectWorkoutSearchKeywords(payload = {}) {
  const keywords = new Set();
  const workoutName = asTrimmedString(payload?.workoutName);
  if (workoutName) {
    keywords.add(normalizeWorkoutMatchKey(workoutName));
    workoutName
      .toLowerCase()
      .split(/\s+/)
      .map((part) => part.replace(/[^a-zàèéìòù0-9]/gi, ''))
      .filter((part) => part.length >= 3)
      .forEach((part) => keywords.add(part));
  }

  const exercises = Array.isArray(payload?.exercises) ? payload.exercises : [];
  exercises.forEach((item) => {
    const exerciseName = asTrimmedString(item?.exerciseName || item?.name);
    if (!exerciseName) return;
    keywords.add(normalizeWorkoutMatchKey(exerciseName));
    exerciseName
      .toLowerCase()
      .split(/\s+/)
      .map((part) => part.replace(/[^a-zàèéìòù0-9]/gi, ''))
      .filter((part) => part.length >= 3)
      .forEach((part) => keywords.add(part));
  });

  return [...keywords].filter(Boolean);
}

function collectWorkoutEntryTargets(entry = {}) {
  return [
    entry.desc,
    entry.name,
    entry.workoutDetailNote,
  ]
    .map(normalizeWorkoutMatchKey)
    .filter(Boolean);
}

function collectWorkoutEntriesFromState(currentState = {}) {
  const out = [];

  const pushEntry = (entry, dayOffset = 0) => {
    if (!entry || String(entry?.type || '').toLowerCase() !== 'workout') return;
    const kcal = Number(entry?.kcal ?? entry?.cal);
    if (!Number.isFinite(kcal) || kcal <= 0) return;
    out.push({
      workoutType: asTrimmedString(entry?.workoutType || entry?.subType),
      desc: asTrimmedString(entry?.desc),
      name: asTrimmedString(entry?.name),
      workoutDetailNote: asTrimmedString(entry?.workoutDetailNote),
      kcal: Math.round(kcal),
      lastUsed: Number(entry?.timestamp ?? entry?.lastUsedAt ?? entry?.lastUsed) || 0,
      dayOffset,
    });
  };

  const activeLog = Array.isArray(currentState?.activeLog) ? currentState.activeLog : [];
  activeLog.forEach((entry) => pushEntry(entry, 0));

  const fullHistory = currentState?.fullHistory;
  const anchor = asTrimmedString(currentState?.activeDate);
  if (fullHistory && typeof fullHistory === 'object' && anchor) {
    for (let dayOffset = 1; dayOffset < 30; dayOffset += 1) {
      let dStr = '';
      try {
        dStr = addDays(anchor, -dayOffset);
      } catch {
        break;
      }
      let log = [];
      try {
        log = getLogFromStoricoTree(fullHistory, dStr) || [];
      } catch {
        log = [];
      }
      (Array.isArray(log) ? log : []).forEach((entry) => pushEntry(entry, dayOffset));
    }
  }

  return out;
}

/**
 * Ultimo valore kcal storico per nome/tipo allenamento simile (fuzzy includes).
 */
export function resolveHistoricalWorkoutKcal(payload = {}, currentState = {}) {
  try {
    const keywords = collectWorkoutSearchKeywords(payload);
    if (!keywords.length) return null;

    const entries = collectWorkoutEntriesFromState(currentState);
    if (!entries.length) return null;

    const matches = entries
      .filter((entry) => {
        const targets = collectWorkoutEntryTargets(entry);
        if (!targets.length) return false;
        return keywords.some((keyword) =>
          targets.some((target) => fuzzyIncludesMatch(keyword, target)),
        );
      })
      .sort((a, b) => {
        if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
        if (b.lastUsed !== a.lastUsed) return b.lastUsed - a.lastUsed;
        return 0;
      });

    return matches[0]?.kcal ?? null;
  } catch (err) {
    console.warn('[workoutRegistrationSlots] resolveHistoricalWorkoutKcal failed', err);
    return null;
  }
}

export function applyHistoricalWorkoutKcalDefault(payload = {}, currentState = {}) {
  const next = { ...(payload || {}) };
  const historical = resolveHistoricalWorkoutKcal(next, currentState);
  if (historical != null && historical > 0) {
    next.estimatedKcal = historical;
    return next;
  }

  const existing = Number(next.estimatedKcal ?? next.kcal);
  if (Number.isFinite(existing) && existing > 0) {
    next.estimatedKcal = Math.round(existing);
  }
  return next;
}
