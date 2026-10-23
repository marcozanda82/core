/**
 * P6.11c — Guard applicativo sui path Admin RTDB (solo Focus pilota).
 *
 * Limite reale: confina il *percorso applicativo* Focus. Non sostituisce IAM
 * del service account. Le rules RTDB non limitano Admin SDK.
 *
 * Nessuna I/O. Nessuna normalizzazione silenziosa di path invalidi.
 */

import { isIsoDateString } from '../../normalize/focusDateUtils.js';

export const FOCUS_PILOT_PATH_GUARD_KIND = 'FocusPilotPathGuard';

const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;
const REV_RE = /^[0-9]{1,12}$/;

/**
 * @param {unknown} path
 * @returns {{ ok: true, segments: string[] } | { ok: false, error: string }}
 */
export function parseFocusPilotPathSegments(path) {
  if (path == null) {
    return { ok: false, error: 'pilot_path_required' };
  }
  if (typeof path !== 'string') {
    return { ok: false, error: 'pilot_path_type_invalid' };
  }
  // Nessuna normalizzazione: rifiuta forme ambigue
  if (path === '') {
    return { ok: false, error: 'pilot_path_empty' };
  }
  if (path.includes('\\') || path.includes('\0')) {
    return { ok: false, error: 'pilot_path_malformed' };
  }
  if (path.startsWith('/') || path.endsWith('/')) {
    return { ok: false, error: 'pilot_path_malformed' };
  }
  if (path.includes('//')) {
    return { ok: false, error: 'pilot_path_malformed' };
  }

  const segments = path.split('/');
  if (segments.length === 0 || segments.some((s) => s === '')) {
    return { ok: false, error: 'pilot_path_empty_segment' };
  }
  for (const seg of segments) {
    if (seg === '.' || seg === '..') {
      return { ok: false, error: 'pilot_path_traversal_forbidden' };
    }
    if (seg.includes('%') || seg.includes('?') || seg.includes('#')) {
      return { ok: false, error: 'pilot_path_malformed' };
    }
  }
  return { ok: true, segments };
}

/**
 * @param {string[]} segments
 * @param {string} pilotUid
 */
function uidSegmentMatches(segments, index, pilotUid) {
  const seg = segments[index];
  if (seg == null || !UID_RE.test(pilotUid)) return false;
  // Confronto esatto di segmento — niente prefissi ambigui
  return seg === pilotUid;
}

/**
 * @param {string[]} segments
 * @param {string} pilotUid
 * @returns {{ ok: boolean, error?: string }}
 */
function assertUsersRead(segments, pilotUid) {
  // users/{pilotUid}/tracker_data/...
  // users/{pilotUid}/profile_targets[/...]
  // users/{pilotUid}/body_metrics[/...]
  if (segments[0] !== 'users') {
    return { ok: false, error: 'pilot_path_users_prefix_required' };
  }
  if (!uidSegmentMatches(segments, 1, pilotUid)) {
    return { ok: false, error: 'pilot_path_uid_mismatch' };
  }
  const leaf = segments[2];
  if (leaf === 'tracker_data') {
    if (segments.length < 3) {
      return { ok: false, error: 'pilot_path_tracker_incomplete' };
    }
    return { ok: true };
  }
  if (leaf === 'profile_targets' || leaf === 'body_metrics') {
    return { ok: true };
  }
  return { ok: false, error: 'pilot_path_users_branch_forbidden' };
}

/**
 * Focus leaf patterns under kentu_focus/{uid}/…
 * @param {string[]} rest — dopo kentu_focus/{uid}
 * @param {{ allowAnyDate?: boolean, publicationDate?: string, forWrite?: boolean }} opts
 */
