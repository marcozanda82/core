import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { sanitizeTrainingWave } from '../features/training/waveSchema';

/** @deprecated Solo template/demo; l'hook usa Firebase `current_wave`. */
export const MOCK_WAVE = {
  waveId: 'ipertrofia_fase_1',
  name: 'Onda Forza / Ipertrofia 8 Giorni',
  startDate: '2026-07-20',
  cycleLength: 8,
  isActive: true,
  schedule: {},
  days: [],
};

const NEUTRAL_PROFILE = {
  dayIndex: 0,
  title: 'Fuori ciclo',
  type: 'rest',
  tdeeMultiplier: 1.0,
  expectedVolume: 0,
  activityId: null,
};

const INACTIVE_WAVE = {
  waveId: null,
  name: 'Nessuna onda attiva',
  startDate: '',
  cycleLength: 1,
  isActive: false,
  schedule: {},
  days: [],
  macroGoal: null,
};

function parseIsoDateUtc(iso) {
  const raw = String(iso || '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function toIsoDateUtc(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffCalendarDaysUtc(fromIso, toIso) {
  const from = parseIsoDateUtc(fromIso);
  const to = parseIsoDateUtc(toIso);
  if (!from || !to) return null;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function resolveReferenceIso(referenceDate) {
  if (referenceDate == null || referenceDate === '') {
    return toIsoDateUtc(new Date());
  }
  if (referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())) {
    return toIsoDateUtc(
      new Date(Date.UTC(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate(),
      )),
    );
  }
  const parsed = parseIsoDateUtc(referenceDate);
  if (parsed) return toIsoDateUtc(parsed);
  return toIsoDateUtc(new Date());
}

/**
 * Giorno corrente: lookup diretto su `schedule[YYYY-MM-DD]` (calendario reale).
 */
export function computeTrainingWaveDay(wave, referenceDate) {
  const safeWave = sanitizeTrainingWave(wave) || (wave && typeof wave === 'object' ? wave : null);
  if (!safeWave || safeWave.isActive === false) {
    return {
      wave: safeWave || INACTIVE_WAVE,
      currentDayIndex: 0,
      todayProfile: { ...NEUTRAL_PROFILE },
      tdeeMultiplier: 1.0,
      daysDifference: null,
      isBeforeStart: true,
      macroGoal: safeWave?.macroGoal || null,
      todayDate: resolveReferenceIso(referenceDate),
    };
  }

  const refIso = resolveReferenceIso(referenceDate);
  const schedule = safeWave.schedule && typeof safeWave.schedule === 'object'
    ? safeWave.schedule
    : {};
  const dates = Object.keys(schedule).sort();
  const startIso = String(safeWave.startDate || dates[0] || '').trim().slice(0, 10);
  const daysDifference = diffCalendarDaysUtc(startIso, refIso);

  const todayEntry = schedule[refIso] || null;
  if (!todayEntry) {
    const isBefore = daysDifference != null && daysDifference < 0;
    return {
      wave: safeWave,
      currentDayIndex: 0,
      todayProfile: { ...NEUTRAL_PROFILE },
      tdeeMultiplier: 1.0,
      daysDifference,
      isBeforeStart: isBefore || !todayEntry,
      macroGoal: safeWave.macroGoal || null,
      todayDate: refIso,
    };
  }

  const dayIndex = dates.indexOf(refIso) + 1;
  const todayProfile = {
    dayIndex: dayIndex > 0 ? dayIndex : 1,
    ...todayEntry,
    date: refIso,
  };
  const tdeeMultiplier = Number(todayProfile.tdeeMultiplier);

  return {
    wave: safeWave,
    currentDayIndex: todayProfile.dayIndex,
    todayProfile,
    tdeeMultiplier: Number.isFinite(tdeeMultiplier) ? tdeeMultiplier : 1.0,
    daysDifference,
    isBeforeStart: false,
    macroGoal: safeWave.macroGoal || null,
    todayDate: refIso,
  };
}

/**
 * Hook: giorno corrente da `users/{uid}/current_wave` (schedule per data).
 */
export default function useTrainingWave(options = {}) {
  const {
    db = null,
    userUid = null,
    referenceDate,
    waveOverride = undefined,
  } = options && typeof options === 'object' && !(options instanceof Date)
    ? options
    : { referenceDate: options };

  const [remoteWave, setRemoteWave] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(db && userUid && waveOverride === undefined));

  useEffect(() => {
    if (waveOverride !== undefined) {
      setRemoteWave(sanitizeTrainingWave(waveOverride));
      setIsLoading(false);
      return undefined;
    }
    if (!db || !userUid) {
      setRemoteWave(null);
      setIsLoading(false);
      return undefined;
    }

    setIsLoading(true);
    const waveRef = ref(db, `users/${userUid}/current_wave`);
    const unsub = onValue(
      waveRef,
      (snap) => {
        setRemoteWave(snap.exists() ? sanitizeTrainingWave(snap.val()) : null);
        setIsLoading(false);
      },
      () => {
        setRemoteWave(null);
        setIsLoading(false);
      },
    );
    return () => unsub();
  }, [db, userUid, waveOverride]);

  const waveForCompute = waveOverride !== undefined
    ? sanitizeTrainingWave(waveOverride)
    : remoteWave;

  const computed = useMemo(
    () => computeTrainingWaveDay(waveForCompute, referenceDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      waveForCompute,
      referenceDate instanceof Date ? referenceDate.getTime() : String(referenceDate ?? ''),
    ],
  );

  return {
    ...computed,
    isLoading,
  };
}
