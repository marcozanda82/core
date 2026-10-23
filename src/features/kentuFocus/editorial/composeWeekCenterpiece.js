/**
 * Articolo centrale settimanale — solo se c’è una storia (P6.5.1).
 */

import { FOCUS_PROVENANCE } from '../contracts/focusDossier.v1.js';
import { CENTERPIECE_STORY_REASON } from '../edition/editionVerification.js';
import { evaluateCenterpieceStory } from './centerpieceStoryGate.js';
import { FOCUS_STORY_CLASS } from './focusEditorialConfig.js';
import {
  evaluateScaleAntiRepeat,
  FOCUS_EDITORIAL_SCALE,
} from './focusEditorialMemory.js';
import {
  attachStorySpine,
  buildCenterpieceStorySpine,
} from './writing/focusStorySpine.js';

export const WEEK_CENTERPIECE_TOPIC_ID = 'week_habits_story';

/**
 * @param {object|null} perspective
 * @param {object|null} memory
 * @param {{ publicationDate?: string|null }} [ctx]
 */
export function composeWeekCenterpieceCandidate(perspective, memory, ctx = {}) {
  const week = perspective?.week;
  const agg = week?.aggregate;
  if (!agg) return null;

  const story = evaluateCenterpieceStory(agg, week?.comparison, 'week');
  if (!story.publishable) {
    return {
      id: 'sig_week_habits_story',
      topicId: WEEK_CENTERPIECE_TOPIC_ID,
      publishable: false,
      omitReason: story.reason,
      editorialScale: FOCUS_EDITORIAL_SCALE.week_interpretation,
      storyClass: FOCUS_STORY_CLASS.significant_pattern,
      coverage: {
        ...agg.coverage,
        storyReason: story.reason,
        aggregatesAvailable: agg.aggregatesAvailable,
        evidenceSolid: agg.evidenceSolid,
      },
      preferredRoles: [],
      forbidRoles: ['lead', 'good', 'feature', 'concern', 'centerpiece'],
    };
  }

  const dominant = story.dominantFact;
  const fingerprint = buildWeekFingerprint(agg, week?.comparison, dominant);
  const anti = evaluateScaleAntiRepeat({
    memory,
    publicationDate: ctx.publicationDate || perspective?.publicationDate,
    scale: FOCUS_EDITORIAL_SCALE.week_interpretation,
    topicId: WEEK_CENTERPIECE_TOPIC_ID,
    evidenceFingerprint: fingerprint,
  });
  if (anti.suppress) {
    return {
      id: 'sig_week_habits_story',
      topicId: WEEK_CENTERPIECE_TOPIC_ID,
      publishable: false,
      omitReason: anti.reason || CENTERPIECE_STORY_REASON.scale_repeat_same_evidence,
      editorialScale: FOCUS_EDITORIAL_SCALE.week_interpretation,
      evidenceFingerprint: fingerprint,
      storyClass: FOCUS_STORY_CLASS.significant_pattern,
    };
  }

  const { headline, summary, facts } = buildWeekNarrative(agg, week?.comparison, dominant);
  const limitations = [
    ...(agg.limitations || []),
    week?.comparison?.interpretativeLimit || null,
    'Nessuna causalità tra domini senza evidenza dedicata',
  ];
  if (dominant.theme === 'protein_intake_shift') {
    // Contesto scrittore (non mandatory di stampa): Δ ≠ deficit.
    limitations.push('Lo scostamento proteico non è un deficit dimostrato');
  }
  const spine = buildCenterpieceStorySpine({
    scale: 'week',
    dominant,
    agg,
    comparison: week?.comparison,
  });
  const candidate = {
    id: 'sig_week_habits_story',
    topicId: WEEK_CENTERPIECE_TOPIC_ID,
    domain: dominant.domain === 'habits' ? 'habits' : dominant.domain,
    typology: 'week_centerpiece',
    tone: 'neutral',
    storyClass: FOCUS_STORY_CLASS.significant_pattern,
    editorialScale: FOCUS_EDITORIAL_SCALE.week_interpretation,
    storyKind: story.storyKind,
    claimType: 'calculated',
    evidenceQuality: agg.coverage?.temporalComplete ? 'high' : 'medium',
    persistence: story.storyKind === 'notable_continuity' ? 'consolidated' : 'emerging',
    novelty: anti.novelty || 'new',
    actionability: 0,
    headlineSeed: headline,
    summarySeed: summary,
    refs: buildWeekAuthorizedRefs(dominant),
    metrics: facts,
    coverage: {
      ...agg.coverage,
      solidDomains: agg.solidDomains,
      dominantTheme: dominant.theme,
      storyKind: story.storyKind,
      storyReason: CENTERPIECE_STORY_REASON.significant_story_selected,
      comparisonAvailable: Boolean(week?.comparison?.available),
      comparisonKind: week?.comparison?.comparisonKind || null,
      comparisonLabel: week?.comparison?.label || null,
    },
    dominantFact: dominant,
    observedPeriod: {
      from: agg.fromDate,
      to: agg.toDate,
      sleepWakeFrom: agg.sleep?.sleepWakeFrom,
      sleepWakeTo: agg.sleep?.sleepWakeTo,
    },
    evidenceFingerprint: fingerprint,
    provenance: FOCUS_PROVENANCE.calculated,
    limitations: limitations.filter(Boolean),
    doNotClaim: [
      'correlazione causale inventata',
      'diagnosi',
      'inattività da assenza di log',
      'conclusione corporea da misure vecchie',
      'consiglio proteico automatico',
      ...(dominant.theme === 'protein_intake_shift'
        ? ['deficit proteico', 'peggioramento fisiologico']
        : []),
    ],
    preferredRoles: ['centerpiece', 'feature'],
    forbidRoles: ['concern', 'lead', 'good'],
    openingModeHint: 'progress',
    significantChange: story.storyKind === 'significant_change',
    omitReason: null,
    publishable: true,
  };
  return spine ? attachStorySpine(candidate, spine) : candidate;
}

