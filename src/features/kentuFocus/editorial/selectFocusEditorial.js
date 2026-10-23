/**
 * FocusEditorialSelection — ranking e selezione deterministici.
 * Non aggiorna la memoria editoriale.
 */

import { FOCUS_EDITION_KIND } from '../edition/editionCalendar.js';
import { evaluateEditionOverlap } from './centerpieceStoryGate.js';
import {
  FOCUS_EDITORIAL_CAPS,
  FOCUS_EDITORIAL_SCHEMA_VERSION,
  FOCUS_SCORE_THRESHOLDS,
  FOCUS_STORY_CLASS,
} from './focusEditorialConfig.js';
import { extractFocusSignals } from './extractFocusSignals.js';
import { selectFocusCoach } from './focusCoachCatalog.js';
import {
  FOCUS_EDITORIAL_SCALE,
  SLEEP_ROUTINE_EDITORIAL_FAMILY,
  evaluateSleepRoutineAntiRepeat,
  isEditorialFamilyInCooldown,
  isTopicInLeadCooldown,
  normalizeEditorialMemory,
} from './focusEditorialMemory.js';
import { rankFocusCandidates } from './rankFocusCandidates.js';
import { MONTH_CENTERPIECE_TOPIC_ID } from './composeMonthCenterpiece.js';
import { WEEK_CENTERPIECE_TOPIC_ID } from './composeWeekCenterpiece.js';
import { SLEEP_WEEKLY_RHYTHM_TOPIC_ID } from './composeSleepRoutineEditorial.js';

/**
 * P6.7.2a — lead sonno solo con cambiamento significativo o prima scoperta
 * documentabile da memoria editoriale presente.
 * `memory: null` ≠ prima scoperta (scelta conservativa).
 *
 * @param {object} candidate
 * @param {object|null|undefined} memory
 * @param {string|null|undefined} publicationDate
 */
export function isSleepWeeklyRhythmLeadEligible(candidate, memory, publicationDate) {
  if (!candidate) return false;
  const isSleep = candidate.topicId === SLEEP_WEEKLY_RHYTHM_TOPIC_ID
    || candidate.typology === 'sleep_weekly_rhythm';
  if (!isSleep) return false;
  if (candidate.significantChange) return true;
  if (!memory || !publicationDate) return false;
  const anti = evaluateSleepRoutineAntiRepeat({
    memory,
    publicationDate,
    familyId: candidate.editorialFamily || SLEEP_ROUTINE_EDITORIAL_FAMILY,
    topicId: candidate.topicId || SLEEP_WEEKLY_RHYTHM_TOPIC_ID,
    significantChange: false,
    evidenceFingerprint: candidate.evidenceFingerprint || null,
  });
  if (anti.suppress) return false;
  if (anti.note === 'no_editorial_memory_or_date') return false;
  return anti.novelty === 'new';
}

/**
 * @param {{
 *   dossier: object,
 *   memory?: object|null,
 *   caps?: Partial<typeof FOCUS_EDITORIAL_CAPS>,
 *   dossierContentHash?: string,
 * }} input
 */
