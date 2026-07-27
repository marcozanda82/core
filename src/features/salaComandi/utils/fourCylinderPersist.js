import { ref, update } from 'firebase/database';
import {
  mergeFourCylinderStatePreferNewer,
  physiologyModelWithFourCylinder,
  sanitizeFourCylinderState,
} from '../engines/fourCylinderEngine';

/** @type {Promise<void>} */
let persistQueue = Promise.resolve();

/** @type {import('../engines/fourCylinderEngine').FourCylinderState | null} */
let pendingFourCylinder = null;

/**
 * Aggiorna userModel e persiste solo `physiology_model.fourCylinder` via `update()`.
 * Le scritture sono serializzate e coalescenti per evitare race con boot catch-up.
 *
 * @param {object} config
 * @param {import('firebase/database').Database | null | undefined} [config.db]
 * @param {string | null | undefined} [config.userUid]
 * @param {Function} [config.setUserModel]
 * @param {import('../engines/fourCylinderEngine').FourCylinderState | null | undefined} config.nextFourCylinderState
 * @returns {Promise<void>}
 */
export function persistFourCylinderState({
  db,
  userUid,
  setUserModel,
  nextFourCylinderState,
}) {
  if (!nextFourCylinderState || !setUserModel) return persistQueue;

  const incoming = sanitizeFourCylinderState(nextFourCylinderState);
  pendingFourCylinder = pendingFourCylinder
    ? mergeFourCylinderStatePreferNewer(pendingFourCylinder, incoming)
    : incoming;

  setUserModel((prev) => physiologyModelWithFourCylinder(prev, pendingFourCylinder));

  if (!db || !userUid) return persistQueue;

  persistQueue = persistQueue.then(async () => {
    const toWrite = pendingFourCylinder;
    pendingFourCylinder = null;
    if (!toWrite) return;
    try {
      await update(ref(db, `users/${userUid}/physiology_model`), {
        fourCylinder: sanitizeFourCylinderState(toWrite),
      });
    } catch (err) {
      console.warn('[fourCylinder] persist failed:', err);
    }
  });

  return persistQueue;
}

/**
 * Attende il completamento della coda di persistenza (utile per test / debug).
 * @returns {Promise<void>}
 */
export function waitForFourCylinderPersist() {
  return persistQueue;
}
