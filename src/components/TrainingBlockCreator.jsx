import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  TRAINING_BLOCK_MACRO_GOALS,
  normalizeMacroGoal,
} from '../features/planning/trainingBlockSchema';
import {
  buildEmergencyWaveNutritionDays,
  TRAINING_BLOCK_FALLBACK_BASE_KCAL,
} from '../features/planning/trainingBlockTargets';
import { generatePeriodizedTargets } from '../features/planning/aiNutritionEngine';
import { normalizeMuscleGroupArray } from '../activityCatalog';
import { decimalToTimeStr } from '../coreEngine';
import WorkoutView from '../drawers/vistas/WorkoutView';

let dayUidCounter = 0;
function nextDayKey() {
  dayUidCounter += 1;
  return `day_${Date.now()}_${dayUidCounter}`;
}

/**
 * Converte l'azione di WorkoutView (isPlannerMode) in un giorno del Training Block.
 * Non scrive sul log/timeline: solo payload per days[].
 *
 * @param {object} action — PlannerActionObject da WorkoutView
 * @returns {object}
 */
export function trainingBlockDayFromPlannerAction(action) {
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

  return {
    key: nextDayKey(),
    type,
    title,
    muscles,
    plannedTime,
    durationMin,
    plannedKcalBurn,
    strengthDetail: String(action?.strengthDetail || '').trim() || null,
    status: 'pending',
  };
}

/**
 * Idrata i giorni UI dal blocco Firebase già salvato.
 * @param {object | null | undefined} activeBlock
 * @returns {object[]}
 */
function daysFromActiveBlock(activeBlock) {
  const rawDays = Array.isArray(activeBlock?.days) ? activeBlock.days : [];
  return rawDays.map((d, i) => {
    const type = String(d?.type || 'pesi').toLowerCase() === 'rest'
      ? 'rest'
      : (d?.type === 'cardio' || d?.type === 'hiit' ? d.type : 'pesi');
    const isRest = type === 'rest';
    const plannedTimeRaw = Number(d?.plannedTime);
    return {
      key: `existing_${activeBlock?.blockId || 'block'}_${i}`,
      type,
      title: String(d?.title || (isRest ? 'Riposo' : 'Allenamento')).trim(),
      muscles: isRest ? [] : normalizeMuscleGroupArray(d?.muscles || []),
      plannedTime: !isRest && Number.isFinite(plannedTimeRaw) && plannedTimeRaw >= 0 && plannedTimeRaw < 24
        ? plannedTimeRaw
        : null,
      durationMin: isRest
        ? 0
        : Math.max(0, Math.round(Number(d?.durationMin) || 60)),
      plannedKcalBurn: isRest
        ? 0
        : Math.max(0, Math.round(Number(d?.plannedKcalBurn) || 300)),
      strengthDetail: d?.strengthDetail != null ? String(d.strengthDetail).trim() || null : null,
      targetKcal: Number.isFinite(Number(d?.targetKcal)) ? Math.round(Number(d.targetKcal)) : null,
      targetProt: Number.isFinite(Number(d?.targetProt)) ? Math.round(Number(d.targetProt)) : null,
      targetCarb: Number.isFinite(Number(d?.targetCarb)) ? Math.round(Number(d.targetCarb)) : null,
      targetFat: Number.isFinite(Number(d?.targetFat)) ? Math.round(Number(d.targetFat)) : null,
      status: String(d?.status || 'pending').toLowerCase() === 'confirmed'
        ? 'confirmed'
        : (String(d?.status || '').toLowerCase() === 'skipped' ? 'skipped' : 'pending'),
    };
  });
}

/**
 * @param {object | null | undefined} day
 * @returns {object} initialData per WorkoutView planner
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

/**
 * Drawer: crea o aggiorna un Training Block riusando WorkoutView in modalità pianificazione.
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   onSave: (definition: object) => void | Promise<void>,
 *   busy?: boolean,
 *   activeBlock?: object | null,
 *   tdee?: number | null,
 *   weightKg?: number | null,
 * }} props
 */
