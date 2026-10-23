/**
 * Contratto di commit protetto della memoria editoriale (P6.7.2i).
 * Puro: fingerprint canonico + decisione replace-if-unchanged.
 * Nessuna I/O.
 */

import { createEmptyEditorialMemory } from '../../editorial/focusEditorialMemory.js';
import { stableFingerprint, toRtdbJson } from '../sanitize/rtdbSanitize.js';
import {
  PUBLISH_BARRIER_PUBLISHING,
  PUBLISH_COORDINATION_KEYS,
  preservePublishCoordination,
  readPublishCoordination,
} from './publishBarrier.js';

/** Authority obbligatoria: solo piani di replay autorevoli (P6.7.2h+). */
export const FOCUS_MEMORY_REPLACE_AUTHORITY = 'authoritative_replay_v1';

/**
 * Canonicalizza strutture JSON con chiavi ordinate (ricorsivo).
 * Evita fingerprint dipendenti dall'ordine di inserimento delle proprietà.
 * @param {unknown} value
 * @returns {unknown}
 */
export function canonicalizeJsonValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalizeJsonValue(value[key]);
  }
  return out;
}

/**
 * @param {unknown} memory
 * @returns {object|null}
 */
export function normalizeMemoryForFingerprint(memory) {
  if (memory == null) return null;
  if (typeof memory !== 'object') return null;
  return toRtdbJson(memory);
}

/**
 * Stato completo Persistito (include updatedAt) — cursore di concorrenza.
 * @param {unknown} memory
 */
export function fingerprintEditorialMemoryState(memory) {
  const normalized = normalizeMemoryForFingerprint(memory);
  if (normalized == null) {
    return stableFingerprint({ __editorialMemory: 'absent' });
  }
  return stableFingerprint(canonicalizeJsonValue(normalized));
}

/**
 * Contenuto editoriale (esclude updatedAt e metadati barriera/generation).
 * La coordination è confrontata separatamente (barrier busy / generation CAS).
 * @param {unknown} memory
 */
export function fingerprintEditorialMemoryPayload(memory) {
  const normalized = normalizeMemoryForFingerprint(memory);
  if (normalized == null) {
    return stableFingerprint({ __editorialMemory: 'absent' });
  }
  const { updatedAt: _updatedAt, ...rest } = normalized;
  for (const key of PUBLISH_COORDINATION_KEYS) {
    delete rest[key];
  }
  return stableFingerprint(canonicalizeJsonValue(rest));
}

/**
 * Cursore da memorizzare dopo una lettura, prima del rebuild.
 * @param {unknown} memory null se assente
 * @returns {{
 *   lastAppliedEdition: string|null,
 *   stateFingerprint: string,
 *   payloadFingerprint: string,
 * }}
 */
export function buildEditorialMemoryCursor(memory) {
  const normalized = normalizeMemoryForFingerprint(memory);
  const coord = readPublishCoordination(normalized);
  return {
    lastAppliedEdition: normalized?.lastAppliedEdition ?? null,
    stateFingerprint: fingerprintEditorialMemoryState(normalized),
    payloadFingerprint: fingerprintEditorialMemoryPayload(normalized),
    publishGeneration: coord.publishGeneration,
    publishBarrier: coord.publishBarrier,
  };
}

/**
 * Decisione pura di replace. Nessuna scrittura.
 *
 * @param {{
 *   current: object|null|undefined,
 *   expected: {
 *     lastAppliedEdition?: string|null,
 *     stateFingerprint: string,
 *   },
 *   nextMemory: object,
 *   authority?: string,
 * }} input
 * @returns {{
 *   action: 'commit'|'unchanged'|'conflict'|'reject',
 *   error?: string,
 *   memory?: object|null,
 *   cursor?: ReturnType<typeof buildEditorialMemoryCursor>,
 * }}
 */
export function evaluateEditorialMemoryReplace(input) {
  if (input?.authority !== FOCUS_MEMORY_REPLACE_AUTHORITY) {
    return {
      action: 'reject',
      error: 'memory_replace_authority_required',
      memory: null,
    };
  }

  const expected = input?.expected;
  if (!expected || typeof expected !== 'object') {
    return { action: 'reject', error: 'expected_cursor_required', memory: null };
  }
  if (!expected.stateFingerprint || typeof expected.stateFingerprint !== 'string') {
    return { action: 'reject', error: 'expected_state_fingerprint_required', memory: null };
  }

  const nextMemory = input?.nextMemory;
  if (!nextMemory || typeof nextMemory !== 'object') {
    return { action: 'reject', error: 'next_memory_required', memory: null };
  }
  if (!Object.prototype.hasOwnProperty.call(nextMemory, 'lastAppliedEdition')) {
    return { action: 'reject', error: 'next_memory_lastAppliedEdition_required', memory: null };
  }

  const currentRaw = input?.current;
  const current = currentRaw == null
    ? null
    : toRtdbJson(currentRaw);

  const currentCursor = buildEditorialMemoryCursor(current);
  const coord = readPublishCoordination(current);

  if (coord.publishBarrier === PUBLISH_BARRIER_PUBLISHING) {
    return {
      action: 'reject',
      error: 'publication_in_progress',
      memory: current,
      cursor: currentCursor,
    };
  }

  const expectedLast = expected.lastAppliedEdition ?? null;
  if (currentCursor.lastAppliedEdition !== expectedLast) {
    return {
      action: 'conflict',
      error: 'memory_conflict_last_applied',
      memory: current,
      cursor: currentCursor,
    };
  }
  if (
    expected.publishGeneration != null
    && Number(expected.publishGeneration) !== coord.publishGeneration
  ) {
    return {
      action: 'conflict',
      error: 'memory_conflict_generation',
      memory: current,
      cursor: currentCursor,
    };
  }
  if (currentCursor.stateFingerprint !== expected.stateFingerprint) {
    return {
      action: 'conflict',
      error: 'memory_conflict_state',
      memory: current,
      cursor: currentCursor,
    };
  }

  // Il recovery non deve alterare i metadati di barriera/generation.
  const nextStored = preservePublishCoordination(toRtdbJson(nextMemory), current);
  const nextPayload = fingerprintEditorialMemoryPayload(nextStored);
  if (nextPayload === currentCursor.payloadFingerprint) {
    return {
      action: 'unchanged',
      memory: current ?? createEmptyEditorialMemory(),
      cursor: currentCursor,
    };
  }

  return {
    action: 'commit',
    memory: nextStored,
    cursor: buildEditorialMemoryCursor(nextStored),
  };
}
