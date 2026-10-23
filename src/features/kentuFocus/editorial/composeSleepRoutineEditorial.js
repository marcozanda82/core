/**
 * Compone i segnali P6.2 in un’unica storia editoriale sul ritmo settimanale (P6.3).
 * Non crea pipeline parallela: produce un candidato compatibile con extractFocusSignals.
 */

import { FOCUS_PROVENANCE } from '../contracts/focusDossier.v1.js';
import { SLEEP_ROUTINE_RELIABILITY } from '../aggregate/aggregateSleepRoutine.js';
import { buildSleepRoutineSignals } from '../aggregate/buildSleepRoutineSignals.js';
import {
  evaluateSleepRoutineAntiRepeat,
  SLEEP_ROUTINE_EDITORIAL_FAMILY,
  topicNoveltyFromMemory,
} from './focusEditorialMemory.js';

/** TopicIds grezzi che confluiscono nella storia unificata. */
export const SLEEP_WEEKLY_RHYTHM_MEMBER_TOPICS = Object.freeze([
  'sleep_wake_weekday_stable',
  'sleep_wake_weekend_vs_weekday',
  'sleep_duration_weekend_vs_weekday',
  'sleep_wake_regularity_change',
  'sleep_bedtime_shift_recent',
]);

export const SLEEP_WEEKLY_RHYTHM_TOPIC_ID = 'sleep_weekly_rhythm';

/**
 * @param {object|null|undefined} sleepRoutine blocco dossier.sleepRoutine o lab
 * @param {object|null} memory
 * @param {{ publicationDate?: string|null }} [opts]
 * @returns {object|null} candidato editoriale o null
 */
