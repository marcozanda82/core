/**
 * Aggregazione pura delle priorità del coach giornaliero.
 * Nessuna dipendenza React, né storage né side-effect — solo gli oggetti passati nel `input`.
 */

import { analyzeDailyCoachTrends } from '@/features/salaComandi/engines/dailyCoachTrendsEngine';

const COACH_RULE_IDS = {
  NO_FOOD: 'no_food',
  CAL_LOW: 'cal_low',
};

const EVENING_SLEEP_RISK_IDS = new Set([
  'late_caffeine',
  'late_intense_workout',
  'evening_alcohol',
  'late_heavy_meal',
  'late_nap',
  'large_calorie_deficit',
]);

function num(v, fb = null) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fb;
}

function isNonEmptyObj(o) {
  return o != null && typeof o === 'object' && !Array.isArray(o);
}

function omega3Low(omegaRaw) {
  const o = num(omegaRaw, null);
  return o != null && o < 1;
}

function eveningEnergyRisk(energyAt20) {
  const e = num(energyAt20, null);
  return e != null && e < 40;
}

function hasStrongLikelyCause(causes) {
  if (!Array.isArray(causes) || causes.length === 0) return false;
  for (let i = 0; i < causes.length; i += 1) {
    const c = causes[i];
    if (!c || typeof c !== 'object') continue;
    const conf = num(c.confidence, 0);
    const sev = String(c.severity || '').toLowerCase();
    if (conf >= 0.55 && sev !== '' && sev !== 'low') return true;
  }
  return false;
}

function hasEveningLinkedCauseIds(causes) {
  if (!Array.isArray(causes)) return false;
  for (let i = 0; i < causes.length; i += 1) {
    const id = causes[i]?.id;
    if (typeof id === 'string' && EVENING_SLEEP_RISK_IDS.has(id)) return true;
  }
  return false;
}

/**
 * Deficit calorico "aggressivo" solo da numeri forniti: obiettivo − assunto sopra soglia prudenziale.
 * @param {object | null | undefined} nutritionTotals
 */
function aggressiveDailyDeficit(nutritionTotals) {
  if (!isNonEmptyObj(nutritionTotals)) return false;
  const target = num(nutritionTotals.targetKcal ?? nutritionTotals.dailyTargetKcal, null);
  const eaten = num(nutritionTotals.kcal ?? nutritionTotals.consumedKcal, null);
  if (target == null || eaten == null || target <= 0) return false;
  return target - eaten > 600;
}

function pickAiSuggestion(aiDayCoach) {
  if (!isNonEmptyObj(aiDayCoach)) return null;
  const s = aiDayCoach.suggestion;
  return s && typeof s === 'object' ? s : null;
}

function metabolismWarning(metabolicCoach) {
  if (!isNonEmptyObj(metabolicCoach)) return false;
  return String(metabolicCoach.severity || '') === 'warning';
}

function lowProteinSignals(nutritionTotals) {
  if (!isNonEmptyObj(nutritionTotals)) return false;
  const prot = num(nutritionTotals.prot, null);
  const targetProt = num(nutritionTotals.targetProt, null);
  const kcal = num(nutritionTotals.kcal, null);
  if (prot == null || targetProt == null || targetProt <= 0) return false;
  if (kcal != null && kcal < 200) return false;
  return prot / targetProt < 0.62;
}

function strategySuggestsAggressiveDeficit(strategyLabel) {
  const s = String(strategyLabel || '').toLowerCase();
  if (!s) return false;
  return s.includes('dimag') || s.includes('negat') || s.includes('deficit') || s.includes('cut');
}

/**
 * @param {object | null} trends Risultato di analyzeDailyCoachTrends oppure null se insufficient_data / ignorato
 * @param {string} id
 */
function hasTrendPatternById(trends, id) {
  if (!trends || trends.status === 'insufficient_data') return false;
  if (trends.status !== 'patterns_detected') return false;
  const arr = Array.isArray(trends.patterns) ? trends.patterns : [];
  return arr.some((p) => p && String(p.id) === String(id));
}

