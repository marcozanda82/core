/**
 * Path builders per kentu_focus/{uid}/...
 * Nessuna I/O.
 */

/**
 * @param {string} uid
 */
export function focusRootPath(uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('focusRootPath: uid richiesto');
  return `kentu_focus/${id}`;
}

/** @param {string} uid @param {string} publicationDate */
export function focusEditionMetaPath(uid, publicationDate) {
  return `${focusRootPath(uid)}/editions/${publicationDate}/meta`;
}

/** @param {string} uid @param {string} publicationDate @param {number|string} revision */
export function focusEditionRevisionPath(uid, publicationDate, revision) {
  return `${focusRootPath(uid)}/editions/${publicationDate}/rev/${revision}`;
}

/** @param {string} uid @param {string} publicationDate */
export function focusArchiveIndexPath(uid, publicationDate) {
  return `${focusRootPath(uid)}/archive_index/${publicationDate}`;
}

/** @param {string} uid */
export function focusArchiveIndexRootPath(uid) {
  return `${focusRootPath(uid)}/archive_index`;
}

/** @param {string} uid @param {string} publicationDate */
export function focusJobPath(uid, publicationDate) {
  return `${focusRootPath(uid)}/jobs/${publicationDate}`;
}

/** @param {string} uid @param {string} publicationDate */
export function focusDossierPath(uid, publicationDate) {
  return `${focusRootPath(uid)}/dossiers/${publicationDate}`;
}

/** @param {string} uid */
export function focusEditorialMemoryPath(uid) {
  return `${focusRootPath(uid)}/editorial_memory`;
}