export function selectFocusEditorial(input) {
  const dossier = input?.dossier;
  if (!dossier?.meta?.analysisDate || !dossier?.meta?.publicationDate) {
    throw new Error('selectFocusEditorial: dossier.meta.analysisDate/publicationDate richiesti');
  }

  // P6.7.2a: distinguere `memory: null` (non valutabile) da store vuoto (prima scoperta documentabile).
  // normalizeEditorialMemory(null) → empty store: non usarlo per il gate lead sonno.
  const memoryInput = input.memory;
  const memory = normalizeEditorialMemory(memoryInput);
  const caps = { ...FOCUS_EDITORIAL_CAPS, ...(input.caps || {}) };
  const publicationDate = dossier.meta.publicationDate;
  const analysisDate = dossier.meta.analysisDate;

  const raw = extractFocusSignals(dossier, memory);
  const ranked = rankFocusCandidates(raw, { memory, publicationDate });

  /** @type {object[]} */
  const omitted = [];
  const usedIds = new Set();
  const usedTopics = new Set();
  const usedDomains = new Set();

  const noteOmitted = (candidateId, reason) => {
    pushOmitted(omitted, { candidateId, reason });
  };

  const take = (candidate, role) => {
    if (!candidate || usedIds.has(candidate.id) || usedTopics.has(candidate.topicId)) return null;
    // Ruolo vietato: skip silenzioso (il candidato può ancora entrare in un altro ruolo).
    if (candidate.forbidRoles?.includes(role)) return null;
    if (candidate.omitReason) {
      noteOmitted(candidate.id, candidate.omitReason);
      return null;
    }
    if (candidate.publishable === false) {
      noteOmitted(candidate.id, 'not_publishable');
      return null;
    }
    if (
      candidate.claimType === 'hypothesis'
      && candidate.evidenceQuality === 'low'
      && (role === 'feature' || role === 'concern' || role === 'lead' || role === 'good')
    ) {
      noteOmitted(candidate.id, 'insufficient_evidence');
      return null;
    }
    if (candidate.claimType === 'hypothesis' && (role === 'concern' || role === 'lead')) {
      noteOmitted(candidate.id, 'hypothesis_not_elevated');
      return null;
    }
    if (role === 'lead' && isTopicInLeadCooldown(memory, candidate.topicId, publicationDate)) {
      noteOmitted(candidate.id, 'repeat');
      return null;
    }
    if (
      role === 'lead'
      && candidate.editorialFamily
      && isEditorialFamilyInCooldown(memory, candidate.editorialFamily, publicationDate)
      && !candidate.significantChange
    ) {
      noteOmitted(candidate.id, 'family_repeat');
      return null;
    }
    // Routine settimanale: non lead se già c’è notizia sulla notte quotidiana
    if (
      role === 'lead'
      && candidate.allowLeadOnlyIfStrong
      && [...usedTopics].some((t) => (candidate.conflictsWithTopicIds || []).includes(t))
    ) {
      noteOmitted(candidate.id, 'conflicts_daily_sleep_story');
      return null;
    }
    if (
      Array.isArray(candidate.conflictsWithTopicIds)
      && candidate.conflictsWithTopicIds.some((t) => usedTopics.has(t))
      && (role === 'lead' || role === 'good')
    ) {
      noteOmitted(candidate.id, 'conflicts_daily_sleep_story');
      return null;
    }
    usedIds.add(candidate.id);
    usedTopics.add(candidate.topicId);
    usedDomains.add(candidate.domain);
    return toNewsItem(candidate, role);
  };

  // Re-rank with narrative diversity after each pick would be complex; apply domain penalty in second pass.
  const reRank = () => rankFocusCandidates(
    ranked.filter((c) => !usedIds.has(c.id)),
    { memory, publicationDate, selectedDomains: usedDomains },
  );

  let pool = ranked;

  let lead = null;
  let openingMode = 'neutral';

  const leadPool = pool.filter((c) => {
    if (c.evidenceQuality === 'low') return false;
    if (c.score < FOCUS_SCORE_THRESHOLDS.leadMin) return false;
    if (c.forbidRoles?.includes('lead')) return false;
    if (c.claimType === 'hypothesis') return false;
    if (c.storyClass === FOCUS_STORY_CLASS.routine_log) return false;
    if (c.storyClass === FOCUS_STORY_CLASS.routine_confirmation) return false;
    if (c.id === 'sig_documentation_complete') return false;
    if (isTopicInLeadCooldown(memory, c.topicId, publicationDate)) return false;
    // P6.7.2a: sonno settimanale — non usare il blanket significant_pattern
    if (
      c.topicId === SLEEP_WEEKLY_RHYTHM_TOPIC_ID
      || c.typology === 'sleep_weekly_rhythm'
    ) {
      return isSleepWeeklyRhythmLeadEligible(c, memoryInput, publicationDate);
    }
    // Apertura: storie significative, oppure positive non-conferma.
    if (c.storyClass === FOCUS_STORY_CLASS.significant_pattern) return true;
    if (c.tone === 'positive') return true;
    return false;
  });
  for (const c of leadPool) {
    const item = take(c, 'lead');
    if (item) {
      lead = item;
      openingMode = c.openingModeHint
        || (c.storyClass === FOCUS_STORY_CLASS.significant_pattern
          || c.typology === 'window_comparison'
          || c.typology === 'sleep_weekly_rhythm'
          ? 'progress'
          : 'positive_fact');
      break;
    }
  }

  // Documentazione diario: solo feature/continuity, mai spacciata per progresso fisiologico come lead.
  if (!lead) {
    openingMode = 'neutral';
  }

  pool = reRank();

  /** Articolo centrale week/month: solo se c’è una storia; mai riempitivo. */
  let centerpiece = null;
  /** @type {string|null} */
  let overlapResolution = null;
  const editionKind = dossier.edition?.editionKind || dossier.meta?.editionKind || FOCUS_EDITION_KIND.daily;
  if (
    editionKind === FOCUS_EDITION_KIND.sunday_plus
    || editionKind === FOCUS_EDITION_KIND.month_plus
    || editionKind === FOCUS_EDITION_KIND.sunday_month_plus
  ) {
    centerpiece = pickCenterpiece(pool, editionKind, take, noteOmitted);
    pool = reRank();

    const overlap = evaluateEditionOverlap(lead, centerpiece);
    if (overlap.action === 'prefer_centerpiece_drop_lead' && lead && centerpiece) {
      overlapResolution = overlap.reason;
      const droppedLead = lead;
      const leadSigId = newsIdToSigId(droppedLead.id);
      // Escluso per overlap: resta in usedIds/topics così non rientra in lead/feature/good.
      usedIds.add(leadSigId);
      if (droppedLead.id) usedIds.add(droppedLead.id);
      usedTopics.add(droppedLead.topicId);
      noteOmitted(leadSigId, overlap.reason || 'overlap_prefer_centerpiece');
      lead = null;
      // Centerpiece mensile/settimanale dominante: apertura può restare vuota (niente riempitivi).
      openingMode = 'progress';
      pool = reRank();
    } else if (overlap.action === 'drop_centerpiece' && centerpiece) {
      overlapResolution = overlap.reason;
      const cpSigId = newsIdToSigId(centerpiece.id);
      usedIds.add(cpSigId);
      if (centerpiece.id) usedIds.add(centerpiece.id);
      usedTopics.add(centerpiece.topicId);
      noteOmitted(cpSigId, overlap.reason || 'overlap_no_autonomous_value');
      centerpiece = null;
      pool = reRank();
    } else if (overlap.action === 'keep_both' && overlap.reason) {
      overlapResolution = overlap.reason;
    }
  }

  /** @type {object[]} */
  const goodNews = [];
  for (const c of pool) {
    if (goodNews.length >= caps.goodNewsMax) break;
    if (c.storyClass === FOCUS_STORY_CLASS.routine_log) continue;
    if (isCenterpieceTopic(c.topicId)) continue; // centerpiece non in good
    if (c.tone !== 'positive' && c.storyClass !== FOCUS_STORY_CLASS.routine_confirmation) {
      continue;
    }
    if (c.score < FOCUS_SCORE_THRESHOLDS.goodNewsMin) continue;
    if (c.preferredRoles && !c.preferredRoles.includes('good') && !c.preferredRoles.includes('lead')) {
      continue;
    }
    const item = take(c, 'good');
    if (item) goodNews.push(item);
  }

  pool = reRank();

  /** @type {object[]} */
  const features = [];
  for (const c of pool) {
    if (features.length >= caps.featuresMax) break;
    if (c.score < FOCUS_SCORE_THRESHOLDS.featureMin) continue;
    if (c.storyClass === FOCUS_STORY_CLASS.routine_log) continue;
    // Week sotto sunday_month può diventare approfondimento se non già usato come centro.
    // Ipotesi con evidenza insufficiente: non riempire gli spazi degli approfondimenti.
    if (c.claimType === 'hypothesis' && c.evidenceQuality === 'low') {
      noteOmitted(c.id, 'insufficient_evidence');
      usedIds.add(c.id);
      continue;
    }
    if (c.tone === 'caution' && c.claimType === 'hypothesis') {
      const item = take(c, 'feature');
      if (item) features.push(item);
      continue;
    }
    if (c.tone === 'caution') continue;
    if (c.preferredRoles && !c.preferredRoles.includes('feature') && !c.preferredRoles.includes('lead')) {
      continue;
    }
    const item = take(c, 'feature');
    if (item) features.push(item);
  }

  pool = reRank();

  /** Rubrica continuità: log ordinari, senza riempire good/feature. */
  /** @type {object[]} */
  const continuity = [];
  for (const c of pool) {
    if (continuity.length >= (caps.continuityMax ?? 2)) break;
    if (c.storyClass !== FOCUS_STORY_CLASS.routine_log) continue;
    if (c.score < FOCUS_SCORE_THRESHOLDS.featureMin) continue;
    const item = take(c, 'continuity');
    if (item) continuity.push(item);
  }

  pool = reRank();

  /** @type {object[]} */
  const concerns = [];
  for (const c of pool) {
    if (concerns.length >= caps.concernsMax) break;
    if (c.tone !== 'caution') continue;
    if (c.claimType === 'hypothesis') {
      noteOmitted(c.id, c.evidenceQuality === 'low' ? 'insufficient_evidence' : 'hypothesis_not_concern');
      usedIds.add(c.id);
      continue;
    }
    if (c.score < FOCUS_SCORE_THRESHOLDS.concernMin) continue;
    // Persistenza: isolated ok solo come osservazione prudente fattuale (es. sonno corto una notte)
    const item = take(c, 'concern');
    if (item) concerns.push(item);
  }

  for (const c of ranked) {
    if (!usedIds.has(c.id)) {
      let reason = c.omitReason;
      if (!reason) {
        if (c.claimType === 'hypothesis' && c.evidenceQuality === 'low') {
          reason = 'insufficient_evidence';
        } else if (c.score < FOCUS_SCORE_THRESHOLDS.featureMin) {
          reason = 'score_below_feature_min';
        } else {
          reason = 'cap';
        }
      }
      noteOmitted(c.id, reason);
      usedIds.add(c.id);
    }
  }

  // Invariante: un escluso (es. overlap) non resta in nessuna posizione pubblicata.
  const omitIds = new Set(omitted.map((o) => o.candidateId));
  const conflictsOmit = (item) => {
    if (!item) return false;
    const sig = newsIdToSigId(item.id);
    return omitIds.has(sig) || omitIds.has(item.id);
  };
  if (conflictsOmit(lead)) lead = null;
  if (conflictsOmit(centerpiece)) centerpiece = null;
  const scrubList = (list) => list.filter((item) => !conflictsOmit(item));
  const goodNewsClean = scrubList(goodNews);
  const featuresClean = scrubList(features);
  const continuityClean = scrubList(continuity);
  const concernsClean = scrubList(concerns);

  const selectedNews = [
    lead,
    centerpiece,
    ...goodNewsClean,
    ...featuresClean,
    ...continuityClean,
    ...concernsClean,
  ].filter(Boolean);

  // Simmetrico: niente in omitted se ancora pubblicato dopo lo scrub.
  const publishedSigIds = new Set();
  for (const item of selectedNews) {
    publishedSigIds.add(newsIdToSigId(item.id));
    if (item.id) publishedSigIds.add(item.id);
  }
  const omittedClean = omitted.filter((o) => !publishedSigIds.has(o.candidateId));

  const coach = selectFocusCoach(dossier, selectedNews, memory, publicationDate);

  return {
    schemaVersion: FOCUS_EDITORIAL_SCHEMA_VERSION,
    publicationDate,
    analysisDate,
    editionKind,
    dossierRef: {
      schemaVersion: dossier.schemaVersion,
      contentHash: input.dossierContentHash || null,
    },
    openingMode,
    lead,
    centerpiece,
    goodNews: goodNewsClean,
    features: featuresClean,
    continuity: continuityClean,
    concerns: concernsClean,
    coach,
    omitted: omittedClean,
    caps,
    overlapResolution,
    editorialNotes: buildEditorialNotes(dossier, lead, coach, centerpiece, overlapResolution),
  };
}

