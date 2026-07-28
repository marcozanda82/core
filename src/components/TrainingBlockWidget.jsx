import { useEffect, useMemo, useState } from 'react';
import MuscleStimulusWidget from './MuscleStimulusWidget';
import useTrainingBlock from '../hooks/planning/useTrainingBlock';
import TrainingBlockCreator from './TrainingBlockCreator';
import { decimalToTimeStr } from '../coreEngine';
import {
  resolveImmutableBaseKcal,
  TRAINING_BLOCK_FALLBACK_BASE_KCAL,
} from '../features/planning/trainingBlockTargets';
import {
  WORKOUT_MUSCLE_GROUP_DEFS,
  normalizeMuscleGroupArray,
} from '../activityCatalog';

/** Stesso shell del MetabolicMonitorCard (padding, raggio, bordo). */
const CARD_CLASS =
  'home-oggi-rigid mb-0 w-full shrink-0 rounded-xl border border-cyan-500/35 bg-gradient-to-r from-cyan-950/70 via-slate-800/60 to-orange-950/50 px-3 py-2.5 shadow-lg shadow-cyan-900/20 backdrop-blur-sm';

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
 * Headline minimale:
 * - pesi → muscoli + orario (niente "Pesi" / "Sollevamento pesi")
 * - cardio / hiit / rest → dicitura chiara + orario se utile
 *
 * @param {object | null | undefined} session
 * @param {number | null | undefined} plannedTime
 * @returns {string}
 */
function sessionHeadline(session, plannedTime) {
  if (!session) return 'Nessuna sessione oggi';

  const type = String(session.type || '').trim().toLowerCase();
  const timeStr = Number.isFinite(Number(plannedTime))
    ? decimalToTimeStr(Number(plannedTime))
    : null;
  const withTime = (label) => (timeStr ? `${label} · ${timeStr}` : label);

  if (type === 'rest' || type === 'riposo') {
    return 'Recupero';
  }
  if (type === 'cardio') {
    return withTime('Cardio');
  }
  if (type === 'hiit') {
    return withTime('HIIT');
  }

  // pesi (default): solo muscoli + orario
  const muscleLabels = formatMuscleLabels(session.muscles || []);
  if (muscleLabels.length > 0) {
    const list = muscleLabels.join(', ');
    return withTime(list);
  }

  // Fallback se non ci sono muscoli: titolo senza prefissi "Pesi"/"Sollevamento…"
  const rawTitle = String(session.title || '').trim();
  const cleaned = rawTitle
    .replace(/^\s*sollevamento\s+pesi\s*/i, '')
    .replace(/^\s*pesi\s*[·\-–:]?\s*/i, '')
    .trim();
  if (cleaned) return withTime(cleaned);
  return withTime('Allenamento');
}

/**
 * Card minimale Home: sessione di oggi + Rinvia / Conferma.
 * Stile allineato a MetabolicMonitorCard.
 */