/**
 * Refs aggregate pertinenti al tema dominante (P6.7.3a) — non dump multi-dominio.
 * @param {object} dominant
 */
function buildWeekAuthorizedRefs(dominant) {
  const theme = dominant?.theme || '';
  if (theme === 'protein_intake_shift' || theme === 'kcal_intake_shift') {
    return ['edition.week.aggregate.nutrition'];
  }
  if (
    theme === 'sleep_hours_shift'
    || theme === 'sleep_week_short'
    || theme === 'sleep_week_long'
  ) {
    return ['edition.week.aggregate.sleep'];
  }
  if (theme === 'strength_week_density' || theme === 'strength_frequency_change') {
    return ['edition.week.aggregate.activity'];
  }
  if (theme === 'habits_link') {
    return [
      'edition.week.aggregate.nutrition',
      'edition.week.aggregate.sleep',
      'edition.week.aggregate.activity',
    ];
  }
  return ['edition.week.aggregate.nutrition'];
}

/**
 * Metriche autorizzate solo per il fatto della storia (P6.7.3a).
 * @param {object} agg
 * @param {object} dominant
 * @param {(path: string, value: unknown, unit: string) => void} push
 */
function pushWeekThemeFacts(agg, dominant, push) {
  const theme = dominant?.theme || '';
  const pushDelta = () => {
    if (dominant?.fact?.absoluteDelta == null || !dominant?.fact?.metric) return;
    const metric = dominant.fact.metric;
    push(
      `edition.week.comparison.deltas.${metric}`,
      dominant.fact.absoluteDelta,
      metric === 'avgProteinG' ? 'g'
        : metric === 'avgSleepHours' ? 'h'
          : metric === 'avgKcal' ? 'kcal'
            : 'days',
    );
  };

  if (theme === 'protein_intake_shift') {
    push('edition.week.nutrition.daysWithFood', agg.nutrition?.daysWithFood, 'days');
    push('edition.week.nutrition.avgProteinG', agg.nutrition?.avgProteinG, 'g');
    pushDelta();
    return;
  }
  if (theme === 'kcal_intake_shift') {
    push('edition.week.nutrition.daysWithFood', agg.nutrition?.daysWithFood, 'days');
    push('edition.week.nutrition.avgKcal', agg.nutrition?.avgKcal, 'kcal');
    pushDelta();
    return;
  }
  if (
    theme === 'sleep_hours_shift'
    || theme === 'sleep_week_short'
    || theme === 'sleep_week_long'
  ) {
    push('edition.week.sleep.nightsLogged', agg.sleep?.nightsLogged, 'nights');
    push('edition.week.sleep.avgHours', agg.sleep?.avgHours, 'h');
    pushDelta();
    return;
  }
  if (theme === 'strength_week_density' || theme === 'strength_frequency_change') {
    push('edition.week.activity.strengthDaysLogged', agg.activity?.strengthDaysLogged, 'days');
    pushDelta();
    return;
  }
  if (theme === 'habits_link') {
    // Collegamento multi-dominio: conserva le evidenze dei temi collegati.
    const themes = [dominant?.fact?.primaryTheme, dominant?.fact?.secondaryTheme]
      .filter(Boolean);
    const needNutrition = themes.some((t) => /protein|kcal|nutrition/i.test(String(t)))
      || themes.length === 0;
    const needSleep = themes.some((t) => /sleep/i.test(String(t))) || themes.length === 0;
    const needStrength = themes.some((t) => /strength/i.test(String(t))) || themes.length === 0;
    if (needNutrition) {
      push('edition.week.nutrition.daysWithFood', agg.nutrition?.daysWithFood, 'days');
      push('edition.week.nutrition.avgProteinG', agg.nutrition?.avgProteinG, 'g');
    }
    if (needSleep) {
      push('edition.week.sleep.nightsLogged', agg.sleep?.nightsLogged, 'nights');
      push('edition.week.sleep.avgHours', agg.sleep?.avgHours, 'h');
    }
    if (needStrength) {
      push('edition.week.activity.strengthDaysLogged', agg.activity?.strengthDaysLogged, 'days');
    }
    pushDelta();
  }
}

