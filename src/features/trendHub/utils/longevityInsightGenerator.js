/**
 * Generatore insight «Pagella Metabolica» — parlante e prescrittivo.
 * Tre blocchi: punti di forza · penalità · leva strategica (CTA).
 * Pilastri Longevità: 4 × 25 (Cardio, Forza, Sonno, Nutrizione Clinica).
 */

import { LONGEVITY_PILLAR_MAX } from './saluteDashboardMetrics.js';

const PILLAR_MAX = LONGEVITY_PILLAR_MAX; // 25
const CARDIO_TARGET_MIN = 150;
const SLEEP_TARGET_H = 7;
const WEIGHTS_TARGET_GROUPS = 5;

/**
 * @param {number} score
 * @returns {number}
 */
export function pillarPctFromLongevityScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || PILLAR_MAX <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100, (n / PILLAR_MAX) * 100)));
}

/**
 * @param {number|null|undefined} score
 * @returns {string}
 */
export function longevityStatusLabel(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return 'In calibrazione';
  if (s >= 80) return 'Profilo Solido';
  if (s >= 60) return 'Buona Traiettoria';
  if (s >= 40) return 'Margine di Crescita';
  return 'Priorità di Recupero';
}

/**
 * @param {number|null|undefined} score
 * @returns {'good'|'mid'|'low'|'neutral'}
 */
export function longevityToneFromScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 75) return 'good';
  if (n >= 50) return 'mid';
  return 'low';
}

/**
 * Insight strutturato per UI Pagella Metabolica.
 * @param {number|null|undefined} score
 * @param {{
 *   cardioMins?: number,
 *   uniqueGroups?: number,
 *   sleepAvg?: number|null,
 *   whtrMultiplier?: number,
 *   criticalThreshold?: number|null,
 *   userHeight?: number|null,
 *   cardioScore?: number,
 *   weightsScore?: number,
 *   sleepScore?: number,
 *   nutritionScore?: number,
 *   longevityNutrition?: {
 *     score?: number,
 *     proteinStatus?: string,
 *     fastingWindowEvaluation?: string,
 *     clinicalNoteStrength?: string,
 *     clinicalNoteBottleneck?: string,
 *     source?: string,
 *   }|null,
 * }} [metrics]
 * @returns {{
 *   statusLabel: string,
 *   scoreLabel: string,
 *   strengths: Array<{ id: string, badge: string, title: string, body: string }>,
 *   penalties: Array<{ id: string, badge: string, title: string, body: string, severity: 'amber'|'red' }>,
 *   cta: { badge: string, title: string, body: string, targetScore: number },
 *   bars: Array<{ id: string, label: string, detail: string, pct: number, tone: 'good'|'mid'|'low' }>,
 *   rawData: string,
 *   analysis: string,
 * }}
 */
