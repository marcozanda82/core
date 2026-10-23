/**
 * Motore puro di replay memoria editoriale (P6.7.2h).
 * Nessuna I/O, nessuna scrittura, nessun collegamento a publish/pipeline.
 *
 * Fonte autorevole delle edizioni: archive (+ coerenza meta/job).
 * Gli snapshot memory_events non costituiscono un elenco di pubblicazioni.
 */

import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
} from '../../editorial/focusEditorialMemory.js';
import { isIsoDateString } from '../../normalize/focusDateUtils.js';
import {
  assessMemoryEventRecoverability,
  buildFocusMemoryEditionKey,
  memoryEventToPublishEvent,
  validateFocusMemoryEvent,
} from '../contracts/focusMemoryEvent.v1.js';
import { FOCUS_JOB_STATUS } from '../contracts/focusPersistence.v1.js';
import { toRtdbJson } from '../sanitize/rtdbSanitize.js';

/**
 * @param {string} editionKey
 * @returns {{ publicationDate: string, revision: number }|null}
 */
export function parseFocusEditionKey(editionKey) {
  const raw = String(editionKey || '');
  const hash = raw.lastIndexOf('#');
  if (hash <= 0) return null;
  const publicationDate = raw.slice(0, hash);
  const revision = Number(raw.slice(hash + 1));
  if (!isIsoDateString(publicationDate)) return null;
  if (!Number.isInteger(revision) || revision < 1) return null;
  return { publicationDate, revision };
}

/**
 * Ordine: data ISO crescente, poi revisione numerica.
 * @param {{ publicationDate: string, revision: number|string }} a
 * @param {{ publicationDate: string, revision: number|string }} b
 */
export function compareFocusEditionRefs(a, b) {
  const dateA = String(a?.publicationDate || '');
  const dateB = String(b?.publicationDate || '');
  if (dateA < dateB) return -1;
  if (dateA > dateB) return 1;
  return Number(a?.revision) - Number(b?.revision);
}

/**
 * @param {Array<{ publicationDate: string, revision: number|string }>} refs
 */
export function sortFocusEditionRefs(refs) {
  return [...(Array.isArray(refs) ? refs : [])].sort(compareFocusEditionRefs);
}

/**
 * Revisione corrente per una data: da meta se presente, altrimenti archive.
 * @param {{
 *   publicationDate: string,
 *   archiveRevision?: number|string|null,
 *   metaCurrentRevision?: number|string|null,
 * }} input
 */
export function resolveCurrentRevisionForDate(input) {
  const publicationDate = String(input?.publicationDate || '');
  if (!isIsoDateString(publicationDate)) {
    return { ok: false, error: 'publicationDate_invalid' };
  }
  const fromMeta = input?.metaCurrentRevision;
  const fromArchive = input?.archiveRevision;
  if (fromMeta != null && fromMeta !== '') {
    const revision = Number(fromMeta);
    if (!Number.isInteger(revision) || revision < 1) {
      return { ok: false, error: 'meta_currentRevision_invalid' };
    }
    return { ok: true, publicationDate, revision, source: 'meta' };
  }
  if (fromArchive != null && fromArchive !== '') {
    const revision = Number(fromArchive);
    if (!Number.isInteger(revision) || revision < 1) {
      return { ok: false, error: 'archive_revision_invalid' };
    }
    return { ok: true, publicationDate, revision, source: 'archive' };
  }
  return { ok: false, error: 'current_revision_missing' };
}

/**
 * True se candidate è una revisione della stessa data strettamente precedente alla corrente
 * (sostituita / non più puntata dai pointer pubblicati).
 * @param {{ publicationDate: string, revision: number|string }} candidate
 * @param {{ publicationDate: string, revision: number|string }} current
 */
export function isSupersededRevision(candidate, current) {
  if (!candidate || !current) return false;
  if (String(candidate.publicationDate) !== String(current.publicationDate)) return false;
  return Number(candidate.revision) < Number(current.revision);
}

/**
 * Verifica coerenza archive ↔ meta ↔ job per una data pubblicata.
 * @param {{
 *   publicationDate: string,
 *   archiveEntry?: object|null,
 *   meta?: object|null,
 *   job?: object|null,
 *   requireJobSucceeded?: boolean,
 * }} input
 */
