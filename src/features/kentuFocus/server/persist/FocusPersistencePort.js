/**
 * Porta di persistenza Focus (interfaccia documentata).
 *
 * Implementazioni:
 * - MemoryFocusPersistence (test / I4-B)
 * - AdminRtdbFocusPersistence (I4-C, emulator / futuro Admin)
 *
 * Atomicità RTDB — NON garantita da scritture separate:
 *
 * | Operazione | Meccanismo RTDB |
 * |------------|-----------------|
 * | claimJob / renewLease | `transaction` su jobs/{publicationDate} |
 * | saveRevision (create-only) | `transaction` create-only su rev/{n} |
 * | publishRevision | `transaction` → `committing`, poi `update()` multi-path meta+archive+job |
 * | applyMemoryAfterPublish | `transaction` su editorial_memory (editionKey) |
 * | repairPublishPointers | `update()` multi-path se job committing/succeeded incompleto |
 *
 * Un lease con TTL da solo NON basta: il commit ri-verifica ownerId + leaseVersion.
 */

/**
 * @typedef {object} FocusPersistencePort
 * @property {(uid: string, publicationDate: string) => Promise<object|null>} getJob
 * @property {(uid: string, publicationDate: string, claim: {
 *   ownerId: string,
 *   analysisDate: string,
 *   inputFingerprint: string,
 *   explicitRegen?: boolean,
 *   allowStealInterrupted?: boolean,
 * }) => Promise<{ ok: boolean, job?: object, error?: string, replay?: boolean }>} claimJob
 * @property {(uid: string, publicationDate: string, ownerId: string, leaseVersion: number, patch: object) => Promise<{ ok: boolean, job?: object, error?: string }>} updateJobIfOwner
 * @property {(uid: string, publicationDate: string, revisionDoc: object) => Promise<{ ok: boolean, error?: string }>} saveRevisionImmutable
 * @property {(uid: string, publicationDate: string, revision: number) => Promise<object|null>} getRevision
 * @property {(uid: string, publicationDate: string, opts: {
 *   ownerId: string,
 *   leaseVersion: number,
 *   editionMeta: object,
 *   archiveEntry: object,
 *   publishedRevision: number,
 * }) => Promise<{ ok: boolean, error?: string, editionMeta?: object }>} publishCurrentRevision
 * @property {(uid: string, publicationDate: string) => Promise<{ meta: object|null, revision: object|null }>} getPublishedEdition
 * @property {(uid: string, opts?: { limit?: number, endAt?: string|null, startAt?: string|null }) => Promise<object[]>} listArchiveIndex
 * @property {(uid: string) => Promise<object|null>} getEditorialMemory
 * @property {(uid: string, nextMemory: object, editionKey: string) => Promise<{ ok: boolean, memory?: object, error?: string, alreadyApplied?: boolean }>} applyEditorialMemoryIfNeeded
 */

export const FOCUS_PERSISTENCE_ATOMICITY_NOTES = Object.freeze({
  claimJob: 'RTDB transaction on jobs/{publicationDate}',
  saveRevisionImmutable: 'RTDB transaction create-only on editions/.../rev/{n}',
  publishCurrentRevision: 'RTDB multi-path update: meta + archive_index + job status',
  applyEditorialMemoryIfNeeded: 'RTDB transaction on editorial_memory keyed by lastAppliedEdition',
  leaseTtlInsufficient: true,
});
