/**
 * Validazione edizione / revisione / job / indice.
 */

import { isIsoDateString } from '../../normalize/focusDateUtils.js';
import {
  FOCUS_EDITION_STATUS,
  FOCUS_JOB_STATUS,
  FOCUS_PAYLOAD_LIMITS,
  FOCUS_PERSISTENCE_SCHEMA_VERSION,
} from '../contracts/focusPersistence.v1.js';
import { measureJsonBytes, FocusSanitizeError, sanitizeForRtdb } from '../sanitize/rtdbSanitize.js';

const JOB_STATUS_SET = new Set(Object.values(FOCUS_JOB_STATUS));
const EDITION_STATUS_SET = new Set(Object.values(FOCUS_EDITION_STATUS));
const UNRELIABLE_PROVENANCE = new Set(['missing', 'estimated']);

/**
 * @param {unknown} doc
 * @param {string} kind
 * @param {number} maxBytes
 */
function baseValidate(doc, kind, maxBytes) {
  const errors = [];
  if (!doc || typeof doc !== 'object') {
    return { ok: false, errors: [`${kind}_not_object`] };
  }
  if (doc.schemaVersion !== FOCUS_PERSISTENCE_SCHEMA_VERSION) {
    errors.push('schemaVersion_mismatch');
  }
  if (doc.kind !== kind) {
    errors.push(`kind_expected_${kind}`);
  }
  try {
    sanitizeForRtdb(doc);
  } catch (e) {
    errors.push(e instanceof FocusSanitizeError ? e.code : 'sanitize_failed');
  }
  try {
    const bytes = measureJsonBytes(doc);
    if (bytes > maxBytes) errors.push(`payload_too_large_${bytes}`);
  } catch {
    errors.push('payload_measure_failed');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Metriche in news non possono presentarsi come misurazioni se provenance missing/estimated.
 * @param {object|null|undefined} newsItem
 * @param {string[]} errors
 * @param {string} label
 */
function validateNewsEvidence(newsItem, errors, label) {
  if (!newsItem) return;
  if (newsItem.claimType === 'hypothesis' && newsItem.role === 'concern') {
    errors.push(`${label}_hypothesis_as_concern`);
  }
  const metrics = Array.isArray(newsItem.metrics) ? newsItem.metrics : [];
  for (const m of metrics) {
    if (!m || typeof m !== 'object') {
      errors.push(`${label}_metric_invalid`);
      continue;
    }
    if (typeof m.path !== 'string' || !m.path) {
      errors.push(`${label}_metric_path_missing`);
    }
    if (UNRELIABLE_PROVENANCE.has(m.provenance) && m.value != null) {
      errors.push(`${label}_unreliable_metric_has_value`);
    }
    if (m.provenance === 'missing' && newsItem.claimType === 'fact' && m.value != null) {
      errors.push(`${label}_missing_presented_as_fact`);
    }
  }
  const refs = Array.isArray(newsItem.refs) ? newsItem.refs : [];
  for (const ref of refs) {
    if (typeof ref !== 'string' || !ref.includes('.')) {
      errors.push(`${label}_ref_invalid`);
    }
  }
}

/**
 * @param {unknown} revision
 */
export function validateFocusEditionRevision(revision) {
  const base = baseValidate(revision, 'FocusEditionRevision', FOCUS_PAYLOAD_LIMITS.revisionMaxBytes);
  const errors = [...base.errors];
  const doc = revision && typeof revision === 'object' ? revision : {};

  if (!isIsoDateString(doc.publicationDate)) errors.push('publicationDate_invalid');
  if (!isIsoDateString(doc.analysisDate)) errors.push('analysisDate_invalid');
  if (!Number.isInteger(doc.revision) || doc.revision < 1) errors.push('revision_invalid');
  if (!EDITION_STATUS_SET.has(doc.status)) errors.push('status_invalid');
  if (doc.immutable !== true) errors.push('immutable_flag_required');

  validateNewsEvidence(doc.lead, errors, 'lead');
  for (const [i, n] of (doc.goodNews || []).entries()) validateNewsEvidence(n, errors, `goodNews[${i}]`);
  for (const [i, n] of (doc.features || []).entries()) validateNewsEvidence(n, errors, `features[${i}]`);
  for (const [i, n] of (doc.concerns || []).entries()) validateNewsEvidence(n, errors, `concerns[${i}]`);

  return { ok: errors.length === 0, errors };
}

/**
 * @param {unknown} meta
 */
export function validateFocusEditionMeta(meta) {
  const base = baseValidate(meta, 'FocusEdition', FOCUS_PAYLOAD_LIMITS.editionMetaMaxBytes);
  const errors = [...base.errors];
  const doc = meta && typeof meta === 'object' ? meta : {};
  if (!isIsoDateString(doc.publicationDate)) errors.push('publicationDate_invalid');
  if (!isIsoDateString(doc.analysisDate)) errors.push('analysisDate_invalid');
  if (!Number.isInteger(doc.currentRevision) || doc.currentRevision < 1) {
    errors.push('currentRevision_invalid');
  }
  if (!EDITION_STATUS_SET.has(doc.status)) errors.push('status_invalid');
  return { ok: errors.length === 0, errors };
}

/**
 * @param {unknown} entry
 */
export function validateFocusArchiveIndexEntry(entry) {
  const base = baseValidate(entry, 'FocusArchiveIndexEntry', FOCUS_PAYLOAD_LIMITS.archiveIndexEntryMaxBytes);
  const errors = [...base.errors];
  const doc = entry && typeof entry === 'object' ? entry : {};
  if (!isIsoDateString(doc.publicationDate)) errors.push('publicationDate_invalid');
  if (!isIsoDateString(doc.analysisDate)) errors.push('analysisDate_invalid');
  if (!Number.isInteger(doc.revision) || doc.revision < 1) errors.push('revision_invalid');
  return { ok: errors.length === 0, errors };
}

/**
 * @param {unknown} job
 */
export function validateFocusGenerationJob(job) {
  const base = baseValidate(job, 'FocusGenerationJob', FOCUS_PAYLOAD_LIMITS.jobMaxBytes);
  const errors = [...base.errors];
  const doc = job && typeof job === 'object' ? job : {};
  if (!isIsoDateString(doc.publicationDate)) errors.push('publicationDate_invalid');
  if (!isIsoDateString(doc.analysisDate)) errors.push('analysisDate_invalid');
  if (!JOB_STATUS_SET.has(doc.status)) errors.push('status_invalid');
  if (!Number.isInteger(doc.leaseVersion) || doc.leaseVersion < 0) {
    errors.push('leaseVersion_invalid');
  }
  return { ok: errors.length === 0, errors };
}
