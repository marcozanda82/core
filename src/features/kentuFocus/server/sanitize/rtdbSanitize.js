/**
 * Serializzazione / sanitize compatibile RTDB.
 * Non trasforma NaN/Infinity in 0.
 */

export class FocusSanitizeError extends Error {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = 'sanitize_error') {
    super(message);
    this.name = 'FocusSanitizeError';
    this.code = code;
  }
}

/**
 * @param {unknown} value
 * @param {string} [path]
 * @returns {unknown}
 */
export function sanitizeForRtdb(value, path = '$') {
  if (value === undefined) {
    return undefined; // caller strips
  }
  if (value === null) return null;

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      throw new FocusSanitizeError(`NaN non consentito a ${path}`, 'nan');
    }
    if (!Number.isFinite(value)) {
      throw new FocusSanitizeError(`Infinity non consentito a ${path}`, 'infinity');
    }
    return value;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    throw new FocusSanitizeError(`bigint non supportato a ${path}`, 'bigint');
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new FocusSanitizeError(`tipo non serializzabile a ${path}`, 'bad_type');
  }

  if (Array.isArray(value)) {
    return value.map((item, i) => {
      if (item === undefined) {
        throw new FocusSanitizeError(`undefined in array a ${path}[${i}]`, 'undefined_in_array');
      }
      return sanitizeForRtdb(item, `${path}[${i}]`);
    });
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) continue; // rimozione controllata
      if (key.includes('/') || key.includes('.') || key === '') {
        throw new FocusSanitizeError(`chiave RTDB non valida: ${key}`, 'bad_key');
      }
      out[key] = sanitizeForRtdb(child, `${path}.${key}`);
    }
    return out;
  }

  throw new FocusSanitizeError(`valore non supportato a ${path}`, 'unsupported');
}

/**
 * Deep clone via JSON dopo sanitize (garantisce serializzabilità).
 * @param {unknown} value
 */
export function toRtdbJson(value) {
  const sanitized = sanitizeForRtdb(value);
  return JSON.parse(JSON.stringify(sanitized));
}

/**
 * Lunghezza UTF-8 in byte — Node e browser (TextEncoder), senza dipendere da Buffer.
 * @param {string} text
 * @returns {number}
 */
export function utf8ByteLength(text) {
  const s = String(text ?? '');
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(s).length;
  }
  // Fallback Node molto vecchio senza TextEncoder globale (non usato in browser moderni)
  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(s, 'utf8');
  }
  throw new FocusSanitizeError('utf8_byte_length_unavailable', 'payload_measure_failed');
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function measureJsonBytes(value) {
  const json = JSON.stringify(sanitizeForRtdb(value));
  return utf8ByteLength(json);
}

/**
 * Fingerprint stabile (non crypto-sicuro; idempotenza logica).
 * @param {unknown} value
 */
export function stableFingerprint(value) {
  const normalized = toRtdbJson(value);
  const raw = JSON.stringify(normalized);
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a_${(hash >>> 0).toString(16)}`;
}
