/**
 * P6.11c — Binding esecuzione ↔ pilotContext immutabile.
 * Nessuna rilettura env. Nessuna I/O.
 */

import { FOCUS_PILOT_CONTEXT_KIND } from './focusPilotContext.js';
import { assertFocusPilotSingleUid } from './focusPilotConfig.v1.js';

/**
 * Normalizza allowlist candidata a lista di uid.
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeAllowlist(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s || '').trim()).filter(Boolean);
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {object|null|undefined} pilotContext
 * @param {{
 *   uid?: string|null,
 *   publicationDate?: string|null,
 *   explicitRegen?: boolean,
 *   geminiProvider?: unknown,
 *   allowedUids?: string|string[]|null,
 *   projectId?: string|null,
 *   expectedProjectId?: string|null,
 *   databaseURL?: string|null,
 *   mode?: string|null,
 * }} execution
 * @returns {{ ok: boolean, error?: string }}
 */
export function assertFocusPilotExecutionBound(pilotContext, execution = {}) {
  if (!pilotContext || typeof pilotContext !== 'object') {
    return { ok: false, error: 'pilot_context_required' };
  }
  if (pilotContext.kind !== FOCUS_PILOT_CONTEXT_KIND) {
    return { ok: false, error: 'pilot_context_kind_invalid' };
  }
  if (pilotContext.mode !== 'pilot') {
    return { ok: false, error: 'pilot_context_mode_invalid' };
  }
  if (pilotContext.connectionActivated === true) {
    return { ok: false, error: 'pilot_context_must_remain_inactive' };
  }

  if (execution.mode != null && String(execution.mode) !== 'pilot') {
    return { ok: false, error: 'pilot_execution_mode_mismatch' };
  }

  const uid = String(execution.uid || '').trim();
  if (uid !== pilotContext.pilotUid) {
    return { ok: false, error: 'pilot_uid_mismatch' };
  }

  const publicationDate = String(execution.publicationDate || '').trim();
  if (publicationDate !== pilotContext.publicationDate) {
    return { ok: false, error: 'pilot_publication_date_mismatch' };
  }

  // Regen vietata nel pilota anche se FOCUS_ADMIN_ALLOW_REGEN=1 o --regen
  if (execution.explicitRegen === true || pilotContext.explicitRegenAllowed === true) {
    return { ok: false, error: 'pilot_regen_forbidden' };
  }

  if (execution.geminiProvider != null || pilotContext.geminiAllowed === true) {
    return { ok: false, error: 'pilot_gemini_forbidden' };
  }

  if (execution.allowedUids != null && execution.allowedUids !== '') {
    const list = normalizeAllowlist(execution.allowedUids);
    if (list.length === 0) {
      return { ok: false, error: 'pilot_allowlist_empty' };
    }
    if (list.length !== 1) {
      return { ok: false, error: 'pilot_allowlist_multiple_forbidden' };
    }
    const single = assertFocusPilotSingleUid(list[0]);
    if (!single.ok) {
      return { ok: false, error: single.error };
    }
    if (single.uid !== pilotContext.pilotUid) {
      return { ok: false, error: 'pilot_allowlist_uid_mismatch' };
    }
  }

  if (execution.projectId != null && String(execution.projectId).trim() !== '') {
    if (String(execution.projectId).trim() !== pilotContext.expectedProjectId) {
      return { ok: false, error: 'pilot_project_id_mismatch' };
    }
  }
  if (execution.expectedProjectId != null && String(execution.expectedProjectId).trim() !== '') {
    if (String(execution.expectedProjectId).trim() !== pilotContext.expectedProjectId) {
      return { ok: false, error: 'pilot_expected_project_mismatch' };
    }
  }
  if (execution.databaseURL != null && String(execution.databaseURL).trim() !== '') {
    if (String(execution.databaseURL).trim() !== pilotContext.expectedDatabaseUrl) {
      return { ok: false, error: 'pilot_database_url_mismatch' };
    }
  }

  return { ok: true };
}

/**
 * Parametri forzati dal contesto (nessun override da execution).
 * @param {object} pilotContext
 * @param {object} [extras] — campi non di binding (adminToken, horizon, …)
 */
export function buildFocusPilotBoundInput(pilotContext, extras = {}) {
  const {
    uid: _uid,
    publicationDate: _publicationDate,
    explicitRegen: _explicitRegen,
    geminiProvider: _geminiProvider,
    allowedUids: _allowedUids,
    projectId: _projectId,
    expectedProjectId: _expectedProjectId,
    databaseURL: _databaseURL,
    mode: _mode,
    ...safeExtras
  } = extras && typeof extras === 'object' ? extras : {};

  return {
    ...safeExtras,
    mode: 'pilot',
    uid: pilotContext.pilotUid,
    publicationDate: pilotContext.publicationDate,
    explicitRegen: false,
    geminiProvider: null,
    allowedUids: pilotContext.pilotUid,
    projectId: pilotContext.expectedProjectId,
    expectedProjectId: pilotContext.expectedProjectId,
  };
}
