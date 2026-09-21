import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ListChecks, X } from 'lucide-react';
import { getMuscleGroupsForMacro, stashActivitySheetTempTab } from '../../activityCatalog';
import CardioProgressBar from '../../components/CardioProgressBar';
import MuscleStimulusDistrictList from '../trendHub/components/MuscleStimulusDistrictList';
import { buildMuscleTelemetryRows } from '../trendHub/utils/muscleTelemetryModel';
import {
  buildAttivitaWorkoutSummary,
  collectPendingSessionDrafts,
} from './attivitaWorkoutSummary';
import AttivitaWorkoutHistoryModal from './AttivitaWorkoutHistoryModal';
import DailySessionsView from './DailySessionsView';

function OverlayActionButton({ icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex w-full min-h-[4.75rem] flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-3',
        'border-white/12 bg-white/[0.06] text-zinc-100 shadow-[0_8px_32px_rgba(0,0,0,0.35)]',
        'backdrop-blur-sm transition-all duration-150',
        'hover:border-cyan-400/45 hover:bg-cyan-500/10 hover:shadow-[0_12px_40px_rgba(34,211,238,0.12)]',
        'active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
        'disabled:pointer-events-none disabled:opacity-45',
      ].join(' ')}
    >
      <span className="inline-flex h-8 items-center justify-center text-2xl leading-none" aria-hidden>
        {icon}
      </span>
      <span className="whitespace-nowrap text-center text-xs font-semibold leading-tight sm:text-sm">
        {label}
      </span>
    </button>
  );
}

/**
 * Cruscotto stimolo muscolare + cardio — stessa UI da chat (Attività) e da Home.
 */
