import { sha256Hex } from './hashToken.js';
import { normalizeMcpScopes } from './scopes.js';

const RATE_LIMIT_PER_HOUR = 60;
const MIN_TOKEN_LEN = 32;

function hourBucket(now = Date.now()) {
  return Math.floor(now / 3600000);
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') {
    return String(headers.get(name) || headers.get(name.toLowerCase()) || '').trim();
  }
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== want) continue;
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').trim();
  }
  return '';
}

/**
 * Estrae il gettone da Authorization / x-api-key / x-auth-token.
 * Accetta sia `Bearer <token>` sia il plaintext grezzo (UI Claude).
 * @param {Headers|Record<string, string|string[]|undefined>|string|undefined} headersOrAuthorization
 * @returns {{ token: string|null, source: string|null, reason: string|null }}
 */
export function extractMcpCredential(headersOrAuthorization) {
  if (typeof headersOrAuthorization === 'string') {
    headersOrAuthorization = { authorization: headersOrAuthorization };
  }

  const candidates = [
    { name: 'authorization', value: headerValue(headersOrAuthorization, 'authorization') },
    { name: 'x-api-key', value: headerValue(headersOrAuthorization, 'x-api-key') },
    { name: 'x-auth-token', value: headerValue(headersOrAuthorization, 'x-auth-token') },
  ];

  let sawAny = false;
  for (const { name, value } of candidates) {
    if (!value) continue;
    sawAny = true;

    const bearer = /^Bearer\s+(\S+)\s*$/i.exec(value);
    if (bearer) {
      return { token: bearer[1], source: `${name}_bearer`, reason: null };
    }
    if (/^Bearer\s*$/i.test(value)) {
      return { token: null, source: name, reason: 'bearer_empty' };
    }
    // Valore grezzo (niente spazi): tipico di x-api-key o Authorization senza prefisso Bearer.
    if (!/\s/.test(value)) {
      return { token: value, source: `${name}_raw`, reason: null };
    }
    return { token: null, source: name, reason: 'authorization_malformed' };
  }

  return {
    token: null,
    source: null,
    reason: sawAny ? 'authorization_malformed' : 'missing_credential',
  };
}

function authError(message, reason) {
  const err = new Error(message);
  err.code = reason === 'rate_limited' ? 'rate_limited' : 'unauthorized';
  err.reason = reason;
  return err;
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {Headers|Record<string, string|string[]|undefined>|string|undefined} headersOrAuthorization
 * @returns {Promise<{ uid: string, tokenId: string, source: string, scopes: string[] }>}
 */
export async function resolveMcpBearer(db, headersOrAuthorization) {
  const extracted = extractMcpCredential(headersOrAuthorization);
  if (!extracted.token) {
    throw authError('Autenticazione richiesta', extracted.reason || 'missing_credential');
  }
  const token = extracted.token;
  if (token.length < MIN_TOKEN_LEN) {
    // Spesso si è incollato il tokenId (t_…) al posto del plaintext mostrato una sola volta.
    throw authError('Gettone non valido', 'token_too_short');
  }

  const hash = sha256Hex(token);
  const lookupSnap = await db.ref(`mcp_token_lookup/${hash}`).get();
  if (!lookupSnap.exists()) {
    throw authError('Gettone non riconosciuto', 'token_not_found');
  }
  const lookup = lookupSnap.val() || {};
  const uid = String(lookup.uid || '').trim();
  const tokenId = String(lookup.tokenId || '').trim();
  if (!uid || !tokenId) {
    throw authError('Gettone non valido', 'lookup_incomplete');
  }

  const tokenRef = db.ref(`users/${uid}/mcp_tokens/${tokenId}`);
  const tokenSnap = await tokenRef.get();
  if (!tokenSnap.exists()) {
    throw authError('Gettone revocato o assente', 'token_missing');
  }
  const record = tokenSnap.val() || {};
  if (record.revoked === true) {
    throw authError('Gettone revocato', 'revoked');
  }
  if (String(record.hash || '') !== hash) {
    throw authError('Gettone non valido', 'hash_mismatch');
  }

  const now = Date.now();
  const bucket = hourBucket(now);
  let count = Number(record.requestCountHour) || 0;
  let storedBucket = Number(record.hourBucket);
  if (!Number.isFinite(storedBucket) || storedBucket !== bucket) {
    storedBucket = bucket;
    count = 0;
  }
  if (count >= RATE_LIMIT_PER_HOUR) {
    throw authError('Limite richieste orarie superato', 'rate_limited');
  }

  await tokenRef.update({
    lastUsedAt: now,
    hourBucket: storedBucket,
    requestCountHour: count + 1,
  });

  return {
    uid,
    tokenId,
    source: extracted.source || 'unknown',
    scopes: normalizeMcpScopes(record.scopes),
  };
}

export function uidLogTag(uid) {
  return sha256Hex(uid).slice(0, 8);
}
