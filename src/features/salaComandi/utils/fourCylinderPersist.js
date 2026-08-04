import { ref, update } from 'firebase/database';
import {
  mergeFourCylinderStatePreferNewer,
  physiologyModelWithFourCylinder,
  sanitizeFourCylinderState,
} from '../engines/fourCylinderEngine';
import { evaluateFourCylinderWriteGuard } from './fourCylinderWriteGuard';

/** @type {Promise<void>} */
let persistQueue = Promise.resolve();

/** @type {import('../engines/fourCylinderEngine').FourCylinderState | null} */
let pendingFourCylinder = null;

/**
 * Aggiorna userModel e persiste solo `physiology_model.fourCylinder` via `update()`.
 * Data Guard: rifiuta scritture con decay muscolare 0 se ci sono workout recenti.
 *
 * @param {object} config
 * @param {import('firebase/database').Database | null | undefined} [config.db]
 * @param {string | null | undefined} [config.userUid]
 * @param {Function} [config.setUserModel]
 * @param {import('../engines/fourCylinderEngine').FourCylinderState | null | undefined} config.nextFourCylinderState
 * @param {object | null} [config.fullHistory] storico per Data Guard (opzionale se già in context)
 * @param {string | null} [config.anchorDateIso]
 * @param {string} [config.source] label log
 * @param {boolean} [config.skipRemote] aggiorna solo locale
 * @returns {Promise<void>}
 */
export function persistFourCylinderState({
  db,
  userUid,
  setUserModel,
  nextFourCylinderState,
  fullHistory,
  anchorDateIso,
  source = 'persistFourCylinderState',
  skipRemote = false,
}) {
  if (!nextFourCylinderState || !setUserModel) return persistQueue;

  const verdict = evaluateFourCylinderWriteGuard(nextFourCylinderState, {
    fullHistory,
    anchorDateIso,
    source,
  });

  if (!verdict.ok) {
    console.error(verdict.reason, {
      decaySum: verdict.decaySum,
      hasRecentWorkout: verdict.hasRecentWorkout,
    });
    // Non aggiornare pending né Firebase: preserva ultimo stato remoto/locale sano.
    return persistQueue;
  }

  const incoming = verdict.state;
  pendingFourCylinder = pendingFourCylinder
    ? mergeFourCylinderStatePreferNewer(pendingFourCylinder, incoming)
    : incoming;

  // Re-valida il merge (pending poteva essere ok, merge teoricamente no — ridondante ma sicuro)
  const mergedVerdict = evaluateFourCylinderWriteGuard(pendingFourCylinder, {
    fullHistory,
    anchorDateIso,
    source: `${source}:merged`,
  });
  if (!mergedVerdict.ok) {
    console.error(mergedVerdict.reason, { phase: 'post-merge' });
    pendingFourCylinder = incoming;
    const incomingOnly = evaluateFourCylinderWriteGuard(incoming, {
      fullHistory,
      anchorDateIso,
      source: `${source}:incoming-fallback`,
    });
    if (!incomingOnly.ok) {
      pendingFourCylinder = null;
      return persistQueue;
    }
    pendingFourCylinder = incomingOnly.state;
  } else {
    pendingFourCylinder = mergedVerdict.state;
  }

  setUserModel((prev) => physiologyModelWithFourCylinder(prev, pendingFourCylinder));

  if (skipRemote || !db || !userUid) return persistQueue;

  persistQueue = persistQueue.then(async () => {
    const toWrite = pendingFourCylinder;
    pendingFourCylinder = null;
    if (!toWrite) return;

    const finalVerdict = evaluateFourCylinderWriteGuard(toWrite, {
      fullHistory,
      anchorDateIso,
      source: `${source}:remote`,
    });
    if (!finalVerdict.ok) {
      console.error(finalVerdict.reason, { phase: 'pre-firebase' });
      return;
    }

    try {
      await update(ref(db, `users/${userUid}/physiology_model`), {
        fourCylinder: sanitizeFourCylinderState(finalVerdict.state),
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