export function buildLongevityPagellaInsight(score, metrics = {}) {
  const s = Number(score);
  const cardioMins = Math.round(Number(metrics.cardioMins) || 0);
  const uniqueGroups = Math.max(0, Math.min(5, Math.round(Number(metrics.uniqueGroups) || 0)));
  const sleepAvg = Number.isFinite(Number(metrics.sleepAvg)) && Number(metrics.sleepAvg) > 0
    ? Number(metrics.sleepAvg)
    : null;
  const whtrMultiplier = Number.isFinite(Number(metrics.whtrMultiplier))
    ? Number(metrics.whtrMultiplier)
    : 1;
  const criticalThreshold = Number.isFinite(Number(metrics.criticalThreshold))
    ? Number(metrics.criticalThreshold)
    : null;
  const userHeight = Number.isFinite(Number(metrics.userHeight))
    ? Number(metrics.userHeight)
    : null;

  const cardioScore = Number.isFinite(Number(metrics.cardioScore))
    ? Number(metrics.cardioScore)
    : Math.min((cardioMins / CARDIO_TARGET_MIN) * PILLAR_MAX, PILLAR_MAX);
  const weightsScore = Number.isFinite(Number(metrics.weightsScore))
    ? Number(metrics.weightsScore)
    : (uniqueGroups / WEIGHTS_TARGET_GROUPS) * PILLAR_MAX;
  const sleepScore = Number.isFinite(Number(metrics.sleepScore))
    ? Number(metrics.sleepScore)
    : (sleepAvg != null ? Math.min((sleepAvg / SLEEP_TARGET_H) * PILLAR_MAX, PILLAR_MAX) : 0);

  const nutritionMeta = metrics.longevityNutrition && typeof metrics.longevityNutrition === 'object'
    ? metrics.longevityNutrition
    : null;
  const nutritionScore = Number.isFinite(Number(metrics.nutritionScore))
    ? Number(metrics.nutritionScore)
    : (Number.isFinite(Number(nutritionMeta?.score)) ? Number(nutritionMeta.score) : 0);

  const cardioPct = pillarPctFromLongevityScore(cardioScore);
  const weightsPct = pillarPctFromLongevityScore(weightsScore);
  const sleepPct = pillarPctFromLongevityScore(sleepScore);
  const nutritionPct = pillarPctFromLongevityScore(nutritionScore);

  /** @type {Array<{ id: string, badge: string, title: string, body: string }>} */
  const strengths = [];
  /** @type {Array<{ id: string, badge: string, title: string, body: string, severity: 'amber'|'red' }>} */
  const penalties = [];

  // —— Sonno ——
  if (sleepAvg != null && sleepAvg >= SLEEP_TARGET_H) {
    strengths.push({
      id: 'sleep',
      badge: '✅',
      title: `Sonno Eccellente (${sleepAvg.toFixed(1)}h)`,
      body: 'Ottimo recupero e regolazione ormonale. Mantieni questo ritmo: è un moltiplicatore di longevità.',
    });
  } else if (sleepAvg == null) {
    penalties.push({
      id: 'sleep',
      badge: '⚠️',
      title: 'Sonno non registrato',
      body: 'Senza notti loggate il pilastro recupero vale 0. Registra il sonno ogni mattina per far contare i punti.',
      severity: 'amber',
    });
  } else {
    const gap = Math.max(0, SLEEP_TARGET_H - sleepAvg);
    penalties.push({
      id: 'sleep',
      badge: '⚠️',
      title: `Sonno sotto target (${sleepAvg.toFixed(1)}h / ${SLEEP_TARGET_H}h)`,
      body: `Ti mancano circa ${gap.toFixed(1)}h di media. Anticipa la buonanotte di 20–30 minuti: il recupero influenza direttamente il punteggio finale.`,
      severity: sleepPct < 50 ? 'red' : 'amber',
    });
  }

  // —— Cardio ——
  if (cardioPct >= 100) {
    strengths.push({
      id: 'cardio',
      badge: '✅',
      title: `Cardio in target (${cardioMins} / ${CARDIO_TARGET_MIN} min)`,
      body: 'Volume aerobico solido: mitocondri e sistema cardiovascolare ricevono lo stimolo giusto. Continua con costanza.',
    });
  } else if (cardioMins <= 0) {
    penalties.push({
      id: 'cardio',
      badge: '⚠️',
      title: `Zero Attività Aerobica (0/${CARDIO_TARGET_MIN} min)`,
      body: 'Mitocondri e sistema cardiovascolare fermi. È spesso la penalità maggiore sul tuo punteggio longevità.',
      severity: 'red',
    });
  } else {
    const missing = Math.max(0, CARDIO_TARGET_MIN - cardioMins);
    penalties.push({
      id: 'cardio',
      badge: '⚠️',
      title: `Cardio incompleto (${cardioMins}/${CARDIO_TARGET_MIN} min · ${cardioPct}%)`,
      body: `Ti mancano ancora ~${missing} min nella finestra 14 giorni. Camminata svelta o corsa facile (Zona 2) recuperano punti in fretta.`,
      severity: cardioPct < 40 ? 'red' : 'amber',
    });
  }

  // —— Pesi ——
  if (uniqueGroups >= WEIGHTS_TARGET_GROUPS) {
    strengths.push({
      id: 'weights',
      badge: '✅',
      title: `Stimolo Muscolare Completo (${uniqueGroups}/5 pilastri)`,
      body: 'Hai coperto tutti i pilastri. Ottimo lavoro su massa magra e sensibilità insulinica: cura recupero e progressione.',
    });
  } else if (uniqueGroups <= 1) {
    penalties.push({
      id: 'weights',
      badge: '⚠️',
      title: `Stimolo Muscolare Incompleto (${uniqueGroups}/5 pilastri)`,
      body: 'Mancano stimoli per la massa magra e la sensibilità insulinica. Serve almeno una sessione che tocchi parte superiore o gambe.',
      severity: 'red',
    });
  } else {
    penalties.push({
      id: 'weights',
      badge: '⚠️',
      title: `Copertura muscolare parziale (${uniqueGroups}/5 pilastri)`,
      body: 'Buona base, ma restano gruppi poco stimolati. Completa spinta, tiro, gambe o core per bilanciare i punti forza.',
      severity: 'amber',
    });
  }

  // —— Nutrizione clinica & digiuno ——
  const nutritionPts = Math.round(nutritionScore);
  const strengthNote = String(nutritionMeta?.clinicalNoteStrength || '').trim();
  const bottleneckNote = String(nutritionMeta?.clinicalNoteBottleneck || '').trim();
  const proteinStatus = String(nutritionMeta?.proteinStatus || '').toUpperCase();
  const qualityForward = /antinfiamm|antiossid|glicem|olio\s*evo|pesce|fibre|stabilit|eccellent|solido|protettiv/i
    .test(strengthNote);
  // Qualità alta anche con score intermedio (es. 14/25 da vecchia logica proteine-only):
  // mostra i punti di forza e tratta le proteine come tip secondario, non come "Nutrizione debole".
  const qualityLedMidScore = nutritionPct >= 48 && nutritionPct < 72 && (
    qualityForward
    || (strengthNote.length > 24 && nutritionPts >= 12)
  );

  if (nutritionPct >= 72 || qualityLedMidScore) {
    strengths.push({
      id: 'nutrition',
      badge: '✅',
      title: nutritionPct >= 72
        ? `Nutrizione Clinica (${nutritionPts}/${PILLAR_MAX} pt)`
        : `Profilo Antinfiammatorio / Glicemico (${nutritionPts}/${PILLAR_MAX} pt)`,
      body: strengthNote
        || 'Quota proteica e profilo alimentare protettivi per massa magra e recupero cellulare.',
    });
    if (
      qualityLedMidScore
      && (proteinStatus === 'LOW' || proteinStatus === 'MODERATE')
      && bottleneckNote
    ) {
      penalties.push({
        id: 'nutrition-tip',
        badge: '💡',
        title: 'Margine proteico (secondario)',
        body: /margine|protei/i.test(bottleneckNote)
          ? bottleneckNote
          : `Margine di miglioramento: incrementa leggermente la quota proteica per sostenere la massa magra.`,
        severity: 'amber',
      });
    }
  } else if (nutritionPct <= 0 && !nutritionMeta) {
    penalties.push({
      id: 'nutrition',
      badge: '⚠️',
      title: 'Nutrizione Clinica non calibrata',
      body: 'Genera l\'Insight Clinico AI o registra pasti/proteine e digiuno: senza dati il pilastro resta basso.',
      severity: 'amber',
    });
  } else {
    const softTitle = nutritionPts >= 10
      ? `Nutrizione Clinica da consolidare (${nutritionPts}/${PILLAR_MAX} pt)`
      : `Nutrizione Clinica insufficiente (${nutritionPts}/${PILLAR_MAX} pt)`;
    penalties.push({
      id: 'nutrition',
      badge: '⚠️',
      title: softTitle,
      body: bottleneckNote
        || strengthNote
        || 'Priorità: qualità antinfiammatoria, fibre/glicemia o finestra digiuno.',
      severity: nutritionPct < 40 ? 'red' : 'amber',
    });
  }

  // —— WHtR / filtro strutturale ——
  if (whtrMultiplier >= 0.98) {
    strengths.push({
      id: 'whtr',
      badge: '✅',
      title: 'Rapporto Girovita/Altezza',
      body: criticalThreshold != null
        ? `Nessun rischio viscerale rilevato (soglia ~${criticalThreshold.toFixed(0)} cm${userHeight != null ? ` · h ${userHeight.toFixed(0)}` : ''}). Il filtro strutturale non taglia il punteggio.`
        : 'Nessun rischio viscerale rilevato. Il filtro strutturale non taglia il punteggio.',
    });
  } else if (whtrMultiplier >= 0.7) {
    penalties.push({
      id: 'whtr',
      badge: '⚠️',
      title: `Filtro strutturale attivo (×${whtrMultiplier})`,
      body: 'Il girovita riduce leggermente lo score. Deficit controllato + cammino quotidiano recuperano punti longevità.',
      severity: 'amber',
    });
  } else {
    penalties.push({
      id: 'whtr',
      badge: '⚠️',
      title: `Filtro strutturale pesante (×${whtrMultiplier})`,
      body: 'Il rapporto girovita/altezza sta tagliando molto il punteggio. Priorità: composizione corporea e movimento quotidiano costante.',
      severity: 'red',
    });
  }

  // —— CTA strategica ——
  const scoreSafe = Number.isFinite(s) ? Math.round(s) : 0;
  const targetScore = Math.min(100, Math.max(scoreSafe + 15, scoreSafe < 50 ? 60 : scoreSafe + 10));
  const ctaBody = buildStrategicCta({
    scoreSafe,
    targetScore,
    cardioMins,
    cardioPct,
    uniqueGroups,
    sleepAvg,
    sleepPct,
    whtrMultiplier,
    nutritionPct,
    nutritionMeta,
  });

  const bars = [
    {
      id: 'cardio',
      label: 'Cardio',
      detail: `${cardioMins} min`,
      pct: cardioPct,
      tone: barTone(cardioPct),
    },
    {
      id: 'weights',
      label: 'Pesi',
      detail: `${uniqueGroups}/5`,
      pct: weightsPct,
      tone: barTone(weightsPct),
    },
    {
      id: 'sleep',
      label: 'Sonno',
      detail: sleepAvg != null ? `${sleepAvg.toFixed(1)}h` : 'n/d',
      pct: sleepPct,
      tone: barTone(sleepPct),
    },
    {
      id: 'nutrition',
      label: '🥗 Nutrizione Clinica',
      detail: `${nutritionPts}/${PILLAR_MAX} pt`,
      pct: nutritionPct,
      tone: barTone(nutritionPct),
    },
  ];

  const statusLabel = longevityStatusLabel(s);
  const scoreLabel = Number.isFinite(s)
    ? `${Math.round(s)}/100 — ${statusLabel}`
    : `—/100 — ${statusLabel}`;

  // Compat legacy (rawData / analysis)
  const rawData = [
    `Cardio 14gg: ${cardioMins} min / target ${CARDIO_TARGET_MIN}`,
    `Pesi: ${uniqueGroups}/5 pilastri ≥50%`,
    `Sonno medio: ${sleepAvg != null ? `${sleepAvg.toFixed(1)}h` : 'n/d'} / target ${SLEEP_TARGET_H}h`,
    `Nutrizione: ${nutritionPts}/${PILLAR_MAX} pt`,
    `Filtro WHtR: ×${whtrMultiplier}${
      criticalThreshold != null
        ? ` (soglia ${criticalThreshold.toFixed(0)} cm${userHeight != null ? ` · h ${userHeight.toFixed(0)}` : ''})`
        : ''
    }`,
  ].join(' | ');

  const analysis = [
    strengths.length > 0
      ? `Punti di forza: ${strengths.map((x) => x.title).join('; ')}.`
      : null,
    penalties.length > 0
      ? `Cosa frena: ${penalties.map((x) => x.title).join('; ')}.`
      : null,
    ctaBody,
  ].filter(Boolean).join(' ');

  return {
    statusLabel,
    scoreLabel,
    strengths,
    penalties,
    cta: {
      badge: '🎯',
      title: `Prossimo obiettivo: passare verso ${targetScore}+ punti`,
      body: ctaBody,
      targetScore,
    },
    bars,
    rawData,
    analysis,
  };
}

