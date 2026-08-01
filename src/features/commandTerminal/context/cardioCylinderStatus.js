/**
 * Cilindro Cardio — finestra mobile 7 giorni (168h) + spillover dai pesi.
 * Nessun reset domenicale: la finestra scorre con Date.now().
 */

export const CARDIO_WEEKLY_TARGET_MINUTES = 150;
export const STRENGTH_CARDIO_SPILLOVER_RATIO = 0.3;
export const ROLLING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 168 ore

const PURE_CARDIO_TYPES = new Set([
  'cardio',
  'hiit',
  'liss',
  'corsa',
  'running',
  'bike',
  'nuoto',
  'swim',
  'camminata',
  'walking',
  'passi',
  'walk',
  'passeggio',
]);

/** Tipi / keyword trattati come quota «passi / camminate» nello scontrino. */
const WALKING_OR_STEPS_TYPES = new Set([
  'liss',
  'camminata',
  'walking',
  'passi',
  'walk',
  'passeggio',
]);

/** Stima kcal da passi se il log non porta kcal (≈0.04 kcal/passo). */
export const KCAL_PER_STEP_ESTIMATE = 0.04;
const STRENGTH_TYPES = new Set([
  'pesi',
  'spinta',
  'trazione',
  'gambe',
  'push',
  'pull',
  'legs',
  'strength',
  'hypertrophy',
  'ipertrofia',
  'forza',
]);