export function assertPublishedPointersConsistent(input) {
  const publicationDate = String(input?.publicationDate || '');
  const errors = [];
  if (!isIsoDateString(publicationDate)) {
    return { ok: false, error: 'publicationDate_invalid', errors: ['publicationDate_invalid'] };
  }

  const archive = input?.archiveEntry;
  if (!archive || typeof archive !== 'object') {
    errors.push('archive_missing');
  } else {
    if (archive.publicationDate && archive.publicationDate !== publicationDate) {
      errors.push('archive_date_mismatch');
    }
    const archRev = Number(archive.revision);
    if (!Number.isInteger(archRev) || archRev < 1) {
      errors.push('archive_revision_invalid');
    }
  }

  const meta = input?.meta;
  if (!meta || typeof meta !== 'object') {
    errors.push('meta_missing');
  } else {
    if (meta.publicationDate && meta.publicationDate !== publicationDate) {
      errors.push('meta_date_mismatch');
    }
    const metaRev = Number(meta.currentRevision);
    if (!Number.isInteger(metaRev) || metaRev < 1) {
      errors.push('meta_currentRevision_invalid');
    }
  }

  const job = input?.job;
  const requireJobSucceeded = input?.requireJobSucceeded !== false;
  if (!job || typeof job !== 'object') {
    errors.push('job_missing');
  } else {
    if (job.publicationDate && job.publicationDate !== publicationDate) {
      errors.push('job_date_mismatch');
    }
    if (requireJobSucceeded && job.status !== FOCUS_JOB_STATUS.succeeded) {
      errors.push(`job_status_not_succeeded:${job.status || 'unknown'}`);
    }
    const jobRev = Number(job.publishedRevision);
    if (!Number.isInteger(jobRev) || jobRev < 1) {
      errors.push('job_publishedRevision_invalid');
    }
  }

  if (errors.length) {
    return { ok: false, error: 'published_pointers_inconsistent', errors };
  }

  const archiveRev = Number(archive.revision);
  const metaRev = Number(meta.currentRevision);
  const jobRev = Number(job.publishedRevision);
  if (archiveRev !== metaRev || metaRev !== jobRev) {
    return {
      ok: false,
      error: 'published_pointers_mismatch',
      errors: [
        `archive_revision=${archiveRev}`,
        `meta_currentRevision=${metaRev}`,
        `job_publishedRevision=${jobRev}`,
      ],
      revisions: { archive: archiveRev, meta: metaRev, job: jobRev },
    };
  }

  return {
    ok: true,
    publicationDate,
    revision: archiveRev,
    editionKey: buildFocusMemoryEditionKey(publicationDate, archiveRev),
  };
}

/**
 * Elenco autorevole delle edizioni pubblicate (current-only per data).
 * Non usa memory_events come fonte di pubblicazione.
 *
 * @param {{
 *   archiveEntries: object[],
 *   metasByDate?: Record<string, object|null|undefined>,
 *   jobsByDate?: Record<string, object|null|undefined>,
 *   requireJobSucceeded?: boolean,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   editions?: Array<{ publicationDate: string, revision: number, editionKey: string }>,
 *   error?: string,
 *   errors?: string[],
 *   conflicts?: object[],
 * }}
 */
export function resolveAuthoritativePublishedEditions(input) {
  const archiveEntries = Array.isArray(input?.archiveEntries) ? input.archiveEntries : [];
  const metasByDate = input?.metasByDate && typeof input.metasByDate === 'object'
    ? input.metasByDate
    : {};
  const jobsByDate = input?.jobsByDate && typeof input.jobsByDate === 'object'
    ? input.jobsByDate
    : {};

  /** @type {Map<string, object>} */
  const byDate = new Map();
  for (const entry of archiveEntries) {
    if (!entry || typeof entry !== 'object') {
      return {
        ok: false,
        error: 'archive_entry_invalid',
        errors: ['archive_entry_invalid'],
      };
    }
    const publicationDate = String(entry.publicationDate || '');
    if (!isIsoDateString(publicationDate)) {
      return {
        ok: false,
        error: 'archive_date_invalid',
        errors: [`archive_date_invalid:${publicationDate || 'empty'}`],
      };
    }
    if (byDate.has(publicationDate)) {
      return {
        ok: false,
        error: 'archive_duplicate_date',
        errors: [`archive_duplicate_date:${publicationDate}`],
      };
    }
    byDate.set(publicationDate, entry);
  }

  const conflicts = [];
  const editions = [];
  for (const publicationDate of [...byDate.keys()].sort()) {
    const archiveEntry = byDate.get(publicationDate);
    const checked = assertPublishedPointersConsistent({
      publicationDate,
      archiveEntry,
      meta: metasByDate[publicationDate],
      job: jobsByDate[publicationDate],
      requireJobSucceeded: input?.requireJobSucceeded,
    });
    if (!checked.ok) {
      conflicts.push({
        publicationDate,
        error: checked.error,
        errors: checked.errors,
        revisions: checked.revisions,
      });
      continue;
    }
    editions.push({
      publicationDate: checked.publicationDate,
      revision: checked.revision,
      editionKey: checked.editionKey,
    });
  }

  if (conflicts.length) {
    return {
      ok: false,
      error: 'published_pointers_inconsistent',
      errors: conflicts.flatMap((c) => [
        `${c.publicationDate}:${c.error}`,
        ...(c.errors || []),
      ]),
      conflicts,
    };
  }

  return {
    ok: true,
    editions: sortFocusEditionRefs(editions).map((e) => ({
      publicationDate: e.publicationDate,
      revision: Number(e.revision),
      editionKey: buildFocusMemoryEditionKey(e.publicationDate, e.revision),
    })),
  };
}

