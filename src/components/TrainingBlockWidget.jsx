import { useEffect, useMemo, useState } from 'react';
import useTrainingBlock from '../hooks/planning/useTrainingBlock';
import TrainingBlockCreator from './TrainingBlockCreator';
import { decimalToTimeStr } from '../coreEngine';
import {
  resolveImmutableBaseKcal,
  TRAINING_BLOCK_FALLBACK_BASE_KCAL,
} from '../features/planning/trainingBlockTargets';
import {
  resolveTrainingBlockHomeStatus,
} from '../features/planning/trainingBlockSchema';
import {
  WORKOUT_MUSCLE_GROUP_DEFS,
  normalizeMuscleGroupArray,
} from '../activityCatalog';
import ProgressionScoreWidget from '../features/trendHub/components/ProgressionScoreWidget';
import SaluteLongevityHero from '../features/trendHub/components/SaluteLongevityHero';
import useHomeProgressionSwap from '../hooks/salaComandi/useHomeProgressionSwap';
import {
  calculateProgressionScore,
} from '../features/trendHub/utils/saluteDashboardMetrics';
import {
  buildProgressionLogsWindow,
  LONGEVITY_WINDOW_DAYS,
} from '../features/trendHub/utils/saluteHistorySeries';

/** Stesso shell del MetabolicMonitorCard (padding, raggio, bordo). */
const CARD_CLASS =
  'home-oggi-rigid mb-0 box-border flex min-h-[5.75rem] w-full max-w-full shrink-0 flex-col justify-center overflow-hidden rounded-xl border border-cyan-500/35 bg-gradient-to-r from-cyan-950/70 via-slate-800/60 to-orange-950/50 px-3 py-2.5 shadow-lg shadow-cyan-900/20 backdrop-blur-sm';

const CARD_COMPLETED_CLASS =
  'home-oggi-rigid mb-0 box-border flex min-h-[5.75rem] w-full max-w-full shrink-0 flex-col justify-center overflow-hidden rounded-xl border border-emerald-500/45 bg-gradient-to-r from-emerald-950/70 via-slate-800/60 to-cyan-950/40 px-3 py-2.5 shadow-lg shadow-emerald-900/15 backdrop-blur-sm';

const CARD_REST_CLASS =
  'home-oggi-rigid mb-0 box-border flex min-h-[5.75rem] w-full max-w-full shrink-0 flex-col justify-center overflow-hidden rounded-xl border border-slate-500/35 bg-gradient-to-r from-slate-900/80 via-slate-800/55 to-indigo-950/40 px-3 py-2.5 shadow-lg shadow-slate-900/20 backdrop-blur-sm';

const SLIDE_CLASS = 'box-border w-full min-w-full max-w-full shrink-0 snap-center overflow-hidden';

const DAY_STATUS = Object.freeze({
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  REST: 'REST',
});

const MUSCLE_ID_TO_LABEL = Object.fromEntries(
  WORKOUT_MUSCLE_GROUP_DEFS.map((d) => [d.id, d.label]),
);

/**
 * Etichette muscolo leggibili (ABS, Avambracci, Petto…).
 * @param {string[]} muscles
 * @returns {string[]}
 */
function formatMuscleLabels(muscles) {
  return normalizeMuscleGroupArray(muscles).map(
    (id) => MUSCLE_ID_TO_LABEL[id] || id,
  );
}

/**
 * Headline minimale piano (PENDING): muscoli / tipo + orario.
 *
 * @param {object | null | undefined} session
 * @param {number | null | undefined} plannedTime
 * @returns {string}
 */
function sessionHeadline(session, plannedTime) {
  if (!session) return 'Promemoria';

  const type = String(session.type || '').trim().toLowerCase();
  const timeStr = Number.isFinite(Number(plannedTime))
    ? decimalToTimeStr(Number(plannedTime))
    : null;
  const withTime = (label) => (timeStr ? `${label} · ${timeStr}` : label);

  if (type === 'cardio') {
    return withTime('Cardio');
  }
  if (type === 'hiit') {
    return withTime('HIIT');
  }

  const muscleLabels = formatMuscleLabels(session.muscles || []);
  if (muscleLabels.length > 0) {
    const list = muscleLabels.join(', ');
    return withTime(list);
  }

  const rawTitle = String(session.title || '').trim();
  const cleaned = rawTitle
    .replace(/^\s*sollevamento\s+pesi\s*/i, '')
    .replace(/^\s*pesi\s*[·\-–:]?\s*/i, '')
    .trim();
  if (cleaned) return withTime(cleaned);
  return withTime('Allenamento');
}

