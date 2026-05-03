/**
 * Sleep coach — giorno singolo ({@link analyzeSleepCoach}) più aggregazione legacy ({@link buildSleepCoachPlan}, …).
 * Nessuna dipendenza da React nel percorso `analyzeSleepCoach` / `buildSleepCoachInputFromDailyLog`.
 */
import { getTodayString } from '../../../coreEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Normalizzazione input (solo funzioni pure)
// ─────────────────────────────────────────────────────────────────────────────

/** @typedef {{ kind: string, decimalHour: number | null, kcalTotal?: number, label?: string, meta?: object }} SleepIncident */

const ALCOHOL_WORD_RE =
  /\b(alcol|birra|vino|prosecco|champagne|whisk(e)?y|vodka|gin|rum|tequila|cocktail|spritz|aperol|liqueur|beer|wine|shot)\b/i;
const INTENSE_WORKOUT_RE =
  /\b(hiit|tabata|circuit|spinning|spin\b|crossfit|corsa|run|running|sprint|trail|trail run|lifting heavy|squat|corsa\b|allenamento\s+intenso)/i;

function clampDec(h) {
  const n = numericHourRaw(h);
  if (n === null) return null;
  if (n < 0 || n >= 24) return null;
  return n;
}

function parseIsoHour(isoLike) {
  if (isoLike == null) return null;
  const d = typeof isoLike === 'string' || isoLike instanceof Date ? new Date(isoLike) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Ora del giorno in decimale [0,24); accetta stringhe con virgola e valori null/NaN → null. */
function numericHourRaw(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const h = v.getHours() + v.getMinutes() / 60 + v.getSeconds() / 3600;
    return Number.isFinite(h) ? h : null;
  }
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Ora di clock per food / workout / stimulant / alcohol / meal (non usare duration come clock). */
function eventClockHourFromEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const keys = [e.mealTime, e.time, e.startTime, e.hour];
  for (let i = 0; i < keys.length; i += 1) {
    const c = clampDec(keys[i]);
    if (c != null) return c;
  }
  if (typeof e.timeLabel === 'string') {
    const m = String(e.timeLabel).match(/\b(\d{1,2})[:.](\d{2})\b/);
    if (m) return clampDec(parseInt(m[1], 10) + parseInt(m[2], 10) / 60);
  }
  return null;
}

function decimalHourFromEntry(e) {
  return eventClockHourFromEntry(e);
}

function incidentClockHour(inc) {
  if (!inc || typeof inc !== 'object') return null;
  const raw = inc.decimalHour != null ? inc.decimalHour : inc.time;
  return clampDec(raw);
}

function numericOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sumFoodKcalFromEntry(e) {
  if (!e) return 0;
  let sum = numericOrNull(e.kcal ?? e.cal) ?? 0;
  if (Array.isArray(e.items)) {
    for (const it of e.items) {
      if (!it) continue;
      const k = numericOrNull(it.kcal ?? it.cal);
      if (k != null) sum += k;
    }
  }
  return Math.max(0, sum);
}

function entryPrimaryLabel(e) {
  const s =
    String(e.desc || e.title || e.name || e.label || '').trim() ||
    String(e.microDesc || '').trim() ||
    String(e.category || '').trim();
  return s;
}

function mentionsAlcohol(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.type === 'alcohol') return true;
  if (Boolean(entry.alcohol)) return true;
  const lbl = `${entryPrimaryLabel(entry)} ${String(entry.ingredients || '').toLowerCase()}`.toLowerCase();
  return ALCOHOL_WORD_RE.test(lbl);
}