const IT_MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/**
 * Intervallo ISO → «11–17 ottobre» (stesso mese) o «28 settembre–4 ottobre».
 * @param {string|null|undefined} from
 * @param {string|null|undefined} to
 */
function formatItDateRange(from, to) {
  if (!from || !to || from.length < 10 || to.length < 10) {
    return from && to ? `${from}→${to}` : (from || to || '');
  }
  const y1 = from.slice(0, 4);
  const m1 = Number(from.slice(5, 7));
  const d1 = Number(from.slice(8, 10));
  const y2 = to.slice(0, 4);
  const m2 = Number(to.slice(5, 7));
  const d2 = Number(to.slice(8, 10));
  const mon1 = IT_MONTHS[m1 - 1] || from.slice(5, 7);
  const mon2 = IT_MONTHS[m2 - 1] || to.slice(5, 7);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${mon1}`;
  if (y1 === y2) return `${d1} ${mon1}–${d2} ${mon2}`;
  return `${d1} ${mon1} ${y1}–${d2} ${mon2} ${y2}`;
}

/**
 * @param {unknown} n
 * @returns {string}
 */
function formatItNumber(n) {
  if (n == null) return '';
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return String(x).replace('.', ',');
}

/**
 * Riassunto narrativo per Gemini (P6.7.3b): italiano naturale, senza scaffold
 * «Perché può interessare» / «Limiti». I limiti tecnici restano in limitations[].
 *
 * @param {object} agg
 * @param {object|null|undefined} comparison
 * @param {object} dominant
 */
function buildWeekNarrative(agg, comparison, dominant) {
  const facts = [];
  const push = (path, value, unit) => {
    if (value == null) return;
    facts.push({ path, value, unit, provenance: FOCUS_PROVENANCE.calculated });
  };
  pushWeekThemeFacts(agg, dominant, push);

  const periodIt = formatItDateRange(agg.fromDate, agg.toDate);
  const refIt = comparison?.available
    ? formatItDateRange(comparison.previousFrom, comparison.previousTo)
    : null;
  const isCalendar = comparison?.label === 'mese_solare_precedente'
    || comparison?.comparisonKind === 'calendar_month_vs_prior_calendar_month';

  let headline = '';
  /** @type {string[]} */
  const parts = [];

  if (dominant.theme === 'strength_week_density' || dominant.theme === 'strength_frequency_change') {
    const n = agg.activity?.strengthDaysLogged ?? dominant.fact?.current;
    const d = dominant.fact?.absoluteDelta;
    if (d != null) {
      headline = d < 0
        ? 'Meno giorni di forza rispetto alla settimana precedente'
        : 'Più giorni di forza rispetto alla settimana precedente';
      parts.push(
        `Nella settimana ${periodIt} risultano ${n} giorni con sessioni di forza`
        + (refIt
          ? `, ${d < 0 ? 'in meno' : 'in più'} di ${Math.abs(Number(d))} rispetto a ${refIt}`
          : '')
        + '.',
      );
    } else {
      headline = `Settimana con ${n} giorni di forza`;
      parts.push(
        `Nella settimana ${periodIt} la forza compare in ${n} giorni`
        + (agg.coverage?.daysElapsed != null ? ` su ${agg.coverage.daysElapsed}` : '')
        + '.',
      );
    }
    parts.push(
      'Si tratta della frequenza delle sessioni annotate, distinta dall’aerobica etichettata;'
      + ' l’assenza di un log non equivale a inattività.',
    );
  } else if (
    dominant.theme === 'sleep_hours_shift'
    || dominant.theme === 'sleep_week_short'
    || dominant.theme === 'sleep_week_long'
  ) {
    const h = formatItNumber(agg.sleep?.avgHours);
    const nights = agg.sleep?.nightsLogged;
    const d = dominant.fact?.absoluteDelta;
    if (d != null) {
      headline = d < 0
        ? 'Sonno medio in calo rispetto alla settimana precedente'
        : 'Sonno medio in aumento rispetto alla settimana precedente';
      parts.push(
        `Nella settimana ${periodIt} la durata media del sonno è circa ${h} ore`
        + (nights != null ? ` su ${nights} notti annotate` : '')
        + (refIt
          ? `, con una differenza di ${formatItNumber(d)} ore rispetto a ${refIt}`
          : '')
        + '.',
      );
    } else if (dominant.theme === 'sleep_week_short') {
      headline = `Settimana con sonno medio contenuto (≈${h} ore)`;
      parts.push(
        `Nella settimana ${periodIt}`
        + (nights != null ? ` su ${nights} notti annotate` : '')
        + ` la media è circa ${h} ore.`,
      );
    } else {
      headline = `Settimana con sonno medio elevato (≈${h} ore)`;
      parts.push(
        `Nella settimana ${periodIt}`
        + (nights != null ? ` su ${nights} notti annotate` : '')
        + ` la media è circa ${h} ore.`,
      );
    }
    parts.push(
      'La misura riguarda la durata registrata, non la qualità del recupero;'
      + ' la notte della domenica di pubblicazione resta fuori da questo bilancio.',
    );
  } else if (dominant.theme === 'protein_intake_shift' || dominant.theme === 'kcal_intake_shift') {
    const isKcal = dominant.fact?.metric === 'avgKcal';
    const label = isKcal ? 'kcal' : 'proteine';
    const val = formatItNumber(dominant.fact?.current);
    const d = dominant.fact?.absoluteDelta;
    const daysFood = agg.nutrition?.daysWithFood;
    headline = isKcal
      ? (d != null && d < 0 ? 'Kcal medie in calo nella settimana' : 'Kcal medie in aumento nella settimana')
      : (d != null && d < 0 ? 'Proteine medie in calo nella settimana' : 'Proteine medie in aumento nella settimana');
    parts.push(
      `Nella settimana ${periodIt} la media delle ${label} registrate è circa ${val}`
      + (isKcal ? '' : ' g')
      + '/giorno'
      + (daysFood != null ? ` su ${daysFood} giorni con alimentazione annotata` : '')
      + '.',
    );
    if (d != null && refIt) {
      parts.push(
        (isCalendar
          ? `Rispetto al mese solare precedente (${refIt})`
          : `Rispetto ai sette giorni precedenti (${refIt})`)
        + ` la media è ${d < 0 ? 'inferiore' : 'superiore'} di `
        + `${formatItNumber(Math.abs(Number(d)))}`
        + (isKcal ? '' : ' g')
        + ' al giorno.',
      );
    } else if (!refIt) {
      parts.push('Non è disponibile un confronto omogeneo con un periodo precedente.');
    }
    parts.push(
      isKcal
        ? 'Descrizione delle sole registrazioni, senza conclusioni fisiologiche.'
        : 'Descrizione delle sole registrazioni: non implica deficit proteico né effetti fisiologici.',
    );
  } else if (dominant.theme === 'habits_link' && dominant.fact?.foundedLink) {
    headline = 'Settimana con due segnali distinti';
    parts.push(
      `Nella settimana ${periodIt} emergono almeno due storie autonome`
      + ` (${dominant.fact.primaryTheme}`
      + (dominant.fact.secondaryTheme ? ` e ${dominant.fact.secondaryTheme}` : '')
      + '). Sono fatti documentati separatamente, senza nesso di causa.',
    );
  } else {
    headline = `Settimana ${periodIt}`;
    parts.push(`Periodo ${periodIt}.`);
  }

  const summary = parts.filter(Boolean).join(' ');
  return { headline, summary, facts };
}

/**
 * @param {object} agg
 * @param {object|null|undefined} comparison
 * @param {object} dominant
 */
function buildWeekFingerprint(agg, comparison, dominant) {
  return [
    'week',
    agg.fromDate,
    agg.toDate,
    dominant?.theme || 'none',
    `food${agg.nutrition?.daysWithFood ?? 0}`,
    `sleep${agg.sleep?.nightsLogged ?? 0}`,
    `str${agg.activity?.strengthDaysLogged ?? 0}`,
    comparison?.available ? `cmp${dominant?.fact?.absoluteDelta ?? 0}` : 'nocmp',
  ].join('|');
}
