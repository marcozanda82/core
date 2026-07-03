import { activityLabelFromBlock } from '../features/weeklyBlocks/activityCatalog';

/** @typedef {import('../features/weeklyBlocks/weeklyBlockSchema').DayBlock} DayBlock */

/**
 * @param {DayBlock | null | undefined} block
 * @returns {string | null}
 */
function workoutTypeFromPlanBlock(block) {
  if (!block) return null;
  if (block.meta?.plannerWorkoutType) return String(block.meta.plannerWorkoutType);
  const kind = String(block.activity?.kind || '').toUpperCase();
  if (kind === 'REST') return 'riposo';
  if (kind === 'CARDIO') return 'cardio';
  if (kind === 'WORKOUT') return 'pesi';
  return 'pesi';
}

/**
 * @param {DayBlock | null | undefined} block
 * @returns {string}
 */
function musclesLabelFromBlock(block) {
  const focus = Array.isArray(block?.activity?.focus) ? block.activity.focus : [];
  if (focus.length > 0) return focus.join(' · ');
  return activityLabelFromBlock(block);
}

/** Shell card premium condivisa (allenamento, riposo, monitor metabolico). */
const HOME_ACTIVITY_CARD_CLASS =
  'home-oggi-rigid mb-0 w-full shrink-0 rounded-xl border border-cyan-500/35 bg-gradient-to-r from-cyan-950/70 via-slate-800/60 to-orange-950/50 px-4 py-3 shadow-lg shadow-cyan-900/20 backdrop-blur-sm';

/**
 * @param {{
 *   todayPlanBlock: DayBlock | null,
 *   isWorkoutDoneToday: boolean,
 *   onOpenActionSheet?: () => void,
 * }} props
 */
export default function DayPlanWidget({ todayPlanBlock, isWorkoutDoneToday, onOpenActionSheet }) {
  const workoutType = workoutTypeFromPlanBlock(todayPlanBlock);
  const isRestDay = !todayPlanBlock || workoutType === 'riposo';
  const isPending = !isRestDay && !isWorkoutDoneToday;
  const isDone = !isRestDay && isWorkoutDoneToday;

  const durationMin = Math.round(Number(todayPlanBlock?.meta?.plannerDurationMin) || 60);
  const pendingLabel = `Oggi: ${musclesLabelFromBlock(todayPlanBlock)} — ${durationMin} min`;

  if (isRestDay) {
    return (
      <div
        className={HOME_ACTIVITY_CARD_CLASS}
        aria-label="Riposo attivo oggi"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl" aria-hidden style={{ filter: 'brightness(1.1)' }}>
            🔋
          </span>
          <p className="text-sm font-semibold text-cyan-100">Oggi: Riposo Attivo</p>
        </div>
      </div>
    );
  }

  if (isDone) {
    return (
      <div
        className="mb-0 w-full rounded-xl border border-emerald-700/40 bg-emerald-950/35 px-4 py-3 shadow-md backdrop-blur-sm"
        aria-label="Allenamento completato oggi"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl" aria-hidden>
            ✅
          </span>
          <p className="text-sm font-semibold text-emerald-300/90">Allenamento Completato</p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenActionSheet?.()}
      className={`${HOME_ACTIVITY_CARD_CLASS} text-left transition-transform active:scale-[0.99]`}
      aria-label="Apri azioni piano di oggi"
    >
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden>
          🎯
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-cyan-100">{pendingLabel}</p>
          <p className="text-[10px] uppercase tracking-wider text-orange-300/80">Da fare · Tocca per azioni</p>
        </div>
      </div>
    </button>
  );
}