function normalizeLabel(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function caffeineEntryTextBlob(e) {
  if (!e || typeof e !== 'object') return '';
  return [
    e.name,
    e.label,
    e.title,
    e.foodName,
    e.description,
    e.desc,
    e.microDesc,
  ]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

function caffeineClockNumberForLog(entry) {
  const c = eventClockHourFromEntry(entry);
  if (c != null && Number.isFinite(Number(c))) return Number(c);
  const v = numericHourRaw(entry.time ?? entry.mealTime ?? entry.startTime ?? entry.hour);
  return v != null && Number.isFinite(v) ? Number(v) : Number.NaN;
}

/**
 * Rilevamento caffeina su food/recipe/meal/stimulant (testo + orologio + mg).
 * @returns {{ isCaffeine: boolean, caffeineLog: { time: number, amountMg: number } | null }}
 */
function normalizeCaffeineFromEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { isCaffeine: false, caffeineLog: null };
  }
  const type = String(entry.type || '').trim().toLowerCase();
  const amountMg = numericOrNull(entry.caffeineMg ?? entry.caffeinaMg) ?? 80;
  const time = caffeineClockNumberForLog(entry);

  const make = (isCaffeine) => ({
    isCaffeine,
    caffeineLog: isCaffeine ? { time, amountMg } : null,
  });

  if (type === 'stimulant') {
    return make(true);
  }

  const blob = normalizeLabel(caffeineEntryTextBlob(entry));
  if (!blob) return make(false);

  let hit = false;
  if (blob.includes('energy drink')) hit = true;
  else if (blob.includes('cappuccino')) hit = true;
  else if (blob.includes('espresso')) hit = true;
  else if (blob.includes('coffee')) hit = true;
  else if (blob.includes('caffeine')) hit = true;
  else if (blob.includes('caffeina')) hit = true;
  else if (blob.includes('red bull') || blob.includes('monster')) hit = true;
  else if (/\bmate\b/.test(blob)) hit = true;
  /** Dopo strip accenti: "caffè" → "caffe" */
  else if (blob.includes('caffe')) hit = true;

  return make(hit);
}

function workoutIsIntense(e) {
  if (!e) return false;
  const i = numericOrNull(e.intensity01 ?? e.intensityPercent);
  if (i != null && i >= 70) return true;
  const label = normalizeLabel(entryPrimaryLabel(e) + String(e.workoutType || ''));
  if (INTENSE_WORKOUT_RE.test(label)) return true;
  const dur = numericOrNull(e.duration);
  const kcal = numericOrNull(e.kcal ?? e.cal);
  if (dur != null && kcal != null && dur >= 35 && kcal >= 380) return true;
  /** Stessa soglia kcal della coppia dur+kcal quando la durata non è nel log. */
  if (kcal != null && kcal >= 380 && (dur == null || !Number.isFinite(Number(e.duration)))) return true;
  return false;
}

/** ore positive da event serale a orario letto nominale (same-day model) */
function hoursBeforeApproxBedtime(eventDecimal, bedtimeDecimal, wakeDecimal) {
  const ev = clampDec(eventDecimal);
  let bed = clampDec(bedtimeDecimal);
  if (bed == null) return null;
  if (ev == null) return null;
  /** Se l’evento è “mattino” dopo risveglio dichiarato, non legarlo alla notte prima */
  const w = clampDec(wakeDecimal);
  if (w != null && ev >= w && ev < w + 5) return null;
  let diff = bed - ev;
  if (diff >= 0) return diff;
  /** dopo mezzogiorno dopo bed presunto → giorno dopo / outlier */
  if (ev >= 12) diff = bed + (24 - ev);
  else diff += 24;
  if (diff < 0 || diff > 20) return null;
  return diff;
}

/** @returns {'unknown'|'poor'|'fair'|'good'} */
function deriveSleepQualityTier(sleepEntry) {
  const e = sleepEntry;
  if (!e || typeof e !== 'object') return 'unknown';
  const ql = normalizeLabel(String(e.quality ?? e.sleepQuality ?? e.qualityScore ?? '').trim());
  if (/\bpoor|male|bad|worst\b/.test(ql) || /\b(scars|pessim|inferior|turbolent)\w*/.test(ql)) return 'poor';
  if (/^\d+$/.test(ql.trim())) {
    const n = Number(ql.trim());
    if (n <= 4) return 'poor';
    if (n <= 6) return 'fair';
    return 'good';
  }
  if (/\bmolto\s+buen|ottiim|excel|eccell/.test(ql)) return 'good';
  if (/buono|fair|ok|moderat/.test(ql)) return 'fair';

  const h = numericOrNull(e.hours) ?? numericOrNull(e.duration);
  const deepMin = numericOrNull(e.deepMin ?? e.deep);
  const remMin = numericOrNull(e.remMin ?? e.rem);
  if (deepMin != null && remMin != null && h != null && h > 0.5) {
    const restorative = deepMin + remMin;
    const ratio = restorative / (h * 60);
    if (ratio < 0.22) return 'poor';
    if (ratio < 0.32) return 'fair';
    return 'good';
  }

  const score = numericOrNull(e.score ?? e.scoreTotal);
  if (score != null) {
    if (score <= 45) return 'poor';
    if (score <= 70) return 'fair';
    return 'good';
  }

  return 'unknown';
}

