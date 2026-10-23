/**
 * Memoria editoriale pura e serializzabile.
 * selectFocusEditorial NON la muta; aggiornare solo dopo pubblicazione riuscita.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import {
  FOCUS_EDITORIAL_SCHEMA_VERSION,
  FOCUS_MEMORY_RULES,
} from './focusEditorialConfig.js';

/**
 * @returns {import('./focusEditorialMemory.js').FocusEditorialMemory}
 */
/** Famiglia editoriale routine sonno (anti-ripetizione cross-titolo). */
export const SLEEP_ROUTINE_EDITORIAL_FAMILY = 'sleep_routine';

/** Scale giornalistiche per anti-ripetizione (P6.5). */
export const FOCUS_EDITORIAL_SCALE = Object.freeze({
  episode: 'episode',
  week_interpretation: 'week_interpretation',
  month_transformation: 'month_transformation',
});

export function createEmptyEditorialMemory() {
  return {
    schemaVersion: FOCUS_EDITORIAL_SCHEMA_VERSION,
    updatedAt: null,
    lastAppliedEdition: null,
    recentLeads: [],
    recentTopics: [],
    recentCoach: [],
    recentByScale: {
      episode: [],
      week_interpretation: [],
      month_transformation: [],
    },
    activeExperiments: [],
    cooldown: {
      topics: {},
      coachTemplates: {},
      families: {},
      /** fingerprint@scale → untilDate */
      scaleFingerprints: {},
    },
  };
}

/**
 * @param {unknown} memory
 */
export function normalizeEditorialMemory(memory) {
  if (!memory || typeof memory !== 'object') return createEmptyEditorialMemory();
  const base = createEmptyEditorialMemory();
  const rbs = memory.recentByScale && typeof memory.recentByScale === 'object'
    ? memory.recentByScale
    : {};
  return {
    ...base,
    ...memory,
    recentLeads: Array.isArray(memory.recentLeads) ? memory.recentLeads : [],
    recentTopics: Array.isArray(memory.recentTopics) ? memory.recentTopics : [],
    recentCoach: Array.isArray(memory.recentCoach) ? memory.recentCoach : [],
    recentByScale: {
      episode: Array.isArray(rbs.episode) ? rbs.episode : [],
      week_interpretation: Array.isArray(rbs.week_interpretation) ? rbs.week_interpretation : [],
      month_transformation: Array.isArray(rbs.month_transformation) ? rbs.month_transformation : [],
    },
    activeExperiments: Array.isArray(memory.activeExperiments) ? memory.activeExperiments : [],
    cooldown: {
      topics: { ...(memory.cooldown?.topics || {}) },
      coachTemplates: { ...(memory.cooldown?.coachTemplates || {}) },
      families: { ...(memory.cooldown?.families || {}) },
      scaleFingerprints: { ...(memory.cooldown?.scaleFingerprints || {}) },
    },
  };
}

/**
 * Anti-ripetizione per scala (week/month). Non blocca un mensile solo perché
 * è uscita una notizia quotidiana sullo stesso tema.
 *
 * @param {{
 *   memory?: object|null,
 *   publicationDate?: string|null,
 *   scale: string,
 *   topicId: string,
 *   evidenceFingerprint?: string|null,
 *   significantChange?: boolean,
 * }} input
 */
