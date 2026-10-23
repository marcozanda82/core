/**
 * Memoria per selezione/scrittura durante explicitRegen (P6.7.2p).
 * Solo edizioni autorevoli con publicationDate < data rigenerata.
 * Fail-closed se pointer/snapshot incoerenti — niente fallback a memoria vuota.
 */

import { createEmptyEditorialMemory } from '../../editorial/focusEditorialMemory.js';
import {
  planEditorialMemoryReplay,
  rebuildEditorialMemoryFromEvents,
  resolveAuthoritativePublishedEditions,
} from './focusMemoryReplay.js';
import {
  loadAuthoritativePublishSnapshot,
  loadMemoryEventsForEditions,
} from './recoverFocusEditorialMemory.js';
import { isIsoDateString } from '../../normalize/focusDateUtils.js';
import { toRtdbJson } from '../sanitize/rtdbSanitize.js';

/**
 * @param {{
 *   uid: string,
 *   persistence: object,
 *   publicationDate: string,
 *   updatedAt?: string,
 * }} input
 * @returns {Promise<{
 *   ok: boolean,
 *   memory?: object,
 *   appliedEditionKeys?: string[],
 *   excludedSameOrLaterDates?: string[],
 *   error?: string,
 *   details?: object,
 * }>}
 */
export async function buildSelectionMemoryForExplicitRegen(input) {
  const uid = String(input?.uid || '').trim();
  const persistence = input?.persistence;
  const publicationDate = String(input?.publicationDate || '').trim();

  if (!uid || !persistence) {
    return { ok: false, error: 'persistence_required' };
  }
  if (!isIsoDateString(publicationDate)) {
    return { ok: false, error: 'publication_date_invalid' };
  }
  if (typeof persistence.listArchiveIndex !== 'function'
    || typeof persistence.getMemoryEvent !== 'function'
    || typeof persistence.getPublishedEdition !== 'function') {
    return { ok: false, error: 'persistence_required' };
  }

  const snap = await loadAuthoritativePublishSnapshot(persistence, uid);
  if (!snap.ok) {
    return {
      ok: false,
      error: snap.error || 'publish_snapshot_load_failed',
    };
  }

  const excludedSameOrLaterDates = [];
  const priorArchive = [];
  for (const entry of snap.archiveEntries || []) {
    const d = entry?.publicationDate;
    if (!d) {
      return {
        ok: false,
        error: 'archive_entry_invalid',
        details: { entry },
      };
    }
    if (String(d) >= publicationDate) {
      excludedSameOrLaterDates.push(String(d));
      continue;
    }
    priorArchive.push(entry);
  }

  /** @type {Record<string, object|null>} */
  const metasByDate = {};
  /** @type {Record<string, object|null>} */
  const jobsByDate = {};
  for (const entry of priorArchive) {
    const d = entry.publicationDate;
    metasByDate[d] = snap.metasByDate?.[d] ?? null;
    jobsByDate[d] = snap.jobsByDate?.[d] ?? null;
  }

  // Nessuna data precedente: memoria vuota è fedele (non è un fallback d'errore).
  if (priorArchive.length === 0) {
    return {
      ok: true,
      memory: toRtdbJson(createEmptyEditorialMemory()),
      appliedEditionKeys: [],
      excludedSameOrLaterDates,
    };
  }

  const published = resolveAuthoritativePublishedEditions({
    archiveEntries: priorArchive,
    metasByDate,
    jobsByDate,
  });
  if (!published.ok) {
    return {
      ok: false,
      error: published.error || 'prior_publish_pointers_inconsistent',
      details: {
        conflicts: published.conflicts,
        errors: published.errors,
        excludedSameOrLaterDates,
      },
    };
  }

  const memoryEventsByKey = await loadMemoryEventsForEditions(
    persistence,
    uid,
    published.editions,
  );

  const plan = planEditorialMemoryReplay({
    archiveEntries: priorArchive,
    metasByDate,
    jobsByDate,
    memoryEventsByKey,
  });
  if (!plan.ok) {
    return {
      ok: false,
      error: plan.error || 'selection_memory_unrecoverable',
      details: {
        missing: plan.missing,
        invalid: plan.invalid,
        conflicts: plan.conflicts,
        errors: plan.errors,
        excludedSameOrLaterDates,
        note: 'no_empty_fallback_on_rebuild_failure',
      },
    };
  }

  const rebuilt = rebuildEditorialMemoryFromEvents(plan.events, {
    updatedAt: input?.updatedAt || new Date().toISOString(),
  });
  if (!rebuilt.ok) {
    return {
      ok: false,
      error: rebuilt.error || 'selection_memory_rebuild_failed',
      details: rebuilt.details,
      excludedSameOrLaterDates,
    };
  }

  return {
    ok: true,
    memory: rebuilt.memory,
    appliedEditionKeys: rebuilt.appliedEditionKeys,
    excludedSameOrLaterDates,
  };
}
