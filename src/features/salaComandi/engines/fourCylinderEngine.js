/**
 * Motore puro "4 cilindri" — decadimento muscolare e fatica sistemica.
 *
 * Nessuna dipendenza React/Firebase. Consumato da hook e save-path in fasi successive.
 *
 * Semantica approvata:
 * - decay.push | pull | legs : 0 = muscolo atrofizzato/da allenare, 1 = stimolato al massimo.
 *   Decresce con i giorni senza stimolo (mezzanotte virtuale).
 * - systemic_fatigue : 0 = riposato, 1 = sovrallenato. Decresce a riposo, sale con il carico.
 */

/** @typedef {'push' | 'pull' | 'legs'} MuscleCylinderId */

/**
 * @typedef {object} FourCylinderDecay
 * @property {number} push 0–1 stimolo residuo spinta
 * @property {number} pull 0–1 stimolo residuo trazione
 * @property {number} legs 0–1 stimolo residuo gambe
 */

/**
 * @typedef {object} FourCylinderParams
 * @property {FourCylinderDecay} decayPerDay Quanto scende ogni cilindro muscolare per giorno di riposo
 * @property {number} systemicRecoveryPerDay Quanto scende systemic_fatigue per giorno di riposo
 * @property {number} maxMuscleBump Incremento massimo per cilindro in una singola sessione
 * @property {number} maxSystemicBump Incremento massimo fatica sistemica per sessione
 * @property {number} maxSystemicRecoveryPerSleep Quanto può scendere al max la fatica con sonno perfetto
 * @property {number} poorSleepFatiguePenalty Incremento fatica se recoveryEfficiency < 0.4
 * @property {CognitivePenaltyPerHour} cognitivePenaltyPerHour Penalità systemic per ora di carico cognitivo
 * @property {number} maxCognitiveBump Cap stress sistemico per singola sessione cognitiva/lavoro
 * @property {number} proteinShieldMultiplier Fattore atrofia se proteinTargetHit quel giorno (es. 0.5 = dimezza)
 * @property {number} fastedWorkoutPenalty Fattore stimolo muscolare se allenamento in digiuno profondo
 * @property {FourCylinderDecay} stimulusGain Moltiplicatori v1 (fissi a 1)
 */

/**
 * Mappa nutrizione giornaliera per catch-up: ISO date → target proteico raggiunto.
 * @typedef {Object.<string, boolean>} DailyNutritionMap
 */

/**
 * Penalità oraria per workoutType (studio / lavoro_pc / lavoro).
 * @typedef {object} CognitivePenaltyPerHour
 * @property {number} studio
 * @property {number} lavoro_pc
 * @property {number} lavoro
 * @property {number} default fallback se workoutType sconosciuto
 */

/**
 * @typedef {object} FourCylinderLastStimulus
 * @property {string} workoutId
 * @property {string} date ISO YYYY-MM-DD
 * @property {number} at epoch ms
 * @property {string} workoutType
 * @property {string[]} muscles
 * @property {FourCylinderDecay & { systemic: number }} applied
 */

/**
 * @typedef {object} FourCylinderState
 * @property {number} engineVersion
 * @property {string} lastProcessedDate ISO YYYY-MM-DD — ultimo giorno di decay virtuale applicato
 * @property {string} [lastUpdatedIso] ISO YYYY-MM-DD — ultimo evento che ha mutato decay/systemic
 * @property {number} updatedAt epoch ms
 * @property {FourCylinderDecay} decay
 * @property {number} systemic_fatigue 0–1
 * @property {FourCylinderParams} params
 * @property {FourCylinderLastStimulus | null} [lastStimulus]
 */

/**
 * @typedef {object} WorkoutStimulusInput
 * @property {string} [workoutId]
 * @property {string} [date] ISO YYYY-MM-DD
 * @property {string} [workoutType] es. pesi | cardio | hiit | riposo
 * @property {string[]} [muscles] gruppi muscolari canonici
 * @property {number} [kcal]
 * @property {number} [duration] ore decimali (es. 1.0 = 60 min)
 * @property {number} [rpe] 1–10 opzionale
 * @property {boolean} [isFastedState] true se allenamento in digiuno profondo (3° pilastro)
 */

/**
 * Input sonno per il 2° pilastro (raffreddamento sistemico).
 * `recoveryEfficiency` 0–1 — pre-calcolato da useSleepEngine / computeSleepEngineSnapshot.
 *
 * @typedef {object} SleepRecoveryInput
 * @property {number} sleepHours ore totali di sonno (informativo v1, riservato tuning futuro)
 * @property {number} recoveryEfficiency 0–1 efficienza recupero notturno
 * @property {string} [sleepId] id voce log sonno
 * @property {string} [date] ISO YYYY-MM-DD
 */

/**
 * Delta applicato dal sonno (flat log + nested).
 * @typedef {FourCylinderDecay & { systemic: number }} SleepRecoveryDelta
 */

/**
 * Snapshot flat per voce diario sonno (`fourCylinderSnapshot` con chiave `recovery`).
 * @typedef {object} FourCylinderSleepLogSnapshot
 * @property {number} engineVersion
 * @property {number} capturedAt epoch ms
 * @property {FourCylinderFlatLevels} before
 * @property {FourCylinderFlatLevels} recovery delta fatica/recupero applicato
 * @property {FourCylinderFlatLevels} after
 * @property {boolean} [optimizedRecovery] true se recoveryEfficiency > 0.7
 */

