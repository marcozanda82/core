import React, { useEffect, useMemo, useRef, useState } from 'react';
import { decimalToTimeStr } from '../../coreEngine';
import { getTimePositionPercent } from '../../timeLayout';
import {
  parseDurationMinutesInput,
  WORKOUT_DURATION_DEFAULT,
  WORKOUT_DURATION_MIN,
  WORKOUT_DURATION_MAX,
} from '../../utils/durationMinutesInput';
import {
  WORKOUT_ACTIVITY_SELECTOR_IDS,
  generateWorkoutComboSignature,
  getWorkoutActivityTypeDef,
  WORKOUT_MUSCLE_GROUP_DEFS,
  normalizeMuscleGroupArray,
  getWorkoutActivityLogDescription,
} from '../../activityCatalog';

/**
 * @typedef {object} PlannerComboHistoryEntry
 * @property {number} burnKcal
 * @property {number} durationMin
 * @property {number} startTime
 */

export const PLANNER_WORKOUT_SELECTOR_IDS = ['pesi', 'cardio', 'hiit', 'riposo'];

const PLANNER_EXTRA_TAB_LABELS = {
  riposo: '🛌 RIPOSO',
};

/** @typedef {'high' | 'medium' | 'low' | 'rest'} PlannerIntensity */

/**
 * @typedef {object} PlannerActionObject
 * @property {string} name
 * @property {string} workoutType
 * @property {string[]} muscles
 * @property {number} burnKcal
 * @property {number} durationMin
 * @property {string} [startTime]
 * @property {number} [startTimeDec]
 * @property {string} [strengthDetail]
 * @property {PlannerIntensity} intensity
 */

/**
 * @typedef {object} PlannerWorkoutInitialData
 * @property {string} [workoutType]
 * @property {number} [workoutStartTime]
 * @property {string|number} [workoutDurationMin]
 * @property {string[]} [workoutMuscles]
 * @property {string} [workoutStrengthDetail]
 * @property {number} [workoutKcal]
 */

/**
 * @typedef {PlannerWorkoutInitialData & {
 *   planPhase?: string | null,
 *   planIsDeload?: boolean,
 *   planActionName?: string | null,
 * }} WorkoutPlanDraft
 */

/** @typedef {'idle' | 'draft' | 'running'} TrackerPhase */

/**
 * @param {number} totalSec
 * @returns {string}
 */
