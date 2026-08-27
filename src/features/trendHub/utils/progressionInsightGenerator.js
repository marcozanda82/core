import { resolveProgressionNutritionTargets } from './saluteDashboardMetrics';

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

function toneFromPct(pct) {
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
 */
export function buildMacroPillarInsights(totals = {}, targets = {}, settingsBaseKcal = null) {
  const t = resolveProgressionNutritionTargets(targets);
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
    const pct = pctMap[pillar.id];
    const tone = toneFromPct(pct);
    const isPositive = pct != null && pct >= 70;
    const detail = formatMacroLine(valueMap[pillar.id], targetMap[pillar.id], pillar.unit);
    const tdeeNote = pillar.id === 'calories' && tdee !== t.kcal
      ? ` · TDEE ref. ${tdee} kcal`
      : '';

    return {
      ...pillar,
      pct: pct ?? 0,
      tone,
      detail: `${detail}${tdeeNote}`,
      feedback: isPositive ? pillar.positive : pillar.corrective,
      tip: pillar.tip,
      isPositive,
    };
  });
}

/**
 * Pagella di Ricomposizione — L2 Progressione.
 * @param {number|null} score
 * @param {object} breakdown
 * @param {Array} macroPillars
 */
export function buildProgressionPagellaInsight(score, breakdown = {}, macroPillars = []) {
  const value = Number.isFinite(Number(score)) ? Math.round(Number(score)) : null;
  const statusLabel = progressionStatusLabel(value);
  const b = breakdown && typeof breakdown === 'object' ? breakdown : {};

  const strengths = [];
  const penalties = [];

  macroPillars.filter((p) => p.isPositive).forEach((p) => {
    strengths.push({
      id: p.id,
      badge: '✅',
      title: p.title,
      body: p.feedback,
    });
  });

  macroPillars.filter((p) => !p.isPositive).forEach((p) => {
    penalties.push({
      id: p.id,
      badge: p.pct < 40 ? '🔴' : '🟡',
      title: p.title,
      body: p.feedback,
      severity: p.pct < 40 ? 'red' : 'amber',
    });
  });

  if (Number(b.trainingPct) >= 75) {
    strengths.push({
      id: 'training',
      badge: '💪',
      title: 'Volume allenamento',
      body: 'Stai rispettando il volume previsto: lo stimolo muscolare resta costante.',
    });
  } else if (Number(b.trainingPct) < 50) {
    penalties.push({
      id: 'training',
      badge: '🏋️',
      title: 'Volume sotto target',
      body: 'Le sessioni completate sono insufficienti rispetto al piano 14 giorni.',
      severity: 'amber',
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
    microLabel: value != null ? `${statusLabel.toUpperCase()} • TARGET ATTIVO` : 'IN CALIBRAZIONE',
    strengths,
    penalties,
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
