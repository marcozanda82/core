/**
 * Analisi pura trend multi-giorno per il Daily Coach — niente React, storage o side-effect.
 */

function num(v, fb = null) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fb;
}

function normalizeHistories(input) {
  const i = input != null && typeof input === 'object' ? input : {};
  return {
    dailyHistory: Array.isArray(i.dailyHistory) ? i.dailyHistory : [],
    sleepHistory: Array.isArray(i.sleepHistory) ? i.sleepHistory : [],
    nutritionHistory: Array.isArray(i.nutritionHistory) ? i.nutritionHistory : [],
  };
}

/** @param {object | null | undefined} r */
function recordDateKey(r) {
  if (r == null || typeof r !== 'object') return null;
  const raw = r.date ?? r.day ?? r.dateKey ?? r.dayKey ?? r.dateStr;
  if (raw != null) {
    const s = String(raw).trim();
    if (s) return s.length >= 10 ? s.slice(0, 10) : s;
  }
  const ts = r.timestamp ?? r.ts ?? r.at;
  const tn = typeof ts === 'number' ? ts : typeof ts === 'string' ? Date.parse(ts) : NaN;
  if (!Number.isFinite(tn)) return null;
  const d = new Date(tn);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Ultimi N giorni distinti con almeno un record, più recente per primo (ISO yyyy-mm-dd).
 * @returns {string[]}
 */
function lastNDistinctDatesFromRecords(records, n) {
  const set = new Set();
  records.forEach((r) => {
    const k = recordDateKey(r);
    if (k) set.add(k);
  });
  const arr = [...set].sort((a, b) => (b < a ? -1 : b > a ? 1 : 0));
  return arr.slice(0, Math.max(0, n || 5));
}

function accumulateSeverity(rankBest, severity) {
  const rank = { info: 0, low: 1, moderate: 2, warning: 3, high: 4 };
  const s = String(severity || '').toLowerCase();
  const r = rank[s] != null ? rank[s] : 2;
  if (!rankBest || r > rankBest.r) return { severity: s || 'warning', r };
  return rankBest;
}

function mergeConfidenceIntoAggregate(agg, confidence) {
  const c = num(confidence, null);
  if (c == null) return agg;
  if (!agg) return { sum: c, count: 1 };
  return { sum: agg.sum + c, count: agg.count + 1 };
}

/** @returns {boolean | null} true/false osservabile, null se mancano evidenze */
function dayHasLateCaffeineFromDailyRecord(r) {
  if (r == null || typeof r !== 'object') return null;
  if (r.caffeinaTardiva === true || r.lateCaffeine === true || r.caffeineAfter14 === true) return true;
  if (r.caffeinaTardiva === false || r.lateCaffeine === false || r.caffeineAfter14 === false) return false;
  const h =
    num(r.lastCaffeineHour, null) ??
    num(r.lastCaffeinaHour, null) ??
    num(r.lastCaffeineDecimalHour, null);
  if (h == null) return null;
  return h > 14;
}

function pickDailyForDate(dailyHistory, dateKey) {
  const matches = dailyHistory.filter((r) => recordDateKey(r) === dateKey);
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) => {
    if (!best) return cur;
    const tb = typeof best.updatedAt === 'number' ? best.updatedAt : 0;
    const tc = typeof cur.updatedAt === 'number' ? cur.updatedAt : 0;
    return tc >= tb ? cur : best;
  }, null);
}

function latestSleepForDate(sleepHistory, dateKey) {
  const matches = sleepHistory.filter((r) => recordDateKey(r) === dateKey);
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) => {
    if (!best) return cur;
    const tb = typeof best.updatedAt === 'number' ? best.updatedAt : 0;
    const tc = typeof cur.updatedAt === 'number' ? cur.updatedAt : 0;
    return tc >= tb ? cur : best;
  }, null);
}

function nutritionOmega3ForDate(nutritionHistory, dateKey) {
  const matches = nutritionHistory.filter((r) => recordDateKey(r) === dateKey);
  if (matches.length === 0) return null;
  let sum = 0;
  let any = false;
  matches.forEach((r) => {
    const o = num(r.omega3 ?? r.omegaThree ?? r.totalOmega3, null);
    if (o != null) {
      any = true;
      sum += o;
    }
  });
  return any ? sum : null;
}

/** @returns {boolean | null} */
function sleepDisruptionFromRecord(r) {
  if (r == null || typeof r !== 'object') return null;
  if (r.sleepDisrupted === true || r.sleepPoor === true || r.poorSleep === true) return true;
  const hours = num(r.sleepHours ?? r.hours ?? r.durationHours ?? r.sleepDurationHours, null);
  if (hours != null && hours < 6) return true;
  const q = r.sleepQuality ?? r.quality;
  if (typeof q === 'string') {
    const qs = q.toLowerCase();
    if (qs === 'poor' || qs === 'bad' || qs === 'low' || qs === 'scarso') return true;
    if (qs === 'good' || qs === 'ok' || qs === 'buono' || qs === 'excellent') return false;
  }
  const score = num(r.sleepScore, null);
  if (score != null && score < 50) return true;
  if (hours != null && hours >= 6) return false;
  return null;
}

function buildPattern({ id, label, severity, confidence, evidence, recommendation }) {
  return {
    id,
    label,
    severity: String(severity || 'warning'),
    confidence: Math.max(0, Math.min(1, num(confidence, 0) ?? 0)),
    evidence: Array.isArray(evidence) ? evidence : [],
    recommendation: String(recommendation ?? ''),
  };
}

