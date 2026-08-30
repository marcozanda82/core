import { resolveProgressionNutritionTargets } from './saluteDashboardMetrics';

/** Ora locale oltre cui la giornata odierna è considerata chiusa per i freni macro. */
export const PROGRESSION_DAY_CLOSE_HOUR = 21.5;

/** Sotto questa quota calorica (vs target) la giornata odierna resta «in corso» prima della chiusura. */
export const PROGRESSION_INTRADAY_OPEN_KCAL_RATIO = 0.7;

/** Prima di quest'ora si valutano surplus calorici/lipidici precoci. */
export const PROGRESSION_MIDDAY_HOUR = 14;

/**
 * @param {object | null | undefined} entry
 * @returns {number | null} ore decimali locali 0–24
 */
export function parseProgressionLogEntryHour(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const raw = entry.time ?? entry.mealTime ?? entry.startTimeDec ?? entry.sleepStart;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string' && raw.includes(':')) {
    const parts = raw.split(':');
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (Number.isFinite(h)) return h + (Number.isFinite(m) ? m / 60 : 0);
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n >= 24) return null;
  return n;
}

/**
 * @param {Array<object>} dayLog
 * @returns {boolean}
 */
export function detectProgressionEveningMealLogged(dayLog = []) {
  return (Array.isArray(dayLog) ? dayLog : []).some((entry) => {
    const type = String(entry?.type || '').toLowerCase();
    if (type !== 'meal' && type !== 'food' && type !== 'recipe' && type !== 'single') return false;
    const hour = parseProgressionLogEntryHour(entry);
    return hour != null && hour >= 18;
  });
}

/**
 * @param {Array<object>} dayLog
 * @returns {boolean}
 */
export function detectProgressionMorningWorkout(dayLog = []) {
  return (Array.isArray(dayLog) ? dayLog : []).some((entry) => {
    if (String(entry?.type || '').toLowerCase() !== 'workout') return false;
    const hour = parseProgressionLogEntryHour(entry);
    return hour != null && hour < 12;
  });
}

/**
 * @param {Array<object>} dayLog
 * @param {Date} [now]
 * @returns {number}
 */
export function computeProgressionHoursSinceLastMeal(dayLog = [], now = new Date()) {
  const mealHours = (Array.isArray(dayLog) ? dayLog : [])
    .filter((entry) => {
      const type = String(entry?.type || '').toLowerCase();
      return type === 'meal' || type === 'food' || type === 'recipe' || type === 'single';
    })
    .map((entry) => parseProgressionLogEntryHour(entry))
    .filter((h) => h != null);
  const currentHour = now.getHours() + now.getMinutes() / 60;
  if (mealHours.length === 0) return currentHour;
  return Math.max(0, currentHour - Math.max(...mealHours));
}

/**
 * Intraday vs giorno chiuso — decide se i macro sotto target sono «freni» o obiettivi in corso.
 * @param {{
 *   analyzedDateIso?: string,
 *   todayIso?: string,
 *   now?: Date,
 *   totals?: object,
 *   targets?: object,
 *   dayLog?: Array<object>,
 *   nutritionDayComplete?: boolean,
 * }} [params]
 */