function newsIdToSigId(newsId) {
  const id = String(newsId || '');
  if (id.startsWith('news_')) return `sig_${id.slice(5)}`;
  return id;
}

function isCenterpieceTopic(topicId) {
  return topicId === WEEK_CENTERPIECE_TOPIC_ID || topicId === MONTH_CENTERPIECE_TOPIC_ID;
}

/**
 * @param {object[]} pool
 * @param {string} editionKind
 * @param {Function} take
 * @param {Function} noteOmitted
 */
function pickCenterpiece(pool, editionKind, take, noteOmitted) {
  const monthCand = pool.find((c) => c.topicId === MONTH_CENTERPIECE_TOPIC_ID);
  const weekCand = pool.find((c) => c.topicId === WEEK_CENTERPIECE_TOPIC_ID);

  /** @type {object|null} */
  let primary = null;
  if (
    editionKind === FOCUS_EDITION_KIND.month_plus
    || editionKind === FOCUS_EDITION_KIND.sunday_month_plus
  ) {
    primary = monthCand || null;
    // Week sotto sunday_month: solo approfondimento se distinto; altrimenti omit.
    if (editionKind === FOCUS_EDITION_KIND.sunday_month_plus && weekCand) {
      const distinct = Boolean(
        weekCand.publishable !== false
        && !weekCand.omitReason
        && weekCand.evidenceFingerprint
        && weekCand.evidenceFingerprint !== monthCand?.evidenceFingerprint,
      );
      if (!distinct) {
        noteOmitted(
          weekCand.id,
          weekCand.omitReason || 'week_not_distinct_under_sunday_month_plus',
        );
      }
      // se distinct: resta in pool per features (preferredRoles include feature)
    }
  } else if (editionKind === FOCUS_EDITION_KIND.sunday_plus) {
    primary = weekCand || null;
  }

  if (!primary) return null;
  if (primary.publishable === false || primary.omitReason) {
    noteOmitted(primary.id, primary.omitReason || 'not_publishable');
    return null;
  }
  if (primary.score < FOCUS_SCORE_THRESHOLDS.featureMin) {
    noteOmitted(primary.id, 'score_below_feature_min');
    return null;
  }
  if (!primary.preferredRoles?.includes('centerpiece')) {
    noteOmitted(primary.id, 'not_centerpiece_role');
    return null;
  }
  return take(primary, 'centerpiece');
}