export function evaluateScaleAntiRepeat(input) {
  const {
    memory = null,
    publicationDate = null,
    scale,
    topicId,
    evidenceFingerprint = null,
    significantChange = false,
  } = input || {};

  if (!scale || !topicId) {
    return { suppress: false, novelty: 'new', reason: null, significantChange: false };
  }
  if (!memory || !publicationDate || !isIsoDateString(publicationDate)) {
    return {
      suppress: false,
      novelty: 'new',
      reason: null,
      note: 'no_editorial_memory_or_date',
      significantChange: false,
    };
  }

  const mem = normalizeEditorialMemory(memory);
  const key = evidenceFingerprint
    ? `${scale}::${topicId}::${evidenceFingerprint}`
    : null;

  const bucket = mem.recentByScale[scale] || [];
  const priorSameFp = bucket.find(
    (e) => e.topicId === topicId
      && evidenceFingerprint
      && e.evidenceFingerprint === evidenceFingerprint,
  );
  // Stesso fingerprint = sempre escluso. «significantChange» vale solo con evidenza nuova.
  if (priorSameFp) {
    return {
      suppress: true,
      novelty: 'stale',
      reason: `${scale}_repeat_same_evidence`,
      significantChange: false,
    };
  }
  if (key) {
    const until = mem.cooldown.scaleFingerprints[key];
    if (until && isIsoDateString(until) && publicationDate <= until) {
      return {
        suppress: true,
        novelty: 'stale',
        reason: `${scale}_repeat_same_evidence`,
        significantChange: false,
      };
    }
  }

  const priorOtherFp = bucket.find(
    (e) => e.topicId === topicId
      && e.evidenceFingerprint
      && e.evidenceFingerprint !== evidenceFingerprint,
  );
  if (priorOtherFp && significantChange) {
    return {
      suppress: false,
      novelty: 'recurring',
      reason: null,
      note: 'significant_change_new_fingerprint',
      significantChange: true,
    };
  }

  return {
    suppress: false,
    novelty: bucket.some((e) => e.topicId === topicId) ? 'recurring' : 'new',
    reason: null,
    significantChange: Boolean(significantChange),
  };
}

/**
 * @param {object} memory
 * @param {string} familyId
 * @param {string} publicationDate
 */
export function isEditorialFamilyInCooldown(memory, familyId, publicationDate) {
  if (!familyId || !publicationDate) return false;
  const mem = normalizeEditorialMemory(memory);
  const until = mem.cooldown.families[familyId];
  if (until && isIsoDateString(until) && publicationDate <= until) return true;
  return false;
}

/**
 * Anti-ripetizione pura per storie routine sonno.
 * Senza memoria / senza date → non finge pubblicazioni precedenti.
 *
 * @param {{
 *   memory?: object|null,
 *   publicationDate?: string|null,
 *   familyId: string,
 *   topicId: string,
 *   significantChange?: boolean,
 *   evidenceFingerprint?: string|null,
 * }} input
 */
export function evaluateSleepRoutineAntiRepeat(input) {
  const {
    memory = null,
    publicationDate = null,
    familyId,
    topicId,
    significantChange = false,
    evidenceFingerprint = null,
  } = input || {};

  if (!memory || !publicationDate || !isIsoDateString(publicationDate)) {
    return {
      suppress: false,
      novelty: 'new',
      reason: null,
      note: 'no_editorial_memory_or_date',
    };
  }

  const mem = normalizeEditorialMemory(memory);
  const inCooldown = isEditorialFamilyInCooldown(mem, familyId, publicationDate)
    || isTopicInLeadCooldown(mem, topicId, publicationDate);
  const prior = mem.recentTopics.find(
    (t) => t.topicId === topicId || t.editorialFamily === familyId,
  );
  const sameFingerprint = Boolean(
    prior?.evidenceFingerprint
    && evidenceFingerprint
    && prior.evidenceFingerprint === evidenceFingerprint,
  );

  if (inCooldown) {
    if (
      significantChange
      && FOCUS_MEMORY_RULES.sleepRoutineSignificantChangeBypassesCooldown
    ) {
      return {
        suppress: false,
        novelty: 'recurring',
        reason: null,
        note: 'significant_change_bypasses_cooldown',
      };
    }
    return {
      suppress: true,
      novelty: sameFingerprint || !evidenceFingerprint ? 'stale' : 'recurring',
      reason: sameFingerprint || !evidenceFingerprint
        ? 'sleep_routine_family_repeat_same_evidence'
        : 'sleep_routine_family_cooldown',
      note: null,
    };
  }

  if (!prior) {
    return { suppress: false, novelty: 'new', reason: null, note: null };
  }
  return {
    suppress: false,
    novelty: topicNoveltyFromMemory(mem, topicId),
    reason: null,
    note: null,
  };
}

