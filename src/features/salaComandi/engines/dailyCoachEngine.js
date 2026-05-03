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
      !summaryNext.toLowerCase().includes('negli ultimi giorni il sonno')
    ) {
      summaryNext = `Negli ultimi giorni il recupero del sonno è stato irregolare. ${summaryNext}`.trim();
      pushTrendDetailUnique('Trend', 'Sonno fragile ricorrente', 'dailyCoachTrends');
    }
  }

  if (patches.caffeine) {
    const sleepProblems =
      ctx.sleepDisrupted || ctx.causesPresent || Boolean(ctx.eveningStressCause);
    if (
      hasTrendPatternById(trends, 'repeated_late_caffeine') &&
      sleepProblems &&
      !summaryNext.toLowerCase().includes('caffeina dopo')
    ) {
      summaryNext =
        `${summaryNext} Spesso registri caffeina dopo le 14: prova ad anticiparla di qualche ora.`.trim();
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
    summaryNext =
      'Gli Omega-3 risultano bassi da più giorni: oggi conviene correggere la qualità nutrizionale.';
    if (ctx.protLow) {
      summaryNext +=
        ' Anche le proteine restano dietro alla quota giornaliera che ti sei dato nei target.';
    }
    pushTrendDetailUnique('Trend', 'Omega-3 basso ricorrente', 'dailyCoachTrends');
  }

  if (trends.status === 'patterns_detected' && patches.confidence) {
    pushTrendDetailUnique(
      'Confidenza',
      'Più salda perché confermata nei giorni scorsi',
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
        'Oggi il divario calorie è netto sul totale giornaliero: ha più senso allentare il freno che spingere oltre il deficit.';
    }
    if (!summary && sleepDisrupted && causesPresent) {
      summary =
        'Il recupero oggi conta più del target: il sonno è fragile e i segnali serali nei log suggeriscono prudenza.';
    }
    if (!summary && recoverySoft) {
      summary =
        'Il sonno segnala attenzione, ma dai dati oggi le evidenze restano contenute — resta su carichi sobri.';
    }
    if (!summary) {
      summary =
        'I segnali su recupero o sulla serata suggeriscono di non forzare obiettivi troppo stretti oggi.';
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
        title: 'Il recupero viene prima',
        summary,
        action:
          'Mantieni carichi contenuti ed evita di stringere deficit o allenamenti impegnativi la sera finché non torni più lucido sul sonno.',
        reason:
          'Combinazione dei dati su sonno con segnali serali o calorie nei log porta a dare più spazio al recupero prima del target.',
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
        'Alle ~20 vedi ancora pochissima riserva sul modello: valuta nutriente prima dello sforzo se devi caricare dopo.';
    }
    if (!summary)
      summary =
        'Dopo una fascia lunga senza pasto la riserva scende veloce: aggiungi un supporto calorie vicino allo sforzo.';

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
        title: 'Gestisci l’energia oggi',
        summary,
        action:
          'Metti uno spuntino o un pasto leggero con proteine e carboidrati poco prima della parte più impegnativa della giornata.',
        reason:
          'Emergono sia i flag di energia serale giornaliero sia suggerimenti del coach AI o del metabolismo nei dati attuali.',
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
    if (omegaLow) parts.push('Gli Omega-3 nel totale di oggi restano chiaramente bassi sulla soglia che usiamo nei dati.');
    if (protLow)
      parts.push('Le proteine sono ancora lontane dalla quota utile nei target che hai caricato nei totali giornalieri.');

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
        title: 'Nutrizione da sistemare',
        summary:
          parts.join(' ') ||
          'Nel totale di oggi manca equilibrio su micro e macro nei numeri disponibili: conviene sistemare nei prossimi pasti.',
        action:
          'Nei pasti che restano porta pesce ricco di Omega-3 (o quota equivalente) e riparti le proteine in porzioni più piene.',
        reason:
          'Abbiamo solo i totali giornalieri caricati dall’app, senza nulla fuori dai numeri Omega-3/proteine che vedi sopra.',
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
      ? `Ti ritrovi nei segnali registrati: tieni "${strategyLabel}" finché nuovi dati non spostano davvero la priorità.`
      : 'I segnali di oggi restano allineati senza spia netta su recupero, energia o micro.';

  return enrichDailyCoachWithTrends(
    {
      status: 'continuity_ok',
      priority: 'continuity',
      title: 'Continua così',
      summary: summaryNeutral,
      action:
        strategyLabel && strategyLabel !== 'standard'
          ? `Allinea i prossimi pasti a "${strategyLabel}" senza forzare cambi bruschi fuori dal piano.`
          : 'Continua così: oggi non servono correzioni importanti.',
      reason:
        'Dai dati passati oggi non salta fuori alcun campanello alto su recupero, energia serale o micronutrienti.',
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
