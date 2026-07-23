import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { onValue, ref, set, update } from 'firebase/database';
import WorkoutView from './WorkoutView';
import useWaveTimePrefs from '../../hooks/useWaveTimePrefs';
import {
  WAVE_TIME_TAG_OPTIONS,
  inferTimeTagFromExact,
  normalizeExactTime,
} from '../../features/training/waveTimePrefs';
import {
  MACRO_GOAL_OPTIONS,
  addCalendarDaysIso,
  computeWaveCycleBudget,
  createDefaultWaveDraft,
  createRestWaveEntry,
  formatWaveDateLabel,
  plannerInitialDataFromWaveEntry,
  sanitizeTrainingWave,
  shiftWaveScheduleForward,
  trainingWaveToFirebasePayload,
  waveEntryFromPlannerAction,
} from '../../features/training/waveSchema';

/**
 * Drawer: onda ancorata a date reali + Scheda Attività nativa + orario ibrido + Trasla.
 */
export default function WavePlannerView({
  onBack,
  db,
  userUid,
  initialWave = null,
  initialMacroGoal = 'mantenimento',
  getTodayString,
  onSaved,
}) {
  const todayIso =
    typeof getTodayString === 'function'
      ? getTodayString()
      : new Date().toISOString().slice(0, 10);

  const { getTimeForTag, rememberTagTime } = useWaveTimePrefs({ db, userUid });

  const [remoteWave, setRemoteWave] = useState(() => sanitizeTrainingWave(initialWave));

  useEffect(() => {
    const fromProp = sanitizeTrainingWave(initialWave);
    if (fromProp) {
      setRemoteWave(fromProp);
      return undefined;
    }
    if (!db || !userUid) return undefined;
    const unsub = onValue(ref(db, `users/${userUid}/current_wave`), (snap) => {
      setRemoteWave(snap.exists() ? sanitizeTrainingWave(snap.val()) : null);
    });
    return () => unsub();
  }, [db, userUid, initialWave]);

  const seed = useMemo(() => {
    if (remoteWave) return remoteWave;
    return createDefaultWaveDraft({
      startDate: todayIso,
      macroGoal: initialMacroGoal || 'mantenimento',
    });
  }, [remoteWave, initialMacroGoal, todayIso]);

  const [macroGoal, setMacroGoal] = useState(seed.macroGoal || initialMacroGoal || 'mantenimento');
  const [schedule, setSchedule] = useState(() => ({ ...(seed.schedule || {}) }));
  const [saving, setSaving] = useState(false);
  const [shifting, setShifting] = useState(false);
  const [error, setError] = useState('');
  const [savedOk, setSavedOk] = useState(false);
  const [editingDate, setEditingDate] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!remoteWave) return;
    setMacroGoal(remoteWave.macroGoal || 'mantenimento');
    setSchedule({ ...(remoteWave.schedule || {}) });
  }, [remoteWave]);

  const sortedDates = useMemo(() => Object.keys(schedule).sort(), [schedule]);
  const cycleBudget = useMemo(() => computeWaveCycleBudget(schedule), [schedule]);

  const openScheda = (dateIso) => {
    setEditingDate(dateIso);
    setSavedOk(false);
  };

  const closeScheda = () => setEditingDate(null);

  const handleSchedaSave = (action) => {
    if (!editingDate) return;
    const prev = schedule[editingDate];
    const entry = waveEntryFromPlannerAction(action, editingDate);
    const exactFromAction = normalizeExactTime(action?.startTime);
    const exactTime =
      exactFromAction
      || normalizeExactTime(prev?.exactTime)
      || getTimeForTag(prev?.timeTag || 'sera');
    const timeTag = exactFromAction
      ? inferTimeTagFromExact(exactFromAction)
      : (prev?.timeTag || inferTimeTagFromExact(exactTime));

    setSchedule((prevMap) => ({
      ...prevMap,
      [editingDate]: {
        ...entry,
        exactTime: entry.activityId === 'riposo' ? null : exactTime,
        timeTag: entry.activityId === 'riposo' ? null : timeTag,
        startTime: entry.activityId === 'riposo' ? null : exactTime,
      },
    }));
    if (entry.activityId !== 'riposo' && timeTag && exactTime) {
      rememberTagTime(timeTag, exactTime);
    }
    setEditingDate(null);
    setSavedOk(false);
  };

  const setDayTimeTag = (dateIso, tag) => {
    const exactTime = getTimeForTag(tag);
    setSchedule((prev) => {
      const entry = prev[dateIso];
      if (!entry || entry.activityId === 'riposo' || entry.type === 'rest') return prev;
      return {
        ...prev,
        [dateIso]: {
          ...entry,
          timeTag: tag,
          exactTime,
          startTime: exactTime,
        },
      };
    });
    setSavedOk(false);
  };

  const setDayExactTime = (dateIso, rawTime) => {
    const exactTime = normalizeExactTime(rawTime);
    if (!exactTime) return;
    setSchedule((prev) => {
      const entry = prev[dateIso];
      if (!entry || entry.activityId === 'riposo' || entry.type === 'rest') return prev;
      const timeTag = entry.timeTag || inferTimeTagFromExact(exactTime);
      return {
        ...prev,
        [dateIso]: {
          ...entry,
          timeTag,
          exactTime,
          startTime: exactTime,
        },
      };
    });
    const entry = schedule[dateIso];
    const tag = entry?.timeTag || inferTimeTagFromExact(exactTime);
    rememberTagTime(tag, exactTime);
    setSavedOk(false);
  };

  const addDay = () => {
    setSchedule((prev) => {
      const dates = Object.keys(prev).sort();
      const nextDate = dates.length
        ? addCalendarDaysIso(dates[dates.length - 1], 1)
        : todayIso;
      if (!nextDate || prev[nextDate]) return prev;
      return {
        ...prev,
        [nextDate]: createRestWaveEntry(nextDate),
      };
    });
    setSavedOk(false);
  };

  const removeDay = (dateIso) => {
    setSchedule((prev) => {
      const next = { ...prev };
      delete next[dateIso];
      return next;
    });
    setSavedOk(false);
  };

  const persistWave = async (nextSchedule, nextMacroGoal = macroGoal) => {
    if (!db || !userUid) {
      setError('Utente non autenticato: impossibile salvare l’onda.');
      return null;
    }
    const dates = Object.keys(nextSchedule || {}).sort();
    if (!dates.length) {
      setError('Aggiungi almeno un giorno al calendario.');
      return null;
    }

    const payload = trainingWaveToFirebasePayload({
      waveId: seed.waveId || `wave_${Date.now()}`,
      name: 'Onda attiva',
      macroGoal: nextMacroGoal,
      startDate: dates[0],
      isActive: true,
      schedule: nextSchedule,
    });

    if (!payload) {
      setError('Struttura onda non valida.');
      return null;
    }

    await set(ref(db, `users/${userUid}/current_wave`), payload);
    await update(ref(db, `users/${userUid}/profile_targets`), {
      'profile/macroGoal': payload.macroGoal,
    });
    return sanitizeTrainingWave(payload);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await persistWave(schedule, macroGoal);
      if (!saved) return;
      setSavedOk(true);
      if (typeof onSaved === 'function') {
        onSaved({ wave: saved, macroGoal: saved.macroGoal });
      }
    } catch (err) {
      setError(String(err?.message || err || 'Salvataggio fallito'));
    } finally {
      setSaving(false);
    }
  };

  const handleTrasla = async () => {
    if (!schedule[todayIso] && sortedDates.every((d) => d < todayIso)) {
      setError('Nessuna attività da oggi in poi da traslare.');
      return;
    }
    const result = shiftWaveScheduleForward(schedule, todayIso);
    if (!result.success) {
      setError(result.reason || 'Traslazione non riuscita.');
      return;
    }
    setShifting(true);
    setError('');
    try {
      setSchedule(result.schedule);
      const saved = await persistWave(result.schedule, macroGoal);
      if (!saved) return;
      setSavedOk(true);
    } catch (err) {
      setError(String(err?.message || err || 'Traslazione fallita'));
    } finally {
      setShifting(false);
    }
  };

  const editingEntry = editingDate ? schedule[editingDate] : null;
  const schedaPortal =
    editingDate && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[100020] flex flex-col bg-[#0f0f0f]">
            <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden">
              <WorkoutView
                isPlannerMode
                initialData={plannerInitialDataFromWaveEntry(editingEntry)}
                onClose={closeScheda}
                onSaveAction={handleSchedaSave}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="view-animate flex h-[100dvh] min-h-0 flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between px-4 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="border-none bg-transparent text-[0.8rem] tracking-wider text-zinc-500"
        >
          &lt; INDIETRO
        </button>
        <h2 className="m-0 text-[0.8rem] tracking-[2px] text-cyan-400">PROGRAMMA ONDA</h2>
        <div className="w-[70px]" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[150px] [-webkit-overflow-scrolling:touch]">
        <section className="mb-4 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/50 via-slate-900/60 to-orange-950/40 px-3 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-400/90">
            Bilancio Energetico dell&apos;Onda
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold tabular-nums text-cyan-50">{cycleBudget.cycleDays}</p>
              <p className="text-[10px] text-slate-400">giorni</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-orange-200">
                {cycleBudget.totalPlannedBurnKcal}
              </p>
              <p className="text-[10px] text-slate-400">kcal totali</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-emerald-300">
                {cycleBudget.avgDailyBurnKcal}
              </p>
              <p className="text-[10px] text-slate-400">media / giorno</p>
            </div>
          </div>
        </section>

        <section className="mb-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-400/80">
            Obiettivo
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MACRO_GOAL_OPTIONS.map((g) => {
              const active = macroGoal === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setMacroGoal(g.id);
                    setSavedOk(false);
                  }}
                  className={[
                    'rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition',
                    active
                      ? 'border-cyan-400/60 bg-cyan-950/70 text-cyan-100'
                      : 'border-zinc-700 bg-zinc-950 text-zinc-400',
                  ].join(' ')}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-4">
          <button
            type="button"
            onClick={handleTrasla}
            disabled={shifting}
            className="w-full rounded-xl border border-orange-500/40 bg-orange-950/50 py-3 text-sm font-bold text-orange-200 transition hover:bg-orange-950/70 disabled:opacity-60"
          >
            {shifting ? 'TRASLAZIONE…' : '⏩ Posticipa oggi (Trasla)'}
          </button>
          <p className="mt-1.5 text-[10px] text-slate-500">
            Sposta l&apos;attività di oggi a domani e scala a cascata tutto il calendario.
          </p>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-orange-300/90">
              Calendario · {sortedDates.length} giorni
            </p>
            <button
              type="button"
              onClick={addDay}
              className="rounded-lg border border-orange-400/40 bg-orange-600/80 px-2.5 py-1.5 text-[11px] font-bold text-white"
            >
              + Giorno
            </button>
          </div>

          <div className="space-y-2.5">
            {sortedDates.map((dateIso) => {
              const entry = schedule[dateIso];
              const isToday = dateIso === todayIso;
              const hasActivity = Boolean(entry?.activityId);
              const isRest = entry?.activityId === 'riposo' || entry?.type === 'rest';
              return (
                <div
                  key={dateIso}
                  className={[
                    'rounded-xl border px-3 py-2.5',
                    isToday
                      ? 'border-cyan-400/50 bg-cyan-950/30'
                      : 'border-white/10 bg-black/30',
                  ].join(' ')}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="m-0 text-xs font-bold text-orange-200">
                        {formatWaveDateLabel(dateIso)}
                        {isToday ? ' · oggi' : ''}
                      </p>
                      <p className="m-0 font-mono text-[10px] text-slate-500">{dateIso}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDay(dateIso)}
                      disabled={sortedDates.length <= 1}
                      className="shrink-0 px-1 text-sm text-rose-300 disabled:opacity-30"
                      aria-label={`Rimuovi ${dateIso}`}
                    >
                      ✕
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => openScheda(dateIso)}
                    className="w-full rounded-xl border border-dashed border-cyan-500/40 bg-slate-950/80 px-3 py-3 text-left transition hover:border-cyan-400/70 hover:bg-slate-900"
                  >
                    {hasActivity && !isRest ? (
                      <>
                        <p className="m-0 text-sm font-semibold text-cyan-50">{entry.title}</p>
                        <p className="mt-1 m-0 text-[10px] text-slate-400">
                          ID:{' '}
                          <span className="font-mono text-cyan-400/90">{entry.activityId}</span>
                          {' · '}
                          {Math.round(Number(entry.expectedVolume) || 0)} kcal
                        </p>
                        <p className="mt-1 m-0 text-[10px] text-cyan-500/80">
                          Tocca per modificare nella Scheda Attività
                        </p>
                      </>
                    ) : isRest ? (
                      <>
                        <p className="m-0 text-sm font-semibold text-zinc-300">Riposo</p>
                        <p className="mt-1 m-0 text-[10px] text-cyan-500/80">
                          Tocca per scegliere un&apos;attività
                        </p>
                      </>
                    ) : (
                      <p className="m-0 text-sm font-semibold text-cyan-200">
                        Seleziona dalla Scheda Attività
                      </p>
                    )}
                  </button>

                  {!isRest && hasActivity ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block min-w-0">
                        <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
                          Fascia
                        </span>
                        <select
                          value={entry.timeTag || 'sera'}
                          onChange={(e) => setDayTimeTag(dateIso, e.target.value)}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
                          aria-label={`Fascia oraria ${dateIso}`}
                        >
                          {WAVE_TIME_TAG_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block min-w-0">
                        <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
                          Ora esatta
                        </span>
                        <input
                          type="time"
                          value={entry.exactTime || getTimeForTag(entry.timeTag || 'sera')}
                          onChange={(e) => setDayExactTime(dateIso, e.target.value)}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm tabular-nums text-cyan-100"
                          aria-label={`Ora esatta ${dateIso}`}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        ) : null}
      </div>

      <div
        className="sticky bottom-0 z-10 shrink-0 border-t border-cyan-500/25 bg-[#0f0f0f]/95 px-4 pt-3 backdrop-blur-md"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={[
            'w-full rounded-[15px] px-[18px] py-[18px] text-[0.9rem] font-bold tracking-[2px] transition',
            savedOk
              ? 'border border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
              : 'border-none bg-[#00bcd4] text-black shadow-[0_0_20px_rgba(0,188,212,0.35)] enabled:hover:brightness-110 disabled:opacity-60',
          ].join(' ')}
        >
          {saving ? 'SALVATAGGIO…' : savedOk ? 'ONDA ATTIVA ✓' : 'SALVA E ATTIVA ONDA'}
        </button>
      </div>

      {schedaPortal}
    </div>
  );
}
