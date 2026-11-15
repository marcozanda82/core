/**
 * Quota giornaliera callGemini per uid.
 * Path: ai_call_quota/{uid}/{YYYY-MM-DD} (fuori da users/).
 * Scrittura SOLO da callGemini via Admin SDK (bypass rules).
 * Rules RTDB: client può leggere il proprio nodo; write/delete = false.
 * Nessun prompt / risposta / dato sanitario nei log.
 */

const { createHash } = require('crypto');

const MAX_CALLS_PER_DAY = 40;
const MAX_FOCUS_AI_COACH_PER_DAY = 6;
const FOCUS_AI_COACH_TAG = 'focus_ai_coach';

const QUOTA_TOTAL_IT =
  'Hai raggiunto il limite giornaliero di richieste AI (40). Riprova domani.';
const QUOTA_FOCUS_IT =
  'Hai raggiunto il limite giornaliero di analisi Focus (6). Riprova domani o usa i rapporti già salvati.';
const CALL_TAG_REQUIRED_IT = 'callTag obbligatorio per ogni chiamata AI.';

/**
 * @param {string} uid
 * @returns {string} hash sha256 troncato (12 hex)
 */
function truncatedUidHash(uid) {
  return createHash('sha256').update(String(uid || ''), 'utf8').digest('hex').slice(0, 12);
}

/**
 * @param {string|Date} [now]
 * @returns {string} YYYY-MM-DD UTC
 */
function quotaDayKey(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @param {string} uid
 * @param {string} day
 */
function quotaPath(uid, day) {
  return `ai_call_quota/${uid}/${day}`;
}

/**
 * Normalizza callTag (obbligatorio, max 64).
 * @param {unknown} raw
 * @returns {{ ok: true, callTag: string }|{ ok: false, message: string }}
 */
function normalizeCallTag(raw) {
  if (raw == null || !String(raw).trim()) {
    return { ok: false, message: CALL_TAG_REQUIRED_IT };
  }
  const callTag = String(raw).trim().slice(0, 64);
  if (!callTag) {
    return { ok: false, message: CALL_TAG_REQUIRED_IT };
  }
  return { ok: true, callTag };
}

/**
 * Incrementa contatori se sotto soglia; altrimenti rifiuta.
 * @param {{
 *   db: { ref: (path: string) => { transaction: Function } },
 *   uid: string,
 *   callTag: string,
 *   now?: Date|number|string,
 *   limits?: { maxTotal?: number, maxFocus?: number },
 * }} opts
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: string,
 *   message?: string,
 *   total?: number,
 *   focus?: number,
 *   day?: string,
 * }>}
 */
async function consumeGeminiQuota(opts) {
  const uid = String(opts?.uid || '').trim();
  const callTag = String(opts?.callTag || '').trim();
  if (!uid) {
    return { ok: false, reason: 'unauthenticated', message: 'Accesso richiesto' };
  }
  if (!callTag) {
    return { ok: false, reason: 'call_tag_required', message: CALL_TAG_REQUIRED_IT };
  }

  const maxTotal = Number.isFinite(Number(opts?.limits?.maxTotal))
    ? Number(opts.limits.maxTotal)
    : MAX_CALLS_PER_DAY;
  const maxFocus = Number.isFinite(Number(opts?.limits?.maxFocus))
    ? Number(opts.limits.maxFocus)
    : MAX_FOCUS_AI_COACH_PER_DAY;

  const day = quotaDayKey(opts?.now);
  const path = quotaPath(uid, day);
  const isFocus = callTag === FOCUS_AI_COACH_TAG;

  /** @type {{ ok: boolean, reason?: string, message?: string, total?: number, focus?: number }} */
  let outcome = { ok: false, reason: 'quota_transaction_failed' };

  const tx = await opts.db.ref(path).transaction((current) => {
    const cur = current && typeof current === 'object' ? current : {};
    const total = Number(cur.total || 0) || 0;
    const byTag = cur.byTag && typeof cur.byTag === 'object' ? { ...cur.byTag } : {};
    const focus = Number(byTag[FOCUS_AI_COACH_TAG] || 0) || 0;

    if (total >= maxTotal) {
      outcome = {
        ok: false,
        reason: 'quota_total',
        message: QUOTA_TOTAL_IT,
        total,
        focus,
      };
      return;
    }
    if (isFocus && focus >= maxFocus) {
      outcome = {
        ok: false,
        reason: 'quota_focus',
        message: QUOTA_FOCUS_IT,
        total,
        focus,
      };
      return;
    }

    const nextTotal = total + 1;
    const nextFocus = isFocus ? focus + 1 : focus;
    if (isFocus) byTag[FOCUS_AI_COACH_TAG] = nextFocus;
    else byTag[callTag] = (Number(byTag[callTag] || 0) || 0) + 1;

    outcome = {
      ok: true,
      total: nextTotal,
      focus: nextFocus,
    };
    return {
      total: nextTotal,
      byTag,
      updatedAt: Date.now(),
    };
  });

  if (!tx?.committed && outcome.ok) {
    return { ok: false, reason: 'quota_transaction_failed', day };
  }
  return { ...outcome, day };
}

/**
 * Decisione pura (test senza RTDB).
 * @param {{ total?: number, byTag?: Record<string, number> }|null} current
 * @param {string} callTag
 * @param {{ maxTotal?: number, maxFocus?: number }} [limits]
 */
function quotaDecision(current, callTag, limits = {}) {
  const maxTotal = limits.maxTotal ?? MAX_CALLS_PER_DAY;
  const maxFocus = limits.maxFocus ?? MAX_FOCUS_AI_COACH_PER_DAY;
  const cur = current && typeof current === 'object' ? current : {};
  const total = Number(cur.total || 0) || 0;
  const focus = Number(cur.byTag?.[FOCUS_AI_COACH_TAG] || 0) || 0;
  if (total >= maxTotal) {
    return { ok: false, reason: 'quota_total', message: QUOTA_TOTAL_IT, total, focus };
  }
  if (callTag === FOCUS_AI_COACH_TAG && focus >= maxFocus) {
    return { ok: false, reason: 'quota_focus', message: QUOTA_FOCUS_IT, total, focus };
  }
  return {
    ok: true,
    total: total + 1,
    focus: callTag === FOCUS_AI_COACH_TAG ? focus + 1 : focus,
  };
}

module.exports = {
  MAX_CALLS_PER_DAY,
  MAX_FOCUS_AI_COACH_PER_DAY,
  FOCUS_AI_COACH_TAG,
  QUOTA_TOTAL_IT,
  QUOTA_FOCUS_IT,
  CALL_TAG_REQUIRED_IT,
  truncatedUidHash,
  quotaDayKey,
  quotaPath,
  normalizeCallTag,
  consumeGeminiQuota,
  quotaDecision,
};