function formatElapsedMmSs(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Pesi: gruppi muscolari via chip. Altri strength: nota obbligatoria per il salvataggio. */
export function workoutActivityRequiresStrengthDetailNote(typeId) {
  const def = getWorkoutActivityTypeDef(typeId);
  if (typeId === 'pesi') return false;
  if (def?.category === 'strength') return true;
  const raw = String(typeId || '').toLowerCase();
  return raw.includes('strength') || raw.includes('bodybuilding');
}

function parseTimeStrToDecimal(value) {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length === 0) return 12;
  const formatted = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2, 4)}` : digits;
  const [hh, mm] = formatted.includes(':')
    ? formatted.split(':')
    : [formatted.slice(0, 2) || '0', formatted.slice(2) || '0'];
  const h = Math.min(23, Math.max(0, parseInt(hh, 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(mm, 10) || 0));
  return h + m / 60;
}

/**
 * @param {PlannerWorkoutInitialData | null | undefined} initialData
 */
function normalizePlannerInitialData(initialData) {
  const data = initialData && typeof initialData === 'object' ? initialData : {};
  const durationMin = parseDurationMinutesInput(data.workoutDurationMin, {
    min: WORKOUT_DURATION_MIN,
    max: WORKOUT_DURATION_MAX,
    fallback: WORKOUT_DURATION_DEFAULT,
  });
  const startTime = Number.isFinite(Number(data.workoutStartTime))
    ? Number(data.workoutStartTime)
    : 18;
  const workoutType = data.workoutType || 'pesi';
  const isRest = workoutType === 'riposo';

  return {
    workoutType,
    workoutStartTime: isRest ? 0 : startTime,
    workoutDurationMin: isRest ? '0' : String(durationMin),
    workoutMuscles: isRest ? [] : normalizeMuscleGroupArray(data.workoutMuscles),
    workoutStrengthDetail: isRest ? '' : String(data.workoutStrengthDetail || ''),
    workoutKcal: isRest
      ? 0
      : Number.isFinite(Number(data.workoutKcal))
        ? Number(data.workoutKcal)
        : 250,
  };
}

/**
 * @param {string} workoutType
 * @param {string[]} [muscles]
 * @param {number} [burnKcal]
 * @returns {PlannerIntensity}
 */
export function derivePlannerIntensity(workoutType, muscles = [], burnKcal = 0) {
  if (workoutType === 'riposo') return 'rest';
  const burn = Number(burnKcal) || 0;
  if (burn <= 0) return 'rest';
  if (workoutType === 'cardio') return 'low';
  if (workoutType === 'hiit') return 'medium';
  if (workoutType === 'pesi') {
    const m = normalizeMuscleGroupArray(muscles);
    const highGroups = new Set(['Gambe', 'Dorso']);
    if (m.some((g) => highGroups.has(g))) return 'high';
    return 'medium';
  }
  return 'low';
}

/**
 * @param {{
 *   workoutType: string,
 *   muscles: string[],
 *   burnKcal: number,
 *   durationMin: number,
 *   startTimeDec?: number,
 *   strengthDetail?: string,
 * }} params
 * @returns {PlannerActionObject}
 */
export function buildPlannerActionObject({
  workoutType,
  muscles,
  burnKcal,
  durationMin,
  startTimeDec,
  strengthDetail,
}) {
  const musclesCanon = normalizeMuscleGroupArray(muscles);
  const baseDesc = getWorkoutActivityLogDescription(workoutType, musclesCanon);
  const strengthTrim = String(strengthDetail || '').trim();
  const name =
    strengthTrim && workoutActivityRequiresStrengthDetailNote(workoutType)
      ? `${baseDesc} — ${strengthTrim}`
      : baseDesc;
  const isRest = workoutType === 'riposo';
  const burn = isRest ? 0 : Math.round(Number(burnKcal) || 0);

  return {
    name: isRest ? 'Riposo' : name,
    workoutType,
    muscles: isRest ? [] : musclesCanon,
    burnKcal: burn,
    durationMin: isRest ? 0 : Math.round(Number(durationMin) || WORKOUT_DURATION_DEFAULT),
    startTime: isRest
      ? undefined
      : Number.isFinite(startTimeDec)
        ? decimalToTimeStr(startTimeDec)
        : undefined,
    startTimeDec: isRest ? undefined : Number.isFinite(startTimeDec) ? startTimeDec : undefined,
    strengthDetail: strengthTrim || undefined,
    intensity: derivePlannerIntensity(workoutType, musclesCanon, burn),
  };
}

/**
 * @param {PlannerWorkoutInitialData | null | undefined} initialData
 * @param {Record<string, PlannerComboHistoryEntry>} [comboHistory]
 */
function usePlannerWorkoutState(initialData, comboHistory = {}) {
  const normalized = useMemo(() => normalizePlannerInitialData(initialData), [initialData]);
  const [workoutType, setWorkoutType] = useState(normalized.workoutType);
  const [workoutStartTime, setWorkoutStartTime] = useState(normalized.workoutStartTime);
  const [workoutEndTime, setWorkoutEndTime] = useState(
    normalized.workoutStartTime + parseDurationMinutesInput(normalized.workoutDurationMin, {
      min: WORKOUT_DURATION_MIN,
      max: WORKOUT_DURATION_MAX,
      fallback: WORKOUT_DURATION_DEFAULT,
    }) / 60
  );
  const [workoutDurationMin, setWorkoutDurationMin] = useState(normalized.workoutDurationMin);
  const [workoutMuscles, setWorkoutMuscles] = useState(normalized.workoutMuscles);
  const [workoutStrengthDetail, setWorkoutStrengthDetail] = useState(normalized.workoutStrengthDetail);
  const [workoutKcal, setWorkoutKcal] = useState(normalized.workoutKcal);

  useEffect(() => {
    const next = normalizePlannerInitialData(initialData);
    setWorkoutType(next.workoutType);
    setWorkoutStartTime(next.workoutStartTime);
    setWorkoutDurationMin(next.workoutDurationMin);
    setWorkoutMuscles(next.workoutMuscles);
    setWorkoutStrengthDetail(next.workoutStrengthDetail);
    setWorkoutKcal(next.workoutKcal);
    const durationHours =
      parseDurationMinutesInput(next.workoutDurationMin, {
        min: WORKOUT_DURATION_MIN,
        max: WORKOUT_DURATION_MAX,
        fallback: WORKOUT_DURATION_DEFAULT,
      }) / 60;
    setWorkoutEndTime(next.workoutStartTime + durationHours);
  }, [initialData]);

  const skipComboHistoryEffect = useRef(true);
  const comboHistoryRef = useRef(comboHistory);
  const lastAppliedComboSignature = useRef(/** @type {string | null} */ (null));
  comboHistoryRef.current = comboHistory;

  const comboSignature = useMemo(
    () => generateWorkoutComboSignature(workoutType, workoutMuscles),
    [workoutType, workoutMuscles]
  );

  useEffect(() => {
    skipComboHistoryEffect.current = true;
    lastAppliedComboSignature.current = null;
  }, [initialData]);

  useEffect(() => {
    if (skipComboHistoryEffect.current) {
      skipComboHistoryEffect.current = false;
      lastAppliedComboSignature.current = comboSignature;
      return;
    }
    if (lastAppliedComboSignature.current === comboSignature) return;

    lastAppliedComboSignature.current = comboSignature;
    const historical = comboHistoryRef.current[comboSignature];
    const burnKcal = Number.isFinite(historical?.burnKcal) ? historical.burnKcal : 250;
    const durationMin = parseDurationMinutesInput(
      historical?.durationMin ?? WORKOUT_DURATION_DEFAULT,
      {
        min: WORKOUT_DURATION_MIN,
        max: WORKOUT_DURATION_MAX,
        fallback: WORKOUT_DURATION_DEFAULT,
      }
    );
    const startTime = Number.isFinite(historical?.startTime) ? historical.startTime : 18;

    setWorkoutKcal(burnKcal);
    setWorkoutDurationMin(String(durationMin));
    setWorkoutStartTime(startTime);
    setWorkoutEndTime(startTime + durationMin / 60);
  }, [comboSignature]);

  useEffect(() => {
    if (workoutType !== 'riposo') return;
    setWorkoutMuscles([]);
    setWorkoutKcal(0);
    setWorkoutDurationMin('0');
    setWorkoutStrengthDetail('');
    setWorkoutStartTime(0);
    setWorkoutEndTime(0);
  }, [workoutType]);

  const workoutDurationHours = useMemo(
    () =>
      parseDurationMinutesInput(workoutDurationMin, {
        min: WORKOUT_DURATION_MIN,
        max: WORKOUT_DURATION_MAX,
        fallback: WORKOUT_DURATION_DEFAULT,
      }) / 60,
    [workoutDurationMin]
  );

  return {
    workoutType,
    setWorkoutType,
    workoutStartTime,
    setWorkoutStartTime,
    workoutEndTime,
    setWorkoutEndTime,
    workoutDurationMin,
    setWorkoutDurationMin,
    workoutDurationHours,
    workoutMuscles,
    setWorkoutMuscles,
    workoutStrengthDetail,
    setWorkoutStrengthDetail,
    workoutKcal,
    setWorkoutKcal,
  };
}

export default function WorkoutView({
  isPlannerMode = false,
  initialData = null,
  comboHistory = {},
  onSaveAction,
  onClose,
  onBack,
  draftFromPlan = false,
  planDraft = null,
  onStartWorkoutSession,
  onDraftConsumed,
  workoutType: workoutTypeProp,
  setWorkoutType: setWorkoutTypeProp,
  workoutStartTime: workoutStartTimeProp,
  workoutEndTime: workoutEndTimeProp,
  setWorkoutEndTime: setWorkoutEndTimeProp,
  workoutDurationMin: workoutDurationMinProp,
  setWorkoutDurationMin: setWorkoutDurationMinProp,
  workoutDurationHours: workoutDurationHoursProp,
  miniTimelineActivityRef: miniTimelineActivityRefProp,
  handleMiniTimelineDrag: handleMiniTimelineDragProp,
  allNodes = [],
  getTimePositionPercent: getTimePositionPercentProp,
  decimalToTimeStr: decimalToTimeStrProp,
  parseTimeStrToDecimal: parseTimeStrToDecimalProp,
  workoutMuscles: workoutMusclesProp,
  setWorkoutMuscles: setWorkoutMusclesProp,
  editingWorkoutId = null,
  workoutStrengthDetail: workoutStrengthDetailProp,
  setWorkoutStrengthDetail: setWorkoutStrengthDetailProp,
  workoutKcal: workoutKcalProp,
  setWorkoutKcal: setWorkoutKcalProp,
  handleSaveWorkout,
  workoutsLog = [],
  removeLogItem,
}) {
  const internalPlannerRef = useRef(null);
  const planner = usePlannerWorkoutState(isPlannerMode ? initialData : null, comboHistory);

  const workoutType = isPlannerMode ? planner.workoutType : workoutTypeProp;
  const setWorkoutType = isPlannerMode ? planner.setWorkoutType : setWorkoutTypeProp;
  const workoutStartTime = isPlannerMode ? planner.workoutStartTime : workoutStartTimeProp;
  const setWorkoutStartTime = isPlannerMode ? planner.setWorkoutStartTime : null;
  const workoutEndTime = isPlannerMode ? planner.workoutEndTime : workoutEndTimeProp;
  const setWorkoutEndTime = isPlannerMode ? planner.setWorkoutEndTime : setWorkoutEndTimeProp;
  const workoutDurationMin = isPlannerMode ? planner.workoutDurationMin : workoutDurationMinProp;
  const setWorkoutDurationMin = isPlannerMode ? planner.setWorkoutDurationMin : setWorkoutDurationMinProp;
  const workoutDurationHours = isPlannerMode ? planner.workoutDurationHours : workoutDurationHoursProp;
  const workoutMuscles = isPlannerMode ? planner.workoutMuscles : workoutMusclesProp;
  const setWorkoutMuscles = isPlannerMode ? planner.setWorkoutMuscles : setWorkoutMusclesProp;
  const workoutStrengthDetail = isPlannerMode ? planner.workoutStrengthDetail : workoutStrengthDetailProp;
  const setWorkoutStrengthDetail = isPlannerMode
    ? planner.setWorkoutStrengthDetail
    : setWorkoutStrengthDetailProp;
  const workoutKcal = isPlannerMode ? planner.workoutKcal : workoutKcalProp;
  const setWorkoutKcal = isPlannerMode ? planner.setWorkoutKcal : setWorkoutKcalProp;

  const miniTimelineActivityRef = isPlannerMode
    ? internalPlannerRef
    : miniTimelineActivityRefProp;
  const handleMiniTimelineDrag = isPlannerMode ? () => {} : handleMiniTimelineDragProp;
  const toTimeStr = decimalToTimeStrProp || decimalToTimeStr;
  const toTimeDec = parseTimeStrToDecimalProp || parseTimeStrToDecimal;
  const timePosition = getTimePositionPercentProp || getTimePositionPercent;
  const handleBack = isPlannerMode ? onClose : onBack;

  const selectorIds = isPlannerMode ? PLANNER_WORKOUT_SELECTOR_IDS : WORKOUT_ACTIVITY_SELECTOR_IDS;
  const isRestDay = workoutType === 'riposo';
  const isPlanDraftMode = !isPlannerMode && draftFromPlan;

  const [trackerPhase, setTrackerPhase] = useState(
    /** @type {TrackerPhase} */ (isPlanDraftMode ? 'draft' : 'idle')
  );
  const [sessionStartedAt, setSessionStartedAt] = useState(/** @type {number | null} */ (null));
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (isPlanDraftMode) {
      setTrackerPhase('draft');
      setSessionStartedAt(null);
      setElapsedSec(0);
      return;
    }
    setTrackerPhase('idle');
    setSessionStartedAt(null);
    setElapsedSec(0);
  }, [isPlanDraftMode, planDraft]);

  useEffect(() => {
    if (trackerPhase !== 'running' || sessionStartedAt == null) return undefined;
    const tick = () => setElapsedSec(Math.floor((Date.now() - sessionStartedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [trackerPhase, sessionStartedAt]);

  const handleStartSession = () => {
    if (typeof onStartWorkoutSession === 'function') onStartWorkoutSession();
    setSessionStartedAt(Date.now());
    setElapsedSec(0);
    setTrackerPhase('running');
  };

  const handleSaveClick = () => {
    if (
      workoutActivityRequiresStrengthDetailNote(workoutType) &&
      !String(workoutStrengthDetail).trim()
    ) {
      window.alert('Compila «Dettaglio workout» per salvare questo tipo di attività.');
      return;
    }

    const normalizedDurationMin = isRestDay
      ? 0
      : parseDurationMinutesInput(workoutDurationMin, {
          min: WORKOUT_DURATION_MIN,
          max: WORKOUT_DURATION_MAX,
          fallback: WORKOUT_DURATION_DEFAULT,
        });

    if (isPlannerMode) {
      const action = buildPlannerActionObject({
        workoutType,
        muscles: isRestDay ? [] : workoutMuscles,
        burnKcal: isRestDay ? 0 : workoutKcal,
        durationMin: normalizedDurationMin,
        startTimeDec: isRestDay ? undefined : workoutStartTime,
        strengthDetail: workoutStrengthDetail,
      });
      if (typeof onSaveAction === 'function') onSaveAction(action);
      return;
    }

    if (typeof handleSaveWorkout === 'function') {
      handleSaveWorkout();
      if (isPlanDraftMode && typeof onDraftConsumed === 'function') onDraftConsumed();
    }
  };

  const planDraftLabel = (() => {
    if (!planDraft || typeof planDraft !== 'object') return null;
    if (planDraft.planActionName) return String(planDraft.planActionName);
    if (planDraft.planPhase) return `Fase ${planDraft.planPhase}`;
    return 'Piano di oggi';
  })();

  const primaryButtonStyle = {
    width: '100%',
    padding: '18px',
    backgroundColor: '#ff6d00',
    color: '#000',
    border: 'none',
    borderRadius: '15px',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    letterSpacing: '2px',
    cursor: 'pointer',
    transition: '0.2s',
    boxShadow: '0 0 20px rgba(255, 109, 0, 0.4)',
  };

  const secondaryButtonStyle = {
    ...primaryButtonStyle,
    backgroundColor: 'transparent',
    color: '#ff6d00',
    border: '1px solid rgba(255, 109, 0, 0.55)',
    boxShadow: 'none',
  };

  return (
    <div className="view-animate">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <button
          type="button"
          onClick={handleBack}
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            fontSize: '0.8rem',
            cursor: 'pointer',
            letterSpacing: '1px',
          }}
        >
          &lt; INDIETRO
        </button>
        <h2 style={{ fontSize: '0.8rem', color: '#ff6d00', letterSpacing: '2px', margin: 0 }}>
          {isPlannerMode
            ? '⚡ PIANIFICA AZIONE'
            : isPlanDraftMode && trackerPhase === 'draft'
              ? '⚡ BOZZA DAL PIANO'
              : isPlanDraftMode && trackerPhase === 'running'
                ? '⚡ SESSIONE ATTIVA'
                : '⚡ ATTIVITÀ'}
        </h2>
        <div style={{ width: '70px' }} />
      </div>
      {isPlanDraftMode && trackerPhase === 'draft' ? (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 12px',
            borderRadius: '12px',
            border: planDraft?.planIsDeload
              ? '1px solid rgba(251, 191, 36, 0.35)'
              : '1px solid rgba(34, 211, 238, 0.28)',
            background: planDraft?.planIsDeload
              ? 'rgba(251, 191, 36, 0.1)'
              : 'rgba(34, 211, 238, 0.08)',
            fontSize: '0.75rem',
            color: planDraft?.planIsDeload ? '#fbbf24' : '#67e8f9',
            letterSpacing: '0.5px',
          }}
        >
          Bozza precompilata · {planDraftLabel}
          {planDraft?.planIsDeload ? ' · Scarico' : ''}
        </div>
      ) : null}
      {isPlanDraftMode && trackerPhase === 'running' ? (
        <div
          style={{
            marginBottom: '18px',
            padding: '14px 12px',
            borderRadius: '14px',
            border: '1px solid rgba(255, 109, 0, 0.45)',
            background: 'rgba(255, 109, 0, 0.08)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '2px', marginBottom: '6px' }}>
            TIMER SESSIONE
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ff6d00', fontVariantNumeric: 'tabular-nums' }}>
            {formatElapsedMmSs(elapsedSec)}
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '30px', flexWrap: 'wrap' }}>
        {selectorIds.map((typeId) => {
          const ad = getWorkoutActivityTypeDef(typeId);
          return (
            <button
              key={typeId}
              type="button"
              className={`type-btn ${workoutType === typeId ? 'active orange' : ''}`}
              onClick={() => setWorkoutType(typeId)}
            >
              {ad?.selectorButtonLabel ?? PLANNER_EXTRA_TAB_LABELS[typeId] ?? typeId}
            </button>
          );
        })}
      </div>
      {!isRestDay ? (
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '14px', marginBottom: '10px' }}>
          <div style={{ flex: '1 1 140px' }}>
            <div
              style={{
                fontSize: '0.65rem',
                color: '#888',
                letterSpacing: '1px',
                marginBottom: '6px',
                textTransform: 'uppercase',
              }}
            >
              {isPlannerMode ? 'Ora di inizio (opzionale)' : 'Ora di inizio'}
            </div>
            <input
              type="time"
              value={toTimeStr(workoutStartTime)}
              onChange={(e) => {
                const startTime = Math.min(24, Math.max(0, toTimeDec(e.target.value)));
                if (setWorkoutStartTime) setWorkoutStartTime(startTime);
                const durationHours =
                  parseDurationMinutesInput(workoutDurationMin, {
                    min: WORKOUT_DURATION_MIN,
                    max: WORKOUT_DURATION_MAX,
                    fallback: WORKOUT_DURATION_DEFAULT,
                  }) / 60;
                let computedEndTime = startTime + durationHours;
                while (computedEndTime >= 24) computedEndTime -= 24;
                while (computedEndTime < 0) computedEndTime += 24;
                setWorkoutEndTime(computedEndTime);
              }}
              style={{
                width: '100%',
                maxWidth: '160px',
                padding: '8px 10px',
                background: '#1a1a1a',
                border: '1px solid #ff6d00',
                borderRadius: '8px',
                color: '#ff6d00',
                fontSize: '1.05rem',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            />
          </div>
          <div style={{ flex: '0 0 120px' }}>
            <div
              style={{
                fontSize: '0.65rem',
                color: '#888',
                letterSpacing: '1px',
                marginBottom: '6px',
                textTransform: 'uppercase',
              }}
            >
              Durata (min)
            </div>
            <input
              type="number"
              min={15}
              max={600}
              step={5}
              value={workoutDurationMin}
              onChange={(e) => setWorkoutDurationMin(e.target.value)}
              onBlur={() => {
                const parsed = parseDurationMinutesInput(workoutDurationMin, {
                  min: WORKOUT_DURATION_MIN,
                  max: WORKOUT_DURATION_MAX,
                  fallback: WORKOUT_DURATION_DEFAULT,
                });
                setWorkoutDurationMin(String(parsed));
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: '#1a1a1a',
                border: '1px solid #ff6d00',
                borderRadius: '8px',
                color: '#ff6d00',
                fontSize: '1.05rem',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            />
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#666',
            fontSize: '0.65rem',
            marginBottom: '8px',
          }}
        >
          <span>0:00</span>
          <span>Inizio calcolato: {toTimeStr(workoutStartTime)}</span>
          <span>24:00</span>
        </div>
        <div
          ref={miniTimelineActivityRef}
          style={{
            position: 'relative',
            height: '36px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            border: '1px solid #333',
            touchAction: 'pan-x',
          }}
        >
          {allNodes.filter((n) => n.id !== editingWorkoutId).map((n) => {
            const isWork = n.type === 'work';
            const isCognitive = n.type === 'cognitive';
            const startP = timePosition(n.time);
            const durP = isWork || isCognitive ? timePosition(n.duration || 1) : 0;
            const isPesi = n.type === 'workout' && n.subType === 'pesi' && n.muscles?.length > 0;
            const iconContent = isPesi
              ? n.muscles.map((m) => m.substring(0, 2).toUpperCase()).join('+')
              : n.icon || '•';
            if (isWork) {
              return (
                <div
                  key={n.id}
                  style={{
                    position: 'absolute',
                    left: `${startP}%`,
                    width: `${durP}%`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: '20px',
                    background: 'rgba(255, 234, 0, 0.2)',
                    borderLeft: '2px solid #ffea00',
                    borderRight: '2px solid #ffea00',
                    borderRadius: '4px',
                    filter: 'grayscale(1)',
                    opacity: 0.3,
                    pointerEvents: 'none',
                  }}
                />
              );
            }
            if (isCognitive) {
              return (
                <div
                  key={n.id}
                  style={{
                    position: 'absolute',
                    left: `${startP}%`,
                    width: `${durP}%`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: '20px',
                    background: 'rgba(0, 229, 255, 0.2)',
                    borderLeft: '2px solid #00e5ff',
                    borderRight: '2px solid #00e5ff',
                    borderRadius: '4px',
                    filter: 'grayscale(1)',
                    opacity: 0.3,
                    pointerEvents: 'none',
                  }}
                />
              );
            }
            return (
              <div
                key={n.id}
                style={{
                  position: 'absolute',
                  left: `${startP}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)',
                  border: '2px solid #666',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  filter: 'grayscale(1)',
                  opacity: 0.3,
                  pointerEvents: 'none',
                  fontSize: '0.5rem',
                }}
              >
                <span style={{ lineHeight: 1 }}>{iconContent}</span>
              </div>
            );
          })}
          <div
            className="mini-timeline-bar-wrap"
            onPointerDown={(e) =>
              handleMiniTimelineDrag(
                e,
                miniTimelineActivityRef,
                'bar-all',
                workoutStartTime,
                workoutEndTime,
                () => {},
                setWorkoutEndTime,
                { fixedDurationHours: workoutDurationHours }
              )
            }
            style={{
              position: 'absolute',
              left: `${timePosition(workoutStartTime)}%`,
              width: `${timePosition(workoutDurationHours)}%`,
              top: '50%',
              transform: 'translateY(-50%)',
              height: '24px',
              background: 'rgba(255, 109, 0, 0.4)',
              border: '1px solid #ff6d00',
              borderRadius: '4px',
              cursor: 'grab',
              zIndex: 10,
              touchAction: 'none',
            }}
          >
            <div
              className="mini-timeline-hitbox"
              role="slider"
              aria-label="Fine attività"
              onPointerDown={(e) => {
                e.stopPropagation();
                handleMiniTimelineDrag(
                  e,
                  miniTimelineActivityRef,
                  'bar-end',
                  workoutStartTime,
                  workoutEndTime,
                  () => {},
                  setWorkoutEndTime,
                  { fixedDurationHours: workoutDurationHours }
                );
              }}
              style={{
                position: 'absolute',
                right: '-22px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '44px',
                height: '44px',
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 11,
              }}
            >
              <div
                style={{
                  width: '12px',
                  height: '24px',
                  background: '#ff6d00',
                  borderRadius: '4px',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>
        </div>
      </div>
      ) : null}
      {workoutType === 'pesi' &&
        (() => {
          const pesiMuscleSet = new Set(normalizeMuscleGroupArray(workoutMuscles));
          return (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '8px' }}>
                Gruppi muscolari
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                  gap: '8px',
                }}
              >
                {WORKOUT_MUSCLE_GROUP_DEFS.map(({ id: mId, label: mLabel }) => {
                  const isActive = pesiMuscleSet.has(mId);
                  return (
                    <button
                      key={mId}
                      type="button"
                      onClick={() => {
                        setWorkoutMuscles((prev) => {
                          const p = normalizeMuscleGroupArray(prev);
                          if (p.includes(mId)) return p.filter((x) => x !== mId);
                          return [...p, mId];
                        });
                      }}
                      style={{
                        padding: '10px 12px',
                        fontSize: '0.75rem',
                        borderRadius: '20px',
                        border: `1px solid ${isActive ? '#ff6d00' : '#444'}`,
                        background: isActive ? '#ff6d00' : '#222',
                        color: isActive ? '#000' : '#aaa',
                        fontWeight: isActive ? 'bold' : 'normal',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      {mLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
      {workoutActivityRequiresStrengthDetailNote(workoutType) && (
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '8px' }}>
            Dettaglio workout <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <textarea
            value={workoutStrengthDetail}
            onChange={(e) => setWorkoutStrengthDetail(e.target.value)}
            rows={3}
            placeholder="Es. Push day — petto + tricipiti, esercizi e volumi…"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              background: '#1a1a1a',
              border: `1px solid ${String(workoutStrengthDetail).trim() ? '#444' : 'rgba(239,68,68,0.55)'}`,
              borderRadius: '10px',
              color: '#e8e8e8',
              fontSize: '0.85rem',
              resize: 'vertical',
              minHeight: '72px',
            }}
          />
        </div>
      )}
      <div className="burn-slider-container">
        <span className="burn-label" style={{ color: '#ff6d00' }}>
          OUTPUT ENERGETICO STIMATO
        </span>
        <div className="burn-value workout">{isRestDay ? 0 : Math.min(750, workoutKcal)}</div>
        <input
          type="range"
          min={isPlannerMode ? 0 : 50}
          max="750"
          step="10"
          value={isRestDay ? 0 : Math.min(750, Math.max(isPlannerMode ? 0 : 50, workoutKcal))}
          onChange={(e) => setWorkoutKcal(Math.min(750, Number(e.target.value)))}
          disabled={isRestDay}
          className="custom-range orange"
          style={{ marginTop: '20px', opacity: isRestDay ? 0.45 : 1 }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.65rem',
            color: '#666',
            marginTop: '6px',
          }}
        >
          <span>{isPlannerMode ? 0 : 50}</span>
          <span>375</span>
          <span>750</span>
        </div>
      </div>
      {isPlanDraftMode && trackerPhase === 'draft' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button type="button" onClick={handleStartSession} style={primaryButtonStyle}>
            AVVIA ALLENAMENTO
          </button>
          <button type="button" onClick={handleSaveClick} style={secondaryButtonStyle}>
            REGISTRA COMPLETATO
          </button>
        </div>
      ) : isPlanDraftMode && trackerPhase === 'running' ? (
        <button type="button" onClick={handleSaveClick} style={primaryButtonStyle}>
          TERMINA E REGISTRA
        </button>
      ) : (
        <button type="button" onClick={handleSaveClick} style={primaryButtonStyle}>
          {isPlannerMode ? 'APPLICA AZIONE' : 'SALVA ATTIVITÀ'}
        </button>
      )}
      {!isPlannerMode && (
        <div style={{ marginTop: '30px' }}>
          {workoutsLog.length > 0 && (
            <h4
              style={{
                fontSize: '0.65rem',
                color: '#666',
                letterSpacing: '2px',
                marginBottom: '10px',
              }}
            >
              OUTPUT REGISTRATI OGGI
            </h4>
          )}
          {workoutsLog.map((wk) => (
            <div key={wk.id} className="food-pill" style={{ borderLeft: '3px solid #ff6d00' }}>
              <div>
                <span className="food-pill-name">{wk.desc || wk.name}</span>
                <span className="food-pill-weight" style={{ color: '#ff6d00' }}>
                  {Math.round(wk.kcal)} kcal
                </span>
              </div>
              <div className="food-pill-actions">
                <button type="button" className="food-pill-btn btn-delete" onClick={() => removeLogItem(wk.id)}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
