/**
 * P6.11c — pilotContext immutabile (zero I/O, zero env dopo la creazione).
 *
 * Limite reale: questo contesto vincola il *percorso applicativo* Focus.
 * Non sostituisce IAM del service account né le rules RTDB (che Admin SDK bypassa).
 */

import {
  FOCUS_PILOT_CONFIG_KIND,
  FOCUS_PILOT_CONFIG_SCHEMA_VERSION,
  validateFocusPilotConfig,
} from './focusPilotConfig.v1.js';

export const FOCUS_PILOT_CONTEXT_KIND = 'FocusPilotContext';
export const FOCUS_PILOT_CONTEXT_SCHEMA_VERSION = '1.0.0';

/**
 * @param {object} config — output di validateFocusPilotConfig(...).config
 * @returns {{ ok: true, context: Readonly<object> } | { ok: false, error: string }}
 */
export function createFocusPilotContext(config) {
  if (!config || typeof config !== 'object') {
    return { ok: false, error: 'pilot_context_config_required' };
  }
  if (config.kind !== FOCUS_PILOT_CONFIG_KIND) {
    return { ok: false, error: 'pilot_context_config_kind_invalid' };
  }
  if (config.schemaVersion !== FOCUS_PILOT_CONFIG_SCHEMA_VERSION) {
    return { ok: false, error: 'pilot_context_config_schema_invalid' };
  }
  if (config.connectionActivated === true) {
    return { ok: false, error: 'pilot_context_connection_must_be_inactive' };
  }
  if (config.explicitRegen === true || config.geminiProvider != null) {
    return { ok: false, error: 'pilot_context_config_not_pilot_safe' };
  }

  const revalidate = validateFocusPilotConfig({
    expectedProjectId: config.expectedProjectId,
    expectedDatabaseUrl: config.expectedDatabaseUrl,
    pilotUid: config.pilotUid,
    publicationDate: config.publicationDate,
    explicitRegen: false,
    geminiProvider: null,
    requireFallbackProse: true,
    schedulingEnabled: false,
    parallelExecutionEnabled: false,
    adminTokenConfigured: true,
  });
  if (!revalidate.ok || !revalidate.config) {
    return {
      ok: false,
      error: `pilot_context_revalidate_failed:${(revalidate.errors || []).join(',')}`,
    };
  }

  const context = Object.freeze({
    kind: FOCUS_PILOT_CONTEXT_KIND,
    schemaVersion: FOCUS_PILOT_CONTEXT_SCHEMA_VERSION,
    mode: 'pilot',
    expectedProjectId: revalidate.config.expectedProjectId,
    expectedDatabaseUrl: revalidate.config.expectedDatabaseUrl,
    pilotUid: revalidate.config.pilotUid,
    publicationDate: revalidate.config.publicationDate,
    explicitRegenAllowed: false,
    geminiAllowed: false,
    requireFallbackProse: true,
    operatorReportRequired: true,
    connectionActivated: false,
    createdAt: Object.freeze({ source: 'validated_config' }),
  });

  return { ok: true, context };
}

/**
 * Costruisce il contesto da un input di validazione (senza rileggere env).
 * @param {Parameters<typeof validateFocusPilotConfig>[0]} input
 */
export function createFocusPilotContextFromInput(input) {
  const validated = validateFocusPilotConfig(input);
  if (!validated.ok) {
    return {
      ok: false,
      error: `pilot_context_invalid:${validated.errors.join(',')}`,
      errors: validated.errors,
    };
  }
  return createFocusPilotContext(validated.config);
}
