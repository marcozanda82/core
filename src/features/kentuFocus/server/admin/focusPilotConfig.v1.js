/**
 * P6.11a — Contratto configurazione pilota Focus (puro, zero I/O Firebase).
 *
 * Separazione:
 * - Emulator: createEmulatorAdminApp + assertFocusAdminRuntime (invariato).
 * - Pilota reale: questo contratto è validabile offline; la connessione resta
 *   disattivata (vedi assertFocusPilotConnectionAllowed / createPilotAdminApp).
 *
 * Privilegi (documentazione):
 * - Rules RTDB: limitano i *client* autenticati (read owner su meta/rev/archive;
 *   write client negato su kentu_focus).
 * - Admin SDK: bypassa le rules; può leggere/scrivere qualsiasi path se la
 *   credenziale SA lo consente. L'allowlist CLI / path guard sono controlli
 *   *applicativi* e NON riducono i privilegi IAM del service account.
 * - P6.11c: pilotContext immutabile + assertFocusPilotExecutionBound +
 *   focusPilotPathGuard / createPilotGuardedAdminDatabase confinano il percorso
 *   applicativo Focus; non sostituiscono IAM e non affermano che Admin sia
 *   confinato dalle rules RTDB.
 */

import { isIsoDateString } from '../../normalize/focusDateUtils.js';

export const FOCUS_PILOT_CONFIG_KIND = 'FocusPilotConfig';
export const FOCUS_PILOT_CONFIG_SCHEMA_VERSION = '1.0.0';

/** Runtime pilota: connessione reale non attivata in P6.11a (né con flag/env). */
export const FOCUS_PILOT_CONNECTION_BLOCKED = 'pilot_runtime_not_activated_in_p611a';

const PROJECT_RE = /^[A-Za-z0-9_-]{4,64}$/;
const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;

/** @param {string} uid */
function maskPilotUid(uid) {
  const s = String(uid || '');
  if (s.length <= 6) return 'uid:***';
  return `uid:${s.slice(0, 3)}…${s.slice(-2)}`;
}

/**
 * @returns {{ ok: false, error: string, activated: false }}
 */
export function assertFocusPilotConnectionAllowed() {
  // Intenzionale: nessuna combinazione di env/flag sblocca la connessione in P6.11a.
  return {
    ok: false,
    error: FOCUS_PILOT_CONNECTION_BLOCKED,
    activated: false,
  };
}

/**
 * @param {string} projectId
 * @param {string} databaseURL
 * @returns {{ ok: boolean, error?: string }}
 */
export function assertFocusPilotDatabaseUrlCoherence(projectId, databaseURL) {
  const url = String(databaseURL || '').trim();
  const project = String(projectId || '').trim();
  if (!url) return { ok: false, error: 'pilot_database_url_required' };
  if (!project) return { ok: false, error: 'pilot_project_id_required' };

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: 'pilot_database_url_invalid' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'pilot_database_url_https_required' };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost'
    || host === '127.0.0.1'
    || host.endsWith('.localhost')
    || host.includes('emulator')
  ) {
    return { ok: false, error: 'pilot_database_url_emulator_forbidden' };
  }

  // Profili demo / ambigui non ammessi come "reale"
  if (
    host.includes('demo-')
    || project.toLowerCase().startsWith('demo-')
    || project.toLowerCase().includes('demo-kentu')
  ) {
    return { ok: false, error: 'pilot_database_url_demo_forbidden' };
  }

  if (!host.includes('firebasedatabase.app') && !host.endsWith('firebaseio.com')) {
    return { ok: false, error: 'pilot_database_url_host_unexpected' };
  }

  // Coerenza (non deduzione): il projectId deve comparire nell'host URL fornito.
  if (!host.includes(project.toLowerCase())) {
    return { ok: false, error: 'pilot_database_url_project_mismatch' };
  }

  // URL esatto: niente path/query ambigui oltre ns opzionale vuoto
  if (parsed.pathname && parsed.pathname !== '/' && parsed.pathname !== '') {
    return { ok: false, error: 'pilot_database_url_path_forbidden' };
  }

  return { ok: true };
}

/**
 * UID pilota: esattamente uno. Niente liste, wildcard, vuoti.
 * @param {unknown} raw
 * @returns {{ ok: boolean, uid?: string, error?: string }}
 */