export default function TrainingBlockWidget({
  db = null,
  userUid = null,
  todayIso = null,
  userProfile = null,
  fourCylinder = null,
  isSimulationMode = false,
  onConfirmSession = null,
  creatorOpen: creatorOpenProp = undefined,
  onCreatorOpenChange = null,
  onTodaySessionChange = null,
  onOpenTrendDiag = null,
}) {
  const {
    block,
    isLoading,
    error,
    busy,
    todaySession,
    confirmedTodaySession,
    plannedTime,
    isBlockComplete,
    canPostpone,
    canConfirm,
    postponeSession,
    confirmSession,
    startNewBlock,
    clearBlock,
  } = useTrainingBlock({
    db,
    userUid,
    todayIso,
    userProfile,
    isSimulationMode,
    onConfirmSession,
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

  const showToast = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  };

  const handlePostpone = async () => {
    setLocalError('');
    try {
      await postponeSession();
      showToast('Slittato a domani');
    } catch (err) {
      setLocalError(String(err?.message || err || 'Rinvio fallito'));
    }
  };

  const handleConfirm = async () => {
    setLocalError('');
    try {
      await confirmSession();
      showToast('Confermato');
    } catch (err) {
      setLocalError(String(err?.message || err || 'Conferma fallita'));
    }
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
    const isUpdate = Boolean(block?.isActive && !isBlockComplete && definition?.blockId);
    await startNewBlock(definition);
    showToast(isUpdate ? 'Piano aggiornato' : 'Piano creato');
  };

  const activeBlockForCreator = (
    block?.isActive && !isBlockComplete
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
    />
  );

  const statusLine = toast || localError || error;
  const statusTone = toast
    ? 'text-emerald-300'
    : (localError || error ? 'text-rose-300' : '');

  if (isLoading) {
    return (
      <>
        <div className={CARD_CLASS} aria-busy>
          <p className="text-xs text-slate-400">…</p>
        </div>
        {creator}
      </>
    );
  }

  if (!block || isBlockComplete || !block.isActive) {
    return (
      <>
        <div className={CARD_CLASS}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Piano
              </p>
              <p className="truncate text-base font-bold leading-tight text-slate-200">
                {isBlockComplete ? 'Blocco completato' : 'Nessun piano'}
              </p>
            </div>
            {block ? (
              <button
                type="button"
                onClick={handleClearBlock}
                disabled={busy}
                className="shrink-0 rounded-lg border border-rose-500/25 bg-transparent px-2 py-1.5 text-[10px] font-medium text-rose-300/80 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-40"
                aria-label="Elimina piano"
              >
                Elimina
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setCreatorOpen(true)}
              className="shrink-0 rounded-lg border border-cyan-400/35 bg-cyan-950/50 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-900/60"
            >
              Nuovo
            </button>
          </div>
          {statusLine ? (
            <p className={`mt-2 text-center text-[0.68rem] font-medium ${statusTone}`} role="status">
              {statusLine}
            </p>
          ) : null}
        </div>
        {creator}
      </>
    );
  }

  const isRest = String(todaySession?.type || '').toLowerCase() === 'rest';
  const headline = sessionHeadline(todaySession, plannedTime);
  const showActions = Boolean(todaySession && (canPostpone || canConfirm));
  const workoutCompletedToday = Boolean(confirmedTodaySession && !showActions);

  const handleOpenTrendDiag = () => {
    if (typeof onOpenTrendDiag === 'function') {
      onOpenTrendDiag();
      return;
    }
  };

  if (workoutCompletedToday) {
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          aria-label="Apri diagnostica stimolo muscolare"
          onClick={handleOpenTrendDiag}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              handleOpenTrendDiag();
            }
          }}
          className="cursor-pointer transition-transform duration-200 hover:scale-[1.02] hover:shadow-[0_0_24px_rgba(34,211,238,0.3)] active:scale-95"
        >
          <MuscleStimulusWidget fourCylinder={fourCylinder} />
        </div>
        {statusLine ? (
          <p className={`mt-1.5 text-center text-[0.68rem] font-medium ${statusTone}`} role="status">
            {statusLine}
          </p>
        ) : null}
        {creator}
      </>
    );
  }

  return (
    <>
      <div className={CARD_CLASS}>
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => setCreatorOpen(true)}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
            aria-label="Apri piano allenamento"
          >
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {block.name || 'Piano'}
            </p>
            <p
              className={`text-base font-bold leading-snug ${
                isRest ? 'text-slate-300' : 'text-cyan-50'
              }`}
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {headline}
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
              {busy ? '…' : 'Rinvia'}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm || busy}
              className="rounded-lg bg-cyan-600/90 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? '…' : 'Conferma'}
            </button>
          </div>
        ) : null}

        {statusLine ? (
          <p className={`mt-1.5 text-center text-[0.68rem] font-medium ${statusTone}`} role="status">
            {statusLine}
          </p>
        ) : null}
      </div>
      {creator}
    </>
  );
}
