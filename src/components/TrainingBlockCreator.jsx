import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  TRAINING_BLOCK_MACRO_GOALS,
  addCalendarDaysIso,
  buildTrainingBlockCalendarWeeks,
  computeMesocycleWeek,
  formatMesocycleWeekLabel,
  formatScheduledDateLabelIt,
  getLocalTodayIso,
  isTrainingSessionCompleted,
  normalizeIsoDate,
  normalizeLastCompletedDate,
  normalizeMacroGoal,
  normalizeMesocycleWeek,
} from '../features/planning/trainingBlockSchema';
import {
  buildEmergencyWaveNutritionDays,
  formatTrainingBlockEnergyBadge,
  resolveTrainingBlockMacroGoalCalibration,
  TRAINING_BLOCK_FALLBACK_BASE_KCAL,
} from '../features/planning/trainingBlockTargets';
import { generatePeriodizedTargets } from '../features/planning/aiNutritionEngine';
import { normalizeMuscleGroupArray, WORKOUT_MUSCLE_GROUP_DEFS } from '../activityCatalog';
import { decimalToTimeStr } from '../coreEngine';
import WorkoutView from '../drawers/vistas/WorkoutView';

let dayUidCounter = 0;
function nextDayKey() {
  dayUidCounter += 1;
  return `day_${Date.now()}_${dayUidCounter}`;
}

/**
 * @param {object} action
 * @param {{ scheduledDate?: string, mesocycleWeek?: number }} [opts]
 * @returns {object}
 */
export function trainingBlockDayFromPlannerAction(action, opts = {}) {
  const rawType = String(action?.workoutType || 'pesi').trim().toLowerCase();
  const type = rawType === 'riposo' || rawType === 'rest' ? 'rest' : (
    rawType === 'cardio' || rawType === 'hiit' ? rawType : 'pesi'
  );
  const isRest = type === 'rest';
  const plannedTimeRaw = Number(action?.startTimeDec);
  const plannedTime = !isRest && Number.isFinite(plannedTimeRaw) && plannedTimeRaw >= 0 && plannedTimeRaw < 24
    ? plannedTimeRaw
    : null;
  const durationMin = isRest
    ? 0
    : Math.max(0, Math.round(Number(action?.durationMin) || 60));
  const plannedKcalBurn = isRest
    ? 0
    : Math.max(0, Math.round(Number(action?.burnKcal) || 0));
  const muscles = isRest ? [] : normalizeMuscleGroupArray(action?.muscles || []);
  const title = String(
    action?.name
    || (isRest ? 'Riposo' : 'Allenamento'),
  ).trim() || (isRest ? 'Riposo' : 'Allenamento');

  const scheduledDate = normalizeIsoDate(opts.scheduledDate)
    || normalizeIsoDate(action?.scheduledDate)
    || getLocalTodayIso();
  const mesocycleWeek = normalizeMesocycleWeek(opts.mesocycleWeek)
    || normalizeMesocycleWeek(action?.mesocycleWeek)
    || 1;

  return {
    key: nextDayKey(),
    scheduledDate,
    mesocycleWeek,
    type,
    title,
    muscles,
    plannedTime,
    durationMin,
    plannedKcalBurn,
    strengthDetail: String(action?.strengthDetail || '').trim() || null,
    status: 'pending',
    lastCompletedDate: null,
  };
}

/**
 * @param {object | null | undefined} activeBlock
 * @returns {object[]}
 */
function daysFromActiveBlock(activeBlock) {
  const rawDays = Array.isArray(activeBlock?.days) ? activeBlock.days : [];
  const today = getLocalTodayIso();
  const anchor = normalizeIsoDate(activeBlock?.anchorDate) || today;
  return rawDays
    .map((d, i) => {
      const type = String(d?.type || 'pesi').toLowerCase() === 'rest'
        ? 'rest'
        : (d?.type === 'cardio' || d?.type === 'hiit' ? d.type : 'pesi');
      if (type === 'rest') return null;
      const plannedTimeRaw = Number(d?.plannedTime);
      const scheduledDate = normalizeIsoDate(d?.scheduledDate)
        || normalizeIsoDate(d?.date)
        || addCalendarDaysIso(anchor, i)
        || today;
      const mesocycleWeek = normalizeMesocycleWeek(d?.mesocycleWeek ?? d?.weekNumber)
        || computeMesocycleWeek(scheduledDate, anchor);
      return {
        key: `existing_${activeBlock?.blockId || 'block'}_${i}`,
        dayIndex: Number.isFinite(Number(d?.dayIndex)) ? Math.floor(Number(d.dayIndex)) : i,
        scheduledDate,
        mesocycleWeek,
        type,
        title: String(d?.title || 'Allenamento').trim(),
        muscles: normalizeMuscleGroupArray(d?.muscles || []),
        plannedTime: Number.isFinite(plannedTimeRaw) && plannedTimeRaw >= 0 && plannedTimeRaw < 24
          ? plannedTimeRaw
          : null,
        durationMin: Math.max(0, Math.round(Number(d?.durationMin) || 60)),
        plannedKcalBurn: Math.max(0, Math.round(Number(d?.plannedKcalBurn) || 300)),
        strengthDetail: d?.strengthDetail != null ? String(d.strengthDetail).trim() || null : null,
        targetKcal: Number.isFinite(Number(d?.targetKcal)) ? Math.round(Number(d.targetKcal)) : null,
        targetProt: Number.isFinite(Number(d?.targetProt)) ? Math.round(Number(d.targetProt)) : null,
        targetCarb: Number.isFinite(Number(d?.targetCarb)) ? Math.round(Number(d.targetCarb)) : null,
        targetFat: Number.isFinite(Number(d?.targetFat)) ? Math.round(Number(d.targetFat)) : null,
        status: String(d?.status || 'pending').toLowerCase() === 'confirmed'
          ? 'confirmed'
          : (String(d?.status || '').toLowerCase() === 'skipped' ? 'skipped' : 'pending'),
        lastCompletedDate: normalizeLastCompletedDate(d?.lastCompletedDate),
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)));
}