export function assertFocusPilotSingleUid(raw) {
  if (raw == null) return { ok: false, error: 'pilot_uid_required' };
  const s = String(raw).trim();
  if (!s) return { ok: false, error: 'pilot_uid_required' };
  if (s.includes(',') || s.includes(';') || /\s/.test(s)) {
    return { ok: false, error: 'pilot_uid_multiple_forbidden' };
  }
  if (s.includes('*') || s.includes('?')) {
    return { ok: false, error: 'pilot_uid_wildcard_forbidden' };
  }
  if (!UID_RE.test(s)) return { ok: false, error: 'pilot_uid_invalid' };
  return { ok: true, uid: s };
}

/**
 * Validatore puro del profilo pilota. Nessuna rete.
 *
 * @param {{
 *   expectedProjectId?: string|null,
 *   expectedDatabaseUrl?: string|null,
 *   pilotUid?: string|null,
 *   publicationDate?: string|null,
 *   explicitRegen?: boolean,
 *   geminiProvider?: unknown,
 *   requireFallbackProse?: boolean,
 *   schedulingEnabled?: boolean,
 *   parallelExecutionEnabled?: boolean,
 *   adminTokenConfigured?: boolean,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   errors: string[],
 *   config: object|null,
 * }}
 */
export function validateFocusPilotConfig(input = {}) {
  /** @type {string[]} */
  const errors = [];

  const expectedProjectId = String(input.expectedProjectId || '').trim();
  if (!expectedProjectId) {
    errors.push('pilot_project_id_required');
  } else if (!PROJECT_RE.test(expectedProjectId)) {
    errors.push('pilot_project_id_invalid');
  } else if (expectedProjectId.toLowerCase().startsWith('demo-')) {
    errors.push('pilot_project_demo_forbidden');
  }

  const expectedDatabaseUrl = String(input.expectedDatabaseUrl || '').trim();
  if (!expectedDatabaseUrl) {
    errors.push('pilot_database_url_required');
  } else if (expectedProjectId && PROJECT_RE.test(expectedProjectId)
    && !expectedProjectId.toLowerCase().startsWith('demo-')) {
    const urlGate = assertFocusPilotDatabaseUrlCoherence(
      expectedProjectId,
      expectedDatabaseUrl,
    );
    if (!urlGate.ok) errors.push(urlGate.error);
  } else if (expectedDatabaseUrl) {
    const urlGate = assertFocusPilotDatabaseUrlCoherence(
      expectedProjectId || 'placeholder-project',
      expectedDatabaseUrl,
    );
    // Se manca project, segnala comunque emulator/demo/https
    if (!urlGate.ok
      && urlGate.error !== 'pilot_database_url_project_mismatch'
      && urlGate.error !== 'pilot_project_id_required') {
      errors.push(urlGate.error);
    }
  }

  const uidGate = assertFocusPilotSingleUid(input.pilotUid);
  if (!uidGate.ok) errors.push(uidGate.error);

  const publicationDate = input.publicationDate != null
    ? String(input.publicationDate).trim()
    : '';
  if (!publicationDate) {
    errors.push('pilot_publication_date_required');
  } else if (!isIsoDateString(publicationDate)) {
    errors.push('pilot_publication_date_invalid');
  }

  if (input.explicitRegen === true) {
    errors.push('pilot_regen_forbidden');
  }

  if (input.geminiProvider != null) {
    errors.push('pilot_gemini_forbidden');
  }
  if (input.requireFallbackProse === false) {
    errors.push('pilot_fallback_required');
  }

  if (input.schedulingEnabled === true) {
    errors.push('pilot_scheduling_forbidden');
  }
  if (input.parallelExecutionEnabled === true) {
    errors.push('pilot_parallel_forbidden');
  }

  if (input.adminTokenConfigured === false) {
    errors.push('pilot_admin_token_not_configured');
  }

  if (errors.length) {
    return { ok: false, errors: [...new Set(errors)], config: null };
  }

  return {
    ok: true,
    errors: [],
    config: {
      kind: FOCUS_PILOT_CONFIG_KIND,
      schemaVersion: FOCUS_PILOT_CONFIG_SCHEMA_VERSION,
      expectedProjectId,
      expectedDatabaseUrl,
      pilotUid: uidGate.uid,
      publicationDate,
      explicitRegen: false,
      geminiProvider: null,
      requireFallbackProse: true,
      schedulingEnabled: false,
      parallelExecutionEnabled: false,
      connectionActivated: false,
      operatorReportRequired: true,
    },
  };
}