function assertFocusLeaf(rest, opts = {}) {
  if (rest.length === 0) {
    return { ok: false, error: 'pilot_path_focus_root_forbidden' };
  }

  const [a, b, c, d, e] = rest;

  // editorial_memory[/field…]
  if (a === 'editorial_memory') {
    return { ok: true };
  }

  // archive_index  | archive_index/{date}
  if (a === 'archive_index') {
    if (rest.length === 1) {
      // Root: sola lettura (query list). Scrittura sul padre vietata.
      if (opts.forWrite) {
        return { ok: false, error: 'pilot_path_archive_root_write_forbidden' };
      }
      return { ok: true };
    }
    if (rest.length >= 2 && isIsoDateString(b)) {
      if (opts.forWrite && opts.publicationDate && b !== opts.publicationDate) {
        return { ok: false, error: 'pilot_path_publication_date_mismatch' };
      }
      return { ok: true };
    }
    return { ok: false, error: 'pilot_path_archive_malformed' };
  }

  // jobs/{date}[/field…]
  if (a === 'jobs') {
    if (rest.length < 2 || !isIsoDateString(b)) {
      return { ok: false, error: 'pilot_path_jobs_malformed' };
    }
    if (opts.forWrite && opts.publicationDate && b !== opts.publicationDate) {
      return { ok: false, error: 'pilot_path_publication_date_mismatch' };
    }
    return { ok: true };
  }

  // editions/{date}/meta|rev|memory_events
  if (a === 'editions') {
    if (rest.length < 3 || !isIsoDateString(b)) {
      return { ok: false, error: 'pilot_path_editions_malformed' };
    }
    if (opts.forWrite && opts.publicationDate && b !== opts.publicationDate) {
      return { ok: false, error: 'pilot_path_publication_date_mismatch' };
    }
    if (c === 'meta') {
      return { ok: true };
    }
    if (c === 'rev' || c === 'memory_events') {
      if (rest.length < 4 || !REV_RE.test(String(d))) {
        return { ok: false, error: 'pilot_path_revision_malformed' };
      }
      return { ok: true };
    }
    return { ok: false, error: 'pilot_path_editions_leaf_forbidden' };
  }

  // dossiers e altri rami Focus: non necessari → rifiuta
  if (a === 'dossiers') {
    return { ok: false, error: 'pilot_path_dossiers_forbidden' };
  }

  // e unused — silence lint
  void e;
  return { ok: false, error: 'pilot_path_focus_branch_forbidden' };
}

/**
 * @param {string[]} segments
 * @param {string} pilotUid
 * @param {{ forWrite?: boolean, publicationDate?: string }} opts
 */
function assertFocusPath(segments, pilotUid, opts = {}) {
  if (segments[0] !== 'kentu_focus') {
    return { ok: false, error: 'pilot_path_focus_prefix_required' };
  }
  if (!uidSegmentMatches(segments, 1, pilotUid)) {
    return { ok: false, error: 'pilot_path_uid_mismatch' };
  }
  return assertFocusLeaf(segments.slice(2), {
    forWrite: Boolean(opts.forWrite),
    publicationDate: opts.publicationDate,
  });
}

/**
 * @param {object} pilotContext
 * @returns {{
 *   kind: string,
 *   pilotUid: string,
 *   publicationDate: string,
 *   assertRead: (path: string) => { ok: boolean, error?: string },
 *   assertWrite: (path: string) => { ok: boolean, error?: string },
 *   assertMultiPathWrite: (map: Record<string, unknown>) => { ok: boolean, error?: string, rejectedPath?: string },
 * }}
 */
export function createFocusPilotPathGuard(pilotContext) {
  if (!pilotContext || typeof pilotContext !== 'object') {
    throw new Error('createFocusPilotPathGuard: pilotContext richiesto');
  }
  const pilotUid = String(pilotContext.pilotUid || '').trim();
  const publicationDate = String(pilotContext.publicationDate || '').trim();
  if (!UID_RE.test(pilotUid)) {
    throw new Error('createFocusPilotPathGuard: pilotUid invalid');
  }
  if (!isIsoDateString(publicationDate)) {
    throw new Error('createFocusPilotPathGuard: publicationDate invalid');
  }

  function assertRead(path) {
    const parsed = parseFocusPilotPathSegments(path);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const { segments } = parsed;
    if (segments[0] === 'users') {
      return assertUsersRead(segments, pilotUid);
    }
    if (segments[0] === 'kentu_focus') {
      return assertFocusPath(segments, pilotUid, {
        forWrite: false,
        publicationDate,
      });
    }
    return { ok: false, error: 'pilot_path_namespace_forbidden' };
  }

  function assertWrite(path) {
    const parsed = parseFocusPilotPathSegments(path);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const { segments } = parsed;
    // Nessuna scrittura su diario / users
    if (segments[0] === 'users') {
      return { ok: false, error: 'pilot_path_users_write_forbidden' };
    }
    if (segments[0] === 'kentu_focus') {
      return assertFocusPath(segments, pilotUid, {
        forWrite: true,
        publicationDate,
      });
    }
    return { ok: false, error: 'pilot_path_namespace_forbidden' };
  }

  /**
   * Valida ogni destinazione; se una è vietata, respinge l'intero update.
   * @param {Record<string, unknown>} map
   */
  function assertMultiPathWrite(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      return { ok: false, error: 'pilot_multipath_invalid' };
    }
    const keys = Object.keys(map);
    if (keys.length === 0) {
      return { ok: false, error: 'pilot_multipath_empty' };
    }
    for (const key of keys) {
      const gate = assertWrite(key);
      if (!gate.ok) {
        return {
          ok: false,
          error: gate.error || 'pilot_multipath_forbidden',
          rejectedPath: key,
        };
      }
    }
    return { ok: true };
  }

  return {
    kind: FOCUS_PILOT_PATH_GUARD_KIND,
    pilotUid,
    publicationDate,
    assertRead,
    assertWrite,
    assertMultiPathWrite,
  };
}