/**
 * @param {object | null | undefined} day
 * @returns {object}
 */
export function plannerInitialDataFromBlockDay(day) {
  if (!day) {
    return {
      workoutType: 'pesi',
      workoutStartTime: 18,
      workoutDurationMin: '60',
      workoutMuscles: [],
      workoutStrengthDetail: '',
      workoutKcal: 300,
    };
  }
  const isRest = String(day.type || '').toLowerCase() === 'rest';
  return {
    workoutType: isRest ? 'riposo' : (day.type || 'pesi'),
    workoutStartTime: Number.isFinite(Number(day.plannedTime)) ? Number(day.plannedTime) : 18,
    workoutDurationMin: String(
      Number.isFinite(Number(day.durationMin)) && Number(day.durationMin) > 0
        ? Math.round(Number(day.durationMin))
        : 60,
    ),
    workoutMuscles: normalizeMuscleGroupArray(day.muscles || []),
    workoutStrengthDetail: String(day.strengthDetail || ''),
    workoutKcal: Number.isFinite(Number(day.plannedKcalBurn))
      ? Number(day.plannedKcalBurn)
      : (isRest ? 0 : 300),
  };
}

function formatDayTime(plannedTime) {
  if (!Number.isFinite(Number(plannedTime))) return '—';
  return decimalToTimeStr(Number(plannedTime));
}

function dayTypeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'rest') return 'Riposo';
  if (t === 'cardio') return 'Cardio';
  if (t === 'hiit') return 'HIIT';
  return 'Pesi';
}

const MUSCLE_ID_TO_LABEL = Object.fromEntries(
  WORKOUT_MUSCLE_GROUP_DEFS.map((d) => [d.id, d.label]),
);

function formatMuscleLabels(muscles) {
  return normalizeMuscleGroupArray(muscles).map(
    (id) => MUSCLE_ID_TO_LABEL[id] || id,
  );
}

const SESSION_ACTION_BTN_CLASS =
  'shrink-0 rounded-lg border border-slate-600/50 px-2 py-1.5 text-sm text-slate-400 transition hover:border-violet-400/45 hover:text-violet-200 hover:shadow-[0_0_10px_rgba(139,92,246,0.22)] disabled:opacity-40';

const SESSION_DELETE_BTN_CLASS =
  'shrink-0 rounded-lg border border-slate-600/50 px-2 py-1.5 text-[11px] text-slate-400 transition hover:border-rose-400/45 hover:text-rose-200 hover:shadow-[0_0_10px_rgba(244,63,94,0.18)]';

/**
 * @param {Array<{ session?: object | null }>} weekDays
 * @returns {{ total: number }}
 */
function computeWeekSessionStats(weekDays) {
  const sessions = (Array.isArray(weekDays) ? weekDays : [])
    .map((slot) => slot?.session)
    .filter(Boolean);
  return { total: sessions.length };
}

/**
 * Drawer: calendario assoluto raggruppato per settimane di mesociclo.
 */