/**
 * @param {object} memory
 * @param {string} topicId
 * @param {string} publicationDate
 */
export function isTopicInLeadCooldown(memory, topicId, publicationDate) {
  if (!topicId) return false;
  const mem = normalizeEditorialMemory(memory);
  const until = mem.cooldown.topics[topicId];
  if (until && isIsoDateString(until) && publicationDate <= until) return true;
  return false;
}

/**
 * Lead topic usato nelle ultime N edizioni → novelty stale/recurring.
 * @param {object} memory
 * @param {string} topicId
 */
export function topicNoveltyFromMemory(memory, topicId) {
  const mem = normalizeEditorialMemory(memory);
  const hits = mem.recentLeads.filter(
    (e) => Array.isArray(e.topicIds) && e.topicIds.includes(topicId),
  );
  if (hits.length === 0) {
    const topicHit = mem.recentTopics.find((t) => t.topicId === topicId);
    if (!topicHit) return 'new';
    return topicHit.count14d > 0 ? 'recurring' : 'new';
  }
  if (hits.length >= 2) return 'stale';
  return 'recurring';
}

/**
 * @param {object} memory
 * @param {string} templateId
 * @param {string} publicationDate
 */
export function isCoachTemplateInCooldown(memory, templateId, publicationDate) {
  const mem = normalizeEditorialMemory(memory);
  const until = mem.cooldown.coachTemplates[templateId];
  if (until && isIsoDateString(until) && publicationDate <= until) return true;
  return false;
}

/**
 * Aggiorna memoria solo dopo pubblicazione riuscita.
 * Idempotente su (publicationDate, revision).
 *
 * @param {object|null} previousMemory
 * @param {{
 *   publicationDate: string,
 *   revision?: number|string,
 *   selection: object,
 *   updatedAt?: string,
 * }} publishEvent
 */