/**
 * @param {{ pct: number }} 
 * @returns {'good'|'mid'|'low'}
 */
function barTone(pct) {
  if (pct >= 80) return 'good';
  if (pct >= 40) return 'mid';
  return 'low';
}

/**
 * Consiglio concreto prioritizzato sulle maggiori lacune.
 */
function buildStrategicCta({
  scoreSafe,
  targetScore,
  cardioMins,
  cardioPct,
  uniqueGroups,
  sleepAvg,
  sleepPct,
  whtrMultiplier,
  nutritionPct = 100,
  nutritionMeta = null,
}) {
  /** @type {string[]} */
  const actions = [];

  // Se nutrizione è l'anello più debole, priorità alimentare in CTA.
  const weakestIsNutrition = nutritionPct <= cardioPct
    && nutritionPct <= (uniqueGroups / WEIGHTS_TARGET_GROUPS) * 100
    && nutritionPct <= sleepPct
    && nutritionPct < 72;

  if (weakestIsNutrition) {
    const bottleneck = String(nutritionMeta?.clinicalNoteBottleneck || '').trim();
    const strength = String(nutritionMeta?.clinicalNoteStrength || '').trim();
    const protein = String(nutritionMeta?.proteinStatus || '').toUpperCase();
    const fasting = String(nutritionMeta?.fastingWindowEvaluation || '').toUpperCase();
    const qualityHigh = /antinfiamm|glicem|olio\s*evo|pesce|fibre|stabilit|eccellent/i.test(strength);
    if (qualityHigh && (protein === 'LOW' || protein === 'MODERATE')) {
      actions.push('incrementa leggermente la quota proteica (es. +15–25g) mantenendo il profilo antinfiammatorio');
    } else if (protein === 'LOW' && !qualityHigh) {
      actions.push('porta le proteine verso il target giornaliero (es. +20–30g su pranzo/cena)');
    } else if (fasting === 'POOR') {
      actions.push('chiudi la finestra alimentare serale e punta a 12–14h di digiuno notturno');
    } else if (bottleneck) {
      actions.push(bottleneck.replace(/^Margine di miglioramento:\s*/i, '').replace(/\.$/, '').toLowerCase());
    } else {
      actions.push('consolida fibre, grassi buoni e timing digiuno senza sacrificare la densità nutrizionale');
    }
  }

  if (cardioMins <= 0 || cardioPct < 50) {
    actions.push('fai 30–40 min di camminata svelta o corsa facile (Zona 2)');
  } else if (cardioPct < 100 && actions.length < 2) {
    actions.push(`aggiungi ~${Math.max(20, Math.round((CARDIO_TARGET_MIN - cardioMins) / 3))} min di aerobico nella settimana`);
  }

  if (uniqueGroups < 3 && actions.length < 2) {
    actions.push('completa un allenamento pesi su parte superiore o gambe');
  } else if (uniqueGroups < WEIGHTS_TARGET_GROUPS && actions.length < 2) {
    actions.push('chiudi i pilastri muscolari mancanti con una sessione mirata');
  }

  if (sleepAvg == null && actions.length < 2) {
    actions.push('registra il sonno ogni mattina');
  } else if (sleepPct < 100 && actions.length < 2) {
    actions.push('anticipa la buonanotte di 20–30 minuti');
  }

  if (whtrMultiplier < 0.98 && actions.length < 2) {
    actions.push('proteggi un piccolo deficit calorico e cammina ogni giorno');
  }

  if (actions.length === 0) {
    return `Per consolidare i ${scoreSafe} punti: mantieni cardio, pesi, sonno e nutrizione clinica a target questa settimana — la costanza alza la media 14 giorni.`;
  }

  const joined = actions.length === 1
    ? actions[0]
    : `${actions.slice(0, -1).join(', ')} e ${actions[actions.length - 1]}`;

  return `Per passare da ${scoreSafe} a ${targetScore}+ punti questa settimana: ${joined}.`;
}