export function resolveProgressionDayEvaluationContext({
  analyzedDateIso = '',
  todayIso = '',
  now = new Date(),
  totals = {},
  targets = {},
  dayLog = [],
  nutritionDayComplete = false,
} = {}) {
  const analyzed = String(analyzedDateIso || todayIso || '').slice(0, 10);
  const today = String(todayIso || '').slice(0, 10);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(analyzed) && /^\d{4}-\d{2}-\d{2}$/.test(today);
  const isToday = dateOk && analyzed === today;
  const isPastDay = dateOk && analyzed < today;

  const t = resolveProgressionNutritionTargets(targets);
  const intakeKcal = Math.max(0, Number(totals?.kcal) || 0);
  const targetKcal = Math.max(0, Number(t.kcal) || 0);
  const intakeRatio = targetKcal > 0 ? intakeKcal / targetKcal : 0;
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const beforeCloseTime = currentHour < PROGRESSION_DAY_CLOSE_HOUR;
  const hasEveningMeal = detectProgressionEveningMealLogged(dayLog);

  const dayClosed = isPastDay
    || Boolean(nutritionDayComplete)
    || (isToday && (
      !beforeCloseTime
      || hasEveningMeal
      || (intakeRatio >= 0.85 && intakeKcal >= 300)
    ));

  const isDayOpenForEvaluation = isToday && !dayClosed;

  const morningWorkoutDone = detectProgressionMorningWorkout(dayLog);
  const hoursSinceLastMeal = computeProgressionHoursSinceLastMeal(dayLog, now);
  const intakeFat = Math.max(0, Number(totals?.fatTotal ?? totals?.fat) || 0);
  const targetFat = Math.max(0, Number(t.fat) || 0);

  const intradayRealtimePenalties = {
    earlyCalorieSurplus: isDayOpenForEvaluation
      && currentHour < PROGRESSION_MIDDAY_HOUR
      && targetKcal > 0
      && intakeKcal >= targetKcal * 0.85,
    earlyLipidSurplus: isDayOpenForEvaluation
      && currentHour < PROGRESSION_MIDDAY_HOUR
      && targetFat > 0
      && intakeFat >= targetFat * 0.85,
    fullDayCalorieSurplus: isDayOpenForEvaluation
      && targetKcal > 0
      && intakeKcal > targetKcal * 1.05,
    unplannedProlongedFast: isDayOpenForEvaluation
      && morningWorkoutDone
      && hoursSinceLastMeal >= 4
      && intakeKcal < targetKcal * 0.25,
  };

  return {
    analyzedDateIso: analyzed,
    todayIso: today,
    isToday,
    isPastDay,
    dayClosed,
    isDayOpenForEvaluation,
    dayInProgress: isDayOpenForEvaluation,
    currentHour,
    intakeRatio,
    intakeKcal,
    targetKcal,
    intradayRealtimePenalties,
  };
}

/**
 * @param {string} pillarId
 * @param {object} intake
 * @param {object} targets
 * @returns {string}
 */
function buildIntradayObjectiveFeedback(pillarId, intake, targets) {
  const protTarget = Math.round(Number(targets.prot) || 0);
  const kcalTarget = Math.round(Number(targets.kcal) || 0);
  switch (pillarId) {
    case 'protein':
      return protTarget > 0
        ? `Da completare: ${protTarget}g totali previsti per sostenere la sintesi proteica.`
        : 'Obiettivo proteico da definire nelle impostazioni.';
    case 'calories':
      return kcalTarget > 0
        ? `Target giornaliero: ${kcalTarget} kcal da distribuire.`
        : 'Target calorico da definire nelle impostazioni.';
    case 'carbs':
      return 'Finestra energetica aperta per i prossimi pasti.';
    case 'fats':
      return 'Finestra lipidica aperta per i prossimi pasti.';
    default:
      return 'Giornata nutrizionale ancora in corso.';
  }
}

/**
 * @param {object} intake
 * @param {object} targets
 * @returns {Array<{ id: string, badge: string, title: string, body: string }>}
 */
export function buildProgressionTodayObjectives(intake = {}, targets = {}) {
  const t = resolveProgressionNutritionTargets(targets);
  return MACRO_PILLARS.map((pillar) => ({
    id: pillar.id,
    badge: pillar.icon,
    title: pillar.title.split('&')[0].trim(),
    body: buildIntradayObjectiveFeedback(pillar.id, intake, t),
  }));
}

/**
 * @param {number|null|undefined} score
 * @returns {string}
 */
export function progressionStatusLabel(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return 'In calibrazione';
  if (s >= 80) return 'Aderenza ottimale';
  if (s >= 60) return 'Buona costanza';
  if (s >= 40) return 'Margine di calibrazione';
  return 'Priorità correttiva';
}

/**
 * @param {number|null|undefined} score
 * @returns {'good'|'mid'|'low'|'neutral'}
 */
export function progressionToneFromScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 75) return 'good';
  if (n >= 50) return 'mid';
  return 'low';
}

/**
 * @param {number} consumed
 * @param {number} target
 * @returns {number|null}
 */
export function macroAdherencePct(consumed, target) {
  const c = Number(consumed);
  const t = Number(target);
  if (!Number.isFinite(t) || t <= 0) return null;
  if (!Number.isFinite(c) || c < 0) return 0;
  const ratio = c / t;
  const dev = Math.abs(ratio - 1);
  if (dev <= 0.08) return 100;
  if (dev <= 0.15) return Math.round(100 - ((dev - 0.08) / 0.07) * 12);
  if (dev <= 0.28) return Math.round(88 - ((dev - 0.15) / 0.13) * 38);
  return Math.max(0, Math.round(50 - (dev - 0.28) * 100));
}

