/**
 * Handoff in-RAM del diario già caricato in Sala Comandi → Kentu Focus.
 * Nessuna I/O Firebase: solo snapshot per uid autenticato (isolamento utenti).
 */

/** @type {Map<string, object>} */
const BY_UID = new Map();

/**
 * @param {string} uid
 * @param {{
 *   fullHistory: object,
 *   analysisDate: string,
 *   publicationDate: string,
 *   userTargets?: object|null,
 *   stashedAt?: string,
 * }} snapshot
 */
export function stashFocusDiaryForUser(uid, snapshot) {
  const id = String(uid || '').trim();
  if (!id || !snapshot || typeof snapshot !== 'object') return false;
  if (!snapshot.fullHistory || typeof snapshot.fullHistory !== 'object') return false;
  const targets = snapshot.userTargets && typeof snapshot.userTargets === 'object'
    ? {
      kcal: snapshot.userTargets.kcal ?? null,
      prot: snapshot.userTargets.prot ?? snapshot.userTargets.protein ?? null,
      carb: snapshot.userTargets.carb ?? null,
      fat: snapshot.userTargets.fat ?? null,
    }
    : null;
  BY_UID.set(id, {
    uid: id,
    fullHistory: snapshot.fullHistory,
    analysisDate: snapshot.analysisDate || null,
    publicationDate: snapshot.publicationDate || null,
    userTargets: targets,
    stashedAt: snapshot.stashedAt || new Date().toISOString(),
  });
  return true;
}

/**
 * @param {string} uid
 * @returns {object|null}
 */
export function peekFocusDiaryForUser(uid) {
  const id = String(uid || '').trim();
  if (!id) return null;
  const snap = BY_UID.get(id);
  if (!snap || snap.uid !== id) return null;
  return snap;
}

/**
 * @param {string} uid
 */
export function clearFocusDiaryForUser(uid) {
  const id = String(uid || '').trim();
  if (id) BY_UID.delete(id);
}

/** Solo test. */
export function __resetFocusDiaryHandoffForTests() {
  BY_UID.clear();
}
