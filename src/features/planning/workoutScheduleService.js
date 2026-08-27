import {
  addLocalCalendarDaysIso,
  computeMesocycleWeek,
  getLocalTodayIso,
  getMondayOfLocalWeek,
  getTodaysTrainingBlockSession,
  hasConfirmedToday,
  normalizeIsoDate,
  sanitizeTrainingBlock,
} from './trainingBlockSchema';

/**
 * @param {import('./trainingBlockSchema').TrainingBlock} block
 * @returns {string}
 */
function resolveBlockStartIso(block) {
  const sorted = (block.days || [])
    .map((d) => d.scheduledDate)
    .filter(Boolean)
    .sort();
  return sorted[0] || block.anchorDate || getLocalTodayIso();
}

/**
 * @param {import('./trainingBlockSchema').TrainingBlockDay[]} days
 * @returns {import('./trainingBlockSchema').TrainingBlockDay[]}
 */
function sortDaysByDate(days) {
  return [...days].sort((a, b) => {
    const cmp = String(a.scheduledDate).localeCompare(String(b.scheduledDate));
    if (cmp !== 0) return cmp;
    return a.dayIndex - b.dayIndex;
  });
}

/**
 * Cascade shift +1g: oggi diventa riposo; sessioni con scheduledDate >= oggi slittano avanti.
 * @param {import('./trainingBlockSchema').TrainingBlock | null | undefined} block
 * @param {string} todayIso
 * @returns {import('./trainingBlockSchema').TrainingBlock}
 */
export function postponeWorkoutCascade(block, todayIso) {
  const today = String(todayIso || getLocalTodayIso()).slice(0, 10);
  const safe = sanitizeTrainingBlock(block, today);
  if (!safe?.isActive) throw new Error('Nessun blocco attivo.');

  const session = getTodaysTrainingBlockSession(safe, today);
  if (!session) throw new Error('Nessuna sessione dovuta oggi da rinviare.');
  if (hasConfirmedToday(safe, today)) {
    throw new Error('Sessione già confermata oggi.');
  }

  const blockStart = resolveBlockStartIso(safe);
  const nextDays = safe.days.map((d) => ({ ...d }));

  const shiftIndices = nextDays
    .map((d, index) => ({ d, index }))
    .filter(({ d }) => d.type !== 'rest' && String(d.scheduledDate) >= today)
    .sort((a, b) => String(b.d.scheduledDate).localeCompare(String(a.d.scheduledDate)));

  for (const { d, index } of shiftIndices) {
    const shifted = addLocalCalendarDaysIso(d.scheduledDate, 1);
    if (!shifted) throw new Error('Errore calendario durante il rinvio.');
    nextDays[index] = {
      ...d,
      scheduledDate: shifted,
      mesocycleWeek: computeMesocycleWeek(shifted, blockStart),
    };
  }

  const now = Date.now();
  return {
    ...safe,
    days: sortDaysByDate(nextDays),
    updatedAt: now,
    lastAction: { kind: 'postpone', at: now, date: today },
  };
}

/**
 * @param {import('./trainingBlockSchema').TrainingBlock | null | undefined} block
 * @param {number} sourceDayIndex
 * @param {string} targetDateIso
 * @param {string} [todayIso]
 * @returns {import('./trainingBlockSchema').TrainingBlock}
 */
export function moveWorkoutSession(block, sourceDayIndex, targetDateIso, todayIso) {
  const today = String(todayIso || getLocalTodayIso()).slice(0, 10);
  const targetDate = normalizeIsoDate(targetDateIso);
  if (!targetDate) throw new Error('Data destinazione non valida.');

  const safe = sanitizeTrainingBlock(block, today);
  if (!safe?.isActive) throw new Error('Nessun blocco attivo.');

  const srcIdx = Math.floor(Number(sourceDayIndex));
  const source = safe.days.find((d) => d.dayIndex === srcIdx);
  if (!source) throw new Error('Sessione origine non trovata.');
  if (source.type === 'rest') throw new Error('Impossibile spostare un giorno di riposo.');

  const occupied = safe.days.find(
    (d) => d.type !== 'rest'
      && d.scheduledDate === targetDate
      && d.dayIndex !== srcIdx,
  );
  if (occupied) {
    throw new Error('Giorno occupato — scegli un giorno libero o usa Scambia.');
  }

  const blockStart = resolveBlockStartIso(safe);
  const nextDays = safe.days.map((d) => (
    d.dayIndex === srcIdx
      ? {
        ...d,
        scheduledDate: targetDate,
        mesocycleWeek: computeMesocycleWeek(targetDate, blockStart),
      }
      : d
  ));

  const now = Date.now();
  return {
    ...safe,
    days: sortDaysByDate(nextDays),
    updatedAt: now,
    lastAction: { kind: 'catch_up', at: now, date: targetDate },
  };
}