function toneFromPct(pct, { isInProgress = false } = {}) {
  if (isInProgress) return 'info';
  if (pct == null) return 'mid';
  if (pct >= 75) return 'good';
  if (pct >= 50) return 'mid';
  return 'low';
}

function formatMacroLine(consumed, target, unit) {
  const c = Number(consumed);
  const t = Number(target);
  if (!Number.isFinite(t) || t <= 0) return 'Target non impostato';
  const cv = Number.isFinite(c) ? Math.round(c) : 0;
  return `${cv}${unit} / ${Math.round(t)}${unit}`;
}

const MACRO_PILLARS = [
  {
    id: 'protein',
    icon: '🥩',
    title: 'Proteine & massa magra',
    accent: 'violet',
    positive: 'Sintesi proteica stimolata e protezione della massa muscolare attiva.',
    corrective: 'Apporto proteico sotto soglia: rischio catabolismo e mancato recupero muscolare.',
    tip: 'Integra una fonte ad alto valore biologico al prossimo pasto (uova, pesce azzurro, legumi + cereali).',
    key: 'prot',
    unit: 'g',
  },
  {
    id: 'calories',
    icon: '🔥',
    title: 'Bilancio calorico & metabolismo',
    accent: 'orange',
    positive: 'Deficit controllato ideale per ossidare grasso preservando il tessuto metabolicamente attivo.',
    corrective: 'Taglio calorico eccessivo (rischio rallentamento tiroideo/cortisolo) o surplus non programmato.',
    tip: 'Calibra l\'introito entro ±10% del target TDEE per la fase attuale (ricomposizione / mantenimento).',
    key: 'kcal',
    unit: ' kcal',
  },
  {
    id: 'carbs',
    icon: '🍞',
    title: 'Carboidrati & glicogeno',
    accent: 'cyan',
    positive: 'Ottima disponibilità energetica per allenamenti e supporto alla leptina/tiroide.',
    corrective: 'Carboidrati troppo bassi (calo di focus/forza) o sbilanciati su zuccheri semplici.',
    tip: 'Preferisci carboidrati complessi a rilascio lento (avena, riso integrale, patate) intorno al training.',
    key: 'carb',
    unit: 'g',
  },
  {
    id: 'fats',
    icon: '🥑',
    title: 'Grassi essenziali & ormoni',
    accent: 'lime',
    positive: 'Profilo lipidico eccellente per la sintesi ormonale e assorbimento vitaminico.',
    corrective: 'Grassi sotto-soglia: rischio alterazione ormonale e ridotto senso di sazietà.',
    tip: 'Integra olio EVO a crudo, frutta secca o Omega-3 nel pasto principale.',
    key: 'fat',
    unit: 'g',
  },
];

/**
 * @param {object} totals
 * @param {object} targets
 * @param {number|null} settingsBaseKcal
 * @param {ReturnType<typeof resolveProgressionDayEvaluationContext>|null} [dayContext]
 */