/**
 * Seleziona e verifica gli eventi per le sole edizioni autorevoli.
 * Eventi extra (mai pubblicati / sostituiti) vengono ignorati, non applicati.
 *
 * @param {{
 *   editions: Array<{ publicationDate: string, revision: number, editionKey: string }>,
 *   memoryEventsByKey?: Record<string, object|null|undefined>,
 *   memoryEvents?: object[],
 * }} input
 */
export function selectMemoryEventsForPublishedEditions(input) {
  const editions = sortFocusEditionRefs(input?.editions || []).map((e) => ({
    publicationDate: e.publicationDate,
    revision: Number(e.revision),
    editionKey: e.editionKey || buildFocusMemoryEditionKey(e.publicationDate, e.revision),
  }));

  /** @type {Record<string, object>} */
  const byKey = {};
  if (input?.memoryEventsByKey && typeof input.memoryEventsByKey === 'object') {
    for (const [key, value] of Object.entries(input.memoryEventsByKey)) {
      if (value) byKey[key] = value;
    }
  }
  if (Array.isArray(input?.memoryEvents)) {
    for (const evt of input.memoryEvents) {
      if (!evt || typeof evt !== 'object') continue;
      const key = evt.editionKey
        || buildFocusMemoryEditionKey(evt.publicationDate, evt.revision);
      byKey[key] = evt;
    }
  }

  const missing = [];
  const invalid = [];
  /** @type {object[]} */
  const events = [];

  for (const edition of editions) {
    const evt = byKey[edition.editionKey] || null;
    if (!evt) {
      missing.push({
        ...edition,
        reason: 'memory_event_missing',
      });
      continue;
    }
    const validation = validateFocusMemoryEvent(evt);
    if (!validation.ok) {
      invalid.push({
        ...edition,
        reason: 'memory_event_invalid',
        errors: validation.errors,
      });
      continue;
    }
    const recoverability = assessMemoryEventRecoverability(evt, {
      publicationDate: edition.publicationDate,
      revision: edition.revision,
    });
    if (!recoverability.recoverable) {
      invalid.push({
        ...edition,
        reason: recoverability.reason || 'memory_event_invalid',
        errors: recoverability.errors,
      });
      continue;
    }
    if (
      evt.publicationDate !== edition.publicationDate
      || Number(evt.revision) !== Number(edition.revision)
      || evt.editionKey !== edition.editionKey
    ) {
      invalid.push({
        ...edition,
        reason: 'memory_event_identity_mismatch',
      });
      continue;
    }
    events.push(toRtdbJson(evt));
  }

  if (missing.length || invalid.length) {
    return {
      ok: false,
      error: 'memory_unrecoverable',
      events: null,
      missing,
      invalid,
      excludedExtras: Object.keys(byKey).filter(
        (key) => !editions.some((e) => e.editionKey === key),
      ),
    };
  }

  return {
    ok: true,
    events,
    missing: [],
    invalid: [],
    excludedExtras: Object.keys(byKey).filter(
      (key) => !editions.some((e) => e.editionKey === key),
    ),
  };
}

/**
 * Piano completo fail-closed: pointer → eventi → pronto per replay.
 * Non scrive nulla.
 *
 * @param {{
 *   archiveEntries: object[],
 *   metasByDate?: Record<string, object|null|undefined>,
 *   jobsByDate?: Record<string, object|null|undefined>,
 *   memoryEventsByKey?: Record<string, object|null|undefined>,
 *   memoryEvents?: object[],
 *   requireJobSucceeded?: boolean,
 * }} input
 */
