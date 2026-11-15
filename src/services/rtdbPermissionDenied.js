/**
 * Ogni PERMISSION_DENIED su RTDB: log su logs/system_errors (path + versione, mai dati sanitari)
 * e in DEV console.error.
 */

const LOGGED = new Set();
const DEDUPE_MS = 15_000;

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isRtdbPermissionDenied(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  return code.includes('permission_denied')
    || code.includes('permission-denied')
    || message.includes('permission_denied')
    || message.includes('permission denied');
}

/**
 * @param {unknown} error
 * @param {{ path?: string, version?: string|null, feature?: string|null }} [meta]
 */
export async function reportRtdbPermissionDenied(error, meta = {}) {
  if (!isRtdbPermissionDenied(error)) return false;

  const path = String(meta.path || 'unknown').slice(0, 300);
  const version = meta.version != null && String(meta.version).trim()
    ? String(meta.version).trim().slice(0, 80)
    : null;
  const feature = meta.feature != null ? String(meta.feature).slice(0, 80) : null;
  const dedupeKey = `${path}|${version || ''}|${String(error?.code || '')}`;
  const now = Date.now();
  if (LOGGED.has(dedupeKey)) return true;
  LOGGED.add(dedupeKey);
  setTimeout(() => LOGGED.delete(dedupeKey), DEDUPE_MS).unref?.();

  const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true
    || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');
  if (isDev) {
    console.error('[RTDB PERMISSION_DENIED]', { path, version, feature, code: error?.code || null });
  }

  const details = JSON.stringify({
    path,
    version,
    feature,
    at: now,
  }).slice(0, 4000);

  try {
    const { logSystemError } = await import('../utils/devToolsPersistence.js');
    await logSystemError(
      {
        message: 'RTDB PERMISSION_DENIED',
        code: String(error?.code || 'PERMISSION_DENIED').slice(0, 200),
        details,
      },
      'RTDB write',
    );
  } catch {
    /* best-effort: non bloccare la UI se il log remoto fallisce */
  }
  return true;
}

/**
 * Esegue una scrittura RTDB; se fallisce con PERMISSION_DENIED, la registra.
 * @template T
 * @param {Promise<T>} writePromise
 * @param {{ path: string, version?: string|null, feature?: string|null }} meta
 * @returns {Promise<T>}
 */
export async function withRtdbPermissionLog(writePromise, meta) {
  try {
    return await writePromise;
  } catch (error) {
    await reportRtdbPermissionDenied(error, meta);
    throw error;
  }
}