/** @typedef {{ summary: boolean, caffeine: boolean, omega: boolean, evening: boolean, confidence: boolean }} TrendPatchFlags */

/**
 * Migliorie non invasive da trend storici (solo testo/details, stessa forma output).
 *
 * @param {object | null | undefined} result
 * @param {object | null} trends
 * @param {object} ctx
 * @param {TrendPatchFlags} patches
 */
function enrichDailyCoachWithTrends(result, trends, ctx, patches) {
  if (!result || !trends || trends.status === 'insufficient_data') return result;

  /** @type {typeof result} */
  const out = { ...result };
  /** @type {{ label: string, value: string, source: string }[]} */
  const detailsNext = [...(Array.isArray(result.details) ? result.details : [])];

  const pushTrendDetailUnique = (label, value, sourceOverride) => {
    const l = String(label);
    const v = String(value);
    const source = sourceOverride || 'dailyCoachTrends';
    if (detailsNext.some((d) => d.label === l && d.value === v && d.source === source)) return;
    detailsNext.push({ label: l, value: v, source });
  };

  let summaryNext = String(result.summary ?? '').trim();

  if (patches.summary) {
    if (
      ctx.sleepDisrupted &&
      hasTrendPatternById(trends, 'repeated_sleep_disruption') &&
      !summaryNext.toLowerCase().includes('sonno è stato instabile')
    ) {
      summaryNext = `Negli ultimi giorni il sonno è stato instabile. ${summaryNext}`.trim();
      pushTrendDetailUnique('Trend', 'Sonno fragile ricorrente', 'dailyCoachTrends');
    }
  }

  if (patches.caffeine) {
    const sleepProblems =
      ctx.sleepDisrupted || ctx.causesPresent || Boolean(ctx.eveningStressCause);
    if (
      hasTrendPatternById(trends, 'repeated_late_caffeine') &&
      sleepProblems &&
      !summaryNext.toLowerCase().includes('caffeina')
    ) {
      summaryNext =
        `${summaryNext} La caffeina in orari tardi ricorre nei dati recenti: valuta di anticiparla.`.trim();
      pushTrendDetailUnique('Trend', 'Caffeina tardiva ricorrente', 'dailyCoachTrends');
    }
  }

  if (
    patches.evening &&
    hasTrendPatternById(trends, 'repeated_evening_energy_risk')
  ) {
    pushTrendDetailUnique('Trend', 'Energia serale instabile', 'dailyCoachTrends');
  }

  if (patches.omega && hasTrendPatternById(trends, 'repeated_low_omega3') && ctx.omegaLowNow) {
    summaryNext = 'Omega-3 basso da più giorni';
    if (ctx.protLow) {
      summaryNext +=
        ' Proteine giornaliere lontane dal fabbisogno indicativo nei totali consegnati.';
    }
    pushTrendDetailUnique('Trend', 'Omega-3 basso ricorrente', 'dailyCoachTrends');
  }

  if (trends.status === 'patterns_detected' && patches.confidence) {
    pushTrendDetailUnique(
      'Confidenza',
      'Rafforzata da storico multi-giorno',
      'dailyCoachTrends',
    );
  }

  out.summary = summaryNext;
  out.details = detailsNext;
  return out;
}

/**
 * Priorità giornaliero: uso esclusivamente i payload passati dai motori/UI esistenti.
 *
 * @param {object} [input]
 * @param {object} [input.sleepCoach]
 * @param {object} [input.metabolicCoach]
 * @param {object} [input.dailyIndicators]
 * @param {string} [input.calorieStrategy]
 * @param {object} [input.nutritionTotals]
 * @param {object} [input.aiDayCoach]
 * @param {unknown[]} [input.dailyHistory]
 * @param {unknown[]} [input.sleepHistory]
 * @param {unknown[]} [input.nutritionHistory]
 */
