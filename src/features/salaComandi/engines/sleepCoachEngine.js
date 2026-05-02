import { getTodayString } from '../../../coreEngine';

const TIMEFRAME_DAY_WINDOW = {
  '1d': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

function compassHistoryForEngine(days) {
  const today = getTodayString();
  return (Array.isArray(days) ? days : []).filter((e) => e?.date !== today);
}

function getWindowSlice(dailyHistory, timeframe) {
  const tf = timeframe != null ? String(timeframe) : '7d';
  const windowDays = TIMEFRAME_DAY_WINDOW[tf] ?? TIMEFRAME_DAY_WINDOW['7d'];
  const safe = compassHistoryForEngine(dailyHistory);
  if (!safe.length) return [];
  return safe.length <= windowDays ? safe : safe.slice(-windowDays);
}

function arithmeticMean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i += 1) s += arr[i];
  return s / arr.length;
}

function stddevSample(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const m = arithmeticMean(arr);
  let v = 0;
  for (let i = 0; i < n; i += 1) {
    const d = arr[i] - m;
    v += d * d;
  }
  return Math.sqrt(v / (n - 1));
}

function lastLoggedSleepHours(slice) {
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    const h = slice[i]?.sleepHours;
    if (h == null) continue;
    const n = Number(h);
    if (Number.isFinite(n) && n > 0) return Math.min(12, n);
  }
  return null;
}

function sleepHoursSeriesFromSlice(slice) {
  return slice.map((d) => {
    if (d?.sleepHours == null) return null;
    const h = Number(d.sleepHours);
    if (!Number.isFinite(h) || h <= 0) return null;
    return Math.min(12, h);
  });
}

/**
 * @param {number[]} knownOnly
 */
function isSleepIrregular(knownOnly) {
  if (knownOnly.length < 3) return false;
  return stddevSample(knownOnly) >= 1.15;
}

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < arr.length; i += 1) {
    const s = String(arr[i] ?? '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * @param {{
 *   sleepData?: {
 *     avgHours?: number | null,
 *     lastNightHours?: number | null,
 *     hoursByDay?: (number | null)[] | null,
 *     sleepPenalty?: number | null,
 *   } | null,
 *   recentHabits?: { highTrainingLoad?: boolean } | null,
 *   currentTime?: Date | string | number | null,
 * }} param0
 * @returns {{ priority: 'critical' | 'standard', title: string, message: string, actions: string[] } | null}
 */
