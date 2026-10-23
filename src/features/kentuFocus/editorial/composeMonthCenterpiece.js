/**
 * Articolo centrale mensile — solo se c’è una storia (P6.5.1).
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

export const MONTH_CENTERPIECE_TOPIC_ID = 'month_habits_transformation';

/**
 * @param {object|null} perspective
 * @param {object|null} memory
 * @param {{ publicationDate?: string|null }} [ctx]
 */
export function composeMonthCenterpieceCandidate(perspective, memory, ctx = {}) {
  const month = perspective?.month;
  const agg = month?.aggregate;
  if (!agg) return null;

  const story = evaluateCenterpieceStory(agg, month?.comparison, 'month');
  if (!story.publishable) {
    return {
      id: 'sig_month_habits_transformation',
      topicId: MONTH_CENTERPIECE_TOPIC_ID,
      publishable: false,
      omitReason: story.reason,
      editorialScale: FOCUS_EDITORIAL_SCALE.month_transformation,
      storyClass: FOCUS_STORY_CLASS.significant_pattern,
      changeClass: story.storyKind || 'insufficient',
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
  const fingerprint = buildMonthFingerprint(agg, month?.comparison, dominant);
  const anti = evaluateScaleAntiRepeat({
    memory,
    publicationDate: ctx.publicationDate || perspective?.publicationDate,
    scale: FOCUS_EDITORIAL_SCALE.month_transformation,
    topicId: MONTH_CENTERPIECE_TOPIC_ID,
    evidenceFingerprint: fingerprint,
    significantChange: story.storyKind === 'significant_change',
  });
  if (anti.suppress) {
    return {
      id: 'sig_month_habits_transformation',
      topicId: MONTH_CENTERPIECE_TOPIC_ID,
      publishable: false,
      omitReason: anti.reason || CENTERPIECE_STORY_REASON.scale_repeat_same_evidence,
      editorialScale: FOCUS_EDITORIAL_SCALE.month_transformation,
      evidenceFingerprint: fingerprint,
      storyClass: FOCUS_STORY_CLASS.significant_pattern,
    };
  }

  const { headline, summary, facts } = buildMonthNarrative(agg, month?.comparison, dominant);
  const spine = buildCenterpieceStorySpine({
    scale: 'month',
    dominant,
    agg,
    comparison: month?.comparison,
  });
  const candidate = {
    id: 'sig_month_habits_transformation',
    topicId: MONTH_CENTERPIECE_TOPIC_ID,
    domain: dominant.domain === 'habits' ? 'habits' : dominant.domain,
    typology: 'month_centerpiece',
    tone: 'neutral',
    storyClass: FOCUS_STORY_CLASS.significant_pattern,
    editorialScale: FOCUS_EDITORIAL_SCALE.month_transformation,
    storyKind: story.storyKind,
    claimType: 'calculated',
    evidenceQuality: agg.coverage?.temporalComplete ? 'high' : 'medium',
    persistence: story.storyKind === 'notable_continuity' ? 'consolidated' : 'emerging',
    novelty: anti.novelty || 'new',
    actionability: 0,
    headlineSeed: headline,
    summarySeed: summary,
    refs: buildMonthAuthorizedRefs(dominant),
    metrics: facts,
    coverage: {
      ...agg.coverage,
      solidDomains: agg.solidDomains,
      dominantTheme: dominant.theme,
      storyKind: story.storyKind,
      storyReason: CENTERPIECE_STORY_REASON.significant_story_selected,
      changeClass: story.storyKind,
      comparisonAvailable: Boolean(month?.comparison?.available),
      comparisonKind: month?.comparison?.comparisonKind || null,
      comparisonLabel: month?.comparison?.label || null,
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
    limitations: [
      ...(agg.limitations || []),
      month?.comparison?.interpretativeLimit || null,
      'Medie mensili ≠ articolo senza cambiamento o continuità rilevante',
    ].filter(Boolean),
    doNotClaim: [
      'trasformazione fisiologica',
      'causalità non dimostrata',
      'inattività da assenza di log',
      'conclusione corporea attuale da misure vecchie',
    ],
    preferredRoles: ['centerpiece', 'feature'],
    forbidRoles: ['concern', 'lead', 'good'],
    openingModeHint: 'progress',
    significantChange: story.storyKind === 'significant_change',
    changeClass: story.storyKind,
    omitReason: null,
    publishable: true,
  };
  return spine ? attachStorySpine(candidate, spine) : candidate;
}

/**
 * @deprecated — preferire evaluateCenterpieceStory; tenuto per test legacy.
 * @param {object} agg
 * @param {object|null|undefined} comparison
 */
export function classifyMonthChange(agg, comparison) {
  const story = evaluateCenterpieceStory(agg, comparison, 'month');
  if (!story.publishable) {
    if (story.reason === CENTERPIECE_STORY_REASON.ordinary_oscillation_no_story) {
      return 'ordinary_oscillation';
    }
    return 'insufficient';
  }
  if (story.storyKind === 'significant_change') return 'significant_change';
  if (story.storyKind === 'notable_continuity') return 'continuity';
  return 'insufficient';
}

/**
 * Refs aggregate pertinenti al tema dominante (P6.7.3a).
 * @param {object} dominant
 */
function buildMonthAuthorizedRefs(dominant) {
  const theme = dominant?.theme || '';
  if (theme === 'protein_intake_shift' || theme === 'kcal_intake_shift') {
    return ['edition.month.aggregate.nutrition'];
  }
  if (theme === 'sleep_hours_shift') {
    return ['edition.month.aggregate.sleep'];
  }
  if (theme === 'strength_frequency_change' || theme === 'strength_month_continuity') {
    return ['edition.month.aggregate.activity'];
  }
  return [
    'edition.month.aggregate.nutrition',
    'edition.month.aggregate.sleep',
    'edition.month.aggregate.activity',
  ];
}

/**
 * Metriche autorizzate solo per il fatto della storia (P6.7.3a).
 * @param {object} agg
 * @param {object} dominant
 * @param {(path: string, value: unknown, unit: string) => void} push
 */
function pushMonthThemeFacts(agg, dominant, push) {
  const theme = dominant?.theme || '';
  const pushDelta = () => {
    if (dominant?.fact?.absoluteDelta == null || !dominant?.fact?.metric) return;
    const metric = dominant.fact.metric;
    push(
      `edition.month.comparison.deltas.${metric}`,
      dominant.fact.absoluteDelta,
      metric === 'avgProteinG' ? 'g'
        : metric === 'avgSleepHours' ? 'h'
          : metric === 'avgKcal' ? 'kcal'
            : 'days',
    );
  };

  if (theme === 'protein_intake_shift') {
    push('edition.month.nutrition.daysWithFood', agg.nutrition?.daysWithFood, 'days');
    push('edition.month.nutrition.avgProteinG', agg.nutrition?.avgProteinG, 'g');
    pushDelta();
    return;
  }
  if (theme === 'kcal_intake_shift') {
    push('edition.month.nutrition.daysWithFood', agg.nutrition?.daysWithFood, 'days');
    push('edition.month.nutrition.avgKcal', agg.nutrition?.avgKcal, 'kcal');
    pushDelta();
    return;
  }
  if (theme === 'sleep_hours_shift') {
    push('edition.month.sleep.nightsLogged', agg.sleep?.nightsLogged, 'nights');
    push('edition.month.sleep.avgHours', agg.sleep?.avgHours, 'h');
    pushDelta();
    return;
  }
  if (theme === 'strength_frequency_change' || theme === 'strength_month_continuity') {
    push('edition.month.activity.strengthDaysLogged', agg.activity?.strengthDaysLogged, 'days');
    pushDelta();
    return;
  }
  // Fallback multi-abitudine: conserva i domini solidi documentati.
  push('edition.month.nutrition.daysWithFood', agg.nutrition?.daysWithFood, 'days');
  push('edition.month.nutrition.avgProteinG', agg.nutrition?.avgProteinG, 'g');
  push('edition.month.sleep.nightsLogged', agg.sleep?.nightsLogged, 'nights');
  push('edition.month.sleep.avgHours', agg.sleep?.avgHours, 'h');
  push('edition.month.activity.strengthDaysLogged', agg.activity?.strengthDaysLogged, 'days');
  pushDelta();
}

const IT_MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/**
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
 * @param {string|null|undefined} isoMonth YYYY-MM
 */
function formatItMonthLabel(isoMonth) {
  if (!isoMonth || isoMonth.length < 7) return isoMonth || '';
  const y = isoMonth.slice(0, 4);
  const m = Number(isoMonth.slice(5, 7));
  const name = IT_MONTHS[m - 1];
  return name ? `${name} ${y}` : isoMonth;
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
function buildMonthNarrative(agg, comparison, dominant) {
  const facts = [];
  const push = (path, value, unit) => {
    if (value == null) return;
    facts.push({ path, value, unit, provenance: FOCUS_PROVENANCE.calculated });
  };
  pushMonthThemeFacts(agg, dominant, push);

  const periodIt = formatItDateRange(agg.fromDate, agg.toDate);
  const monthLabel = formatItMonthLabel(agg.fromDate.slice(0, 7));
  const refIt = comparison?.available
    ? formatItDateRange(comparison.previousFrom, comparison.previousTo)
    : null;
  const isCalendar = comparison?.comparisonKind === 'calendar_month_vs_prior_calendar_month';

  let headline = '';
  /** @type {string[]} */
  const parts = [];

  if (dominant.theme === 'strength_frequency_change' || dominant.theme === 'strength_month_continuity') {
    const n = agg.activity?.strengthDaysLogged;
    const d = dominant.fact?.absoluteDelta;
    if (d != null) {
      headline = d < 0
        ? `Meno giorni di forza a ${monthLabel}`
        : `Più giorni di forza a ${monthLabel}`;
      parts.push(
        `A ${monthLabel} (${periodIt}) risultano ${n} giorni con sessioni di forza`
        + (refIt
          ? `, ${d < 0 ? 'in meno' : 'in più'} di ${Math.abs(Number(d))} rispetto`
            + (isCalendar
              ? ` al mese solare precedente (${refIt})`
              : ` al periodo di confronto (${refIt})`)
          : '')
        + '.',
      );
      if (!isCalendar && refIt) {
        parts.push('Il confronto non è necessariamente un mese solare completo.');
      }
    } else {
      headline = `Continuità della forza a ${monthLabel}: ${n} giorni`;
      parts.push(
        `A ${monthLabel} (${periodIt}) la forza è documentata in ${n} giorni`
        + (dominant.fact?.density != null
          ? ` (densità ${formatItNumber(Number(dominant.fact.density).toFixed(2))})`
          : '')
        + '.',
      );
    }
    parts.push(
      'La frequenza delle sessioni annotate è distinta dall’aerobica;'
      + ' differenze di conteggio possono riflettere anche la copertura dei log,'
      + ' non necessariamente meno (o più) allenamento reale.',
    );
  } else if (dominant.theme === 'sleep_hours_shift') {
    const d = dominant.fact?.absoluteDelta;
    const h = formatItNumber(agg.sleep?.avgHours);
    const nights = agg.sleep?.nightsLogged;
    headline = d != null && d < 0
      ? `Sonno medio in calo a ${monthLabel}`
      : `Sonno medio in aumento a ${monthLabel}`;
    parts.push(
      `A ${monthLabel} (${periodIt}) la durata media del sonno è circa ${h} ore`
      + (nights != null ? ` su ${nights} notti annotate` : '')
      + '.',
    );
    if (d != null && refIt) {
      parts.push(
        (isCalendar
          ? `Rispetto al mese solare precedente (${refIt})`
          : `Rispetto al periodo precedente (${refIt})`)
        + ` la differenza è di ${formatItNumber(d)} ore.`,
      );
    }
    parts.push(
      'La misura riguarda la durata registrata, non la qualità del recupero.',
    );
  } else if (dominant.theme === 'protein_intake_shift' || dominant.theme === 'kcal_intake_shift') {
    const isKcal = dominant.fact?.metric === 'avgKcal';
    const d = dominant.fact?.absoluteDelta;
    const val = formatItNumber(dominant.fact?.current);
    const daysFood = agg.nutrition?.daysWithFood;
    headline = isKcal
      ? (d != null && d < 0
        ? `Kcal medie in calo a ${monthLabel}`
        : `Kcal medie in aumento a ${monthLabel}`)
      : (d != null && d < 0
        ? `Proteine medie in calo a ${monthLabel}`
        : `Proteine medie in aumento a ${monthLabel}`);
    parts.push(
      `A ${monthLabel} (${periodIt}) la media delle ${isKcal ? 'kcal' : 'proteine'} registrate`
      + ` è circa ${val}`
      + (isKcal ? '' : ' g')
      + '/giorno'
      + (daysFood != null ? ` su ${daysFood} giorni con alimentazione annotata` : '')
      + '.',
    );
    if (d != null && refIt) {
      parts.push(
        (isCalendar
          ? `Rispetto al mese solare precedente (${refIt})`
          : `Rispetto al periodo precedente (${refIt})`)
        + ` la media è ${d < 0 ? 'inferiore' : 'superiore'} di ${formatItNumber(Math.abs(Number(d)))}`
        + (isKcal ? '' : ' g')
        + '/giorno.',
      );
    } else if (!refIt) {
      parts.push('Non è disponibile un confronto omogeneo con un periodo precedente.');
    }
    parts.push(
      isKcal
        ? 'Descrizione delle sole registrazioni, senza conclusioni fisiologiche.'
        : 'Descrizione delle sole registrazioni: non implica deficit proteico né effetti fisiologici.',
    );
  } else {
    headline = `Percorso multi-abitudine a ${monthLabel}`;
    parts.push(
      `A ${monthLabel} (${periodIt}) risultano documentati: ${(agg.solidDomains || []).join(', ')}.`
      + ' Sono domini distinti, senza nesso di causa.',
    );
  }

  const summary = parts.filter(Boolean).join(' ');
  return { headline, summary, facts };
}

/**
 * @param {object} agg
 * @param {object|null|undefined} comparison
 * @param {object} dominant
 */
function buildMonthFingerprint(agg, comparison, dominant) {
  return [
    'month',
    agg.fromDate,
    agg.toDate,
    dominant?.theme || 'none',
    `food${agg.nutrition?.daysWithFood ?? 0}`,
    `sleep${agg.sleep?.nightsLogged ?? 0}`,
    `str${agg.activity?.strengthDaysLogged ?? 0}`,
    comparison?.available ? `cmp${dominant?.fact?.absoluteDelta ?? 0}` : 'nocmp',
  ].join('|');
}
