/**
 * Entry point amministrativo controllato (I4-H preflight).
 * Genera UNA edizione Focus — solo emulator in questa fase.
 *
 * Autorizzazione a più fattori (non solo token):
 * 1. Runtime emulator (produzione bloccata in I4-H)
 * 2. FOCUS_ADMIN_TOKEN
 * 3. UID in FOCUS_ADMIN_ALLOWED_UIDS
 * 4. projectId == FOCUS_ADMIN_EXPECTED_PROJECT
 *
 * - Nessuna callable pubblica.
 * - Nessun bypass del gate sonno.
 * - Nessuna rigenerazione silenziosa.
 * - Output tecnico senza UID completi / dossier / credenziali.
 */

import { addCalendarDays, isIsoDateString } from '../../normalize/focusDateUtils.js';
import { AdminRtdbFocusPersistence } from '../persist/AdminRtdbFocusPersistence.js';
import { runFocusEditionPipeline } from '../pipeline/runFocusEditionPipeline.js';
import {
  buildFocusAdminPublishOperatorReport,
  sanitizeFocusAdminPublishOperatorReport,
} from './buildFocusAdminPublishOperatorReport.js';

const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;
const PROJECT_RE = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * @returns {{ ok: boolean, error?: string, emulator: boolean }}
 */
export function assertFocusAdminRuntime() {
  const emulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
  if (emulator) return { ok: true, emulator: true };
  // I4-H: nessun sblocco produzione, anche con flag legacy.
  if (process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR === '1') {
    return { ok: false, error: 'non_emulator_admin_blocked_in_i4h', emulator: false };
  }
  return { ok: false, error: 'emulator_required', emulator: false };
}

/**
 * Token shared-secret (necessario ma non sufficiente).
 * @param {{
 *   adminToken?: string|null,
 *   expectedToken?: string|null,
 * }} input
 */
export function assertFocusAdminAuthorization(input = {}) {
  const expected = input.expectedToken
    ?? process.env.FOCUS_ADMIN_TOKEN
    ?? null;
  if (!expected || !String(expected).trim()) {
    return { ok: false, error: 'admin_token_not_configured' };
  }
  if (String(expected).trim().length < 16) {
    return { ok: false, error: 'admin_token_too_weak' };
  }
  const provided = input.adminToken != null ? String(input.adminToken) : '';
  if (!provided || provided !== String(expected)) {
    return { ok: false, error: 'admin_unauthorized' };
  }
  return { ok: true };
}

/**
 * Allowlist UID — seconda garanzia oltre al token.
 * @param {{
 *   uid: string,
 *   allowedUids?: string|string[]|null,
 * }} input
 */