export function buildMacroPillarInsights(
  totals = {},
  targets = {},
  settingsBaseKcal = null,
  dayContext = null,
) {
  const t = resolveProgressionNutritionTargets(targets);
  const ctx = dayContext && typeof dayContext === 'object'
    ? dayContext
    : { isDayOpenForEvaluation: false, dayClosed: true };
  const intake = {
    kcal: Number(totals?.kcal) || 0,
    prot: Number(totals?.prot ?? totals?.pro) || 0,
    carb: Number(totals?.carb) || 0,
    fat: Number(totals?.fatTotal ?? totals?.fat) || 0,
  };
  const tdee = Number(settingsBaseKcal) > 0 ? Math.round(Number(settingsBaseKcal)) : t.kcal;

  const pctMap = {
    protein: macroAdherencePct(intake.prot, t.prot),
    calories: macroAdherencePct(intake.kcal, t.kcal),
    carbs: macroAdherencePct(intake.carb, t.carb),
    fats: macroAdherencePct(intake.fat, t.fat),
  };

  const progressMap = {
    protein: t.prot > 0 ? Math.min(100, Math.round((intake.prot / t.prot) * 100)) : 0,
    calories: t.kcal > 0 ? Math.min(100, Math.round((intake.kcal / t.kcal) * 100)) : 0,
    carbs: t.carb > 0 ? Math.min(100, Math.round((intake.carb / t.carb) * 100)) : 0,
    fats: t.fat > 0 ? Math.min(100, Math.round((intake.fat / t.fat) * 100)) : 0,
  };

  const valueMap = {
    protein: intake.prot,
    calories: intake.kcal,
    carbs: intake.carb,
    fats: intake.fat,
  };

  const targetMap = {
    protein: t.prot,
    calories: t.kcal,
    carbs: t.carb,
    fats: t.fat,
  };

  return MACRO_PILLARS.map((pillar) => {
    const adherencePct = pctMap[pillar.id];
    const consumed = valueMap[pillar.id];
    const target = targetMap[pillar.id];
    const underTarget = Number(target) > 0 && Number(consumed) < Number(target) * 0.92;
    const realtime = ctx.intradayRealtimePenalties || {};
    const forcePenalty = (
      pillar.id === 'calories'
      && (realtime.earlyCalorieSurplus || realtime.fullDayCalorieSurplus)
    ) || (
      pillar.id === 'fats'
      && realtime.earlyLipidSurplus
    );

    if (ctx.isDayOpenForEvaluation && underTarget && !forcePenalty) {
      const progressPct = progressMap[pillar.id];
      const detail = formatMacroLine(consumed, target, pillar.unit);
      return {
        ...pillar,
        pct: progressPct,
        tone: 'info',
        detail,
        feedback: buildIntradayObjectiveFeedback(pillar.id, intake, t),
        tip: pillar.tip,
        isPositive: false,
        isInProgress: true,
        skipPenalty: true,
      };
    }

    const pct = adherencePct;
    const tone = toneFromPct(pct, { isInProgress: false });
    const isPositive = pct != null && pct >= 70 && !forcePenalty;
    const detail = formatMacroLine(consumed, target, pillar.unit);
    const tdeeNote = pillar.id === 'calories' && tdee !== t.kcal
      ? ` · TDEE ref. ${tdee} kcal`
      : '';

    let feedback = isPositive ? pillar.positive : pillar.corrective;
    if (forcePenalty && pillar.id === 'calories') {
      feedback = realtime.fullDayCalorieSurplus
        ? 'Surplus calorico già oltre il target giornaliero: riduci densità calorica nei prossimi pasti.'
        : 'Superamento precoce del tetto calorico a metà giornata: rallenta introito e preferisci volumi maggiori.';
    } else if (forcePenalty && pillar.id === 'fats') {
      feedback = 'Superamento precoce del tetto lipidico a metà giornata: riduci condimenti e frutta secca.';
    }

    return {
      ...pillar,
      pct: pct ?? 0,
      tone: forcePenalty ? 'low' : tone,
      detail: `${detail}${tdeeNote}`,
      feedback,
      tip: pillar.tip,
      isPositive,
      isInProgress: false,
      skipPenalty: false,
    };
  });
}

/**
 * Pagella di Ricomposizione — L2 Progressione.
 * @param {number|null} score
 * @param {object} breakdown
 * @param {Array} macroPillars
 * @param {ReturnType<typeof resolveProgressionDayEvaluationContext>|null} [dayContext]
 */