/**
 * Compat: API storica usata da SaluteLongevityHero / ProgressiveScore.
 * @deprecated Preferire buildLongevityPagellaInsight
 */
export function getLongevityFeedback(score, metrics = {}) {
  const insight = buildLongevityPagellaInsight(score, metrics);
  return {
    rawData: insight.rawData,
    analysis: insight.analysis,
    insight,
  };
}

/**
 * Chip rapido per la chat (kind=reply / options[]).
 * @param {string|null|undefined} bottleneckId
 * @returns {string}
 */
export function resolveLongevityLeverChipLabel(bottleneckId) {
  const id = String(bottleneckId || '').trim().toLowerCase();
  if (id === 'cardio') return '🏃‍♂️ Avvia 30 min Zona 2';
  if (id === 'weights') return '🏋️ Allenamento pesi (parte superiore/gambe)';
  if (id === 'sleep') return '🛌 Registra / proteggi il sonno';
  if (id === 'nutrition') return '🥗 Aggiusta proteine / digiuno';
  if (id === 'whtr') return '🚶 Camminata + composizione corporea';
  return '🎯 Applica leva Longevità';
}

/**
 * Contesto compatto per Kentu AI (`longevityContext` in Global State).
 * @param {number|null|undefined} score
 * @param {object} [metrics]
 * @returns {{
 *   score: number|null,
 *   bottleneck: string|null,
 *   strategicLever: string,
 *   targetAction: string,
 *   chipLabel: string,
 *   targetScore: number,
 *   statusLabel: string,
 *   bottleneckId: string|null,
 * }}
 */
export function buildLongevityContextForAi(score, metrics = {}) {
  const insight = buildLongevityPagellaInsight(score, metrics);
  const top = Array.isArray(insight.penalties) && insight.penalties.length > 0
    ? insight.penalties[0]
    : null;
  const chipLabel = resolveLongevityLeverChipLabel(top?.id);
  const scoreSafe = Number.isFinite(Number(score)) ? Math.round(Number(score)) : null;

  return {
    score: scoreSafe,
    bottleneck: top ? String(top.title) : null,
    strategicLever: String(insight.cta?.body || '').trim(),
    targetAction: chipLabel,
    chipLabel,
    targetScore: Number(insight.cta?.targetScore) || Math.min(100, (scoreSafe || 0) + 20),
    statusLabel: insight.statusLabel,
    bottleneckId: top?.id || null,
  };
}
