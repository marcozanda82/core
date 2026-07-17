/**
 * L1 — Matematica pura del bilancio energetico giornaliero.
 * Nessuna dipendenza da Firebase, React o UI.
 *
 * Formula canonica: kcalBalance = intakeKcal − targetKcal
 */

import { computeTotali } from '../../useBiochimico';

/** kcal allenamento / divisore → trainingLoad 0–100 (≈600 kcal → 100). Allineato a metabolicCompassDailyHistory. */
export const WORKOUT_KCAL_PER_TRAINING_LOAD_UNIT = 6;

const DEFAULT_TARGET_KCAL = 2000;

/**
 * Snapshot energetico canonico per un singolo giorno.
 *
 * @typedef {object} DayEnergySnapshot
 * @property {string} [date] — ISO `YYYY-MM-DD` (opzionale; utile nelle serie)
 * @property {number} intakeKcal — calorie ingerite (solo `food` + `recipe` dal log)
 * @property {number} workoutBurnKcal — dispendio stimato da voci `workout` nel log
 * @property {number} targetKcal — target energetico risolto per il giorno (da L2)
 * @property {number} kcalBalance — intakeKcal − targetKcal
 * @property {number} trainingLoad — indice 0–100 derivato dal burn workout
 * @property {boolean} hasLogData — `true` se il log conteneva almeno una voce
 * @property {boolean} isIntentionalFast — digiuno 24h esplicito (conta come giorno tracciato a 0 kcal)
 * @property {boolean} hasTrackableData — pasti/log oppure digiuno intenzionale (i Null restano fuori dalle medie)
 */

/**
 * @typedef {object} EnergyBalanceAggregate
 * @property {number} sumBalance — Σ kcalBalance (solo giorni tracciati)
 * @property {number} sumTarget — Σ targetKcal
 * @property {number} sumIntake — Σ intakeKcal
 * @property {number} sumWorkoutBurn — Σ workoutBurnKcal
 * @property {number} meanBalance — media kcalBalance sui giorni tracciati
 * @property {number} meanTarget — media targetKcal
 * @property {number} meanIntake — media intakeKcal
 * @property {number} dayCount — giorni tracciati usati come divisore
 * @property {number} daysWithData — alias di dayCount (giorni con hasTrackableData)
 */

/**
 * Indice carico allenamento 0–100 da kcal bruciate in sessione.
 * @param {number} workoutBurnKcal
 * @returns {number}
 */
export function computeTrainingLoadIndex(workoutBurnKcal) {
  const wk = Number(workoutBurnKcal);
  if (!Number.isFinite(wk) || wk <= 0) return 0;
  return Math.min(100, Math.round(wk / WORKOUT_KCAL_PER_TRAINING_LOAD_UNIT));
}

/**
 * Normalizza un target kcal in ingresso.
 * @param {unknown} targetKcal
 * @returns {number}
 */
export function normalizeTargetKcal(targetKcal) {
  const n = Number(targetKcal);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TARGET_KCAL;
  return Math.round(n);
}

/**
 * Costruisce lo snapshot energetico di un giorno dal log e dal target risolto.
 *
 * Regole:
 * - `intakeKcal` e `workoutBurnKcal` derivano da `computeTotali(log)` (stessa semantica della Bussola).
 * - `kcalBalance` è **sempre** `intakeKcal − targetKcal`, senza eccezioni.
 * - Giorno senza log: intake e workout a 0; il bilancio riflette comunque il target (es. −targetKcal).
 *   Le policy speciali (es. bussola che forza balance 0 su giorni vuoti) restano nei wrapper L3.
 *
 * @param {object} params
 * @param {Array<Record<string, unknown>> | null | undefined} params.log — voci tracker giornaliero
 * @param {number} params.targetKcal — target già risolto (es. da `resolveDayKcalTarget`)
 * @param {string} [params.date] — ISO opzionale da allegare allo snapshot
 * @returns {DayEnergySnapshot}
 */
export function computeDayEnergySnapshot({ log, targetKcal, date, isIntentionalFast = false }) {
  const entries = Array.isArray(log) ? log : [];
  const hasLogData = entries.length > 0;
  const intentional = isIntentionalFast === true;
  // Tracciato = pasti/log OPPURE digiuno intenzionale (0 kcal). I Null restano fuori dalle medie.
  const hasTrackableData = hasLogData || intentional;

  const totals = hasLogData ? computeTotali(entries) : { kcal: 0, workout: 0 };
  const intakeKcal = Math.max(0, Math.round(Number(totals.kcal) || 0));
  const workoutBurnKcal = Math.max(0, Math.round(Number(totals.workout) || 0));
  const resolvedTarget = normalizeTargetKcal(targetKcal);
  const kcalBalance = intentional && !hasLogData ? 0 - resolvedTarget : intakeKcal - resolvedTarget;
  const trainingLoad = computeTrainingLoadIndex(workoutBurnKcal);

  /** @type {DayEnergySnapshot} */
  const snapshot = {
    intakeKcal,
    workoutBurnKcal,
    targetKcal: resolvedTarget,
    kcalBalance,
    trainingLoad,
    hasLogData,
    isIntentionalFast: intentional,
    hasTrackableData,
  };

  if (date != null && String(date).trim() !== '') {
    snapshot.date = String(date).trim();
  }

  return snapshot;
}

/**
 * Aggrega una serie di snapshot (es. settimana o finestra bussola).
 *
 * @param {Array<DayEnergySnapshot | null | undefined>} snapshots
 * @returns {EnergyBalanceAggregate}
 */
export function aggregateEnergyBalance(snapshots) {
  const list = Array.isArray(snapshots) ? snapshots.filter((s) => s && typeof s === 'object') : [];

  if (list.length === 0) {
    return {
      sumBalance: 0,
      sumTarget: 0,
      sumIntake: 0,
      sumWorkoutBurn: 0,
      meanBalance: 0,
      meanTarget: 0,
      meanIntake: 0,
      dayCount: 0,
      daysWithData: 0,
    };
  }

  let sumBalance = 0;
  let sumTarget = 0;
  let sumIntake = 0;
  let sumWorkoutBurn = 0;
  let daysWithData = 0;

  for (const s of list) {
    const trackable =
      s.hasTrackableData === true
      || (s.hasTrackableData !== false && (s.hasLogData || s.isIntentionalFast));
    if (!trackable) continue;
    sumBalance += Number(s.kcalBalance) || 0;
    sumTarget += Number(s.targetKcal) || 0;
    sumIntake += Number(s.intakeKcal) || 0;
    sumWorkoutBurn += Number(s.workoutBurnKcal) || 0;
    daysWithData += 1;
  }

  // Divisore = solo giorni tracciati (pasti o digiuno intenzionale), mai i Null.
  const dayCount = daysWithData;

  return {
    sumBalance: Math.round(sumBalance),
    sumTarget: Math.round(sumTarget),
    sumIntake: Math.round(sumIntake),
    sumWorkoutBurn: Math.round(sumWorkoutBurn),
    meanBalance: dayCount > 0 ? Math.round(sumBalance / dayCount) : 0,
    meanTarget: dayCount > 0 ? Math.round(sumTarget / dayCount) : 0,
    meanIntake: dayCount > 0 ? Math.round(sumIntake / dayCount) : 0,
    dayCount,
    daysWithData,
  };
}
