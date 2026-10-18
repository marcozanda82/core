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
export function createEmptyEditorialMemory() {
  return {
    schemaVersion: FOCUS_EDITORIAL_SCHEMA_VERSION,
    updatedAt: null,
    lastAppliedEdition: null,
    recentLeads: [],
    recentTopics: [],
    recentCoach: [],
    activeExperiments: [],
    cooldown: {
      topics: {},
      coachTemplates: {},
    },
  };
}

/**
 * @param {unknown} memory
 */
export function normalizeEditorialMemory(memory) {
  if (!memory || typeof memory !== 'object') return createEmptyEditorialMemory();
  const base = createEmptyEditorialMemory();
  return {
    ...base,
    ...memory,
    recentLeads: Array.isArray(memory.recentLeads) ? memory.recentLeads : [],
    recentTopics: Array.isArray(memory.recentTopics) ? memory.recentTopics : [],
    recentCoach: Array.isArray(memory.recentCoach) ? memory.recentCoach : [],
    activeExperiments: Array.isArray(memory.activeExperiments) ? memory.activeExperiments : [],
    cooldown: {
      topics: { ...(memory.cooldown?.topics || {}) },
      coachTemplates: { ...(memory.cooldown?.coachTemplates || {}) },
    },
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
  }

  for (const topicId of topicIds) {
    const existing = next.recentTopics.find((t) => t.topicId === topicId);
    if (existing) {
      existing.lastDates = [publicationDate, ...(existing.lastDates || [])].slice(0, 8);
      existing.count14d = (existing.count14d || 0) + 1;
    } else {
      next.recentTopics.push({
        topicId,
        lastDates: [publicationDate],
        count14d: 1,
      });
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
function collectTopicIdsFromSelection(selection) {
  const ids = new Set();
  const push = (item) => {
    if (item?.topicId) ids.add(item.topicId);
  };
  push(selection.lead);
  for (const list of [selection.goodNews, selection.features, selection.concerns]) {
    if (Array.isArray(list)) list.forEach(push);
  }
  return [...ids];
}