export default function TrainingBlockCreator({
  isOpen,
  onClose,
  onSave,
  busy = false,
  activeBlock = null,
  tdee = null,
  weightKg = null,
  onToggleSessionComplete = null,
  onMoveSession = null,
  onSwapSessions = null,
  onMacroGoalCalibrationChange = null,
  calibrationDeltaKcal = null,
  todayIso: todayIsoProp = null,
}) {
  const todayIso = String(todayIsoProp || getLocalTodayIso()).slice(0, 10);
  const isEditMode = Boolean(
    activeBlock
    && activeBlock.isActive !== false
    && Array.isArray(activeBlock.days)
    && activeBlock.days.length > 0,
  );

  const [name, setName] = useState('Fase Ipertrofia 1');
  const [macroGoal, setMacroGoal] = useState('bulk');
  const [days, setDays] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [isGeneratingTargets, setIsGeneratingTargets] = useState(false);
  /** @type {[string | 'new' | null, Function]} */
  const [editingKey, setEditingKey] = useState(null);
  const [draftScheduledDate, setDraftScheduledDate] = useState(todayIso);
  const [showDatePicker, setShowDatePicker] = useState(false);
  /** @type {[string | null, Function]} */
  const [actionMenuKey, setActionMenuKey] = useState(null);
  /** @type {[object | null, Function]} */
  const [movePickerDay, setMovePickerDay] = useState(null);
  /** @type {[object | null, Function]} */
  const [swapPickerDay, setSwapPickerDay] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    if (
      activeBlock
      && activeBlock.isActive !== false
      && Array.isArray(activeBlock.days)
      && activeBlock.days.length > 0
    ) {
      setName(String(activeBlock.name || 'Blocco allenamento').trim() || 'Blocco allenamento');
      setMacroGoal(normalizeMacroGoal(activeBlock.macroGoal));
      setDays(daysFromActiveBlock(activeBlock));
    } else {
      setName('Fase Ipertrofia 1');
      setMacroGoal('bulk');
      setDays([]);
    }
    setError('');
    setEditingKey(null);
    setShowDatePicker(false);
    setDraftScheduledDate(todayIso);
    setSaving(false);
    setIsGeneratingTargets(false);
    setActionMenuKey(null);
    setMovePickerDay(null);
    setSwapPickerDay(null);
    return undefined;
  }, [isOpen, activeBlock?.blockId, activeBlock?.updatedAt, todayIso]);

  const blockStartIso = useMemo(() => {
    const sorted = days
      .map((d) => d.scheduledDate)
      .filter(Boolean)
      .sort();
    return sorted[0] || todayIso;
  }, [days, todayIso]);

  const calendarWeeks = useMemo(
    () => buildTrainingBlockCalendarWeeks({
      sessions: days,
      todayIso,
      blockStartIso,
    }),
    [days, todayIso, blockStartIso],
  );

  const dayCount = days.length;
  const editingDay = editingKey && editingKey !== 'new'
    ? days.find((d) => d.key === editingKey)
    : null;

  const plannerInitialData = useMemo(
    () => plannerInitialDataFromBlockDay(editingDay),
    [
      editingKey,
      editingDay?.type,
      editingDay?.title,
      editingDay?.plannedTime,
      editingDay?.durationMin,
      editingDay?.plannedKcalBurn,
      editingDay?.strengthDetail,
      Array.isArray(editingDay?.muscles) ? editingDay.muscles.join('|') : '',
    ],
  );

  const canSave = useMemo(() => {
    if (!String(name || '').trim()) return false;
    if (days.length < 1) return false;
    return days.every((d) => (
      String(d.title || '').trim()
      && d.type !== 'rest'
      && Boolean(normalizeIsoDate(d.scheduledDate))
    ));
  }, [name, days]);

  const openRestDatesForMove = useMemo(() => {
    if (!movePickerDay) return [];
    const occupied = new Set(
      days
        .filter((d) => d.key !== movePickerDay.key && d.type !== 'rest')
        .map((d) => d.scheduledDate),
    );
    /** @type {string[]} */
    const open = [];
    for (const group of calendarWeeks) {
      for (const slot of group.days) {
        if (occupied.has(slot.date)) continue;
        if (slot.date === movePickerDay.scheduledDate) continue;
        open.push(slot.date);
      }
    }
    return [...new Set(open)].sort();
  }, [calendarWeeks, days, movePickerDay]);

  const swapCandidates = useMemo(() => {
    if (!swapPickerDay) return [];
    return days.filter(
      (d) => d.key !== swapPickerDay.key && d.type !== 'rest',
    );
  }, [days, swapPickerDay]);

  const macroGoalCalibration = useMemo(
    () => resolveTrainingBlockMacroGoalCalibration(macroGoal),
    [macroGoal],
  );

  const energyTargetBadge = useMemo(
    () => formatTrainingBlockEnergyBadge(macroGoal, calibrationDeltaKcal),
    [macroGoal, calibrationDeltaKcal],
  );

  const handleMacroGoalChange = (nextGoalRaw) => {
    const nextGoal = normalizeMacroGoal(nextGoalRaw);
    setMacroGoal(nextGoal);
    const cal = resolveTrainingBlockMacroGoalCalibration(nextGoal);
    if (typeof onMacroGoalCalibrationChange === 'function') {
      void onMacroGoalCalibrationChange(cal.suggestedDeltaKcal, nextGoal);
    }
  };

  if (!isOpen) return null;

  const openNewSessionFlow = () => {
    if (days.length >= 28) {
      setError('Massimo 28 sessioni per blocco.');
      return;
    }
    setError('');
    const lastDate = days
      .map((d) => d.scheduledDate)
      .filter(Boolean)
      .sort()
      .at(-1);
    const nextDate = lastDate
      ? (addCalendarDaysIso(lastDate, 1) || todayIso)
      : todayIso;
    setDraftScheduledDate(nextDate);
    setShowDatePicker(true);
  };

  /** Aggiungi sessione direttamente su una data della griglia (salta date picker). */
  const openNewSessionOnDate = (dateIso) => {
    if (days.length >= 28) {
      setError('Massimo 28 sessioni per blocco.');
      return;
    }
    const date = normalizeIsoDate(dateIso);
    if (!date) {
      setError('Data non valida.');
      return;
    }
    if (days.some((d) => d.scheduledDate === date && d.type !== 'rest')) {
      setError('Esiste già una sessione in quella data.');
      return;
    }
    setError('');
    setShowDatePicker(false);
    setDraftScheduledDate(date);
    setEditingKey('new');
  };

  const confirmNewSessionDate = () => {
    const date = normalizeIsoDate(draftScheduledDate);
    if (!date) {
      setError('Seleziona una data valida.');
      return;
    }
    if (days.some((d) => d.scheduledDate === date && d.type !== 'rest')) {
      setError('Esiste già una sessione in quella data.');
      return;
    }
    setShowDatePicker(false);
    setEditingKey('new');
  };

  const openEditSession = (key) => {
    setError('');
    setShowDatePicker(false);
    setEditingKey(key);
  };

  const closeWorkoutForm = () => setEditingKey(null);

  const handlePlannerSave = (action) => {
    const scheduledDate = editingKey === 'new'
      ? (normalizeIsoDate(draftScheduledDate) || todayIso)
      : (normalizeIsoDate(editingDay?.scheduledDate) || todayIso);
    const mesocycleWeek = computeMesocycleWeek(
      scheduledDate,
      blockStartIso === scheduledDate && days.length === 0
        ? scheduledDate
        : blockStartIso,
    );

    const mapped = trainingBlockDayFromPlannerAction(action, {
      scheduledDate,
      mesocycleWeek,
    });
    if (mapped.type === 'rest') {
      setError('Il riposo non si pianifica: lascia i giorni senza sessioni.');
      setEditingKey(null);
      return;
    }

    setDays((prev) => {
      if (editingKey === 'new' || !editingKey) {
        if (prev.length >= 28) return prev;
        const dayIndex = prev.reduce(
          (max, d) => Math.max(max, Number.isFinite(Number(d.dayIndex)) ? Number(d.dayIndex) : -1),
          -1,
        ) + 1;
        const start = prev.length === 0
          ? scheduledDate
          : ([...prev.map((d) => d.scheduledDate), scheduledDate].filter(Boolean).sort()[0] || scheduledDate);
        return [...prev, {
          ...mapped,
          dayIndex,
          mesocycleWeek: computeMesocycleWeek(scheduledDate, start),
        }].sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)));
      }
      return prev.map((d) => (
        d.key === editingKey
          ? {
            ...mapped,
            key: d.key,
            dayIndex: Number.isFinite(Number(d.dayIndex)) ? Number(d.dayIndex) : d.dayIndex,
            scheduledDate: d.scheduledDate || mapped.scheduledDate,
            mesocycleWeek: d.mesocycleWeek || mapped.mesocycleWeek,
            status: d.status || 'pending',
            lastCompletedDate: d.lastCompletedDate || null,
          }
          : d
      ));
    });
    setEditingKey(null);
    setError('');
  };

  const removeDay = (key) => {
    setDays((prev) => prev.filter((d) => d.key !== key));
  };

  const applyLocalMove = (dayKey, targetDateIso) => {
    const targetDate = normalizeIsoDate(targetDateIso);
    if (!targetDate) {
      setError('Data non valida.');
      return;
    }
    const source = days.find((d) => d.key === dayKey);
    if (!source) return;
    if (days.some((d) => d.key !== dayKey && d.scheduledDate === targetDate && d.type !== 'rest')) {
      setError('Giorno occupato — scegli un giorno libero o usa Scambia.');
      return;
    }
    setDays((prev) => prev.map((d) => (
      d.key === dayKey
        ? {
          ...d,
          scheduledDate: targetDate,
          mesocycleWeek: computeMesocycleWeek(targetDate, blockStartIso),
        }
        : d
    )).sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate))));
    setMovePickerDay(null);
    setActionMenuKey(null);
    setError('');
  };

  const applyLocalSwap = (sourceKey, targetKey) => {
    const source = days.find((d) => d.key === sourceKey);
    const target = days.find((d) => d.key === targetKey);
    if (!source || !target) return;
    setDays((prev) => prev.map((d) => {
      if (d.key === sourceKey) {
        return {
          ...d,
          scheduledDate: target.scheduledDate,
          mesocycleWeek: computeMesocycleWeek(target.scheduledDate, blockStartIso),
        };
      }
      if (d.key === targetKey) {
        return {
          ...d,
          scheduledDate: source.scheduledDate,
          mesocycleWeek: computeMesocycleWeek(source.scheduledDate, blockStartIso),
        };
      }
      return d;
    }).sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate))));
    setSwapPickerDay(null);
    setActionMenuKey(null);
    setError('');
  };

  const handleMoveToDate = async (day, targetDateIso) => {
    setError('');
    const dayIndex = Number(day?.dayIndex);
    if (
      typeof onMoveSession === 'function'
      && isEditMode
      && Number.isFinite(dayIndex)
      && dayIndex >= 0
    ) {
      try {
        await onMoveSession(dayIndex, targetDateIso);
        setMovePickerDay(null);
        setActionMenuKey(null);
      } catch (err) {
        setError(String(err?.message || err || 'Spostamento fallito'));
      }
      return;
    }
    applyLocalMove(day.key, targetDateIso);
  };

  const handleSwapWith = async (sourceDay, targetDay) => {
    setError('');
    const srcIdx = Number(sourceDay?.dayIndex);
    const tgtIdx = Number(targetDay?.dayIndex);
    if (
      typeof onSwapSessions === 'function'
      && isEditMode
      && Number.isFinite(srcIdx)
      && Number.isFinite(tgtIdx)
      && srcIdx >= 0
      && tgtIdx >= 0
    ) {
      try {
        await onSwapSessions(srcIdx, tgtIdx);
        setSwapPickerDay(null);
        setActionMenuKey(null);
      } catch (err) {
        setError(String(err?.message || err || 'Scambio fallito'));
      }
      return;
    }
    applyLocalSwap(sourceDay.key, targetDay.key);
  };

  const handleToggleComplete = async (day) => {
    const done = isTrainingSessionCompleted(day);
    const nextCompleted = !done;

    setDays((prev) => prev.map((d) => (
      d.key === day.key
        ? {
          ...d,
          lastCompletedDate: nextCompleted ? todayIso : null,
          status: nextCompleted ? 'confirmed' : 'pending',
        }
        : d
    )));

    if (typeof onToggleSessionComplete === 'function' && Number.isFinite(Number(day.dayIndex))) {
      try {
        await onToggleSessionComplete(Number(day.dayIndex), nextCompleted);
      } catch (err) {
        setError(String(err?.message || err || 'Spunta non salvata'));
        setDays((prev) => prev.map((d) => (
          d.key === day.key
            ? {
              ...d,
              lastCompletedDate: day.lastCompletedDate || null,
              status: day.status || 'pending',
            }
            : d
        )));
      }
    }
  };

  const handleSave = async () => {
    if (!canSave || saving || busy || isGeneratingTargets) return;
    setSaving(true);
    setError('');
    try {
      const start = days
        .map((d) => d.scheduledDate)
        .filter(Boolean)
        .sort()[0] || todayIso;

      const baseDays = days.map((d, i) => {
        const scheduledDate = normalizeIsoDate(d.scheduledDate) || addCalendarDaysIso(start, i) || todayIso;
        return {
          dayIndex: Number.isFinite(Number(d.dayIndex)) ? Number(d.dayIndex) : i,
          scheduledDate,
          mesocycleWeek: normalizeMesocycleWeek(d.mesocycleWeek)
            || computeMesocycleWeek(scheduledDate, start),
          type: d.type,
          title: String(d.title || '').trim(),
          muscles: d.type === 'pesi' ? normalizeMuscleGroupArray(d.muscles || []) : [],
          plannedTime: Number.isFinite(Number(d.plannedTime)) ? Number(d.plannedTime) : null,
          durationMin: Math.max(0, Math.round(Number(d.durationMin) || 60)),
          plannedKcalBurn: Math.max(0, Math.round(Number(d.plannedKcalBurn) || 300)),
          strengthDetail: d.strengthDetail || null,
          status: d.lastCompletedDate ? 'confirmed' : (d.status || 'pending'),
          lastCompletedDate: normalizeLastCompletedDate(d.lastCompletedDate),
        };
      });

      const resolvedTdee = Number.isFinite(Number(tdee)) && Number(tdee) > 0
        ? Math.round(Number(tdee))
        : TRAINING_BLOCK_FALLBACK_BASE_KCAL;
      const resolvedWeight = Number.isFinite(Number(weightKg)) && Number(weightKg) > 0
        ? Number(weightKg)
        : 75;

      let nutritionPack = buildEmergencyWaveNutritionDays({
        tdee: resolvedTdee,
        macroGoal,
        daysArray: baseDays,
        weightKg: resolvedWeight,
      });

      const buildPayload = (pack) => {
        const byIndex = new Map(
          (pack.nutritionDays || []).map((row) => [Number(row.dayIndex), row]),
        );
        const enrichedDays = baseDays.map((d, i) => {
          const row = byIndex.get(d.dayIndex) || byIndex.get(i) || null;
          if (!row) return d;
          return {
            ...d,
            targetKcal: Math.round(Number(row.targetKcal)),
            targetProt: Math.round(Number(row.targetProt)),
            targetCarb: Math.round(Number(row.targetCarb)),
            targetFat: Math.round(Number(row.targetFat)),
          };
        });
        const payload = {
          name: String(name).trim(),
          macroGoal,
          days: enrichedDays,
          anchorDate: start,
        };
        if (isEditMode && activeBlock) {
          payload.blockId = activeBlock.blockId;
          payload.currentDayPointer = activeBlock.currentDayPointer;
          payload.createdAt = activeBlock.createdAt;
          payload.lastAction = activeBlock.lastAction || null;
        }
        return payload;
      };

      onClose();
      setSaving(false);
      setIsGeneratingTargets(false);

      void (async () => {
        try {
          await onSave(buildPayload(nutritionPack));
        } catch (err) {
          setError(String(err?.message || err || 'Salvataggio fallito'));
          return;
        }
        setIsGeneratingTargets(true);
        let aiPackApplied = false;
        try {
          const aiPack = await generatePeriodizedTargets(
            resolvedTdee,
            macroGoal,
            baseDays,
            { weightKg: resolvedWeight },
          );
          if (aiPack?.nutritionDays?.length) {
            nutritionPack = aiPack;
            aiPackApplied = true;
          }
        } catch {
          // resta emergency pack
        } finally {
          setIsGeneratingTargets(false);
        }
        if (aiPackApplied) {
          try {
            await onSave(buildPayload(nutritionPack));
          } catch (err) {
            setError(String(err?.message || err || 'Aggiornamento target AI fallito'));
          }
        }
      })();
    } catch (err) {
      setError(String(err?.message || err || 'Salvataggio fallito'));
      setSaving(false);
      setIsGeneratingTargets(false);
    }
  };

  const workoutPortal = editingKey != null && typeof document !== 'undefined'
    ? createPortal(
      <div className="fixed inset-0 z-[13000] flex flex-col bg-[#0f0f0f]">
        <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden">
          <WorkoutView
            key={editingKey === 'new' ? `new_${draftScheduledDate}_${days.length}` : editingKey}
            isPlannerMode
            plannerSaveLabel={editingKey === 'new' ? 'AGGIUNGI AL PIANO' : 'AGGIORNA SESSIONE'}
            initialData={plannerInitialData}
            onClose={closeWorkoutForm}
            onSaveAction={handlePlannerSave}
          />
        </div>
      </div>,
      document.body,
    )
    : null;

  const overlay = (
    <div
      className="fixed inset-0 z-[12000] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEditMode ? 'Modifica piano allenamento' : 'Crea piano allenamento'}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-cyan-500/30 bg-slate-950 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="m-0 text-sm font-bold tracking-wide text-cyan-100">
              {isEditMode ? 'Modifica Training Block' : 'Nuovo Training Block'}
            </h2>
            <p className="m-0 text-[10px] uppercase tracking-wider text-slate-400">
              Griglia Lun–Dom · {dayCount} session{dayCount === 1 ? 'e' : 'i'} · riposo = assenza
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300"
          >
            Chiudi
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 pb-28 [-webkit-overflow-scrolling:touch]">
          <label className="mb-3 block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-cyan-200/70">
              Nome del blocco
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Fase Ipertrofia 1"
              className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-cyan-200/70">
              Obiettivo
            </span>
            <select
              value={macroGoal}
              onChange={(e) => handleMacroGoalChange(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
            >
              {TRAINING_BLOCK_MACRO_GOALS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
            <p
              className="mt-2 flex flex-wrap items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[10px] leading-snug text-amber-100/90"
              role="status"
            >
              <span aria-hidden>🔥</span>
              <span>
                {`Target Energetico: ${energyTargetBadge}`}
                {' · Collegato a Calibrazione Target'}
              </span>
              {Number.isFinite(Number(calibrationDeltaKcal))
                && Math.abs(Number(calibrationDeltaKcal) - macroGoalCalibration.suggestedDeltaKcal) > 25 ? (
                  <span className="text-amber-300/80">
                    {`(suggerito: ${macroGoalCalibration.energyBadgeLabel})`}
                  </span>
                ) : null}
            </p>
          </label>

          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="m-0 text-[10px] uppercase tracking-wider text-orange-300/80">
              Calendario settimanale
            </p>
            <button
              type="button"
              onClick={openNewSessionFlow}
              className="rounded-lg border border-cyan-400/40 bg-cyan-950/50 px-2.5 py-1 text-[11px] font-semibold text-cyan-100"
            >
              + Aggiungi sessione
            </button>
          </div>

          {showDatePicker ? (
            <div className="mb-3 rounded-xl border border-cyan-500/30 bg-cyan-950/25 p-3">
              <p className="m-0 mb-2 text-[11px] font-semibold text-cyan-100">
                Data della sessione
              </p>
              <input
                type="date"
                value={draftScheduledDate}
                onChange={(e) => setDraftScheduledDate(e.target.value)}
                className="mb-2 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
              />
              <p className="m-0 mb-3 text-[10px] text-slate-400">
                {formatScheduledDateLabelIt(draftScheduledDate)}
                {' · '}
                {formatMesocycleWeekLabel(
                  computeMesocycleWeek(
                    normalizeIsoDate(draftScheduledDate) || todayIso,
                    blockStartIso,
                  ),
                )}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDatePicker(false)}
                  className="flex-1 rounded-lg border border-white/15 py-2 text-xs text-slate-300"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={confirmNewSessionDate}
                  className="flex-1 rounded-lg bg-cyan-600 py-2 text-xs font-bold text-white"
                >
                  Continua
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            {calendarWeeks.map((group) => {
              const weekStats = computeWeekSessionStats(group.days);
              return (
              <section
                key={group.monday}
                className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-2.5"
                aria-label={group.label}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="m-0 text-xs font-bold uppercase tracking-wide text-slate-200">
                    {group.label}
                  </h3>
                  {weekStats.total > 0 ? (
                    <span className="shrink-0 rounded-full border border-slate-600/40 bg-slate-800/50 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                      {`${weekStats.total} in agenda`}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  {group.days.map((slot) => {
                    const day = slot.session;
                    if (day) {
                      const done = isTrainingSessionCompleted(day);
                      const isPastOpen = Boolean(slot.isPast) && !done;
                      const muscleLabels = formatMuscleLabels(day.muscles || []);
                      return (
                        <div
                          key={slot.date}
                          className={[
                            'flex items-start gap-2 rounded-xl border p-2.5',
                            done
                              ? 'border-slate-700/60 border-l-4 border-l-emerald-400 bg-slate-900/80'
                              : isPastOpen
                                ? 'border-slate-800/70 bg-slate-900/40'
                                : slot.isToday
                                  ? 'border-slate-700/60 border-l-4 border-l-cyan-400 bg-slate-900/80 ring-1 ring-cyan-400/20'
                                  : 'border-slate-700/60 border-l-4 border-l-slate-500 bg-slate-900/70',
                          ].join(' ')}
                        >
                          <label
                            className="mt-0.5 flex shrink-0 cursor-pointer items-center"
                            title={done ? 'Eseguito' : 'Segna come eseguito'}
                          >
                            <input
                              type="checkbox"
                              checked={done}
                              onChange={() => { void handleToggleComplete(day); }}
                              disabled={busy}
                              className="h-4 w-4 accent-emerald-500"
                              aria-label={`Eseguito: ${day.title}`}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => openEditSession(day.key)}
                            className="min-w-0 flex-1 border-none bg-transparent p-0 text-left"
                          >
                            <p className={[
                              'm-0 text-[10px] font-medium uppercase tracking-wide',
                              slot.isToday ? 'text-cyan-300' : 'text-slate-500',
                            ].join(' ')}
                            >
                              {slot.label}
                              {slot.isToday ? ' · Oggi · Promemoria' : ''}
                            </p>
                            <p className={[
                              'm-0 truncate text-sm font-semibold',
                              isPastOpen ? 'text-slate-400' : 'text-white',
                            ].join(' ')}
                            >
                              {slot.isToday && !done ? '🗓️ ' : ''}
                              {day.title}
                            </p>
                            <p className="m-0 text-[11px] text-slate-400">
                              {dayTypeLabel(day.type)}
                              {` · ${formatDayTime(day.plannedTime)}`}
                              {day.durationMin ? ` · ${Math.round(Number(day.durationMin))}′` : ''}
                              {done ? ' · Eseguito' : (slot.isToday ? ' · Pianificato' : '')}
                            </p>
                            {muscleLabels.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {muscleLabels.map((label) => (
                                  <span
                                    key={`${day.key}_${label}`}
                                    className={[
                                      'rounded border px-2 py-0.5 text-[11px]',
                                      done
                                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                                        : isPastOpen
                                          ? 'border-slate-600/30 bg-slate-800/40 text-slate-400'
                                          : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
                                    ].join(' ')}
                                  >
                                    {label}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </button>
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={() => setActionMenuKey(
                                actionMenuKey === day.key ? null : day.key,
                              )}
                              disabled={busy}
                              className={SESSION_ACTION_BTN_CLASS}
                              aria-label={`Azioni ${day.title}`}
                              aria-expanded={actionMenuKey === day.key}
                            >
                              ⋮
                            </button>
                            {actionMenuKey === day.key ? (
                              <div
                                className="absolute right-0 top-full z-20 mt-1 min-w-[11.5rem] overflow-hidden rounded-lg border border-white/15 bg-slate-950/95 py-1 shadow-xl"
                                role="menu"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setActionMenuKey(null);
                                    setSwapPickerDay(null);
                                    setMovePickerDay(day);
                                  }}
                                  className="block w-full border-none bg-transparent px-3 py-2 text-left text-[11px] text-slate-200 hover:bg-cyan-950/60"
                                >
                                  Sposta su giorno libero…
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setActionMenuKey(null);
                                    setMovePickerDay(null);
                                    setSwapPickerDay(day);
                                  }}
                                  className="block w-full border-none bg-transparent px-3 py-2 text-left text-[11px] text-slate-200 hover:bg-cyan-950/60"
                                >
                                  Scambia con un altro allenamento…
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDay(day.key)}
                            className={SESSION_DELETE_BTN_CLASS}
                            aria-label={`Rimuovi ${day.title}`}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    }

                    // Giorno senza sessione → Riposo (non salvato in DB)
                    return (
                      <div
                        key={slot.date}
                        className={[
                          'flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-900/40 px-2.5 py-2',
                          slot.isToday ? 'ring-1 ring-slate-600/40' : '',
                        ].join(' ')}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={[
                            'm-0 text-[10px] font-medium uppercase tracking-wide',
                            slot.isToday ? 'text-slate-400' : 'text-slate-500',
                          ].join(' ')}
                          >
                            {slot.label}
                            {slot.isToday ? ' · Oggi' : ''}
                          </p>
                          <p className="m-0 text-sm font-medium text-slate-400">
                            🛋️ Riposo
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openNewSessionOnDate(slot.date)}
                          disabled={busy || days.length >= 28}
                          className="shrink-0 rounded-lg border border-slate-700/50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:border-cyan-400/40 hover:text-cyan-300 disabled:opacity-40"
                          aria-label={`Aggiungi allenamento il ${slot.label}`}
                          title="Aggiungi allenamento"
                        >
                          +
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
              );
            })}
          </div>

          {error ? (
            <p className="mt-3 text-center text-xs text-rose-300">{error}</p>
          ) : null}

          {movePickerDay ? (
            <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 sm:items-center">
              <div
                className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 p-4 shadow-2xl"
                role="dialog"
                aria-label="Sposta su giorno libero"
              >
                <p className="m-0 text-sm font-bold text-white">
                  Sposta «
                  {movePickerDay.title}
                  »
                </p>
                <p className="mt-1 mb-3 text-[11px] text-slate-400">
                  Scegli un giorno libero o di riposo.
                </p>
                {openRestDatesForMove.length === 0 ? (
                  <p className="text-xs text-slate-500">Nessun giorno libero nel calendario.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {openRestDatesForMove.map((date) => (
                      <button
                        key={date}
                        type="button"
                        onClick={() => { void handleMoveToDate(movePickerDay, date); }}
                        disabled={busy}
                        className="rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-left text-sm text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-950/40 disabled:opacity-40"
                      >
                        {formatScheduledDateLabelIt(date)}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setMovePickerDay(null)}
                  className="mt-3 w-full rounded-lg border border-white/15 py-2 text-xs text-slate-300"
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : null}

          {swapPickerDay ? (
            <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 sm:items-center">
              <div
                className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 p-4 shadow-2xl"
                role="dialog"
                aria-label="Scambia allenamento"
              >
                <p className="m-0 text-sm font-bold text-white">
                  Scambia «
                  {swapPickerDay.title}
                  »
                </p>
                <p className="mt-1 mb-3 text-[11px] text-slate-400">
                  Seleziona l&apos;altra sessione da invertire.
                </p>
                {swapCandidates.length === 0 ? (
                  <p className="text-xs text-slate-500">Nessun&apos;altra sessione disponibile.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {swapCandidates.map((candidate) => (
                      <button
                        key={candidate.key}
                        type="button"
                        onClick={() => { void handleSwapWith(swapPickerDay, candidate); }}
                        disabled={busy}
                        className="rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-left text-sm text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-950/40 disabled:opacity-40"
                      >
                        <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                          {formatScheduledDateLabelIt(candidate.scheduledDate)}
                        </span>
                        <span className="font-semibold">{candidate.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSwapPickerDay(null)}
                  className="mt-3 w-full rounded-lg border border-white/15 py-2 text-xs text-slate-300"
                >
                  Annulla
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-white/10 bg-slate-950/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving || busy || isGeneratingTargets}
            className="w-full rounded-xl bg-cyan-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-cyan-900/30 transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGeneratingTargets
              ? 'Calcolo Wave Nutrition…'
              : (saving || busy
                ? 'Salvataggio…'
                : (isEditMode ? 'Aggiorna Piano' : 'Salva Piano'))}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(overlay, document.body)}
      {workoutPortal}
    </>
  );
}
