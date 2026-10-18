/**
 * Contratti di persistenza Focus v1 — puri, versionati, CF-ready.
 * Root RTDB previsto: kentu_focus/{uid}/...
 */

export const FOCUS_PERSISTENCE_SCHEMA_VERSION = '1.0.0';

/** @typedef {'pending'|'claimed'|'running'|'committing'|'succeeded'|'failed'|'interrupted'} FocusJobStatus */
/** @typedef {'published'|'published_fallback'} FocusEditionStatus */

export const FOCUS_JOB_STATUS = Object.freeze({
  pending: 'pending',
  claimed: 'claimed',
  running: 'running',
  /** Gate post-owner-check, pre multi-path publish */
  committing: 'committing',
  succeeded: 'succeeded',
  failed: 'failed',
  interrupted: 'interrupted',
});

export const FOCUS_EDITION_STATUS = Object.freeze({
  published: 'published',
  published_fallback: 'published_fallback',
});

/** Budget byte serializzati (JSON) per validazione. */
export const FOCUS_PAYLOAD_LIMITS = Object.freeze({
  revisionMaxBytes: 48_000,
  editionMetaMaxBytes: 8_000,
  archiveIndexEntryMaxBytes: 2_000,
  jobMaxBytes: 8_000,
  memoryMaxBytes: 16_000,
});

/**
 * Meta edizione pubblicata (puntatore alla revisione corrente).
 * Non contiene il body completo degli articoli.
 *
 * @param {{
 *   publicationDate: string,
 *   analysisDate: string,
 *   currentRevision: number,
 *   status?: FocusEditionStatus,
 *   headline?: string|null,
 *   teaser?: string|null,
 *   publishedAt?: string,
 *   inputFingerprint?: string|null,
 *   dossierContentHash?: string|null,
 * }} input
 */
export function createFocusEditionMeta(input) {
  return {
    schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
    kind: 'FocusEdition',
    publicationDate: input.publicationDate,
    analysisDate: input.analysisDate,
    currentRevision: Number(input.currentRevision),
    status: input.status || FOCUS_EDITION_STATUS.published,
    headline: input.headline ?? null,
    teaser: input.teaser ?? null,
    publishedAt: input.publishedAt || new Date().toISOString(),
    inputFingerprint: input.inputFingerprint ?? null,
    dossierContentHash: input.dossierContentHash ?? null,
  };
}

/**
 * Revisione immutabile una volta salvata.
 *
 * @param {{
 *   publicationDate: string,
 *   analysisDate: string,
 *   revision: number,
 *   status?: FocusEditionStatus,
 *   openingMode?: string,
 *   lead?: object|null,
 *   goodNews?: object[],
 *   features?: object[],
 *   concerns?: object[],
 *   coach?: object|null,
 *   omitted?: object[],
 *   editorialNotes?: string[],
 *   selectionRef?: object|null,
 *   aiBriefRef?: object|null,
 *   publishedAt?: string,
 *   inputFingerprint?: string|null,
 *   dossierContentHash?: string|null,
 *   technicalOnly?: boolean,
 * }} input
 */
export function createFocusEditionRevision(input) {
  return {
    schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
    kind: 'FocusEditionRevision',
    publicationDate: input.publicationDate,
    analysisDate: input.analysisDate,
    revision: Number(input.revision),
    status: input.status || FOCUS_EDITION_STATUS.published,
    openingMode: input.openingMode || 'neutral',
    lead: input.lead ?? null,
    goodNews: Array.isArray(input.goodNews) ? input.goodNews : [],
    features: Array.isArray(input.features) ? input.features : [],
    concerns: Array.isArray(input.concerns) ? input.concerns : [],
    coach: input.coach ?? null,
    omitted: Array.isArray(input.omitted) ? input.omitted : [],
    editorialNotes: Array.isArray(input.editorialNotes) ? input.editorialNotes : [],
    selectionRef: input.selectionRef ?? null,
    aiBriefRef: input.aiBriefRef ?? null,
    publishedAt: input.publishedAt || new Date().toISOString(),
    inputFingerprint: input.inputFingerprint ?? null,
    dossierContentHash: input.dossierContentHash ?? null,
    /** true = output tecnico (seed/evidenze), non prosa Gemini */
    technicalOnly: input.technicalOnly !== false,
    immutable: true,
  };
}

/**
 * @param {{
 *   publicationDate: string,
 *   analysisDate: string,
 *   revision: number,
 *   status?: FocusEditionStatus,
 *   headline?: string|null,
 *   teaser?: string|null,
 *   publishedAt?: string,
 * }} input
 */
export function createFocusArchiveIndexEntry(input) {
  return {
    schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
    kind: 'FocusArchiveIndexEntry',
    publicationDate: input.publicationDate,
    analysisDate: input.analysisDate,
    revision: Number(input.revision),
    status: input.status || FOCUS_EDITION_STATUS.published,
    headline: input.headline ?? null,
    teaser: input.teaser ?? null,
    publishedAt: input.publishedAt || new Date().toISOString(),
  };
}

/**
 * @param {{
 *   publicationDate: string,
 *   analysisDate: string,
 *   status?: FocusJobStatus,
 *   ownerId?: string|null,
 *   leaseVersion?: number,
 *   inputFingerprint?: string|null,
 *   explicitRegen?: boolean,
 *   targetRevision?: number|null,
 *   error?: string|null,
 *   createdAt?: string,
 *   updatedAt?: string,
 *   publishedRevision?: number|null,
 *   memoryAppliedKey?: string|null,
 *   leaseExpiresAt?: string|null,
 * }} input
 */
export function createFocusGenerationJob(input) {
  const now = new Date().toISOString();
  return {
    schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
    kind: 'FocusGenerationJob',
    publicationDate: input.publicationDate,
    analysisDate: input.analysisDate,
    status: input.status || FOCUS_JOB_STATUS.pending,
    ownerId: input.ownerId ?? null,
    leaseVersion: Number(input.leaseVersion) || 0,
    inputFingerprint: input.inputFingerprint ?? null,
    explicitRegen: Boolean(input.explicitRegen),
    targetRevision: input.targetRevision ?? null,
    error: input.error ?? null,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    publishedRevision: input.publishedRevision ?? null,
    memoryAppliedKey: input.memoryAppliedKey ?? null,
    leaseExpiresAt: input.leaseExpiresAt ?? null,
  };
}

/**
 * @param {{
 *   ok: boolean,
 *   publicationDate: string,
 *   revision?: number|null,
 *   editionMeta?: object|null,
 *   revisionDoc?: object|null,
 *   archiveEntry?: object|null,
 *   job?: object|null,
 *   memory?: object|null,
 *   idempotentReplay?: boolean,
 *   error?: string|null,
 * }} input
 */
export function createFocusPublishResult(input) {
  return {
    schemaVersion: FOCUS_PERSISTENCE_SCHEMA_VERSION,
    kind: 'FocusPublishResult',
    ok: Boolean(input.ok),
    publicationDate: input.publicationDate,
    revision: input.revision ?? null,
    editionMeta: input.editionMeta ?? null,
    revisionDoc: input.revisionDoc ?? null,
    archiveEntry: input.archiveEntry ?? null,
    job: input.job ?? null,
    memory: input.memory ?? null,
    idempotentReplay: Boolean(input.idempotentReplay),
    error: input.error ?? null,
  };
}