export function planEditorialMemoryReplay(input) {
  const published = resolveAuthoritativePublishedEditions({
    archiveEntries: input?.archiveEntries,
    metasByDate: input?.metasByDate,
    jobsByDate: input?.jobsByDate,
    requireJobSucceeded: input?.requireJobSucceeded,
  });
  if (!published.ok) {
    return {
      ok: false,
      error: published.error,
      errors: published.errors,
      conflicts: published.conflicts,
      editions: null,
      events: null,
    };
  }

  const selected = selectMemoryEventsForPublishedEditions({
    editions: published.editions,
    memoryEventsByKey: input?.memoryEventsByKey,
    memoryEvents: input?.memoryEvents,
  });
  if (!selected.ok) {
    return {
      ok: false,
      error: selected.error,
      editions: published.editions,
      events: null,
      missing: selected.missing,
      invalid: selected.invalid,
      excludedExtras: selected.excludedExtras,
    };
  }

  return {
    ok: true,
    editions: published.editions,
    events: selected.events,
    excludedExtras: selected.excludedExtras,
  };
}

/**
 * Replay puro: empty → apply in ordine. Nessuna mutazione degli eventi, nessuna I/O.
 *
 * @param {object[]} memoryEvents sequenza già verificata di FocusMemoryEvent
 * @param {{ updatedAt?: string }} [opts]
 * @returns {{
 *   ok: true,
 *   memory: object,
 *   appliedEditionKeys: string[],
 * } | {
 *   ok: false,
 *   error: string,
 *   memory: null,
 *   details?: object,
 * }}
 */
export function rebuildEditorialMemoryFromEvents(memoryEvents, opts = {}) {
  if (!Array.isArray(memoryEvents)) {
    return { ok: false, error: 'memory_events_not_array', memory: null };
  }

  const appliedEditionKeys = [];
  let memory = createEmptyEditorialMemory();
  const updatedAt = opts.updatedAt || '1970-01-01T00:00:00.000Z';

  for (let i = 0; i < memoryEvents.length; i += 1) {
    const evt = memoryEvents[i];
    const validation = validateFocusMemoryEvent(evt);
    if (!validation.ok) {
      return {
        ok: false,
        error: 'memory_unrecoverable',
        memory: null,
        details: {
          index: i,
          reason: 'memory_event_invalid',
          errors: validation.errors,
        },
      };
    }

    if (i > 0) {
      const prev = memoryEvents[i - 1];
      const cmp = compareFocusEditionRefs(
        { publicationDate: prev.publicationDate, revision: prev.revision },
        { publicationDate: evt.publicationDate, revision: evt.revision },
      );
      if (cmp > 0) {
        return {
          ok: false,
          error: 'memory_events_out_of_order',
          memory: null,
          details: {
            index: i,
            previousKey: prev.editionKey,
            currentKey: evt.editionKey,
          },
        };
      }
      if (cmp === 0) {
        return {
          ok: false,
          error: 'memory_events_duplicate_key',
          memory: null,
          details: { index: i, editionKey: evt.editionKey },
        };
      }
    }

    try {
      memory = applyEditorialMemoryAfterPublish(memory, {
        ...memoryEventToPublishEvent(evt),
        updatedAt,
      });
    } catch (err) {
      return {
        ok: false,
        error: 'memory_apply_failed',
        memory: null,
        details: {
          index: i,
          editionKey: evt.editionKey,
          message: err?.message || String(err),
        },
      };
    }
    appliedEditionKeys.push(evt.editionKey);
  }

  return {
    ok: true,
    memory: toRtdbJson(memory),
    appliedEditionKeys,
  };
}

/**
 * Convenience fail-closed: pianifica + replay. Non tocca persistenza.
 * @param {Parameters<typeof planEditorialMemoryReplay>[0] & { updatedAt?: string }} input
 */
export function rebuildEditorialMemoryFromPublishedPointers(input) {
  const plan = planEditorialMemoryReplay(input);
  if (!plan.ok) {
    return {
      ok: false,
      error: plan.error,
      memory: null,
      editions: plan.editions,
      missing: plan.missing,
      invalid: plan.invalid,
      conflicts: plan.conflicts,
      errors: plan.errors,
      excludedExtras: plan.excludedExtras,
    };
  }

  const rebuilt = rebuildEditorialMemoryFromEvents(plan.events, {
    updatedAt: input?.updatedAt,
  });
  if (!rebuilt.ok) {
    return {
      ok: false,
      error: rebuilt.error,
      memory: null,
      editions: plan.editions,
      details: rebuilt.details,
      excludedExtras: plan.excludedExtras,
    };
  }

  return {
    ok: true,
    memory: rebuilt.memory,
    editions: plan.editions,
    appliedEditionKeys: rebuilt.appliedEditionKeys,
    excludedExtras: plan.excludedExtras,
  };
}