function toNewsItem(candidate, role) {
  return {
    id: `news_${candidate.id.replace(/^sig_/, '')}`,
    topicId: candidate.topicId,
    editorialFamily: candidate.editorialFamily || null,
    editorialScale: candidate.editorialScale || FOCUS_EDITORIAL_SCALE.episode,
    evidenceFingerprint: candidate.evidenceFingerprint || null,
    significantChange: Boolean(candidate.significantChange),
    memberTopicIds: candidate.memberTopicIds || null,
    observedPeriod: candidate.observedPeriod || null,
    reliability: candidate.reliability || null,
    storyClass: candidate.storyClass || null,
    storyKind: candidate.storyKind || null,
    role,
    tone: candidate.tone,
    claimType: candidate.claimType,
    domain: candidate.domain,
    typology: candidate.typology || null,
    headlineSeed: candidate.headlineSeed,
    summarySeed: candidate.summarySeed,
    refs: candidate.refs || [],
    metrics: candidate.metrics || [],
    evidenceQuality: candidate.evidenceQuality,
    persistence: candidate.persistence,
    novelty: candidate.novelty,
    actionability: candidate.actionability || 0,
    score: candidate.score,
    scoreBreakdown: candidate.scoreBreakdown,
    doNotClaim: candidate.doNotClaim || [],
    limitations: candidate.limitations || [],
    coverage: candidate.coverage,
    provenance: candidate.provenance,
    // P6.6.2a: preservare spine se già attaccata dal compose; non inventarla.
    ...(candidate.storySpine ? { storySpine: candidate.storySpine } : {}),
  };
}