function normalizeSleepLog(entry) {
  const sleepStart = entry.sleepStart ?? entry.bedtime ?? entry.time ?? null;

  const sleepEnd = entry.sleepEnd ?? entry.wakeTime ?? null;

  const durationHours = entry.hours ?? entry.duration ?? entry.sleepHours ?? null;

  return {
    sleepStart: Number(sleepStart),
    sleepEnd: Number(sleepEnd),
    durationHours: Number(durationHours),
    subjectiveQuality: entry.quality ?? null,
  };
}

function extractSleepPrimitives(sleepEntries, fallbackBedDecimal) {
  let duration = null;
  let sleepStartHour = null;
  let wakeHour = null;

  const first = sleepEntries.find(Boolean);
  for (const s of sleepEntries) {
    if (!s || typeof s !== 'object') continue;

    const n = normalizeSleepLog(s);

    let h = numericOrNull(n.durationHours);
    if (h == null)
      h = numericOrNull(s.hours ?? s.durationHours ?? (s.duration && s.duration < 48 ? s.duration : null));
    if (h != null && h > 0 && h <= 18) duration = duration == null ? h : Math.max(duration, h);

    let ss = clampDec(numericOrNull(n.sleepStart));
    if (ss == null) {
      const raw =
        numericOrNull(s.sleepStartHour) ?? parseIsoHour(s.sleepStart ?? s.sleepStartTs);
      if (raw != null) ss = clampDec(raw);
    }
    if (ss != null) sleepStartHour = ss;

    let we = clampDec(numericOrNull(n.sleepEnd));
    if (we == null) {
      const raw = numericOrNull(s.wakeHour) ?? parseIsoHour(s.wakeTime ?? s.sleepEnd ?? s.wakeTs);
      if (raw != null) we = clampDec(raw);
    }
    if (we != null) wakeHour = we;
  }

  let bedtimeApprox = clampDec(first?.bedtimeApprox);
  if (bedtimeApprox == null) bedtimeApprox = clampDec(sleepStartHour);
  if (bedtimeApprox == null && wakeHour != null && duration != null) {
    let b = wakeHour - duration;
    while (b < 0) b += 24;
    while (b >= 24) b -= 24;
    bedtimeApprox = clampDec(b);
  } else if (bedtimeApprox == null && sleepStartHour != null) {
    bedtimeApprox = clampDec(sleepStartHour);
  }
  if (bedtimeApprox == null) bedtimeApprox = clampDec(fallbackBedDecimal);

  const qualityTier = deriveSleepQualityTier(first);

  return {
    durationHours: duration,
    bedtimeApprox,
    wakeApprox: wakeHour,
    sleepQualityTier: qualityTier,
  };
}

/** @typedef {{ calorieBalanceApprox?: number|null, defaultSleepOnsetDecimal?: number|null, wakeHourDecimal?: number|null }} SleepCoachDailyOptions */

/**
 * Dal log giornaliero (array voci) ricava un ingresso deterministico per {@link analyzeSleepCoach}.
 *
 * @param {unknown[]} activeLog
 * @param {SleepCoachDailyOptions} [options]
 * @returns {object} Modello normalizzato per {@link analyzeSleepCoach}
 */