/**
 * Card minimale Home: carosello Context-Aware Programma ↔ Punteggi gemelli.
 * Lo stato allenamento legge SOLO current_training_block (SSOT col pannello Pianifica).
 */
export default function TrainingBlockWidget({
  db = null,
  userUid = null,
  todayIso = null,
  userProfile = null,
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  userTargets = null,
  bodyMetricsHistory = null,
  heightCm = null,
  isSimulationMode = false,
  onConfirmSession = null,
  onPostponeSession = null,
  /** Apre scheda attività precompilata (Home «Esegui»). */
  onExecuteSession = null,
  onMacroGoalCalibrationChange = null,
  calibrationDeltaKcal = null,
  creatorOpen: creatorOpenProp = undefined,
  onCreatorOpenChange = null,
  onTodaySessionChange = null,
  onOpenTrendDiag: _onOpenTrendDiag = null,
  onOpenLongevity = null,
  onOpenProgressione = null,
  /** SSOT da useLongevityScore (SalaComandi) — evita ricalcolo locale senza nutrizione AI. */
  longevityResult: longevityResultProp = null,
}) {
  const {
    block,
    isLoading,
    error,
    busy,
    todayIso: hookTodayIso,
    todaySession,
    plannedTime,
    isBlockComplete,
    canPostpone,
    canConfirm,
    postponeSession,
    startNewBlock,
    setSessionCompleted,
    moveSession,
    swapSessions,
    clearBlock,
  } = useTrainingBlock({
    db,
    userUid,
    todayIso,
    userProfile,
    isSimulationMode,
    onConfirmSession,
    onPostponeSession,
  });

  const dayKey = String(todayIso || hookTodayIso || '').slice(0, 10);
  const {
    mode: leftRingMode,
    cardioScore,
  } = useHomeProgressionSwap({
    fourCylinder,
    fullHistory,
    activeLog,
    todayIso: dayKey,
  });
  const [toast, setToast] = useState('');
  const [localError, setLocalError] = useState('');
  const [creatorOpenInternal, setCreatorOpenInternal] = useState(false);
  const creatorControlled = typeof onCreatorOpenChange === 'function';
  const creatorOpen = creatorControlled ? Boolean(creatorOpenProp) : creatorOpenInternal;
  const setCreatorOpen = (open) => {
    if (creatorControlled) onCreatorOpenChange(Boolean(open));
    else setCreatorOpenInternal(Boolean(open));
  };

  useEffect(() => {
    if (typeof onTodaySessionChange !== 'function') return undefined;
    onTodaySessionChange(todaySession || null, {
      plannedTime: plannedTime ?? null,
      block: block || null,
    });
    return undefined;
  }, [todaySession, plannedTime, block, onTodaySessionChange]);

  /** SSOT: sessione con scheduledDate === oggi (calendario assoluto). */
  const dayStatusInfo = useMemo(() => {
    if (!block?.isActive) {
      return { status: DAY_STATUS.REST, workoutName: null, noPlan: true };
    }
    const resolved = resolveTrainingBlockHomeStatus(block, dayKey);
    return {
      status: resolved.status === 'COMPLETED'
        ? DAY_STATUS.COMPLETED
        : (resolved.status === 'PENDING' ? DAY_STATUS.PENDING : DAY_STATUS.REST),
      workoutName: resolved.workoutName,
      noPlan: false,
    };
  }, [block, dayKey]);
  const dayStatus = dayStatusInfo.status;

  const longevityResult = longevityResultProp;

  const progressionResult = useMemo(() => {
    const logs = buildProgressionLogsWindow({
      fullHistory,
      todayDate: dayKey,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog: activeLog,
    });
    return calculateProgressionScore(
      {
        days: logs.days,
        todayDate: logs.todayDate,
        sleepAvgHours: logs.sleepAvgHours,
        workoutSessionsTotal: logs.workoutSessionsTotal,
      },
      userTargets || {},
      {
        fourCylinder,
        fullHistory,
        activeLog,
        activeDate: dayKey,
      },
    );
  }, [fullHistory, dayKey, activeLog, userTargets, fourCylinder]);

  const showToast = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  };

  const handlePostpone = async () => {
    setLocalError('');
    try {
      await postponeSession();
      showToast('Rimandato · oggi riposo');
    } catch (err) {
      setLocalError(String(err?.message || err || 'Rinvio fallito'));
    }
  };

  const handleExecute = () => {
    setLocalError('');
    if (!todaySession) return;
    if (typeof onExecuteSession === 'function') {
      try {
        onExecuteSession(todaySession);
      } catch (err) {
        setLocalError(String(err?.message || err || 'Apertura scheda fallita'));
      }
      return;
    }
    setLocalError('Scheda attività non disponibile.');
  };

  const handleClearBlock = async () => {
    const ok = typeof window !== 'undefined'
      ? window.confirm('Eliminare il piano attivo? L’operazione non si può annullare.')
      : true;
    if (!ok) return;
    setLocalError('');
    try {
      await clearBlock();
      showToast('Piano eliminato');
    } catch (err) {
      setLocalError(String(err?.message || err || 'Eliminazione fallita'));
    }
  };

  const handleSaveNewBlock = async (definition) => {
    const isUpdate = Boolean(block?.isActive && definition?.blockId);
    await startNewBlock(definition);
    showToast(isUpdate ? 'Piano aggiornato' : 'Piano creato');
  };

  const activeBlockForCreator = (
    block?.isActive
      ? block
      : null
  );

  const creatorTdee = useMemo(
    () => resolveImmutableBaseKcal({
      userProfile,
      fallback: TRAINING_BLOCK_FALLBACK_BASE_KCAL,
    }),
    [userProfile],
  );
  const creatorWeightKg = useMemo(() => {
    const w = Number(userProfile?.weight ?? userProfile?.peso);
    return Number.isFinite(w) && w > 0 ? w : null;
  }, [userProfile]);

  const creator = (
    <TrainingBlockCreator
      isOpen={creatorOpen}
      onClose={() => setCreatorOpen(false)}
      onSave={handleSaveNewBlock}
      busy={busy}
      activeBlock={activeBlockForCreator}
      tdee={creatorTdee}
      weightKg={creatorWeightKg}
      todayIso={dayKey}
      onToggleSessionComplete={setSessionCompleted}
      onMoveSession={moveSession}
      onSwapSessions={swapSessions}
      onMacroGoalCalibrationChange={onMacroGoalCalibrationChange}
      calibrationDeltaKcal={calibrationDeltaKcal}
    />
  );

  const statusLine = toast || localError || error;
  const statusTone = toast
    ? 'text-emerald-300'
    : (localError || error ? 'text-rose-300' : '');

  const hasActivePlan = Boolean(block?.isActive && !isBlockComplete);
  const showActions = Boolean(
    dayStatus === DAY_STATUS.PENDING
    && hasActivePlan
    && todaySession
    && (canPostpone || canConfirm),
  );

  const pendingHeadline = hasActivePlan
    ? sessionHeadline(todaySession, plannedTime)
    : (isLoading ? '…' : 'Nessun piano');

  const programSlide = (() => {
    if (!hasActivePlan) {
      return (
        <div className={CARD_CLASS}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Piano
              </p>
              <p className="truncate text-base font-bold leading-tight text-slate-200">
                {isLoading ? '…' : 'Nessun piano'}
              </p>
            </div>
            {block ? (
              <button
                type="button"
                onClick={handleClearBlock}
                disabled={busy || isLoading}
                className="shrink-0 rounded-lg border border-rose-500/25 bg-transparent px-2 py-1.5 text-[10px] font-medium text-rose-300/80 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-40"
                aria-label="Elimina piano"
              >
                Elimina
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setCreatorOpen(true)}
              disabled={isLoading}
              className="shrink-0 rounded-lg border border-cyan-400/35 bg-cyan-950/50 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-900/60 disabled:opacity-40"
            >
              Nuovo
            </button>
          </div>
          {statusLine ? (
            <p className={`mt-1.5 text-center text-[0.68rem] font-medium ${statusTone}`} role="status">
              {statusLine}
            </p>
          ) : null}
        </div>
      );
    }

    if (dayStatus === DAY_STATUS.COMPLETED) {
      const name = dayStatusInfo.workoutName || 'Allenamento';
      return (
        <div className={CARD_COMPLETED_CLASS} aria-label="Allenamento eseguito">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 inline-flex shrink-0 items-center rounded-md border border-emerald-400/35 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Eseguito
            </span>
            <p className="min-w-0 flex-1 whitespace-normal break-words text-wrap text-base font-bold leading-snug text-emerald-50">
              {`✅ ${name}`}
            </p>
            <button
              type="button"
              onClick={() => setCreatorOpen(true)}
              className="shrink-0 rounded-md border border-transparent px-1.5 py-1 text-[11px] text-slate-500 hover:text-cyan-200"
              aria-label="Apri piano"
            >
              ☰
            </button>
          </div>
          {statusLine ? (
            <p className={`mt-1.5 text-center text-[0.68rem] font-medium ${statusTone}`} role="status">
              {statusLine}
            </p>
          ) : null}
        </div>
      );
    }

    if (dayStatus === DAY_STATUS.REST) {
      return (
        <div className={CARD_REST_CLASS} aria-label="Giorno di riposo">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Oggi
              </p>
              <p className="text-base font-bold leading-snug text-slate-200">
                🛋️ Riposo
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreatorOpen(true)}
              className="shrink-0 rounded-md border border-transparent px-1.5 py-1 text-[11px] text-slate-500 hover:text-cyan-200"
              aria-label="Apri piano"
            >
              ☰
            </button>
          </div>
          {statusLine ? (
            <p className={`mt-1.5 text-center text-[0.68rem] font-medium ${statusTone}`} role="status">
              {statusLine}
            </p>
          ) : null}
        </div>
      );
    }

    return (
      <div className={CARD_CLASS}>
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => setCreatorOpen(true)}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
            aria-label="Apri piano allenamento"
          >
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-cyan-300/80">
              Pianificato per oggi
            </p>
            <p
              className="text-base font-bold leading-snug text-cyan-50"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {pendingHeadline}
            </p>
          </button>
          <button
            type="button"
            onClick={handleClearBlock}
            disabled={busy}
            className="mt-0.5 shrink-0 rounded-md border border-transparent px-1.5 py-1 text-[11px] leading-none text-slate-500 transition hover:border-rose-500/30 hover:text-rose-300 disabled:opacity-40"
            aria-label="Elimina piano"
            title="Elimina piano"
          >
            🗑
          </button>
        </div>

        {showActions ? (
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-600/45 pt-2">
            <button
              type="button"
              onClick={handlePostpone}
              disabled={!canPostpone || busy}
              className="rounded-lg border border-orange-500/40 bg-orange-950/45 py-2.5 text-sm font-bold text-orange-100 transition hover:bg-orange-950/65 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? '…' : 'Rimanda'}
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={!canConfirm || busy}
              className="rounded-lg bg-cyan-600/90 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? '…' : 'Esegui'}
            </button>
          </div>
        ) : null}

        {statusLine ? (
          <p className={`mt-1.5 text-center text-[0.68rem] font-medium ${statusTone}`} role="status">
            {statusLine}
          </p>
        ) : null}
      </div>
    );
  })();

  const scoresSlide = (
    <div
      className={`${CARD_CLASS} !py-2`}
      aria-label="Punteggi Progressione e Longevità"
    >
      <div className="grid w-full max-w-full grid-cols-2 items-center gap-2">
        {leftRingMode === 'strength' ? (
          <ProgressionScoreWidget
            compact
            size={96}
            label="Progressione"
            score={progressionResult?.finalScore}
            breakdown={progressionResult?.breakdown}
            onClick={typeof onOpenProgressione === 'function' ? onOpenProgressione : undefined}
          />
        ) : (
          <ProgressionScoreWidget
            compact
            size={96}
            label="Cardio"
            score={cardioScore}
            onClick={
              typeof onOpenLongevity === 'function'
                ? onOpenLongevity
                : (typeof onOpenProgressione === 'function' ? onOpenProgressione : undefined)
            }
          />
        )}
        <SaluteLongevityHero
          compact
          size={96}
          score={longevityResult?.finalScore}
          onClick={typeof onOpenLongevity === 'function' ? onOpenLongevity : undefined}
        />
      </div>
    </div>
  );

  const orderedSlides = dayStatus === DAY_STATUS.PENDING
    ? [
        { id: 'program', label: 'Allenamento', node: programSlide },
        { id: 'scores', label: 'Punteggi', node: scoresSlide },
      ]
    : [
        { id: 'scores', label: 'Punteggi', node: scoresSlide },
        { id: 'program', label: 'Allenamento', node: programSlide },
      ];

  return (
    <>
      <div
        className="home-training-carousel box-border flex w-full max-w-full min-w-0 touch-pan-x snap-x snap-mandatory overflow-x-auto scrollbar-hide"
        aria-label="Carosello allenamento Home"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {orderedSlides.map((slide) => (
          <div key={slide.id} className={SLIDE_CLASS} aria-label={slide.label}>
            {slide.node}
          </div>
        ))}
      </div>
      {creator}
    </>
  );
}
