import { useState } from 'react';
import SleepTrackerWidget from '../../trendHub/components/SleepTrackerWidget';
import {
  formatSleepClock,
  formatSleepHoursShort,
  formatVsReferenceClock,
  SLEEP_REFERENCE_MAX_H,
  SLEEP_REFERENCE_MIN_H,
  SLEEP_REFERENCE_STEP_H,
  sleepReferenceStory,
  snapSleepReferenceHours,
} from '../utils/sleepReference';
import SaluteSleepGhostChart from './SaluteSleepGhostChart';
import { sleepSemaphoreFromDelta } from '../utils/saluteVisualTheme';

function Expandable({ title, children }) {
  return (
    <details className="rounded-2xl border border-white/[0.08] bg-[#0E1520]/96 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <summary className="cursor-pointer list-none px-4 py-3.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400 marker:content-none [&::-webkit-details-marker]:hidden">
        {title}
      </summary>
      <div className="space-y-3 border-t border-white/[0.06] px-4 py-3.5">
        {children}
      </div>
    </details>
  );
}

function ReferenceEditor({
  draftHours,
  saving,
  onDraftChange,
  onSavePersonal,
  onUseRecommended,
  onClose,
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0E1520]/96 px-3.5 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <p className="m-0 text-[13px] leading-relaxed text-slate-200">
        Quanto vuoi usare come riferimento?
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onDraftChange(draftHours - SLEEP_REFERENCE_STEP_H)}
          disabled={draftHours <= SLEEP_REFERENCE_MIN_H}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-violet-400/30 text-[18px] text-violet-100 disabled:opacity-35"
          aria-label="Diminuisci riferimento"
        >
          −
        </button>
        <p className="m-0 min-w-[5.5rem] text-center text-[22px] font-semibold tabular-nums text-violet-100">
          {formatSleepClock(draftHours)}
        </p>
        <button
          type="button"
          onClick={() => onDraftChange(draftHours + SLEEP_REFERENCE_STEP_H)}
          disabled={draftHours >= SLEEP_REFERENCE_MAX_H}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-violet-400/30 text-[18px] text-violet-100 disabled:opacity-35"
          aria-label="Aumenta riferimento"
        >
          +
        </button>
      </div>
      <button
        type="button"
        onClick={onUseRecommended}
        disabled={saving}
        className="mt-3 min-h-11 w-full rounded-2xl border border-white/10 px-3 text-[13px] font-medium text-slate-200"
      >
        Usa 7h
      </button>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 flex-1 rounded-2xl border border-white/10 px-3 text-[13px] text-slate-300"
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={onSavePersonal}
          disabled={saving}
          className="min-h-11 flex-1 rounded-2xl border border-violet-400/35 bg-[#1C1830]/95 px-3 text-[13px] font-medium text-violet-100 shadow-[0_0_10px_rgba(167,139,250,0.10)]"
        >
          Salva
        </button>
      </div>
    </div>
  );
}

export default function SaluteSleepDetail({
  pillar,
  sleepTrend,
  sleepLog,
  sleepReference,
} = {}) {
  const [editing, setEditing] = useState(false);
  const [draftHours, setDraftHours] = useState(null);
  const editorHours = draftHours ?? sleepReference?.effectiveHours ?? 7;

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

      <section className="rounded-[22px] border border-white/[0.10] bg-[#0E1520]/96 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-violet-300/85">
          Il tuo riferimento
        </p>
        <p className="m-0 mt-1.5 text-[28px] font-semibold tabular-nums leading-none text-violet-100">
          {formatSleepClock(effective)}
        </p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="m-0 text-[13px] text-slate-400">
            {sleepReference?.sourceLabel || 'Riferimento consigliato'}
          </p>
          <button
            type="button"
            onClick={() => {
              setDraftHours(sleepReference?.effectiveHours ?? 7);
              setEditing((v) => !v);
            }}
            className="min-h-10 rounded-full border border-violet-400/35 px-3 text-[12px] font-medium text-violet-100"
          >
            {editing ? 'Chiudi' : 'Modifica'}
          </button>
        </div>
        {editing ? (
          <div className="mt-3">
            <ReferenceEditor
              draftHours={editorHours}
              saving={sleepReference?.saving}
              onDraftChange={(value) => {
                const next = snapSleepReferenceHours(value);
                if (next != null) setDraftHours(next);
              }}
              onSavePersonal={async () => {
                const ok = await sleepReference?.savePersonal?.(editorHours);
                if (ok) {
                  setDraftHours(null);
                  setEditing(false);
                }
              }}
              onUseRecommended={async () => {
                const ok = await sleepReference?.clearPersonal?.();
                if (ok) {
                  setDraftHours(null);
                  setEditing(false);
                }
              }}
              onClose={() => {
                setDraftHours(null);
                setEditing(false);
              }}
            />
          </div>
        ) : null}
      </section>

      <SaluteSleepGhostChart
        sleepData={sleepTrend?.sleepData || []}
        ghostHours={effective}
        avg14Days={avg14}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1520]/96 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
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
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1520]/96 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
              Punteggio longevità
            </p>
            <p className="m-0 mt-1.5 text-[17px] font-semibold tabular-nums text-slate-50">
              {Number.isFinite(Number(pillar?.score))
                ? `${Math.round(Number(pillar.score))} / ${pillar.max}`
                : `— / ${pillar?.max ?? 25}`}
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1520]/96 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
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
    </div>
  );
}