/**
 * @param {import('./trainingBlockSchema').TrainingBlock | null | undefined} block
 * @param {number} sourceDayIndex
 * @param {number} targetDayIndex
 * @param {string} [todayIso]
 * @returns {import('./trainingBlockSchema').TrainingBlock}
 */
export function swapWorkoutSessions(block, sourceDayIndex, targetDayIndex, todayIso) {
  const today = String(todayIso || getLocalTodayIso()).slice(0, 10);
  const safe = sanitizeTrainingBlock(block, today);
  if (!safe?.isActive) throw new Error('Nessun blocco attivo.');

  const srcIdx = Math.floor(Number(sourceDayIndex));
  const tgtIdx = Math.floor(Number(targetDayIndex));
  if (srcIdx === tgtIdx) throw new Error('Seleziona due sessioni diverse.');

  const source = safe.days.find((d) => d.dayIndex === srcIdx);
  const target = safe.days.find((d) => d.dayIndex === tgtIdx);
  if (!source || source.type === 'rest') throw new Error('Sessione origine non valida.');
  if (!target || target.type === 'rest') throw new Error('Sessione destinazione non valida.');

  const blockStart = resolveBlockStartIso(safe);
  const sourceDate = source.scheduledDate;
  const targetDate = target.scheduledDate;

  const nextDays = safe.days.map((d) => {
    if (d.dayIndex === srcIdx) {
      return {
        ...d,
        scheduledDate: targetDate,
        mesocycleWeek: computeMesocycleWeek(targetDate, blockStart),
      };
    }
    if (d.dayIndex === tgtIdx) {
      return {
        ...d,
        scheduledDate: sourceDate,
        mesocycleWeek: computeMesocycleWeek(sourceDate, blockStart),
      };
    }
    return d;
  });

  const now = Date.now();
  return {
    ...safe,
    days: sortDaysByDate(nextDays),
    updatedAt: now,
    lastAction: { kind: 'catch_up', at: now, date: today },
  };
}

/**
 * Date libere (senza sessione) nel range calendario del blocco.
 * @param {import('./trainingBlockSchema').TrainingBlock | null | undefined} block
 * @param {string} [todayIso]
 * @param {string | null} [excludeDateIso] — es. data origine (già libera dopo move)
 * @returns {string[]}
 */
export function listOpenWorkoutDates(block, todayIso, excludeDateIso = null) {
  const today = String(todayIso || getLocalTodayIso()).slice(0, 10);
  const safe = sanitizeTrainingBlock(block, today);
  if (!safe) return [];

  const occupied = new Set(
    safe.days
      .filter((d) => d.type !== 'rest')
      .map((d) => d.scheduledDate),
  );

  const sorted = safe.days.map((d) => d.scheduledDate).filter(Boolean).sort();
  const rangeStart = sorted[0] || today;
  const rangeEnd = sorted[sorted.length - 1] || today;
  const startMonday = getMondayOfLocalWeek(rangeStart);
  const endMonday = getMondayOfLocalWeek(rangeEnd);

  /** @type {string[]} */
  const open = [];
  let monday = startMonday;
  let guard = 0;
  while (monday && monday <= endMonday && guard < 52) {
    guard += 1;
    for (let i = 0; i < 7; i += 1) {
      const date = addLocalCalendarDaysIso(monday, i);
      if (!date) continue;
      if (date < rangeStart || date > rangeEnd) continue;
      if (occupied.has(date)) continue;
      if (excludeDateIso && date === excludeDateIso) continue;
      open.push(date);
    }
    monday = addLocalCalendarDaysIso(monday, 7);
  }
  return open.sort();
}