export function buildProgressionPagellaInsight(
  score,
  breakdown = {},
  macroPillars = [],
  dayContext = null,
) {
  const value = Number.isFinite(Number(score)) ? Math.round(Number(score)) : null;
  const statusLabel = progressionStatusLabel(value);
  const b = breakdown && typeof breakdown === 'object' ? breakdown : {};
  const ctx = dayContext && typeof dayContext === 'object'
    ? dayContext
    : { isDayOpenForEvaluation: false, dayClosed: true, intradayRealtimePenalties: {} };

  const strengths = [];
  const penalties = [];
  const todayObjectives = [];

  macroPillars.filter((p) => p.isPositive).forEach((p) => {
    strengths.push({
      id: p.id,
      badge: '✅',
      title: p.title,
      body: p.feedback,
    });
  });

  if (ctx.isDayOpenForEvaluation) {
    macroPillars
      .filter((p) => p.isInProgress || p.skipPenalty)
      .forEach((p) => {
        todayObjectives.push({
          id: p.id,
          badge: p.icon,
          title: p.title.split('&')[0].trim(),
          body: p.feedback,
        });
      });

    macroPillars
      .filter((p) => !p.isPositive && !p.skipPenalty)
      .forEach((p) => {
        penalties.push({
          id: p.id,
          badge: p.pct < 40 ? '🔴' : '🟡',
          title: p.title,
          body: p.feedback,
          severity: p.pct < 40 ? 'red' : 'amber',
        });
      });

    const rt = ctx.intradayRealtimePenalties || {};
    if (rt.unplannedProlongedFast) {
      penalties.push({
        id: 'unplanned_fast',
        badge: '⏱️',
        title: 'Digiuno non pianificato',
        body: 'Allenamento mattutino svolto ma finestra alimentare ancora chiusa: priorità refuel proteico entro 2 ore.',
        severity: 'amber',
      });
    }
  } else {
    macroPillars.filter((p) => !p.isPositive).forEach((p) => {
      penalties.push({
        id: p.id,
        badge: p.pct < 40 ? '🔴' : '🟡',
        title: p.title,
        body: p.feedback,
        severity: p.pct < 40 ? 'red' : 'amber',
      });
    });
  }

  if (Number(b.trainingPct) >= 70) {
    strengths.push({
      id: 'training',
      badge: '💪',
      title: 'Volume allenamento',
      body: 'Volume ottimale: lo stimolo muscolare è costante e ben distribuito.',
    });
  } else if (Number(b.trainingPct) >= 40) {
    penalties.push({
      id: 'training',
      badge: '🏋️',
      title: 'Volume allenamento',
      body: 'Stimolo parziale: alcuni gruppi muscolari stanno entrando in fase di recupero totale, valuta un richiamo.',
      severity: 'amber',
    });
  } else {
    penalties.push({
      id: 'training',
      badge: '⚠️',
      title: 'Volume allenamento',
      body: 'Detraining in corso: lo stimolo meccanico è insufficiente per mantenere la sintesi proteica, a prescindere dall\'alimentazione.',
      severity: 'red',
    });
  }

  if (Number(b.sleepPct) >= 75) {
    strengths.push({
      id: 'sleep',
      badge: '😴',
      title: 'Recupero notturno',
      body: 'Il sonno medio sostiene sintesi proteica e adattamento al carico.',
    });
  } else if (Number(b.sleepPct) < 50 && Number(b.sleepAvg) > 0) {
    penalties.push({
      id: 'sleep',
      badge: '🌙',
      title: 'Debito di sonno',
      body: 'Sonno medio sotto target: priorità recupero per non frenare la ricomposizione.',
      severity: 'amber',
    });
  }

  const weakest = macroPillars.length
    ? macroPillars.reduce((min, p) => (!min || p.pct < min.pct ? p : min), null)
    : null;

  const cta = weakest
    ? {
        badge: '🎯',
        title: `Prossimo pasto · ${weakest.title.split('&')[0].trim()}`,
        body: weakest.tip,
      }
    : {
        badge: '🎯',
        title: 'Prossimo pasto · equilibrio macro',
        body: 'Mantieni proteine, carboidrati complessi e grassi essenziali entro ±10% del target.',
      };

  return {
    statusLabel,
    scoreLabel: value != null ? `${value}/100 — ${statusLabel}` : '—/100',
    microLabel: ctx.isDayOpenForEvaluation
      ? 'GIORNATA IN CORSO • OBIETTIVI ATTIVI'
      : (value != null ? `${statusLabel.toUpperCase()} • TARGET ATTIVO` : 'IN CALIBRAZIONE'),
    strengths,
    penalties,
    todayObjectives,
    isDayInProgress: Boolean(ctx.isDayOpenForEvaluation),
    cta,
    bars: macroPillars.map((p) => ({
      id: p.id,
      label: p.title.split('&')[0].trim(),
      detail: p.detail,
      pct: p.pct,
      tone: p.tone,
    })),
  };
}

/**
 * Trend aderenza 7g / 14g da finestra giorni.
 * @param {Array<{ date: string, kcal?: number, prot?: number }>} days
 * @param {object} targets
 */
export function buildProgressionTrendSnapshots(days = [], targets = {}) {
  const t = resolveProgressionNutritionTargets(targets);
  const sorted = [...days].filter((d) => d?.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const scoreWindow = (windowDays) => {
    const slice = sorted.slice(0, windowDays);
    const scores = slice
      .map((d) => {
        const kcal = Number(d.kcal) || 0;
        if (kcal < 300) return null;
        const prot = Number(d.prot) || 0;
        const kcalScore = Math.max(0, 1 - Math.abs(kcal - t.kcal) / t.kcal);
        const protScore = Math.max(0, 1 - Math.abs(prot - t.prot) / t.prot);
        return (kcalScore * 0.6 + protScore * 0.4) * 100;
      })
      .filter((n) => n != null);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  };

  return {
    adherence7d: scoreWindow(7),
    adherence14d: scoreWindow(14),
    daysLogged: sorted.filter((d) => (Number(d.kcal) || 0) >= 300).length,
  };
}

export { MACRO_PILLARS as PROGRESSION_MACRO_PILLARS };