function asTrimmedString(value) {
  return String(value ?? '').trim();
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {unknown} entry
 * @returns {string}
 */
export function resolveWorkoutTypeId(entry) {
  return asTrimmedString(
    entry?.workoutType
    ?? entry?.subType
    ?? entry?.activityType
    ?? entry?.type,
  ).toLowerCase();
}

/**
 * Durata in minuti da entry diario (duration ore decimali o durationMinutes).
 * @param {object} entry
 * @returns {number}
 */
export function resolveWorkoutDurationMinutes(entry) {
  if (!entry || typeof entry !== 'object') return 0;
  const mins = Number(entry.durationMinutes ?? entry.durationMin);
  if (Number.isFinite(mins) && mins > 0) return mins;
  const hours = Number(entry.duration);
  if (Number.isFinite(hours) && hours > 0) {
    // Convention Kentu: duration sul log è in ore (es. 0.75 = 45 min).
    // Se qualcuno passa già i minuti (>24), trattali come minuti.
    if (hours > 24) return hours;
    return hours * 60;
  }
  return 0;
}

/**
 * Epoch ms dell'evento. Fallback: dateKey + ora decimale timeline.
 * @param {object} entry
 * @param {string|null} [dateKey] YYYY-MM-DD
 * @returns {number|null}
 */
export function resolveWorkoutEventMs(entry, dateKey = null) {
  if (!entry || typeof entry !== 'object') return null;

  const direct = Number(
    entry.timestamp
    ?? entry.loggedAt
    ?? entry.createdAt
    ?? entry.at
    ?? entry.lastUsedAt,
  );
  if (Number.isFinite(direct) && direct > 0) {
    // secondi vs ms
    return direct < 1e12 ? direct * 1000 : direct;
  }

  const iso = asTrimmedString(entry.dateISO || entry.date || dateKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;

  const decimalHour = Number(entry.time ?? entry.startTime ?? entry.decimalHour);
  let hours = 12;
  let minutes = 0;
  if (Number.isFinite(decimalHour) && decimalHour >= 0 && decimalHour < 24) {
    hours = Math.floor(decimalHour);
    minutes = Math.round((decimalHour - hours) * 60);
  } else {
    const clock = asTrimmedString(entry.exactTime || entry.timeString);
    const match = clock.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      hours = Number(match[1]);
      minutes = Number(match[2]);
    }
  }

  const ms = new Date(
    `${iso}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
  ).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {string} typeId
 * @returns {boolean}
 */
export function isPureCardioWorkoutType(typeId) {
  const t = asTrimmedString(typeId).toLowerCase();
  if (!t || t === 'workout') return false;
  return PURE_CARDIO_TYPES.has(t);
}

/**
 * Camminate / passi / LISS leggero — quota distinta nello scontrino cardio.
 * @param {object} entry
 * @returns {boolean}
 */
export function isWalkingOrStepsWorkout(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const typeId = resolveWorkoutTypeId(entry);
  if (WALKING_OR_STEPS_TYPES.has(typeId)) return true;
  const steps = Number(entry.steps ?? entry.stepCount ?? entry.passi);
  if (Number.isFinite(steps) && steps > 0) return true;
  const hay = [
    entry.desc,
    entry.name,
    entry.title,
    entry.label,
    entry.activityType,
  ].map((v) => asTrimmedString(v).toLowerCase()).join(' ');
  return /\b(cammin|walk|passi|passegg|liss|neat)\b/.test(hay);
}

/**
 * Allenamenti con i pesi (spillover metabolico verso il cilindro cardio).
 * @param {string} typeId
 * @returns {boolean}
 */
export function isStrengthWorkoutType(typeId) {
  const t = asTrimmedString(typeId).toLowerCase();
  if (!t || t === 'workout') return false;
  return STRENGTH_TYPES.has(t);
}

/**
 * Unisce e de-duplica liste di workout (cardio puri + pesi) per la finestra.
 * @param {Array<object>} cardioLogs
 * @param {Array<object>} workoutLogs
 * @returns {Array<object>}
 */
function mergeWorkoutPools(cardioLogs = [], workoutLogs = []) {
  const merged = [];
  const seen = new Set();
  const push = (entry) => {
    if (!entry || typeof entry !== 'object') return;
    const type = asTrimmedString(entry.type || '').toLowerCase();
    // Accetta entry workout esplicite, oppure entry già tipizzate (cardio/hiit/pesi…)
    if (type && type !== 'workout' && !PURE_CARDIO_TYPES.has(type) && !STRENGTH_TYPES.has(type)) {
      return;
    }
    const id = asTrimmedString(entry.id || entry.nodeId);
    const key = id
      || [
        resolveWorkoutTypeId(entry),
        resolveWorkoutEventMs(entry, entry.__dateKey || null),
        resolveWorkoutDurationMinutes(entry),
        asTrimmedString(entry.desc || entry.name),
      ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(entry);
  };

  (Array.isArray(cardioLogs) ? cardioLogs : []).forEach(push);
  (Array.isArray(workoutLogs) ? workoutLogs : []).forEach(push);
  return merged;
}

/**
 * Stato del Cilindro Cardio su finestra mobile di 168 ore.
 *
 * @param {Array<object>} cardioLogs — sessioni LISS/HIIT/cardio (o pool misto)
 * @param {Array<object>} workoutLogs — sessioni pesi / generiche (spillover 30%)
 * @param {{ nowMs?: number, weeklyTargetMinutes?: number, spilloverRatio?: number }} [options]
 * @returns {{
 *   windowHours: 168,
 *   windowStartMs: number,
 *   windowEndMs: number,
 *   pureCardioMinutes: number,
 *   strengthMinutes: number,
 *   spilloverMinutes: number,
 *   accumulatedMinutes: number,
 *   weeklyTargetMinutes: number,
 *   fillRatio: number,
 *   fillPercent: number,
 *   remainingMinutes: number,
 * }}
 */
export function calculateCardioStatus(cardioLogs = [], workoutLogs = [], options = {}) {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const windowEndMs = nowMs;
  const windowStartMs = nowMs - ROLLING_WINDOW_MS;
  const weeklyTargetMinutes = Math.max(
    1,
    Number(options.weeklyTargetMinutes) || CARDIO_WEEKLY_TARGET_MINUTES,
  );
  const spilloverRatio = clamp01(
    options.spilloverRatio != null ? options.spilloverRatio : STRENGTH_CARDIO_SPILLOVER_RATIO,
  );

  const pool = mergeWorkoutPools(cardioLogs, workoutLogs);

  let pureCardioMinutes = 0;
  let strengthMinutes = 0;

  for (const entry of pool) {
    const eventMs = resolveWorkoutEventMs(entry, entry.__dateKey || null);
    if (eventMs == null || eventMs < windowStartMs || eventMs > windowEndMs) continue;

    const typeId = resolveWorkoutTypeId(entry);
    const minutes = resolveWorkoutDurationMinutes(entry);
    if (!(minutes > 0)) continue;

    if (isPureCardioWorkoutType(typeId)) {
      pureCardioMinutes += minutes;
      continue;
    }
    if (isStrengthWorkoutType(typeId)) {
      strengthMinutes += minutes;
    }
  }

  const spilloverMinutes = strengthMinutes * spilloverRatio;
  const accumulatedMinutes = pureCardioMinutes + spilloverMinutes;
  const fillRatio = clamp01(accumulatedMinutes / weeklyTargetMinutes);
  const fillPercent = Math.round(fillRatio * 100);
  const remainingMinutes = Math.max(0, weeklyTargetMinutes - accumulatedMinutes);

  return {
    windowHours: 168,
    windowStartMs,
    windowEndMs,
    pureCardioMinutes: Math.round(pureCardioMinutes * 10) / 10,
    strengthMinutes: Math.round(strengthMinutes * 10) / 10,
    spilloverMinutes: Math.round(spilloverMinutes * 10) / 10,
    accumulatedMinutes: Math.round(accumulatedMinutes * 10) / 10,
    weeklyTargetMinutes,
    fillRatio,
    fillPercent,
    remainingMinutes: Math.round(remainingMinutes * 10) / 10,
  };
}

function resolveEntryLabel(entry) {
  return (
    asTrimmedString(entry?.desc || entry?.name || entry?.title || entry?.label)
    || resolveWorkoutTypeId(entry)
    || 'Sessione'
  );
}

function resolveEntryKcal(entry) {
  const direct = Number(entry?.kcal ?? entry?.cal ?? entry?.calories);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
  const steps = Number(entry?.steps ?? entry?.stepCount ?? entry?.passi);
  if (Number.isFinite(steps) && steps > 0) {
    return Math.round(steps * KCAL_PER_STEP_ESTIMATE);
  }
  return 0;
}

function resolveEntrySteps(entry) {
  const steps = Number(entry?.steps ?? entry?.stepCount ?? entry?.passi);
  return Number.isFinite(steps) && steps > 0 ? Math.round(steps) : 0;
}

/**
 * Estratto conto trasparente del cilindro cardio (finestra 168h).
 * Adattato al data model: sessioni cardio, camminate/passi, spillover pesi 30%.
 *
 * @param {Array<object>} cardioLogs
 * @param {Array<object>} workoutLogs
 * @param {{ nowMs?: number, weeklyTargetMinutes?: number, spilloverRatio?: number }} [options]
 */
export function buildCardioDetailsBreakdown(cardioLogs = [], workoutLogs = [], options = {}) {
  const status = calculateCardioStatus(cardioLogs, workoutLogs, options);
  const nowMs = status.windowEndMs;
  const windowStartMs = status.windowStartMs;
  const spilloverRatio = clamp01(
    options.spilloverRatio != null ? options.spilloverRatio : STRENGTH_CARDIO_SPILLOVER_RATIO,
  );

  const pool = mergeWorkoutPools(cardioLogs, workoutLogs);
  /** @type {Array<object>} */
  const cardioSessions = [];
  /** @type {Array<object>} */
  const walkingSessions = [];
  /** @type {Array<object>} */
  const strengthSessions = [];

  let walkingMinutes = 0;
  let walkingSteps = 0;
  let walkingKcal = 0;
  let structuredCardioMinutes = 0;
  let structuredCardioKcal = 0;
  let strengthKcal = 0;

  for (const entry of pool) {
    const eventMs = resolveWorkoutEventMs(entry, entry.__dateKey || null);
    if (eventMs == null || eventMs < windowStartMs || eventMs > nowMs) continue;

    const typeId = resolveWorkoutTypeId(entry);
    const minutes = resolveWorkoutDurationMinutes(entry);
    if (!(minutes > 0) && !(resolveEntrySteps(entry) > 0)) continue;

    const row = {
      id: asTrimmedString(entry.id || entry.nodeId) || null,
      label: resolveEntryLabel(entry),
      typeId,
      minutes: Math.round(minutes * 10) / 10,
      kcal: resolveEntryKcal(entry),
      steps: resolveEntrySteps(entry),
      dateKey: asTrimmedString(entry.__dateKey || entry.dateISO || entry.date).slice(0, 10) || null,
    };

    if (isWalkingOrStepsWorkout(entry)) {
      walkingSessions.push(row);
      walkingMinutes += minutes;
      walkingSteps += row.steps;
      walkingKcal += row.kcal;
      continue;
    }

    if (isPureCardioWorkoutType(typeId)) {
      cardioSessions.push(row);
      structuredCardioMinutes += minutes;
      structuredCardioKcal += row.kcal;
      continue;
    }

    if (isStrengthWorkoutType(typeId)) {
      const spill = Math.round(minutes * spilloverRatio * 10) / 10;
      strengthSessions.push({
        ...row,
        spilloverMinutes: spill,
      });
      strengthKcal += row.kcal;
    }
  }

  const spilloverMinutes = Math.round(status.spilloverMinutes * 10) / 10;

  return {
    ...status,
    unit: 'min',
    totalMinutes: status.accumulatedMinutes,
    targetMinutes: status.weeklyTargetMinutes,
    walking: {
      minutes: Math.round(walkingMinutes * 10) / 10,
      steps: walkingSteps,
      kcal: walkingKcal,
      sessions: walkingSessions,
      conversionNote: walkingSteps > 0
        ? `${walkingSteps.toLocaleString('it-IT')} passi`
        : (walkingMinutes > 0 ? 'Camminate / LISS senza conteggio passi' : 'Nessuna camminata registrata'),
    },
    structuredCardio: {
      minutes: Math.round(structuredCardioMinutes * 10) / 10,
      kcal: structuredCardioKcal,
      sessions: cardioSessions,
    },
    strengthSpillover: {
      strengthMinutes: status.strengthMinutes,
      spilloverMinutes,
      spilloverRatio,
      kcal: strengthKcal,
      sessions: strengthSessions,
      ruleLabel: `${Math.round(spilloverRatio * 100)}% della durata pesi conta come cardio`,
    },
  };
}