function buildEditorialNotes(dossier, lead, coach, centerpiece, overlapResolution) {
  const notes = [];
  if (!lead) notes.push('no_lead_selected');
  if (!coach) notes.push('no_coach_selected');
  if (!centerpiece && dossier.edition?.editionKind
    && dossier.edition.editionKind !== FOCUS_EDITION_KIND.daily) {
    notes.push('no_centerpiece_selected');
  }
  if (overlapResolution) notes.push(`overlap_${overlapResolution}`);
  if (dossier.edition?.verificationStatus) {
    notes.push(`verification_${dossier.edition.verificationStatus}`);
  }
  if (dossier.edition?.notes?.length) {
    notes.push(...dossier.edition.notes);
  }
  if (dossier.meta?.flags?.nutritionTotalsAffectedByDedupe) {
    notes.push('nutrition_totals_affected_by_focus_dedupe');
  }
  if (dossier.history?.comparisons?.d7_vs_prev7 && !dossier.history.comparisons.d7_vs_prev7.available) {
    notes.push('d7_comparison_unavailable');
  }
  return notes;
}

/** Priorità motivi omitted: più specifici vincono sui generici. */
const OMIT_REASON_PRIORITY = {
  insufficient_evidence: 80,
  descriptive_habit_no_novelty: 75,
  hypothesis_not_elevated: 70,
  hypothesis_not_concern: 70,
  family_repeat: 65,
  repeat: 65,
  conflicts_daily_sleep_story: 60,
  role_forbidden_feature: 55,
  role_forbidden_lead: 55,
  role_forbidden_good: 55,
  role_forbidden_concern: 55,
  not_publishable: 50,
  score_below_feature_min: 40,
  low_evidence: 35,
  cap: 20,
};

/**
 * @param {object[]} omitted
 * @param {{ candidateId: string, reason: string }} entry
 */
function pushOmitted(omitted, entry) {
  const existing = omitted.find((o) => o.candidateId === entry.candidateId);
  if (!existing) {
    omitted.push(entry);
    return;
  }
  const nextPri = OMIT_REASON_PRIORITY[entry.reason] ?? 10;
  const prevPri = OMIT_REASON_PRIORITY[existing.reason] ?? 10;
  if (nextPri > prevPri) existing.reason = entry.reason;
}