export function composeSleepWeeklyRhythmCandidate(sleepRoutine, memory = null, opts = {}) {
  if (!sleepRoutine || typeof sleepRoutine !== 'object') return null;
  const aggregate = sleepRoutine.aggregate;
  if (!aggregate) return null;

  const rawSignals = Array.isArray(sleepRoutine.signals) && sleepRoutine.signals.length > 0
    ? sleepRoutine.signals
    : buildSleepRoutineSignals({
      aggregate,
      fromDate: sleepRoutine.primaryWindow?.from || aggregate.coverage?.fromDate,
      toDate: sleepRoutine.primaryWindow?.to || aggregate.coverage?.toDate,
    });

  const publishable = rawSignals.filter((s) => s && s.publishable === true);
  const memberHits = publishable.filter(
    (s) => SLEEP_WEEKLY_RHYTHM_MEMBER_TOPICS.includes(s.topicId),
  );

  const period = {
    from: sleepRoutine.primaryWindow?.from || aggregate.coverage?.fromDate || null,
    to: sleepRoutine.primaryWindow?.to || aggregate.coverage?.toDate || null,
    windowDays: aggregate.coverage?.windowDays ?? null,
  };

  const anomalyFraction = aggregate.coverage?.anomalyFraction ?? 0;
  const wwRel = aggregate.reliability?.weekdayWeekendCompare?.status;
  const dispRel = aggregate.reliability?.wakeDispersion?.status;

  if (memberHits.length === 0) {
    return null;
  }
  if (
    wwRel === SLEEP_ROUTINE_RELIABILITY.insufficient_evidence
    && dispRel === SLEEP_ROUTINE_RELIABILITY.insufficient_evidence
  ) {
    return null;
  }

  const stable = memberHits.find((s) => s.topicId === 'sleep_wake_weekday_stable');
  const wakeShift = memberHits.find((s) => s.topicId === 'sleep_wake_weekend_vs_weekday');
  const durationShift = memberHits.find((s) => s.topicId === 'sleep_duration_weekend_vs_weekday');
  const regularity = memberHits.find((s) => s.topicId === 'sleep_wake_regularity_change');
  const bedtime = memberHits.find((s) => s.topicId === 'sleep_bedtime_shift_recent');

  const evidenceFingerprint = buildEvidenceFingerprint({
    stable,
    wakeShift,
    durationShift,
    regularity,
    bedtime,
    anomalyFraction,
  });

  const significantChange = Boolean(
    regularity?.publishable || bedtime?.publishable,
  );

  const anti = evaluateSleepRoutineAntiRepeat({
    memory,
    publicationDate: opts.publicationDate || null,
    familyId: SLEEP_ROUTINE_EDITORIAL_FAMILY,
    topicId: SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
    significantChange,
    evidenceFingerprint,
  });

  if (anti.suppress) {
    return {
      id: 'sig_sleep_weekly_rhythm',
      topicId: SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
      editorialFamily: SLEEP_ROUTINE_EDITORIAL_FAMILY,
      domain: 'sleep',
      typology: 'sleep_weekly_rhythm',
      claimType: 'calculated',
      tone: 'neutral',
      evidenceQuality: 'medium',
      novelty: anti.novelty,
      persistence: 'emerging',
      headlineSeed: '',
      summarySeed: '',
      omitReason: anti.reason,
      publishable: false,
      preferredRoles: ['feature'],
      forbidRoles: ['lead', 'concern'],
      memberTopicIds: memberHits.map((s) => s.topicId),
      coverage: aggregate.coverage,
      observedPeriod: period,
      reliability: wwRel || dispRel || SLEEP_ROUTINE_RELIABILITY.insufficient_evidence,
      evidenceFingerprint,
      significantChange,
      doNotClaim: ['debito di sonno', 'insonnia', 'diagnosi'],
      limitations: ['Storia soppressa da anti-ripetizione'],
      metrics: [],
      refs: ['sleepRoutine'],
      provenance: FOCUS_PROVENANCE.calculated,
      actionability: 0,
    };
  }

  const ord = aggregate.ordinary || aggregate;
  const wakeMed = ord.wake?.weekday?.median;
  const wakeIqr = ord.regularity?.wakeWeekdayIqrH ?? ord.wake?.weekday?.iqr;
  const wakeDelta = ord.wake?.deltaWeekendMinusWeekdayH;
  const durDelta = ord.duration?.deltaWeekendMinusWeekdayH;

  const { headlineSeed, summarySeed } = buildNarrativeSeeds({
    stable: Boolean(stable),
    wakeShift: Boolean(wakeShift),
    durationShift: Boolean(durationShift),
    wakeMed,
    wakeIqr,
    wakeDelta,
    durDelta,
  });

  const reliability = (
    wwRel === SLEEP_ROUTINE_RELIABILITY.reliable
    || dispRel === SLEEP_ROUTINE_RELIABILITY.reliable
  )
    ? SLEEP_ROUTINE_RELIABILITY.reliable
    : SLEEP_ROUTINE_RELIABILITY.insufficient_evidence;

  if (reliability !== SLEEP_ROUTINE_RELIABILITY.reliable) {
    return null;
  }

  const bedtimeAmbiguousN = aggregate.coverage?.bedtimeAmbiguousN ?? 0;
  const bedtimeRecordedN = aggregate.coverage?.bedtimeRecordedN ?? 0;

  /** @type {object[]} */
  const metrics = [];
  if (wakeMed != null) {
    metrics.push({
      path: 'sleepRoutine.ordinary.wake.weekday.median',
      value: wakeMed,
      unit: 'hour_decimal',
      provenance: FOCUS_PROVENANCE.calculated,
    });
  }
  if (wakeIqr != null) {
    metrics.push({
      path: 'sleepRoutine.ordinary.regularity.wakeWeekdayIqrH',
      value: wakeIqr,
      unit: 'h',
      provenance: FOCUS_PROVENANCE.calculated,
    });
  }
  if (wakeDelta != null) {
    metrics.push({
      path: 'sleepRoutine.ordinary.wake.deltaWeekendMinusWeekdayH',
      value: wakeDelta,
      unit: 'h',
      provenance: FOCUS_PROVENANCE.calculated,
    });
  }
  if (durDelta != null) {
    metrics.push({
      path: 'sleepRoutine.ordinary.duration.deltaWeekendMinusWeekdayH',
      value: durDelta,
      unit: 'h',
      provenance: FOCUS_PROVENANCE.calculated,
    });
  }

  const novelty = anti.novelty !== 'new'
    ? anti.novelty
    : topicNoveltyFromMemory(memory, SLEEP_WEEKLY_RHYTHM_TOPIC_ID);

  return {
    id: 'sig_sleep_weekly_rhythm',
    topicId: SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
    editorialFamily: SLEEP_ROUTINE_EDITORIAL_FAMILY,
    domain: 'sleep',
    typology: 'sleep_weekly_rhythm',
    claimType: 'calculated',
    tone: 'neutral',
    storyClass: 'significant_pattern',
    evidenceQuality: anomalyFraction > 0.15 ? 'medium' : 'high',
    novelty,
    persistence: 'emerging',
    headlineSeed,
    summarySeed,
    publishable: true,
    preferredRoles: ['lead', 'feature', 'good'],
    forbidRoles: ['concern'],
    allowLeadOnlyIfStrong: true,
    memberTopicIds: memberHits.map((s) => s.topicId),
    memberSignals: memberHits.map((s) => ({
      topicId: s.topicId,
      support: s.support,
      publishReason: s.publishReason,
    })),
    conflictsWithTopicIds: ['sleep_hours_adequate', 'sleep_hours_short'],
    observedPeriod: period,
    coverage: {
      ...aggregate.coverage,
      memberPublishableCount: memberHits.length,
    },
    reliability,
    evidenceFingerprint,
    significantChange,
    bedtimeProvenanceSummary: {
      recordedN: bedtimeRecordedN,
      calculatedN: aggregate.coverage?.bedtimeCalculatedN ?? 0,
      ambiguousN: bedtimeAmbiguousN,
      note: bedtimeAmbiguousN > 0
        ? 'Alcuni bedtime coincidono con wake−duration: origine non verificabile.'
        : null,
    },
    refs: [
      'sleepRoutine.ordinary',
      'sleepRoutine.aggregate.reliability',
      'sleepRoutine.signals',
    ],
    metrics,
    provenance: FOCUS_PROVENANCE.calculated,
    actionability: 0.15,
    limitations: [
      'Pattern su notti ordinary; orari atipici conservati ma esclusi dai confronti forti',
      'Differenza di durata ≠ debito o recupero di sonno',
      ...(bedtimeAmbiguousN > 0
        ? ['Bedtime spesso ambiguo se persistito come wake−duration']
        : []),
    ],
    doNotClaim: [
      'debito di sonno',
      'recupero weekend automatico',
      'insonnia',
      'diagnosi',
      'risvegli notturni non registrati',
    ],
    editorialPriorityHint: 'compete_not_default_lead',
    antiRepeatHint: {
      topicId: SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
      familyId: SLEEP_ROUTINE_EDITORIAL_FAMILY,
      cooldownSuggestedDays: 7,
    },
  };
}