/**
 * @param {object} input
 * @returns {{ status: string, patterns: object[], severity: string, confidence: number, debug: object }}
 */
export function analyzeDailyCoachTrends(input = {}) {
  const { dailyHistory, sleepHistory, nutritionHistory } = normalizeHistories(input);

  const debug = {
    dailyCount: dailyHistory.length,
    sleepCount: sleepHistory.length,
    nutritionCount: nutritionHistory.length,
    windowDates: [],
    insufficientReason: null,
  };

  const allRecords = [...dailyHistory, ...sleepHistory, ...nutritionHistory];
  if (allRecords.length === 0) {
    debug.insufficientReason = 'empty_histories';
    return {
      status: 'insufficient_data',
      patterns: [],
      severity: 'info',
      confidence: 0,
      debug,
    };
  }

  const windowDates = lastNDistinctDatesFromRecords(allRecords, 5);
  debug.windowDates = windowDates;

  if (windowDates.length < 2) {
    debug.insufficientReason = 'fewer_than_two_distinct_days';
    return {
      status: 'insufficient_data',
      patterns: [],
      severity: 'info',
      confidence: 0,
      debug,
    };
  }

  const patterns = [];

  const lateCaffeineDays = [];
  let lateCaffeineObservable = 0;
  windowDates.forEach((d) => {
    const row = pickDailyForDate(dailyHistory, d);
    if (!row) return;
    const v = dayHasLateCaffeineFromDailyRecord(row);
    if (v == null) return;
    lateCaffeineObservable += 1;
    if (v === true) lateCaffeineDays.push(d);
  });
  if (lateCaffeineDays.length >= 2) {
    const conf = lateCaffeineObservable > 0 ? lateCaffeineDays.length / lateCaffeineObservable : 0;
    patterns.push(
      buildPattern({
        id: 'repeated_late_caffeine',
        label: 'Caffeina tardiva ricorrente',
        severity: 'warning',
        confidence: conf,
        evidence: [...lateCaffeineDays],
        recommendation:
          'Limita caffeina dopo le 14:00 nella finestra serale per ridurre interferenze su sonno e cortisolo.',
      }),
    );
  }

  const badSleepDays = [];
  let sleepObserved = 0;
  windowDates.forEach((d) => {
    const row = latestSleepForDate(sleepHistory, d);
    if (!row) return;
    const v = sleepDisruptionFromRecord(row);
    if (v == null) return;
    sleepObserved += 1;
    if (v === true) badSleepDays.push(d);
  });
  if (badSleepDays.length >= 2) {
    const conf = sleepObserved > 0 ? badSleepDays.length / sleepObserved : 0;
    patterns.push(
      buildPattern({
        id: 'repeated_sleep_disruption',
        label: 'Sonno fragile ricorrente',
        severity: 'warning',
        confidence: conf,
        evidence: [...badSleepDays],
        recommendation:
          'Privilegia orari regolari, luce naturale la mattina e riduzione stimoli nella seconda parte di giornata.',
      }),
    );
  }

  const lowOmegaDays = [];
  let omegaDaysObserved = 0;
  windowDates.forEach((d) => {
    const o = nutritionOmega3ForDate(nutritionHistory, d);
    if (o == null) return;
    omegaDaysObserved += 1;
    if (o < 1) lowOmegaDays.push(d);
  });
  if (lowOmegaDays.length >= 2) {
    const conf = omegaDaysObserved > 0 ? lowOmegaDays.length / omegaDaysObserved : 0;
    patterns.push(
      buildPattern({
        id: 'repeated_low_omega3',
        label: 'Omega-3 basso ricorrente',
        severity: 'warning',
        confidence: conf,
        evidence: [...lowOmegaDays],
        recommendation:
          'Integra fonti stabili di EPA/DHA nei pasti principali così il fabbisogno resta sopra soglia giornaliera.',
      }),
    );
  }

  const lowEnergyDays = [];
  let energyObserved = 0;
  windowDates.forEach((d) => {
    const row = pickDailyForDate(dailyHistory, d);
    if (!row) return;
    let e = Object.prototype.hasOwnProperty.call(row, 'energyAt20Percent')
      ? num(row.energyAt20Percent, null)
      : null;
    if (e == null) e = num(row.energy_at_20 ?? row.energyAt20, null);
    if (e == null) return;
    energyObserved += 1;
    if (e < 40) lowEnergyDays.push(d);
  });
  if (lowEnergyDays.length >= 2) {
    const conf = energyObserved > 0 ? lowEnergyDays.length / energyObserved : 0;
    patterns.push(
      buildPattern({
        id: 'repeated_evening_energy_risk',
        label: 'Energia serale instabile',
        severity: 'warning',
        confidence: conf,
        evidence: [...lowEnergyDays],
        recommendation:
          'Monitora distribuzione calorie e recupero nei giorni con energia alle 20:00 sistematicamente bassa.',
      }),
    );
  }

  let sevAgg = null;
  let confAgg = null;
  patterns.forEach((p) => {
    sevAgg = accumulateSeverity(sevAgg, p.severity);
    confAgg = mergeConfidenceIntoAggregate(confAgg, p.confidence);
  });

  let confidence = 0;
  if (confAgg && confAgg.count > 0) confidence = Math.max(0, Math.min(1, confAgg.sum / confAgg.count));

  debug.patternsEmitted = patterns.length;

  const status = patterns.length > 0 ? 'patterns_detected' : 'stable';
  const severity = patterns.length === 0 ? 'info' : (sevAgg && sevAgg.severity) || 'warning';

  return {
    status,
    patterns,
    severity,
    confidence,
    debug,
  };
}