export default function TrainingBlockCreator({
  isOpen,
  onClose,
  onSave,
  busy = false,
  activeBlock = null,
  tdee = null,
  weightKg = null,
}) {
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

  // Idrata (o reset) all'apertura del drawer
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
    setSaving(false);
    setIsGeneratingTargets(false);
    return undefined;
  }, [isOpen, activeBlock?.blockId, activeBlock?.updatedAt]);

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
    return days.every((d) => String(d.title || '').trim());
  }, [name, days]);

  if (!isOpen) return null;

  const openNewSession = () => {
    if (days.length >= 14) {
      setError('Massimo 14 giorni per blocco.');
      return;
    }
    setError('');
    setEditingKey('new');
  };

  const openEditSession = (key) => {
    setError('');
    setEditingKey(key);
  };

  const closeWorkoutForm = () => setEditingKey(null);

  const handlePlannerSave = (action) => {
    const mapped = trainingBlockDayFromPlannerAction(action);
    setDays((prev) => {
      if (editingKey === 'new' || !editingKey) {
        if (prev.length >= 14) return prev;
        return [...prev, mapped];
      }
      return prev.map((d) => (
        d.key === editingKey
          ? { ...mapped, key: d.key, status: d.status || 'pending' }
          : d
      ));
    });
    setEditingKey(null);
    setError('');
  };

  const removeDay = (key) => {
    setDays((prev) => prev.filter((d) => d.key !== key));
  };

  const handleSave = async () => {
    if (!canSave || saving || busy || isGeneratingTargets) return;
    setSaving(true);
    setError('');
    try {
      const baseDays = days.map((d, i) => ({
        dayIndex: i,
        type: d.type,
        title: String(d.title || '').trim(),
        muscles: d.type === 'pesi' ? normalizeMuscleGroupArray(d.muscles || []) : [],
        plannedTime: d.type === 'rest' ? null : (Number.isFinite(Number(d.plannedTime)) ? Number(d.plannedTime) : null),
        durationMin: d.type === 'rest' ? 0 : Math.max(0, Math.round(Number(d.durationMin) || 60)),
        plannedKcalBurn: d.type === 'rest' ? 0 : Math.max(0, Math.round(Number(d.plannedKcalBurn) || 300)),
        strengthDetail: d.strengthDetail || null,
        status: d.status || 'pending',
      }));

      const resolvedTdee = Number.isFinite(Number(tdee)) && Number(tdee) > 0
        ? Math.round(Number(tdee))
        : TRAINING_BLOCK_FALLBACK_BASE_KCAL;
      const resolvedWeight = Number.isFinite(Number(weightKg)) && Number(weightKg) > 0
        ? Number(weightKg)
        : 75;

      // Target emergenza subito → chiudi il drawer senza attendere l'AI (10–15s).
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
        };
        if (isEditMode && activeBlock) {
          payload.blockId = activeBlock.blockId;
          payload.currentDayPointer = activeBlock.currentDayPointer;
          payload.anchorDate = activeBlock.anchorDate;
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
            key={editingKey === 'new' ? `new_${days.length}` : editingKey}
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
              Sequenza {dayCount} giorn{dayCount === 1 ? 'o' : 'i'} · form attività standard
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
              onChange={(e) => setMacroGoal(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
            >
              {TRAINING_BLOCK_MACRO_GOALS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-2 flex items-center justify-between">
            <p className="m-0 text-[10px] uppercase tracking-wider text-orange-300/80">
              Sequenza giorni
            </p>
            <button
              type="button"
              onClick={openNewSession}
              className="rounded-lg border border-cyan-400/40 bg-cyan-950/50 px-2.5 py-1 text-[11px] font-semibold text-cyan-100"
            >
              + Aggiungi sessione
            </button>
          </div>

          {days.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-black/25 px-4 py-8 text-center">
              <p className="m-0 text-sm text-slate-300">Nessuna sessione ancora</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Usa il form allenamenti per pianificare orario, muscoli e tipo
              </p>
              <button
                type="button"
                onClick={openNewSession}
                className="mt-4 rounded-xl border border-cyan-400/40 bg-cyan-600/80 px-4 py-2.5 text-xs font-bold text-white"
              >
                Apri form attività
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {days.map((day, index) => {
                const isRest = day.type === 'rest';
                return (
                  <div
                    key={day.key}
                    className="rounded-xl border border-white/10 bg-black/35 p-3"
                  >
                    <div className="mb-1.5 flex items-start gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-900/60 text-[11px] font-bold text-cyan-100">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEditSession(day.key)}
                        className="min-w-0 flex-1 border-none bg-transparent p-0 text-left"
                      >
                        <p className="m-0 truncate text-sm font-semibold text-white">
                          {day.title}
                        </p>
                        <p className="m-0 text-[11px] text-slate-400">
                          {dayTypeLabel(day.type)}
                          {!isRest ? ` · ${formatDayTime(day.plannedTime)}` : ''}
                          {!isRest && day.durationMin
                            ? ` · ${Math.round(Number(day.durationMin))}′`
                            : ''}
                          {day.status === 'confirmed' ? ' · ✓' : ''}
                        </p>
                        {!isRest && (day.muscles || []).length > 0 ? (
                          <p className="mt-1 m-0 text-[10px] text-cyan-200/70">
                            {day.muscles.join(', ')}
                          </p>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDay(day.key)}
                        className="shrink-0 rounded-lg border border-rose-500/30 px-2 py-1.5 text-[11px] text-rose-300"
                        aria-label={`Rimuovi giorno ${index + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {error ? (
            <p className="mt-3 text-center text-xs text-rose-300">{error}</p>
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