/**
 * @param {object} parts
 */
function buildNarrativeSeeds(parts) {
  const bits = [];
  if (parts.stable && parts.wakeMed != null) {
    bits.push(`sveglia feriale stabile intorno alle ${formatHour(parts.wakeMed)}`);
  } else if (parts.stable) {
    bits.push('sveglia feriale particolarmente regolare');
  }
  if (parts.wakeShift && parts.wakeDelta != null) {
    const dir = parts.wakeDelta > 0 ? 'più tardi' : 'più presto';
    bits.push(`nel weekend la sveglia si sposta di circa ${formatDeltaH(parts.wakeDelta)} (${dir})`);
  }
  if (parts.durationShift && parts.durDelta != null) {
    bits.push(`anche la durata cambia di circa ${formatDeltaH(parts.durDelta)} tra feriali e weekend`);
  }

  let headlineSeed = 'Il ritmo del sonno tra settimana e weekend';
  if (parts.stable && parts.wakeShift) {
    headlineSeed = 'Sveglia precisa in settimana, ritmo diverso nel weekend';
  } else if (parts.stable) {
    headlineSeed = 'Una sveglia feriale molto regolare';
  } else if (parts.wakeShift) {
    headlineSeed = 'Nel weekend la sveglia cambia rispetto ai feriali';
  }

  const summarySeed = bits.length > 0
    ? `${bits.join('; ')}. Osservazione sulle abitudini, non un giudizio sulla qualità del recupero.`
    : 'Pattern di routine del sonno osservabile sulla finestra disponibile.';

  return { headlineSeed, summarySeed };
}

/** @param {number} h */
function formatHour(h) {
  const wrapped = ((Number(h) % 24) + 24) % 24;
  const hh = Math.floor(wrapped);
  const mm = Math.round((wrapped - hh) * 60);
  return `${hh}:${String(mm).padStart(2, '0')}`;
}

/** @param {number} d */
function formatDeltaH(d) {
  const abs = Math.abs(Number(d));
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  if (hh === 0) return `${mm} min`;
  if (mm === 0) return `${hh} h`;
  return `${hh} h ${mm} min`;
}

/** @param {object} parts */
function buildEvidenceFingerprint(parts) {
  const round = (v) => (v == null || !Number.isFinite(Number(v))
    ? 'x'
    : String(Math.round(Number(v) * 10) / 10));
  return [
    parts.stable ? 'S' : '-',
    parts.wakeShift ? `W${round(parts.wakeShift.support?.deltaWeekendMinusWeekdayH)}` : '-',
    parts.durationShift ? `D${round(parts.durationShift.support?.deltaWeekendMinusWeekdayH)}` : '-',
    parts.regularity ? `R${round(parts.regularity.support?.wakeWeekdayIqrDeltaH)}` : '-',
    parts.bedtime ? `B${round(parts.bedtime.support?.bedtimeShiftH)}` : '-',
    `A${round(parts.anomalyFraction)}`,
  ].join('|');
}
