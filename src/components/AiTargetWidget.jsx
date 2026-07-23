import { useMemo, useState } from 'react';
import { ref, set, update } from 'firebase/database';
import useTrainingWave from '../hooks/useTrainingWave';
import { generateDailyMetabolicTargets } from '../services/aiTargetService';
import {
  macroGoalLabel,
  sanitizeTrainingWave,
  shiftWaveScheduleForward,
  trainingWaveToFirebasePayload,
} from '../features/training/waveSchema';

const DEFAULT_BASE_KCAL = 2000;
const DEFAULT_WEIGHT_KG = 75;

const HOME_ACTIVITY_CARD_CLASS =
  'home-oggi-rigid mb-0 w-full shrink-0 rounded-xl border border-cyan-500/35 bg-gradient-to-r from-cyan-950/70 via-slate-800/60 to-orange-950/50 px-4 py-3 shadow-lg shadow-cyan-900/20 backdrop-blur-sm';

function activityIcon(type, title, activityId) {
  const t = String(type || '').toLowerCase();
  const id = String(activityId || '').toLowerCase();
  const name = String(title || '').toLowerCase();
  if (t === 'rest' || t === 'recovery' || id === 'riposo' || name.includes('riposo')) {
    return '🛋️';
  }
  if (t === 'cardio' || id === 'cardio' || id === 'hiit' || name.includes('cardio')) return '🏃';
  return '🏋️';
}

/**
 * Card piano giornaliero + target metabolici + Trasla.
 */
export default function AiTargetWidget({
  baseKcal = DEFAULT_BASE_KCAL,
  userWeight = DEFAULT_WEIGHT_KG,
  db = null,
  userUid = null,
  onApplyTargets,
  onOpenWavePlanner,
}) {
  const { wave, currentDayIndex, todayProfile, tdeeMultiplier, macroGoal, isLoading, todayDate } =
    useTrainingWave({ db, userUid });
  const [busy, setBusy] = useState(false);
  const [shifting, setShifting] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const hasActiveWave = Boolean(wave?.isActive && currentDayIndex > 0 && todayProfile?.activityId);
  const activityTitle = String(todayProfile?.title || todayProfile?.activityKey || 'Sessione').trim();
  const activityType = String(todayProfile?.type || 'training');
  const activityId = todayProfile?.activityId;
  const isRestLike =
    activityType === 'rest'
    || activityType === 'recovery'
    || activityId === 'riposo';
  const goalLabel = macroGoalLabel(macroGoal || wave?.macroGoal || 'mantenimento');
  const canTrasla = Boolean(
    hasActiveWave && !isRestLike && db && userUid && todayDate,
  );

  const waveContext = useMemo(
    () => ({
      waveName: wave?.name || '',
      dayIndex: currentDayIndex,
      title: todayProfile?.title || '',
      type: todayProfile?.type || 'rest',
      tdeeMultiplier: Number(tdeeMultiplier) || Number(todayProfile?.tdeeMultiplier) || 1,
      macroGoal: macroGoal || wave?.macroGoal || 'mantenimento',
      timeTag: todayProfile?.timeTag || null,
      exactTime: todayProfile?.exactTime || todayProfile?.startTime || null,
    }),
    [wave?.name, wave?.macroGoal, currentDayIndex, todayProfile, tdeeMultiplier, macroGoal],
  );

  const handleApplyTargets = async () => {
    if (busy || !hasActiveWave) return;
    setBusy(true);
    setError('');
    setToast('');
    try {
      const payload = await generateDailyMetabolicTargets(
        Number(baseKcal) || DEFAULT_BASE_KCAL,
        Number(userWeight) || DEFAULT_WEIGHT_KG,
        waveContext,
      );
      const targets = payload?.daily_targets;
      if (!targets) throw new Error('Target non disponibili.');
      if (typeof onApplyTargets === 'function') {
        await onApplyTargets({
          kcal: Number(targets.kcal) || 0,
          pro: Number(targets.pro) || 0,
          cho: Number(targets.cho) || 0,
          fat: Number(targets.fat) || 0,
        });
      }
      setToast('Target Aggiornati');
      window.setTimeout(() => setToast(''), 2800);
    } catch (err) {
      setError(String(err?.message || err || 'Operazione fallita'));
    } finally {
      setBusy(false);
    }
  };

  const handleTrasla = async () => {
    if (!canTrasla || shifting) return;
    setShifting(true);
    setError('');
    try {
      const result = shiftWaveScheduleForward(wave.schedule, todayDate);
      if (!result.success) {
        setError(result.reason || 'Traslazione non riuscita.');
        return;
      }
      const payload = trainingWaveToFirebasePayload({
        ...wave,
        schedule: result.schedule,
        startDate: Object.keys(result.schedule).sort()[0] || wave.startDate,
      });
      if (!payload) throw new Error('Payload onda non valido.');
      await set(ref(db, `users/${userUid}/current_wave`), payload);
      await update(ref(db, `users/${userUid}/profile_targets`), {
        'profile/macroGoal': payload.macroGoal,
      });
      setToast('Piano traslato a domani');
      window.setTimeout(() => setToast(''), 2800);
      sanitizeTrainingWave(payload);
    } catch (err) {
      setError(String(err?.message || err || 'Traslazione fallita'));
    } finally {
      setShifting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={HOME_ACTIVITY_CARD_CLASS} aria-busy>
        <p className="text-sm text-cyan-100/70">Caricamento piano…</p>
      </div>
    );
  }

  if (!hasActiveWave) {
    return (
      <div className={HOME_ACTIVITY_CARD_CLASS}>
        <div className="flex items-center gap-3">
          <span className="text-xl" aria-hidden>
            📋
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-cyan-100">Nessun piano attivo</p>
            <p className="text-[10px] uppercase tracking-wider text-orange-300/80">
              Configura l’onda per oggi
            </p>
          </div>
        </div>
        {typeof onOpenWavePlanner === 'function' ? (
          <button
            type="button"
            onClick={onOpenWavePlanner}
            className="mt-3 w-full rounded-xl border border-cyan-400/40 bg-cyan-600/90 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-900/30 transition hover:bg-cyan-500"
          >
            Crea Piano
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={HOME_ACTIVITY_CARD_CLASS}>
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden style={{ filter: 'brightness(1.1)' }}>
          {activityIcon(activityType, activityTitle, activityId)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-cyan-50">
            {isRestLike ? 'Giorno di Riposo' : activityTitle}
          </p>
          <p className="truncate text-xs text-orange-300/85">
            Obiettivo: {goalLabel}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleApplyTargets}
        disabled={busy}
        className="mt-3 w-full rounded-xl bg-cyan-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-cyan-900/30 transition-colors hover:bg-cyan-500 active:bg-cyan-700 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? 'Applicazione…' : 'Applica Target Odierni'}
      </button>

      {canTrasla ? (
        <button
          type="button"
          onClick={handleTrasla}
          disabled={shifting}
          className="mt-2 w-full rounded-xl border border-orange-500/40 bg-orange-950/40 py-2.5 text-xs font-semibold text-orange-200 transition hover:bg-orange-950/60 disabled:opacity-60"
        >
          {shifting ? 'Traslazione…' : '⏩ Posticipa (Trasla)'}
        </button>
      ) : null}

      {toast ? (
        <p className="mt-2 text-center text-xs font-semibold text-emerald-300" role="status">
          {toast}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-center text-xs text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