/**
 * Legge un profilo pilota da env (puro). Non connette.
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env]
 */
export function parseFocusPilotConfigFromEnv(env = process.env) {
  const token = env.FOCUS_ADMIN_TOKEN || env.FOCUS_PILOT_ADMIN_TOKEN || '';
  // Profilo pilota: regen sempre false in parse env (vietata dal contratto).
  return validateFocusPilotConfig({
    expectedProjectId: env.FOCUS_PILOT_EXPECTED_PROJECT
      || env.FOCUS_ADMIN_EXPECTED_PROJECT
      || null,
    expectedDatabaseUrl: env.FOCUS_PILOT_EXPECTED_DATABASE_URL || null,
    pilotUid: env.FOCUS_PILOT_UID || env.FOCUS_ADMIN_ALLOWED_UIDS || null,
    publicationDate: env.FOCUS_PILOT_PUBLICATION_DATE || null,
    explicitRegen: false,
    geminiProvider: null,
    requireFallbackProse: true,
    schedulingEnabled: false,
    parallelExecutionEnabled: false,
    adminTokenConfigured: Boolean(String(token).trim()),
  });
}

/**
 * Variante esplicita: se FOCUS_PILOT_FORCE_REGEN_TEST=1 nei test, passa regen true.
 * Produzione/CLI non usa questo helper per abilitare regen.
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} env
 * @param {{ explicitRegen?: boolean }} [overrides]
 */
export function parseFocusPilotConfigFromEnvWithOverrides(env = process.env, overrides = {}) {
  const base = parseFocusPilotConfigFromEnv(env);
  if (!overrides || Object.keys(overrides).length === 0) return base;
  return validateFocusPilotConfig({
    expectedProjectId: env.FOCUS_PILOT_EXPECTED_PROJECT
      || env.FOCUS_ADMIN_EXPECTED_PROJECT
      || null,
    expectedDatabaseUrl: env.FOCUS_PILOT_EXPECTED_DATABASE_URL || null,
    pilotUid: env.FOCUS_PILOT_UID || env.FOCUS_ADMIN_ALLOWED_UIDS || null,
    publicationDate: env.FOCUS_PILOT_PUBLICATION_DATE || null,
    explicitRegen: Boolean(overrides.explicitRegen),
    geminiProvider: overrides.geminiProvider === undefined ? null : overrides.geminiProvider,
    requireFallbackProse: overrides.requireFallbackProse !== false,
    schedulingEnabled: Boolean(overrides.schedulingEnabled),
    parallelExecutionEnabled: Boolean(overrides.parallelExecutionEnabled),
    adminTokenConfigured: Boolean(
      String(env.FOCUS_ADMIN_TOKEN || env.FOCUS_PILOT_ADMIN_TOKEN || '').trim(),
    ),
  });
}

/**
 * Diagnostico sanitizzato (niente UID completi, niente URL con query secret, niente token).
 * @param {{ ok: boolean, errors?: string[], config?: object|null }} result
 */
export function sanitizeFocusPilotConfigResult(result) {
  const cfg = result?.config && typeof result.config === 'object' ? result.config : null;
  return {
    kind: 'FocusPilotConfigValidation',
    schemaVersion: FOCUS_PILOT_CONFIG_SCHEMA_VERSION,
    ok: Boolean(result?.ok),
    errors: Array.isArray(result?.errors)
      ? result.errors.filter((e) => typeof e === 'string' && e.length < 80)
      : [],
    config: cfg
      ? {
        kind: cfg.kind,
        schemaVersion: cfg.schemaVersion,
        expectedProjectId: cfg.expectedProjectId,
        // URL: solo host, niente credenziali
        expectedDatabaseHost: (() => {
          try {
            return new URL(String(cfg.expectedDatabaseUrl)).hostname;
          } catch {
            return null;
          }
        })(),
        subject: maskPilotUid(cfg.pilotUid),
        publicationDate: cfg.publicationDate,
        explicitRegen: false,
        requireFallbackProse: true,
        connectionActivated: false,
        operatorReportRequired: true,
      }
      : null,
    connectionGate: assertFocusPilotConnectionAllowed(),
  };
}