export function assertFocusAdminUidAllowlist(input = {}) {
  const uid = String(input.uid || '').trim();
  if (!UID_RE.test(uid)) {
    return { ok: false, error: 'uid_invalid' };
  }
  const raw = input.allowedUids ?? process.env.FOCUS_ADMIN_ALLOWED_UIDS ?? '';
  const list = (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  if (!list.length) {
    return { ok: false, error: 'admin_uid_allowlist_not_configured' };
  }
  if (!list.includes(uid)) {
    return { ok: false, error: 'admin_uid_not_allowlisted' };
  }
  return { ok: true, uid };
}

/**
 * Identità progetto Firebase — evita esecuzione sul progetto sbagliato.
 * @param {{
 *   projectId?: string|null,
 *   expectedProjectId?: string|null,
 * }} input
 */
export function assertFocusAdminProjectIdentity(input = {}) {
  const expected = String(
    input.expectedProjectId
      ?? process.env.FOCUS_ADMIN_EXPECTED_PROJECT
      ?? '',
  ).trim();
  if (!expected || !PROJECT_RE.test(expected)) {
    return { ok: false, error: 'admin_expected_project_not_configured' };
  }
  const actual = String(input.projectId || '').trim();
  if (!actual || !PROJECT_RE.test(actual)) {
    return { ok: false, error: 'admin_project_id_missing' };
  }
  if (actual !== expected) {
    return { ok: false, error: 'admin_project_mismatch' };
  }
  return { ok: true, projectId: actual };
}

/**
 * Maschera UID per log/CLI (niente UID completi).
 * @param {string} uid
 */
export function maskFocusAdminUid(uid) {
  const s = String(uid || '');
  if (s.length <= 6) return 'uid:***';
  return `uid:${s.slice(0, 3)}…${s.slice(-2)}`;
}

/**
 * Payload CLI sicuro: niente credenziali, UID completi, dossier, testi lunghi.
 * @param {object} result
 * @param {{ uid?: string, projectId?: string|null }} ctx
 */
export function sanitizeFocusAdminCliResult(result, ctx = {}) {
  const report = result?.report && typeof result.report === 'object'
    ? {
      kind: result.report.kind,
      schemaVersion: result.report.schemaVersion,
      publicationDate: result.report.publicationDate,
      analysisDate: result.report.analysisDate,
      reads: result.report.reads,
      timingsMs: result.report.timingsMs,
      editorial: result.report.editorial,
      prose: result.report.prose,
      sleep: result.report.sleep,
      publish: result.report.publish,
      notes: Array.isArray(result.report.notes)
        ? result.report.notes.filter((n) => typeof n === 'string' && n.length < 120)
        : [],
    }
    : null;

  const operatorReport = sanitizeFocusAdminPublishOperatorReport(
    result?.operatorReport,
  );

  return {
    ok: Boolean(result?.ok),
    error: result?.error || null,
    // Mai presentare successo operativo se le verifiche essenziali falliscono
    operatorSafe: operatorReport
      ? Boolean(operatorReport.operatorSafe)
      : false,
    publicationDate: result?.publicationDate || null,
    analysisDate: result?.analysisDate || null,
    revision: result?.revision ?? null,
    idempotentReplay: Boolean(result?.idempotentReplay),
    sleep: result?.sleepGate || null,
    edition: result?.editionSummary
      ? {
        currentRevision: result.editionSummary.currentRevision ?? null,
        status: result.editionSummary.status ?? null,
        // Lunghezze solo — niente headline/teaser (possono contenere dettagli personali)
        headlineChars: typeof result.editionSummary.headline === 'string'
          ? result.editionSummary.headline.length
          : null,
        teaserChars: typeof result.editionSummary.teaser === 'string'
          ? result.editionSummary.teaser.length
          : null,
      }
      : null,
    operatorReport,
    report,
    subject: ctx.uid ? maskFocusAdminUid(ctx.uid) : null,
    projectId: ctx.projectId || null,
  };
}

/**
 * @param {{
 *   uid: string,
 *   publicationDate: string,
 *   adminToken?: string,
 *   projectId?: string|null,
 *   expectedProjectId?: string|null,
 *   allowedUids?: string|string[]|null,
 *   db?: import('firebase-admin/database').Database,
 *   reader?: object,
 *   persistence?: object,
 *   horizon?: 'd7'|'d30'|'d90',
 *   historyDays?: number,
 *   explicitRegen?: boolean,
 *   ownerId?: string,
 *   nowIso?: string,
 *   locale?: string,
 *   geminiProvider?: object|null,
 *   rateLimitState?: { lastAtMs?: number, minIntervalMs?: number },
 * }} input
 */
export async function runFocusAdminEdition(input) {
  const runtime = assertFocusAdminRuntime();
  if (!runtime.ok) {
    return {
      ok: false,
      error: runtime.error,
      report: null,
      publishResult: null,
    };
  }

  const auth = assertFocusAdminAuthorization({ adminToken: input.adminToken });
  if (!auth.ok) {
    return {
      ok: false,
      error: auth.error,
      report: null,
      publishResult: null,
    };
  }

  const uidGate = assertFocusAdminUidAllowlist({
    uid: input.uid,
    allowedUids: input.allowedUids,
  });
  if (!uidGate.ok) {
    return { ok: false, error: uidGate.error, report: null, publishResult: null };
  }
  const uid = uidGate.uid;

  const projectGate = assertFocusAdminProjectIdentity({
    projectId: input.projectId,
    expectedProjectId: input.expectedProjectId,
  });
  if (!projectGate.ok) {
    return { ok: false, error: projectGate.error, report: null, publishResult: null };
  }

  const publicationDate = input.publicationDate;
  if (!isIsoDateString(publicationDate)) {
    return { ok: false, error: 'publicationDate_invalid', report: null, publishResult: null };
  }

  // Regen solo se esplicitamente richiesto E abilitato via env (mai silenzioso)
  let explicitRegen = false;
  if (input.explicitRegen) {
    if (process.env.FOCUS_ADMIN_ALLOW_REGEN === '1') {
      explicitRegen = true;
    } else {
      return {
        ok: false,
        error: 'admin_regen_not_enabled',
        report: null,
        publishResult: null,
      };
    }
  }

  // Rate limit locale (processo) — protezione esecuzioni accidentali
  const rl = input.rateLimitState || globalThis.__focusAdminRateLimit || { lastAtMs: 0 };
  const minIntervalMs = rl.minIntervalMs == null ? 2000 : Number(rl.minIntervalMs);
  const now = Date.now();
  if (rl.lastAtMs && now - rl.lastAtMs < minIntervalMs) {
    return { ok: false, error: 'admin_rate_limited', report: null, publishResult: null };
  }
  rl.lastAtMs = now;
  globalThis.__focusAdminRateLimit = rl;

  // Persistence condivisa: pipeline + verifica indipendente post-publish (sola lettura)
  const persistence = input.persistence
    || (input.db ? new AdminRtdbFocusPersistence(input.db) : null);

  // Mai accettare bypass sonno / flags client / Gemini da input non vettato
  // geminiProvider: solo se caller server esplicito lo passa; CLI non lo passa (null → fallback)
  const stripped = {
    uid,
    publicationDate,
    analysisDate: addCalendarDays(publicationDate, -1),
    db: input.db,
    reader: input.reader,
    persistence,
    horizon: input.horizon || 'd30',
    historyDays: input.historyDays,
    explicitRegen,
    ownerId: input.ownerId || `admin_${publicationDate}`,
    nowIso: input.nowIso,
    locale: input.locale || 'it-IT',
    geminiProvider: input.geminiProvider ?? null,
    requireSleep: true,
  };

  const result = await runFocusEditionPipeline(stripped);

  // P6.10a: report operatore — rilettura store, nessuna scrittura / recovery
  const operatorReport = await buildFocusAdminPublishOperatorReport({
    uid,
    publicationDate,
    publishResult: result.publishResult,
    pipelineOk: result.ok,
    pipelineError: result.error,
    persistence,
  });

  return {
    ok: result.ok,
    error: result.error || null,
    operatorSafe: Boolean(operatorReport?.operatorSafe),
    operatorReport,
    publicationDate: result.publicationDate,
    analysisDate: result.analysisDate,
    revision: result.publishResult?.revision ?? null,
    idempotentReplay: result.publishResult?.idempotentReplay ?? false,
    sleepGate: result.sleepGate
      ? {
        status: result.sleepGate.status,
        available: result.sleepGate.sleepAvailable,
        ambiguous: result.sleepGate.sleepAmbiguous,
      }
      : null,
    report: result.report,
    editionSummary: result.publishResult?.editionMeta
      ? {
        headline: result.publishResult.editionMeta.headline,
        teaser: result.publishResult.editionMeta.teaser,
        currentRevision: result.publishResult.editionMeta.currentRevision,
        status: result.publishResult.editionMeta.status,
      }
      : null,
    // Campi diagnostici non sensibili per caller interni
    authContext: {
      projectId: projectGate.projectId,
      subject: maskFocusAdminUid(uid),
      emulator: runtime.emulator,
      regen: explicitRegen,
    },
  };
}