/**
 * Input 4° pilastro — carico cognitivo / stress (cortisolo).
 *
 * @typedef {object} CognitiveStressInput
 * @property {number} duration ore decimali della sessione
 * @property {string} workoutType es. studio | lavoro_pc | lavoro
 * @property {string} [sessionId] id voce log
 * @property {string} [date] ISO YYYY-MM-DD
 */

/**
 * Delta stress cognitivo (muscoli a 0; solo systemic).
 * @typedef {FourCylinderDecay & { systemic: number }} CognitiveStressDelta
 */

/**
 * Snapshot flat per voce diario cognitiva (`fourCylinderSnapshot` con chiave `stress`).
 * @typedef {object} FourCylinderCognitiveLogSnapshot
 * @property {number} engineVersion
 * @property {number} capturedAt epoch ms
 * @property {FourCylinderFlatLevels} before
 * @property {FourCylinderFlatLevels} stress delta applicato (muscoli 0, systemic = bump)
 * @property {FourCylinderFlatLevels} after
 */

/**
 * Snapshot flat per voce diario (`fourCylinderSnapshot`).
 * @typedef {object} FourCylinderFlatLevels
 * @property {number} decay_push
 * @property {number} decay_pull
 * @property {number} decay_legs
 * @property {number} systemic_fatigue
 */

/**
 * @typedef {object} FourCylinderLogSnapshot
 * @property {number} engineVersion
 * @property {number} capturedAt epoch ms
 * @property {FourCylinderFlatLevels} before
 * @property {FourCylinderFlatLevels} stimulus
 * @property {FourCylinderFlatLevels} after
 */

export const FOUR_CYLINDER_ENGINE_VERSION = 1;

/** Parametri v1 hardcoded — tuning utente in fase 2. */
export const DEFAULT_FOUR_CYLINDER_PARAMS = Object.freeze({
  decayPerDay: Object.freeze({
    push: 0.12,
    pull: 0.12,
    legs: 0.10,
  }),
  systemicRecoveryPerDay: 0.08,
  maxMuscleBump: 0.55,
  maxSystemicBump: 0.35,
  maxSystemicRecoveryPerSleep: 0.35,
  poorSleepFatiguePenalty: 0.10,
  cognitivePenaltyPerHour: Object.freeze({
    studio: 0.04,
    lavoro_pc: 0.03,
    lavoro: 0.02,
    default: 0.02,
  }),
  maxCognitiveBump: 0.30,
  proteinShieldMultiplier: 0.5,
  fastedWorkoutPenalty: 0.7,
  stimulusGain: Object.freeze({
    push: 1,
    pull: 1,
    legs: 1,
  }),
});

/** @type {FourCylinderDecay} */
export const DEFAULT_MUSCLE_LEVELS = Object.freeze({
  push: 0,
  pull: 0,
  legs: 0,
});

/** Mappa gruppo muscolare → cilindro. */
const MUSCLE_CYLINDER_MAP = Object.freeze({
  petto: 'push',
  spalle: 'push',
  tricipiti: 'push',
  tricipite: 'push',
  dorso: 'pull',
  schiena: 'pull',
  bicipiti: 'pull',
  bicipite: 'pull',
  avambracci: 'pull',
  avambraccio: 'pull',
  gambe: 'legs',
  abs: 'legs',
  addominali: 'legs',
  core: 'legs',
});

const CARDIO_TYPES = new Set(['cardio', 'hiit', 'misto']);
const REST_TYPES = new Set(['riposo', 'rest']);

/** Soglia sotto la quale il sonno penalizza la fatica invece di smaltirla. */
export const POOR_SLEEP_EFFICIENCY_THRESHOLD = 0.4;

/** Soglia sopra la quale il recupero notturno abilita optimizedRecovery (decadimento muscolare). */
export const OPTIMIZED_RECOVERY_EFFICIENCY_THRESHOLD = 0.7;

/**
 * @param {unknown} value
 * @returns {number} clamp 0–1
 */
export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {string | null | undefined} iso
 * @returns {Date | null} mezzanotte UTC
 */