export function buildSleepCoachInputFromDailyLog(activeLog, options = {}) {
  const log = Array.isArray(activeLog) ? activeLog : [];
  const defaultBed = clampDec(options.defaultSleepOnsetDecimal ?? options.defaultSleepOnsetHour ?? 23) ?? 23;
  const wakeHint = clampDec(options.wakeHourDecimal);
  const balance = numericOrNull(options.calorieBalanceApprox);

  /** @type {SleepIncident[]} */
  const incidents = [];
  /** @type {object[]} */
  const rawSleepTouches = [];

  for (let i = 0; i < log.length; i += 1) {
    const e = log[i];
    if (!e || typeof e !== 'object') continue;
    const t = String(e.type || '').trim().toLowerCase();

    if (t === 'sleep' || e.id === 'sonno') {
      rawSleepTouches.push(e);
      continue;
    }

    if (t === 'nap') {
      const clock = eventClockHourFromEntry(e);
      const dNum = numericOrNull(e.duration);
      const mins =
        numericOrNull(e.durationMin ?? e.minutes) ??
        (dNum != null && dNum >= 0 && dNum < 24 ? dNum * 60 : null);
      const hours = mins != null ? mins / 60 : dNum;
      incidents.push({
        kind: 'nap',
        decimalHour: clock,
        time: clock,
        durationHours: hours,
        durationMin: mins,
        label: entryPrimaryLabel(e) || 'nap',
      });
      continue;
    }

    if (t === 'workout' || t === 'work' || t === 'activity') {
      const clock = eventClockHourFromEntry(e);
      incidents.push({
        kind: 'workout',
        decimalHour: clock,
        time: clock,
        intensity: workoutIsIntense(e) ? 'high' : 'moderate',
        kcalBurn: numericOrNull(e.kcal ?? e.cal),
        label: entryPrimaryLabel(e) || String(e.desc || 'workout'),
        meta: { raw: { duration: e.duration } },
      });
      continue;
    }

    if (t === 'stimulant') {
      const clock = eventClockHourFromEntry(e);
      const cafS = normalizeCaffeineFromEntry(e);
      incidents.push({
        kind: 'stimulant',
        decimalHour: clock,
        time: clock,
        label: entryPrimaryLabel(e) || 'stimolo',
        hasCaffeineGuess: true,
        caffeineLog: cafS.caffeineLog,
      });
      continue;
    }

    if (t === 'alcohol') {
      const clock = eventClockHourFromEntry(e);
      incidents.push({
        kind: 'alcohol',
        decimalHour: clock,
        time: clock,
        label: entryPrimaryLabel(e) || 'alcol',
      });
      continue;
    }

    if (t === 'food' || t === 'recipe') {
      const k = sumFoodKcalFromEntry(e);
      const clock = eventClockHourFromEntry(e);
      const cafNorm = normalizeCaffeineFromEntry(e);
      incidents.push({
        kind: 'food',
        decimalHour: clock,
        time: clock,
        kcalTotal: k,
        hasAlcoholGuess: mentionsAlcohol(e),
        hasCaffeineGuess: cafNorm.isCaffeine,
        caffeineLog: cafNorm.caffeineLog,
        mealTypeHint: String(e.mealType || e.mealId || ''),
        label: entryPrimaryLabel(e) || t,
      });
      continue;
    }

    if (t === 'meal' && Array.isArray(e.items)) {
      let total = 0;
      let alc = false;
      let cafItem = false;
      let labelBits = '';
      for (const it of e.items) {
        total += numericOrNull(it?.kcal ?? it?.cal) ?? 0;
        labelBits += ` ${entryPrimaryLabel(it)}`;
        if (mentionsAlcohol(it)) alc = true;
        if (normalizeCaffeineFromEntry(it).isCaffeine) cafItem = true;
      }
      const clock = eventClockHourFromEntry(e);
      const cafMerged = normalizeCaffeineFromEntry({
        ...e,
        desc: `${e.desc || ''}${labelBits}`.trim(),
      });
      const isCaffeine = cafItem || cafMerged.isCaffeine;
      const caffeineLog = isCaffeine
        ? {
            time: caffeineClockNumberForLog(e),
            amountMg: numericOrNull(e.caffeineMg ?? e.caffeinaMg) ?? 80,
          }
        : null;
      incidents.push({
        kind: 'meal_aggregate',
        decimalHour: clock,
        time: clock,
        kcalTotal: Math.max(total, numericOrNull(e.kcal ?? e.cal) ?? 0),
        hasAlcoholGuess: alc || mentionsAlcohol({ desc: `${e.desc}${labelBits}` }),
        hasCaffeineGuess: isCaffeine,
        caffeineLog,
        mealTypeHint: String(e.mealId || ''),
        label: String(e.desc || 'pasto'),
      });
    }
  }

  const extracted = extractSleepPrimitives(rawSleepTouches, defaultBed);

  const sleepAssessmentBase = {
    durationHoursResolved: extracted.durationHours,
    qualityTierResolved: extracted.sleepQualityTier,
    bedtimeDecimalResolved: extracted.bedtimeApprox,
    wakeDecimalResolved: wakeHint ?? extracted.wakeApprox ?? null,
  };

  return {
    dateKey: typeof options.referenceDateISO === 'string' ? options.referenceDateISO.slice(0, 10) : null,
    sleep: sleepAssessmentBase,
    calorieBalanceApprox: balance ?? null,
    incidents,
    _wakeHintMerged: wakeHint ?? extracted.wakeApprox ?? null,
    _fallbackBedHour: extracted.bedtimeApprox ?? defaultBed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cause + analisi giornaliera
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER = { high: 3, moderate: 2, low: 1 };

function sortCauses(cs) {
  return [...cs].sort((a, b) => {
    const cd = Number(b.confidence ?? 0) - Number(a.confidence ?? 0);
    if (cd !== 0) return cd;
    const sd = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (sd !== 0) return sd;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function buildSleepAssessment(norm) {
  const h = norm?.sleep?.durationHoursResolved;
  const q = norm?.sleep?.qualityTierResolved ?? 'unknown';
  const hrs = numericOrNull(h);
  const short = hrs != null && hrs < 6;
  const poorQ = q === 'poor';
  return {
    hours: hrs,
    qualityTier: q,
    problemFromDuration: Boolean(short),
    problemFromQuality: Boolean(poorQ),
    problematic: Boolean(short || poorQ),
    summary:
      hrs == null && q === 'unknown'
        ? 'Nessuna misura affidabile delle ore di sonno o della qualità segnata.'
        : `${hrs != null ? `${hrs.toFixed(1)}h` : '—'} · qualità ${q}`,
  };
}

function causeLateCaffeine(incidents, bedtimeDec, wakeDec) {
  const hits = [];
  for (const inc of incidents) {
    if (!inc) continue;
    const stimOk = inc.kind === 'food' || inc.kind === 'meal_aggregate' || inc.kind === 'stimulant';
    if (!stimOk) continue;
    const guessed =
      inc.kind === 'stimulant' ? true : Boolean(inc.hasCaffeineGuess) || inc.caffeineLog != null;
    if (!guessed) continue;
    const dh = incidentClockHour(inc);
    if (dh == null) continue;
    /** regola combinata cutoff 14:00 + vicinanza sera per confidenza */
    const hrsBefore = hoursBeforeApproxBedtime(dh, bedtimeDec ?? 23, wakeDec);
    if (dh >= 14) {
      const conf =
        dh >= 18 ? 0.88 : hrsBefore != null && hrsBefore <= 8 ? Math.min(0.9, 0.55 + (8 - hrsBefore) / 35) : 0.72;
      hits.push({
        eventHour: dh,
        hoursBeforeSleep: hrsBefore,
        confidence: conf,
      });
    }
  }
  if (!hits.length) return null;

  hits.sort((a, b) => b.confidence - a.confidence);
  const pick = hits[0];
  return {
    id: 'late_caffeine',
    label: 'Caffeina tardiva',
    severity: pick.eventHour >= 17 || (pick.hoursBeforeSleep != null && pick.hoursBeforeSleep <= 6) ? 'high' : 'moderate',
    confidence: clamp01(pick.confidence),
    evidence: [
      `Dal diario: ingestione/ricetta con caffeina alle ${pick.eventHour.toFixed(2)} h.`,
      ...(pick.eventHour >= 14 ? [`Dopo il cutoff delle 14:00 (finestra più sensibile alla notte seguente).`] : []),
    ].filter(Boolean),
    recommendation: {
      title: 'Sposta prima la caffeina',
      action: 'Prova caffeina prima delle 13–14 h o riduci dose serale.',
      reason: 'La caffeina tardiva aumenta ritardo nel sonolenza e frammentazione notturna (euristica giornaliero).',
    },
  };
}

function causeLateWorkout(incidents, bedtimeDec, wakeDec) {
  const hits = [];
  for (const inc of incidents) {
    if (inc.kind !== 'workout') continue;
    if (inc.intensity !== 'high') continue;
    const dh = incidentClockHour(inc);
    if (dh == null) continue;
    const gap = hoursBeforeApproxBedtime(dh, bedtimeDec ?? 23, wakeDec);
    if (gap != null && gap <= 4) {
      hits.push({ gap, dh, label: inc.label });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.gap - b.gap);
  const pick = hits[0];
  return {
    id: 'late_intense_workout',
    label: 'Allenamento intenso a ridosso della notte',
    severity: pick.gap <= 2 ? 'high' : 'moderate',
    confidence: clamp01(0.55 + (4 - pick.gap) / 12),
    evidence: [`Workout marcato come intenso intorno alle ${pick.dh.toFixed(2)} h (${pick.gap.toFixed(1)} h prima del presunto ritiro a dormire).`],
    recommendation: {
      title: 'Anticipa o alleggerisci il carico ',
      action: 'Sposta sessioni HIIT/cardio prima del pomeriggio o finale più graduato.',
      reason: 'L’attivazione simpatica alta nelle ore immediatamente precedenti il sonno rende più difficile addormentarsi (euristica).',
    },
  };
}

function causeLateHeavyMeal(incidents, bedtimeDec, wakeDec) {
  const hits = [];
  for (const inc of incidents) {
    if (inc.kind !== 'food' && inc.kind !== 'meal_aggregate') continue;
    const k = numericOrNull(inc.kcalTotal);
    if (k == null || k <= 700) continue;
    const dh = incidentClockHour(inc);
    if (dh == null) continue;
    const gap = hoursBeforeApproxBedtime(dh, bedtimeDec ?? 23, wakeDec);
    if (gap != null && gap <= 3) {
      hits.push({ k, dh, gap, label: inc.label });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.gap - b.gap);
  const pick = hits[0];
  return {
    id: 'late_heavy_meal',
    label: 'Pasto calorie-denso vicino alla nanna',
    severity: pick.k >= 950 ? 'high' : 'moderate',
    confidence: clamp01(0.6 + Math.min((pick.k - 700) / 1200, 0.35)),
    evidence: [`Pasto/ricetta ~${Math.round(pick.k)} kcal a ${pick.dh.toFixed(2)} h (${pick.gap.toFixed(1)} h dalla notte presumibile).`],
    recommendation: {
      title: 'Cena più leggera o anticipata ',
      action: 'Obiettivo: pasto grande almeno 3–4 h prima del sonno.',
      reason: 'Il carico digestivo alto riduce il comfort gastrointestinale nei primi cicli della notte (euristica).',
    },
  };
}

function causeEveningAlcohol(incidents, bedtimeDec, wakeDec) {
  const hits = [];
  const pushHit = (dh, lbl) => {
    const gap = hoursBeforeApproxBedtime(dh, bedtimeDec ?? 23, wakeDec);
    if (gap != null && gap <= 6) hits.push({ dh, gap, label: lbl });
  };

  for (const inc of incidents) {
    if (inc.kind === 'alcohol') {
      const dh = incidentClockHour(inc);
      if (dh != null) pushHit(dh, inc.label);
      continue;
    }
    const guess = Boolean(inc.hasAlcoholGuess) || mentionsAlcohol(inc);
    if (!(inc.kind === 'food' || inc.kind === 'meal_aggregate') || !guess) continue;
    const dh = incidentClockHour(inc);
    if (dh != null) pushHit(dh, inc.label || 'consumo inferito da nome/ricetta');
  }

  if (!hits.length) return null;
  hits.sort((a, b) => a.gap - b.gap);
  const pick = hits[0];
  return {
    id: 'evening_alcohol',
    label: 'Alcool in finestra vicina alla notte',
    severity: pick.gap <= 3 ? 'high' : 'moderate',
    confidence: clamp01(0.65 + (6 - pick.gap) / 35),
    evidence: [`Consumo (o inferenza da ricetta/nome) circa alle ${pick.dh.toFixed(2)} h, ${pick.gap.toFixed(1)} h prima del presumibile ritiro.`],
    recommendation: {
      title: 'Riduci o anticipa ',
      action: 'Tieni più distanza dall’alcool nei 6 h prima del sonno quando possibile.',
      reason: "L'alcol frammenta i cicli REM e aumenta risvegli tardivi anche se accelera il sonnecchiare.",
    },
  };
}

function causeLateNap(incidents) {
  /** lungo (>90 min codice robusto uso 1.51h) o nap dopo ore 15 */
  const suspects = incidents.filter((i) => i.kind === 'nap');
  if (!suspects.length) return null;

  let worst = null;
  let score = 0;
  for (const n of suspects) {
    const dur = numericOrNull(n.durationHours ?? (n.durationMin != null ? n.durationMin / 60 : null));
    const dh = incidentClockHour(n);
    const long = dur != null && dur > 90 / 60;
    const late = dh != null && dh >= 15;
    if (!long && !late) continue;
    const locScore = (long ? 2 : 0) + (late ? 2 : 0) + Math.min(dur || 0, 3);
    if (locScore > score) {
      score = locScore;
      worst = { n, long, late, dur, dh };
    }
  }
  if (!worst) return null;

  return {
    id: 'late_nap',
    label: worst.long ? 'Nap lungo' : 'Nap tardivo',
    severity: worst.long && worst.late ? 'high' : 'moderate',
    confidence: clamp01(0.55 + (worst.dur ? Math.min(worst.dur / 8, 0.38) : 0.35)),
    evidence: [
      worst.dh != null ? `Riposo diurno ~${worst.dh.toFixed(2)} h` : null,
      worst.dur != null ? `durata inferita ~${worst.dur.toFixed(1)} h` : null,
      worst.long ? '>90 min aumenta interferenza sulla pressione omeostatica nel sonno notturno' : '',
    ].filter(Boolean),
    recommendation: {
      title: 'Accorcia o anticipa ',
      action: worst.long ? 'Mantieni sonnellini sotto ~25–35 min; evita dopo le 15–16 h.'
        : 'Sposta prima il riposto o dimezza la durata per proteggere la notte.',
      reason: 'Nap tardivi/lunghi tolgono quota di sonno ortodosso o anticipano cicli incompleti (euristica).',
    },
  };
}

function causeLargeCalorieDeficit(norm) {
  const b = numericOrNull(norm?.calorieBalanceApprox);
  if (b == null) return null;
  if (b >= -600) return null;
  const depth = Math.abs(b + 600);
  return {
    id: 'large_calorie_deficit',
    label: 'Deficit energetico ampio nella giornata',
    severity: depth >= 550 ? 'high' : 'moderate',
    confidence: clamp01(0.5 + Math.min(depth / 1500, 0.42)),
    evidence: [`Bilancio stimato giornaliero ≈ ${Math.round(b)} kcal (inferiore alla soglia −600 kcal).`],
    recommendation: {
      title: 'Recupero nutrizionale controllato',
      action:
        'In una seduta di giorno aumenta gradualmente carbohydrate leggeri in cena o snack serale stabile solo se compatibile meta.',
      reason: 'Deficit molto larghi aumentano arousal corticale tardivo e possono aumentare sveglie correlate a fame relativi (euristica).',
    },
  };
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** @param {ReturnType<typeof buildSleepCoachInputFromDailyLog>} input */
export function analyzeSleepCoach(input) {
  const norm = input && typeof input === 'object' ? input : {};
  const bedtime = clampDec(norm?._fallbackBedHour ?? norm?.sleep?.bedtimeDecimalResolved) ?? null;
  const wake = clampDec(norm?._wakeHintMerged ?? norm?.sleep?.wakeDecimalResolved ?? null);

  const sleepAssessment = buildSleepAssessment(norm);

  const rawCauses = [
    causeLateCaffeine(norm.incidents ?? [], bedtime, wake),
    causeLateWorkout(norm.incidents ?? [], bedtime, wake),
    causeLateHeavyMeal(norm.incidents ?? [], bedtime, wake),
    causeEveningAlcohol(norm.incidents ?? [], bedtime, wake),
    causeLateNap(norm.incidents ?? []),
    causeLargeCalorieDeficit(norm),
  ].filter(Boolean);

  const likelyCauses = sortCauses(rawCauses);

  const guidanceSteps = [];
  const seen = new Set();
  for (const c of likelyCauses) {
    const rec = c.recommendation;
    if (!rec || typeof rec !== 'object') continue;
    const key = `${String(rec.title ?? '')}\0${String(rec.action ?? '')}\0${String(rec.reason ?? '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    guidanceSteps.push({
      title: rec.title ?? '',
      action: rec.action ?? '',
      reason: rec.reason ?? '',
    });
  }

  const sleepsUnknown =
    norm?.sleep?.durationHoursResolved == null && (norm?.sleep?.qualityTierResolved ?? 'unknown') === 'unknown';

  /** status */
  let status = 'sleep_ok';
  if (sleepsUnknown && likelyCauses.length === 0) {
    status = 'insufficient_data';
  } else if (
    sleepAssessment.problematic ||
    likelyCauses.some((x) => x.severity !== 'low' && x.confidence >= 0.55)
  ) {
    status = 'sleep_disrupted';
  }

  /** narrative */
  let narrative = '';
  if (status === 'sleep_ok') {
    narrative =
      'Nel complesso riposo e abitudini segnano una giornata coerente col recupero: continua sul binario degli orari stabili.';
  } else if (status === 'insufficient_data') {
    narrative = 'Serve almeno un’indicazione di sonno (ore o giudizio sulla qualità) per valutare con precisione.';
  } else if (likelyCauses.length === 0) {
    narrative = 'Il sonno appare delicato/non ottimale, ma dai log giornalieri non emergono comportamenti univoci.';
  } else {
    narrative = `Possibili fattori serali dai log (${likelyCauses
      .slice(0, 3)
      .map((x) => x.label)
      .join(', ')}): servono più giorni per conferma.`;
  }

  const avgConf =
    likelyCauses.length > 0
      ? clamp01(arithmeticMean(likelyCauses.map((x) => x.confidence ?? 0)))
      : sleepsUnknown && status === 'insufficient_data'
        ? null
        : 0.5;

  return {
    status,
    sleepAssessment,
    likelyCauses,
    guidanceSteps,
    confidence:
      avgConf == null
        ? null
        : sleepAssessment.problematic
          ? clamp01((avgConf + 0.6) / 2)
          : avgConf,
    narrative,
    debug: {
      incidentCount: (norm.incidents || []).length,
      bedtimeApproxUsed: bedtime,
      wakeApproxUsed: wake,
      timingsMode:
        numericOrNull(norm?.sleep?.bedtimeDecimalResolved) != null ? 'sleep_entry_clock' : 'fallback_or_reconstructed',
      hasTimingEvidence: likelyCauses.length > 0,
      sleepPrimitives: norm.sleep ?? {},
    },
  };
}

/** media aritmetica locale (solo blocco giornaliero) */
function arithmeticMean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i += 1) s += arr[i];
  return s / arr.length;
}

// ======================================================================== //
// Aggregazione storico finestre temporali — consumato da metabolicCoachEngine
// ======================================================================== //

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
    avgHours: avgFromMap != null ? avgFromMap : known.length ? arithmeticMean(known) : null,
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