export function buildSleepCoachPlan({
  sleepData = null,
  recentHabits = null,
  currentTime: _currentTime = null,
} = {}) {
  const sd = sleepData && typeof sleepData === 'object' ? sleepData : {};
  const avgHours = Number(sd.avgHours);
  const lastNightHours = sd.lastNightHours != null ? Number(sd.lastNightHours) : null;
  const penalty = Number(sd.sleepPenalty) || 0;

  const rawSeries =
    Array.isArray(sd.hoursByDay) && sd.hoursByDay.length > 0
      ? sd.hoursByDay.map((x) => {
          if (x == null) return null;
          const n = Number(x);
          if (!Number.isFinite(n) || n <= 0) return null;
          return Math.min(12, n);
        })
      : [];

  const knownHours = rawSeries.filter((h) => h != null).map(Number);
  const avgKnown = knownHours.length >= 2 ? arithmeticMean(knownHours) : null;
  const effectiveAvg = Number.isFinite(avgHours) ? avgHours : avgKnown != null ? avgKnown : null;

  const shortSample =
    (Number.isFinite(lastNightHours) && lastNightHours < 6) ||
    (effectiveAvg != null && effectiveAvg < 6);

  const irregular = isSleepIrregular(knownHours);

  const highTraining = recentHabits?.highTrainingLoad === true;
  const shortForTraining =
    highTraining &&
    ((effectiveAvg != null && effectiveAvg < 7) ||
      (Number.isFinite(lastNightHours) && lastNightHours < 7));

  const comfortable =
    effectiveAvg != null &&
    effectiveAvg >= 7.5 &&
    (lastNightHours == null || !Number.isFinite(lastNightHours) || lastNightHours >= 6.5) &&
    !irregular &&
    !shortForTraining &&
    !shortSample &&
    penalty <= 0.15;

  if (comfortable) {
    return null;
  }

  const penaltyOnly = penalty > 0.15 && !shortSample && !irregular && !shortForTraining;
  if (!shortSample && !irregular && !shortForTraining && !penaltyOnly) {
    return null;
  }

  const actions = [];

  const ACTION_SEVERE = [
    'Vai a dormire 60–90 minuti prima del solito',
    'Evita schermi luminosi nell’ultima ora',
    'Riduci caffeina dopo le 14:00',
    'Cena leggera, evita pasti abbondanti la sera',
  ];

  const ACTION_IRREGULAR = [
    'Mantieni orari di sonno costanti',
    'Esporsi alla luce naturale al mattino',
    'Evita sonnellini lunghi',
  ];

  const ACTION_LOAD = ['Riduci intensità allenamento oggi', 'Priorità al recupero'];

  if (shortSample) {
    actions.push(...ACTION_SEVERE);
  }
  if (irregular) {
    actions.push(...ACTION_IRREGULAR);
  }
  if (shortForTraining) {
    actions.push(...ACTION_LOAD);
  }
  if (penaltyOnly) {
    actions.push(
      'Prova a anticipare orario a letto di 30–45 minuti',
      'Riduci stimoli serali (schermi, lavoro intenso)',
      'Mantieni orari di sonno costanti',
    );
  }

  const merged = uniqStrings(actions);
  if (merged.length === 0) return null;

  if (shortSample) {
    return {
      priority: 'critical',
      title: 'Recupero prioritario',
      message: 'Il sonno è insufficiente e limita energia e adattamento metabolico.',
      actions: merged,
    };
  }

  const parts = [];
  if (irregular) parts.push('Il ritmo del sonno è irregolare.');
  if (shortForTraining) parts.push('Il carico di allenamento richiede più recupero.');
  if (penaltyOnly) {
    parts.push('Nella finestra il riposo è al di sotto dell’obiettivo di recupero.');
  }
  return {
    priority: 'standard',
    title: 'Priorità sonno',
    message:
      parts.join(' ') ||
      'Oggi conviene proteggere qualità e continuità del riposo.',
    actions: merged,
  };
}

/**
 * Costruisce ingressi sonno per {@link buildSleepCoachPlan} dal diario (solo lettura).
 *
 * @param {Array<{ date?: string, sleepHours?: number | null }>} dailyHistory
 * @param {string} selectedTimeframe
 * @param {{ sleepHours?: number } | null} mapInputs
 */
export function buildSleepDataFromDailyHistory(dailyHistory, selectedTimeframe, mapInputs = null) {
  const slice = getWindowSlice(dailyHistory, selectedTimeframe);
  const rawSeries = sleepHoursSeriesFromSlice(slice);
  const known = rawSeries.filter((h) => h != null);
  const avgFromMap =
    mapInputs && Number.isFinite(Number(mapInputs.sleepHours))
      ? Number(mapInputs.sleepHours)
      : null;

  return {
    avgHours: avgFromMap != null ? avgFromMap : known.length ? arithmeticMean(/** @type {number[]} */ (known)) : null,
    lastNightHours: lastLoggedSleepHours(slice),
    hoursByDay: rawSeries,
    sleepPenalty: null,
  };
}

/**
 * @param {{
 *   avgHours: number | null,
 *   lastNightHours: number | null,
 *   hoursByDay: (number | null)[],
 *   sleepPenalty?: number,
 * }} p
 * @param {boolean} highTrainingLoad
 */
export function isSleepLimitingFactor(
  { avgHours, lastNightHours, hoursByDay, sleepPenalty = 0 },
  highTrainingLoad
) {
  const known = (hoursByDay || []).filter((h) => h != null && Number(h) > 0).map(Number);
  const avg = avgHours != null && Number.isFinite(Number(avgHours)) ? Number(avgHours) : null;
  const last =
    lastNightHours != null && Number.isFinite(Number(lastNightHours))
      ? Number(lastNightHours)
      : null;

  if (Number(sleepPenalty) > 0.15) return true;
  if (avg != null && avg < 7) return true;
  if (last != null && last < 6.5) return true;
  if (isSleepIrregular(known)) return true;
  if (highTrainingLoad && avg != null && avg < 7.5) return true;
  return false;
}