function parseIsoDateUtc(iso) {
  const raw = String(iso || '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

/**
 * @param {Date} date
 * @returns {string} YYYY-MM-DD UTC
 */
function toIsoDateUtc(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Giorni calendariali interi tra due ISO (UTC). Positivo se `toIso` è dopo `fromIso`.
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {number | null}
 */
export function diffCalendarDaysUtc(fromIso, toIso) {
  const from = parseIsoDateUtc(fromIso);
  const to = parseIsoDateUtc(toIso);
  if (!from || !to) return null;
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / MS);
}

/**
 * @param {FourCylinderDecay} decay
 * @returns {FourCylinderDecay}
 */
export function clampMuscleDecay(decay) {
  return {
    push: clamp01(decay?.push),
    pull: clamp01(decay?.pull),
    legs: clamp01(decay?.legs),
  };
}

/**
 * @param {unknown} partial
 * @param {string} [todayIso] default oggi UTC
 * @returns {FourCylinderState}
 */
export function createDefaultFourCylinderState(todayIso) {
  const today = todayIso || toIsoDateUtc(new Date());
  return sanitizeFourCylinderState({
    engineVersion: FOUR_CYLINDER_ENGINE_VERSION,
    lastProcessedDate: today,
    updatedAt: 0,
    decay: { ...DEFAULT_MUSCLE_LEVELS },
    systemic_fatigue: 0,
    params: DEFAULT_FOUR_CYLINDER_PARAMS,
    lastStimulus: null,
  }, today);
}

/**
 * @param {unknown} raw
 * @param {string} [fallbackDate]
 * @returns {FourCylinderState}
 */
export function sanitizeFourCylinderState(raw, fallbackDate) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const today = String(fallbackDate || src.lastProcessedDate || toIsoDateUtc(new Date())).slice(0, 10);
  const paramsSrc = src.params && typeof src.params === 'object' ? src.params : {};

  const decayPerDaySrc = paramsSrc.decayPerDay && typeof paramsSrc.decayPerDay === 'object'
    ? paramsSrc.decayPerDay
    : {};
  const cognitivePenaltySrc =
    paramsSrc.cognitivePenaltyPerHour && typeof paramsSrc.cognitivePenaltyPerHour === 'object'
      ? paramsSrc.cognitivePenaltyPerHour
      : {};
  const defaultCognitivePenalty = DEFAULT_FOUR_CYLINDER_PARAMS.cognitivePenaltyPerHour;

  /** @type {FourCylinderParams} */
  const params = {
    decayPerDay: {
      push: clamp01(decayPerDaySrc.push ?? DEFAULT_FOUR_CYLINDER_PARAMS.decayPerDay.push),
      pull: clamp01(decayPerDaySrc.pull ?? DEFAULT_FOUR_CYLINDER_PARAMS.decayPerDay.pull),
      legs: clamp01(decayPerDaySrc.legs ?? DEFAULT_FOUR_CYLINDER_PARAMS.decayPerDay.legs),
    },
    systemicRecoveryPerDay: clamp01(
      paramsSrc.systemicRecoveryPerDay ?? DEFAULT_FOUR_CYLINDER_PARAMS.systemicRecoveryPerDay,
    ),
    maxMuscleBump: clamp01(paramsSrc.maxMuscleBump ?? DEFAULT_FOUR_CYLINDER_PARAMS.maxMuscleBump),
    maxSystemicBump: clamp01(paramsSrc.maxSystemicBump ?? DEFAULT_FOUR_CYLINDER_PARAMS.maxSystemicBump),
    maxSystemicRecoveryPerSleep: clamp01(
      paramsSrc.maxSystemicRecoveryPerSleep ?? DEFAULT_FOUR_CYLINDER_PARAMS.maxSystemicRecoveryPerSleep,
    ),
    poorSleepFatiguePenalty: clamp01(
      paramsSrc.poorSleepFatiguePenalty ?? DEFAULT_FOUR_CYLINDER_PARAMS.poorSleepFatiguePenalty,
    ),
    cognitivePenaltyPerHour: {
      studio: clamp01(cognitivePenaltySrc.studio ?? defaultCognitivePenalty.studio),
      lavoro_pc: clamp01(cognitivePenaltySrc.lavoro_pc ?? defaultCognitivePenalty.lavoro_pc),
      lavoro: clamp01(cognitivePenaltySrc.lavoro ?? defaultCognitivePenalty.lavoro),
      default: clamp01(cognitivePenaltySrc.default ?? defaultCognitivePenalty.default),
    },
    maxCognitiveBump: clamp01(
      paramsSrc.maxCognitiveBump ?? DEFAULT_FOUR_CYLINDER_PARAMS.maxCognitiveBump,
    ),
    proteinShieldMultiplier: clamp01(
      paramsSrc.proteinShieldMultiplier ?? DEFAULT_FOUR_CYLINDER_PARAMS.proteinShieldMultiplier,
    ),
    fastedWorkoutPenalty: clamp01(
      paramsSrc.fastedWorkoutPenalty ?? DEFAULT_FOUR_CYLINDER_PARAMS.fastedWorkoutPenalty,
    ),
    stimulusGain: {
      push: clamp01(paramsSrc.stimulusGain?.push ?? 1) || 1,
      pull: clamp01(paramsSrc.stimulusGain?.pull ?? 1) || 1,
      legs: clamp01(paramsSrc.stimulusGain?.legs ?? 1) || 1,
    },
  };

  const lastProcessed = String(src.lastProcessedDate || today).trim().slice(0, 10);
  const lastUpdatedIsoRaw = String(src.lastUpdatedIso || lastProcessed || today).trim().slice(0, 10);

  return {
    engineVersion: Number(src.engineVersion) || FOUR_CYLINDER_ENGINE_VERSION,
    lastProcessedDate: /^\d{4}-\d{2}-\d{2}$/.test(lastProcessed) ? lastProcessed : today,
    lastUpdatedIso: /^\d{4}-\d{2}-\d{2}$/.test(lastUpdatedIsoRaw) ? lastUpdatedIsoRaw : today,
    updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : Date.now(),
    decay: clampMuscleDecay(src.decay || src.muscleDecay || DEFAULT_MUSCLE_LEVELS),
    systemic_fatigue: clamp01(src.systemic_fatigue ?? src.systemicFatigue ?? 0),
    params,
    lastStimulus: sanitizeLastStimulus(src.lastStimulus),
  };
}

/**
 * @param {unknown} raw
 * @returns {FourCylinderLastStimulus | null}
 */
function sanitizeLastStimulus(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const applied = raw.applied && typeof raw.applied === 'object' ? raw.applied : {};
  return {
    workoutId: String(raw.workoutId || ''),
    date: String(raw.date || '').slice(0, 10),
    at: Number.isFinite(Number(raw.at)) ? Number(raw.at) : Date.now(),
    workoutType: String(raw.workoutType || ''),
    muscles: Array.isArray(raw.muscles) ? raw.muscles.map(String) : [],
    applied: {
      push: clamp01(applied.push),
      pull: clamp01(applied.pull),
      legs: clamp01(applied.legs),
      systemic: clamp01(applied.systemic ?? applied.systemic_fatigue),
    },
  };
}

/**
 * Converte livelli nested → flat per il log diario.
 * @param {FourCylinderDecay} decay
 * @param {number} systemicFatigue
 * @returns {FourCylinderFlatLevels}
 */
export function flattenFourCylinderLevels(decay, systemicFatigue) {
  const d = clampMuscleDecay(decay);
  return {
    decay_push: d.push,
    decay_pull: d.pull,
    decay_legs: d.legs,
    systemic_fatigue: clamp01(systemicFatigue),
  };
}

/**
 * Delta flat (stimulus) per snapshot log.
 * @param {FourCylinderDecay & { systemic?: number }} delta
 * @returns {FourCylinderFlatLevels}
 */
export function flattenStimulusDelta(delta) {
  return {
    decay_push: clamp01(delta?.push),
    decay_pull: clamp01(delta?.pull),
    decay_legs: clamp01(delta?.legs),
    systemic_fatigue: clamp01(delta?.systemic ?? delta?.systemic_fatigue),
  };
}

/**
 * Delta flat (recovery sonno) per snapshot log — magnitude applicata su systemic_fatigue.
 * I cilindri muscolari restano 0 (il sonno non alza lo stimolo in v1).
 *
 * @param {SleepRecoveryDelta} delta
 * @returns {FourCylinderFlatLevels}
 */
export function flattenRecoveryDelta(delta) {
  return {
    decay_push: clamp01(delta?.push),
    decay_pull: clamp01(delta?.pull),
    decay_legs: clamp01(delta?.legs),
    systemic_fatigue: clamp01(delta?.systemic ?? delta?.systemic_fatigue),
  };
}

/**
 * @param {string} iso YYYY-MM-DD
 * @param {number} deltaDays
 * @returns {string | null}
 */
function addCalendarDaysUtc(iso, deltaDays) {
  const d = parseIsoDateUtc(iso);
  if (!d) return null;
  const n = Math.floor(Number(deltaDays) || 0);
  d.setUTCDate(d.getUTCDate() + n);
  return toIsoDateUtc(d);
}

/**
 * Applica un singolo giorno di riposo virtuale (mezzanotte).
 * I cilindri muscolari scendono; la fatica sistemica si smaltisce.
 * Con `proteinTargetHit`, l'atrofia muscolare è moltiplicata per `proteinShieldMultiplier`.
 *
 * @param {FourCylinderState} state
 * @param {{ proteinTargetHit?: boolean, params?: FourCylinderParams | null }} [options]
 * @returns {FourCylinderState}
 */
export function applySingleDayRecovery(state, options = {}) {
  const safe = sanitizeFourCylinderState(state);
  const activeParams = options?.params && typeof options.params === 'object'
    ? { ...safe.params, ...options.params }
    : safe.params;
  const { decayPerDay, systemicRecoveryPerDay } = activeParams;
  const proteinTargetHit = options?.proteinTargetHit === true;
  const muscleScale = proteinTargetHit
    ? clamp01(
      activeParams.proteinShieldMultiplier
        ?? DEFAULT_FOUR_CYLINDER_PARAMS.proteinShieldMultiplier,
    )
    : 1;

  return {
    ...safe,
    updatedAt: Date.now(),
    decay: clampMuscleDecay({
      push: safe.decay.push - decayPerDay.push * muscleScale,
      pull: safe.decay.pull - decayPerDay.pull * muscleScale,
      legs: safe.decay.legs - decayPerDay.legs * muscleScale,
    }),
    systemic_fatigue: clamp01(safe.systemic_fatigue - systemicRecoveryPerDay),
  };
}

/**
 * Applica N giorni consecutivi di recovery (decadimento stimolo muscolare).
 * Senza mappa nutrizione: decadimento standard (nessuno scudo proteico).
 *
 * @param {FourCylinderState} state
 * @param {number} days intero ≥ 0
 * @returns {{ nextState: FourCylinderState, daysApplied: number }}
 */
export function applyDailyDecay(state, days) {
  const safe = sanitizeFourCylinderState(state);
  const n = Math.max(0, Math.floor(Number(days) || 0));
  if (n === 0) {
    return { nextState: safe, daysApplied: 0 };
  }

  let current = safe;
  for (let i = 0; i < n; i += 1) {
    current = applySingleDayRecovery(current);
  }

  return {
    nextState: {
      ...current,
      updatedAt: Date.now(),
    },
    daysApplied: n,
  };
}

/**
 * Catch-up: applica il decay per ogni notte tra `lastProcessedDate` e `todayIso`.
 * Aggiorna `lastProcessedDate` a `todayIso` se almeno un giorno è stato processato.
 *
 * Con `dailyNutritionMap[date] === true`, l'atrofia di quel giorno usa
 * `decayPerDay * proteinShieldMultiplier` (scudo anticatabolico).
 *
 * @param {FourCylinderState} state
 * @param {string} todayIso YYYY-MM-DD
 * @param {Partial<FourCylinderParams> | null} [params] override opzionale parametri motore
 * @param {DailyNutritionMap | null} [dailyNutritionMap] ISO date → proteinTargetHit
 * @returns {{ nextState: FourCylinderState, daysApplied: number }}
 */
export function catchUpDecayToDate(state, todayIso, params = null, dailyNutritionMap = null) {
  const safe = sanitizeFourCylinderState(state, todayIso);
  const today = String(todayIso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return { nextState: safe, daysApplied: 0 };
  }

  const days = diffCalendarDaysUtc(safe.lastProcessedDate, today);
  if (days == null || days <= 0) {
    return { nextState: safe, daysApplied: 0 };
  }

  const activeParams = params && typeof params === 'object'
    ? { ...safe.params, ...params }
    : safe.params;
  const nutritionMap =
    dailyNutritionMap && typeof dailyNutritionMap === 'object' ? dailyNutritionMap : null;

  let current = safe;
  for (let i = 1; i <= days; i += 1) {
    const date = addCalendarDaysUtc(safe.lastProcessedDate, i);
    if (!date) break;
    const proteinTargetHit = nutritionMap ? nutritionMap[date] === true : false;
    current = applySingleDayRecovery(current, { proteinTargetHit, params: activeParams });
  }

  return {
    nextState: {
      ...current,
      lastProcessedDate: today,
      updatedAt: Date.now(),
    },
    daysApplied: days,
  };
}

/**
 * @param {string} muscle
 * @returns {MuscleCylinderId | null}
 */
function muscleToCylinder(muscle) {
  const key = String(muscle || '').trim().toLowerCase();
  if (!key) return null;
  if (key.includes('total') && key.includes('body')) return null;
  return MUSCLE_CYLINDER_MAP[key] || null;
}

/**
 * Fattore di carico 0–1 da durata e kcal.
 * @param {number} durationHours
 * @param {number} kcal
 * @returns {number}
 */
function computeLoadFactor(durationHours, kcal) {
  const dur = Math.max(0, Number(durationHours) || 0);
  const k = Math.max(0, Number(kcal) || 0);
  const durPart = Math.min(1, dur / 1.25);
  const kcalPart = Math.min(1, k / 350);
  return clamp01(0.35 + durPart * 0.35 + kcalPart * 0.3);
}

/**
 * Calcola incrementi grezzi prima del clamp (non muta lo state).
 * Se `workout.isFastedState`, i bump muscolari usano `stimulusGain * fastedWorkoutPenalty`.
 *
 * @param {WorkoutStimulusInput} workout
 * @param {FourCylinderParams} params
 * @returns {FourCylinderDecay & { systemic: number }}
 */
export function computeWorkoutStimulusDeltas(workout, params = DEFAULT_FOUR_CYLINDER_PARAMS) {
  const type = String(workout?.workoutType || 'pesi').trim().toLowerCase();
  if (REST_TYPES.has(type)) {
    return { push: 0, pull: 0, legs: 0, systemic: 0 };
  }

  const loadFactor = computeLoadFactor(workout?.duration, workout?.kcal);
  const rpe = Number(workout?.rpe);
  const rpeBoost = Number.isFinite(rpe) && rpe >= 8 ? 1.12 : 1;
  const isFastedState = workout?.isFastedState === true;
  const fastedMuscleScale = isFastedState
    ? clamp01(params.fastedWorkoutPenalty ?? DEFAULT_FOUR_CYLINDER_PARAMS.fastedWorkoutPenalty)
    : 1;
  const gain = {
    push: (params.stimulusGain?.push ?? 1) * fastedMuscleScale,
    pull: (params.stimulusGain?.pull ?? 1) * fastedMuscleScale,
    legs: (params.stimulusGain?.legs ?? 1) * fastedMuscleScale,
  };

  /** @type {Record<MuscleCylinderId, number>} */
  const weights = { push: 0, pull: 0, legs: 0 };
  const muscles = Array.isArray(workout?.muscles) ? workout.muscles : [];
  let isTotalBody = false;

  for (const raw of muscles) {
    const label = String(raw || '').trim();
    const lower = label.toLowerCase();
    if (/total\s*body|full\s*body|fullbody/.test(lower)) {
      isTotalBody = true;
      continue;
    }
    const cyl = muscleToCylinder(label);
    if (cyl) weights[cyl] += 1;
  }

  if (isTotalBody) {
    weights.push += 1;
    weights.pull += 1;
    weights.legs += 1;
  }

  const weightSum = weights.push + weights.pull + weights.legs;

  /** @type {FourCylinderDecay} */
  let muscleDeltas = { push: 0, pull: 0, legs: 0 };

  if (CARDIO_TYPES.has(type) && weightSum === 0) {
    muscleDeltas = {
      push: 0,
      pull: 0,
      legs: clamp01(0.18 * loadFactor * gain.legs),
    };
  } else if (weightSum > 0) {
    const baseBump = params.maxMuscleBump * loadFactor;
    for (const cyl of /** @type {MuscleCylinderId[]} */ (['push', 'pull', 'legs'])) {
      if (weights[cyl] <= 0) continue;
      const share = weights[cyl] / weightSum;
      muscleDeltas[cyl] = clamp01(baseBump * share * gain[cyl]);
    }
  } else if (type === 'pesi' || type.includes('strength') || type.includes('peso')) {
    muscleDeltas = {
      push: clamp01(params.maxMuscleBump * 0.45 * loadFactor * gain.push),
      pull: 0,
      legs: 0,
    };
  }

  const systemicBase = CARDIO_TYPES.has(type) ? 0.28 : 0.16;
  const systemic = clamp01(params.maxSystemicBump * systemicBase * loadFactor * rpeBoost);

  return {
    push: muscleDeltas.push,
    pull: muscleDeltas.pull,
    legs: muscleDeltas.legs,
    systemic,
  };
}

/**
 * Applica stimolo allenamento sui cilindri muscolari (sale verso 1) e fatica sistemica (sale verso 1).
 *
 * @param {FourCylinderState} state — già catch-uppato fino a oggi
 * @param {WorkoutStimulusInput} workout
 * @returns {{
 *   nextState: FourCylinderState,
 *   stimulus: FourCylinderDecay & { systemic: number },
 *   snapshot: FourCylinderLogSnapshot,
 * }}
 */
export function applyWorkoutStimulus(state, workout) {
  const safe = sanitizeFourCylinderState(state);
  const beforeFlat = flattenFourCylinderLevels(safe.decay, safe.systemic_fatigue);

  const stimulus = computeWorkoutStimulusDeltas(workout, safe.params);

  const nextDecay = clampMuscleDecay({
    push: safe.decay.push + stimulus.push,
    pull: safe.decay.pull + stimulus.pull,
    legs: safe.decay.legs + stimulus.legs,
  });

  const nextSystemic = clamp01(safe.systemic_fatigue + stimulus.systemic);
  const afterFlat = flattenFourCylinderLevels(nextDecay, nextSystemic);

  const workoutId = String(workout?.workoutId || `workout_${Date.now()}`);
  const date = String(workout?.date || safe.lastProcessedDate).slice(0, 10);
  const capturedAt = Date.now();

  /** @type {FourCylinderLogSnapshot} */
  const snapshot = {
    engineVersion: FOUR_CYLINDER_ENGINE_VERSION,
    capturedAt,
    before: beforeFlat,
    stimulus: flattenStimulusDelta(stimulus),
    after: afterFlat,
  };

  return {
    nextState: {
      ...safe,
      updatedAt: capturedAt,
      lastUpdatedIso: date,
      decay: nextDecay,
      systemic_fatigue: nextSystemic,
      lastStimulus: {
        workoutId,
        date,
        at: capturedAt,
        workoutType: String(workout?.workoutType || 'pesi'),
        muscles: Array.isArray(workout?.muscles) ? [...workout.muscles] : [],
        applied: {
          push: stimulus.push,
          pull: stimulus.pull,
          legs: stimulus.legs,
          systemic: stimulus.systemic,
        },
      },
    },
    stimulus,
    snapshot,
  };
}

/**
 * Pipeline completa pre-save: catch-up decay → stimolo workout.
 * Propaga `workout.isFastedState` a `computeWorkoutStimulusDeltas` (limitatore ipertrofia).
 *
 * @param {FourCylinderState} state
 * @param {WorkoutStimulusInput} workout — include opzionale `isFastedState`
 * @param {string} todayIso
 * @param {DailyNutritionMap | null} [dailyNutritionMap] opzionale per catch-up con scudo proteico
 * @returns {{
 *   nextState: FourCylinderState,
 *   decayDaysApplied: number,
 *   stimulus: FourCylinderDecay & { systemic: number },
 *   snapshot: FourCylinderLogSnapshot,
 * }}
 */
export function applyWorkoutPipeline(state, workout, todayIso, dailyNutritionMap = null) {
  const { nextState: afterDecay, daysApplied } = catchUpDecayToDate(
    state,
    todayIso,
    null,
    dailyNutritionMap,
  );
  const {
    nextState,
    stimulus,
    snapshot,
  } = applyWorkoutStimulus(afterDecay, {
    ...workout,
    date: workout?.date || todayIso,
  });

  return {
    nextState,
    decayDaysApplied: daysApplied,
    stimulus,
    snapshot,
  };
}

/**
 * Calcola il delta di recupero sistemico da input sonno (non muta lo state).
 *
 * @param {SleepRecoveryInput} sleepInput
 * @param {FourCylinderParams} [params]
 * @returns {{ recovery: SleepRecoveryDelta, optimizedRecovery: boolean, isPoorSleep: boolean }}
 */
export function computeSleepRecoveryDeltas(sleepInput, params = DEFAULT_FOUR_CYLINDER_PARAMS) {
  const efficiency = clamp01(sleepInput?.recoveryEfficiency);
  const isPoorSleep = efficiency < POOR_SLEEP_EFFICIENCY_THRESHOLD;

  /** @type {SleepRecoveryDelta} */
  let recovery = { push: 0, pull: 0, legs: 0, systemic: 0 };

  if (isPoorSleep) {
    recovery.systemic = clamp01(params.poorSleepFatiguePenalty);
  } else {
    recovery.systemic = clamp01(params.maxSystemicRecoveryPerSleep * efficiency);
  }

  const optimizedRecovery = !isPoorSleep && efficiency > OPTIMIZED_RECOVERY_EFFICIENCY_THRESHOLD;

  return {
    recovery,
    optimizedRecovery,
    isPoorSleep,
  };
}

/**
 * Applica recupero sonno: raffreddamento sistemico (o penalità se sonno scarso).
 * Non modifica i livelli muscolari decay.* in v1 — abilita solo optimizedRecovery per il decadimento.
 *
 * @param {FourCylinderState} state — già catch-uppato fino a oggi
 * @param {SleepRecoveryInput} sleepInput
 * @returns {{
 *   nextState: FourCylinderState,
 *   recovery: SleepRecoveryDelta,
 *   optimizedRecovery: boolean,
 *   isPoorSleep: boolean,
 *   snapshot: FourCylinderSleepLogSnapshot,
 * }}
 */
export function applySleepRecovery(state, sleepInput) {
  const safe = sanitizeFourCylinderState(state);
  const beforeFlat = flattenFourCylinderLevels(safe.decay, safe.systemic_fatigue);

  const {
    recovery,
    optimizedRecovery,
    isPoorSleep,
  } = computeSleepRecoveryDeltas(sleepInput, safe.params);

  const nextSystemic = isPoorSleep
    ? clamp01(safe.systemic_fatigue + recovery.systemic)
    : clamp01(safe.systemic_fatigue - recovery.systemic);

  const nextDecay = clampMuscleDecay(safe.decay);
  const afterFlat = flattenFourCylinderLevels(nextDecay, nextSystemic);
  const capturedAt = Date.now();

  /** @type {FourCylinderSleepLogSnapshot} */
  const snapshot = {
    engineVersion: FOUR_CYLINDER_ENGINE_VERSION,
    capturedAt,
    before: beforeFlat,
    recovery: flattenRecoveryDelta(recovery),
    after: afterFlat,
    optimizedRecovery,
  };

  return {
    nextState: {
      ...safe,
      updatedAt: capturedAt,
      decay: nextDecay,
      systemic_fatigue: nextSystemic,
    },
    recovery,
    optimizedRecovery,
    isPoorSleep,
    snapshot,
  };
}

/**
 * Pipeline completa pre-save sonno: catch-up decay → recupero notturno.
 *
 * @param {FourCylinderState} state
 * @param {SleepRecoveryInput} sleepInput
 * @param {string} todayIso
 * @param {DailyNutritionMap | null} [dailyNutritionMap] scudo proteico in catch-up
 * @returns {{
 *   nextState: FourCylinderState,
 *   decayDaysApplied: number,
 *   recovery: SleepRecoveryDelta,
 *   optimizedRecovery: boolean,
 *   isPoorSleep: boolean,
 *   snapshot: FourCylinderSleepLogSnapshot,
 * }}
 */
export function applySleepPipeline(state, sleepInput, todayIso, dailyNutritionMap = null) {
  const { nextState: afterDecay, daysApplied } = catchUpDecayToDate(
    state,
    todayIso,
    null,
    dailyNutritionMap,
  );
  const {
    nextState,
    recovery,
    optimizedRecovery,
    isPoorSleep,
    snapshot,
  } = applySleepRecovery(afterDecay, {
    ...sleepInput,
    date: sleepInput?.date || todayIso,
  });

  return {
    nextState,
    decayDaysApplied: daysApplied,
    recovery,
    optimizedRecovery,
    isPoorSleep,
    snapshot,
  };
}

/**
 * Delta flat (stress cognitivo) per snapshot log — solo systemic_fatigue.
 * I cilindri muscolari restano 0 (il carico cognitivo non alza lo stimolo in v1).
 *
 * @param {CognitiveStressDelta} delta
 * @returns {FourCylinderFlatLevels}
 */
export function flattenStressDelta(delta) {
  return {
    decay_push: clamp01(delta?.push),
    decay_pull: clamp01(delta?.pull),
    decay_legs: clamp01(delta?.legs),
    systemic_fatigue: clamp01(delta?.systemic ?? delta?.systemic_fatigue),
  };
}

/**
 * Risolve la penalità oraria cognitiva da workoutType.
 *
 * @param {string | null | undefined} workoutType
 * @param {FourCylinderParams} [params]
 * @returns {number}
 */
export function resolveCognitivePenaltyPerHour(workoutType, params = DEFAULT_FOUR_CYLINDER_PARAMS) {
  const table = params?.cognitivePenaltyPerHour || DEFAULT_FOUR_CYLINDER_PARAMS.cognitivePenaltyPerHour;
  const key = String(workoutType || '').trim();
  const raw = Object.prototype.hasOwnProperty.call(table, key)
    ? table[key]
    : table.default;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : Number(table.default) || 0.02;
}

/**
 * Calcola il bump di stress sistemico da input cognitivo (non muta lo state).
 *
 * @param {CognitiveStressInput} cognitiveInput
 * @param {FourCylinderParams} [params]
 * @returns {{ stress: CognitiveStressDelta, stressBump: number }}
 */
export function computeCognitiveStressDeltas(cognitiveInput, params = DEFAULT_FOUR_CYLINDER_PARAMS) {
  const duration = Math.max(0, Number(cognitiveInput?.duration) || 0);
  const penaltyPerHour = resolveCognitivePenaltyPerHour(cognitiveInput?.workoutType, params);
  const maxBump = clamp01(params?.maxCognitiveBump ?? DEFAULT_FOUR_CYLINDER_PARAMS.maxCognitiveBump);
  const stressBump = Math.min(maxBump, duration * penaltyPerHour);

  /** @type {CognitiveStressDelta} */
  const stress = { push: 0, pull: 0, legs: 0, systemic: clamp01(stressBump) };

  return { stress, stressBump: stress.systemic };
}

/**
 * Applica carico cognitivo: alza solo systemic_fatigue. Non tocca decay muscolare.
 *
 * @param {FourCylinderState} state — già catch-uppato fino a oggi
 * @param {CognitiveStressInput} cognitiveInput
 * @returns {{
 *   nextState: FourCylinderState,
 *   stress: CognitiveStressDelta,
 *   stressBump: number,
 *   snapshot: FourCylinderCognitiveLogSnapshot,
 * }}
 */
export function applyCognitiveStress(state, cognitiveInput) {
  const safe = sanitizeFourCylinderState(state);
  const beforeFlat = flattenFourCylinderLevels(safe.decay, safe.systemic_fatigue);

  const { stress, stressBump } = computeCognitiveStressDeltas(cognitiveInput, safe.params);
  const nextSystemic = clamp01(safe.systemic_fatigue + stressBump);
  const nextDecay = clampMuscleDecay(safe.decay);
  const afterFlat = flattenFourCylinderLevels(nextDecay, nextSystemic);
  const capturedAt = Date.now();

  /** @type {FourCylinderCognitiveLogSnapshot} */
  const snapshot = {
    engineVersion: FOUR_CYLINDER_ENGINE_VERSION,
    capturedAt,
    before: beforeFlat,
    stress: flattenStressDelta(stress),
    after: afterFlat,
  };

  return {
    nextState: {
      ...safe,
      updatedAt: capturedAt,
      decay: nextDecay,
      systemic_fatigue: nextSystemic,
    },
    stress,
    stressBump,
    snapshot,
  };
}

/**
 * Pipeline completa pre-save carico cognitivo: catch-up decay → stress sistemico.
 *
 * @param {FourCylinderState} state
 * @param {CognitiveStressInput} cognitiveInput
 * @param {string} todayIso
 * @param {DailyNutritionMap | null} [dailyNutritionMap] scudo proteico in catch-up
 * @returns {{
 *   nextState: FourCylinderState,
 *   decayDaysApplied: number,
 *   stress: CognitiveStressDelta,
 *   stressBump: number,
 *   snapshot: FourCylinderCognitiveLogSnapshot,
 * }}
 */
export function applyCognitiveStressPipeline(state, cognitiveInput, todayIso, dailyNutritionMap = null) {
  const { nextState: afterDecay, daysApplied } = catchUpDecayToDate(
    state,
    todayIso,
    null,
    dailyNutritionMap,
  );
  const {
    nextState,
    stress,
    stressBump,
    snapshot,
  } = applyCognitiveStress(afterDecay, {
    ...cognitiveInput,
    date: cognitiveInput?.date || todayIso,
  });

  return {
    nextState,
    decayDaysApplied: daysApplied,
    stress,
    stressBump,
    snapshot,
  };
}

/**
 * Estrae il blocco `fourCylinder` da un documento `physiology_model` grezzo.
 * @param {unknown} physiologyModelDoc
 * @param {string} [todayIso]
 * @returns {FourCylinderState}
 */
export function fourCylinderFromPhysiologyModel(physiologyModelDoc, todayIso) {
  const doc = physiologyModelDoc && typeof physiologyModelDoc === 'object'
    ? physiologyModelDoc
    : {};
  const block = doc.fourCylinder ?? doc.four_cylinder ?? doc;
  return sanitizeFourCylinderState(block, todayIso);
}

/**
 * Payload sicuro per `set()` su `physiology_model`: coefficienti senza chiavi fourCylinder duplicate,
 * blocco fourCylinder esplicito e extras (es. lastCalibrationWeek).
 * @param {unknown} baseModel
 * @param {FourCylinderState | null | undefined} fourCylinder
 * @param {Record<string, unknown>} [extras]
 * @returns {object}
 */
export function buildPhysiologyModelPayload(baseModel, fourCylinder, extras = {}) {
  const { fourCylinder: _fc, four_cylinder: _legacy, ...coefficients } = baseModel && typeof baseModel === 'object' ? baseModel : {};
  return {
    ...coefficients,
    ...extras,
    fourCylinder: sanitizeFourCylinderState(fourCylinder),
  };
}

/**
 * Merge per scrittura su `physiology_model` (preserva campi legacy sibling).
 * @param {unknown} physiologyModelDoc documento esistente
 * @param {FourCylinderState} fourCylinder
 * @returns {object}
 */
export function physiologyModelWithFourCylinder(physiologyModelDoc, fourCylinder) {
  return buildPhysiologyModelPayload(physiologyModelDoc, fourCylinder);
}

/**
 * Somma decay muscolare (tie-break merge).
 * @param {FourCylinderDecay | null | undefined} decay
 * @returns {number}
 */
function muscleDecaySum(decay) {
  const d = decay && typeof decay === 'object' ? decay : {};
  return clamp01(d.push) + clamp01(d.pull) + clamp01(d.legs);
}

/**
 * Merge anti-race: preferisce il blocco fourCylinder più recente / con stimolo reale.
 * Usato da boot catch-up e hydration tardiva physiology_model.
 *
 * @param {unknown} localRaw stato locale (es. prev.fourCylinder)
 * @param {unknown} incomingRaw stato remoto o catch-up
 * @returns {FourCylinderState | null}
 */
export function mergeFourCylinderStatePreferNewer(localRaw, incomingRaw) {
  const local = localRaw ? sanitizeFourCylinderState(localRaw) : null;
  const incoming = incomingRaw ? sanitizeFourCylinderState(incomingRaw) : null;
  if (!local) return incoming;
  if (!incoming) return local;

  const localTs = Number(local.updatedAt) || 0;
  const incomingTs = Number(incoming.updatedAt) || 0;
  // Default appena inizializzato (updatedAt === 0) non deve battere un salvataggio reale su Firebase.
  if (localTs === 0 && incomingTs > 0) return incoming;
  if (incomingTs === 0 && localTs > 0) return local;

  const localStimulusAt = Number(local.lastStimulus?.at) || 0;
  const incomingStimulusAt = Number(incoming.lastStimulus?.at) || 0;
  if (localStimulusAt > incomingStimulusAt) return local;
  if (incomingStimulusAt > localStimulusAt) return incoming;

  if (localTs > incomingTs) return local;
  if (incomingTs > localTs) return incoming;

  const localSum = muscleDecaySum(local.decay);
  const incomingSum = muscleDecaySum(incoming.decay);
  if (localSum > incomingSum) return local;
  if (incomingSum > localSum) return incoming;

  const localIso = String(local.lastUpdatedIso || local.lastProcessedDate || '');
  const incomingIso = String(incoming.lastUpdatedIso || incoming.lastProcessedDate || '');
  if (localIso > incomingIso) return local;
  if (incomingIso > localIso) return incoming;

  return incoming;
}