export default function StimulusCockpitOverlay({
  open = false,
  onClose = null,
  fourCylinder = null,
  fullHistory = null,
  dailyLog = null,
  disabled = false,
  isDiabetesAppMode: _isDiabetesAppMode = false,
  onOpenActivity = null,
  onOpenPlan: _onOpenPlan = null,
  onDeleteWorkout = null,
  extraPendingDrafts = [],
  manualNodes = [],
  onConfirmSessionDraft = null,
  onEditSessionDraft = null,
  onCancelSessionDraft = null,
  onOpenSessions = null,
} = {}) {
  const [showWorkoutHistory, setShowWorkoutHistory] = useState(false);
  const [showDailySessions, setShowDailySessions] = useState(false);

  const handleClose = useCallback(() => {
    setShowWorkoutHistory(false);
    setShowDailySessions(false);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      setShowWorkoutHistory(false);
      setShowDailySessions(false);
      return undefined;
    }
    const onKey = (event) => {
      if (event.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  const muscleRows = useMemo(() => {
    try {
      const rows = buildMuscleTelemetryRows({
        fourCylinder: fourCylinder && typeof fourCylinder === 'object' ? fourCylinder : null,
        fullHistory: fullHistory && typeof fullHistory === 'object' ? fullHistory : {},
        activeLog: Array.isArray(dailyLog) ? dailyLog : [],
      })?.muscleRows;
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      console.warn('[StimulusCockpitOverlay] muscle telemetry failed', error);
      return [];
    }
  }, [fourCylinder, fullHistory, dailyLog]);

  const workoutSummary = useMemo(
    () => buildAttivitaWorkoutSummary({
      dailyLog,
      fullHistory,
    }),
    [dailyLog, fullHistory],
  );

  const openActivity = useCallback((payload) => {
    if (disabled || !payload) return;
    const defaultTab = stashActivitySheetTempTab(payload.defaultTab || 'pesi');
    handleClose();
    onOpenActivity?.({
      ...payload,
      defaultTab,
      category: payload.category || (defaultTab === 'pesi' ? 'strength' : null),
    });
  }, [disabled, handleClose, onOpenActivity]);

  const openStimulusCylinder = useCallback((row) => {
    const groupId = String(row?.id || '').trim();
    const workoutMuscles = getMuscleGroupsForMacro(groupId).map((d) => d.id);
    openActivity({
      id: `stimulus-${groupId || 'pesi'}`,
      defaultTab: 'pesi',
      category: 'strength',
      targetMuscle: groupId,
      muscles: workoutMuscles,
    });
  }, [openActivity]);

  const pendingSessionDrafts = useMemo(
    () => collectPendingSessionDrafts({
      dailyLog,
      manualNodes,
      extraDrafts: extraPendingDrafts,
    }),
    [dailyLog, manualNodes, extraPendingDrafts],
  );

  const closeSessionsAndCockpit = useCallback(() => {
    setShowDailySessions(false);
    handleClose();
  }, [handleClose]);

  const handleConfirmSessionDraft = useCallback((draft) => {
    closeSessionsAndCockpit();
    onConfirmSessionDraft?.(draft);
  }, [closeSessionsAndCockpit, onConfirmSessionDraft]);

  const handleEditSessionDraft = useCallback((draft) => {
    closeSessionsAndCockpit();
    onEditSessionDraft?.(draft);
  }, [closeSessionsAndCockpit, onEditSessionDraft]);

  if (!open || typeof document === 'undefined') return null;

  return (
    <>
      {createPortal(
        <>
          <div
            className="kentu-submenu-focus-backdrop fixed inset-0 z-[100040] bg-black/60 backdrop-blur-md"
            aria-hidden
            onClick={handleClose}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cruscotto dello stimolo muscolare e cardio"
            className="pointer-events-none fixed inset-0 z-[100041] flex items-end justify-center px-3 pb-3 pt-6 sm:items-center sm:px-6 sm:py-6"
          >
            <div
              className="kentu-submenu-focus-panel pointer-events-auto relative flex max-h-[96dvh] min-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/75 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleClose}
                aria-label="Chiudi cruscotto"
                title="Chiudi"
                className={[
                  'absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border',
                  'border-zinc-700 bg-zinc-900 text-zinc-300 transition',
                  'hover:border-cyan-500/45 hover:text-cyan-100',
                  'active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40',
                ].join(' ')}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <header className="relative shrink-0 px-1 pb-1.5 pr-14 pt-1 text-center">
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Semaforo metabolico
                </p>
                <h2 className="mt-0.5 text-base font-semibold text-zinc-50 sm:text-lg">
                  Cruscotto dello stimolo
                </h2>
              </header>

              <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-3 pb-1">
                <MuscleStimulusDistrictList
                  muscleRows={muscleRows}
                  onSelectRow={openStimulusCylinder}
                  showLegend={false}
                  unifiedBars
                />

                <section className="mt-3 mb-1">
                  <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Monitoraggio Cardio
                  </h3>
                  <CardioProgressBar
                    compact
                    dense
                    unifiedBars
                    fullHistory={fullHistory}
                    activeLog={dailyLog}
                    onActivate={() => openActivity({
                      id: 'cardio-monitor',
                      defaultTab: 'cardio',
                    })}
                  />
                </section>
              </div>

              <div className="w-full shrink-0 px-3 pb-3 pt-3">
                <div className="grid w-full grid-cols-3 gap-2 [&>button]:w-full">
                  <OverlayActionButton
                    icon="🏋️"
                    label="Forza"
                    disabled={disabled}
                    onClick={() => openActivity({
                      id: 'forza',
                      defaultTab: 'pesi',
                      category: 'strength',
                    })}
                  />
                  <OverlayActionButton
                    icon="🚶"
                    label="Camminata"
                    disabled={disabled}
                    onClick={() => openActivity({
                      id: 'camminata',
                      defaultTab: 'camminata',
                    })}
                  />
                  <OverlayActionButton
                    icon="🏃"
                    label="Corsa"
                    disabled={disabled}
                    onClick={() => openActivity({
                      id: 'corsa',
                      defaultTab: 'corsa',
                    })}
                  />
                </div>
                <div className="mt-2 grid w-full grid-cols-2 gap-2 [&>button]:w-full">
                  <OverlayActionButton
                    icon={<ListChecks className="h-7 w-7 text-cyan-200" strokeWidth={2.1} />}
                    label="Sessioni"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      if (typeof onOpenSessions === 'function') {
                        onOpenSessions();
                        return;
                      }
                      setShowDailySessions(true);
                    }}
                  />
                  <OverlayActionButton
                    icon="📊"
                    label="Storico"
                    disabled={disabled}
                    onClick={() => setShowWorkoutHistory(true)}
                  />
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
      <AttivitaWorkoutHistoryModal
        open={showWorkoutHistory}
        summary={workoutSummary}
        onClose={() => setShowWorkoutHistory(false)}
        onDeleteWorkout={onDeleteWorkout}
      />
      <DailySessionsView
        open={showDailySessions}
        pendingDrafts={pendingSessionDrafts}
        completedToday={workoutSummary.todayWorkouts}
        onClose={() => setShowDailySessions(false)}
        onConfirmDraft={handleConfirmSessionDraft}
        onEditDraft={handleEditSessionDraft}
        onCancelDraft={onCancelSessionDraft}
      />
    </>
  );
}