export function analyzeDailyCoach(input = {}) {
  const trendsAnalysis = analyzeDailyCoachTrends({
    dailyHistory: input?.dailyHistory,
    sleepHistory: input?.sleepHistory,
    nutritionHistory: input?.nutritionHistory,
  });
  const trends = trendsAnalysis.status === 'insufficient_data' ? null : trendsAnalysis;

  const sleepCoach = isNonEmptyObj(input.sleepCoach) ? input.sleepCoach : null;
  const metabolicCoach = isNonEmptyObj(input.metabolicCoach) ? input.metabolicCoach : null;
  const dailyIndicators = isNonEmptyObj(input.dailyIndicators) ? input.dailyIndicators : null;
  const nutritionTotals = isNonEmptyObj(input.nutritionTotals) ? input.nutritionTotals : null;
  const aiDayCoach = isNonEmptyObj(input.aiDayCoach) ? input.aiDayCoach : null;

  const strategyLabel =
    input.calorieStrategy != null ? String(input.calorieStrategy).trim() : '';

  /** @type {string[]} */
  const debug = [];

  const causeList = Array.isArray(sleepCoach?.likelyCauses) ? sleepCoach.likelyCauses : [];

  const sleepDisrupted = String(sleepCoach?.status || '') === 'sleep_disrupted';
  const causesPresent = causeList.length > 0;
  const causesStrong = hasStrongLikelyCause(causeList);
  const eveningStressCause = hasEveningLinkedCauseIds(causeList);
  const deficitStress = aggressiveDailyDeficit(nutritionTotals);

  if (sleepDisrupted) debug.push('sleepCoach.status_sleep_disrupted');
  if (causesPresent) debug.push('sleepCoach.likelyCauses_nonempty');
  if (causesStrong) debug.push('sleepCoach.likelyCauses_strongConfidence');
  if (eveningStressCause) debug.push('sleepCoach.eveningLinkedCause_ids');
  if (deficitStress) debug.push('nutritionTotals.aggressive_deficit_estimate');

  const aiSugg = pickAiSuggestion(aiDayCoach);
  const ruleId = aiSugg?.ruleId != null ? String(aiSugg.ruleId) : '';
  const catabLike =
    aiSugg && (ruleId === COACH_RULE_IDS.CAL_LOW || ruleId === COACH_RULE_IDS.NO_FOOD);
  if (catabLike) debug.push(`aiDayCoach.${ruleId}`);

  const energyLow = eveningEnergyRisk(
    dailyIndicators?.energyAt20Percent ?? dailyIndicators?.energyAtEveningPercent,
  );
  if (energyLow) debug.push('dailyIndicators.evening_energy_low');

  const metaWarn = metabolismWarning(metabolicCoach);
  if (metaWarn) debug.push('metabolicCoach.severity_warning');

  const omegaIndicators = dailyIndicators?.omega3;
  const omegaNutrition = nutritionTotals?.omega3;
  const omegaForCheck = omegaIndicators != null ? omegaIndicators : omegaNutrition;
  const omegaLow = omega3Low(omegaForCheck ?? undefined);

  if (omegaLow) debug.push('omega3_below_threshold');

  const protLow = lowProteinSignals(nutritionTotals);
  if (protLow) debug.push('nutritionTotals.protein_below_ratio');

  const recoveryStrong =
    (sleepDisrupted && (causesStrong || causesPresent)) ||
    deficitStress ||
    eveningStressCause;

  const recoverySoft = sleepDisrupted && !recoveryStrong;

  /** Valori ripassati ai patch trend (solo arricchimento testo/details). */
  const trendCtx = {
    sleepDisrupted,
    causesPresent,
    eveningStressCause,
    omegaLowNow: omegaLow,
    protLow,
  };

  /** ------- 1 · Recupero / rischio ------- */
  if (recoveryStrong || recoverySoft) {
    let narrative =
      sleepCoach?.narrative != null ? String(sleepCoach.narrative).trim().slice(0, 420) : '';

    let summary = narrative;
    if (!summary && deficitStress && !sleepDisrupted) {
      summary =
        'Divario giornaliero ampio tra assunzione calorica e target: migliori margini recupero riducendo la pressione aggiuntiva.';
    }
    if (!summary && sleepDisrupted && causesPresent) {
      summary =
        'Sonno segnato come disturbato con correlati nei log: preferisci attenzione al recupero rispetto a obiettivi aggressivi.';
    }
    if (!summary && recoverySoft) {
      summary =
        'Recupero e sonno meritano attenzione: segnali deboli o limitati nei dati disponibili oggi.';
    }
    if (!summary) {
      summary =
        'Segnali di recupero o interferenze serali sulla notte: evita ulteriormente di forzare la giornata.';
    }

    /** @type {{ label: string, value: string, source: string }[]} */
    const details = [
      {
        label: 'Sonno (stato)',
        value: String(sleepCoach?.status ?? '—'),
        source: 'sleepCoach',
      },
      {
        label: 'Cause considerate',
        value: String(causeList.length),
        source: 'sleepCoach.likelyCauses',
      },
    ];

    if (deficitStress) {
      details.push({
        label: 'Deficit kcal stimato vs target',
        value: '> 600 (euristica numerica)',
        source: 'nutritionTotals',
      });
    }

    const goalConflict = deficitStress || eveningStressCause || recoveryStrong || sleepDisrupted;

    return enrichDailyCoachWithTrends(
      {
        status: 'recovery_focus',
        priority: 'recovery',
        title: 'Priorità recupero',
        summary,
        action:
          'Evita di stringere ulteriormente il deficit calorico o sessioni pesanti serali finché non recuperi ritmo.',
        reason:
          'Decisione basata su sonno/disturbi nei log e/o correlati recupero e deficit giornaliero o eventi serali segnalati dai motori di sonno.',
        severity: 'warning',
        overridesGoal: Boolean(goalConflict),
        source:
          deficitStress && !sleepDisrupted
            ? 'nutritionTotals_deficit'
            : eveningStressCause || causesPresent
              ? 'sleepCoach_aggregate'
              : sleepDisrupted
                ? 'sleepCoach_status'
                : 'recovery_signals',
        details,
        debug,
      },
      trends,
      trendCtx,
      { summary: true, caffeine: true, evening: true, omega: false, confidence: true },
    );
  }

  /** ------- 2 · Performance (energia / digiuno) ------- */
  if (catabLike || (energyLow && metaWarn) || (energyLow && aiSugg)) {
    let summary = aiSugg?.message != null ? String(aiSugg.message).trim().slice(0, 380) : '';
    if (!summary && energyLow) {
      summary =
        'Energia serale molto bassa nel modello giornaliero: attenzione a sessioni impegnative a digiuno.';
    }
    if (!summary)
      summary = 'Rischio di energia limitata prima dell’allenamento o dopo una finestra lunga vuota di cibo.';

    const overridesGoal = catabLike && strategySuggestsAggressiveDeficit(strategyLabel);

    /** @type {{ label: string, value: string, source: string }[]} */
    const details = [
      {
        label: 'Regola giornaliero',
        value: ruleId || '—',
        source: 'aiDayCoach.suggestion.ruleId',
      },
      {
        label: '% energia h≈20',
        value:
          dailyIndicators?.energyAt20Percent != null &&
          Number.isFinite(num(dailyIndicators.energyAt20Percent, NaN))
            ? String(Math.round(Number(dailyIndicators.energyAt20Percent)))
            : '—',
        source: 'dailyIndicators',
      },
      {
        label: 'Metabolismo (coach)',
        value: String(metabolicCoach?.title ?? metabolicCoach?.severity ?? '—'),
        source: 'metabolicCoach',
      },
    ];

    let src = 'merged';
    if (aiSugg) src = 'aiDayCoach';
    else if (energyLow) src = 'dailyIndicators_energy';

    return enrichDailyCoachWithTrends(
      {
        status: 'performance_focus',
        priority: 'performance',
        title: 'Priorità energia',
        summary,
        action:
          'Preferisci un supporto nutriente mirato prima dell’allenamento o della fascia più critica (senza cambi drastici fuori dai dati disponibili).',
        reason:
          'Messaggio combinato dai flag energia giornaliero e dal coach AI giornaliero o dal modello energetico serale quando presente.',
        severity: 'warning',
        overridesGoal,
        source: src,
        details,
        debug,
      },
      trends,
      trendCtx,
      { summary: false, caffeine: true, evening: true, omega: false, confidence: true },
    );
  }

  /** ------- 3 · Qualità nutrizionale ------- */
  if (omegaLow || protLow) {
    const parts = [];
    if (omegaLow) parts.push('Omega‑3 giornaliero sotto soglia osservabile (< 1 g nell’aggregate fornito).');
    if (protLow)
      parts.push('Proteine giornaliere lontane dal fabbisogno indicativo nei totali consegnati.');

    /** @type {{ label: string, value: string, source: string }[]} */
    const details = [];
    if (omegaLow) {
      const v = omegaForCheck != null && Number.isFinite(num(omegaForCheck, NaN)) ? num(omegaForCheck) : omegaForCheck;
      details.push({
        label: 'Omega‑3 (g)',
        value: String(v ?? '—'),
        source:
          omegaIndicators != null ? 'dailyIndicators.omega3' : 'nutritionTotals.omega3',
      });
    }
    if (protLow) {
      details.push({
        label: 'Proteine giornaliere (g)',
        value: `${String(num(nutritionTotals?.prot, NaN))} / ${String(num(nutritionTotals?.targetProt, NaN))}`,
        source: 'nutritionTotals',
      });
    }

    return enrichDailyCoachWithTrends(
      {
        status: 'nutrition_focus',
        priority: 'nutrition_quality',
        title: 'Priorità micronutrienti',
        summary: parts.join(' ') || 'Serve un miglioramento mirato sul fronte micro/macro nei dati forniti.',
        action:
          'Valorizza fonti ricche di Omega‑3 e distribuzione proteica nei pasti rimanenti, mantenendo coerenza generale dei target.',
        reason:
          'Soglie dai soli aggregati giornalieri (Omega‑3 e/o rapporto proteine) senza ulteriori inferenze esterne.',
        severity: 'info',
        overridesGoal: false,
        source: omegaLow ? 'omega3_threshold' : 'protein_totals',
        details,
        debug,
      },
      trends,
      trendCtx,
      { summary: false, caffeine: false, evening: false, omega: true, confidence: true },
    );
  }

  /** ------- 4 · Continuità / target calorie ------- */
  /** @type {{ label: string, value: string, source: string }[]} */
  const detailsContinuity = [
    {
      label: 'Strategia calorie',
      value: strategyLabel || 'standard',
      source: 'calorieStrategy',
    },
    {
      label: 'Metabolismo (coach)',
      value: String(metabolicCoach?.title ?? metabolicCoach?.severity ?? 'stabile'),
      source: 'metabolicCoach',
    },
  ];

  const summaryNeutral =
    strategyLabel.length > 0
      ? `La giornata appare ordinata nei segnali forniti: continua "${strategyLabel}" finché nuovi dati non cambiano le priorità.`
      : 'La giornata è coerente con il piano.';

  return enrichDailyCoachWithTrends(
    {
      status: 'continuity_ok',
      priority: 'continuity',
      title: 'Continuità',
      summary: summaryNeutral,
      action:
        strategyLabel && strategyLabel !== 'standard'
          ? `Prosegui allineando i pasti a "${strategyLabel}" senza correzioni forzate.`
          : 'Prosegui senza correzioni importanti.',
      reason:
        'Nessun campanello forte da recupero, energia o micro nei dati passati — raccomandazione prudenziale neutra.',
      severity: 'good',
      overridesGoal: false,
      source: 'continuity',
      details: detailsContinuity,
      debug,
    },
    trends,
    trendCtx,
    { summary: false, caffeine: true, evening: true, omega: false, confidence: true },
  );
}
