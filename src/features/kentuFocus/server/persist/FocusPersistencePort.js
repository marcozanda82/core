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
 * | saveMemoryEventImmutable | `transaction` create-only su memory_events/{n} (stesso contentFingerprint = idempotente) |
 * | publishRevision | `transaction` → `committing`, poi `update()` multi-path meta+archive+job |
 * | applyMemoryAfterPublish | `transaction` su editorial_memory (editionKey); preserva barriera |
 * | replaceEditorialMemoryIfUnchanged | `transaction` su editorial_memory se stateFingerprint invariato |
 * | acquirePublishBarrier / releasePublishBarrier | `transaction` su editorial_memory (generation+barrier+owner) |
 * | publishRevision + barrierHold | gate job (owner+lease) + assert barriera prima dei pointer |
 * | repairPublishPointers | `update()` multi-path se job committing/succeeded incompleto |
 *
 * Un lease con TTL da solo NON basta: il commit ri-verifica ownerId + leaseVersion.
 * La barriera non si abbassa da timeout: solo release condizionato del tentativo proprietario.
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
 * @property {(uid: string, publicationDate: string, memoryEvent: object) => Promise<{ ok: boolean, error?: string, alreadyExists?: boolean, memoryEvent?: object }>} saveMemoryEventImmutable
 * @property {(uid: string, publicationDate: string, revision: number) => Promise<object|null>} getMemoryEvent
 * @property {(uid: string, publicationDate: string, opts: {
 *   ownerId: string,
 *   leaseVersion: number,
 *   editionMeta: object,
 *   archiveEntry: object,
 *   publishedRevision: number,
 *   barrierHold: {
 *     attemptId: string,
 *     publishGeneration: number,
 *     publishBarrierEpoch: number,
 *   },
 * }) => Promise<{ ok: boolean, error?: string, editionMeta?: object }>} publishCurrentRevision
 * @property {(uid: string, publicationDate: string) => Promise<{ meta: object|null, revision: object|null }>} getPublishedEdition
 * @property {(uid: string, opts?: { limit?: number, endAt?: string|null, startAt?: string|null }) => Promise<object[]>} listArchiveIndex
 * @property {(uid: string) => Promise<object|null>} getEditorialMemory
 * @property {(uid: string, nextMemory: object, editionKey: string) => Promise<{ ok: boolean, memory?: object, error?: string, alreadyApplied?: boolean }>} applyEditorialMemoryIfNeeded
 * @property {(uid: string, input: {
 *   expected: { lastAppliedEdition?: string|null, stateFingerprint: string, publishGeneration?: number },
 *   nextMemory: object,
 *   authority: string,
 * }) => Promise<{
 *   ok: boolean,
 *   committed?: boolean,
 *   unchanged?: boolean,
 *   conflict?: boolean,
 *   memory?: object|null,
 *   cursor?: object,
 *   error?: string,
 * }>} replaceEditorialMemoryIfUnchanged
 * @property {(uid: string, input: { attemptId: string, jobDate: string }) => Promise<{
 *   ok: boolean,
 *   hold?: object,
 *   memory?: object,
 *   error?: string,
 *   coordination?: object,
 * }>} acquirePublishBarrier
 * @property {(uid: string, hold: {
 *   attemptId: string,
 *   publishGeneration: number,
 *   publishBarrierEpoch: number,
 * }) => Promise<{ ok: boolean, memory?: object|null, error?: string, coordination?: object }>} releasePublishBarrier
 * @property {(uid: string, hold: {
 *   attemptId: string,
 *   publishGeneration: number,
 *   publishBarrierEpoch: number,
 * }) => Promise<{ ok: boolean, error?: string, coordination?: object }>} assertPublishBarrierHeld
 */

export const FOCUS_PERSISTENCE_ATOMICITY_NOTES = Object.freeze({
  claimJob: 'RTDB transaction on jobs/{publicationDate}',
  saveRevisionImmutable: 'RTDB transaction create-only on editions/.../rev/{n}',
  saveMemoryEventImmutable:
    'RTDB transaction create-only on editions/.../memory_events/{n}; same contentFingerprint → idempotent',
  publishCurrentRevision:
    'RTDB multi-path update: meta + archive_index + job status; barrierHold required + asserted before pointers',
  applyEditorialMemoryIfNeeded:
    'RTDB transaction on editorial_memory keyed by lastAppliedEdition; preserves publishGeneration/barrier',
  replaceEditorialMemoryIfUnchanged:
    'RTDB transaction on editorial_memory; abort if publishing barrier, generation/fingerprint mismatch; authority authoritative_replay_v1 required',
  acquirePublishBarrier:
    'RTDB transaction on editorial_memory: bump publishGeneration, set publishing + attemptId',
  releasePublishBarrier:
    'RTDB transaction on editorial_memory: release only if attemptId+epoch+generation match',
  leaseTtlInsufficient: true,
});