export function applyEditorialMemoryAfterPublish(previousMemory, publishEvent) {
  const {
    publicationDate,
    revision = 1,
    selection,
    updatedAt = new Date().toISOString(),
  } = publishEvent || {};

  if (!isIsoDateString(publicationDate)) {
    throw new Error('applyEditorialMemoryAfterPublish: publicationDate ISO richiesta');
  }
  if (!selection || typeof selection !== 'object') {
    throw new Error('applyEditorialMemoryAfterPublish: selection richiesta');
  }

  const prev = normalizeEditorialMemory(previousMemory);
  const editionKey = `${publicationDate}#${revision}`;
  if (prev.lastAppliedEdition === editionKey) {
    return prev;
  }

  const next = normalizeEditorialMemory(JSON.parse(JSON.stringify(prev)));
  next.updatedAt = updatedAt;
  next.lastAppliedEdition = editionKey;

  const topicIds = collectTopicIdsFromSelection(selection);
  if (selection.lead) {
    next.recentLeads = [
      {
        publicationDate,
        topicIds: selection.lead.topicId ? [selection.lead.topicId] : topicIds.slice(0, 1),
        newsId: selection.lead.id,
      },
      ...next.recentLeads,
    ].slice(0, FOCUS_MEMORY_RULES.maxRecentLeads);

    const leadTopic = selection.lead.topicId;
    if (leadTopic) {
      next.cooldown.topics[leadTopic] = addCalendarDays(
        publicationDate,
        FOCUS_MEMORY_RULES.leadTopicCooldownEditions,
      );
    }
    const leadFamily = selection.lead.editorialFamily;
    if (leadFamily) {
      next.cooldown.families[leadFamily] = addCalendarDays(
        publicationDate,
        FOCUS_MEMORY_RULES.sleepRoutineFamilyCooldownDays,
      );
    }
  }

  for (const item of collectNewsItems(selection)) {
    const topicId = item?.topicId;
    if (!topicId) continue;
    const existing = next.recentTopics.find((t) => t.topicId === topicId);
    if (existing) {
      existing.lastDates = [publicationDate, ...(existing.lastDates || [])].slice(0, 8);
      existing.count14d = (existing.count14d || 0) + 1;
      if (item.editorialFamily) existing.editorialFamily = item.editorialFamily;
      if (item.evidenceFingerprint) existing.evidenceFingerprint = item.evidenceFingerprint;
    } else {
      next.recentTopics.push({
        topicId,
        lastDates: [publicationDate],
        count14d: 1,
        editorialFamily: item.editorialFamily || null,
        evidenceFingerprint: item.evidenceFingerprint || null,
      });
    }
    if (item.editorialFamily) {
      next.cooldown.families[item.editorialFamily] = addCalendarDays(
        publicationDate,
        FOCUS_MEMORY_RULES.sleepRoutineFamilyCooldownDays,
      );
    }
    const scale = item.editorialScale || FOCUS_EDITORIAL_SCALE.episode;
    const scaleEntry = {
      publicationDate,
      topicId,
      editorialScale: scale,
      evidenceFingerprint: item.evidenceFingerprint || null,
    };
    const bucket = Array.isArray(next.recentByScale[scale]) ? next.recentByScale[scale] : [];
    next.recentByScale[scale] = [scaleEntry, ...bucket].slice(0, 12);
    if (
      item.evidenceFingerprint
      && (scale === FOCUS_EDITORIAL_SCALE.week_interpretation
        || scale === FOCUS_EDITORIAL_SCALE.month_transformation)
    ) {
      const fpKey = `${scale}::${topicId}::${item.evidenceFingerprint}`;
      const cooldownDays = scale === FOCUS_EDITORIAL_SCALE.month_transformation ? 40 : 10;
      next.cooldown.scaleFingerprints[fpKey] = addCalendarDays(publicationDate, cooldownDays);
    }
  }
  next.recentTopics = next.recentTopics.slice(0, FOCUS_MEMORY_RULES.maxRecentTopics);

  if (selection.coach && selection.coach.templateId && selection.coach.templateId !== 'NONE') {
    next.recentCoach = [
      {
        publicationDate,
        templateId: selection.coach.templateId,
        textSeed: selection.coach.textSeed,
      },
      ...next.recentCoach,
    ].slice(0, FOCUS_MEMORY_RULES.maxRecentCoach);

    next.cooldown.coachTemplates[selection.coach.templateId] = addCalendarDays(
      publicationDate,
      FOCUS_MEMORY_RULES.coachTemplateCooldownDays,
    );

    if (
      selection.coach.horizonDays
      && next.activeExperiments.filter((e) => e.status === 'open').length
        < FOCUS_MEMORY_RULES.maxOpenExperiments
    ) {
      next.activeExperiments.push({
        id: `exp_${selection.coach.templateId}_${publicationDate}`,
        templateId: selection.coach.templateId,
        startedOn: publicationDate,
        horizonDays: selection.coach.horizonDays,
        metricPaths: selection.coach.followUp?.metricPaths || [],
        status: 'open',
        followUpNote: null,
      });
    }
  }

  return next;
}

/** @param {object} selection */
function collectNewsItems(selection) {
  /** @type {object[]} */
  const items = [];
  if (selection.lead) items.push(selection.lead);
  if (selection.centerpiece) items.push(selection.centerpiece);
  for (const list of [
    selection.goodNews,
    selection.features,
    selection.continuity,
    selection.concerns,
  ]) {
    if (Array.isArray(list)) items.push(...list);
  }
  return items;
}

/** @param {object} selection */
function collectTopicIdsFromSelection(selection) {
  const ids = new Set();
  for (const item of collectNewsItems(selection)) {
    if (item?.topicId) ids.add(item.topicId);
  }
  return [...ids];
}
