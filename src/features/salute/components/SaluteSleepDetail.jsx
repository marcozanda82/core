import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SleepTrackerWidget from '../../trendHub/components/SleepTrackerWidget';
import {
  formatSleepClock,
  formatSleepHoursShort,
  formatVsReferenceClock,
  SLEEP_REFERENCE_DEFAULT_H,
  SLEEP_REFERENCE_MAX_H,
  SLEEP_REFERENCE_MIN_H,
  SLEEP_REFERENCE_STEP_H,
  sleepReferenceStory,
  snapSleepReferenceHours,
} from '../utils/sleepReference';
import SaluteSleepGhostChart from './SaluteSleepGhostChart';
import { SALUTE_FROST, sleepSemaphoreFromDelta } from '../utils/saluteVisualTheme';

const TIME_INPUT_STEP_S = Math.round(SLEEP_REFERENCE_STEP_H * 3600);
const TIME_INPUT_MIN = hoursToTimeValue(SLEEP_REFERENCE_MIN_H);
const TIME_INPUT_MAX = hoursToTimeValue(SLEEP_REFERENCE_MAX_H);

function hoursToTimeValue(hours) {
  const snapped = snapSleepReferenceHours(hours);
  const n = snapped == null ? SLEEP_REFERENCE_DEFAULT_H : snapped;
  const totalMins = Math.round(n * 60);
  const h = Math.min(23, Math.max(0, Math.floor(totalMins / 60)));
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeValueToHours(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return snapSleepReferenceHours(hours + mins / 60);
}

function Expandable({ title, children }) {
  return (
    <details className={`rounded-2xl ${SALUTE_FROST.nested}`}>
      <summary className="cursor-pointer list-none px-4 py-3.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400 marker:content-none [&::-webkit-details-marker]:hidden">
        {title}
      </summary>
      <div className="space-y-3 border-t border-white/[0.06] px-4 py-3.5">
        {children}
      </div>
    </details>
  );
}

function SleepReferenceConfirmDialog({
  open = false,
  nextLabel = '',
  saving = false,
  onCancel = null,
  onSave = null,
} = {}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (!saving) onCancel?.();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, saving, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100085] flex items-center justify-center bg-black/60 px-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sleep-ref-confirm-title"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950/80 px-5 py-5 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3
          id="sleep-ref-confirm-title"
          className="m-0 text-[16px] font-semibold leading-snug text-slate-50"
        >
          Vuoi impostare {nextLabel} come nuovo riferimento per il sonno?
        </h3>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-h-11 flex-1 rounded-2xl border border-white/10 px-3 text-[13px] text-slate-300 disabled:opacity-45"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="min-h-11 flex-1 rounded-2xl border border-violet-400/35 bg-violet-500/10 px-3 text-[13px] font-medium text-violet-100 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm disabled:opacity-45"
          >
            Salva
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function SaluteSleepDetail({
  pillar,
  sleepTrend,
  sleepLog,
  sleepReference,
} = {}) {
  const timeInputRef = useRef(null);
  const [pendingHours, setPendingHours] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const committedHours = snapSleepReferenceHours(sleepReference?.effectiveHours)
    ?? SLEEP_REFERENCE_DEFAULT_H;
  const displayedHours = pendingHours ?? committedHours;
  const saving = Boolean(sleepReference?.saving);

  useEffect(() => {
    if (pendingHours != null || confirmOpen) return;
    const input = timeInputRef.current;
    if (input) input.value = hoursToTimeValue(committedHours);
  }, [committedHours, pendingHours, confirmOpen]);

  const proposeHours = (next) => {
    if (next == null) return;
    if (next === committedHours) {
      setPendingHours(null);
      setConfirmOpen(false);
      const input = timeInputRef.current;
      if (input) input.value = hoursToTimeValue(committedHours);
      return;
    }
    setPendingHours(next);
    setConfirmOpen(true);
  };

  const openTimePicker = (event) => {
    if (saving) return;
    const input = timeInputRef.current;
    if (!input || typeof input.showPicker !== 'function') return;
    event.preventDefault();
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  const handleCancelConfirm = () => {
    if (saving) return;
    setConfirmOpen(false);
    setPendingHours(null);
    const input = timeInputRef.current;
    if (input) input.value = hoursToTimeValue(committedHours);
  };

  const handleSaveConfirm = async () => {
    if (pendingHours == null) return;
    const ok = await sleepReference?.savePersonal?.(pendingHours);
    if (ok) {
      setConfirmOpen(false);
      setPendingHours(null);
    }
  };

  const avg14 = Number.isFinite(Number(sleepTrend?.avg14Days))
    ? Number(sleepTrend.avg14Days)
    : (Number.isFinite(Number(pillar?.averageHours)) ? Number(pillar.averageHours) : null);
  const sampleDays = Number(sleepTrend?.sampleDays)
    || Number(pillar?.nights)
    || 0;
  const effective = Number(sleepReference?.effectiveHours);
  const delta = avg14 != null && Number.isFinite(effective)
    ? avg14 - effective
    : null;
  const semaphore = sleepSemaphoreFromDelta(delta);

  return (
    <div className="space-y-5">
      <section>
        <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-violet-300/85">
          Come sta andando
        </p>
        <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${semaphore.wrap} ${semaphore.text}`}>
          <span aria-hidden>{semaphore.emoji}</span>
          {semaphore.label}
        </span>
        <p className="m-0 mt-2 text-[15px] leading-relaxed text-slate-50">
          {sleepReferenceStory({
            averageHours: avg14,
            effectiveHours: effective,
            sampleDays,
          })}
        </p>
      </section>

      <section className={`rounded-[22px] px-4 py-4 ${SALUTE_FROST.nested}`}>
        <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-violet-300/85">
          Il tuo riferimento
        </p>
        <label
          className={[
            'group relative mt-1.5 inline-flex cursor-pointer items-baseline rounded-xl px-1.5 py-1 -ml-1.5',
            'text-[28px] font-semibold tabular-nums leading-none text-violet-100',
            'underline decoration-violet-300/35 decoration-dotted underline-offset-4',
            'transition hover:bg-violet-500/15 hover:text-violet-50 hover:decoration-violet-200/70',
            'focus-within:bg-violet-500/15 focus-within:ring-2 focus-within:ring-violet-400/45',
            saving ? 'pointer-events-none opacity-60' : '',
          ].join(' ')}
          onClick={openTimePicker}
        >
          <span aria-hidden>{formatSleepClock(displayedHours)}</span>
          <input
            ref={timeInputRef}
            type="time"
            min={TIME_INPUT_MIN}
            max={TIME_INPUT_MAX}
            step={TIME_INPUT_STEP_S}
            defaultValue={hoursToTimeValue(committedHours)}
            disabled={saving}
            aria-label="Riferimento del sonno. Tocca per modificare"
            title="Tocca per modificare"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => proposeHours(timeValueToHours(event.target.value))}
            onBlur={(event) => {
              if (confirmOpen) return;
              proposeHours(timeValueToHours(event.target.value));
            }}
          />
        </label>
        <p className="m-0 mt-2 text-[13px] text-slate-400">
          {sleepReference?.sourceLabel || 'Riferimento consigliato'}
        </p>
      </section>

      <SaluteSleepGhostChart
        sleepData={sleepTrend?.sleepData || []}
        ghostHours={effective}
        avg14Days={avg14}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <div className={`rounded-2xl px-3.5 py-3 ${SALUTE_FROST.nested}`}>
          <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-cyan-300/85">
            Media 14 giorni
          </p>
          <p className="m-0 mt-1.5 text-[17px] font-semibold tabular-nums text-cyan-100">
            {avg14 != null ? formatSleepClock(avg14) : '—'}
          </p>
        </div>
        <div className={`rounded-2xl border px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${semaphore.wrap}`}>
          <p className={`m-0 text-[10px] font-medium uppercase tracking-[0.12em] ${semaphore.text}`}>
            Confronto
          </p>
          <p className={`m-0 mt-1.5 text-[15px] font-semibold leading-snug ${semaphore.text}`}>
            {formatVsReferenceClock(delta) || 'Dati non sufficienti'}
          </p>
        </div>
      </div>

      <Expandable title="Approfondimenti">
        <div className="grid grid-cols-2 gap-2.5">
          <div className={`rounded-2xl px-3.5 py-3 ${SALUTE_FROST.nested}`}>
            <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
              Punteggio longevità
            </p>
            <p className="m-0 mt-1.5 text-[17px] font-semibold tabular-nums text-slate-50">
              {Number.isFinite(Number(pillar?.score))
                ? `${Math.round(Number(pillar.score))} / ${pillar.max}`
                : `— / ${pillar?.max ?? 25}`}
            </p>
          </div>
          <div className={`rounded-2xl px-3.5 py-3 ${SALUTE_FROST.nested}`}>
            <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
              Notti in finestra
            </p>
            <p className="m-0 mt-1.5 text-[17px] font-semibold tabular-nums text-slate-50">
              {String(sampleDays || 0)}
            </p>
          </div>
        </div>
        <p className="m-0 text-[12px] leading-relaxed text-slate-400">
          Media 14 giorni: {avg14 != null ? formatSleepHoursShort(avg14) : 'non disponibile'}.
          Il Longevity Score continua a usare il target fisso del motore, non questo riferimento.
        </p>
        <div className="rounded-2xl border border-amber-400/15 bg-amber-950/20 p-3.5">
          <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-200">
            Widget isolato · sleep_logs
          </p>
          <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-amber-100/80">
            La registrazione qui usa ancora `sleep_logs`. Lo score Longevità legge il diario
            in `tracker_data`. Non è ancora la migrazione definitiva.
          </p>
        </div>
        <SleepTrackerWidget
          entry={sleepLog?.entry}
          hydrated={sleepLog?.hydrated}
          saving={sleepLog?.saving}
          errorMessage={sleepLog?.errorMessage}
          onSave={sleepLog?.save}
        />
      </Expandable>

      <SleepReferenceConfirmDialog
        open={confirmOpen}
        nextLabel={formatSleepClock(pendingHours)}
        saving={saving}
        onCancel={handleCancelConfirm}
        onSave={handleSaveConfirm}
      />
    </div>
  );
}
